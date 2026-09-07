-- Prima nota di cassa: come si registra davvero una giornata.
--
-- Nasce dallo studio del file con cui Mara tiene gli incassi ("INCASSI MARAMA
-- LUGLIO 2026.xlsx"). Quel foglio dice tre cose che il prodotto non sapeva
-- registrare, e sono tre cose che NON valgono solo per loro.
--
-- 1. L'INCASSO SI DIVIDE IN POS E CONTANTI.
--    Il totale da solo non basta: per quadrare il fondocassa a fine giornata
--    serve sapere quanto e' passato dal terminale e quanto e' rimasto in
--    cassetto. Mara lo segna da sempre, per sede: a luglio 39.865 di POS e
--    12.652 di contanti su Berthollet, 41.994 e 16.110 su De Gasperi.
--
-- 2. IL DELIVERY E' UN TERZO CANALE.
--    Non entra nel cassetto ne' dal terminale del negozio: arriva dopo, dalla
--    piattaforma. Sommarlo agli altri due nasconde il fatto che sono soldi con
--    tempi e commissioni diversi.
--
-- 3. LE PICCOLE SPESE DI GIORNATA NON AVEVANO CASA.
--    "limoni 10 euro", "carrefour 11,56", "carta e anguria 18". Foodos aveva
--    solo costi_aziendali, che e' fatto per i costi RICORRENTI mensili —
--    affitto, utenze — con periodicita' e data di inizio. Non per l'acquisto
--    di limoni del 3 luglio.
--
--    E soprattutto Mara annota se la spesa ha la fattura: "(F)" con fattura,
--    "(no F)" senza, "(?)" quando il documento e' dubbio. Non e' una nota
--    personale: e' la distinzione fra spesa documentata e non documentata, che
--    in contabilita' cambia tutto. Diventa un campo vero.

-- ── 1. Incasso scomposto per canale ─────────────────────────────────────────
-- Tutte nullable: chi registra solo il totale continua come prima, e null
-- significa "non lo so", diverso da zero che significa "non e' entrato nulla".
alter table public.chiusure_cassa
  add column if not exists incasso_pos       numeric(12,2),
  add column if not exists incasso_contanti  numeric(12,2),
  add column if not exists incasso_delivery  numeric(12,2);

comment on column public.chiusure_cassa.incasso_pos is
'Incassato da terminale POS. Null = non rilevato, diverso da 0 = nessun pagamento con carta.';
comment on column public.chiusure_cassa.incasso_contanti is
'Incassato in contanti, quello che resta nel cassetto. Serve a quadrare il fondocassa.';
comment on column public.chiusure_cassa.incasso_delivery is
'Incassato via piattaforme di consegna. Canale separato: arriva dopo e con commissioni proprie.';


-- ── 2. Uscite di cassa: la prima nota ───────────────────────────────────────
create table if not exists public.movimenti_cassa (
  id               uuid default gen_random_uuid() primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  sede_id          uuid references public.sedi(id) on delete cascade,
  data             date not null,
  importo          numeric(12,2) not null,
  descrizione      text not null,

  -- Il cuore della notazione di Mara, reso esplicito.
  --   'fattura' → (F)    spesa documentata
  --   'senza'   → (no F) spesa non documentata
  --   'incerto' → (?)    documento da verificare
  documento        text not null default 'incerto'
                   check (documento in ('fattura', 'senza', 'incerto')),

  -- Opzionale: a cosa serviva. Lasciata libera perché nel foglio reale le
  -- voci sono di ogni tipo (frutta, carta, detersivi, fotocopie) e imporre un
  -- elenco chiuso al primo giro produrrebbe solo una categoria "altro" piena.
  categoria        text,
  fornitore        text,
  note             text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint movimenti_cassa_importo_positivo check (importo > 0)
);

-- L'accesso tipico e' "questa org, questa sede, questo mese".
create index if not exists idx_movimenti_cassa_org_sede_data
  on public.movimenti_cassa (organization_id, sede_id, data desc);

alter table public.movimenti_cassa enable row level security;

-- Stessa regola delle chiusure: e' un'operazione di giornata, la fa anche chi
-- sta al banco.
drop policy if exists movimenti_cassa_own on public.movimenti_cassa;
create policy movimenti_cassa_own on public.movimenti_cassa for all
  using      (organization_id in (select organization_id from public.profiles where id = auth.uid()))
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create or replace function public.touch_movimenti_cassa_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;

drop trigger if exists trg_movimenti_cassa_touch on public.movimenti_cassa;
create trigger trg_movimenti_cassa_touch
  before update on public.movimenti_cassa
  for each row execute function public.touch_movimenti_cassa_updated_at();


-- ── 3. Riepilogo di periodo, per il P&L ─────────────────────────────────────
-- Somma le uscite di cassa su un intervallo, separando documentate e non.
-- La distinzione serve: davanti al commercialista le due cifre non pesano
-- uguale.
create or replace function public.movimenti_cassa_periodo(
  p_org_id    uuid,
  p_sede_ids  uuid[],
  p_data_from date,
  p_data_to   date
)
returns table (
  totale            numeric,
  con_fattura       numeric,
  senza_fattura     numeric,
  da_verificare     numeric,
  numero_movimenti  bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(m.importo), 0),
    coalesce(sum(m.importo) filter (where m.documento = 'fattura'), 0),
    coalesce(sum(m.importo) filter (where m.documento = 'senza'), 0),
    coalesce(sum(m.importo) filter (where m.documento = 'incerto'), 0),
    count(*)
  from public.movimenti_cassa m
  where m.organization_id = p_org_id
    and (p_sede_ids is null or m.sede_id = any(p_sede_ids))
    and m.data >= p_data_from
    and m.data <= p_data_to;
$$;

grant execute on function public.movimenti_cassa_periodo(uuid, uuid[], date, date) to anon, authenticated;

comment on table public.movimenti_cassa is
'Uscite di cassa di giornata (prima nota). Diverse da costi_aziendali, che copre i costi ricorrenti mensili. Il campo documento distingue spesa con fattura, senza, o da verificare.';
