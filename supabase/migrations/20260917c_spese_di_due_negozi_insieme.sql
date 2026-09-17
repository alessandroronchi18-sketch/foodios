-- Una spesa può essere di due negozi insieme, e non si può dividere leggendo
-- il documento.
--
-- Mara dei Boschi ha due account su Webdesk: uno contiene le fatture della
-- Carlina, l'altro quelle di Berthollet e De Gasperi **insieme**. I due
-- gruppi si riconoscono nei dati perché sono stati importati a un minuto di
-- distanza, il 10/09/2026 alle 09:12 e alle 09:13:
--
--     primo account   2.962 fatture, 305 fornitori, 28/03/23 → 10/09/26
--     secondo account   142 fatture,  37 fornitori, 12/05/26 → 10/09/26
--
-- Il programma ha dato al primo la sede attiva in quel momento (Carlina) e al
-- secondo nessuna sede. Quelle 142 valgono **189.458,40 €** e non comparivano
-- in nessuna pagina, perché ogni schermata ragiona per negozio.
--
-- ── Perché non si assegnano e basta ────────────────────────────────────
--
-- Cercato, il 17/09/2026, qualunque cosa distinguesse Berthollet da De
-- Gasperi dentro quei 142 documenti:
--
--     con una nota ............. 0 su 142
--     con un allegato .......... 0 su 142
--     con una data di riferimento  0 su 142
--     numeri di documento ...... 142 tutti diversi, nessun prefisso comune
--
-- Non c'è. Sono due negozi dentro un account solo, e chi emette la fattura
-- non lo sa. Attribuirle a una delle due sarebbe inventare un dato e
-- sporcare il food cost di tutti e due i negozi in direzioni opposte.
--
-- ── La strada scelta dal titolare ──────────────────────────────────────
--
-- Si dichiara che la spesa è **di due negozi**, e la si divide su quanto
-- ognuno ha prodotto: la merce è stata consumata in proporzione al lavoro
-- fatto, ed è una chiave che si spiega in una frase.
--
-- Misurato sul periodo di quelle fatture (12/05 → 10/09/2026):
--     De Gasperi   7.304,5 kg   52,5%   →   99.395,89 €
--     Berthollet   6.618,6 kg   47,5%   →   90.062,51 €
--                                            ---------
--                                            189.458,40 €
--
-- Il documento NON viene toccato: resta uno, col suo totale e il suo numero.
-- La divisione vive solo nel momento in cui si sommano i costi per negozio —
-- una fattura spezzata in due nel database sarebbe una fattura falsa. La
-- regola sta in `src/lib/costiCondivisi.js`, con i suoi test.
--
-- ── Cosa cambia per chi guarda i numeri ────────────────────────────────
--
-- Le pagine per sede mostreranno due cifre separate: quello che è fatturato a
-- quel negozio e quello che gli è stato **ripartito**. Non sono la stessa
-- cosa, e chi decide su quei numeri deve vedere quale sta leggendo.
--
-- Migrazione additiva e ripetibile. Non cancella e non modifica nessun
-- importo: aggiunge una colonna e la riempie per le sole righe del secondo
-- account, riconosciute per «nessuna sede».

alter table public.fatture
  add column if not exists sedi_condivise uuid[] null;

comment on column public.fatture.sedi_condivise is
  'Le sedi che si dividono questa spesa, quando il documento non dice a quale '
  'appartiene (tipico di un account fornitore che copre piu'' negozi). NULL = '
  'documento di una sede sola, quella in sede_id. La divisione avviene al '
  'momento del calcolo, in proporzione ai chili prodotti: vedi '
  'src/lib/costiCondivisi.js. Il totale della fattura non viene mai spezzato.';

create index if not exists fatture_sedi_condivise_idx
  on public.fatture using gin (sedi_condivise)
  where sedi_condivise is not null;
