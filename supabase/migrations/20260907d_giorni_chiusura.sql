-- Giorni di chiusura: il calendario deve smettere di dare torto a chi ha ragione.
--
-- Il problema. Il Calendario operativo colora di rosso ogni giorno passato senza
-- produzione e senza cassa, con la legenda "Da compilare". Ma i negozi chiudono:
-- una pasticceria chiusa il lunedi' vedra' ogni lunedi' rosso per sempre, e tre
-- settimane rosse ad agosto. Il KPI "Copertura mese" non potra' mai arrivare al
-- 100% e il semaforo restera' stabilmente sull'ambra o sul rosso.
--
-- Uno strumento che ti da' torto quando hai ragione lo smetti di guardare.
--
-- Due livelli, perché le chiusure sono di due tipi diversi:
--
-- 1. Ricorrenti — "chiudiamo il lunedi'". Vivono sull'organizzazione come
--    elenco di giorni della settimana. Si impostano una volta.
-- 2. Straordinarie — ferie, un funerale, la ristrutturazione. Vivono sul
--    singolo giorno, in note_giornaliere, che c'e' già ed e' già per-giorno.
--
-- I giorni chiusi escono dal denominatore della copertura e non vengono più
-- dipinti di rosso.

-- ── 1. Chiusure ricorrenti, a livello di organizzazione ─────────────────────
-- Numerazione ISO: 1 = lunedi' ... 7 = domenica. Scelta ISO e non quella di
-- JavaScript (0 = domenica) perché e' quella che si legge senza tradurre:
-- "chiuso il giorno 1" e' lunedi', come dice il calendario appeso al muro.
alter table public.organizations
  add column if not exists giorni_chiusura smallint[] not null default '{}';

alter table public.organizations
  drop constraint if exists org_giorni_chiusura_validi;
alter table public.organizations
  add constraint org_giorni_chiusura_validi
  check (
    giorni_chiusura <@ array[1,2,3,4,5,6,7]::smallint[]
    and array_length(giorni_chiusura, 1) is distinct from 7   -- non si chiude sempre
  );

comment on column public.organizations.giorni_chiusura is
'Giorni di chiusura ricorrenti, numerazione ISO (1=lunedi ... 7=domenica). Esclusi dal conteggio copertura del Calendario operativo.';


-- ── 2. Chiusure straordinarie, sul singolo giorno ───────────────────────────
alter table public.note_giornaliere
  add column if not exists chiuso boolean not null default false;

comment on column public.note_giornaliere.chiuso is
'Giorno di chiusura straordinaria (ferie, evento). Escluso dal conteggio copertura anche se non rientra nei giorni di chiusura ricorrenti.';

-- La nota poteva esistere solo per scrivere del testo. Ora una riga puo'
-- esistere anche solo per dire "quel giorno eravamo chiusi", con nota vuota:
-- niente vincoli di non-nullita' da aggiungere, nota resta opzionale.
