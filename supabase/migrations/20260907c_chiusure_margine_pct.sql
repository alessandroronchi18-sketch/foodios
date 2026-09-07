-- Correzione di un nome di colonna sbagliato introdotto poche ore prima, nella
-- migration 20260907b.
--
-- Il KPI `totMP` delle chiusure era stato interpretato come "totale materie
-- prime" e mappato su una colonna chiamata tot_materie. Non lo e': in
-- ChiusuraView vale `totV > 0 ? (totM / totV * 100) : 0`, cioe' la PERCENTUALE
-- DI MARGINE sul venduto.
--
-- I dati sono corretti — il travaso ha restituito ricavi identici al centesimo
-- e i test passavano — ma il nome avrebbe ingannato chiunque avesse letto la
-- tabella, e in una colonna che finisce nei conti economici e' il tipo di
-- equivoco che poi si paga caro.
--
-- Rinomina, niente perdita di dati. Idempotente.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chiusure_cassa'
      and column_name = 'tot_materie'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chiusure_cassa'
      and column_name = 'margine_pct'
  ) then
    alter table public.chiusure_cassa rename column tot_materie to margine_pct;
  end if;
end $$;

comment on column public.chiusure_cassa.margine_pct is
'Percentuale di margine sul venduto (kpi.totMP): totM / totV * 100. NON e'' il totale materie prime.';
