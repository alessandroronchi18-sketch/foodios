-- ─────────────────────────────────────────────────────────────────────────────
-- FOODOS - Check stato migration recenti (aggiornato 2026-09-07)
-- ─────────────────────────────────────────────────────────────────────────────
-- Copia e incolla questo intero SELECT nel SQL Editor Supabase (prod).
-- Per ogni migration dice se e' GIA' APPLICATA, DA APPLICARE o PARZIALE.
-- Non modifica nulla: sola lettura di information_schema + pg_catalog.
--
-- Le migration fino a 20260731 risultavano verificate applicate il 2026-09-01.
-- Qui si controllano le due successive.
-- ─────────────────────────────────────────────────────────────────────────────

with checks as (

  -- ── 20260901_import_mappings_library ───────────────────────────────────────
  -- Libreria di mapping cross-cliente per il wizard di import.
  -- Pezzi attesi: 1 tabella + 2 indici + RLS attiva + 1 policy + 2 RPC = 7
  select
    '20260901_import_mappings_library' as migration,
    (select count(*) from information_schema.tables
       where table_schema = 'public' and table_name = 'import_mappings_library')
    + (select count(*) from pg_indexes
       where schemaname = 'public'
         and indexname in ('idx_import_mappings_entity_hash',
                           'idx_import_mappings_confirmed'))
    + (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'import_mappings_library'
         and c.relrowsecurity)
    + (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'import_mappings_library'
         and policyname = 'import_mappings_read_all')
    + (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('save_import_mapping', 'lookup_import_mapping'))
    as pezzi_ok,
    7 as pezzi_totali

  union all

  -- ── 20260904_storico_inventario_rpc ────────────────────────────────────────
  -- Indice composto + RPC di aggregazione mensile per lo Storico inventario.
  -- Senza questa, lo Storico "Tutte le sedi" scarica righe grezze e va in
  -- timeout sopra le decine di migliaia di righe.
  -- Pezzi attesi: 1 indice + 1 RPC + grant a anon/authenticated = 3
  select
    '20260904_storico_inventario_rpc',
    (select count(*) from pg_indexes
       where schemaname = 'public' and indexname = 'idx_inv_prod_org_sede_data')
    + (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'storico_inventario_per_mese')
    + (select case when (
         select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'storico_inventario_per_mese'
           and has_function_privilege('authenticated', p.oid, 'execute')
       ) > 0 then 1 else 0 end),
    3
)
select
  migration,
  pezzi_ok || ' / ' || pezzi_totali as pezzi,
  case
    when pezzi_ok = 0            then 'DA APPLICARE'
    when pezzi_ok = pezzi_totali then 'GIA'' APPLICATA'
    else                              'PARZIALE - rilanciare la migration, e'' idempotente'
  end as stato
from checks
order by migration;
