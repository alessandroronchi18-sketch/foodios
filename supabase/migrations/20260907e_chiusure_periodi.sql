-- Giorni di chiusura, modello a periodi.
--
-- La prima versione (20260907d) metteva i giorni di chiusura in un unico array
-- sull'organizzazione: `chiuso il lunedi`, per sempre. Non regge la realta' di
-- un negozio, come fatto notare subito dal design partner:
--
--   - il giorno di chiusura cambia con la stagione (d'estate si apre anche il
--     lunedi, d'inverno no);
--   - ci sono le feste comandate, che non cadono sempre nello stesso giorno
--     della settimana;
--   - ci sono le ferie, che sono un intervallo continuativo, non un giorno;
--   - ci sono le chiusure straordinarie, che non seguono alcuna regola.
--
-- Due tabelle, una per ciascuna forma che una chiusura puo' avere.
--
-- 1. RICORRENTE con validita' nel tempo: "chiuso il lunedi, da ottobre a
--    marzo". Cambiare abitudine non cancella la storia: si chiude il periodo
--    vecchio e se ne apre uno nuovo, cosi' il calendario dei mesi passati resta
--    corretto invece di essere riscritto a posteriori.
--
-- 2. A INTERVALLO: ferie, festivita', chiusure straordinarie. Un solo giorno e'
--    un intervallo che inizia e finisce lo stesso giorno, quindi non serve un
--    terzo meccanismo.
--
-- organizations.giorni_chiusura resta e viene TRAVASATO qui come periodo
-- ricorrente senza scadenza. Non lo cancelliamo in questa migration: prima si
-- verifica sul campo che il nuovo modello funzioni.

-- ── 1. Chiusure ricorrenti, con finestra di validita' ───────────────────────
create table if not exists public.chiusure_ricorrenti (
  id               uuid default gen_random_uuid() primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  sede_id          uuid references public.sedi(id) on delete cascade,   -- null = tutta l'azienda
  giorni           smallint[] not null,      -- ISO: 1 = lunedi ... 7 = domenica
  valido_da        date not null,
  valido_a         date,                     -- null = ancora in vigore
  created_at       timestamptz not null default now(),
  constraint chiusure_ric_giorni_validi
    check (giorni <@ array[1,2,3,4,5,6,7]::smallint[] and array_length(giorni,1) between 1 and 6),
  constraint chiusure_ric_intervallo_sensato
    check (valido_a is null or valido_a >= valido_da)
);

create index if not exists idx_chiusure_ric_org
  on public.chiusure_ricorrenti (organization_id, sede_id, valido_da desc);

-- ── 2. Chiusure a intervallo: ferie, feste, straordinarie ───────────────────
create table if not exists public.chiusure_periodo (
  id               uuid default gen_random_uuid() primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  sede_id          uuid references public.sedi(id) on delete cascade,
  data_da          date not null,
  data_a           date not null,
  motivo           text,                     -- "ferie estive", "Natale", "ristrutturazione"
  created_at       timestamptz not null default now(),
  constraint chiusure_per_intervallo_sensato check (data_a >= data_da)
);

create index if not exists idx_chiusure_per_org
  on public.chiusure_periodo (organization_id, sede_id, data_da);

-- ── RLS, come le altre tabelle per-organizzazione ───────────────────────────
alter table public.chiusure_ricorrenti enable row level security;
alter table public.chiusure_periodo   enable row level security;

drop policy if exists chiusure_ric_own on public.chiusure_ricorrenti;
create policy chiusure_ric_own on public.chiusure_ricorrenti for all
  using      (organization_id in (select organization_id from public.profiles where id = auth.uid()))
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

drop policy if exists chiusure_per_own on public.chiusure_periodo;
create policy chiusure_per_own on public.chiusure_periodo for all
  using      (organization_id in (select organization_id from public.profiles where id = auth.uid()))
  with check (organization_id in (select organization_id from public.profiles where id = auth.uid()));

-- ── Travaso dal modello vecchio ─────────────────────────────────────────────
-- Chi aveva gia' impostato i giorni di chiusura non deve rifarlo. Valido_da al
-- primo gennaio di due anni fa: copre tutto lo storico che il calendario mostra.
insert into public.chiusure_ricorrenti (organization_id, sede_id, giorni, valido_da)
select o.id, null, o.giorni_chiusura,
       make_date(extract(year from current_date)::int - 2, 1, 1)
from public.organizations o
where array_length(o.giorni_chiusura, 1) between 1 and 6
  and not exists (
    select 1 from public.chiusure_ricorrenti c where c.organization_id = o.id
  );

comment on table public.chiusure_ricorrenti is
'Giorni di chiusura ricorrenti con finestra di validita. Cambiare abitudine non riscrive il passato: si chiude il periodo vecchio e se ne apre uno nuovo.';
comment on table public.chiusure_periodo is
'Chiusure a intervallo: ferie, festivita, straordinarie. Un solo giorno = intervallo che inizia e finisce lo stesso giorno.';
