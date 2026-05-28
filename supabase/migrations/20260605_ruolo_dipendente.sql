-- =================================================================
-- Ruolo dipendente - restrizioni lato server (RLS).
-- La UI gia nasconde le viste sensibili al dipendente, ma qui mettiamo
-- le restrizioni vere lato Postgres. I titolari (ruolo titolare o NULL)
-- mantengono pieno accesso; il service_role bypassa sempre la RLS.
-- Idempotente: safe da rieseguire.
-- =================================================================

-- Helper SECURITY DEFINER: ruolo dell utente corrente.
create or replace function public.get_user_ruolo()
returns text
language sql
security definer
stable
set search_path = public
as $fn$
  select ruolo from public.profiles where id = auth.uid()
$fn$;
revoke all on function public.get_user_ruolo() from public;
grant execute on function public.get_user_ruolo() to anon, authenticated;

-- Helper booleano: true se utente corrente e un dipendente.
create or replace function public.is_dipendente()
returns boolean
language sql
security definer
stable
set search_path = public
as $fn$
  select coalesce((select ruolo from public.profiles where id = auth.uid()), '') = 'dipendente'
$fn$;
revoke all on function public.is_dipendente() from public;
grant execute on function public.is_dipendente() to anon, authenticated;

-- ---- user_data: SELECT per tutti i membri org, scrittura ristretta -----------
alter table public.user_data enable row level security;
drop policy if exists "data_own"        on public.user_data;
drop policy if exists "data_select_own" on public.user_data;
drop policy if exists "data_insert_own" on public.user_data;
drop policy if exists "data_update_own" on public.user_data;
drop policy if exists "data_delete_own" on public.user_data;

create policy "data_select_own" on public.user_data
  for select using (organization_id = public.get_user_org_id());

-- Chiavi scrivibili da un dipendente (allow-list, default-deny per chiavi nuove).
create policy "data_insert_own" on public.user_data
  for insert with check (
    organization_id = public.get_user_org_id()
    and (
      not public.is_dipendente()
      or data_key = any (array[
        'pasticceria-magazzino-v1','pasticceria-produzione-v1',
        'pasticceria-giornaliero-v1','pasticceria-chiusure-v1','pasticceria-logrif-v1'
      ])
    )
  );

create policy "data_update_own" on public.user_data
  for update using (
    organization_id = public.get_user_org_id()
    and (
      not public.is_dipendente()
      or data_key = any (array[
        'pasticceria-magazzino-v1','pasticceria-produzione-v1',
        'pasticceria-giornaliero-v1','pasticceria-chiusure-v1','pasticceria-logrif-v1'
      ])
    )
  )
  with check (
    organization_id = public.get_user_org_id()
    and (
      not public.is_dipendente()
      or data_key = any (array[
        'pasticceria-magazzino-v1','pasticceria-produzione-v1',
        'pasticceria-giornaliero-v1','pasticceria-chiusure-v1','pasticceria-logrif-v1'
      ])
    )
  );

create policy "data_delete_own" on public.user_data
  for delete using (
    organization_id = public.get_user_org_id()
    and (
      not public.is_dipendente()
      or data_key = any (array[
        'pasticceria-magazzino-v1','pasticceria-produzione-v1',
        'pasticceria-giornaliero-v1','pasticceria-chiusure-v1','pasticceria-logrif-v1'
      ])
    )
  );

-- ---- organizations: solo il titolare modifica -------------------------------
drop policy if exists "org_update_own" on public.organizations;
create policy "org_update_own" on public.organizations
  for update using (
    id = public.get_user_org_id() and not public.is_dipendente()
  )
  with check (
    id = public.get_user_org_id() and not public.is_dipendente()
  );

-- ---- sedi: SELECT per tutti, scrittura solo titolare ------------------------
drop policy if exists "sedi_own"        on public.sedi;
drop policy if exists "sedi_select_own" on public.sedi;
drop policy if exists "sedi_write_own"  on public.sedi;
create policy "sedi_select_own" on public.sedi
  for select using (organization_id = public.get_user_org_id());
create policy "sedi_write_own" on public.sedi
  for all using (
    organization_id = public.get_user_org_id() and not public.is_dipendente()
  )
  with check (
    organization_id = public.get_user_org_id() and not public.is_dipendente()
  );

-- ---- profiles: blocca auto-promozione del dipendente ------------------------
-- Un dipendente non puo cambiare ruolo o approvato (proprio o altrui).
create or replace function public.guard_profile_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $guard$
begin
  if public.is_dipendente()
     and (new.ruolo is distinct from old.ruolo or new.approvato is distinct from old.approvato) then
    raise exception 'Un dipendente non puo modificare ruolo o approvazione dei profili';
  end if;
  return new;
end;
$guard$;

drop trigger if exists trg_guard_profile_escalation on public.profiles;
create trigger trg_guard_profile_escalation
  before update on public.profiles
  for each row execute function public.guard_profile_escalation();
