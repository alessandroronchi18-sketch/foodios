alter table public.organizations add column if not exists stripe_customer_id text;
alter table public.organizations add column if not exists stripe_subscription_id text;
alter table public.organizations add column if not exists stripe_status text;
alter table public.organizations add column if not exists stripe_current_period_end timestamptz;
alter table public.organizations add column if not exists telefono_whatsapp text;

create unique index if not exists idx_org_stripe_customer
  on public.organizations(stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists idx_org_stripe_subscription
  on public.organizations(stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists public.haccp_apparecchi (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sede_id uuid references public.sedi(id) on delete set null,
  nome text not null,
  tipo text not null default 'frigo',
  temp_min numeric(5,2) not null default 0,
  temp_max numeric(5,2) not null default 8,
  attivo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_haccp_app_org on public.haccp_apparecchi(organization_id);
create index if not exists idx_haccp_app_sede on public.haccp_apparecchi(sede_id);

create table if not exists public.haccp_temperature (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sede_id uuid references public.sedi(id) on delete set null,
  apparecchio_id uuid not null references public.haccp_apparecchi(id) on delete cascade,
  temperatura numeric(5,2) not null,
  rilevato_at timestamptz not null default now(),
  operatore text,
  fuori_range boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_haccp_temp_org on public.haccp_temperature(organization_id);
create index if not exists idx_haccp_temp_sede on public.haccp_temperature(sede_id);
create index if not exists idx_haccp_temp_app on public.haccp_temperature(apparecchio_id);
create index if not exists idx_haccp_temp_data on public.haccp_temperature(rilevato_at);

create table if not exists public.haccp_checklist_template (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sede_id uuid references public.sedi(id) on delete set null,
  nome text not null,
  frequenza text not null default 'giornaliera',
  ordine int not null default 0,
  attivo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_haccp_chkt_org on public.haccp_checklist_template(organization_id);

create table if not exists public.haccp_checklist_log (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sede_id uuid references public.sedi(id) on delete set null,
  template_id uuid not null references public.haccp_checklist_template(id) on delete cascade,
  eseguito_at timestamptz not null default now(),
  operatore text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_haccp_chkl_org on public.haccp_checklist_log(organization_id);
create index if not exists idx_haccp_chkl_sede on public.haccp_checklist_log(sede_id);
create index if not exists idx_haccp_chkl_tmpl on public.haccp_checklist_log(template_id);
create index if not exists idx_haccp_chkl_data on public.haccp_checklist_log(eseguito_at);

alter table public.haccp_apparecchi enable row level security;
alter table public.haccp_temperature enable row level security;
alter table public.haccp_checklist_template enable row level security;
alter table public.haccp_checklist_log enable row level security;

drop policy if exists haccp_app_own on public.haccp_apparecchi;
create policy haccp_app_own on public.haccp_apparecchi
  for all
  using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

drop policy if exists haccp_temp_own on public.haccp_temperature;
create policy haccp_temp_own on public.haccp_temperature
  for all
  using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

drop policy if exists haccp_chkt_own on public.haccp_checklist_template;
create policy haccp_chkt_own on public.haccp_checklist_template
  for all
  using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

drop policy if exists haccp_chkl_own on public.haccp_checklist_log;
create policy haccp_chkl_own on public.haccp_checklist_log
  for all
  using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());
