-- ===========================================================================
-- Stipendi mensili dipendenti + contratto dettagliato
--
-- La tabella dipendenti aveva solo costo_orario + ore_settimana. Per il
-- calcolo lordo/netto serve uno stipendio mensile e un contratto.
--
-- Aggiungiamo:
--   stipendio_lordo_mensile  - input principale (l'utente lo conosce dal CCNL)
--   stipendio_netto_mensile  - calcolato/inserito a mano (override)
--   contratto_tipo           - apprendista, indeterminato, determinato, stagionale
--   livello                  - es. 4S, 5, 6 (CCNL pubblici esercizi/commercio)
--   data_assunzione          - per calcolo TFR/anzianita'
--
-- I valori inseriti dall'utente non sostituiscono un commercialista: e'
-- una stima per il P&L. UI mostra disclaimer "calcolo approssimativo".
-- ===========================================================================

alter table public.dipendenti
  add column if not exists stipendio_lordo_mensile numeric(10,2) default 0;

alter table public.dipendenti
  add column if not exists stipendio_netto_mensile numeric(10,2) default 0;

alter table public.dipendenti
  add column if not exists contratto_tipo text;

alter table public.dipendenti
  add column if not exists livello text;

alter table public.dipendenti
  add column if not exists data_assunzione date;

-- Constraint contratto_tipo
alter table public.dipendenti
  drop constraint if exists dipendenti_contratto_tipo_check;

alter table public.dipendenti
  add constraint dipendenti_contratto_tipo_check
  check (contratto_tipo is null or contratto_tipo in
    ('indeterminato','determinato','apprendista','stagionale','collaborazione','altro'));

comment on column public.dipendenti.stipendio_lordo_mensile is
  'Stipendio mensile lordo (€). Input principale per il calcolo P&L.';
comment on column public.dipendenti.stipendio_netto_mensile is
  'Stipendio mensile netto (€). Override manuale o calcolato dal lordo.';
