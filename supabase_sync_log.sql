-- Migration: sync_log table per FoodOS Integrazioni
-- Eseguire in Supabase SQL Editor (una volta sola)

create table if not exists public.sync_log (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete cascade not null,
  integrazione text not null,
  stato text not null,
  records_importati integer default 0,
  errore text,
  created_at timestamptz default now()
);

alter table public.sync_log enable row level security;

create policy "sync_log_own" on public.sync_log for all
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

create index if not exists sync_log_org_int_idx
  on public.sync_log (organization_id, integrazione, created_at desc);
