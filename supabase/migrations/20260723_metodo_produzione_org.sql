-- Migration: sposta metodo_produzione da SEDI a ORGANIZATIONS.
--
-- MOTIVAZIONE (audit 2026-07-23): il metodo di produzione (stampi vs
-- inventario differenziale) è una scelta di modello business dell'attività,
-- non della singola sede. Un'org non può avere sedi con metodi diversi
-- senza rompere le analisi consolidate (P&L, simulatore, menu engineering,
-- ricettario shared). Il flag rimane per sede solo come `is_sede_produzione`
-- (bool) che indica se la sede produce in proprio o è punto vendita ricevente.
--
-- Idempotente. La colonna sedi.metodo_produzione NON viene droppata (fallback
-- + evita break del vecchio codice non ancora migrato), ma il nuovo codice
-- legge SOLO organizations.metodo_produzione.

-- 1. Aggiungi colonna metodo_produzione a organizations
alter table public.organizations
  add column if not exists metodo_produzione text not null default 'stampi';

alter table public.organizations
  drop constraint if exists organizations_metodo_produzione_check;

alter table public.organizations
  add constraint organizations_metodo_produzione_check
  check (metodo_produzione in ('stampi','inventario'));

-- 2. Migra dati esistenti: per ogni org, prendi il metodo della sua sede
--    produttiva più rappresentativa (default > prima creata) come baseline.
--    Se non esiste sede produttiva, resta il default 'stampi'.
update public.organizations o
set metodo_produzione = coalesce((
  select s.metodo_produzione
  from public.sedi s
  where s.organization_id = o.id
    and s.is_sede_produzione = true
    and coalesce(s.attiva, true) = true
  order by s.is_default desc nulls last, s.created_at asc
  limit 1
), 'stampi')
where o.metodo_produzione = 'stampi'  -- solo per org appena inizializzate a default
  and exists (
    select 1 from public.sedi s
    where s.organization_id = o.id
      and s.is_sede_produzione = true
      and s.metodo_produzione = 'inventario'
  );

-- 3. Uniformiamo sedi.metodo_produzione al valore org (per compat/leggibilità
--    delle vecchie query che ancora lo leggessero — evita drift). Il vero
--    "source of truth" ora è organizations.metodo_produzione.
update public.sedi s
set metodo_produzione = o.metodo_produzione
from public.organizations o
where s.organization_id = o.id
  and s.metodo_produzione is distinct from o.metodo_produzione;
