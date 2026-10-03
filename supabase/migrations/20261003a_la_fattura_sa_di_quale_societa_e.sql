-- ─────────────────────────────────────────────────────────────────────────
-- La fattura sa di quale società è
-- ─────────────────────────────────────────────────────────────────────────
--
-- Un'azienda su Foodos può essere fatta di più società. Il design partner,
-- 03/10/2026: due SRL e tre negozi. Le fatture di una società vanno al suo
-- negozio; quelle dell'altra sono spese di due negozi insieme
-- (`sedi_condivise`, ripartite sui chili prodotti).
--
-- Ogni fattura elettronica dice a chi è intestata: la P.IVA del
-- `CessionarioCommittente`. Il parser la legge già. Le fatture NUOVE la usano
-- per andare alla sede giusta (`src/lib/societaSedi.js`); questa colonna la
-- conserva, così anche le fatture GIÀ in archivio — quando lo ZIP
-- dell'Agenzia le completa — sanno di chi sono, e la pagina Impostazioni →
-- Società può proporre di spostare quelle finite sulla sede sbagliata.
--
-- Non si sposta niente qui: la proposta si mostra coi numeri e si applica
-- solo dopo un sì esplicito del titolare.
--
-- Il frontend funziona anche PRIMA di questa migration: se la colonna non
-- c'è, `insertFattureResilient` e `applicaCompletamenti` la tolgono e
-- scrivono tutto il resto (`src/lib/fattureImport.js`).
--
-- Additiva e ripetibile: aggiunge una colonna vuota e un indice. Non tocca
-- nessuna riga.

alter table public.fatture
  add column if not exists cessionario_piva text null;

comment on column public.fatture.cessionario_piva is
  'P.IVA di chi riceve la fattura (CessionarioCommittente dell''XML), '
  'normalizzata: senza spazi e senza prefisso IT. Dice di quale società '
  'dell''azienda è il documento, e quindi a quali sedi va '
  '(mappa in user_data, chiave pasticceria-societa-sedi-v1). NULL = non '
  'si sa (fatture da Excel non ancora completate dall''XML).';

create index if not exists fatture_cessionario_piva_idx
  on public.fatture (organization_id, cessionario_piva)
  where cessionario_piva is not null;
