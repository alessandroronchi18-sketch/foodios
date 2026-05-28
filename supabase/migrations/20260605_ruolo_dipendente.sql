-- Ruolo dipendente - restrizioni RLS lato server. Idempotente.

create or replace function public.get_user_ruolo()
returns text
language sql security definer stable
set search_path = public
as $fn$
  select ruolo from public.profiles where id = auth.uid()
$fn$;
revoke all on function public.get_user_ruolo() from public;
grant execute on function public.get_user_ruolo() to anon, authenticated;

create or replace function public.is_dipendente()
returns boolean
language sql security definer stable
set search_path = public
as $fn$
  select coalesce(
    (select ruolo from public.profiles where id = auth.uid()),
    ''
  ) = 'dipendente'
$fn$;
revoke all on function public.is_dipendente() from public;
grant execute on function public.is_dipendente() to anon, authenticated;

create or replace function public.is_chiave_operativa(k text)
returns boolean
language sql immutable
as $fn$
  select k in (
    'pasticceria-magazzino-v1',
    'pasticceria-produzione-v1',
    'pasticceria-giornaliero-v1',
    'pasticceria-chiusure-v1',
    'pasticceria-logrif-v1'
  )
$fn$;
grant execute on function public.is_chiave_operativa(text) to anon, authenticated;

alter table public.user_data enable row level security;
drop policy if exists "data_own"        on public.user_data;
drop policy if exists "data_select_own" on public.user_data;
drop policy if exists "data_insert_own" on public.user_data;
drop policy if exists "data_update_own" on public.user_data;
drop policy if exists "data_delete_own" on public.user_data;

create policy "data_select_own"
on public.user_data
for select
using (
  organization_id = public.get_user_org_id()
);

create policy "data_insert_own"
on public.user_data
for insert
with check (
  organization_id = public.get_user_org_id()
  and (
    not public.is_dipendente()
    or public.is_chiave_operativa(data_key)
  )
);

create policy "data_update_own"
on public.user_data
for update
using (
  organization_id = public.get_user_org_id()
  and (
    not public.is_dipendente()
    or public.is_chiave_operativa(data_key)
  )
)
with check (
  organization_id = public.get_user_org_id()
  and (
    not public.is_dipendente()
    or public.is_chiave_operativa(data_key)
  )
);

create policy "data_delete_own"
on public.user_data
for delete
using (
  organization_id = public.get_user_org_id()
  and (
    not public.is_dipendente()
    or public.is_chiave_operativa(data_key)
  )
);

drop policy if exists "org_update_own" on public.organizations;
create policy "org_update_own"
on public.organizations
for update
using (
  id = public.get_user_org_id()
  and not public.is_dipendente()
)
with check (
  id = public.get_user_org_id()
  and not public.is_dipendente()
);

drop policy if exists "sedi_own"        on public.sedi;
drop policy if exists "sedi_select_own" on public.sedi;
drop policy if exists "sedi_write_own"  on public.sedi;

create policy "sedi_select_own"
on public.sedi
for select
using (
  organization_id = public.get_user_org_id()
);

create policy "sedi_write_own"
on public.sedi
for all
using (
  organization_id = public.get_user_org_id()
  and not public.is_dipendente()
)
with check (
  organization_id = public.get_user_org_id()
  and not public.is_dipendente()
);

create or replace function public.guard_profile_escalation()
returns trigger
language plpgsql security definer
set search_path = public
as $guard$
begin
  if public.is_dipendente() and (
       new.ruolo is distinct from old.ruolo
       or new.approvato is distinct from old.approvato
     ) then
    raise exception 'Dipendente non puo cambiare ruolo o approvato';
  end if;
  return new;
end;
$guard$;

drop trigger if exists trg_guard_profile_escalation on public.profiles;
create trigger trg_guard_profile_escalation
before update on public.profiles
for each row execute function public.guard_profile_escalation();
