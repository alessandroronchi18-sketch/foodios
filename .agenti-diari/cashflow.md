# Diario agente — CashflowView

## 0% — avvio (19/09/2026)
- Letti CLAUDE.md e src/views/CashflowView.jsx (671 righe).
- Stato di partenza dichiarato: voto 43/100, zero test veri, 49 deviazioni token su 671 righe.

## 25% — lettura fatta + dati veri guardati (20/09/2026)

### Misure di partenza (verificate a mano, non dedotte)
- Deviazioni token in `CashflowView.jsx`: **49** = 25 `colore-a-mano` + 23 `testo-a-mano` + 1 `tripla-a-mano`.
  Colori scritti a mano: #6E0E1A #8B95A7 #0E1726 #475264 #FFF #E5E9EF #16A34A #B45309
  #FEE2E2 #94A3B8 #CBD5E1 #FEF9C3 #FDE68A #854D0E #FEF2F2 #FAFAF6 #F0FDF4.
  Misure a mano: fontSize 12/13/14/16/18/20 (tutte nella scala, ma scritte a mano).
  Obiettivo: sotto 2 ogni 100 righe → meno di ~14. Punto: arrivare vicino a 0.
- Test veri esistenti su questa pagina: **zero**. I tre `layoutViste*.test.jsx` la
  montano solo dentro un `it.skipIf(!ATTIVO)` che di norma non parte.

### Dati veri — org "Mara dei Boschi" 889e7fc2-fb93-42eb-96f1-e73b3e738a12 (sola lettura)
- `chiusure_cassa`: **0 righe in assoluto**. Quindi `mediaGiornaliera = 0`,
  `mediaMisurata = false`: oggi la pagina mostra il riquadro ambra "non ho abbastanza
  chiusure". Quel ramo è l'unico che si vede in produzione.
- `fatture`: 3.104 totali, **3.036 pagate**, **68 da pagare per 43.051,73 €**,
  `importo_pagato = 0` su tutte le 68, `data_scadenza` **NULL su tutte e 3.104**.
  Scadenza stimata (data fattura + 30 gg): **6 già scadute per 554,34 €**,
  62 future per 42.497,39 €. Nessuna fattura con `stato` NULL.
  4 note di credito (totale negativo), tutte già segnate pagate.
- `cashflow_eventi`: **0 righe in tutto il database** (nessuna org ne ha).
- `user_data` chiave `pasticceria-cashflow-settings-v1`: **nessuna riga, in nessuna org**.
  Quindi `settings.saldoOggi` è sempre 0 per default.
- Schema `cashflow_eventi`: data_attesa è `date` NOT NULL, importo `numeric` NOT NULL,
  descrizione nullable, stato NOT NULL.

### DIFETTI TROVATI (elenco di lavoro, ordine di gravità)

1. **[CFO, il peggiore] Il saldo che non c'è viene trattato come zero, e la pagina
   annuncia un giorno rosso che non sa.** `settings` nasce `{ saldoOggi: 0 }` e
   `timeline` parte da `Number(settings.saldoOggi) || 0`. Con i dati veri di Mara
   (saldo mai inserito, 554,34 € di scaduto recente) la pagina scrive oggi, in rosso:
   «Attenzione: cassa attesa negativa il 19 settembre — Saldo previsto: -554».
   Mara può avere 50.000 € in banca. `CashflowView.jsx:68,98,193,262`.
   Correzione: `saldoOggi: null` = "non lo so"; con saldo ignoto niente allarme rosso
   e il KPI cambia nome (non è una cassa, è una variazione).

2. **[numeri] Gli importi della pagina non hanno il simbolo €.** `fmt0` locale
   (riga 35) è `toLocaleString` nudo: i KPI scrivono «-43.051» invece di «43.051 €».
   In `src/lib/formatIt.js` esiste già `fmt0` che mette l'euro DOPO la cifra.
   `CashflowView.jsx:35-37` e tutti i callsite.

3. **[numeri all'italiana] «1.250» letto come 1,25.** Il campo del saldo e il campo
   dell'importo evento usano `Number(testo)`. Chi scrive «1.250» (milleduecento-
   cinquanta, come si scrive in Italia) salva 1,25 €. Esiste `leggiPrezzoKg`/
   `letturaPrezzoKg` in `formatIt.js` apposta. `CashflowView.jsx:266,283,292,409,616`.

4. **[date] `new Date(iso).toLocaleDateString()` senza l'ora.** Riga 518: la data del
   giorno rosso è costruita da `new Date('2026-09-24')`, che è mezzanotte a Greenwich.
   Due righe sotto (527) la stessa data è costruita bene, con `+'T12:00:00'`.
   Due modi nello stesso riquadro, e uno sbaglia il giorno a ovest di Greenwich.

5. **[dati] Gli eventi già passati si vedono ma non contano, e nessuno lo dice.**
   La query carica tutti gli eventi `pianificato` ordinati per data, anche quelli di
   ieri; `timeline` conta solo da oggi in avanti (`e.data_attesa === iso`, i=0..orizzonte).
   Un affitto pianificato la settimana scorsa e mai segnato pagato compare in elenco e
   pesa zero sulla previsione. Stessa famiglia dell'arretrato fatture, che invece è
   gestito. `CashflowView.jsx:91,242`.

6. **[design] L'elenco eventi è tagliato a 12 in silenzio.** `eventi.slice(0, 12)` con
   l'intestazione che dice «Eventi pianificati (20)». `CashflowView.jsx:632`.

7. **[due rossi] Il saldo sotto zero usa il bordeaux delle azioni, non il rosso
   d'allarme.** `color={... >= 0 ? GREEN : BRAND}` (443,451,452) e il riquadro del
   giorno rosso ha `border: 1px solid ${BRAND}` su fondo `#FEF2F2` (= T.redLight):
   fondo d'allarme, bordo d'azione. Regola del titolare 14/09/2026: sotto zero è
   allarme → `T.red`. `CashflowView.jsx:443,451,452,514,515,517`.

8. **[tablet/dito] Bersagli sotto la misura del polpastrello.** «Aggiungi evento»
   `padding: '7px 14px'` senza minHeight (~31px); le pastiglie 30/60/90 gg e il
   cestino elimina stanno a `minHeight: 40`. `ui.ctrlH` dice 44 su telefono E tablet.
   `CashflowView.jsx:561,600,646`.

9. **[accessibilità] Il grafico SVG non ha né ruolo né descrizione**, e i campi del
   modulo evento (tipo, descrizione, data, importo) non hanno etichetta: solo
   `placeholder`. `CashflowView.jsx:342,607-617`.

10. **[privacy] Il contesto passato all'AI porta gli eventi interi**, con
    `organization_id`, `sede_id`, `id`. Le fatture erano già state ridotte per lo
    stesso motivo (commento riga 537). `CashflowView.jsx:548`.

11. **[ingegneria] `isoLocale` è una copia locale di `formatLocalDate`** di
    `src/lib/dateLocal.js`: due regole per la stessa cosa. `CashflowView.jsx:55-58`.

12. **[token] 49 deviazioni** (vedi sopra), fra cui il ternario a tre vie del modulo
    evento (`isMobile ? '1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(5,1fr)'`, riga 606)
    che è esattamente la forma che `ui3(isMobile, isTablet, ...)` esiste per togliere.

### Prossimo passo
Correggere in quest'ordine: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11, poi i token (12),
`npx eslint src/ --quiet` dopo ogni sostituzione. Poi i test in
`tests/unit/cassaPrevistaDiceIlVero.test.jsx` (+ eventuali file per famiglia).

## 50% — correzioni applicate (20/09/2026)

Fatte tutte e 12 le voci dell'elenco sopra. `npx eslint src/ --quiet` pulito sul mio file
(resta un errore in `ProduzioneGiornalieraView.jsx:342` `'rientroDiMagazzino' is not defined`,
che è di un altro agente). `npm run grammar`: zero righe su CashflowView (le righe rosse sono
di `SpreciOmaggi.jsx`, altro agente).

**Deviazioni token: 49 → 0** (0,00 ogni 100 righe, obiettivo era sotto 2). Contate col
righello vero (`scripts/check-design-tokens.mjs` replicato: commenti esclusi, tre notazioni
esadecimali). File passato da 671 a 844 righe.

Cosa è cambiato, in breve:
- `settings.saldoOggi` nasce `null`, non 0; `saldoNoto`/`saldoPartenza`; niente
  `primoGiornoRosso` senza saldo; il KPI si rinomina «Variazione di cassa in Ngg».
- `fmt0` locale buttato, si usa quello di `lib/formatIt` (€ dopo la cifra).
- `leggiImporto()` nuova, esportata: regola italiana + segno meno (il conto scoperto esiste).
  I due campi passano da `type=number` a `type=text inputMode=decimal`.
- `giornoEsteso()`/`giornoBreve()` nuove, esportate: le date si formattano dai pezzi della
  stringa, mai da `new Date(iso)`.
- Eventi arretrati contati al giorno 0 + pastiglia «in ritardo» in elenco.
- «Ne mostro 12 su N» sotto l'elenco.
- Rosso d'allarme (`T.red`) su saldo sotto zero, riquadro giorno rosso, pallino del grafico.
- Bersagli da `ui3(isMobile, isTablet, ui.ctrlH/ctrlHsm)`; griglie da `ui3`; `span 3` su
  tablet corretto in `span 2` (mandava la pagina in orizzontale).
- `role="img"` + didascalia sul grafico; `aria-label` sui quattro campi; `<label>` sul saldo.
- Contesto AI ridotto ai campi che servono; niente `organization_id`/`sede_id` fuori.
- `.neq('stato','pagata')` → `.or('stato.is.null,stato.neq.pagata')`: in SQL `NULL <> 'pagata'`
  non è vero, quindi una fattura senza stato spariva dalla previsione.
- `isoLocale` locale eliminata: si usano `todayLocal`/`giorniFaLocal` di `lib/dateLocal`.

### Prossimo passo
Scrivere i test in `tests/unit/`. Verificato che `process.env.TZ` si può cambiare a caldo in
Node (provato: `new Date('2026-09-24')` a Los Angeles dà «23 settembre»), quindi il difetto
delle date si può provare DAVVERO, non solo a parole.

## 60% — primo file di prove verde e con la mutazione provata (20/09/2026)

`tests/unit/aiutoCashflow.jsx` — impalcatura: finto Supabase che FILTRA davvero
(eq/neq/gte/lte/is/or), finto storage, fabbriche `fattura`/`chiusura`/`evento`, montaggio
dentro `ConfirmProvider` (così `useConfirm` non ricade su `window.confirm`).

`tests/unit/cassaSenzaSaldoNonEZero.test.jsx` — **25 prove, tutte verdi.**
Prova della mutazione fatta: rimesso il codice di prima (8 punti: `saldoOggi: 0`,
`primoGiornoRosso` senza guardia, etichetta KPI fissa, avviso legato a `!saldoOggi`,
`saldoTesto` che nasconde lo zero, `Number(testo) || 0`) → **7 prove diventano rosse**,
poi ripristinato e di nuovo 25/25.

### Prossimo passo
File B: numeri all'italiana, simbolo €, date e fusi (verificato che `process.env.TZ` si
cambia a caldo dentro vitest). Poi file C (eventi/fatture) e file D (tablet/colori/token).

## 70% — secondo file di prove (20/09/2026)

`tests/unit/cassaNumeriEDateItaliane.test.jsx` — **44 prove, tutte verdi.**
Mutazione provata (fmt0 locale senza €, `Number(testo)` al posto di `leggiImporto`,
`type="number"` sui due campi, date da `new Date(iso)`): **28 prove su 44 diventano rosse.**

Nota onesta sul fuso: `process.env.TZ` cambiato a caldo NON funziona dentro vitest (il
runtime tiene in cache il fuso), quindi le due prove sul fuso non usano quello. Usano
`Intl` con `timeZone` esplicito e mettono a confronto le due letture dello stesso giorno:
si dimostra che il modo vecchio sbaglia **730 volte su 1.825** (365 giorni × 5 fusi: sbaglia
tutti i giorni dell'anno nei due fusi a ovest di Greenwich) e che quello nuovo non si muove
mai. A Roma il difetto non si vede, ed è per questo che era sopravvissuto.

### Prossimo passo
File C: eventi arretrati, elenco tagliato a 12, conferma in-app, fatture senza stato,
scaduto recente/vecchio, note di credito. Poi file D: tablet, colori, token, accessibilità.

## 80% — terzo file di prove (20/09/2026)

`tests/unit/cassaEventiEFattureCheContano.test.jsx` — **29 prove, tutte verdi.**
Mutazione provata (eventi arretrati non contati, pastiglia «in ritardo» tolta, elenco
tagliato in silenzio, `.neq('stato','pagata')` al posto dell'`.or`): **6 prove diventano
rosse**, una per difetto più quelle intorno. Ripristinato: 29/29.

Totale finora: 25 + 44 + 29 = **98 prove**.

### Prossimo passo
File D: tablet/dito, i due rossi, accessibilità del grafico, cricchetto dei token.
Poi `npx vitest run` completo e referto.

## 90% — quarto file di prove verde (20/09/2026)

`tests/unit/cassaSulDitoEColori.test.jsx` — **37 prove, tutte verdi** al primo colpo.
Copre: bersagli sul dito alle tre larghezze (+ le soglie 767/768/1023), riquadro che
sfondava la griglia del tablet, i due rossi, didascalia del grafico ed etichette dei campi,
niente emoji, cricchetto dei token (colori/misure/ternari a tre vie + le chiavi di
`theme.js` devono esistere davvero).

Totale: 25 + 44 + 29 + 37 = **135 prove**.

### Prossimo passo
Prova della mutazione sul file D, poi `npx vitest run` completo e referto.

## 95% — mutazione provata anche sul file D (20/09/2026)

Rimessi i comportamenti vecchi (bersagli fissi invece di `ui3(...ui.ctrlH)`, `span 3` su
griglia da due, i due rossi scambiati in tre punti, grafico senza `role`/didascalia, un
campo senza etichetta, `BIANCO = '#FFF'` scritto a mano): **19 prove su 37 diventano rosse**.
Ripristinato: 37/37.

Riepilogo delle quattro prove della mutazione:
- file A saldo: 7 rosse su 25
- file B numeri e date: 28 rosse su 44
- file C eventi e fatture: 6 rosse su 29
- file D dito e colori: 19 rosse su 37

### Prossimo passo
`npx eslint src/ --quiet`, `npm run grammar`, `npx vitest run` completo, referto.

## 100% — finito (21/09/2026)

Verifiche finali:
- `npx eslint src/ --quiet` → pulito
- `npm run grammar` → «nessun errore grammaticale italiano trovato»
- `npm run design` → «nessuna nuova deviazione dai token». Su `CashflowView.jsx`:
  **0 deviazioni su 843 righe** (erano 49 su 671, cioè 7,3 ogni 100).
- I cinque file girati per nome: **153 prove verdi**, di cui 18 di
  `chiusureUnaSolaFonte.test.js` (preesistente, verde: il rosso segnalato era la
  fotografia di un altro agente in prova di mutazione) e **135 mie**.

`tests/unit/aiutoCashflow.jsx` NON è un avanzo: è l'impalcatura condivisa dei quattro file
di prove (finto Supabase che filtra come Postgres, finto storage, fabbriche di righe,
montaggio dentro `ConfirmProvider`). Sta in `tests/unit/` come il gemello già in uso
`tests/unit/aiutoFornitori.jsx`, e `vitest.config.js` raccoglie solo `*.test.{js,jsx}`
quindi non viene mai eseguito come prova.

Niente commit, niente push, `scripts/design-tokens-baseline.json` non toccato.
