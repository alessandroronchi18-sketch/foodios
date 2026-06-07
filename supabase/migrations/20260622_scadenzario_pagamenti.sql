-- ════════════════════════════════════════════════════════════════════════════
-- Scadenzario fornitori — evoluzione: scadenza reale, IBAN, note di credito,
-- pagamenti parziali, metodo pagamento, + anagrafica fornitori.
-- Idempotente: add column if not exists + create table if not exists.
-- La tabella `fatture` è creata out-of-band (vedi 20260514_rls_completo.sql),
-- quindi qui ALTERIAMO con guardia di esistenza.
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.fatture') is not null then
    -- Scadenza REALE (da XML FatturaPA DatiPagamento, o da termini fornitore,
    -- o fallback +30gg lato app). Prima era derivata sempre come data_fattura+30.
    execute 'alter table public.fatture add column if not exists data_scadenza date';
    -- Tipo documento: distinzione fattura vs nota di credito (NC compensa il dovuto).
    execute 'alter table public.fatture add column if not exists tipo text not null default ''fattura''';
    -- Pagamento
    execute 'alter table public.fatture add column if not exists metodo_pagamento text';
    execute 'alter table public.fatture add column if not exists importo_pagato numeric not null default 0';
    -- Dati per il bonifico (IBAN del fornitore, dal blocco DatiPagamento dell''XML)
    execute 'alter table public.fatture add column if not exists iban text';
    -- Anagrafica fiscale (i parser le producono già; prima venivano scartate)
    execute 'alter table public.fatture add column if not exists piva text';
    execute 'alter table public.fatture add column if not exists cf text';
    -- Extra
    execute 'alter table public.fatture add column if not exists note text';
    execute 'alter table public.fatture add column if not exists allegato_url text';

    -- Constraint soft su tipo (drop+create per idempotenza)
    begin
      execute 'alter table public.fatture drop constraint if exists fatture_tipo_chk';
      execute 'alter table public.fatture add constraint fatture_tipo_chk check (tipo in (''fattura'',''nota_credito''))';
    exception when others then null;
    end;
  end if;
end $$;

-- ── Anagrafica fornitori (enrichment: IBAN di default, termini, categoria) ────
-- Le fatture restano keyed per `fornitore` testuale (fonte = XML); questa tabella
-- arricchisce il rollup per-fornitore senza FK rigide. Match per nome normalizzato.
create table if not exists public.fornitori (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  nome              text not null,
  nome_norm         text not null,
  piva              text,
  cf                text,
  iban              text,
  termini_pagamento integer not null default 30,
  categoria         text,
  referente         text,
  email             text,
  telefono          text,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Un fornitore per nome normalizzato per org (upsert dall'import)
create unique index if not exists fornitori_org_nome_norm_uidx
  on public.fornitori (organization_id, nome_norm);

alter table public.fornitori enable row level security;
drop policy if exists "fornitori_own" on public.fornitori;
create policy "fornitori_own" on public.fornitori
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Indici utili per lo scadenzario
do $$
begin
  if to_regclass('public.fatture') is not null then
    execute 'create index if not exists fatture_org_scad_idx on public.fatture (organization_id, data_scadenza)';
    execute 'create index if not exists fatture_org_forn_idx on public.fatture (organization_id, fornitore)';
  end if;
end $$;
