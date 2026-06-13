-- View usage analytics: aggregato giornaliero per org/user/view.
-- Tracking richiamato da src/lib/usageTracking.js ogni volta che l'utente
-- apre una view. UPSERT con increment atomico per evitare race.
-- Aggregazione daily per limitare crescita tabella (vs row-per-click).

create table if not exists public.view_usage_daily (
  organization_id uuid not null,
  user_id uuid not null,
  view_name text not null,
  date date not null default current_date,
  open_count integer not null default 1,
  last_opened_at timestamptz not null default now(),
  primary key (organization_id, user_id, view_name, date)
);

alter table public.view_usage_daily
  drop constraint if exists view_usage_daily_org_fk;
alter table public.view_usage_daily
  add constraint view_usage_daily_org_fk
  foreign key (organization_id)
  references public.organizations(id) on delete cascade;

create index if not exists idx_view_usage_daily_date_org
  on public.view_usage_daily (date desc, organization_id);

create index if not exists idx_view_usage_daily_view_date
  on public.view_usage_daily (view_name, date desc);

alter table public.view_usage_daily enable row level security;

drop policy if exists view_usage_daily_select_own on public.view_usage_daily;
create policy view_usage_daily_select_own
  on public.view_usage_daily
  for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists view_usage_daily_insert_own on public.view_usage_daily;
create policy view_usage_daily_insert_own
  on public.view_usage_daily
  for insert
  with check (
    user_id = auth.uid()
    and organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists view_usage_daily_update_own on public.view_usage_daily;
create policy view_usage_daily_update_own
  on public.view_usage_daily
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.view_usage_daily to authenticated;

-- RPC atomica per UPSERT con increment.
-- Evita race condition tra letture/scritture del counter.
create or replace function public.track_view_open(p_view_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select organization_id into v_org_id from public.profiles where id = auth.uid();
  if v_org_id is null then
    return;  -- utente senza org: silently no-op
  end if;
  insert into public.view_usage_daily (organization_id, user_id, view_name, date, open_count, last_opened_at)
  values (v_org_id, auth.uid(), p_view_name, current_date, 1, now())
  on conflict (organization_id, user_id, view_name, date)
  do update set
    open_count = view_usage_daily.open_count + 1,
    last_opened_at = now();
end;
$$;

grant execute on function public.track_view_open(text) to authenticated;
