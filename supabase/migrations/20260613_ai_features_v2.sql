-- ===========================================================================
-- AI FEATURES v2 (Gruppo 1-4 roadmap implementazione)
--
-- Tabelle per feature A2-A7 + B1-B9 + C1-C7 (escluso B5 HACCP, in coda).
-- Tutte hanno RLS multi-tenant via organization_id + policy standard.
--
-- Formato verticale, righe corte, CHECK separati (lesson learned 12 giu).
-- ===========================================================================

-- ---------- A7: OCR fatture in entrata ------------------------------------
create table if not exists public.extracted_invoices (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid not null,
  sede_id         uuid,
  raw_file_url    text,
  fornitore_nome  text,
  fornitore_piva  text,
  data_emissione  date,
  data_scadenza   date,
  importo_lordo   numeric(12,2),
  importo_netto   numeric(12,2),
  importo_iva     numeric(12,2),
  numero_fattura  text,
  categoria       text,
  righe           jsonb default '[]'::jsonb not null,
  confidence      numeric(3,2),
  reviewed        boolean default false not null,
  fattura_id      uuid,
  created_at      timestamptz not null default now()
);

alter table public.extracted_invoices
  drop constraint if exists extracted_invoices_org_fk;
alter table public.extracted_invoices
  add constraint extracted_invoices_org_fk
  foreign key (organization_id)
  references public.organizations(id) on delete cascade;

create index if not exists idx_extracted_inv_org
  on public.extracted_invoices (organization_id, created_at desc);

alter table public.extracted_invoices enable row level security;

drop policy if exists extracted_inv_all_org on public.extracted_invoices;
create policy extracted_inv_all_org
  on public.extracted_invoices
  for all
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

grant select, insert, update, delete
  on public.extracted_invoices to authenticated;

-- ---------- B1: Forecast giornaliero per prodotto -------------------------
create table if not exists public.forecast_giornaliero (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid not null,
  sede_id         uuid,
  prodotto        text not null,
  data            date not null,
  qta_prevista    numeric(10,2) not null default 0,
  qta_min         numeric(10,2),
  qta_max         numeric(10,2),
  confidence      numeric(3,2),
  fattori         jsonb default '{}'::jsonb not null,
  created_at      timestamptz not null default now()
);

alter table public.forecast_giornaliero
  drop constraint if exists forecast_org_fk;
alter table public.forecast_giornaliero
  add constraint forecast_org_fk
  foreign key (organization_id)
  references public.organizations(id) on delete cascade;

-- UNIQUE diretta su 4 campi (Postgres considera NULL distinti, ok per noi
-- perche sede_id e sempre valorizzato dal cron forecast).
create unique index if not exists uq_forecast_per_prod_data
  on public.forecast_giornaliero (
    organization_id, sede_id, prodotto, data
  );

create index if not exists idx_forecast_org_data
  on public.forecast_giornaliero (organization_id, data desc);

alter table public.forecast_giornaliero enable row level security;

drop policy if exists forecast_select_org on public.forecast_giornaliero;
create policy forecast_select_org
  on public.forecast_giornaliero
  for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

grant select on public.forecast_giornaliero to authenticated;

-- ---------- B7: Cashflow eventi pianificati -------------------------------
create table if not exists public.cashflow_eventi (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid not null,
  sede_id         uuid,
  tipo            text not null,
  descrizione     text,
  data_attesa     date not null,
  importo         numeric(12,2) not null,
  ricorrenza      text,
  stato           text default 'pianificato' not null,
  created_at      timestamptz not null default now()
);

alter table public.cashflow_eventi
  drop constraint if exists cashflow_org_fk;
alter table public.cashflow_eventi
  add constraint cashflow_org_fk
  foreign key (organization_id)
  references public.organizations(id) on delete cascade;

alter table public.cashflow_eventi
  drop constraint if exists cashflow_tipo_check;
alter table public.cashflow_eventi
  add constraint cashflow_tipo_check
  check (tipo in ('entrata','uscita','stipendio','iva','affitto','altro'));

alter table public.cashflow_eventi
  drop constraint if exists cashflow_stato_check;
alter table public.cashflow_eventi
  add constraint cashflow_stato_check
  check (stato in ('pianificato','realizzato','annullato'));

create index if not exists idx_cashflow_org_data
  on public.cashflow_eventi (organization_id, data_attesa);

alter table public.cashflow_eventi enable row level security;

drop policy if exists cashflow_all_org on public.cashflow_eventi;
create policy cashflow_all_org
  on public.cashflow_eventi
  for all
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

grant select, insert, update, delete
  on public.cashflow_eventi to authenticated;

-- ---------- B9: Pricing competitor scrape ---------------------------------
create table if not exists public.competitor_prices (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid not null,
  sede_id         uuid,
  competitor_nome text not null,
  prodotto        text not null,
  prezzo          numeric(10,2),
  source_url      text,
  distance_km     numeric(5,2),
  scraped_at      timestamptz not null default now()
);

alter table public.competitor_prices
  drop constraint if exists comp_prices_org_fk;
alter table public.competitor_prices
  add constraint comp_prices_org_fk
  foreign key (organization_id)
  references public.organizations(id) on delete cascade;

create index if not exists idx_comp_prices_org
  on public.competitor_prices (organization_id, scraped_at desc);

alter table public.competitor_prices enable row level security;

drop policy if exists comp_prices_select_org on public.competitor_prices;
create policy comp_prices_select_org
  on public.competitor_prices
  for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists comp_prices_write_org on public.competitor_prices;
create policy comp_prices_write_org
  on public.competitor_prices
  for all
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

grant select, insert, update, delete on public.competitor_prices to authenticated;

-- ---------- C1: FoodOS Brain conversations --------------------------------
create table if not exists public.brain_conversations (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid not null,
  user_id         uuid not null,
  titolo          text,
  messages        jsonb default '[]'::jsonb not null,
  ultimo_messaggio_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

alter table public.brain_conversations
  drop constraint if exists brain_org_fk;
alter table public.brain_conversations
  add constraint brain_org_fk
  foreign key (organization_id)
  references public.organizations(id) on delete cascade;

create index if not exists idx_brain_org_recent
  on public.brain_conversations (organization_id, ultimo_messaggio_at desc);

alter table public.brain_conversations enable row level security;

drop policy if exists brain_all_org on public.brain_conversations;
create policy brain_all_org
  on public.brain_conversations
  for all
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

grant select, insert, update, delete
  on public.brain_conversations to authenticated;

-- ---------- C2: WhatsApp link account -------------------------------------
create table if not exists public.whatsapp_links (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid not null,
  user_id         uuid not null,
  phone_number    text not null,
  attivo          boolean default true not null,
  verificato_at   timestamptz,
  ultimo_messaggio_at timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.whatsapp_links
  drop constraint if exists wa_org_fk;
alter table public.whatsapp_links
  add constraint wa_org_fk
  foreign key (organization_id)
  references public.organizations(id) on delete cascade;

create unique index if not exists uq_wa_phone
  on public.whatsapp_links (phone_number);

create index if not exists idx_wa_org
  on public.whatsapp_links (organization_id, attivo);

alter table public.whatsapp_links enable row level security;

drop policy if exists wa_all_org on public.whatsapp_links;
create policy wa_all_org
  on public.whatsapp_links
  for all
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

grant select, insert, update, delete
  on public.whatsapp_links to authenticated;

-- ---------- C3: Recipe Inventor history -----------------------------------
create table if not exists public.recipe_inventions (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid not null,
  user_id         uuid,
  prompt          jsonb default '{}'::jsonb not null,
  ricette         jsonb default '[]'::jsonb not null,
  salvate_ricettario_ids jsonb default '[]'::jsonb not null,
  created_at      timestamptz not null default now()
);

alter table public.recipe_inventions
  drop constraint if exists rec_inv_org_fk;
alter table public.recipe_inventions
  add constraint rec_inv_org_fk
  foreign key (organization_id)
  references public.organizations(id) on delete cascade;

create index if not exists idx_rec_inv_org
  on public.recipe_inventions (organization_id, created_at desc);

alter table public.recipe_inventions enable row level security;

drop policy if exists rec_inv_all_org on public.recipe_inventions;
create policy rec_inv_all_org
  on public.recipe_inventions
  for all
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

grant select, insert, update, delete
  on public.recipe_inventions to authenticated;

-- ---------- C4: Marketplace fornitori (seed pubblico, no org scope) -------
create table if not exists public.marketplace_listings (
  id              uuid default gen_random_uuid() primary key,
  fornitore_nome  text not null,
  prodotto        text not null,
  categoria       text,
  prezzo_medio    numeric(10,2),
  unita           text default 'kg',
  moq             numeric(10,2),
  lead_time_gg    int,
  rating          numeric(3,2),
  recensioni_n    int default 0,
  zona_servita    text,
  contatto_email  text,
  contatto_tel    text,
  attivo          boolean default true not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_mkt_categoria
  on public.marketplace_listings (categoria, attivo);

create index if not exists idx_mkt_prodotto
  on public.marketplace_listings (prodotto);

alter table public.marketplace_listings enable row level security;

drop policy if exists mkt_public_read on public.marketplace_listings;
create policy mkt_public_read
  on public.marketplace_listings
  for select
  using (attivo = true);

grant select on public.marketplace_listings to authenticated;

-- ---------- C7: Documentary snapshots (trimestrale) -----------------------
create table if not exists public.documentary_snapshots (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid not null,
  periodo         text not null,
  data_inizio     date,
  data_fine       date,
  contenuto       jsonb default '{}'::jsonb not null,
  shareable_slug  text,
  created_at      timestamptz not null default now()
);

alter table public.documentary_snapshots
  drop constraint if exists doc_snap_org_fk;
alter table public.documentary_snapshots
  add constraint doc_snap_org_fk
  foreign key (organization_id)
  references public.organizations(id) on delete cascade;

create unique index if not exists uq_doc_snap_org_periodo
  on public.documentary_snapshots (organization_id, periodo);

alter table public.documentary_snapshots enable row level security;

drop policy if exists doc_snap_select_org on public.documentary_snapshots;
create policy doc_snap_select_org
  on public.documentary_snapshots
  for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

grant select on public.documentary_snapshots to authenticated;

-- ---------- daily_briefs: aggiungo colonna tipo per A4 settimanale --------
alter table public.daily_briefs
  add column if not exists tipo text default 'giornaliero' not null;

alter table public.daily_briefs
  drop constraint if exists daily_briefs_tipo_check;
alter table public.daily_briefs
  add constraint daily_briefs_tipo_check
  check (tipo in ('giornaliero','settimanale','mensile'));
