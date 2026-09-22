-- I campi del fornitore che stanno già stampati sulla sua bolla.
--
-- PERCHE':
-- Il 22/09/2026 il titolare ha fotografato 32 bolle vere di Mara dei Boschi.
-- Ogni testata porta, a seconda del fornitore: nome, via, CAP, comune,
-- provincia, telefono, fax, email, PEC, sito, partita IVA, codice fiscale,
-- REA, IBAN e condizioni di pagamento. Cioe' tutta l'anagrafica, tranne il
-- minimo d'ordine e il lead time che sulla bolla non ci sono.
--
-- Di tutto questo l'anagrafica ne teneva la meta'. Le colonne qui sotto sono
-- quelle che mancavano, e ognuna serve a qualcosa di preciso:
--
-- 1. whatsapp — ConoArtic stampa "Tel e Whatsapp - 0116964241". E' l'unico
--    numero WhatsApp di un fornitore dichiarato da lui in tutto il prodotto,
--    e gli ordini a Mara dei Boschi oggi si fanno su WhatsApp. Sta separato
--    da `telefono` perche' spesso sono due numeri diversi, e mandare un
--    ordine al fisso e' un ordine che non arriva.
-- 2. pec — La Foglia ne ha due, lafoglia.torino@gmail.com e
--    lafoglia.srl@pec.it. A una si ordina, all'altra si mandano le
--    raccomandate: se finiscono nello stesso campo, l'ordine va alla PEC.
-- 3. codice_fiscale — Vecchio Enrico e' una ditta individuale: ha una
--    partita IVA (04210170041) E un codice fiscale di persona
--    (VCCNRC67E03F537M), e sulla fattura elettronica servono tutti e due.
-- 4. indirizzo / cap / citta / provincia — dove mandare un reso, e come
--    riconoscere due fornitori che si chiamano uguale.
-- 5. sito — sta su tre testate su cinque.
--
-- Tutte nullable: NULL = non lo sappiamo. Un campo vuoto si vede e si
-- riempie; un campo riempito con un valore inventato non lo corregge nessuno.
--
-- Additiva e idempotente: nessuna colonna cambia tipo, nessun dato si tocca.

alter table public.fornitori
  add column if not exists whatsapp        text,
  add column if not exists pec             text,
  add column if not exists codice_fiscale  text,
  add column if not exists indirizzo       text,
  add column if not exists cap             text,
  add column if not exists citta           text,
  add column if not exists provincia       text,
  add column if not exists sito            text;

comment on column public.fornitori.whatsapp is
  'Numero WhatsApp del fornitore, come lo dichiara lui. Separato da telefono: spesso sono due numeri diversi.';
comment on column public.fornitori.pec is
  'PEC: e'' l''indirizzo delle raccomandate, NON quello a cui si manda un ordine.';
comment on column public.fornitori.codice_fiscale is
  'Codice fiscale, sedici caratteri, per le ditte individuali. Diverso dalla partita IVA.';
comment on column public.fornitori.provincia is
  'Sigla di due lettere, maiuscola.';

-- Le policy RLS non si toccano: `fornitori` e' gia' murata sul titolare
-- (fornitori_solo_titolare, migration 20260607), e queste colonne ereditano
-- la regola della tabella.
