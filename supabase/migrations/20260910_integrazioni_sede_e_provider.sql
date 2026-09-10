-- Due correzioni sulle integrazioni.
--
-- 1. sync_log.sede_id
--    Il registro degli import non sapeva in quale sede fosse avvenuto
--    l'import. Con tre negozi la targhetta "Connessa" si accendeva su tutte
--    le sedi, anche su quelle dove non era mai entrato niente: il titolare
--    guardava Corso Casale, leggeva "Connessa - ultimo sync oggi" e si
--    fidava di un import fatto da un'altra parte.
--    Nullable: le righe già scritte non sanno da dove vengono, e NULL dice
--    esattamente quello.
--
-- 2. pos_scontrini.provider: 'cassaincloud'
--    Il webhook normalizza l'header del provider in minuscolo
--    (api/webhook-pos.js: sanitizeStrict(...).toLowerCase()), ma la mappa dei
--    segreti e questo CHECK avevano 'cassainCloud' con la C maiuscola.
--    Risultato: ogni chiamata di Cassa in Cloud veniva rifiutata con
--    "x-pos-provider non valido", sempre, per un maiuscolo. Qui allarghiamo
--    l'elenco: il valore vecchio resta valido, così le righe già presenti
--    non diventano illegali.

alter table public.sync_log
  add column if not exists sede_id uuid references public.sedi(id) on delete set null;

comment on column public.sync_log.sede_id is
  'Sede su cui è stato fatto l''import. NULL = riga scritta prima che questa colonna esistesse, oppure import non legato a una sede.';

create index if not exists sync_log_sede_idx on public.sync_log (organization_id, sede_id, created_at desc);

alter table public.pos_scontrini drop constraint if exists pos_scontrini_provider_check;
alter table public.pos_scontrini add constraint pos_scontrini_provider_check
  check (provider = any (array[
    'tilby', 'cassaincloud', 'cassainCloud', 'rch', 'olivetti', 'custom',
    'salvi', 'indaco', 'polotouch', 'ekopos', 'wolf', 'zucchetti'
  ]));
