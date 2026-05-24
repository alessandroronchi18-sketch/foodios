-- ╭──────────────────────────────────────────────────────────────────╮
-- │ FIX: column dipendenti.sede_id / fornitori.sede_id does not exist │
-- │                                                                  │
-- │ Da eseguire UNA VOLTA su Supabase (SQL editor).                  │
-- │ Idempotente: usa `if not exists`, sicuro da rieseguire.          │
-- ╰──────────────────────────────────────────────────────────────────╯

-- 1. Aggiungi colonna sede_id alle tabelle che ne hanno bisogno
alter table public.fornitori
  add column if not exists sede_id uuid references public.sedi(id) on delete set null;

alter table public.dipendenti
  add column if not exists sede_id uuid references public.sedi(id) on delete set null;

-- 'turni' viene filtrato anch'esso per sede in UI — aggiungo se manca
alter table public.turni
  add column if not exists sede_id uuid references public.sedi(id) on delete set null;

-- 2. Indici per query filtrate per sede_id (perf)
create index if not exists idx_fornitori_sede  on public.fornitori(sede_id);
create index if not exists idx_dipendenti_sede on public.dipendenti(sede_id);
create index if not exists idx_turni_sede      on public.turni(sede_id);

-- 3. Backfill: i record esistenti senza sede vengono assegnati alla PRIMA
--    sede dell'organization (così non spariscono dalla UI multi-sede).
update public.fornitori f
   set sede_id = (
     select s.id from public.sedi s
     where s.organization_id = f.organization_id
     order by s.created_at nulls last, s.id
     limit 1
   )
 where f.sede_id is null;

update public.dipendenti d
   set sede_id = (
     select s.id from public.sedi s
     where s.organization_id = d.organization_id
     order by s.created_at nulls last, s.id
     limit 1
   )
 where d.sede_id is null;

update public.turni t
   set sede_id = (
     select s.id from public.sedi s
     where s.organization_id = t.organization_id
     order by s.created_at nulls last, s.id
     limit 1
   )
 where t.sede_id is null;

-- 4. Verifica finale (decommenta per controllare)
-- select table_name, column_name from information_schema.columns
--  where table_schema = 'public'
--    and column_name = 'sede_id'
--    and table_name in ('fornitori', 'dipendenti', 'turni')
--  order by table_name;
