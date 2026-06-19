-- RPC per il titolare: lista dipendenti con stato PIN.
-- Non sostituisce fos_dipendenti_org (mantiene compat) — aggiunge stato PIN
-- in una query separata che la UI Personale > Accessi merga lato client.

create or replace function public.fos_dipendente_pin_status()
returns table (id uuid, has_pin boolean, pin_set_at timestamptz)
language sql
security definer
set search_path = public
as $fn$
  select p.id, p.pin_hash is not null as has_pin, p.pin_set_at
  from public.profiles p
  where p.organization_id = public.get_user_org_id()
    and p.ruolo = 'dipendente'
    and not public.is_dipendente()
$fn$;

revoke execute on function public.fos_dipendente_pin_status() from anon;
grant execute on function public.fos_dipendente_pin_status() to authenticated;
