-- ══════════════════════════════════════════════════════════════════════════════
-- FoodOS — Script SQL completo per Supabase
-- Esegui nell'SQL Editor del tuo progetto Supabase (una volta sola)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── TABELLA: organizations ──────────────────────────────────────────────────
create table public.organizations (
  id            uuid default gen_random_uuid() primary key,
  nome          text not null,
  tipo          text default 'pasticceria',
  piano         text default 'trial',
  trial_ends_at timestamptz default (now() + interval '90 days'),
  approvato     boolean default false,
  attivo        boolean default true,
  created_at    timestamptz default now()
);

-- ── TABELLA: sedi ────────────────────────────────────────────────────────────
create table public.sedi (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete cascade not null,
  nome            text not null,
  indirizzo       text,
  citta           text default 'Torino',
  is_default      boolean default false,
  attiva          boolean default true,
  created_at      timestamptz default now()
);

-- ── TABELLA: profiles ────────────────────────────────────────────────────────
create table public.profiles (
  id              uuid references auth.users(id) on delete cascade primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  email           text not null,
  nome_completo   text,
  ruolo           text default 'titolare',
  approvato       boolean default false,
  created_at      timestamptz default now()
);

-- ── TABELLA: user_data ───────────────────────────────────────────────────────
create table public.user_data (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete cascade not null,
  sede_id         uuid references public.sedi(id) on delete cascade,
  data_key        text not null,
  data_value      jsonb,
  updated_at      timestamptz default now(),
  unique(organization_id, sede_id, data_key)
);

create index on public.user_data(organization_id, sede_id, data_key);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table public.organizations enable row level security;
alter table public.sedi          enable row level security;
alter table public.profiles      enable row level security;
alter table public.user_data     enable row level security;

create policy "org_own" on public.organizations for all
  using (id in (select organization_id from public.profiles where id = auth.uid()));

create policy "sedi_own" on public.sedi for all
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create policy "profile_own" on public.profiles for all
  using (id = auth.uid() or
    (organization_id in (select organization_id from public.profiles p2
                         where p2.id = auth.uid() and p2.ruolo = 'titolare')));

create policy "data_own" on public.user_data for all
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

-- ── TRIGGER: crea org + sede + profilo alla registrazione ───────────────────
create or replace function public.handle_new_user()
returns trigger as $$
declare
  new_org_id  uuid;
  new_sede_id uuid;
  nome_attivita text;
  tipo_attivita text;
  nome_citta    text;
begin
  nome_attivita := coalesce(new.raw_user_meta_data->>'nome_attivita', 'La mia attività');
  tipo_attivita := coalesce(new.raw_user_meta_data->>'tipo_attivita', 'bar');
  nome_citta    := coalesce(new.raw_user_meta_data->>'citta', 'Torino');

  insert into public.organizations (nome, tipo)
  values (nome_attivita, tipo_attivita)
  returning id into new_org_id;

  insert into public.sedi (organization_id, nome, citta, is_default)
  values (new_org_id, 'Sede principale', nome_citta, true)
  returning id into new_sede_id;

  insert into public.profiles (id, organization_id, email, nome_completo, ruolo)
  values (
    new.id,
    new_org_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome_completo', ''),
    'titolare'
  );

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── VISTA ADMIN ──────────────────────────────────────────────────────────────
create or replace view public.admin_overview as
select
  o.id            as org_id,
  o.nome          as nome_attivita,
  o.tipo,
  o.piano,
  o.approvato     as org_approvata,
  o.trial_ends_at,
  o.created_at    as registrata_il,
  p.email,
  p.nome_completo,
  p.approvato     as utente_approvato,
  (select count(*) from public.sedi s    where s.organization_id = o.id) as num_sedi,
  (select count(*) from public.user_data d where d.organization_id = o.id) as num_record
from public.organizations o
join public.profiles p on p.organization_id = o.id and p.ruolo = 'titolare';

-- La view admin_overview è accessibile solo tramite la service_role key (usata dalla Edge Function /api/admin)
-- Con la anon key + RLS, ogni utente vede solo la propria org
