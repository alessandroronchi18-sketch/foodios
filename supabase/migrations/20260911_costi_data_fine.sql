-- Data di fine su una voce di costo aziendale.
--
-- Un costo che è finito (un affitto disdetto, un software non più usato, un
-- leasing terminato) pesava per sempre sul conto economico. L'unico modo di
-- toglierlo era mettere `attivo = false` — che però lo fa sparire ANCHE dai
-- mesi passati, in cui il costo c'era davvero: lo storico si falsa nella
-- direzione opposta.
--
-- Con `data_fine` la voce smette di pesare da quel mese in poi e resta nei
-- mesi precedenti, dove è giusto che stia.
alter table public.costi_aziendali
  add column if not exists data_fine date;

comment on column public.costi_aziendali.data_fine is
  'Ultimo mese in cui il costo pesa. NULL = ancora in corso. Diverso da attivo=false, che nasconde la voce anche dallo storico.';
