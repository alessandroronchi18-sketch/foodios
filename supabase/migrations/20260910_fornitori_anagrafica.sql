-- Anagrafica fornitore: i tre campi che servono per ordinare davvero.
--
-- PERCHE':
-- 1. partita_iva — parseFatturaXML.js:73 la estrae già da ogni fattura
--    elettronica ("IdFiscaleIVA/IdCodice") e non aveva dove finire: 0 fatture
--    su 418 in produzione hanno una partita IVA collegata al fornitore.
--    Senza di essa due fornitori con lo stesso nome commerciale non si
--    distinguono, e il commercialista non può riconciliare.
-- 2. lead_time_giorni — src/views/OrdiniAiView.jsx aveva `const leadTime = 3`
--    scritto nel codice, mentre il commento in testa al file prometteva
--    "configurabile per fornitore". Tre giorni per il molino e tre per il
--    cioccolataio che spedisce dalla Spagna è la stessa cosa: non lo è.
-- 3. minimo_ordine — quasi tutti i fornitori horeca ne hanno uno. Proporre un
--    ordine da 40 EUR a chi spedisce da 250 EUR fa perdere un giro di ordini.
--
-- Tutti e tre nullable: NULL = non lo sappiamo, e chi legge deve dirlo
-- invece di inventare un numero.
-- Additiva e idempotente.

alter table public.fornitori
  add column if not exists partita_iva text,
  add column if not exists lead_time_giorni integer,
  add column if not exists minimo_ordine numeric(12,2);

comment on column public.fornitori.partita_iva is
  'Partita IVA del fornitore, come la scrive la fattura elettronica. NULL = non registrata.';
comment on column public.fornitori.lead_time_giorni is
  'Giorni fra l''ordine e la consegna, dichiarati dal titolare. NULL = non impostato: chi calcola deve dire che sta usando un valore di riferimento.';
comment on column public.fornitori.minimo_ordine is
  'Importo minimo d''ordine in euro. NULL = nessun minimo noto.';
