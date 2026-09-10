-- chiusure_cassa.scontrino_medio_eur: l'incasso medio per scontrino, in euro.
--
-- PERCHE': la colonna `scontrino_medio` NON contiene lo scontrino medio.
-- Contiene il sell-through medio in percentuale (kpi.avgST, chiusure.js:60),
-- ed è così da sempre: chiusuraKpi.js:51 lo calcola come media delle
-- percentuali di smaltimento delle righe, e lo Storico lo stampa col semaforo
-- verde/ambra/rosso sulle soglie 85% e 65%.
--
-- La chiusura rapida ("Solo totale") ci scriveva invece EURO PER SCONTRINO:
-- 1.477 € su 128 scontrini finivano dentro come 11,54, e lo Storico li
-- mostrava come "Sell-through 11,5%" in rosso, abbassando la media del mese.
-- Due grandezze diverse nella stessa colonna.
--
-- Ora l'euro per scontrino ha una colonna sua, e `scontrino_medio` resta
-- quello che è sempre stato (il sell-through), documentato.
--
-- Additiva e idempotente.

alter table public.chiusure_cassa
  add column if not exists scontrino_medio_eur numeric(12,2);

comment on column public.chiusure_cassa.scontrino_medio_eur is
  'Incasso medio per scontrino, in euro (totale incassato / numero scontrini). NULL = non rilevato.';

comment on column public.chiusure_cassa.scontrino_medio is
  'ATTENZIONE, nome storico fuorviante: contiene il SELL-THROUGH medio in percentuale (kpi.avgST), non lo scontrino medio. Per l''euro per scontrino usare scontrino_medio_eur.';
