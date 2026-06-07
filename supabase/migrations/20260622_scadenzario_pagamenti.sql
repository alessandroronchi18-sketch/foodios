-- ════════════════════════════════════════════════════════════════════════════
-- Scadenzario fornitori — evoluzione: scadenza reale, IBAN, note di credito,
-- pagamenti parziali, metodo pagamento + estensione anagrafica fornitori.
-- 100% idempotente e additiva: solo `add column if not exists` con guardia di
-- esistenza. NON ricrea tabelle né tocca le RLS esistenti.
-- `fatture` e `fornitori` sono già presenti (vedi 20260514_rls_completo.sql e
-- 20260513_fornitori.sql).
-- ════════════════════════════════════════════════════════════════════════════

-- ── fatture: nuove colonne ───────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.fatture') is not null then
    -- Scadenza REALE (da XML FatturaPA DatiPagamento, o termini fornitore, o +30gg).
    execute 'alter table public.fatture add column if not exists data_scadenza date';
    -- Tipo documento: fattura vs nota di credito (la NC compensa il dovuto).
    execute 'alter table public.fatture add column if not exists tipo text not null default ''fattura''';
    -- Pagamento
    execute 'alter table public.fatture add column if not exists metodo_pagamento text';
    execute 'alter table public.fatture add column if not exists importo_pagato numeric not null default 0';
    -- IBAN del fornitore (dal blocco DatiPagamento dell''XML) per il bonifico
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

    -- Indici utili
    execute 'create index if not exists fatture_org_scad_idx on public.fatture (organization_id, data_scadenza)';
    execute 'create index if not exists fatture_org_forn_idx on public.fatture (organization_id, fornitore)';
  end if;
end $$;

-- ── fornitori: estende l'anagrafica ESISTENTE con i campi per pagamenti ───────
-- (la tabella e la sua RLS esistono già da 20260513_fornitori.sql — NON le ricreo)
do $$
begin
  if to_regclass('public.fornitori') is not null then
    execute 'alter table public.fornitori add column if not exists iban text';
    execute 'alter table public.fornitori add column if not exists termini_pagamento integer not null default 30';
    execute 'alter table public.fornitori add column if not exists categoria text';
  end if;
end $$;
