-- Tabella notifiche in-app
create table if not exists public.notifiche (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete cascade not null,
  tipo text not null,
  titolo text not null,
  messaggio text,
  letta boolean default false,
  link text,
  created_at timestamptz default now()
);

alter table public.notifiche enable row level security;

create policy "notifiche_own" on public.notifiche for all
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

-- Bucket Storage per i report mensili
-- Eseguire via Supabase dashboard o CLI:
-- supabase storage create reports
-- La policy si configura dal dashboard:
--   Bucket: reports
--   Policy: ogni org vede solo i propri report (path: {organization_id}/*)
