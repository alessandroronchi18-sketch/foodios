-- Data di fine rapporto di un dipendente.
--
-- Stesso problema dei costi aziendali: chi se ne va continuava a pesare sul
-- costo del lavoro del conto economico. L'unico modo di toglierlo era mettere
-- `attivo = false`, che però lo fa sparire ANCHE dai mesi in cui lavorava
-- davvero — e quei mesi risultano più redditizi di quanto siano stati.
--
-- Con `data_fine` lo stipendio smette di pesare dal mese successivo e resta
-- nei mesi passati, dove è giusto che stia.
alter table public.dipendenti
  add column if not exists data_fine date;

comment on column public.dipendenti.data_fine is
  'Ultimo mese in cui lo stipendio pesa sul costo del lavoro. NULL = ancora in forza. Diverso da attivo=false, che nasconde la persona anche dallo storico.';
