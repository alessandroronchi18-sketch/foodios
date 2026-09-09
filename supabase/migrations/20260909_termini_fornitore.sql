-- Tipo di termine di pagamento per fornitore, 09/09/2026.
--
-- `fornitori.termini_pagamento` (giorni) esisteva già, ma il calcolo della
-- scadenza sapeva fare solo "data fattura + N giorni". I fornitori alimentari
-- lavorano quasi tutti a "30 giorni data fattura FINE MESE" (30 gg d.f. f.m.),
-- che è un'altra cosa: una fattura del 3 marzo a 30 gg f.m. si paga il 30
-- aprile, non il 2 aprile. Sono 28 giorni di differenza, e su 211 fatture
-- scadute cambia completamente quali sono davvero in ritardo e quanto esce di
-- cassa in una settimana.
--
-- Ogni azienda ha i suoi accordi, e diversi da fornitore a fornitore: il tipo
-- va quindi accanto ai giorni, sulla riga del fornitore.
--
-- Default 'netti' per non cambiare il comportamento di chi c'è già: chi vuole
-- fine mese lo imposta.
alter table if exists public.fornitori
  add column if not exists termini_tipo text not null default 'netti';

do $$ begin
  alter table public.fornitori
    add constraint fornitori_termini_tipo_valido
    check (termini_tipo in ('netti', 'fine_mese'));
exception when duplicate_object then null; end $$;

comment on column public.fornitori.termini_tipo is
  'Come si contano i giorni di termini_pagamento: netti = dalla data fattura, fine_mese = dalla fine del mese della fattura (30 gg d.f. f.m.)';
