-- STEP 4: Costo del Lavoro / Personale
-- Run this in Supabase SQL editor

create table if not exists public.dipendenti (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete cascade not null,
  nome text not null,
  ruolo text,
  tipo_contratto text default 'Full-time',
  costo_orario numeric(8,2) default 0,
  ore_settimana numeric(5,1) default 40,
  note text,
  attivo boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.turni (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete cascade not null,
  dipendente_id uuid references public.dipendenti(id) on delete cascade not null,
  data date not null,
  ora_inizio time not null,
  ora_fine time not null,
  ore numeric(5,2) default 0,
  costo numeric(8,2) default 0,
  note text,
  created_at timestamptz default now()
);

-- RLS
alter table public.dipendenti enable row level security;
alter table public.turni enable row level security;

create policy "dipendenti_own" on public.dipendenti for all
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create policy "turni_own" on public.turni for all
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

-- Indexes
create index if not exists idx_dipendenti_org on public.dipendenti(organization_id);
create index if not exists idx_turni_org on public.turni(organization_id);
create index if not exists idx_turni_data on public.turni(data);
create index if not exists idx_turni_dip on public.turni(dipendente_id);
