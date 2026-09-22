-- ════════════════════════════════════════════════════════════════════════════
-- Chi puo' guidare, e con che mezzo.
--
-- Richiesta del titolare, 23/09/2026, parlando dei giri fra le sedi:
-- «bisogna considerare chi ha la patente e chi no, altra informazione da
-- mettere nel personale, e poi magari il tipo di trasporto».
--
-- PERCHE' SERVE DAVVERO:
-- Un giro non e' solo «cosa portare»: e' «chi ci va e con cosa». Carlina e
-- Berthollet sono a pochi minuti a piedi, De Gasperi e' dall'altra parte
-- della citta'. Proporre a chi e' in turno un giro che non puo' fare — perche'
-- non ha la patente, o perche' con lo scooter quei venti chili non ci stanno —
-- vuol dire far perdere tempo a chi legge, che e' esattamente il problema da
-- cui siamo partiti.
--
-- DUE COLONNE, E LA PRIMA E' NULLABLE APPOSTA:
--
-- 1. `patente` — boolean NULLABLE. NULL = **non lo so**, e non e' «no».
--    Metterla `not null default false` vorrebbe dire dire di ogni dipendente
--    gia' in archivio che non ha la patente, e il programma proporrebbe i
--    giri sempre alle stesse due persone. Un dato che manca si chiede, non si
--    indovina.
--
-- 2. `mezzi` — text[] di quello che puo' davvero usare: 'piedi', 'bici',
--    'scooter', 'auto', 'furgone'. E' un elenco e non un campo solo perche'
--    la risposta vera e' quasi sempre piu' di una, e perche' «ha la patente»
--    non dice se il mezzo ce l'ha.
--
-- Additiva e idempotente.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.dipendenti
  add column if not exists patente boolean,
  add column if not exists mezzi   text[];

comment on column public.dipendenti.patente is
  'Ha la patente B? NULL = non lo sappiamo, e non e'' «no»: un dato che manca si chiede.';
comment on column public.dipendenti.mezzi is
  'Cosa puo'' usare davvero per un giro: piedi, bici, scooter, auto, furgone. Avere la patente non vuol dire avere il mezzo.';

-- I valori ammessi si tengono stretti: un elenco libero diventa «scooter»,
-- «Scooter», «motorino» e «50ino», e nessun conto ci si raccapezza piu'.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.dipendenti'::regclass and conname = 'dipendenti_mezzi_validi'
  ) then
    alter table public.dipendenti
      add constraint dipendenti_mezzi_validi
      check (
        mezzi is null
        or mezzi <@ array['piedi','bici','scooter','auto','furgone']::text[]
      );
  end if;
end $$;

-- Le policy RLS non si toccano: `dipendenti` ha gia' la sua regola.
