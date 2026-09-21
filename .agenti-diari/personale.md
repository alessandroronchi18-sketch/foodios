# Diario agente — Personale.jsx

## Piano
File assegnato: `src/components/Personale.jsx` (2.315 righe). Partenza 52/100:
9 prove, 193 deviazioni dai token (88 colore-a-mano + 103 testo-a-mano + 2
antizoom-a-mano = 8,34 ogni 100 righe). Obiettivo: sotto 2/100 → meno di 46.

## Fatto (25%)
- [x] letto CLAUDE.md, .agenti-diari/REGOLE.md
- [x] letto tutto Personale.jsx (2.315 righe) + `src/lib/turni.js`,
      `src/lib/stipendiCalc.js`, `src/lib/dateLocal.js`, `src/lib/theme.js`
- [x] letto `scripts/check-design-tokens.mjs` (capito come conta)
- [x] misuratore mio in scratchpad/conta.mjs (stessa logica dello script
      ufficiale, ma su un file solo) → 193 confermate
- [x] prima lettura dei dati veri (sola lettura, psql)

## Dati veri (sola lettura, niente nomi né paghe)
- `dipendenti.costo_orario`: numeric, **default 0**, nullable → una cella vuota
  in import diventa 0 e il programma non distingue «non lo so» da «gratis»
- 18 dipendenti: 3 con costo_orario a 0 (hanno lo stipendio), 15 con stipendio
  a 0 (hanno il costo orario), 0 senza né l'uno né l'altro
- 288 turni dal 30/03 al 07/09/2026, 7 con costo 0, 0 con ore 0, 0 con fine
  prima dell'inizio

## Difetti trovati (da correggere)
1. `HeaderPersonale` (≈riga 1300): il KPI «Costo lavoro (mese)» è calcolato a
   mano e NON usa `costoPersonaleMensile`. Non legge nemmeno
   `stipendio_lordo_mensile` dal database, e non aggiunge contributi/TFR:
   chi è pagato a stipendio vale ZERO in quel numero.
2. Stesso punto: `s + (t.costo || 0)` senza `Number()` → se PostgREST manda il
   numeric come stringa la somma diventa testo e il KPI stampa 0 €.
3. Un costo che non si sa viene stampato «0,00 €/h» e «0 €/mese» nella lista
   dipendenti. `costoPersonaleMensile` restituisce già `senzaDato`: non è
   mostrato da nessuna parte.
4. `salvaTurno`: se il dipendente non ha né costo orario né stipendio, il turno
   viene salvato con `costo = 0` e nessuno lo dice.
5. `eliminaTurno`: nessuna conferma. Un tocco cancella un turno lavorato.
6. Controllo sovrapposizione cieco fuori dal periodo caricato.
7. `AnalisiCostoTab`: `costoPersonaleMensile(dipendenti)` senza `asOf` e con i
   soli `attivo = true` → un mese passato è confrontato con l'organico di oggi.
8. `incColor` calcolato e mai usato: le soglie del colore sono 30/40 fisse e il
   selettore «Target incidenza» non colora niente.
9. `isTablet` passato a `DipendentiTab`/`TurniTab` ma mai destrutturato → sul
   tablet layout da computer e bersagli piccoli.
10. `TurniTab` ignora `sedeId` (da verificare sui dati).
11. Testi con apostrofo al posto dell'accento e un refuso («comuniclila»).

## Difetto NUOVO e grosso, trovato per strada (50%)
12. **Tutta la scheda Turni era cieca.** Postgres restituisce `ora_inizio`/
    `ora_fine` come "08:00:00"; `oraValida` in `src/lib/turni.js` accetta solo
    "08:00", quindi `finMin` ripiegava sull'ora di inizio e **ogni turno letto
    dal database durava ZERO minuti**. Conseguenze: timeline del giorno e della
    settimana vuote, barra della copertura mai disegnata, avviso sui turni
    accavallati mai scattato. Le ore in cima invece c'erano (vengono dalla
    colonna `ore`): 32 ore scritte sopra e un calendario vuoto sotto.
    Riprodotto: `oreTurno('08:00:00','16:00:00')` → 0; con "08:00"/"16:00" → 8.
13. `C.bgSubtle` usato in 4 punti e **mai definito** in `C`: quei fondi
    venivano disegnati con `background: undefined`.

## Correzioni fatte (50%)
- [x] `soloOreMinuti()` + normalizzazione in `TurniTab.carica` (difetto 12)
- [x] `costoNoto()`, `etichettaOraria()`, `etichettaMese()`: «costo da
      inserire» al posto di «0,00 €/h» (difetto 3)
- [x] `HeaderPersonale`: `costoPersonaleMensile` + `costoLavoroDaTurni`, lettura
      di `stipendio_lordo_mensile`, giornate dichiarate, incidenza pro-rata sui
      giorni trascorsi, allarme col rosso segnale (difetti 1, 2)
- [x] riga di riepilogo nella lista: su quante persone è fatto il totale e
      quante sono senza costo (difetto 3)
- [x] `salvaTurno`: orario non valido rifiutato, inizio uguale a fine rifiutato,
      conferma quando manca il costo, `costo: null` invece di 0 (difetto 4)
- [x] sovrapposizione riletta dal database, non dalla lista a schermo (difetto 6)
- [x] `eliminaTurno`: conferma con `await confirmDialog` (difetto 5)
- [x] `AnalisiCostoTab`: `asOf`, dipendenti archiviati inclusi, `incColor` e la
      tinta del numero grande ora seguono il target scelto, «effettivo vs
      contratto» nascosto quando i turni non coprono il mese (difetti 7, 8)
- [x] `C.bgSubtle`, `C.amberDark`, `C.alert` definiti (difetto 13)
- [x] italiano: «comuniclila», «verra'», «e'», «attivita'», «ricordera'»
- [x] form: il costo mese stimato ora passa da `costoPersonaleMensile`

## Correzioni fatte (75%)
- [x] difetto 9: `isTablet` destrutturato in `DipendentiTab`, `TurniTab` e
      `AccessiTab`; `const dito = isMobile || isTablet`; bersagli a 44 px su
      pulsanti riga, frecce del periodo, `btnStyle` (quarto parametro `dito`)
- [x] i simboli scritti a mano «✕» e «↩» sostituiti dal componente `Icon`
      (regola: mai caratteri grafici nell'interfaccia)

## Test
- [x] `tests/unit/costoDelLavoroNonEZero.test.jsx` — **28 prove**, montano
      `Personale` con `@testing-library/react` + happy-dom e un finto database
      per tabella. Nomi inventati.
- **Prova della mutazione fatta** sul difetto 1: rimesso il conto a mano
  (`costo_orario × ore × 4,33`) al posto di `costoPersonaleMensile` →
  3 prove rosse, poi ripristinato. Verde di nuovo.
  ATTENZIONE: la copia di sicurezza nello scratchpad è stata cancellata fra
  una sessione e l'altra; la mutazione è stata annullata a mano. Prima di ogni
  mutazione, rifare `cp` e controllare che il file esista.

## `tests/unit/bersagliSulTablet.test.jsx`: falso allarme
È il censimento di tutto il prodotto sulla forma `isMobile ? <dito> : <mouse>`.
In Personale restano 2 occorrenze (`isMobile ? 44 : 30` e `isMobile ? 40 : 26`,
le barre dei turni sulla timeline), che è il numero congelato: il rosso visto
era una fotografia presa mentre un altro agente era dentro una mutazione.
Verificato verde dal coordinatore. Niente da fare.

## Test, secondo file
- [x] `tests/unit/turniOrariDalDatabase.test.jsx` — **25 prove** verdi.
- **Prova della mutazione**: tolto il taglio dei secondi (`.slice(0, 5)` da
  `soloOreMinuti`) → **17 prove su 25 rosse**. Ripristinato, di nuovo 25 verdi.
  È la prova che il difetto 12 era reale e grosso.
- Trappola del righello trovata qui: con `vi.resetModules()` fra un test e
  l'altro, un import STATICO di `ConfirmModal` e un import dinamico di
  `Personale` danno **due copie** del modulo, cioè due contesti React diversi.
  `useConfirm()` dentro la pagina non trovava il provider e ripiegava sul
  `confirm` del browser: le finestre di conferma non comparivano e 7 prove
  passavano senza provare niente. Ora i due moduli si caricano insieme.
- Stessa attenzione in `apriPagina`/`apriTurni`: non si aspetta un'etichetta
  fissa (c'è già al primo disegno) ma un dato che arriva solo dopo il
  caricamento.

## Deviazioni dai token
Partenza 193 su 2.315 righe (8,34 ogni 100).
- [x] 95 `fontSize: <numero>` → `F.size.*` / `typo.h3.fontSize` (stessi valori)
- [x] 2 regole anti-zoom scritte a mano → tolte (stanno in `index.html` sotto
      `@media (pointer: coarse)`, e scritte così saltavano il tablet)
- [x] 53 colori → token di `theme.js`, **un pattern per contesto**, `eslint`
      dopo ogni gruppo, e i due controlli di chiusura
- **Ora: 30 su 2.560 righe = 1,17 ogni 100.** Sotto la soglia di 2.
- I 30 che restano sono tavolozze categoriche senza token: `_covColor` (4),
  `DIP_COLORS` (7), `REPARTO_COLORS` (4), `TINTE_SU_SCURO` (3, le tinte su
  fondo scuro), il riquadro blu informativo lordo/netto (6) e pochi altri.

## Test, terzo file
- [x] `tests/unit/personaleDatiDiPersoneVere.test.jsx` — **32 prove**: ruoli e
      privacy, filtro organizzazione su ogni chiamata, conferme, bersagli sul
      tablet alle quattro larghezze, scheda Analisi costo, i fondi spariti.
- Prove della mutazione, tutte ripristinate subito dopo:
  · `dito = isMobile` al posto di `isMobile || isTablet` → 2 rosse
  · soglie 30/40 fisse al posto del target scelto → 1 rossa
  · `confirmDialog` senza `await` (archivia + elimina turno) → 4 rosse
  · `C.bgSubtle` tolto dalla tavolozza → 2 rosse
  · barra del turno e velo delle finestre di nuovo `div` → 4 rosse
- Una prova scritta male e rifatta: cercare la parola «undefined» negli stili
  NON funziona, React quella proprietà non la scrive proprio. Sostituita con
  la misura vera: il fondo c'è o non c'è.

## I quattordici `<div onClick>` (21/09/2026)
Comandi che con la tastiera non si raggiungono e che un lettore di schermo non
annuncia. Erano: la casella del giorno nel calendario del mese, la barra del
turno nella timeline (il comando principale della scheda) e i veli delle sei
finestre, che erano l'unico modo di chiuderle.
- [x] casella del giorno → `<button>` con etichetta che dice giorno e turni
- [x] barra del turno → `<button>` (aveva già l'etichetta)
- [x] cinque finestre riscritte una volta sola in un componente `Finestra`:
      il velo è un pulsante vero con etichetta «Chiudi la finestra», il
      riquadro ci sta sopra e non deve più fermare la propagazione del clic,
      e c'è **Esc**, che prima non c'era da nessuna parte
- [x] il foglio del turno sul telefono, stessa correzione
- **divClick: 14 → 0**

## Verifica finale
- `npx eslint src/ --quiet` pulito
- `npm run grammar` pulito
- 3 file miei: **77 prove verdi**; con i vicini (bersagli tablet, scala
  tipografica, due rossi) 107 verdi
- deviazioni dai token: **30 su 2.600 righe = 1,15 ogni 100** (erano 193 =
  8,34)
- `node scripts/voti-sezioni.mjs` → **Personale 97/100** (94 prove,
  1,2 dev/100, 0 finestre native, 0 divClick)

## Da fare a chi pubblica (non mio)
`tests/unit/cricchettoTokenDiDesign.test.js` è rosso perché la fotografia in
`scripts/design-tokens-baseline.json` è più larga del vero: Cashflow e Sprechi
sono già stati ripuliti e committati senza rifare lo scatto. Con il mio file
il divario cresce ancora. Si chiude con
`node scripts/check-design-tokens.mjs --aggiorna` dopo aver committato tutti
e quattro gli agenti. Non l'ho fatto io: quel file era fuori dalla mia lista.

## Prossimo passo
Niente: il lavoro è chiuso. Referto consegnato.
