-- ═══════════════════════════════════════════════════════════════════════════
-- FIX user_data — duplicati e UNIQUE constraint
--
-- Root cause: il vincolo UNIQUE (organization_id, sede_id, data_key) in
-- PostgreSQL tratta NULL come DISTINTI (NULL ≠ NULL). Per le chiavi shared
-- (sede_id=NULL) il vincolo non scatta, quindi ogni ssave crea una nuova
-- riga invece di aggiornare → duplicati accumulati nel tempo.
--
-- Sintomi: sload restituisce PGRST116 ("multiple rows returned") →
-- l'app pensa che Supabase sia vuoto.
--
-- Esegui questo file UNA VOLTA nell'SQL Editor Supabase, in ordine.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0) Anteprima duplicati (READ ONLY) ─────────────────────────────────────
--    Esegui questo PRIMA, copia il risultato per sicurezza.
select
  organization_id,
  sede_id,
  data_key,
  count(*)         as righe,
  max(updated_at)  as ultimo,
  min(updated_at)  as primo
from public.user_data
group by organization_id, sede_id, data_key
having count(*) > 1
order by righe desc, ultimo desc;

-- ── 1) DEDUPE — mantieni solo la riga più recente per (org, sede, key) ────
--    Usa DISTINCT ON: NULL trattato come uguale (al contrario di UNIQUE).
delete from public.user_data
where id not in (
  select distinct on (organization_id, sede_id, data_key) id
  from public.user_data
  order by organization_id, sede_id, data_key, updated_at desc
);

-- ── 2) Verifica zero duplicati ──────────────────────────────────────────────
select
  organization_id, sede_id, data_key, count(*)
from public.user_data
group by organization_id, sede_id, data_key
having count(*) > 1;
--    Atteso: zero righe.

-- ── 3) Drop UNIQUE vecchio + crea UNIQUE NULLS NOT DISTINCT (PostgreSQL 15+)
do $$
declare
  c text;
begin
  -- Trova ed elimina TUTTI i constraint UNIQUE su (org_id, sede_id, data_key).
  -- Il nome auto-generato può essere "user_data_organization_id_sede_id_data_key_key"
  -- o simile; gestiamo qualsiasi naming.
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.user_data'::regclass
      and contype = 'u'
  loop
    execute format('alter table public.user_data drop constraint %I', c);
  end loop;
end $$;

-- Ora crea il vincolo correttamente: NULLS NOT DISTINCT considera NULL = NULL
-- → due righe (org=X, sede=NULL, key=Y) saranno duplicati e l'upsert farà UPDATE.
alter table public.user_data
  add constraint user_data_org_sede_key_unique
  unique nulls not distinct (organization_id, sede_id, data_key);

-- ── 4) Verifica finale ──────────────────────────────────────────────────────
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.user_data'::regclass
  and contype = 'u';
--    Atteso: 1 riga con "UNIQUE NULLS NOT DISTINCT (organization_id, sede_id, data_key)"
