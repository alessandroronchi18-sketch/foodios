-- ===========================================================================
-- COSTI AZIENDALI (P&L extra-food)
--
-- Costi che il proprietario inserisce manualmente, non legati direttamente
-- al food cost delle ricette: consumabili (fazzoletti, coppette, palette,
-- sacchetti), manutenzione, ammortamenti, utenze, affitti, assicurazioni,
-- servizi professionali, marketing.
--
-- Periodicita': mensile (default) | annuale | una_tantum.
-- I valori annuali/una_tantum vengono divisi per 12 nel calcolo P&L mensile.
--
-- Versione robusta per Supabase SQL Editor: niente trigger (no dollar-quote
-- $fn$), niente doppi apici nei nomi policy (parser splitting), policy su
-- singola riga.
-- ===========================================================================

-- Drop preventivi (idempotenti, coprono sia versione con apici sia senza)
drop policy if exists costi_az_select_org on public.costi_aziendali;
drop policy if exists costi_az_write_org on public.costi_aziendali;
drop policy if exists "costi_az_select_org" on public.costi_aziendali;
drop policy if exists "costi_az_write_org" on public.costi_aziendali;

-- Tabella
create table if not exists public.costi_aziendali (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sede_id         uuid references public.sedi(id) on delete cascade,
  categoria       text not null,
  voce            text not null,
  importo         numeric(12,2) not null default 0,
  periodicita     text not null default 'mensile',
  data_inizio     date,
  note            text,
  attivo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint costi_periodicita_check check (periodicita in ('mensile','annuale','una_tantum'))
);

-- Indici
create index if not exists idx_costi_aziendali_org on public.costi_aziendali (organization_id, attivo);
create index if not exists idx_costi_aziendali_sede on public.costi_aziendali (sede_id, attivo) where sede_id is not null;

-- RLS
alter table public.costi_aziendali enable row level security;

create policy costi_az_select_org on public.costi_aziendali for select using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create policy costi_az_write_org on public.costi_aziendali for all using (organization_id in (select organization_id from public.profiles where id = auth.uid())) with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

-- Grant
grant select, insert, update, delete on public.costi_aziendali to authenticated;
