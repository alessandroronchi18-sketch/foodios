-- ===========================================================================
-- INVENTARIO PRODUZIONE (metodo differenziale)
--
-- Nuovo metodo di registrazione produzione per business "gusti -> formati"
-- (gelaterie, yogurterie, pasta fresca, panifici). Il dipendente NON registra
-- "cosa ha venduto" (impossibile leggerlo dallo scontrino che dice "cono
-- piccolo" senza specificare il gusto): registra solo
--   - PROD: quanti grammi di un gusto ha prodotto nel giorno
--   - RIMAN: quanti grammi sono rimasti a fine giornata
-- Il sistema calcola il VENDUTO per differenza:
--   venduto(N) = riman(N-1) + prod(N) - riman(N) - scarto(N)
--
-- La cassa resta SOLO come check incrociato: kg venduti dall inventario
-- moltiplicato per euro/kg medio dei formati = ricavo atteso.
--
-- Si attiva PER-SEDE (non per-org): un proprietario puo avere una sede
-- "laboratorio" con metodo inventario, e altre sedi "punto vendita" che
-- ricevono via trasferimenti col metodo classico.
-- ===========================================================================

-- 1. Estensione tabella sedi
-- is_sede_produzione: TRUE se la sede produce in proprio.
-- metodo_produzione: stampi (metodo attuale) | inventario (differenziale).

alter table public.sedi
  add column if not exists is_sede_produzione boolean not null default false;

alter table public.sedi
  add column if not exists metodo_produzione text not null default 'stampi';

alter table public.sedi
  drop constraint if exists sedi_metodo_produzione_check;

alter table public.sedi
  add constraint sedi_metodo_produzione_check
  check (metodo_produzione in ('stampi','inventario'));

-- 2. Tabella inventario_produzione
-- Una riga per ogni (sede, gusto, data). Il "gusto" e identificato per nome
-- (UPPER + trim) cosi non dipendiamo da un id ricetta che potrebbe cambiare
-- quando l utente rinomina (stesso pattern di stock_prodotti_finiti).

create table if not exists public.inventario_produzione (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sede_id         uuid not null references public.sedi(id) on delete cascade,
  gusto_nome      text not null,
  data            date not null,
  produzione_g    integer not null default 0,
  rimanenza_g     integer not null default 0,
  scarto_g        integer not null default 0,
  note            text,
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint inv_prod_prod_nonneg    check (produzione_g >= 0),
  constraint inv_prod_riman_nonneg   check (rimanenza_g >= 0),
  constraint inv_prod_scarto_nonneg  check (scarto_g >= 0),
  constraint inv_prod_unique_riga    unique (organization_id, sede_id, gusto_nome, data)
);

create index if not exists idx_inv_prod_sede_data
  on public.inventario_produzione (sede_id, data desc);

create index if not exists idx_inv_prod_gusto
  on public.inventario_produzione (organization_id, gusto_nome, data desc);

-- Touch automatico updated_at su update.
create or replace function public.touch_inventario_produzione_updated_at()
returns trigger as $fn$
begin
  new.updated_at := now();
  return new;
end
$fn$ language plpgsql;

drop trigger if exists trg_inv_prod_touch on public.inventario_produzione;

create trigger trg_inv_prod_touch
  before update on public.inventario_produzione
  for each row execute function public.touch_inventario_produzione_updated_at();

-- 3. Funzione: venduto giornaliero per (sede, gusto, data)
-- venduto(N) = rimanenza(N-1) + produzione(N) - rimanenza(N) - scarto(N)
-- Ritorna NULL se non c e dato per il giorno target.
create or replace function public.inventario_venduto_giornaliero(
  p_sede uuid, p_gusto text, p_data date
) returns integer as $fn$
declare
  v_rim_prev integer;
  v_curr     record;
begin
  select coalesce(rimanenza_g, 0) into v_rim_prev
    from public.inventario_produzione
    where sede_id = p_sede
      and gusto_nome = p_gusto
      and data = p_data - interval '1 day';

  select produzione_g, rimanenza_g, scarto_g into v_curr
    from public.inventario_produzione
    where sede_id = p_sede
      and gusto_nome = p_gusto
      and data = p_data;

  if v_curr is null then return null; end if;
  return coalesce(v_rim_prev, 0)
       + coalesce(v_curr.produzione_g, 0)
       - coalesce(v_curr.rimanenza_g, 0)
       - coalesce(v_curr.scarto_g, 0);
end
$fn$ language plpgsql stable;

-- 4. RLS organization-scoped (zero accesso cross-tenant).
alter table public.inventario_produzione enable row level security;

drop policy if exists "inv_prod_select_org" on public.inventario_produzione;

create policy "inv_prod_select_org"
  on public.inventario_produzione for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "inv_prod_write_org" on public.inventario_produzione;

create policy "inv_prod_write_org"
  on public.inventario_produzione for all
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

grant select, insert, update, delete on public.inventario_produzione to authenticated;

comment on table public.inventario_produzione is
  'Metodo produzione inventario differenziale: PROD/RIMAN giornaliero per gusto.';
