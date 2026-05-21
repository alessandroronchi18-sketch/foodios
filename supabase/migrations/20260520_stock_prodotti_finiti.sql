-- ═══════════════════════════════════════════════════════════════════════════
-- MULTI-SEDE STEP 1+2 — File SQL AUTOSUFFICIENTE
--
-- Esegue tutto in ordine corretto senza dipendere da migration precedenti.
-- Idempotente: safe da rieseguire.
--
-- Contenuti:
--   A. Helper get_user_org_id (creato se manca)
--   B. Tabella trasferimenti (con tutte le colonne nuove integrate)
--   C. Tabella stock_prodotti_finiti
--   D. Tabella movimenti_stock_pf (log audit)
--   E. RPC: trasferimento_invia / ricevi / annulla
--   F. RPC: stock_pf_carico_produzione / scarico_vendita / scarto
--   G. Permessi GRANT EXECUTE
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── A. Helper get_user_org_id ─────────────────────────────────────────────
-- Ritorna l'organization_id dell'utente autenticato.
-- SECURITY DEFINER + search_path public per evitare bypass.
create or replace function public.get_user_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

revoke all on function public.get_user_org_id() from public;
grant execute on function public.get_user_org_id() to anon, authenticated;


-- ─── B. Tabella TRASFERIMENTI ──────────────────────────────────────────────
-- Movimenti di stock tra due sedi della stessa organizzazione.
-- Schema completo (include estensioni step 2).
create table if not exists public.trasferimenti (
  id                 uuid default gen_random_uuid() primary key,
  organization_id    uuid references public.organizations(id) on delete cascade not null,
  sede_da            uuid references public.sedi(id) on delete restrict not null,
  sede_a             uuid references public.sedi(id) on delete restrict not null,
  data               date not null default current_date,
  tipo               text not null default 'prodotto'
                       check (tipo in ('prodotto','materia_prima','semilavorato')),
  prodotto           text not null,
  quantita           numeric(12,3) not null default 0,
  unita              text default 'pz',
  valore_unit        numeric(12,4) default 0,
  note               text,
  stato              text not null default 'bozza',
  stock_applicato    boolean not null default false,
  quantita_ricevuta  numeric(12,3),
  scarto_qty         numeric(12,3) not null default 0,
  scarto_note        text,
  data_invio         timestamptz,
  data_ricezione     timestamptz,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  check (sede_da <> sede_a)
);

-- Aggiungi colonne nuove se la tabella esisteva già in versione vecchia.
alter table public.trasferimenti add column if not exists stock_applicato boolean not null default false;
alter table public.trasferimenti add column if not exists quantita_ricevuta numeric(12,3);
alter table public.trasferimenti add column if not exists scarto_qty numeric(12,3) not null default 0;
alter table public.trasferimenti add column if not exists scarto_note text;
alter table public.trasferimenti add column if not exists data_invio timestamptz;
alter table public.trasferimenti add column if not exists data_ricezione timestamptz;

-- Aggiorna constraint stato per supportare 'ricevuto'.
alter table public.trasferimenti drop constraint if exists trasferimenti_stato_check;
alter table public.trasferimenti
  add constraint trasferimenti_stato_check
  check (stato in ('bozza','inviato','ricevuto','completato','annullato'));

create index if not exists idx_trasferimenti_org  on public.trasferimenti(organization_id);
create index if not exists idx_trasferimenti_da   on public.trasferimenti(sede_da);
create index if not exists idx_trasferimenti_a    on public.trasferimenti(sede_a);
create index if not exists idx_trasferimenti_data on public.trasferimenti(data);

alter table public.trasferimenti enable row level security;
drop policy if exists "trasferimenti_own" on public.trasferimenti;
create policy "trasferimenti_own" on public.trasferimenti
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());


-- ─── C. Tabella STOCK_PRODOTTI_FINITI ──────────────────────────────────────
-- Una riga per (organization_id, sede_id, prodotto_nome). UPSERT-friendly.
create table if not exists public.stock_prodotti_finiti (
  id              uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete cascade not null,
  sede_id         uuid references public.sedi(id) on delete cascade not null,
  prodotto_nome   text not null,
  quantita        numeric(14,3) not null default 0,
  unita           text not null default 'pz',
  valore_unit     numeric(12,4) default 0,
  soglia_min      numeric(14,3) default 0,
  updated_at      timestamptz not null default now(),
  unique (organization_id, sede_id, prodotto_nome)
);

create index if not exists idx_stock_pf_org_sede on public.stock_prodotti_finiti(organization_id, sede_id);
create index if not exists idx_stock_pf_prodotto on public.stock_prodotti_finiti(prodotto_nome);

alter table public.stock_prodotti_finiti enable row level security;
drop policy if exists "stock_pf_own" on public.stock_prodotti_finiti;
create policy "stock_pf_own" on public.stock_prodotti_finiti
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());


-- ─── D. Log movimenti stock (audit) ────────────────────────────────────────
create table if not exists public.movimenti_stock_pf (
  id               uuid default gen_random_uuid() primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  sede_id          uuid not null references public.sedi(id) on delete cascade,
  prodotto_nome    text not null,
  delta            numeric(14,3) not null,
  causale          text not null,
  trasferimento_id uuid references public.trasferimenti(id) on delete set null,
  note             text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists idx_mov_stock_pf_org_sede on public.movimenti_stock_pf(organization_id, sede_id);
create index if not exists idx_mov_stock_pf_prodotto on public.movimenti_stock_pf(prodotto_nome);
create index if not exists idx_mov_stock_pf_trasf    on public.movimenti_stock_pf(trasferimento_id);

alter table public.movimenti_stock_pf enable row level security;
drop policy if exists "mov_stock_pf_own" on public.movimenti_stock_pf;
create policy "mov_stock_pf_own" on public.movimenti_stock_pf
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());


-- ─── E. Helper interno: applica delta atomico (upsert) ─────────────────────
create or replace function public.applica_delta_stock_pf(
  p_org uuid,
  p_sede uuid,
  p_prodotto text,
  p_delta numeric,
  p_unita text default 'pz'
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuova numeric;
begin
  insert into public.stock_prodotti_finiti (organization_id, sede_id, prodotto_nome, quantita, unita, updated_at)
  values (p_org, p_sede, p_prodotto, p_delta, coalesce(p_unita, 'pz'), now())
  on conflict (organization_id, sede_id, prodotto_nome)
  do update set
    quantita   = public.stock_prodotti_finiti.quantita + excluded.quantita,
    updated_at = now()
  returning quantita into v_nuova;

  return v_nuova;
end;
$$;


-- ─── F1. RPC: invia un trasferimento (bozza → inviato) ─────────────────────
-- Per tipo='prodotto' verifica disponibilità su sede_da e scala lo stock.
-- Per materia_prima / semilavorato non tocca: gestito client-side.
create or replace function public.trasferimento_invia(p_id uuid)
returns public.trasferimenti
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.trasferimenti;
  v_org uuid;
  v_disponibile numeric;
begin
  select * into v_t from public.trasferimenti where id = p_id;
  if not found then raise exception 'Trasferimento non trovato'; end if;

  v_org := public.get_user_org_id();
  if v_t.organization_id <> v_org then
    raise exception 'Trasferimento non appartiene all''organizzazione corrente';
  end if;

  if v_t.stato not in ('bozza') then
    raise exception 'Stato non valido per invio: %', v_t.stato;
  end if;

  if v_t.quantita <= 0 then
    raise exception 'Quantita deve essere positiva';
  end if;

  if v_t.tipo = 'prodotto' then
    select coalesce(quantita, 0) into v_disponibile
      from public.stock_prodotti_finiti
      where organization_id = v_t.organization_id
        and sede_id = v_t.sede_da
        and prodotto_nome = v_t.prodotto;

    if v_disponibile < v_t.quantita then
      raise exception 'Quantita insufficiente in sede di partenza (disponibile: %, richiesto: %)',
        v_disponibile, v_t.quantita;
    end if;

    perform public.applica_delta_stock_pf(
      v_t.organization_id, v_t.sede_da, v_t.prodotto, -v_t.quantita, v_t.unita
    );

    insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, trasferimento_id)
    values (v_t.organization_id, v_t.sede_da, v_t.prodotto, -v_t.quantita, 'trasferimento_invio', v_t.id);
  end if;

  update public.trasferimenti
    set stato = 'inviato',
        stock_applicato = (v_t.tipo = 'prodotto'),
        data_invio = now()
    where id = p_id
    returning * into v_t;

  return v_t;
end;
$$;


-- ─── F2. RPC: ricevi un trasferimento (inviato → ricevuto) ─────────────────
-- Incrementa sede_a con quantita ricevuta (default = quantita inviata).
-- Permette di registrare scarto se quantita_ricevuta < quantita inviata.
create or replace function public.trasferimento_ricevi(
  p_id uuid,
  p_quantita_ricevuta numeric default null,
  p_scarto_note text default null
)
returns public.trasferimenti
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.trasferimenti;
  v_qty_ric numeric;
  v_scarto numeric;
begin
  select * into v_t from public.trasferimenti where id = p_id;
  if not found then raise exception 'Trasferimento non trovato'; end if;
  if v_t.organization_id <> public.get_user_org_id() then
    raise exception 'Trasferimento non appartiene all''organizzazione corrente';
  end if;

  if v_t.stato not in ('inviato') then
    raise exception 'Stato non valido per ricezione: %', v_t.stato;
  end if;

  v_qty_ric := coalesce(p_quantita_ricevuta, v_t.quantita);
  if v_qty_ric < 0 then raise exception 'Quantita ricevuta negativa'; end if;
  if v_qty_ric > v_t.quantita then
    raise exception 'Quantita ricevuta (%) maggiore di inviata (%)', v_qty_ric, v_t.quantita;
  end if;
  v_scarto := v_t.quantita - v_qty_ric;

  if v_t.tipo = 'prodotto' and v_qty_ric > 0 then
    perform public.applica_delta_stock_pf(
      v_t.organization_id, v_t.sede_a, v_t.prodotto, v_qty_ric, v_t.unita
    );

    insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, trasferimento_id, note)
    values (v_t.organization_id, v_t.sede_a, v_t.prodotto, v_qty_ric, 'trasferimento_ricezione', v_t.id, p_scarto_note);
  end if;

  if v_scarto > 0 and v_t.tipo = 'prodotto' then
    insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, trasferimento_id, note)
    values (v_t.organization_id, v_t.sede_da, v_t.prodotto, 0, 'scarto', v_t.id, p_scarto_note);
  end if;

  update public.trasferimenti
    set stato = 'ricevuto',
        quantita_ricevuta = v_qty_ric,
        scarto_qty = v_scarto,
        scarto_note = p_scarto_note,
        data_ricezione = now()
    where id = p_id
    returning * into v_t;

  return v_t;
end;
$$;


-- ─── F3. RPC: annulla trasferimento (con rollback se applicato) ────────────
create or replace function public.trasferimento_annulla(p_id uuid)
returns public.trasferimenti
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.trasferimenti;
begin
  select * into v_t from public.trasferimenti where id = p_id;
  if not found then raise exception 'Trasferimento non trovato'; end if;
  if v_t.organization_id <> public.get_user_org_id() then
    raise exception 'Trasferimento non appartiene all''organizzazione corrente';
  end if;

  if v_t.stato = 'annullato' then return v_t; end if;
  if v_t.stato = 'ricevuto' then
    raise exception 'Impossibile annullare un trasferimento gia ricevuto. Crea una rettifica.';
  end if;

  if v_t.stato = 'inviato' and v_t.stock_applicato and v_t.tipo = 'prodotto' then
    perform public.applica_delta_stock_pf(
      v_t.organization_id, v_t.sede_da, v_t.prodotto, v_t.quantita, v_t.unita
    );
    insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, trasferimento_id, note)
    values (v_t.organization_id, v_t.sede_da, v_t.prodotto, v_t.quantita, 'annullo_trasferimento', v_t.id, 'Rollback per annullamento');
  end if;

  update public.trasferimenti
    set stato = 'annullato',
        stock_applicato = false
    where id = p_id
    returning * into v_t;

  return v_t;
end;
$$;


-- ─── G1. RPC: carico stock da produzione su sede stessa ────────────────────
create or replace function public.stock_pf_carico_produzione(
  p_sede uuid,
  p_prodotto text,
  p_quantita numeric,
  p_unita text default 'pz',
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.get_user_org_id();
  v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;

  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, p_quantita, p_unita);

  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, p_quantita, 'produzione', p_note);

  return v_nuova;
end;
$$;


-- ─── G2. RPC: scarico per vendita ──────────────────────────────────────────
-- Permette scarico anche oltre il disponibile (si va in negativo → alert UI).
create or replace function public.stock_pf_scarico_vendita(
  p_sede uuid,
  p_prodotto text,
  p_quantita numeric,
  p_unita text default 'pz',
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.get_user_org_id();
  v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;

  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, -p_quantita, p_unita);

  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, -p_quantita, 'vendita', p_note);

  return v_nuova;
end;
$$;


-- ─── G3. RPC: rettifica scarto manuale ─────────────────────────────────────
create or replace function public.stock_pf_scarto(
  p_sede uuid,
  p_prodotto text,
  p_quantita numeric,
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.get_user_org_id();
  v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;

  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, -p_quantita, 'pz');

  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, -p_quantita, 'scarto', p_note);

  return v_nuova;
end;
$$;


-- ─── PERMESSI ──────────────────────────────────────────────────────────────
grant execute on function public.applica_delta_stock_pf(uuid, uuid, text, numeric, text) to authenticated;
grant execute on function public.trasferimento_invia(uuid) to authenticated;
grant execute on function public.trasferimento_ricevi(uuid, numeric, text) to authenticated;
grant execute on function public.trasferimento_annulla(uuid) to authenticated;
grant execute on function public.stock_pf_carico_produzione(uuid, text, numeric, text, text) to authenticated;
grant execute on function public.stock_pf_scarico_vendita(uuid, text, numeric, text, text) to authenticated;
grant execute on function public.stock_pf_scarto(uuid, text, numeric, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA POST-MIGRATION (esegui dopo il blocco principale per controllare)
--
--   -- Tabelle presenti:
--   select table_name from information_schema.tables
--    where table_schema = 'public'
--      and table_name in ('trasferimenti','stock_prodotti_finiti','movimenti_stock_pf');
--   -- 3 righe
--
--   -- Colonne nuove su trasferimenti:
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='trasferimenti'
--      and column_name in ('stock_applicato','quantita_ricevuta','scarto_qty','scarto_note','data_invio','data_ricezione');
--   -- 6 righe
--
--   -- RPC presenti:
--   select proname from pg_proc
--    where proname in ('get_user_org_id','applica_delta_stock_pf','trasferimento_invia',
--                      'trasferimento_ricevi','trasferimento_annulla',
--                      'stock_pf_carico_produzione','stock_pf_scarico_vendita','stock_pf_scarto');
--   -- 8 righe
--
--   -- Conteggi iniziali:
--   select count(*) from public.trasferimenti;          -- 0 (o pre-esistenti)
--   select count(*) from public.stock_prodotti_finiti;  -- 0
--   select count(*) from public.movimenti_stock_pf;     -- 0
-- ═══════════════════════════════════════════════════════════════════════════
