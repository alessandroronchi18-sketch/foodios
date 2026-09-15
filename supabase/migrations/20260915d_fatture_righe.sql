-- Il dettaglio riga delle fatture: si leggeva e si buttava via.
--
-- In una fattura elettronica, `DettaglioLinee` contiene per ogni voce il
-- prodotto, la quantità, l'unità di misura, il prezzo unitario e l'aliquota.
-- È il dato con cui si calcola quanto costa DAVVERO un ingrediente — e come
-- cambia nel tempo. È il cuore del food cost.
--
-- `parseFatturaXML` quel blocco lo scorreva già. Ma teneva **solo le prime tre
-- descrizioni**, incollate in un campo `note`, e scartava tutto il resto:
-- quantità, prezzi, codici articolo. In produzione ci sono **3.520 fatture**:
-- il dettaglio di tutte è passato dal browser ed è stato gettato.
--
-- Qui si aggiunge dove metterlo. Una colonna `jsonb` sulla tabella che c'è
-- già, non una tabella nuova, per tre motivi concreti:
--
--   1. esiste già lo stesso identico precedente nel progetto:
--      `pos_scontrini.righe`, con la stessa forma
--      (prodotto / quantita / prezzo / totale / iva_pct);
--   2. non aggiunge join alle pagine che le fatture le leggono già
--      (Scadenzario ne carica migliaia per volta);
--   3. si può rilasciare in qualunque ordine rispetto al codice, perché
--      `insertFattureResilient()` ripiega da solo sulle colonne che esistono.
--
-- La tabella righe vera e propria servirà dopo, il giorno che si vorrà
-- chiedere "quanto è aumentata la panna in dodici mesi" su tutte le fatture:
-- una query del genere su un jsonb si può fare ma è più lenta. Quel giorno si
-- migra, e il dato sarà già stato raccolto da qui.

alter table public.fatture
  add column if not exists righe jsonb not null default '[]'::jsonb;

comment on column public.fatture.righe is
  'Dettaglio riga della fattura: [{n, codice, descrizione, quantita, unita, prezzo_unitario, totale, iva_pct}]. Popolato da parseFatturaXML a partire da DettaglioLinee.';

-- Serve a trovare le fatture che contengono un certo prodotto senza scorrerle
-- tutte. Con 3.520 righe oggi non cambia niente; con qualche anno di storico
-- sì, ed è meglio averlo prima che dopo.
create index if not exists idx_fatture_righe on public.fatture using gin (righe);
