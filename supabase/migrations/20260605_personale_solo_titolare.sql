-- Personale (dipendenti + turni) accessibile SOLO al titolare.
-- Motivo privacy: gli stipendi (costo_orario) e i turni dei colleghi non devono
-- mai essere leggibili da un utente con ruolo 'dipendente', nemmeno via query DB
-- diretta. La UI nasconde la pagina, ma la sicurezza vera sta qui nella RLS.
-- Idempotente. Vedi anche 20260605_ruolo_dipendente.sql (is_dipendente()).

-- dipendenti --------------------------------------------------------------
alter table public.dipendenti enable row level security;
drop policy if exists "dipendenti_own"        on public.dipendenti;
drop policy if exists "dipendenti_titolare"   on public.dipendenti;

create policy "dipendenti_titolare"
on public.dipendenti
for all
using (
  organization_id in (select organization_id from public.profiles where id = auth.uid())
  and not public.is_dipendente()
)
with check (
  organization_id in (select organization_id from public.profiles where id = auth.uid())
  and not public.is_dipendente()
);

-- turni -------------------------------------------------------------------
alter table public.turni enable row level security;
drop policy if exists "turni_own"      on public.turni;
drop policy if exists "turni_titolare" on public.turni;

create policy "turni_titolare"
on public.turni
for all
using (
  organization_id in (select organization_id from public.profiles where id = auth.uid())
  and not public.is_dipendente()
)
with check (
  organization_id in (select organization_id from public.profiles where id = auth.uid())
  and not public.is_dipendente()
);
