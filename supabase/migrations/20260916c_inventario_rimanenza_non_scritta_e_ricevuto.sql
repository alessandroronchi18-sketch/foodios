-- Una casella non compilata non è «vetrina vuota», ed è costata 2.470 kg.
--
-- ── Cosa è stato misurato (audit magazzino, 16/09/2026) ──────────────────
--
-- Sui dati veri di Mara dei Boschi, 7.013 caselle (gusto × giorno × sede) fra
-- il 01/05 e il 15/09/2026, la partita doppia dell'inventario
--
--     venduto = rimanenza di ieri + prodotto oggi − rimanenza stasera
--               − scarto − spedito
--
-- non torna su **575 caselle (8,2%), per 2.587,9 kg**.
-- Berthollet −1.046,5 kg · Carlina −309,1 kg · De Gasperi −1.232,3 kg.
--
-- Classificando le 575:
--
--   la rimanenza del giorno PRIMA vale 0   ->  550 caselle, −2.469,6 kg (95,4%)
--   la rimanenza del giorno prima è  > 0   ->   25 caselle,   −118,4 kg
--
-- E dall'altro lato: delle 655 caselle che partono da una rimanenza a zero,
-- **550 (84%) finiscono in negativo**. Quando la rimanenza precedente è
-- maggiore di zero, le negative sono 25 su 6.271, cioè lo 0,4%.
--
-- Quello zero è falso, e ci sono tre prove indipendenti:
--
--   1. Le righe con `rimanenza_g = 0` sono 660, e in **658 (99,7%)** c'è
--      produzione lo stesso giorno, in media 5,87 kg. Nelle righe con
--      rimanenza maggiore di zero la produzione c'è solo nel 59,8% dei casi.
--      Hanno prodotto quasi 6 kg di un gusto e a fine giornata in vetrina ce
--      n'erano zero grammi, 658 volte in quattro mesi e mezzo.
--   2. Il venduto che ne esce è il triplo del normale: 10,06 kg di un singolo
--      gusto in un singolo negozio in un giorno, contro i 3,00 kg degli altri
--      giorni.
--   3. Ha la forma dell'abitudine di una persona, non di un fatto commerciale.
--      Berthollet lascia la rimanenza a zero il martedì (43% delle righe) e il
--      mercoledì (26,5%); De Gasperi il mercoledì (63,6%) e il martedì
--      (24,7%); Carlina il martedì (20,5%). Gli altri giorni stanno sotto il
--      5%. Un gusto che finisce davvero non sceglie il giorno della settimana.
--
-- Esempio vero, MAROTTO a Berthollet (il gusto più prodotto in quella sede):
--
--     04/08 mar   prod 8.000 g   riman     0 g
--     05/08 mer   prod     0 g   riman 4.800 g   ->  venduto  −4.800 g
--     11/08 mar   prod 8.000 g   riman     0 g
--     12/08 mer   prod     0 g   riman 6.900 g   ->  venduto  −6.900 g
--
-- Il mercoledì Berthollet non produce (solo il 27,9% delle righe del mercoledì
-- ha produzione). Quel gelato è arrivato da un'altra sede o era già lì: in
-- nessuno dei due casi è stato venduto meno di zero.
--
-- ── 1. `rimanenza_g` diventa nullable: si può dire «non lo so» ───────────
--
-- Oggi la colonna è `bigint NOT NULL DEFAULT 0`. Anche volendo, chi importa un
-- foglio non ha dove mettere «questa casella era vuota»: l'unico valore
-- disponibile è zero, che nel calcolo del venduto vuol dire «la vetrina era
-- vuota», cioè il contrario di «non lo sappiamo».
--
-- Con NULL ammesso, `cellaVenduto` può rispondere «il venduto di questo giorno
-- non si può calcolare» invece di produrre un numero negativo. È la stessa
-- regola già applicata altrove nel prodotto: `chiusure.js` tiene a null il
-- sell-through non rilevato, `stock_prodotti_finiti` tiene a null il valore
-- unitario sconosciuto. Un food cost sconosciuto non è «gratis», è «non lo so».
--
-- La CHECK `rimanenza_g >= 0` resta e continua a funzionare: in SQL un
-- confronto con NULL vale UNKNOWN, e una CHECK passa se non è falsa.
--
-- **Le 660 righe che oggi hanno 0 non vengono toccate.** Non si può sapere a
-- posteriori quali erano davvero a vetrina vuota e quali erano caselle non
-- compilate: correggerle d'ufficio vorrebbe dire inventare il dato del
-- cliente. Da qui in avanti i nuovi import scriveranno NULL quando la casella
-- è vuota; per lo storico serve una passata con Mara davanti allo schermo.
--
-- `produzione_g` invece resta `NOT NULL DEFAULT 0`, e non è una svista: nel
-- foglio del cliente la colonna PROD resta vuota esattamente quando quel
-- giorno non si è prodotto niente, e i numeri lo confermano (2.559 righe con
-- produzione zero, e non sono loro a generare le caselle negative: il segnale
-- sta tutto sulla rimanenza del giorno prima).

alter table public.inventario_produzione
  alter column rimanenza_g drop not null;

alter table public.inventario_produzione
  alter column rimanenza_g drop default;

comment on column public.inventario_produzione.rimanenza_g is
  'Grammi rimasti in vetrina a fine giornata. NULL = non rilevato (la casella '
  'del foglio era vuota): diverso da 0, che vuol dire "vetrina vuota". '
  'Con NULL il venduto di quel giorno e del giorno dopo non si calcola, e la '
  'pagina lo dichiara invece di mostrare un negativo. Vedi audit 16/09/2026.';

-- ── 2. `ricevuto_g`: la merce che arriva da un'altra sede ────────────────
--
-- La tabella ha `spedito_g` e non ha il suo contrario. Chi spedisce scala i
-- chili dal proprio venduto (giusto), chi riceve non li registra da nessuna
-- parte: la rimanenza del giorno dopo sale senza una riga che lo spieghi, e il
-- venduto della sede che riceve esce negativo.
--
-- `confermaRicezione` in `src/components/TrasferimentiView.jsx:396` chiude il
-- trasferimento e aggiorna lo stock dei prodotti finiti, ma nell'inventario
-- della sede di arrivo non scrive niente: non ha una colonna dove scriverlo.
--
-- Quanto pesa, misurato: rifacendo la partita doppia **sommando le tre sedi**
-- (stesso gusto, stesso giorno, sedi unite) il buco passa da −2.587,9 kg a
-- −1.324,8 kg. Cioè **1.263 kg, il 49%, sparisce appena si smette di trattare
-- le sedi come separate**: è gelato che si sposta fra Carlina, Berthollet e
-- De Gasperi senza che nessuno lo registri. E combacia col calendario di
-- produzione: Berthollet non produce il mercoledì, De Gasperi non produce il
-- giovedì, e sono i due giorni in cui le loro caselle negative si concentrano
-- (40,4% e 55,7% delle caselle di quel giorno).
--
-- Sui dati di Mara la pagina trasferimenti è di fatto inutilizzata (una sola
-- riga registrata, del 15/09), quindi la merce si muove senza lasciare traccia
-- da nessuna delle due parti. La colonna serve perché quando la useranno il
-- conto torni.
--
-- Zero qui è un valore legittimo e non ambiguo ("non è arrivato niente"),
-- quindi NOT NULL DEFAULT 0 come `spedito_g`.

alter table public.inventario_produzione
  add column if not exists ricevuto_g bigint not null default 0;

comment on column public.inventario_produzione.ricevuto_g is
  'Grammi arrivati da un''altra sede in quel giorno. Il contrario di '
  'spedito_g: entra nel venduto col segno meno (la merce ricevuta non è stata '
  'prodotta qui, ma è disponibile alla vendita). 0 = non è arrivato niente.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventario_produzione_ricevuto_nonneg'
      and conrelid = 'public.inventario_produzione'::regclass
  ) then
    alter table public.inventario_produzione
      add constraint inventario_produzione_ricevuto_nonneg check (ricevuto_g >= 0);
  end if;
end $$;
