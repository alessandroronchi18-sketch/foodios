-- AI usage daily: counter per-org del costo stimato Claude API.
-- Audit reliability 2026-06-14 PM: senza un budget per org, un cliente
-- (cattivo o un bug client) puo' generare costi runaway (es. €500/giorno
-- spammando AISuggestionsBell). Hard-cap configurabile via ADMIN.
--
-- Strategia stima costo: ogni feature ha un costo medio noto (modello + token
-- avg). Quando una chiamata viene fatta via /api/ai, incrementiamo (org,
-- date) di quel costo. Se supera il limit, 429.

create table if not exists public.ai_usage_daily (
  organization_id uuid not null,
  date date not null default current_date,
  feature text not null default 'generic',  -- 'ai_proxy' | 'ocr_invoice' | 'daily_brief' | ...
  calls integer not null default 0,
  tokens_in_estimated bigint not null default 0,
  tokens_out_estimated bigint not null default 0,
  cost_usd_estimated numeric(10,4) not null default 0,
  last_call_at timestamptz not null default now(),
  primary key (organization_id, date, feature)
);

alter table public.ai_usage_daily
  drop constraint if exists ai_usage_daily_org_fk;
alter table public.ai_usage_daily
  add constraint ai_usage_daily_org_fk
  foreign key (organization_id)
  references public.organizations(id) on delete cascade;

create index if not exists idx_ai_usage_daily_org_date
  on public.ai_usage_daily (organization_id, date desc);

alter table public.ai_usage_daily enable row level security;

drop policy if exists ai_usage_select_own on public.ai_usage_daily;
create policy ai_usage_select_own
  on public.ai_usage_daily
  for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

-- Insert/update solo via service role (server-side). Niente policy per
-- authenticated insert/update.
grant select on public.ai_usage_daily to authenticated;

-- RPC atomica per increment del counter giornaliero per (org, date, feature).
-- security definer: bypassa RLS (chiamata da edge function con service role
-- ma anche da utenti via /api/ai con loro auth → l'org_id è ricavato dal
-- loro profile).
create or replace function public.ai_usage_increment(
  p_feature text,
  p_tokens_in integer default 0,
  p_tokens_out integer default 0,
  p_cost_usd numeric default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select organization_id into v_org_id from public.profiles where id = auth.uid();
  if v_org_id is null then return; end if;
  insert into public.ai_usage_daily (
    organization_id, date, feature, calls,
    tokens_in_estimated, tokens_out_estimated, cost_usd_estimated, last_call_at
  ) values (
    v_org_id, current_date, coalesce(p_feature, 'generic'), 1,
    coalesce(p_tokens_in, 0), coalesce(p_tokens_out, 0), coalesce(p_cost_usd, 0), now()
  )
  on conflict (organization_id, date, feature)
  do update set
    calls = ai_usage_daily.calls + 1,
    tokens_in_estimated = ai_usage_daily.tokens_in_estimated + coalesce(p_tokens_in, 0),
    tokens_out_estimated = ai_usage_daily.tokens_out_estimated + coalesce(p_tokens_out, 0),
    cost_usd_estimated = ai_usage_daily.cost_usd_estimated + coalesce(p_cost_usd, 0),
    last_call_at = now();
end;
$$;

grant execute on function public.ai_usage_increment(text, integer, integer, numeric) to authenticated;

-- RPC per leggere il totale costo giornaliero dell'org chiamante.
create or replace function public.ai_usage_today_total()
returns numeric
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_org_id uuid;
  v_total numeric;
begin
  select organization_id into v_org_id from public.profiles where id = auth.uid();
  if v_org_id is null then return 0; end if;
  select coalesce(sum(cost_usd_estimated), 0) into v_total
  from public.ai_usage_daily
  where organization_id = v_org_id and date = current_date;
  return v_total;
end;
$$;

grant execute on function public.ai_usage_today_total() to authenticated;
