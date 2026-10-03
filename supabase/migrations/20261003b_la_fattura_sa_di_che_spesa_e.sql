-- ─────────────────────────────────────────────────────────────────────────
-- La fattura sa di che spesa è, quando non è quella del suo fornitore
-- ─────────────────────────────────────────────────────────────────────────
--
-- Il conto economico nuovo (03/10/2026, `src/lib/contoEconomico.js`) mette
-- le fatture nelle voci di spesa secondo la voce del fornitore
-- (`fornitori.categoria`). Quasi sempre basta. Non basta per la fattura
-- eccezionale: a luglio 2026 una sola fattura GECKO vale 86.651 €, contro le
-- solite da due o tremila euro dello stesso fornitore. È probabilmente un
-- investimento, e un investimento non pesa sul conto di un mese solo.
--
-- Questa colonna tiene la voce della singola fattura, e vince su quella del
-- fornitore. Ci va l'id della voce ('attrezzature', 'materie-prime', …,
-- elenco in `CATEGORIE_SPESA`). NULL = vale la voce del fornitore.
--
-- Nessun vincolo sui valori: una voce nuova non deve richiedere un'altra
-- migration, e un valore che il programma non riconosce vale come NULL
-- (`categoriaDaEtichetta` risponde null, si usa quella del fornitore).
--
-- Il frontend funziona anche PRIMA di questa migration: se la colonna non
-- c'è, `leggiFatturePeriodo` rilegge senza e dice `eccezioniDisponibili:
-- false`; `salvaCategoriaFattura` risponde `colonna_mancante` e la schermata
-- lo dice invece di far credere che sia salvato
-- (`src/lib/contoEconomicoArchivio.js`).
--
-- Additiva e ripetibile: aggiunge una colonna vuota. Non tocca nessuna riga.
-- Scritta il 03/10/2026 e NON applicata: la applica chi pubblica.

alter table public.fatture
  add column if not exists categoria_spesa text null;

comment on column public.fatture.categoria_spesa is
  'Voce di spesa di questa fattura, quando non è quella del fornitore '
  '(id di CATEGORIE_SPESA in src/lib/contoEconomico.js, es. ''attrezzature'' '
  'per una fattura che è un investimento). NULL = vale fornitori.categoria.';
