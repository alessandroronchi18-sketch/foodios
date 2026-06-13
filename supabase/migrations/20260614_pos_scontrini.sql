-- POS scontrini real-time
-- Tabella che raccoglie scontrini ricevuti via webhook-pos.js da casse
-- italiane (Tilby, RCH, Olivetti, Custom Q3X, Cassa in Cloud, Salvi,
-- Indaco, Polotouch, Eko POS, Wolf, Zucchetti). Cron settimanale aggrega
-- in chiusure_cassa per il P&L.

create table if not exists public.pos_scontrini (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null,
  sede_id uuid,
  provider text not null,
  data date not null,
  ora text,
  numero_scontrino text,
  totale_lordo numeric(10,2) not null,
  iva numeric(10,2) default 0,
  metodo_pagamento text,
  righe jsonb default '[]'::jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.pos_scontrini
  drop constraint if exists pos_scontrini_org_fk;
alter table public.pos_scontrini
  add constraint pos_scontrini_org_fk
  foreign key (organization_id)
  references public.organizations(id) on delete cascade;

alter table public.pos_scontrini
  drop constraint if exists pos_scontrini_sede_fk;
alter table public.pos_scontrini
  add constraint pos_scontrini_sede_fk
  foreign key (sede_id)
  references public.sedi(id) on delete cascade;

alter table public.pos_scontrini
  drop constraint if exists pos_scontrini_provider_check;
alter table public.pos_scontrini
  add constraint pos_scontrini_provider_check
  check (provider in (
    'tilby','cassainCloud','rch','olivetti','custom',
    'salvi','indaco','polotouch','ekopos','wolf','zucchetti'
  ));

create index if not exists idx_pos_scontrini_org_data
  on public.pos_scontrini (organization_id, data desc);

create index if not exists idx_pos_scontrini_sede_data
  on public.pos_scontrini (sede_id, data desc)
  where sede_id is not null;

create unique index if not exists uq_pos_scontrini_dedup
  on public.pos_scontrini (organization_id, provider, data, numero_scontrino)
  where numero_scontrino is not null;

alter table public.pos_scontrini enable row level security;

drop policy if exists pos_scontrini_select_org on public.pos_scontrini;
create policy pos_scontrini_select_org
  on public.pos_scontrini
  for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists pos_scontrini_update_org on public.pos_scontrini;
create policy pos_scontrini_update_org
  on public.pos_scontrini
  for update
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

drop policy if exists pos_scontrini_delete_org on public.pos_scontrini;
create policy pos_scontrini_delete_org
  on public.pos_scontrini
  for delete
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

grant select, update, delete on public.pos_scontrini to authenticated;
-- Insert solo via service role (api/webhook-pos.js).
