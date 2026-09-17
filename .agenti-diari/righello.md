# Diario agente RIGHELLO — audit Foodos 16/09/2026

## Mandato
Non aggiungere test: scoprire quali dei 3.649 **non proteggono niente**.
Un test che passa sempre è peggio di un test che non c'è.

## Piano (scritto prima di cominciare)
1. Leggere REGOLE.md, CLAUDE.md, vitest.config.js, i file indiziati. [in corso]
2. Caso noto 1: `tests/unit/views-render-smoke.test.jsx` — 4 nomi di vista su 21
   non esistono e il test tollera gli errori. Verificare e correggere.
3. Caso noto 2: `tests/unit/produzioneVeraSenzaRumore.test.js` — funzione
   `dsnValido` ricopiata dentro il test invece che importata.
4. Setaccio automatico su tutti i 238 file di test: `toHaveLength(0)` su liste
   sempre vuote, `it.skip`, `try/catch` che ingoia, `expect` senza `await`,
   funzioni ricopiate.
5. Per ogni `scripts/check-*.mjs` e `scripts/audit-*.mjs`: DIMOSTRARE che sa
   fallire (caso finto, lancio, verifica uscita ≠ 0, rimozione del caso finto).
6. Gate pre-push (`scripts/install-hooks.sh`): ogni passo blocca davvero?
7. Metodo: rompere di proposito il prodotto e verificare che il test cada.
   Ogni prova annotata, anche quelle andate bene.

## Stato
- [x] Letto REGOLE.md, CLAUDE.md, vitest.config.js, package.json
- [x] Baseline della suite intera: 237 file, 3.649 test, tutti verdi, 232 s
- [x] views-render-smoke.test.jsx — RISCRITTO (era cieco su 8 prove su 21)
- [x] produzioneVeraSenzaRumore.test.js — CORRETTO (5 prove su una copia)
- [x] Setaccio automatico sui 240 file — fatto
- [x] Prova di fallimento dei 9 script check-/audit- — tutti e 9
- [x] Gate pre-push — provato tutti e 4 i passi + il difetto del 14/09 rimesso

## Difetti trovati (file:riga — cosa succede — come riprodurlo)

### 1. `tests/unit/views-render-smoke.test.jsx` — 8 prove su 21 erano finte
Il file diceva «tutte le View principali rendono senza crash» ed era verde.
Riproduzione: tolto il `return` silenzioso e la tolleranza sugli errori, 8
prove su 21 cadono subito.

- **4 nomi di pagina non esistono**: `ScadenzarioView`, `FoodCostView`,
  `AssistanteView` (con l'errore di battitura dentro), `TrasferimentiView`.
  L'import falliva → `console.warn` + `return` → prova verde.
- **4 pagine vere crashavano al disegno e il crash era «tollerato»**: solo
  `ReferenceError` contava, e la prova finiva con `expect(true).toBe(true)`.
    MagazzinoView, SimulatorePrezziView → `(giornaliero || []) is not iterable`
    StoricoProduzioneView               → `sessFiltered is not iterable`
    AzioniView                          → `(actions || []).filter is not a function`
  Causa: `baseProps` passava `giornaliero: {}` e `actions: {}`, ma nel
  Dashboard (righe 922 e 926) sono `useState([])`. Banco di prova sbagliato,
  prodotto giusto — ma quelle 4 pagine non venivano mai disegnate.
- **Elenco scritto a mano**: 10 pagine nate dopo giugno non erano coperte da
  nessuno (Chiusura, Produzione giornaliera, Documentale, Forecast,
  Marketplace, Nuova ricetta, Recensioni, Recipe Inventor, Scheda allergeni,
  WhatsApp, Brain, Home dipendente, AnalisiInventarioSection).

**Correzione**: elenco generato dal disco (`glob src/views/*.jsx`), import
fallito / export mancante / crash al disegno sono tre modi di FALLIRE, prop
con la forma vera del Dashboard, lessico vero, e una prova di controllo sul
righello («l'elenco viene dal disco e non è vuoto»).
Risultato: **da 21 prove di cui 13 vere, a 32 prove tutte vere.**

## Prove fatte (anche quelle andate bene)

| # | Cosa ho rotto di proposito | Chi doveva accorgersene | Esito |
|---|---|---|---|
| 1 | `MarketplaceView`: `null.toLowerCase()` al primo disegno | views-render-smoke (nuovo) | **cade** — prima lo tollerava |
| 2 | il percorso del glob nel test → elenco vuoto | la prova di controllo del righello | **cade** — prima sarebbe rimasta verde con zero prove |
| 3 | `src/main.jsx`: `dsnValido` → `return !!dsn` (il difetto vero del 16/09) | produzioneVeraSenzaRumore | **prima: 15/15 verdi (cieco)** · dopo la correzione: 5 prove cadono |
| 4 | il nome della funzione cercata nel sorgente (`funzioneCheNonEsiste`) | la prova di controllo del ritaglio | **si ferma e lo dice** |

File di prodotto ripristinati: `src/views/MarketplaceView.jsx` verificato
identico con `shasum` + `git diff` pulito.

### 2. `tests/unit/produzioneVeraSenzaRumore.test.js` — 5 prove su una copia
`dsnValido` era **ricopiata a mano** dentro il file di prova. Cinque prove
giravano sulla copia, non sul programma.
Riproduzione: `dsnValido` di `src/main.jsx` ridotta a `return !!dsn` — cioè
rimesso esattamente il difetto che il file racconta di aver corretto (il DSN
segnaposto accettato) — e **tutte e 15 le prove restavano verdi**.

`src/main.jsx` non si può importare: monta l'applicazione. Correzione: la
funzione si **ritaglia dal sorgente** (`funzioneDaSorgente`) e si esegue
quella. Più due prove di controllo sul righello: il ritaglio si ferma se la
funzione non c'è, e quello che torna contiene le parole del programma.
Risultato: **da 15 prove di cui 5 cieche, a 17 tutte vere**.

### 3. Setaccio automatico — cosa è uscito
Setaccio in `<scratchpad>/setaccio.mjs` e `setaccio2.mjs`. Cercati:
`it.skip`/`todo` (0), `expect` su promise senza `await` (0), tautologie (5),
`catch` vuoti (17, tutti di preparazione), `it` senza `expect` (7, tutti falsi
positivi del mio ritaglio a graffe), censimenti su liste sempre vuote (15).

**7 censimenti messi alla prova con un caso finto piantato** (un file
`src/lib/.probe-righello.jsx` con dentro tutti i difetti insieme, cancellato
subito): celleTabellari, iconeEsistenti, nessunoSchermoBianco,
percentualiItaliane, scalaTipografica, tabelleLargheTelefono,
temaChiaviEsistenti. **Tutti e 7 l'hanno riconosciuto: non sono ciechi.**
Mancava però la prova di controllo sul percorso: puntando il setaccio di
`scalaTipografica` su `public/` invece che su `src/`, il censimento resta
**verde a vuoto**. Aggiunta in tutti e 7 la prova «il setaccio guarda davvero
dentro il progetto» (27 → 34 prove).

### 4. Le quattro fotografie di layout contavano come prove superate
`layoutViste`, `layoutVisteMobile`, `layoutVisteTablet`, `layoutPagineFuoriMenu`:
senza `DUMP_LAYOUT` finivano con `expect(true).toBe(true)` e il riepilogo le
contava fra le **passate**. Ora sono `it.skipIf(!ATTIVO)`: il riepilogo dice
«saltate», che è la verità. Con `DUMP_LAYOUT=1` girano ancora (verificato:
scrive 5 file HTML).

### 5. Il cancello pre-push — provato davvero, tutti e quattro i passi
Nuovo file `tests/unit/cancelloPrePush.test.js`: prende il cancello vero da
`scripts/install-hooks.sh` e lo fa girare con `npx`/`npm`/`node` finti che
falliscono uno alla volta. Esito: **tutti e 4 i passi bloccano**, il ramo
personale passa, e il cancello installato coincide con quello versionato.
Più la riproduzione del difetto del 14/09: **tolta la riga `set -o pipefail`,
un build rotto passa** (uscita 0). Con la riga, viene fermato.

## Prossimo passo (aggiornato 17/09)
- [x] Difetto 6 CORRETTO: i cinque attrezzi muti adesso escono 1 (vedi 12)
- [x] Il test che tiene la regola: `attrezziCheSannoDireNo.test.js` (19 prove)
- [x] La regex delle emoji troppo larga copiata in tre file (vedi 13)
- [ ] Rilettura finale del perimetro con `git diff`

### 6. `scripts/audit-contrasto.mjs` — vede il difetto ma esce 0
32 pagine rese, due larghezze ciascuna: **nessun problema di contrasto**.
Regola: se trova 0, deve dimostrare che ne saprebbe trovare uno. Pianta un
caso finto (`probe.html`: #cccccc su bianco a 14px, #e8e8e8 su bianco a 13px)
e lancia con `DIR_VISTE=`: **le trova tutte e quattro**, con rapporto 1,6 e
1,22 contro il 4,5 richiesto. L'occhio funziona.

Ma il **codice di uscita resta 0** anche con 4 violazioni in mano. Il file ha
`process.exit(0)` quando è tutto a posto e poi, quando trova qualcosa, stampa
l'elenco e finisce: chi lo mettesse in una catena `&&` non se ne accorgerebbe
mai. L'asimmetria (`exit(0)` esplicito da una parte, niente dall'altra) dice
che l'intenzione era di segnalare.

Stessa cosa, e senza nemmeno l'`exit(0)`, in altri quattro:
`audit-layout.mjs` e `audit-scorrimento.mjs` non hanno **nessun**
`process.exit`; `audit-tocco.mjs` e `audit-design-telefono.mjs` escono 1 solo
se manca la cartella delle viste, mai per quello che misurano.
**Cinque attrezzi su nove non sanno dire di no.** Oggi nessuno dei cinque è
agganciato a una catena (verificato: compaiono solo nei documenti e nei
commenti), quindi non è un cancello rotto — è un cancello che non c'è.
Chi li aggancia domani ha una sorpresa.
Escono 1 sul serio: `audit-sicurezza`, `check-design-tokens`,
`check-italian-grammar`, `check-migrazioni-applicate`.

### 7. `scripts/audit-tocco.mjs` — misurava solo i bersagli già a norma
Riga 52: `document.querySelectorAll('button[aria-label]')`. E in `index.html`
la regola CSS che impone i 44px è, riga 163, **esattamente**
`@media (pointer: coarse) { button[aria-label]:not([class*="inline"]) }`.
L'attrezzo contava solo l'insieme che il foglio di stile costringe a passare:
non poteva che rispondere zero. Segnalato dall'agente PAGINE, che me l'ha
lasciato.

Riproduzione, pagina finta con un pulsante 30x30, uno 120x28, un link alto 24,
un campo, una tendina, e **un solo** pulsante a norma con `aria-label`:

    audit-tocco.mjs   →  «bersagli sotto i 44px: 0 su 1»
    la misura vera    →  6 su 7

Correzione: tutti i bersagli (`button, a[href], [role=button]`, campi, tendine,
etichette `label[for]`), larghezza **oltre** all'altezza (un 120x28 si sbaglia
come un 28x120), e fuori i campi nascosti, che gonfiavano il totale e
abbellivano la percentuale.

Sulle 32 pagine vere, a 390px: da «0 problemi» a **319 bersagli su 410 sotto i
44px**, su 25 pagine. Campi sotto i 16px: 0 su 109 — quella regola funziona.
Non allargo la regola CSS: sposta la grafica di tutto il prodotto, e la decide
chi disegna. Il righello adesso dice la verità, il numero è sul tavolo.

### 8. `tests/unit/impaginazioneTocco.test.js` — una prova che prometteva troppo
Si chiamava **«bersagli da 44px su tutto quello che si tocca»** e cercava
`min-height: 44px` dentro un blocco `pointer: coarse`. Controllava che la riga
esistesse, non che coprisse qualcosa.
Riproduzione: riscritto il selettore come `.questo-unico-bottone-qui` — al
mondo copre un bottone solo — la prova **passa lo stesso**. Cade solo
togliendo del tutto il blocco.
Correzione: due prove che dicono la verità («la regola c'è» e «copre SOLO i
pulsanti a sola icona»), più tre sul righello del tocco. 27 → 31 prove.

### 9. `scripts/check-migrazioni-applicate.mjs` — si spegneva da solo
Questo gira nel cancello pre-push. Aveva
`try { ...database... } catch { return 0 }` e il messaggio del `catch` era lo
stesso del caso «non ho le credenziali»: «controllo saltato».
Riproduzione: `SUPABASE_DB_URL` su una porta chiusa → «controllo saltato»,
uscita **0**. Una password scaduta nel file spegneva il passo per sempre, in
silenzio — e questo controllo esiste proprio perché una migrazione saltata non
lascia traccia da nessuna parte. Lo stesso schema del 14/09.
Correzione: senza credenziali salta (giusto: in CI non ci sono), con le
credenziali e il database muto **esce 1 e lo dice**. Più: la riga d'errore di
`psql` contiene l'URL intero, **password compresa** — ora è oscurata (`••••`),
prima sarebbe finita nel registro del terminale e nei log della CI.
Tre prove nuove in `migrazioniApplicate.test.js` (10 → 13).

### 10. `scripts/audit-sicurezza.mjs` — regge
21 controlli. L'attrezzo legge `PSQL` dall'ambiente, quindi si prova senza
toccare il database: psql finto che risponde sempre `0` → 4 controlli su 21
cadono (i 4 che aspettano `1`: non è tautologico); che risponde `7` → 21 su 21,
uscita 1; **che muore** → 21 su 21, uscita 1. Non ingoia l'errore, fallisce
dalla parte giusta. Il lancio sul database vero è stato bloccato dal
classificatore («Production Reads»): la prova è quella col psql finto.

### 11. `audit-layout` e `audit-scorrimento` — reggono
`audit-layout` su una pagina finta con quattro difetti insieme: li trova tutti
e quattro (sfora di 1010px, riquadri affiancati Δ60px, testo a 9px, cella
numerica senza cifre tabellari). `audit-scorrimento` sulle 32 pagine vere:
**9 pagine si trascinano di lato a 390px** (nuova-ricetta 334px, personale
233px, inventario 199px, simulatore 173px, fornitori 148px, home 92px,
scadenzario 88px, registro-attivita 71px, pl 35px) e **13 a 320px**. Trovano.
`audit-design-telefono`: 0 scritte sotto i 12px, ma 32 fuori scala (tutte a
30px), 44 tagliate dai puntini, 10 tabelle più larghe dello schermo.
Sono dell'agente PAGINE: segnalati, non toccati.

---

## Ripresa del 17/09/2026 (l'agente era caduto)

Perimetro controllato con `git diff` prima di ricominciare: i tre file
`.tmp-*.mjs` non ci sono più (cancellati dal titolare), nessuna traccia mia
fuori posto. Un residuo NON mio, ma da segnalare: `scripts/.tmp-foto.mjs` è
**versionato** (commit `0058d61`) e dentro ha il percorso di una cartella
temporanea di sessione — cioè un file di lavoro finito nel repository.

### 12. Difetto 6 — CORRETTO: i cinque attrezzi muti adesso sanno dire di no
`audit-contrasto`, `audit-layout`, `audit-scorrimento`, `audit-tocco`,
`audit-design-telefono` finivano la loro corsa stampando i difetti e uscendo
**0**. Correzione: ognuno esce 1 quando ha trovato qualcosa, con in testa il
commento che racconta perché (è la stessa forma del difetto del 14/09,
l'esito mangiato da `| tail`).

Provati tutti e cinque su due pagine finte, per non fidarsi del righello:

| attrezzo | pagina coi difetti | pagina pulita |
|---|---|---|
| audit-contrasto | **1** | 0 |
| audit-layout | **1** | 0 |
| audit-scorrimento | **1** | 0 |
| audit-tocco | **1** | 0 |
| audit-design-telefono | **1** | 0 |

La colonna di destra conta quanto quella di sinistra: un attrezzo che esce
sempre 1 è rotto nell'altro verso, e nessuno lo userebbe più.

Il test che tiene la regola: `tests/unit/attrezziCheSannoDireNo.test.js`
(19 prove). Due strati.
**Statico, sempre acceso**: per ognuno dei 9 attrezzi, l'ultimo punto in cui
decide l'esito deve stare DOPO l'ultima riga che riporta qualcosa, e non può
essere `exit(0)`. Un'uscita che sta sopra al resoconto è una guardia
d'apertura («manca la cartella»), non il verdetto sulla misura.
**Vero, se c'è Chromium**: i cinque girano davvero sulle due pagine finte.
In CI `unit.yml` non installa il browser, quindi là si dichiarano SALTATE —
non passate.

Prova della riproduzione: rimessi i cinque com'erano in HEAD, **cadono
esattamente quei cinque** e i quattro sani passano. Ripristinati, `shasum`
identico prima/dopo.

### 13. La regex delle emoji: la stessa sbagliata in quattro file
Il titolare ne aveva già corretta una in `apreSullaCosaGiusta.test.jsx`.
Cercate le copie: ce n'erano altre tre.

    tests/unit/landingImpaginazione.test.jsx:106
    tests/unit/importSchemas.test.js:198
    tests/unit/menuUnaVoltaSola.test.js:80

Tutte con `\u{2600}-\u{27BF}` dentro — i **dingbat**, che contengono la spunta
«✓» (U+2713) e la crocetta «✕» (U+2715). Quella della landing aveva anche
`\u{2190}-\u{21FF}`, il blocco delle **frecce**: bocciava la «→». Nessuno dei
tre è un'emoji: sono caratteri tipografici, e stanno dentro ai pulsanti.
Un controllo che grida dove non c'è niente costa quanto uno che non grida
mai: la prima volta si corregge il prodotto per niente, la seconda si spegne
il controllo.

Correzione: `\p{Extended_Pictographic}`, che era già la regola di casa
(`primaNotaCassa`, `importRegistroIncassi`) ma non stava scritta da nessuna
parte. Adesso la scrive `tests/unit/rilevatoreEmojiTarato.test.js`, che
setaccia tutti i file di prova e vieta il ritorno delle copie.

**Cosa è saltato fuori passando alla regola giusta**: la prova della landing
è caduta sul **`©`** del piè di pagina. Copyright, marchio registrato e
marchio commerciale sono segni tipografici con una versione emoji (©️ ®️ ™️),
e Unicode li conta fra i pittogrammi. Il rilevatore vecchio li lasciava
passare per caso, non per scelta — il commento accanto diceva «il segno di
copyright non è un'emoji», cioè l'intenzione c'era ed era affidata a tre
intervalli scritti a mano. Adesso è scritta: `/(?![©®™])\p{Extended_Pictographic}/u`,
con la prova che toglie quei tre e non un'emoji di più.

Prova della riproduzione: rimesso in `menuUnaVoltaSola.test.js` il rilevatore
largo di HEAD, il setaccio lo indica per nome. Ripristinato, `shasum`
identico.

### 14. Il cricchetto dei token: le segnalazioni erano vere, il righello no

Il cancello del build era rosso: `node scripts/check-design-tokens.mjs` usciva
1 per quattro file (`Eventi`, `Impostazioni`, `HomeDipendente`,
`NuovaRicettaView`). Prima di chiedere a qualcuno di correggere quattro file:
il righello sta misurando bene?

**Le quattro segnalazioni erano vere.** Verificate una per una confrontando
`git show HEAD:<file>` con la copia di lavoro, riga per riga. Nessuna stava in
un commento, nessuna dentro una stringa che non fosse uno stile:

    Eventi.jsx 835 e 840   due `<div style={{ fontSize: 12 …}}>` nuovi
    Impostazioni.jsx 902   un pulsante nuovo con `fontSize:13`
    HomeDipendente 115-116 il riquadro «Merce arrivata» aggiunto dall'agente
                           PAGINE, con tre colori scritti a mano come gli altri
    NuovaRicettaView 539   un ramo nuovo con `bg: '#FAF8F7'`

Mentre scrivevo, tre dei quattro agenti hanno corretto il proprio file da soli
(`NuovaRicettaView` ha estratto `BG_NEUTRO`): la segnalazione era leggibile e
azionabile. Restano `Dashboard.jsx` (+3) e `PLView.jsx` (+1).

**Ma il righello aveva due difetti, e la sua fotografia un terzo.**

**a. Contava i commenti.** `#[0-9a-fA-F]{6}` cercava in tutto il file: 16
colori e 2 misure a tre vie erano testo di commento. In cinque file l'intero
conteggio era commento (`FloatingActions` 2 su 2, `Icon` 1 su 1,
`SedeContextBanner` 2 su 2). E i commenti contati erano proprio quelli che
raccontano la regola: `FloatingActions.jsx:20` scrive «i colori dai token, non
scritti a mano: #4A0810 non esiste in theme.js» e il cricchetto ci leggeva due
colori scritti a mano; `useIsMobile.js:35` spiega la forma sbagliata
`isMobile ? 44 : isTablet ? 44 : 36` e veniva contata come se quella forma
fosse nel prodotto. **Documentare una correzione faceva diventare rosso il
cancello** — lo stesso danno del difetto 13.

**b. Vedeva `#FFFFFF` e non `#FFF`.** La stessa deviazione in notazione corta
era invisibile: 396 volte `#FFF` nel codice, più `#EEE`, `#888`, `#000`,
`#DDD`. Peggio che non contare: accorciare `#FFFFFF` in `#FFF` faceva
**calare** il numero senza togliere niente. Il righello premiava la mossa
sbagliata.

**c. La fotografia era più larga del vero di 344 occorrenze.** Il controllo
fallisce solo se il numero cresce rispetto a `design-tokens-baseline.json`. Ma
dopo ogni ripulitura nessuno rifaceva lo scatto e il gioco si era accumulato:
LandingPage registrava 123 dimensioni di testo a mano contro 6 reali, AuthPage
41 contro 0, Dashboard 155 contro 100, MagazzinoView 82 contro 63. **Si
potevano aggiungere 344 deviazioni senza che il cancello dicesse una parola.**
Non è un cricchetto: è un cricchetto con il dente consumato.

**Correzione** (`scripts/check-design-tokens.mjs`): i commenti si tolgono
prima di contare — le stringhe **no**, perché è lì che la deviazione vive
(`background: '#FFF'`); le tre notazioni dell'esadecimale (3, 6, 8 cifre)
contano allo stesso modo; l'attrezzo si può puntare altrove con `DIR_SORGENTI`
e `FILE_FOTOGRAFIA` (come `DIR_VISTE` in audit-contrasto), che è l'unico modo
di provarlo senza toccare il prodotto; e quando la fotografia è più larga del
vero lo dice ad alta voce.
La fotografia è stata **rifatta su HEAD**, non sulla copia di lavoro: rifarla
sul lavoro in corso avrebbe cancellato le deviazioni vere di oggi. Con la
fotografia onesta sono saltate fuori quattro deviazioni che il righello vecchio
non vedeva: `Dashboard.jsx` +3 dimensioni di testo, `PLView.jsx` +1,
`MarketplaceView.jsx` e `RecipeInventorView.jsx` +1 colore `#FFF` a testa (gli
ultimi due già corretti dai loro agenti).

Controprova sul togli-commenti, su tutti i 229 file di `src` in HEAD: toglie 32
occorrenze in 14 file e sono **tutte** righe di commento, verificate a mano. Non
mangia codice: un apostrofo italiano nel JSX (`dell'evento`) chiude a fine riga,
altrimenti mezzo file sparirebbe dal conteggio e le deviazioni vere resterebbero
nascoste — c'è la prova apposta.

Il test: `tests/unit/cricchettoTokenDiDesign.test.js`, 15 prove.
**Riproduzione**: rimesso l'attrezzo com'era in HEAD, ne cadono **12 su 15**.
Le 3 che restano verdi sono quelle che fotografano la regola vecchia (`la
regola vecchia contava quei commenti`, `non vedeva #FFF`): devono passare in
entrambi i mondi, sono il verbale del difetto. Attrezzo e fotografia
ripristinati, `shasum -c` su tutti e due: OK.

**Cosa resta fuori, e si sa** (misurato, non corretto: allargare la regola
sposta la grafica e la decide chi disegna):
- 134 volte il bordeaux del marchio scritto come `rgba(110,14,26,…)` — proprio
  la cosa che il commento in cima all'attrezzo dice di voler contare («il
  marchio compariva 183 volte a mano»), in un'altra notazione;
- 145 dimensioni di testo dentro un ternario (`fontSize: isMobile ? 12 : 14`),
  che `testo-a-mano` non vede perché dopo i due punti non c'è una cifra. La
  regola `antizoom-a-mano` ne intercetta un sottoinsieme: l'intenzione c'era.

## Riepilogo finale (17/09/2026)

### I test che non proteggevano niente (trovati e corretti)
| | file | cosa passava sempre |
|---|---|---|
| 1 | `views-render-smoke.test.jsx` | 8 prove su 21: 4 nomi di pagina inesistenti, 4 crash «tollerati» |
| 2 | `produzioneVeraSenzaRumore.test.js` | 5 prove su una copia a mano di `dsnValido` |
| 3 | `layoutViste` + Mobile + Tablet + PagineFuoriMenu | `expect(true).toBe(true)`, contate fra le passate |
| 4 | `impaginazioneTocco.test.js` | «bersagli da 44px»: passava con un selettore che copre un bottone |
| 5 | 7 censimenti (celleTabellari, iconeEsistenti, nessunoSchermoBianco, percentualiItaliane, scalaTipografica, tabelleLargheTelefono, temaChiaviEsistenti) | verdi a vuoto se puntati fuori da `src/` |
| 6 | 5 attrezzi su 9 (`audit-contrasto`, `-layout`, `-scorrimento`, `-tocco`, `-design-telefono`) | vedevano il difetto e uscivano **0** |
| 7 | `audit-tocco` | misurava solo i bersagli che il CSS costringe già a passare |
| 8 | `check-migrazioni-applicate` | database muto = «controllo saltato», uscita 0 |
| 9 | il rilevatore di emoji in 4 file | l'altro verso: bocciava «→», «✓», «©» |
| 10 | `check-design-tokens` | contava i commenti, non vedeva `#FFF`, e la fotografia aveva 344 di gioco |

### Quelli che ho messo alla prova e reggono
`audit-sicurezza` (21 controlli, psql finto che risponde 0, 7, e che muore) ·
`audit-layout` e `audit-scorrimento` (trovano i difetti piantati e quelli veri) ·
i 4 passi del cancello pre-push (bloccano tutti e quattro) ·
i 7 censimenti (riconoscono il caso finto piantato) ·
i 5 attrezzi dopo la correzione (1 sulla pagina coi difetti, **0** su quella
pulita: un attrezzo che dice sempre no è rotto nell'altro verso).

### Quante prove in tutto
**65 casi finti piantati a mano** in tutto l'audit — 52 fino al 16/09 (tabella
del difetto 1, i 7+7 del setaccio, i 9 attrezzi, i 5 passi del cancello, le
pagine finte di tocco/layout/scorrimento/telefono, i 3 psql finti, i 10 lanci
del difetto 12) e **13 oggi** sul cricchetto dei token. Più 6 riproduzioni
«rimetto il codice com'era e guardo chi cade», tutte con `shasum` e `git diff`
di ritorno.

### Quello che lascio sul tavolo (non mio, misurato)
- Il cancello dei token è ancora rosso su **2 file veri**: `Dashboard.jsx`
  (+3 `fontSize` a mano, righe 3129-3131) e `PLView.jsx` (+1, riga 2081).
  Sono deviazioni nuove di oggi, non errori di misura.
- 319 bersagli su 410 sotto i 44px a 390px (25 pagine) · 9 pagine che si
  trascinano di lato a 390px, 13 a 320px · 32 scritte fuori scala.
- `scripts/.tmp-foto.mjs` è **versionato** (commit `0058d61`) e dentro ha il
  percorso di una cartella temporanea di sessione.
- `npx eslint` su `scripts/*.mjs` dà `process is not defined` su **tutti** i
  file, anche quelli che non ho toccato: mancano i globali di Node nella
  configurazione. Il cancello linta solo `src/ api/`, quindi non blocca niente,
  ma «lint pulito» su `scripts/` oggi non è raggiungibile.

## Prossimo passo (17/09, fine)
- [x] `npx eslint` sui file toccati + `check-italian-grammar` (OK)
- [x] Suite intera verde
- [x] `git diff` finale del perimetro
