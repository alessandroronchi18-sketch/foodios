-- ═══════════════════════════════════════════════════════════════════════════
-- MULTI-SEDE — Modello completo
--
-- Obiettivi:
--   1. Permettere tagging opzionale di fornitori/dipendenti/turni a una sede
--   2. Tabella trasferimenti per spostare prodotti/materie prime tra sedi
--   3. Cleanup duplicati legacy in user_data con sede_id NULL
--   4. Indici per query filtrate per sede_id
--
-- Idempotente: safe da rieseguire.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. sede_id su fornitori / dipendenti / turni ─────────────────────────
-- NULL = condiviso a livello azienda (visibile a tutte le sedi)
-- valore = sede specifica (visibile solo a quella sede)

alter table public.fornitori   add column if not exists sede_id uuid references public.sedi(id) on delete set null;
alter table public.dipendenti  add column if not exists sede_id uuid references public.sedi(id) on delete set null;
alter table public.turni       add column if not exists sede_id uuid references public.sedi(id) on delete set null;

create index if not exists idx_fornitori_sede  on public.fornitori(sede_id);
create index if not exists idx_dipendenti_sede on public.dipendenti(sede_id);
create index if not exists idx_turni_sede      on public.turni(sede_id);

-- ── 2. Tabella trasferimenti ──────────────────────────────────────────────
-- Movimenti di stock tra due sedi della stessa organizzazione.
-- Es: il laboratorio centrale invia 30 brioches alla sede del centro.

create table if not exists public.trasferimenti (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete cascade not null,
  sede_da         uuid references public.sedi(id) on delete restrict not null,
  sede_a          uuid references public.sedi(id) on delete restrict not null,
  data            date not null default current_date,
  tipo            text not null default 'prodotto' check (tipo in ('prodotto','materia_prima','semilavorato')),
  prodotto        text not null,
  quantita        numeric(12,3) not null default 0,
  unita           text default 'pz',
  valore_unit     numeric(12,4) default 0,
  note            text,
  stato           text not null default 'completato' check (stato in ('bozza','inviato','completato','annullato')),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  check (sede_da <> sede_a)
);

create index if not exists idx_trasferimenti_org  on public.trasferimenti(organization_id);
create index if not exists idx_trasferimenti_da   on public.trasferimenti(sede_da);
create index if not exists idx_trasferimenti_a    on public.trasferimenti(sede_a);
create index if not exists idx_trasferimenti_data on public.trasferimenti(data);

-- RLS: i trasferimenti sono visibili agli utenti dell'org coinvolta
alter table public.trasferimenti enable row level security;
drop policy if exists "trasferimenti_own" on public.trasferimenti;
create policy "trasferimenti_own" on public.trasferimenti
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- ── 3. Cleanup duplicati user_data legacy ────────────────────────────────
-- Background: l'UNIQUE constraint (organization_id, sede_id, data_key)
-- in PostgreSQL non considera NULL come uguale, quindi possono esistere
-- N righe con stesso (org, NULL, key). Manteniamo solo la più recente.

with ranked as (
  select id,
         row_number() over (
           partition by organization_id, sede_id, data_key
           order by updated_at desc nulls last, id
         ) as rn
  from public.user_data
)
delete from public.user_data
where id in (select id from ranked where rn > 1);

-- ── 4. Force-unique constraint solido su user_data ────────────────────────
-- Usiamo un partial unique index per gestire NULL come "stesso valore".
-- Rimpiazza l'UNIQUE constraint dello schema originario che non gestisce NULL.

drop index if exists user_data_unique_with_sede;
drop index if exists user_data_unique_no_sede;

create unique index if not exists user_data_unique_with_sede
  on public.user_data (organization_id, sede_id, data_key)
  where sede_id is not null;

create unique index if not exists user_data_unique_no_sede
  on public.user_data (organization_id, data_key)
  where sede_id is null;

-- ── 5. View admin per visione aggregata per-sede ─────────────────────────
-- Utile per il pannello admin e per il futuro "Vista azienda".
create or replace view public.sedi_kpi as
select
  s.organization_id,
  s.id           as sede_id,
  s.nome         as sede_nome,
  s.is_default,
  s.attiva,
  (select count(*) from public.user_data d
     where d.organization_id = s.organization_id
       and d.sede_id = s.id) as num_record_propri,
  (select count(*) from public.fatture f
     where f.organization_id = s.organization_id
       and f.sede_id = s.id) as num_fatture,
  (select count(*) from public.dipendenti dp
     where dp.organization_id = s.organization_id
       and (dp.sede_id = s.id or dp.sede_id is null)
       and dp.attivo = true) as num_dipendenti
from public.sedi s;

revoke all on public.sedi_kpi from anon, authenticated;
grant select on public.sedi_kpi to service_role, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA POST-MIGRATION
--
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='fornitori' and column_name='sede_id';
--   -- deve restituire 1 riga
--
--   select count(*) from public.trasferimenti; -- 0 ok
--
--   select organization_id, data_key, sede_id, count(*)
--     from public.user_data group by 1,2,3 having count(*) > 1;
--   -- deve restituire 0 righe
-- ═══════════════════════════════════════════════════════════════════════════
