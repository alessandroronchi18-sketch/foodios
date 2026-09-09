-- Baseline delle tabelle core, 09/09/2026.
--
-- Perché esiste: nove tabelle esistevano SOLO nel database di produzione, senza
-- nessun `create table` fra le migration. Erano proprio le più usate dal
-- codice: organizations (33 file), user_data (22), profiles (19), sedi (17),
-- fatture (13), più login_attempts, note_giornaliere, sync_log e
-- benchmarks_anonimi. Le migration successive facevano `alter table ... add
-- column` su tabelle che, per chi partiva da zero, non c'erano.
--
-- Conseguenze concrete: un ambiente nuovo (staging, un secondo sviluppatore, il
-- ripristino dopo un guasto) non era ricostruibile dal repository. E nessun
-- controllo automatico poteva sapere quali colonne esistono: il 09/09 un
-- censimento ha trovato dieci query che chiedevano colonne inesistenti
-- (importo_lordo, fornitore_nome, iva, importo, data_emissione) in sei file,
-- ognuna delle quali riceveva `data: null` e dava un verdetto su zero righe.
--
-- Questo file descrive le tabelle come sono in produzione oggi. È idempotente
-- (`if not exists` su tutto) e NON tocca i dati: su un database esistente non
-- cambia nulla, su uno nuovo lo mette in pari. Le policy RLS restano nelle loro
-- migration, che girano dopo questa.
--
-- Generato dallo schema di produzione e riletto a mano.

create table if not exists public.organizations (
  id uuid not null default gen_random_uuid(),
  nome text not null,
  tipo text default 'pasticceria'::text,
  piano text default 'trial'::text,
  trial_ends_at timestamptz default (now() + '90 days'::interval),
  approvato boolean default false,
  attivo boolean default true,
  created_at timestamptz default now(),
  nome_attivita text,
  referral_code_usato text,
  mesi_bonus integer not null default 0,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_status text,
  stripe_current_period_end timestamptz,
  telefono_whatsapp text,
  note_admin text,
  ragione_sociale text,
  partita_iva text,
  codice_fiscale text,
  codice_destinatario text,
  pec text,
  indirizzo text,
  cap text,
  citta text,
  provincia text,
  nazione text default 'IT'::text,
  business_info_updated_at timestamptz,
  slug text,
  in_attesa boolean not null default false,
  approvato_il timestamptz,
  approvato_da text,
  deleted_at timestamptz,
  deletion_reason text,
  deletion_feedback text,
  metodo_produzione text not null default 'stampi'::text,
  giorni_chiusura text[] not null default '{}'::smallint[]
);

create table if not exists public.profiles (
  id uuid not null,
  organization_id uuid,
  email text not null,
  nome_completo text,
  ruolo text default 'titolare'::text,
  approvato boolean default false,
  created_at timestamptz default now(),
  dipendente_codice_set_at timestamptz,
  dipendente_last_login_at timestamptz,
  dipendente_last_login_ip text,
  is_laboratorio_account boolean default false,
  laboratorio_sede_id uuid
);

create table if not exists public.sedi (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  nome text not null,
  indirizzo text,
  citta text default 'Torino'::text,
  is_default boolean default false,
  attiva boolean default true,
  created_at timestamptz default now(),
  is_sede_produzione boolean not null default false,
  metodo_produzione text not null default 'stampi'::text
);

create table if not exists public.user_data (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  sede_id uuid,
  data_key text not null,
  data_value jsonb,
  updated_at timestamptz default now(),
  version integer not null default 0
);

create table if not exists public.fatture (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  sede_id uuid,
  numero_rif text,
  data_fattura date,
  data_rif date,
  fornitore text not null,
  totale numeric(10,2) default 0,
  imponibile numeric(10,2),
  imposta numeric(10,2),
  stato text default 'da_pagare'::text,
  data_pagamento date,
  note text,
  created_at timestamptz default now(),
  data_scadenza date,
  tipo text not null default 'fattura'::text,
  metodo_pagamento text,
  importo_pagato numeric not null default 0,
  iban text,
  piva text,
  cf text,
  allegato_url text
);

create table if not exists public.note_giornaliere (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  sede_id uuid,
  data date not null,
  nota text,
  created_at timestamptz default now(),
  chiuso boolean not null default false
);

create table if not exists public.login_attempts (
  id uuid not null default gen_random_uuid(),
  email text not null,
  success boolean not null,
  ip text,
  country text,
  user_agent text,
  created_at timestamptz default now()
);

create table if not exists public.sync_log (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  integrazione text not null,
  stato text not null,
  records_importati integer default 0,
  errore text,
  created_at timestamptz default now()
);

create table if not exists public.benchmarks_anonimi (
  id uuid not null default gen_random_uuid(),
  org_hash text not null,
  tipo_attivita text not null,
  citta text,
  food_cost_pct numeric(5,2) not null,
  anno_mese text not null,
  updated_at timestamptz default now()
);

-- ── Chiavi e vincoli ────────────────────────────────────────────────────────
-- Su un database che ha già queste tabelle i comandi sotto non fanno nulla
-- (il blocco cattura l'errore di vincolo già presente).
do $$ begin
  alter table public.benchmarks_anonimi add constraint benchmarks_anonimi_org_hash_key UNIQUE (org_hash);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.benchmarks_anonimi add constraint benchmarks_anonimi_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.fatture add constraint fatture_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.fatture add constraint fatture_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.fatture add constraint fatture_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES sedi(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.login_attempts add constraint login_attempts_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.note_giornaliere add constraint note_giornaliere_organization_id_sede_id_data_key UNIQUE (organization_id, sede_id, data);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.note_giornaliere add constraint note_giornaliere_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.note_giornaliere add constraint note_giornaliere_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.note_giornaliere add constraint note_giornaliere_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES sedi(id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.organizations add constraint organizations_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_laboratorio_sede_id_fkey FOREIGN KEY (laboratorio_sede_id) REFERENCES sedi(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.sedi add constraint sedi_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.sedi add constraint sedi_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.sync_log add constraint sync_log_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.sync_log add constraint sync_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.user_data add constraint user_data_org_sede_key_unique UNIQUE NULLS NOT DISTINCT (organization_id, sede_id, data_key);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.user_data add constraint user_data_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.user_data add constraint user_data_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table public.user_data add constraint user_data_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES sedi(id) ON DELETE RESTRICT;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;

