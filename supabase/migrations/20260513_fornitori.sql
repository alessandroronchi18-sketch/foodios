-- STEP 3: Gestione Fornitori
-- Run this in Supabase SQL editor

create table if not exists public.fornitori (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete cascade not null,
  nome text not null,
  contatto text,
  email text,
  telefono text,
  note text,
  created_at timestamptz default now()
);

create table if not exists public.ordini_fornitori (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete cascade not null,
  fornitore_id uuid references public.fornitori(id) on delete set null,
  data_ordine date not null default current_date,
  stato text not null default 'bozza' check (stato in ('bozza','inviato','ricevuto','annullato')),
  totale numeric(10,2) default 0,
  note text,
  created_at timestamptz default now()
);

create table if not exists public.righe_ordine (
  id uuid default gen_random_uuid() primary key,
  ordine_id uuid references public.ordini_fornitori(id) on delete cascade not null,
  prodotto text not null,
  quantita numeric(10,3) default 0,
  unita text default 'kg',
  prezzo_unitario numeric(10,4) default 0,
  totale_riga numeric(10,2) default 0
);

-- RLS
alter table public.fornitori enable row level security;
alter table public.ordini_fornitori enable row level security;
alter table public.righe_ordine enable row level security;

create policy "fornitori_own" on public.fornitori for all
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create policy "ordini_own" on public.ordini_fornitori for all
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create policy "righe_own" on public.righe_ordine for all
  using (ordine_id in (
    select id from public.ordini_fornitori
    where organization_id in (select organization_id from public.profiles where id = auth.uid())
  ));

-- Indexes
create index if not exists idx_fornitori_org on public.fornitori(organization_id);
create index if not exists idx_ordini_org on public.ordini_fornitori(organization_id);
create index if not exists idx_ordini_fornitore on public.ordini_fornitori(fornitore_id);
create index if not exists idx_righe_ordine on public.righe_ordine(ordine_id);
