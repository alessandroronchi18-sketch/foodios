-- movimenti_cassa.origine: da dove viene la riga.
--
-- PERCHE': l'import del registro incassi, prima di scrivere le uscite del mese,
-- cancellava TUTTE le uscite di quel periodo per quella sede. Senza nessun
-- filtro: anche le spese scritte a mano in Foodos dal titolare, che nel file
-- Excel non ci sono e non torneranno più. E lo faceva sempre, anche quando il
-- foglio caricato non aveva nemmeno la colonna delle spese.
--
-- Con questa colonna l'import cancella solo le righe che ha scritto lui
-- ('import-registro'); quelle inserite a mano (origine NULL o 'manuale')
-- restano dove sono.
--
-- Additiva e idempotente. Le righe già esistenti restano con origine NULL, che
-- è il valore giusto: nessuna delle 0 righe attuali viene dall'import.

alter table public.movimenti_cassa
  add column if not exists origine text;

comment on column public.movimenti_cassa.origine is
  'Da dove viene la riga: NULL/manuale = scritta a mano nell''app, import-registro = importata dal registro Excel. L''import può cancellare solo le proprie.';

create index if not exists movimenti_cassa_origine_idx
  on public.movimenti_cassa (organization_id, sede_id, data, origine);
