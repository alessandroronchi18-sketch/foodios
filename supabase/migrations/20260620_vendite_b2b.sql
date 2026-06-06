-- 20260620 — Vendite B2B / ingrosso
-- Il produttore (es. forno) vende prodotti finiti a clienti business (bar,
-- ristoranti) a prezzo all'ingrosso, libero per riga. È un canale SEPARATO dal
-- retail (chiusura cassa): NON entra nel sell-through B2C. Scarica comunque lo
-- stock dei prodotti finiti (riusa la causale 'vendita' con nota "B2B · …").
--
-- Anagrafica completa (P.IVA, codice destinatario, indirizzo) → pronta per la
-- fatturazione SDI in una fase 2; in fase 1 c'è solo lo stato 'fatturata' (flag).

create table if not exists public.clienti_b2b (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete cascade not null,
  nome text not null,
  partita_iva text,
  codice_destinatario text,
  pec text,
  indirizzo text,
  cap text,
  citta text,
  provincia text,
  referente text,
  email text,
  telefono text,
  note text,
  attivo boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.vendite_b2b (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete cascade not null,
  sede_id uuid,
  cliente_id uuid references public.clienti_b2b(id) on delete set null,
  data date not null default current_date,
  righe jsonb not null default '[]'::jsonb,           -- [{prodotto, qta, prezzo, totale}]
  totale numeric(10,2) default 0,
  stato text not null default 'consegnata'
    check (stato in ('bozza','consegnata','fatturata','annullata')),
  stock_scaricato boolean default false,
  note text,
  created_at timestamptz default now()
);

alter table public.clienti_b2b enable row level security;
alter table public.vendite_b2b enable row level security;

create policy "clienti_b2b_own" on public.clienti_b2b for all
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));
create policy "vendite_b2b_own" on public.vendite_b2b for all
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create index if not exists idx_clienti_b2b_org on public.clienti_b2b(organization_id);
create index if not exists idx_vendite_b2b_org on public.vendite_b2b(organization_id, data desc);
