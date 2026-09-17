# Diario agente DATE — audit Foodos 16/09/2026

## Mandato
La famiglia di difetti più ostinata: la data calcolata in UTC invece che
nell'ora locale italiana. Uscita cinque volte, corretta ogni volta solo dove
si vedeva.

## Piano (scritto prima di cominciare)
1. Leggere `dateLocal.js`, `periodoAnalisi.js`, `vitest.config.js` e
   `fusoOrarioDeiTest.test.js` per capire la forma della famiglia. [fatto]
2. Inventario: ogni `new Date(` su stringa, ogni `toISOString`, ogni
   `getTime()`, ogni `gte`/`lte`, nei MIEI file. Poi giudizio uno per uno.
3. Ora legale: il 25/10/2026 l'Italia passa da +2 a +1. Verificare le
   finestre che attraversano quel giorno (30 giorni, periodo precedente).
4. Cercare date del database finite sotto gli occhi del titolare.
5. Correzioni + tre test per famiglia (riproduce / correzione / intorno).
6. Verifica con TZ=Europe/Rome, UTC, Pacific/Auckland, America/Los_Angeles.

## Stato
- [x] Letto REGOLE.md, CLAUDE.md, dateLocal.js, periodoAnalisi.js
- [x] Letto vitest.config.js e fusoOrarioDeiTest.test.js (le due correzioni di oggi)
- [ ] Inventario dei punti data nei miei file
- [ ] Giudizio punto per punto
- [ ] Correzioni
- [ ] Test

## Nota sui file assegnati
`src/views/StoricoView.jsx`, `src/views/PrevisioneView.jsx` e
`src/lib/previsione*.js` non esistono con quel nome: cerco i veri.

## Prossimo passo
Inventario dei punti data.

---

## 25% — inventario fatto (16/09/2026)

### Difetti trovati (da correggere)
| # | dove | cosa vede il titolare |
|---|---|---|
| D1 | `RegistroAttivita.jsx:336` `(r.created_at\|\|'').slice(0,10)` | il registro raggruppa per giorno **UTC**: le azioni fra mezzanotte e le 02:00 finiscono sotto l'intestazione di ieri |
| D2 | `RegistroAttivita.jsx:74-82` `fmtDayHeader` con `toISOString()` | «Oggi»/«Ieri» calcolati in UTC: ieri sera etichettata «Oggi» |
| D3 | `RegistroAttivita.jsx:315` | «Azioni oggi» conta il giorno UTC contro `today` locale: sottoconta |
| D4 | `RegistroAttivita.jsx:187` preset periodo `toISOString().slice(0,10)` | «Ultimi 30 giorni» parte da un giorno prima |
| D5 | `RegistroAttivita.jsx:207-208,231-232` `gte('created_at', '<g>T00:00:00')` | la finestra verso il DB è 02:00→01:59: un'ora e mezza di lavoro notturno nel giorno sbagliato |
| D6 | `ForecastView.jsx:80` `.gte('data', oggiUTC)` | fra mezzanotte e le due la previsione di ieri torna in cima |
| D7 | `ForecastView.jsx:52-53` finestra 60 giorni mista | la diagnosi «pochi giorni» conta 59 o 60 secondo l'ora |
| D8 | `StoricoProduzioneView.jsx:124-125` | il periodo di default parte **sempre** un giorno prima del dovuto |
| D9 | `periodCompare.js:108,130` `end-start` in millisecondi | ora legale: il periodo precedente di «ultimi 30 giorni» a cavallo del 25/10 ne prende 31 |
| D10 | `periodCompare.js:160` `new Date('AAAA-MM-GG')` in `inPeriod` | mezzanotte UTC contro mezzanotte locale |
| D11 | crons: `new Date().toISOString().slice(0,10)` | oggi **non** è rotto (schedule 07:00/20:00 UTC) ma dipende in silenzio dall'orario dello schedule |

### Giudicati CORRETTI (con la ragione)
- `ChiusuraView.jsx`: usa `todayLocal()` e ovunque il pattern `+'T12:00'`. `salvatoAt: new Date().toISOString()` è un **istante**, UTC giusto.
- `CalendarioOperativo.jsx`: `toISO()` è un formattatore locale, la griglia è costruita con `new Date(anno, mese, g)`.
- `periodoAnalisi.js:giorniDelPeriodo`: `Math.round` sui giorni — già a prova di ora legale (da verificare col test).
- cron `expires_at`/`sent_email_at`/`started_at`/`triggered_at`: istanti assoluti, UTC giusto.

## Prossimo passo
Scrivere gli helper nuovi in `dateLocal.js` e `periodoAnalisi.js`, poi correggere D1-D11.

---

## 50% — ripresa dopo interruzione (16/09/2026)

### D1-D11: CHIUSI, verificati riga per riga
Il lavoro era già stato fatto prima dell'interruzione, il diario si era
fermato al 25%. Verifica fatta adesso, una per una:

- D1 `RegistroAttivita.jsx` → `giornoDiTimestamp(r.created_at)` [ok]
- D2 → `nomeDelGiorno()` da `periodoAnalisi` [ok]
- D3 → `giornoDiTimestamp` contro `today` locale [ok]
- D4 → `giorniFaLocal(preset.giorni)` [ok]
- D5 → `inizioGiornoLocale` / `fineGiornoLocale` con `.lt()` [ok]
- D6 `ForecastView.jsx:96` → `.gte('data', todayLocal())` [ok]
- D7 → `giorniFaLocal(59)` + confronto fra stringhe [ok]
- D8 `StoricoProduzioneView.jsx:136` → `formatLocalDate(new Date(y, m-2, d))` [ok]
- D9 `periodCompare.js:giorniFra` → `Math.round(ms/86400000)` [ok]
- D10 `periodCompare.js:inPeriod` → `'<giorno>T12:00:00'` [ok]
- D11 crons → esiste `giornoItaliano()` in `dateLocal.js` (Intl su Europe/Rome)

Baseline verde: `dateLocal`, `periodCompare`, `periodoAnalisi`,
`dateLocaliNonUTC`, `fusoOrarioDeiTest` passano con TZ=Europe/Rome.

### Il censimento del sotto-agente NON è su disco
`.agenti-diari/censimento-date.md` non esiste (cartella verificata). Riparto
dai file:riga che mi sono stati dettati, e rifaccio la spazzata da solo sui
miei file.

## Prossimo passo
Fascia 1 — i difetti che spostano un incasso o una data fiscale.

---

## 75% — correzioni fatte (16/09/2026)

### Gli attrezzi nuovi, tutti in `src/lib/dateLocal.js`
Erano la radice: mancava un modo di sommare giorni che non passasse da
`new Date('AAAA-MM-GG')` (mezzanotte a Greenwich) e da `toISOString()`
(che a Greenwich ci riporta). Il conto adesso si fa in UTC interno, dove i
giorni durano 24 ore per definizione, e il fuso di chi guarda non entra mai.

- `aggiungiGiorni(giorno, n)` · `differenzaGiorni(da, a)` · `giorniTra(da, a)`
- `lunediDellaSettimana(g)` · `primoGiornoDelMese(g)` · `ultimoGiornoDelMese(g)`
- `aggiungiMesi(g, n)` (31 gennaio + 1 mese = 28/29 febbraio) · `meseLocale()`
- `giorniFaItaliano(n)` · `ieriItaliano()` — per cron e webhook
- `inizioGiornoItaliano(g)` / `fineGiornoItaliano(g)` — la finestra di una
  giornata di Roma vista da un server UTC, offset chiesto a Intl (due passate
  per i due giorni del cambio ora)
- `giornoItalianoDi(v)` — distingue un GIORNO già fatto da un ISTANTE, che è
  la confusione da cui nascevano i difetti delle integrazioni

### Fascia 1 — quello che sposta un incasso o una data fiscale
| dove | cosa succedeva |
|---|---|
| `api/sdi-emit-invoice.js:327-328` | data e scadenza della fattura elettronica dal giorno UTC; il 1° gennaio alle 00:30 usciva datata 31 dicembre (anno ed esercizio sbagliati). Ora `giornoItaliano()` + `aggiungiGiorni(...,30)` |
| `api/lib/fattureInCloud.js:151` | stesso ripiego, un piano sotto |
| `api/webhook-zucchetti.js:84` | senza data dal registratore, la vendita delle 00:30 tornava di ieri e **sovrascriveva la chiusura già salvata** |
| `api/sync-delivery.js:27` | «ieri» del cron notturno preso in UTC |
| `api/sync-delivery.js:114-115` | la finestra chiesta a SumUp erano le 24 ore **UTC**: fuori le prime due ore della giornata di Torino, dentro le ultime due della sera prima. Ogni notte, in automatico |
| `api/sync-delivery.js:96,128` | il giorno dell'incasso tagliato dai primi 10 caratteri di un istante |
| `src/lib/venditeB2B.js:147,194` | consegna e incasso B2B registrati dopo mezzanotte finivano nel giorno prima |
| `src/views/CashflowView.jsx:161-175` | la media ricavi 60gg confrontava `new Date(c.data)` (mezzanotte UTC) con l'istante di adesso: la chiusura di oggi entrava solo dopo le 02:00. Denominatore in ms → il 25/10 perdeva un giorno e gonfiava la media |
| `src/views/CashflowView.jsx:194` | la previsione di cassa avanzava di `i*86400000`: il 25/10 ripeteva un giorno e ne saltava un altro, e il «primo giorno rosso» aveva la data sbagliata |
| `src/views/OrdiniAiView.jsx:75,101` | il consumo medio che decide quanto ordinare escludeva la chiusura di oggi prima delle 02:00 |
| `src/views/MenuEngineeringView.jsx:93` | stessa finestra, stessa famiglia |
| `api/lib/aiEngine.js:98-115,250,269,277,292` | il riassunto dell'assistente girava sul giorno **UTC** (il commento diceva «locale», ma su Vercel locale = Greenwich): «ricavi di ieri» erano dell'altro ieri |
| `api/tv.js:108` | lo schermo in laboratorio, la sera, avrebbe mostrato la produzione di domani a zero |

### Fascia 2 — le finestre che sbagliano al bordo
- `src/lib/fornitoriDaFatture.js:42-48` — «ultimi 30 giorni» ne contava 31 (soglia a −30 con `>=`) e con `toISOString()` 32. Ora `aggiungiGiorni(oggiISO, -29)`.
- `src/components/ImportWizard.jsx:262` — il controllo duplicati leggeva un mese corto di un giorno: i dati già caricati del 31 non facevano scattare l'avviso e l'import li raddoppiava in silenzio.
- `src/components/Personale.jsx` — il planning turni: il 29 marzo 2026 la settimana stampava il 29 due volte e il 30 spariva; «settimana successiva» dal 29 marzo portava al 4 aprile. Corretti `anchor`, `isoMonday`, `rng`, `days`, `shiftPeriodo`, le etichette, il `lead` del calendario mensile, i due `todayIso` e i due mesi.
- `src/views/QuadraturaInventarioView.jsx:30-38,807` — `addDays` e le etichette della settimana.
- `src/components/Haccp.jsx:786` · `src/lib/sepa.js:92` · `src/lib/importCassa.js:395` · `src/components/DailyBriefCard.jsx:73` · `src/lib/costiAziendali.js:174`.

### Fascia 3 — pannello interno
`api/lib/admin/usoPagine.js:17`, `salute.js:48`, `telemetriaAi.js:33`,
`src/lib/exportPDF.js:530,652` (nomi dei file).

### Giudicati CORRETTI (non toccati)
- `api/webhook-pos.js` — la data è **obbligatoria** (400 se manca), nessun
  ripiego UTC; `received_at: new Date().toISOString()` è un istante, giusto.
- `src/components/Haccp.jsx:soglieDate` — Date locali, mai `toISOString()`.
  (Nota: la settimana lì comincia di domenica, non di lunedì. È una scelta,
  non un difetto di fuso.)
- Tutti gli `expires_at`, `received_at`, `generato_il`, `aggiornato_il`,
  `salvatoAt`: sono ISTANTI, e in UTC stanno bene.

### Difetti in file di ALTRI agenti — da girare
- `src/lib/inventarioProduzione.js:1066` `lunediDellaSettimana(dateIso)`:
  `new Date(dateIso)` è mezzanotte UTC, poi `.setHours(0,0,0,0)` la porta al
  giorno LOCALE che contiene quell'istante. In Italia torna per un'ora di
  margine; a ovest di Greenwich dà il lunedì della settimana prima. Chiamata
  senza argomento è corretta. C'è già `lunediDellaSettimana` in `dateLocal.js`
  che fa il conto giusto: basta importarla.

## Prossimo passo
I test: riproduzione, correzione, e la famiglia intorno. Poi le quattro TZ.

---

## Ripresa (16/09/2026) — il test rosso era mio, e aveva ragione lui

### Il righello che mentiva su se stesso
`giorniDiCalendarioNonMillisecondi.test.js` affermava: «la somma in
millisecondi sbaglia in ogni fuso che ha l'ora legale». Falso, e falso in un
modo che vale la pena scrivere.

Sommare 24 ore a mezzanotte del giorno che ne dura **23** porta all'una del
giorno dopo: il giorno giusto, per fortuna. Sommarle a quello che ne dura
**25** porta alle 23:00 dello stesso giorno: un giorno indietro. All'indietro
succede il contrario. Quindi ogni fuso con l'ora legale ha **una direzione
rotta per ciascuna delle sue due notti**, non due su due. Il test chiedeva
`sbagliati.length === cambi.length` e otteneva 1 su 2, dovunque.

Corretto rendendo vera l'affermazione invece che comoda:
- `oreDelGiornoLocale(g)` nuovo: dice se il giorno dura 23, 24 o 25 ore;
- l'asserzione ora è «una delle due direzioni sbaglia sempre», **e** lega
  quale delle due alla durata del giorno (>24 → avanti, <24 → indietro);
- aggiunto un test sulla forma vera del difetto: una finestra di 60 giorni che
  **attraversa** il cambio di QUEL fuso, costruita su `giorniConCambioOra` e
  non su date italiane scritte a mano. Da Auckland il 25 ottobre non dimostra
  niente; il 5 aprile sì.
- il ramo UTC ora prova entrambe le direzioni e dice perché lì tace.

Verificato il righello con una mutazione: rimesso il vecchio conto in
`aggiungiGiorni`, il file fallisce **10 test** a Roma, ad Auckland e a Los
Angeles, 0 in UTC. Ripristinato.

Verde: 40/40 con TZ=Europe/Rome, UTC, Pacific/Auckland, America/Los_Angeles.

## Prossimo passo
Il censimento (ora è su disco, 32 voci): verifica voce per voce di cosa è già
corretto e cosa resta. Fascia 1 per prima.

---

## Il quinto attrezzo rotto: `TZ=` non arriva ai test

Mentre verificavo le correzioni ho scoperto che **tutte le verifiche «nelle
quattro TZ» fatte finora non verificavano niente**.

`vitest.config.js:21` dice:

```js
process.env.TZ = process.env.TZ_TEST || 'Europe/Rome'
```

Quindi `TZ=Pacific/Auckland npx vitest run ...` viene **sovrascritto** e gira
comunque a Roma. La riga è giusta e ben motivata (il commento sopra racconta
perché: la suite falliva in CI perché i test di contrasto non hanno senso in
UTC), ma la conseguenza è che la variabile da usare è `TZ_TEST`, non `TZ`.

Me ne sono accorto per caso: una mutazione che in UTC doveva essere innocua
faceva fallire un test lo stesso. Il righello diceva «quattro fusi», e ne
misurava uno.

**Il comando giusto è:**
```
TZ_TEST=Pacific/Auckland npx vitest run tests/unit/<file>
```

Rifatta la verifica sul serio, e sono usciti **due difetti veri nei miei
test** — entrambi la stessa trappola descritta in `fusoOrarioDeiTest.test.js`:
un'asserzione di *contrasto* («col vecchio conto veniva diverso») che in UTC è
falsa, perché lì non c'è nessuna differenza da mostrare. Corretti mettendo la
guardia sull'offset e, dove si poteva, sostituendo il contrasto con un fatto
indipendente dal fuso.

**Nota per chi legge:** `fusoOrarioDeiTest.test.js` afferma di proposito che il
fuso è Europe/Rome. È il controllo di taratura: sotto `TZ_TEST=UTC` deve
fallire, ed è corretto così. Non è un test da «aggiustare».

## Correzioni di questo giro (censimento)

| # | dove | cosa succedeva |
|---|---|---|
| 28 | `api/sdi-emit-invoice.js:204` | la chiave di idempotenza della fattura elettronica portava il giorno **UTC**. Due retry del webhook a cavallo della mezzanotte di Greenwich (01:00/02:00 italiane) → due chiavi → **due fatture**. E dopo la correzione della riga 327 la chiave contraddiceva pure la data scritta sul documento. Ora `giornoItalianoDi(body.data_fattura) \|\| giornoItaliano()` |
| 22 | `src/lib/inventarioImport.js:228` `addGiorni` | peggio di come l'avevo scritto nel censimento: non «salta un giorno», **slitta e non si riprende più**. Parte da mezzanotte esatta a Greenwich; basta che il foglio attraversi il passaggio all'ora legale *in avanti* e l'istante scivola indietro di un'ora, cioè al giorno UTC prima: da lì tutte le date successive sono scritte un giorno prima. Un foglio di marzo sposta indietro tre settimane di produzioni e rimanenze. Il passaggio inverso (ottobre) lo sposta avanti di un'ora e resta dentro lo stesso giorno: per questo si vede una volta l'anno sola, in primavera |
| 23 | `src/views/VenditeB2BView.jsx:140` | «ultimo trimestre»: mezzanotte UTC contro mezzogiorno locale, poi diviso per 86.400.000. Ora `differenzaGiorni`. Sistemato anche `giorniDaUltimo` per coerenza |
| 25 | `src/Dashboard.jsx:1656,1706` | un prezzo ingrediente «da oggi» restava programmato fino alle 02:00: il food cost delle prime lavorazioni del mattino girava sul prezzo vecchio. Ora si confrontano due GIORNI. Corretta anche la data nel messaggio, che a ovest di Greenwich avrebbe mostrato il giorno prima |
| 29 | `api/admin.js:93,144-145,380-383,1354` | «fatture scadute», «fatturato del mese», «scade entro 7 giorni», «costo AI ultimi N giorni» contati sul giorno UTC contro colonne che sono giorni di calendario. `next7gg` sommava anche 7 × 86.400.000 ms. Tolti due `isoMonthDate`/`sinceDate` calcolati in UTC e **mai letti** (`:1114`, `:1235`): un conto sbagliato che nessuno usa è solo un trabocchetto per il prossimo |
| 31 | `api/webhook-pos.js:96` | `setUTCHours(0,0,0,0)` spezzava la giornata alle 02:00 italiane: seconda riga di `sync_log` per la stessa giornata di lavoro |
| 32 | `src/lib/exportPDF.js:82` | il piè di pagina di ogni PDF dichiarava l'ora di Greenwich: due ore indietro rispetto a quando il titolare aveva premuto Esporta. Su un documento che serve a dire «quando è stato estratto», è il numero che conta |

### Test
- Nuovo file `tests/unit/giornoItalianoNonGreenwich.test.js` — 29 test, sette
  famiglie. Verde con `TZ_TEST=` Europe/Rome, UTC, Pacific/Auckland,
  America/Los_Angeles.
- `tests/unit/quattroDifettiIntegrazioni.test.js` — l'asserzione sul registro
  POS controllava il **testo** `inizioGiornata.toISOString()`. Aggiornata e
  **rafforzata**: adesso verifica anche che la giornata sia quella di Roma.
  Il controllo guarda le righe vive, non i commenti (il commento cita
  `setUTCHours` apposta).
- Righello verificato con mutazioni vere: rimesso il vecchio `aggiungiGiorni`
  → 10 test rossi a Roma, Auckland e Los Angeles; rimesso il vecchio
  `addGiorni` dell'inventario → il test delle quattro settimane cade.

## Difetti in file di ALTRI agenti — da girare
- `src/components/ConfrontoSedi.jsx:118` (usato a `:179` e `:283`) e `:190`
  — censimento #1 e #21, **ancora aperti**: non li tocco, il file è di un
  altro agente. `:118` è la colonna «produzione di oggi» e a `:179` conta
  scadute le fatture che scadono **oggi**; `:190` (`lunIso`) riporta il lunedì
  alla domenica.
- `src/lib/inventarioProduzione.js:1066` — già segnalato al 75%.

## Fuori dalla mia famiglia, ma blocca la pubblicazione
`node scripts/check-italian-grammar.mjs` è **rosso** per
`src/views/HomeDipendente.jsx:55`: `piu'` invece di `più`. Non è mio e non è
un difetto di date, ma il prebuild lo fa fallire, quindi oggi `npm run build`
non passa e il deploy muore.

## Prossimo passo
Suite intera verde a Roma, poi i cron (D11) e le ultime voci di fascia 3.

---

## Ripresa (17/09/2026) — i cron, e un difetto che non è di fuso

### Verifica: la fascia 1 del censimento è chiusa
Riletti uno per uno i file che mi erano stati indicati come priorità. Sono
già corretti, col commento che racconta il difetto:
`api/sdi-emit-invoice.js` (data fattura + chiave di idempotenza),
`api/lib/fattureInCloud.js:151`, `api/webhook-zucchetti.js` (`giornoItaliano()`),
`api/sync-delivery.js` (`ieriItaliano()` + `inizioGiornoItaliano`/`fineGiornoItaliano`),
`api/tv.js`, `DailyBriefCard.jsx`, `venditeB2B.js`, `Personale.jsx`,
`QuadraturaInventarioView.jsx`, `sepa.js`, `fornitoriDaFatture.js`,
`ImportWizard.jsx:262`, `aiEngine.js`. Restano aperti solo i due di
`ConfrontoSedi.jsx` (#1 e #21), che non è mio.

### Il sesto attrezzo rotto: `--reporter=basic`
`npx vitest run --reporter=basic` su questa versione **non esiste**: vitest
esce con `ERR_LOAD_URL`… e **codice di uscita 0**. Una suite che non è
partita si legge come una suite verde. Uso il reporter predefinito.

### Dove sono davvero i cron
Schedule in `vercel.json`: `sync-delivery` 02:00 UTC, `cron-giornaliero`
07:00 UTC, `cron-whatsapp` 20:00 UTC. A quelle tre ore il giorno UTC e il
giorno italiano **coincidono sempre**, e su Vercel il processo è in UTC:
quindi nessuno dei cron è rotto oggi. Sono corretti **per coincidenza
dell'orario**, che è esattamente D11. Nessuna riga di codice lo dice.

### Difetto VERO trovato per strada — `api/cron-notifiche.js:195-203`
Non è di fuso, è di colonna, e costa soldi.

L'avviso «fatture in scadenza entro 7 giorni» filtra su **`data_fattura`**,
cioè la data di EMISSIONE, non su `data_scadenza`:

    .lte('data_fattura', oggi + 7)
    .gte('data_fattura', oggi)

Cerca fatture **emesse nei prossimi sette giorni**: fatture datate nel
futuro. Misurato sul database di produzione, sola lettura:

| query | fatture trovate |
|---|---|
| quella del cron, oggi | **0** |
| scadenza vera (`data_scadenza`, o +30 gg se manca) | **11**, 4.219,36 € |

L'email non è mai partita da quando esiste. E `data_scadenza` è nulla su
tutte e 478 le fatture da pagare, quindi non basta cambiare colonna: serve
`scadenzaFattura()` di `src/lib/fatture.js`, che sa stimare i 30 giorni e
dichiara `stimata: true`. Contesto: 410 fatture già scadute non pagate,
150.193,60 € di residuo.

## Prossimo passo
Correggere `cron-notifiche` (scadenza + giorno italiano), poi
`cron-forecast` (quantità di produzione), `cron-whatsapp`,
`cron-daily-brief`, `cron-report-mensile`, `ImportWizard.jsx:101`.

### Correzioni di questo giro — i cron

| dove | cosa succedeva |
|---|---|
| `api/cron-notifiche.js:195-203` | l'avviso «fatture in scadenza» filtrava su `data_fattura` (emissione) invece che sulla scadenza: **0 risultati sempre**, l'email non è mai partita. Ora `scadenzaFattura()`, con l'importo che è il RESIDUO e il flag `stimata` quando i trenta giorni sono una convenzione |
| `api/cron-notifiche.js:72-73` | `oggiIso` e `isPrimoDelmese` dal giorno di Greenwich → `giornoItaliano()` |
| `api/cron-notifiche.js:218-221` | la finestra del report mensile: `new Date(anno, mese-1, 1)` (mezzanotte LOCALE) riletta con `toISOString()` (Greenwich). Dove l'offset è positivo apriva il mese **un mese prima** e chiudeva **un giorno prima** → `aggiungiMesi` + `primoGiornoDelMese`/`ultimoGiornoDelMese` |
| `api/send-email.js:333` | la colonna dell'email si chiama «Scadenza» e stampava `data_fattura`: con trenta giorni di termine, un mese prima. Ora la scadenza vera, con «(stimata)» dove è derivata. La colonna dei soldi si chiamava «Totale» e porta il residuo: ora dice «Da pagare» |
| `api/cron-forecast.js:104-134` | la previsione vendite mescolava tre riferimenti: `setHours(0,0,0,0)` (locale), `new Date(c.data)` (Greenwich), `toISOString()` (Greenwich), più `getTime() + i*86400000`. A est la chiusura di oggi cadeva fuori dal campione e i sette giorni finivano scritti sotto la data di **ieri**. Decide quanto si produce |
| `api/cron-whatsapp.js:36` | il report della sera cercava la chiusura del giorno di Greenwich: un ritardo del cron oltre la mezzanotte UTC e il messaggio annunciava «0 €» |
| `api/cron-daily-brief.js:164,195` | la chiave `daily_briefs.data` e il controllo «è lunedì»: `getUTCDay()` dice lunedì già dalle 22:00 di domenica |
| `api/cron-report-mensile.js:16-18,35-47` | il mese del report e il filtro del mese. Il 1° gennaio scavalcato: report di dicembre intestato «novembre», con i numeri di novembre |
| `api/cron-documentary.js:27-30,47-49` | il trimestre della fotografia, stessa famiglia |
| `src/components/ImportWizard.jsx:101` | il mese proposto nella casella: il 1° del mese fino alle 02:00 si apriva già scritto col mese precedente |

### Attrezzo nuovo
`giornoDellaSettimana(giorno)` in `dateLocal.js`: che giorno della settimana è
un GIORNO di calendario. Diverso da `giornoSettimanaItaliano`, che parte da un
istante. `new Date('2026-09-17').getDay()` è mezzanotte a Greenwich riletta con
l'orologio della macchina: a ovest risponde col giorno prima, e la previsione
del lunedì si costruisce sulla media delle domeniche.

### Giudicati CORRETTI (non toccati, e perché)
- `run_date` di `cron-giornaliero` e `cron-heartbeat`, e la chiave dell'alert
  a `:210`: non sono date che qualcuno legge, sono **lucchetti**
  (`cron_run_claim`, una esecuzione per giorno). Cambiargli riferimento non
  aggiunge niente e il giorno del passaggio rischia una doppia esecuzione.
- `expires_at`, `sent_email_at`, `triggered_at`, `started_at`, `ts`: istanti.
- `cron-documentary.rangeTrimestre` faceva `setDate(0)` tenendo l'ora: quello
  in sé reggeva. Rifatto lo stesso per coerenza col resto del file.

### Test — `tests/unit/cronGiornoItaliano.test.js`, 30 test
Non solo lettura del codice: il cron **gira davvero**, con un finto database e
una finta email, e si controlla cosa avrebbe ricevuto il titolare. Sei casi
sulle fatture: parte l'email, ci sono le tre giuste e non le altre tre (un
giorno oltre / già scaduta / già saldata), la colonna «Scadenza» porta la
scadenza, le stime sono dichiarate, l'importo è il residuo, e senza scadenze
non manda niente.

**Righello verificato con mutazioni vere**, non a parole:
- rimessa la query su `data_fattura` + il vecchio `mesePrecedente`/`filtroMese`
  → **5 rossi a Roma, 8 in UTC, 5 ad Auckland, 11 a Los Angeles**. Ripristinato.
- rimesso `new Date(giorno).getDay()` in `giornoDellaSettimana` → 1 rosso, e
  **solo a Los Angeles**. È scritto nel file: mezzanotte a Greenwich riletta con
  un orologio in avanti cade nello stesso giorno, con uno indietro no. Quattro
  fusi non vogliono dire quattro prove.

Verde 30/30 con `TZ_TEST=` Europe/Rome, UTC, Pacific/Auckland,
America/Los_Angeles.

## Prossimo passo
Suite intera, poi le ultime voci di fascia 3 del censimento (`admin/salute.js`,
`usoPagine.js`, `telemetriaAi.js`).

---

## Ripresa (17/09/2026) — le due eredità di SOLDI, e un difetto sotto l'altro

### `ConfrontoSedi.jsx` — censimento #1 e #21, chiusi
Il file si è liberato: SOLDI ha finito.

| dove | cosa succedeva |
|---|---|
| `:119` `const today = new Date().toISOString().split('T')[0]` | il giorno di Greenwich usato in due punti che il titolare legge come numeri di oggi. **«Prodotti oggi»**: il laboratorio lavora di notte, chi apriva la pagina all'una dopo aver infornato vedeva la colonna a zero e la produzione attribuita a ieri. **«Fatture scadute»**: il confronto è «in ritardo dal giorno DOPO la scadenza», e con un oggi spostato la fattura che scade oggi risultava già scaduta (a ovest di Greenwich) o quella scaduta ieri non faceva partire l'allarme (a est). Ora `todayLocal()` |
| `:184` `lun.toISOString().slice(0,10)` | l'etichetta delle otto settimane: `getStartOfWeek()` costruisce mezzanotte LOCALE del lunedì, `toISOString()` la riporta a Greenwich e con offset positivo torna alla DOMENICA. Ora `isoDi(lun)`, il righello locale già in cima al file |

### `ForecastView.jsx:48` — la query che salta il dirottamento
Segnalato da SOLDI. La diagnosi «perché questa pagina è vuota» chiedeva le
chiusure a `user_data` in prima persona, saltando il dirottamento di
`storage.js`. Il blob è la fotografia del 7 settembre e per Mara non esiste
proprio: il titolare registrava le chiusure dalla Cassa, apriva la Previsione
e leggeva **«Non c'è ancora niente da cui prevedere — registra le chiusure per
qualche settimana»**. Cioè: fai quello che hai appena fatto. Ora `sload`.

### Il difetto che stava sotto: i prodotti di una chiusura non si chiamano «prodotti»
Uscito verificando la correzione qui sopra. Sistemata la fonte, la pagina
continuava a mentire, solo in modo diverso: il conto delle giornate col
dettaglio guardava `c.prodotti` e `c.righe`, e **nessuna chiusura di oggi ha
quei campi**. `ChiusuraView` salva l'elenco in `venduto`, e `chiusure_cassa`
ha una colonna con quel nome (`chiusuraRiga.js`). Quindi con sessanta giornate
compilate prodotto per prodotto la risposta era «Alle tue chiusure manca il
dettaglio dei prodotti — finché manca, questa pagina resta vuota, per quanti
giorni si aspetti»: un invito ad arrendersi, rivolto a chi aveva fatto tutto.

Corretto cercando il primo elenco **pieno** fra `venduto`, `confronto`,
`prodotti`, `righe` — non il primo elenco: una chiusura vecchia migrata nella
tabella ha `venduto` vuoto e le sue righe in `extra`, e fermarsi al primo
array le avrebbe saltate. `OrdiniAiView.jsx:112` era già stato allineato da
qualcun altro, ed è da lì che si vede quali sono i nomi veri.

### Fascia 3 — chiusa
- `api/lib/admin/usoPagine.js` e `salute.js`: già a posto (`giorniFaItaliano`).
  Il `toISOString()` che resta in `salute.js:118` è confrontato con
  `created_at`, che è un ISTANTE: lì UTC è la forma giusta e va lasciato.
- `api/lib/admin/telemetriaAi.js`: `since` è un istante confrontato con
  istanti — corretto. C'era invece un `const today = giornoItaliano()` che non
  leggeva nessuno; il nome `brainTodayConv` fa credere che ci sia un conteggio
  «di oggi», ma quel numero è il totale degli N giorni come gli altri. Tolto
  il giorno morto e l'import che serviva solo a lui.

### Test — due file nuovi, 22 test
- `tests/unit/previsioneDiceIlVero.test.jsx` (12): rende la pagina **vera** e
  legge quello che comparirebbe a schermo. Sotto ci passa `storage.js` vero,
  quindi il dirottamento è esercitato per davvero; l'unica cosa finta è il
  database, che tiene il conto delle **tabelle interrogate**.
- `tests/unit/confrontoSediGiornoItaliano.test.jsx` (10): niente date italiane
  scritte a mano. L'orologio si ferma a due istanti — 23:30 e 00:30 di
  Greenwich — e si chiede alla macchina qual è il suo giorno locale in quel
  momento. Almeno uno dei due cade nella finestra rotta in ogni fuso che non
  sia Greenwich; a Greenwich nessuno dei due, e c'è un test che lo **dichiara**
  invece di fingere.

**Righello verificato con mutazioni vere.**
- rimessa la query diretta a `user_data` in `ForecastView` → **10 rossi su 12**;
- rimesso il solo `prodotti`/`righe` → **5 rossi**, e sono quelli giusti;
- rimesso `new Date().toISOString().split('T')[0]` in `ConfrontoSedi` →
  **4 rossi a Roma, 4 ad Auckland, 3 a Los Angeles, 1 in UTC**. Il rosso di UTC
  è il controllo sulle righe vive del sorgente, che non dipende dal fuso: è la
  conferma della regola di ieri, quattro fusi non fanno quattro prove;
- rimesso `lunIso: lun.toISOString()` → 1 rosso in tutti e tre i fusi provati.

Verde 22/22 con `TZ_TEST=` Europe/Rome, UTC, Pacific/Auckland,
America/Los_Angeles.

## Prossimo passo
Verifica finale del censimento voce per voce, poi la suite intera.
