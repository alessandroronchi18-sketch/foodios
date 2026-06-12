-- ===========================================================================
-- COSTI AZIENDALI (P&L extra-food)
--
-- Costi che il proprietario inserisce manualmente, non legati direttamente
-- al food cost delle ricette:
--   - Consumabili di vendita (fazzoletti, coppette, palette, sacchetti)
--   - Manutenzione (vetrina, condizionatori, banco frigo)
--   - Ammortamenti (impianti, mobili, attrezzature)
--   - Utenze (energia, gas, acqua) se non gestite altrove
--   - Affitti, assicurazioni, commercialista, software
--
-- Periodicita': mensile (default) | annuale | una_tantum.
-- I valori annuali vengono divisi per 12 nel calcolo P&L mensile.
-- I una_tantum sono spalmati su 12 mesi a partire dalla data inserita
-- (semplificazione: l'utente puo' anche scegliere di non spalmarli).
-- ===========================================================================

create table if not exists public.costi_aziendali (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sede_id         uuid references public.sedi(id) on delete cascade,
  categoria       text not null,
  voce            text not null,
  importo         numeric(12,2) not null default 0,
  periodicita     text not null default 'mensile',
  data_inizio     date,
  note            text,
  attivo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint costi_periodicita_check
    check (periodicita in ('mensile','annuale','una_tantum'))
);

create index if not exists idx_costi_aziendali_org
  on public.costi_aziendali (organization_id, attivo);

create index if not exists idx_costi_aziendali_sede
  on public.costi_aziendali (sede_id, attivo)
  where sede_id is not null;

create or replace function public.touch_costi_aziendali_updated_at()
returns trigger as $fn$
begin
  new.updated_at := now();
  return new;
end
$fn$ language plpgsql;

drop trigger if exists trg_costi_aziendali_touch on public.costi_aziendali;

create trigger trg_costi_aziendali_touch
  before update on public.costi_aziendali
  for each row execute function public.touch_costi_aziendali_updated_at();

alter table public.costi_aziendali enable row level security;

drop policy if exists "costi_az_select_org" on public.costi_aziendali;

create policy "costi_az_select_org"
  on public.costi_aziendali for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "costi_az_write_org" on public.costi_aziendali;

create policy "costi_az_write_org"
  on public.costi_aziendali for all
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

grant select, insert, update, delete on public.costi_aziendali to authenticated;

comment on table public.costi_aziendali is
  'Costi extra-food (consumabili, manutenzione, ammortamenti, utenze) per P&L';
