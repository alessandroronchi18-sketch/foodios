# Diario agente — Sprechi e omaggi (`src/components/SpreciOmaggi.jsx`)

## 0% — avvio (19/09/2026)
- Letto CLAUDE.md, il file (961 righe), `lib/movimentiSpeciali.js`, `lib/dateLocal.js`, `lib/foodcost.js` (storico prezzi).
- Test esistenti: `tests/unit/perditeCessioni.test.js` NON monta il componente, cerca stringhe nel sorgente → da rifare montando.

## 20% — dati veri guardati (solo letture)
- Org reali: `Mara dei Boschi` (68 ricette, 44 prezzi ingredienti, **46 righe di storico prezzi** con `decorre_da` vero),
  `Gelateria Demo` (19 movimenti + 77 chiusure).
- I 19 movimenti in archivio hanno la forma VECCHIA (`data`/`nome`/`valore`, causali `rotto`/`omaggio_cliente`):
  la pagina li conta tutti come «date illeggibili». Il giorno però c'è (`data`, `creatoAt`) e l'importo pure (`valore`).
- Storico prezzi Mara, cambi veri: `acqua` 0→1 dal 17/09/2026, `Zucchero` 1,66→0,89 dal 31/12/2025,
  `DESTROSIO` 1,72→1,08 dal 31/10/2025, `succo limone` 4→1,5 dal 30/11/2025, `Base agrimontana cioccolato` 7,35→7,34.

## Difetti individuati (da correggere)
1. **[il più grosso] Il prezzo con cui si valorizza quello che si butta è sempre quello di OGGI.**
   `autoFcDaRicetta` usa `calcolaFC` (prezzi correnti) e il movimento non ha un campo data: `ts` = adesso.
   Chi registra stamattina l'invenduto di ieri/della settimana scorsa lo valorizza a prezzi di oggi.
   Va usato `calcolaFCStorico` + `pasticceria-log-prezzi-v1` alla data dello spreco.
2. **Un costo che manca viene contato come 0 €.** `diag` fa `Number(m.fcTot) || …` → i movimenti senza costo
   entrano nei totali come zero, e `causaliOrd`/`classifica` filtrano `eur > 0` → la pagina può dire
   «Nessuna perdita registrata nel mese. Ottimo controllo» mentre l'elenco sotto mostra i movimenti.
3. Da verificare: date (`toISOString`/confini mese), save-first, finestre del browser, touch target tablet, token.

- Prossimo passo: misurare con i dati veri quanto cambia il food cost a date diverse, poi correggere.

## 40% — corretti i primi difetti (20/09/2026)
Fatti (tutti in `src/components/SpreciOmaggi.jsx`, lint pulito):
- [x] **Prezzo alla data dello spreco.** Nuovo campo «Quando» nel form (default oggi, niente futuro) +
  `calcolaFCStorico` con `pasticceria-log-prezzi-v1` caricato dalla pagina (chiave condivisa, sede nulla).
  Cambiando il giorno il costo si ricalcola, ma solo se il numero è quello proposto dal programma.
  Misura sui dati veri di Mara: fra il 16 e il 20/09 cambiano 6 ricette su 68; LIMONE 1,19 € → 0,56 € (−53%).
  A novembre 58 ricette su 68 hanno un costo diverso.
- [x] **Il costo che manca non è più zero**: `costoMovimento()` torna `null`, `diag.nSenzaCosto` li conta,
  in archivio si scrive `fcTot: null` invece di 0, e il riepilogo del form dice «da indicare».
- [x] **`ts` dal giorno scelto** con `istanteDelGiorno` (mezzogiorno per i giorni passati, mai `toISOString`
  su una mezzanotte locale).
- [x] **`mieDelGiorno`** usava `ts.slice(0,10)` (giorno UTC) → `giornoDiTimestamp`.
- [x] **Mese svuotato**: `estremiMese('')` dava `{da:'-01', a:'-NaN'}` e nascondeva tutto → torna al mese corrente.
- [x] **Doppio invio**: `saving` + `disabled` sul bottone Registra.
- [x] **Registrazioni vecchie recuperate**: `normalizzaMovimento` legge `data`/`creatoAt`/`nome`/`valore`
  (19 righe su 19 in produzione, 363,77 €, erano tutte «illeggibili»).
- [x] **Ricavi del mese da una sola fonte**: tolto il secondo `sload` delle chiusure, si usa la prop.
- [x] **`dito = isMobile || isTablet`** introdotto.

Da fare: stati vuoti onesti, KPI «senza costo», tabella «non valorizzato», token (43), bersagli tablet, test.

## 60% — interfaccia e token
- [x] Stati vuoti onesti: «Ottimo controllo» solo quando davvero non c'è niente; se ci sono registrazioni
  senza costo lo dice (vale per «Per causale» e per «Prodotti con più perdite»).
- [x] KPI «Perdita totale»: sub con «N registrazioni senza costo, non contate».
- [x] Tabella e schede: «non valorizzato» al posto di «0,00 €».
- [x] Token: 43 deviazioni → **0** (12 colori + 31 misure). BLU/BLU_LIGHT → `T.blue`/`T.blueLight`,
  banner soglia → `T.redLight/redDark/red` e `T.amberLight/amberDark/amber`, tutti i `fontSize` → `font.size.*`.
- [x] Tablet: `dito` su select dei filtri (16px + 44px), bottoni causale, tre bottoni Elimina, Registra/Annulla.
- [x] `npm run grammar` pulito, `eslint src/` pulito (resta un errore in `CalendarioOperativo.jsx:645`, non mio).
- Prossimo passo: i test (montare il componente, ≥50 prove) + prova della mutazione.
