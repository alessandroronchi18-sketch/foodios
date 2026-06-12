-- ===========================================================================
-- AI ENGINE: Daily Brief + Proactive Suggestions
--
-- daily_briefs    una riga per (organization, sede, data) con brief Claude.
-- ai_suggestions  suggerimenti proattivi rule-based con dedup window 7gg.
--
-- NB editor SQL Supabase: niente CHECK inline (alcuni parser lo bocciano),
-- niente apostrofi smart, niente righe lunghe (line-wrap corrompe paste).
-- Tutto formattato verticale, CHECK/FK separati via ALTER.
-- ===========================================================================

-- ---------- daily_briefs ---------------------------------------------------

create table if not exists public.daily_briefs (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid not null,
  sede_id         uuid,
  data            date not null,
  contenuto       text not null,
  kpi_snapshot    jsonb default '{}'::jsonb not null,
  model           text,
  sent_email_at   timestamptz,
  opened_at       timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.daily_briefs
  drop constraint if exists daily_briefs_org_fk;
alter table public.daily_briefs
  add constraint daily_briefs_org_fk
  foreign key (organization_id)
  references public.organizations(id) on delete cascade;

alter table public.daily_briefs
  drop constraint if exists daily_briefs_sede_fk;
alter table public.daily_briefs
  add constraint daily_briefs_sede_fk
  foreign key (sede_id)
  references public.sedi(id) on delete cascade;

create unique index if not exists uq_daily_briefs_org_sede_data
  on public.daily_briefs (
    organization_id,
    coalesce(sede_id, '00000000-0000-0000-0000-000000000000'::uuid),
    data
  );

create index if not exists idx_daily_briefs_org_recent
  on public.daily_briefs (organization_id, data desc);

alter table public.daily_briefs enable row level security;

drop policy if exists daily_briefs_select_org on public.daily_briefs;
create policy daily_briefs_select_org
  on public.daily_briefs
  for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists daily_briefs_update_org on public.daily_briefs;
create policy daily_briefs_update_org
  on public.daily_briefs
  for update
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

grant select, update on public.daily_briefs to authenticated;

-- ---------- ai_suggestions -------------------------------------------------

create table if not exists public.ai_suggestions (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid not null,
  sede_id         uuid,
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
  acted_at        timestamptz
);

alter table public.ai_suggestions
  drop constraint if exists ai_suggestions_org_fk;
alter table public.ai_suggestions
  add constraint ai_suggestions_org_fk
  foreign key (organization_id)
  references public.organizations(id) on delete cascade;

alter table public.ai_suggestions
  drop constraint if exists ai_suggestions_sede_fk;
alter table public.ai_suggestions
  add constraint ai_suggestions_sede_fk
  foreign key (sede_id)
  references public.sedi(id) on delete cascade;

alter table public.ai_suggestions
  drop constraint if exists ai_sugg_severita_check;
alter table public.ai_suggestions
  add constraint ai_sugg_severita_check
  check (severita in ('info','warning','critical','opportunity'));

alter table public.ai_suggestions
  drop constraint if exists ai_sugg_stato_check;
alter table public.ai_suggestions
  add constraint ai_sugg_stato_check
  check (stato in ('nuovo','letto','agito','rifiutato','scaduto'));

create unique index if not exists uq_ai_suggestions_active_dedup
  on public.ai_suggestions (organization_id, dedup_key)
  where stato in ('nuovo','letto');

create index if not exists idx_ai_suggestions_org_recent
  on public.ai_suggestions (organization_id, stato, created_at desc);

alter table public.ai_suggestions enable row level security;

drop policy if exists ai_suggestions_select_org on public.ai_suggestions;
create policy ai_suggestions_select_org
  on public.ai_suggestions
  for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists ai_suggestions_update_org on public.ai_suggestions;
create policy ai_suggestions_update_org
  on public.ai_suggestions
  for update
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

grant select, update on public.ai_suggestions to authenticated;

-- ---------- RPC helpers ----------------------------------------------------

create or replace function public.brief_mark_opened(brief_id uuid)
returns void
language sql
security definer
set search_path = public
as $body$
  update public.daily_briefs
  set opened_at = coalesce(opened_at, now())
  where id = brief_id
    and organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    );
$body$;

grant execute on function public.brief_mark_opened(uuid) to authenticated;

create or replace function public.suggestion_set_state(
  sugg_id uuid,
  new_state text,
  reason text default null
)
returns void
language sql
security definer
set search_path = public
as $body$
  update public.ai_suggestions
  set stato = new_state,
      dismissed_at = case
        when new_state = 'rifiutato' then now()
        else dismissed_at
      end,
      dismissed_reason = case
        when new_state = 'rifiutato' then reason
        else dismissed_reason
      end,
      acted_at = case
        when new_state = 'agito' then now()
        else acted_at
      end
  where id = sugg_id
    and organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
    and new_state in ('nuovo','letto','agito','rifiutato','scaduto');
$body$;

grant execute on function public.suggestion_set_state(uuid, text, text)
  to authenticated;
