-- Step 1: tabella integrazioni
create table if not exists public.integrazioni (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete cascade not null,
  tipo text not null,
  config jsonb default '{}',
  attiva boolean default true,
  ultimo_sync timestamptz,
  created_at timestamptz default now()
);

alter table public.integrazioni enable row level security;

create policy "integrazioni_own" on public.integrazioni for all
  using (organization_id in (
    select organization_id from public.profiles where id = auth.uid()
  ));
