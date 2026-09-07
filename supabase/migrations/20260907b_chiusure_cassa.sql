-- Chiusure di cassa: da blob jsonb in user_data a tabella vera.
--
-- Il problema. Le chiusure vivevano dentro un unico blob jsonb per sede
-- (chiave pasticceria-chiusure-v1), a cui si aggiunge una voce ogni giorno
-- di apertura. E' un registro che cresce per sempre: al 2026-09-07 la sede
-- piu' avanti era a 77 voci per 12 kB, cioe' ~57 kB l'anno per un negozio che
-- chiude tutti i giorni. E quel blob viene scaricato TUTTO INTERO a ogni
-- apertura dell'app, anche solo per guardare la settimana corrente. Il P&L,
-- che somma ricavi e food cost su un intervallo, non poteva usare SQL perche'
-- i numeri non erano in colonne: doveva scorrere l'array in JavaScript.
--
-- E' lo stesso trattamento gia' riservato alla produzione con
-- inventario_produzione (migration 20260626), qui applicato alle chiusure.
--
-- Cosa resta jsonb e perche'. Le righe del venduto e i formati sono il
-- dettaglio di UNA giornata, quindi limitati per costruzione: non crescono nel
-- tempo, crescono al piu' col numero di prodotti a listino. Tenerli come jsonb
-- evita una seconda tabella senza reintrodurre il problema della crescita.
-- I KPI su cui il P&L aggrega diventano invece colonne vere, indicizzate.
--
-- Il backfill e' idempotente: si aggancia a legacy_id, l'identificativo che la
-- voce aveva dentro il blob. Rilanciare la migration non duplica nulla.
--
-- Il blob NON viene cancellato: resta come rete di sicurezza finche' non si e'
-- verificato che i numeri coincidono. La rimozione e' una migration separata.

create table if not exists public.chiusure_cassa (
  id               uuid default gen_random_uuid() primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  sede_id          uuid references public.sedi(id) on delete cascade,
  data             date not null,

  -- KPI: le colonne su cui il P&L aggrega. Vale la pena estrarle perche'
  -- sommarle in SQL su un intervallo e' l'operazione piu' frequente.
  tot_venduto      numeric(12,2) not null default 0,   -- kpi.totV
  tot_foodcost     numeric(12,2) not null default 0,   -- kpi.totFC
  tot_margine      numeric(12,2) not null default 0,   -- kpi.totM
  tot_scarti       numeric(12,2) not null default 0,   -- kpi.totS
  tot_materie      numeric(12,2) not null default 0,   -- kpi.totMP
  scontrino_medio  numeric(12,4),                      -- kpi.avgST

  -- Dettaglio della giornata. Limitato per costruzione, resta jsonb.
  venduto          jsonb not null default '[]'::jsonb,
  formati          jsonb not null default '[]'::jsonb,
  -- Campi non previsti dallo schema: non si perde nulla nel travaso.
  extra            jsonb not null default '{}'::jsonb,

  is_demo          boolean not null default false,
  legacy_id        text,     -- id della voce dentro il vecchio blob

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Una chiusura per sede per giorno. nulls not distinct perche' sede_id puo'
-- essere null (org senza sedi) e in quel caso i null vanno considerati uguali,
-- altrimenti l'unicita' non varrebbe proprio dove serve.
create unique index if not exists uq_chiusure_org_sede_data
  on public.chiusure_cassa (organization_id, sede_id, data) nulls not distinct;

-- L'accesso tipico e' "questa org, queste sedi, questo intervallo di date".
create index if not exists idx_chiusure_org_sede_data
  on public.chiusure_cassa (organization_id, sede_id, data desc);

alter table public.chiusure_cassa enable row level security;

drop policy if exists chiusure_select_org on public.chiusure_cassa;
create policy chiusure_select_org
  on public.chiusure_cassa for select
  using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

-- La chiusura di cassa e' una delle chiavi operative: anche il dipendente deve
-- poterla scrivere, coerentemente con is_chiave_operativa sul vecchio blob.
drop policy if exists chiusure_write_org on public.chiusure_cassa;
create policy chiusure_write_org
  on public.chiusure_cassa for all
  using (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  )
  with check (
    organization_id in (select organization_id from public.profiles where id = auth.uid())
  );

create or replace function public.touch_chiusure_cassa_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;

drop trigger if exists trg_chiusure_touch on public.chiusure_cassa;
create trigger trg_chiusure_touch
  before update on public.chiusure_cassa
  for each row execute function public.touch_chiusure_cassa_updated_at();


-- ── Backfill dal blob ───────────────────────────────────────────────────────
-- Legge ogni elemento dell'array in user_data e ne crea una riga. Le voci
-- senza data vengono saltate: senza data non sono collocabili nel tempo e
-- sarebbero comunque invisibili al P&L.
insert into public.chiusure_cassa (
  organization_id, sede_id, data,
  tot_venduto, tot_foodcost, tot_margine, tot_scarti, tot_materie, scontrino_medio,
  venduto, formati, extra, is_demo, legacy_id
)
select
  u.organization_id,
  u.sede_id,
  (el->>'data')::date,
  coalesce((el->'kpi'->>'totV')::numeric, 0),
  coalesce((el->'kpi'->>'totFC')::numeric, 0),
  coalesce((el->'kpi'->>'totM')::numeric, 0),
  coalesce((el->'kpi'->>'totS')::numeric, 0),
  coalesce((el->'kpi'->>'totMP')::numeric, 0),
  (el->'kpi'->>'avgST')::numeric,
  coalesce(el->'venduto', '[]'::jsonb),
  coalesce(el->'formati', '[]'::jsonb),
  (el - 'data' - 'kpi' - 'venduto' - 'formati' - 'id' - '_demo'),
  coalesce((el->>'_demo')::boolean, false),
  el->>'id'
from public.user_data u
cross join lateral jsonb_array_elements(u.data_value) as el
where u.data_key = 'pasticceria-chiusure-v1'
  and jsonb_typeof(u.data_value) = 'array'
  and el->>'data' is not null
  and el->>'data' ~ '^\d{4}-\d{2}-\d{2}'
on conflict (organization_id, sede_id, data) do nothing;


-- ── Aggregazione per il P&L ─────────────────────────────────────────────────
-- Somma ricavi, food cost e giorni su un intervallo, opzionalmente su un
-- sottoinsieme di sedi. Sostituisce il ciclo JavaScript su tutto l'array.
-- SECURITY INVOKER: la RLS della tabella si applica al chiamante.
create or replace function public.chiusure_kpi_periodo(
  p_org_id    uuid,
  p_sede_ids  uuid[],
  p_data_from date,
  p_data_to   date
)
returns table (
  ricavi    numeric,
  foodcost  numeric,
  margine   numeric,
  scarti    numeric,
  giorni    bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(c.tot_venduto), 0),
    coalesce(sum(c.tot_foodcost), 0),
    coalesce(sum(c.tot_margine), 0),
    coalesce(sum(c.tot_scarti), 0),
    count(*)
  from public.chiusure_cassa c
  where c.organization_id = p_org_id
    and (p_sede_ids is null or c.sede_id = any(p_sede_ids))
    and c.data >= p_data_from
    and c.data <= p_data_to;
$$;

grant execute on function public.chiusure_kpi_periodo(uuid, uuid[], date, date) to anon, authenticated;

comment on table public.chiusure_cassa is
'Chiusure di cassa, una riga per sede/giorno. Sostituisce il blob pasticceria-chiusure-v1, che cresceva senza limite e veniva scaricato intero a ogni apertura dell''app.';
