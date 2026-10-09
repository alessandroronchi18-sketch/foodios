-- ════════════════════════════════════════════════════════════════════════════
-- Una spesa di cassa «(F)» e la sua fattura sono la stessa spesa.
--
-- Nel registro del titolare «(F)» vuol dire «ho la fattura». Il 09/10/2026, su
-- settembre, 304,74 € di spese di cassa avevano anche la fattura già caricata
-- (CESAR, WDD, La Macchia Nera, Bel Sas): contate tutte e due, i costi
-- salivano di quella cifra. Qui si scrive il collegamento, così nei costi
-- conta una volta sola.
--
-- 1. `movimenti_cassa.fattura_id`: la fattura che copre questa spesa. NULL =
--    nessun collegamento. `on delete set null`: se la fattura sparisce la
--    spesa torna a contare.
-- 2. `fornitori.alias`: come il titolare scrive il fornitore nel registro
--    («koko» = WDD, «acqua e sapone» = CESAR, «pepe» = Bel Sas). Lo completa
--    lui; il collegamento li legge.
--
-- Additiva e idempotente.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.movimenti_cassa
  add column if not exists fattura_id uuid references public.fatture(id) on delete set null;

alter table public.fornitori
  add column if not exists alias text[] not null default '{}';

comment on column public.movimenti_cassa.fattura_id is
  'Fattura che copre questa spesa (stesso fornitore, stesso importo, data entro 3 giorni). NULL = nessun collegamento: la spesa conta nei costi.';
comment on column public.fornitori.alias is
  'Come il fornitore e'' scritto a mano nel registro di cassa («koko», «acqua e sapone»). Serve a collegare le spese (F) alle fatture.';

create index if not exists idx_movimenti_cassa_fattura
  on public.movimenti_cassa (fattura_id) where fattura_id is not null;
