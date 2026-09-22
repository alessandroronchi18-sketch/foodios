-- ════════════════════════════════════════════════════════════════════════════
-- Il fornitore da cui si passa, già che si va da quella parte.
--
-- Richiesta del titolare, 23/09/2026: «magari il negozio che rifornisce un
-- ingrediente si trova vicino a De Gasperi, quindi uno esce a consegnare e
-- nel frattempo compra la materia prima».
--
-- E' il risparmio piu' grosso di tutta questa storia, ed e' anche il piu'
-- facile da perdere: il viaggio si fa lo stesso, il fornitore e' sulla
-- strada, e se nessuno se lo ricorda al momento giusto si fa due volte la
-- stessa strada in due giorni diversi.
--
-- DUE COLONNE:
--
-- 1. `vicino_a_sede` — da quale delle nostre sedi si passa comodi per andare
--    da lui. E' una uuid verso `sedi`, non un indirizzo: «vicino» dipende da
--    dove parti, e l'unico che lo sa davvero e' chi ci va. Niente mappe,
--    niente distanze calcolate: si dichiara una volta e vale.
--    `on delete set null`: se una sede chiude, il fornitore resta.
--
-- 2. `si_ritira` — da lui si va a prendere la merce (true) oppure consegna
--    lui (false). NULL = non lo sappiamo. Senza questo, si proporrebbe di
--    passare a ritirare da chi la porta a casa: un giro in piu' per niente,
--    cioe' il contrario di quello che serve.
--
-- Additiva e idempotente.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.fornitori
  add column if not exists vicino_a_sede uuid references public.sedi(id) on delete set null,
  add column if not exists si_ritira     boolean;

comment on column public.fornitori.vicino_a_sede is
  'Da quale nostra sede si passa comodi per andare da lui. Si dichiara: «vicino» dipende da dove parti.';
comment on column public.fornitori.si_ritira is
  'Da lui si va a prendere la merce? NULL = non lo sappiamo. Se consegna lui, passare a ritirare e'' un giro in piu'' per niente.';

create index if not exists idx_fornitori_vicino
  on public.fornitori (organization_id, vicino_a_sede)
  where vicino_a_sede is not null;
