-- ===========================================================================
-- AI ENGINE: Daily Brief + Proactive Suggestions
--
-- daily_briefs       una riga per (organization, sede, data) con il brief
--                    narrativo generato da Claude + snapshot KPI.
-- ai_suggestions     suggerimenti proattivi: regole + Claude analizzano dati
--                    e generano alert azionabili con CTA verso le view.
-- ai_engine_settings semplice json in user_data (opt-in/out, ora preferita,
--                    canali abilitati). NON usa tabella dedicata.
-- ===========================================================================

create table if not exists public.daily_briefs (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sede_id         uuid references public.sedi(id) on delete cascade,
  data            date not null,
  contenuto       text not null,
  kpi_snapshot    jsonb default '{}'::jsonb not null,
  model           text,
  sent_email_at   timestamptz,
  opened_at       timestamptz,
  created_at      timestamptz not null default now()
);

-- Un brief al giorno per (org, sede). Sede NULL = brief consolidato org.
create unique index if not exists uq_daily_briefs_org_sede_data
  on public.daily_briefs (organization_id, coalesce(sede_id, '00000000-0000-0000-0000-000000000000'::uuid), data);

create index if not exists idx_daily_briefs_org_recent
  on public.daily_briefs (organization_id, data desc);

alter table public.daily_briefs enable row level security;
drop policy if exists daily_briefs_select_org on public.daily_briefs;
create policy daily_briefs_select_org on public.daily_briefs for select using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists daily_briefs_update_org on public.daily_briefs;
create policy daily_briefs_update_org on public.daily_briefs for update using (organization_id in (select organization_id from public.profiles where id = auth.uid())) with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

grant select, update on public.daily_briefs to authenticated;
-- Insert/delete riservati al service role (cron / ops). Niente grant generico.

-- ---------------------------------------------------------------------------

create table if not exists public.ai_suggestions (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sede_id         uuid references public.sedi(id) on delete cascade,
  tipo            text not null,
  severita        text not null default 'info',
  titolo          text not null,
  descrizione     text not null,
  payload         jsonb default '{}'::jsonb not null,
  cta_view        text,
  cta_label       text,
  dedup_key       text not null,
  stato           text not null default 'nuovo',
  created_at      timestamptz not null default now(),
  expires_at      timestamptz,
  dismissed_at    timestamptz,
  dismissed_reason text,
  acted_at        timestamptz,
  constraint ai_sugg_severita_check check (severita in ('info','warning','critical','opportunity')),
  constraint ai_sugg_stato_check check (stato in ('nuovo','letto','agito','rifiutato','scaduto'))
);

-- Dedup: niente duplicati attivi sullo stesso "soggetto" entro 7 giorni.
create unique index if not exists uq_ai_suggestions_active_dedup
  on public.ai_suggestions (organization_id, dedup_key)
  where stato in ('nuovo','letto');

create index if not exists idx_ai_suggestions_org_recent
  on public.ai_suggestions (organization_id, stato, created_at desc);

alter table public.ai_suggestions enable row level security;

drop policy if exists ai_suggestions_select_org on public.ai_suggestions;
create policy ai_suggestions_select_org on public.ai_suggestions for select using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists ai_suggestions_update_org on public.ai_suggestions;
create policy ai_suggestions_update_org on public.ai_suggestions for update using (organization_id in (select organization_id from public.profiles where id = auth.uid())) with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

grant select, update on public.ai_suggestions to authenticated;
-- Insert/delete riservati al service role.

-- ---------------------------------------------------------------------------
-- Helper RPC: marca brief come letto (idempotente).
create or replace function public.brief_mark_opened(brief_id uuid)
returns void
language sql
security definer
set search_path = public
as $body$
  update public.daily_briefs
  set opened_at = coalesce(opened_at, now())
  where id = brief_id
    and organization_id in (select organization_id from public.profiles where id = auth.uid());
$body$;
grant execute on function public.brief_mark_opened(uuid) to authenticated;

-- Helper RPC: aggiorna stato suggerimento (con check ownership via RLS).
create or replace function public.suggestion_set_state(sugg_id uuid, new_state text, reason text default null)
returns void
language sql
security definer
set search_path = public
as $body$
  update public.ai_suggestions
  set stato = new_state,
      dismissed_at = case when new_state = 'rifiutato' then now() else dismissed_at end,
      dismissed_reason = case when new_state = 'rifiutato' then reason else dismissed_reason end,
      acted_at = case when new_state = 'agito' then now() else acted_at end
  where id = sugg_id
    and organization_id in (select organization_id from public.profiles where id = auth.uid())
    and new_state in ('nuovo','letto','agito','rifiutato','scaduto');
$body$;
grant execute on function public.suggestion_set_state(uuid, text, text) to authenticated;
