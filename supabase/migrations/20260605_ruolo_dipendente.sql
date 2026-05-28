-- ═══════════════════════════════════════════════════════════════
-- Ruolo 'dipendente' — restrizioni lato server (RLS).
--
-- L'app già nasconde le viste sensibili a un dipendente (Dashboard +
-- DIPENDENTE_VIEWS), ma la UI da sola non è una garanzia di sicurezza: un
-- client compromesso potrebbe comunque tentare scritture. Qui mettiamo le
-- "teeth" lato Postgres:
--   • un dipendente può SCRIVERE solo le chiavi operative di user_data
--     (magazzino, produzione, giornaliero, chiusure, logrif);
--   • NON può modificare ricettario / prezzi / regole / config societaria;
--   • NON può modificare organizations (piano, billing, impostazioni) né sedi;
--   • NON può promuovere sé stesso (cambiare ruolo/approvato sul profilo).
--
-- I titolari (ruolo 'titolare' o NULL) mantengono pieno accesso. Il service_role
-- (edge functions, Stripe, admin) bypassa sempre la RLS.
-- Idempotente: safe da rieseguire.
-- ═══════════════════════════════════════════════════════════════

-- Helper SECURITY DEFINER per il ruolo dell'utente corrente.
create or replace function public.get_user_ruolo()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select ruolo from public.profiles where id = auth.uid()
$$;
revoke all on function public.get_user_ruolo() from public;
grant execute on function public.get_user_ruolo() to anon, authenticated;

-- ── user_data: SELECT per tutti i membri org, scrittura ristretta ──────────────
alter table public.user_data enable row level security;
drop policy if exists "data_own"        on public.user_data;
drop policy if exists "data_select_own" on public.user_data;
drop policy if exists "data_insert_own" on public.user_data;
drop policy if exists "data_update_own" on public.user_data;
drop policy if exists "data_delete_own" on public.user_data;

create policy "data_select_own" on public.user_data
  for select using (organization_id = public.get_user_org_id());

-- Chiavi che un dipendente può scrivere (allow-list → default-deny per chiavi nuove).
create policy "data_insert_own" on public.user_data
  for insert with check (
    organization_id = public.get_user_org_id()
    and (
      public.get_user_ruolo() is distinct from 'dipendente'
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
      public.get_user_ruolo() is distinct from 'dipendente'
      or data_key = any (array[
        'pasticceria-magazzino-v1','pasticceria-produzione-v1',
        'pasticceria-giornaliero-v1','pasticceria-chiusure-v1','pasticceria-logrif-v1'
      ])
    )
  )
  with check (
    organization_id = public.get_user_org_id()
    and (
      public.get_user_ruolo() is distinct from 'dipendente'
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
      public.get_user_ruolo() is distinct from 'dipendente'
      or data_key = any (array[
        'pasticceria-magazzino-v1','pasticceria-produzione-v1',
        'pasticceria-giornaliero-v1','pasticceria-chiusure-v1','pasticceria-logrif-v1'
      ])
    )
  );

-- ── organizations: solo il titolare modifica (piano/billing/impostazioni) ──────
drop policy if exists "org_update_own" on public.organizations;
create policy "org_update_own" on public.organizations
  for update using (
    id = public.get_user_org_id() and public.get_user_ruolo() is distinct from 'dipendente'
  )
  with check (
    id = public.get_user_org_id() and public.get_user_ruolo() is distinct from 'dipendente'
  );

-- ── sedi: SELECT per tutti, scrittura solo titolare ────────────────────────────
drop policy if exists "sedi_own"        on public.sedi;
drop policy if exists "sedi_select_own" on public.sedi;
drop policy if exists "sedi_write_own"  on public.sedi;
create policy "sedi_select_own" on public.sedi
  for select using (organization_id = public.get_user_org_id());
create policy "sedi_write_own" on public.sedi
  for all using (
    organization_id = public.get_user_org_id() and public.get_user_ruolo() is distinct from 'dipendente'
  )
  with check (
    organization_id = public.get_user_org_id() and public.get_user_ruolo() is distinct from 'dipendente'
  );

-- ── profiles: impedisci l'escalation (dipendente che si promuove) ──────────────
-- La policy profile_own resta (un utente vede/aggiorna i profili della sua org),
-- ma un trigger blocca la modifica di ruolo/approvato da parte di un dipendente.
create or replace function public.guard_profile_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_user_ruolo() = 'dipendente'
     and (new.ruolo is distinct from old.ruolo or new.approvato is distinct from old.approvato) then
    raise exception 'Un dipendente non può modificare ruolo o approvazione dei profili';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_escalation on public.profiles;
create trigger trg_guard_profile_escalation
  before update on public.profiles
  for each row execute function public.guard_profile_escalation();
