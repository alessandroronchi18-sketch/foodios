-- Il registro dei movimenti dice che sono spariti dei pezzi, non dice chi.
--
-- Trovato il 17/09/2026 con l'audit di sicurezza.
--
-- `movimenti_stock_pf` ha la colonna `created_by` dal giorno in cui è nata, e
-- **nessuna delle sedici funzioni che ci scrivono la riempie**. Misurato in
-- produzione: 24 movimenti, **zero** con un autore.
--
-- Perché conta. `stock_pf_rettifica` la può chiamare il dipendente, ed è
-- voluto: è lui che apre il congelatore e conta i pezzi. Ma la riga che ne
-- esce dice «rettifica_manuale: −12 pezzi» e non dice chi l'ha fatta. Il
-- giorno in cui mancano dodici vaschette, il registro racconta metà della
-- storia — e la metà che manca è quella per cui si tiene un registro.
--
-- ── Perché un valore predefinito e non sedici funzioni riscritte ─────────
--
-- La strada ovvia sarebbe aggiungere `created_by := auth.uid()` dentro ogni
-- `insert into movimenti_stock_pf`. Sono sedici punti in dieci funzioni, e
-- riscrivere il corpo di dieci funzioni SECURITY DEFINER per aggiungere una
-- colonna è tanto rischio per poco guadagno: basta sbagliarne una e si rompe
-- il carico di produzione.
--
-- Soprattutto, non risolverebbe il problema vero: la diciassettesima funzione,
-- quella che qualcuno scriverà fra tre mesi, nascerebbe di nuovo senza autore.
-- È esattamente il difetto che si sta correggendo — una regola che vale «in
-- tutti i punti in cui qualcuno si è ricordato di scriverla».
--
-- Un valore predefinito sulla colonna vale per tutte le scritture, anche per
-- quelle che non esistono ancora, e non tocca nessuna funzione.
--
-- ── Cosa succede quando scrive il server ────────────────────────────────
--
-- `auth.uid()` risponde NULL quando non c'è una persona davanti: le funzioni
-- serverless girano con la chiave di servizio, e le loro righe resteranno
-- senza autore. È giusto così, e va letto per quello che è: «questa riga
-- l'ha scritta il programma», non «non si sa». La differenza fra le due la
-- dice il tipo di movimento, che è già nella riga.
--
-- Le 24 righe già scritte restano senza autore: non si può sapere a
-- posteriori chi le ha fatte, e inventarlo sarebbe peggio che lasciarlo vuoto.
--
-- Migrazione additiva e ripetibile.

alter table public.movimenti_stock_pf
  alter column created_by set default auth.uid();

comment on column public.movimenti_stock_pf.created_by is
  'Chi ha scritto il movimento. Si riempie da sé con auth.uid() a ogni '
  'inserimento: vale anche per le funzioni che verranno. NULL = l''ha scritto '
  'il programma (funzione serverless con la chiave di servizio), non «non si '
  'sa». Le righe anteriori al 17/09/2026 sono vuote perché la colonna non '
  'veniva riempita da nessuno.';
