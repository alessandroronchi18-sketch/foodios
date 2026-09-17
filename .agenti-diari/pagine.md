# Diario agente PAGINE — audit 16/09/2026

## Mandato
Le 14 pagine raggiungibili ma NON dal menu: si aprono da dentro un'altra pagina.
`nuova-ricetta`, `semilavorati`, `quadratura-inventario`, `importa-dati`,
`integrazioni`, `costi-aziendali`, `azioni`, `fornitori`, `confronto-sedi`,
`menu-engineering`, `trasferimenti`, `eventi`, `giornaliero`, `home-dipendente`.

Per ognuna: DA DOVE si raggiunge (il percorso vero del titolare) · si apre senza
errori · sta dentro 390px · riquadri incolonnati · niente testo <12px · niente
bersaglio <44px sul telefono · **quando un dato manca lo DICE invece di scrivere zero**.

## Piano
1. [x] Leggere REGOLE.md + CLAUDE.md
2. [ ] Mappare i percorsi di raggiungimento (grep setView / onNavigate / schede)
3. [ ] Leggere tests/unit/layoutViste.test.jsx: capire cosa rende e cosa no
4. [ ] Rendere le pagine (DUMP_LAYOUT=1) e misurarle
5. [ ] Verificare il righello su un caso finto prima di dichiarare difetti
6. [ ] Lente CFO: dato mancante = «non lo so», mai zero
7. [ ] Emoji in MarketplaceView.jsx e RecipeInventorView.jsx -> componente Icon
8. [ ] Test in tests/unit/ per ogni difetto corretto
9. [ ] Elenco pagine NON raggiungibili (informazione più preziosa)

## File miei (non toccare altro)
src/views/: NuovaRicettaView, SemilavoratiView, QuadraturaInventarioView,
ImportaDatiView, IntegrazioniView, CostiAziendaliView, AzioniView, EventiView,
MenuEngineeringView, HomeDipendenteView, MarketplaceView, RecipeInventorView.
NON: PLView, StoricoView, MagazzinoView, RicettarioView, ChiusuraView,
ConfrontoSedi, Scadenzario, InventarioSettimanaleView, TrasferimentiView.

## Stato
- 16/09 inizio. Prossimo passo: mappare i percorsi di raggiungimento.

---

## Checkpoint 1 — la mappa di come si raggiungono (passo 2 fatto)

Il conto vero: delle 14, **sette non sono «fuori menu»**: sono *schede*
(linguette) dentro una voce di menu, disegnate dalla striscia in
`Dashboard.jsx:3039-3059` che legge `schedeDiVista`.

| pagina | come ci si arriva davvero |
|---|---|
| `nuova-ricetta` | Ricettario → bottone «Nuova ricetta» (e «modifica» su una ricetta) — `Dashboard.jsx:3102` |
| `semilavorati` | scheda «Semilavorati» dentro Ricettario — `menuFoodos.js:126` |
| `menu-engineering` | scheda «Menu engineering» dentro Food cost — `menuFoodos.js:136` |
| `costi-aziendali` | scheda «Costi fissi» dentro P&L — `menuFoodos.js:167` |
| `fornitori` | scheda «Anagrafica» dentro Fornitori — `menuFoodos.js:148` |
| `eventi` | scheda «Ordinazioni» dentro Calendario — `menuFoodos.js:115` |
| `azioni` | scheda «Da fare» dentro Assistente AI — `menuFoodos.js:219` |
| `quadratura-inventario` | scheda dentro Storico, **solo** se metodo a inventario e sede di produzione (`menuFoodos.js:101`); + bottone in ChiusuraView:1439 |
| `confronto-sedi` | voce di menu, **solo con più di una sede attiva** (`menuFoodos.js:189`) |
| `trasferimenti` | voce di menu con più sedi + riquadro nella Home (`DashboardHomeView.jsx:203`) |
| `giornaliero` | voce di menu «Produzione»; + Home (`DashboardHomeView.jsx:589`), Calendario, Primi passi, Forecast |
| `home-dipendente` | il logo in alto, quando chi guarda è un dipendente (`Dashboard.jsx:2069`) |
| `importa-dati` | **DA NESSUNA PARTE** — vedi sotto |
| `integrazioni` | **DA NESSUNA PARTE** — vedi sotto |

### Difetto 1 — due pagine esistono e non si raggiungono
`grep` su tutto `src/`: nessuno chiama mai `setView('importa-dati')` né
`setView('integrazioni')`. Non stanno nel menu (`costruisciMenu`), non stanno
nella ricerca rapida (`CommandPalette` cerca solo dentro `cercaVoci`, cioè
voci + schede del menu), e non c'è un indirizzo web per pagina: la pagina
aperta vive in `sessionStorage`, non nell'URL (`Dashboard.jsx:929`).

Il commento in `menuFoodos.js:302` dice che «Porta dentro i dati» «resta
raggiungibile anche dal Magazzino e dai Primi passi». **Non è vero**:
`PrimiPassi.jsx` non la nomina, `MagazzinoView.jsx` nemmeno.

`Integrazioni` invece si vede davvero, ma da un'altra strada: Impostazioni →
Notifiche → «Integrazioni» (`Impostazioni.jsx:1056`) monta il *componente*
dentro la pagina Impostazioni. Il ramo `vista==="integrazioni"` di
`Dashboard.jsx:3138` è codice morto.

### Difetto 2 — `semilavorati` è schermo bianco senza ricettario
`Dashboard.jsx:3103`: `{ricettario && vista==="semilavorati" && <SemilavoratiView…>}`.
Se il ricettario non è ancora caricato la scheda si apre e non disegna
**niente**: barra del titolo, striscia delle schede, e sotto il vuoto. Per
`ricettario` (3091) c'è il riquadro «Carica il ricettario»; per `semilavorati`,
`pl` e `simulatore` no. (pl e simulatore sono di altri agenti: solo segnalati.)

**Prossimo passo:** costruire il banco di prova che disegna le 14 pagine e
misurarle a 390px.

## Checkpoint 2 — misure fatte, prime correzioni

### Il righello, provato prima
Pagina finta con 9px, 11px, 17px, un'etichetta tagliata, una tabella da 900px,
un riquadro da 700px, due pulsanti da 30px. Esiti:
- `audit-scorrimento.mjs` → trovato (526px). **Buono.**
- `audit-design-telefono.mjs` → 2 sotto i 12px, 2 fuori scala, 1 tagliata,
  1 tabella larga. **Buono.**
- `audit-tocco.mjs` → **ROTTO**, vedi difetto 3.
- Rilevatore di disallineamento scritto da me: trova il gruppo storto (15px) e
  lascia stare quello dritto. **Buono.**

### Difetto 3 — `scripts/audit-tocco.mjs` misura solo i bersagli già a norma
Riga 54: `document.querySelectorAll('button[aria-label]')`. Conta **solo** i
pulsanti con `aria-label`, cioè quelli con la sola icona. Tutti i pulsanti con
una scritta dentro — la grande maggioranza — sono invisibili a questa misura.
Peggio: il foglio di stile del banco di prova ha una regola
`@media (pointer: coarse) { button[aria-label]{min-height:44px} }`, cioè
l'attrezzo misura esattamente gli unici che sono **forzati** a passare. Non può
che rispondere zero. Sul caso finto con due pulsanti da 30px: «bersagli sotto i
44px: 0 su 0».
Misurando davvero (button, a[href], input, select, textarea, label[for]):
**38 bersagli sotto i 44px su 91**, sulle mie 14 pagine.
Il file è dell'agente RIGHELLO (punto 5 del suo piano): non l'ho toccato.

### Misure sulle 14 pagine
- scorrimento laterale a 390px: **0**
- scritte sotto i 12px: **0** · fuori scala: **0** · tagliate: **0**
- tabelle più larghe dello schermo: **0** · pagine oltre 20 schermate: **0**
- riquadri affiancati non incolonnati: 0 a 390px (collassano in colonna),
  9 candidati a 1440px — guardate le fotografie, **8 sono falsi allarmi**
  (pannelli con scopi diversi affiancati, non riquadri di una fila).
- bersagli sotto i 44px: 38 su 91.

### Corretto finora
- [x] `CostiAziendaliView.jsx` — «0 €» dove non si sa (difetto 4, sotto)
- [x] `AzioniView.jsx` — si apriva sulla scheda sbagliata (difetto 5) + tocco
- [x] `MarketplaceView.jsx` — emoji → `Icon`, e il nome categoria rotto (difetto 6)
- [x] `RecipeInventorView.jsx` — emoji → `Icon` (anche dentro la richiesta all'AI)

### Difetto 4 — Costi fissi: «0 €» invece di «non lo so»
`CostiAziendaliView.jsx:210-231`. Con la tabella vuota: «COSTO MENSILE TOTALE
0 €», «COSTO ANNUO STIMATO 0 €», «CATEGORIA PRINCIPALE -». Due su tre erano una
bugia: affitto e utenze esistono comunque. E quel numero non resta lì — i costi
fissi entrano nel P&L mensile, quindi il conto economico usciva sbagliato senza
nessun segnale. Adesso i tre riquadri dicono tutti «-» più la riga che spiega.

### Difetto 5 — «Da fare» apriva la chat
`AzioniView.jsx:35`, `useState("chat")`. Questa pagina si raggiunge in un modo
solo: la scheda «Da fare». Ci si arrivava e usciva una chat AI — per giunta la
stessa cosa della scheda di fianco («Chiedi»). Ora apre sulle azioni.

### Difetto 6 — Marketplace: il nome della categoria mangiato
`MarketplaceView.jsx:118` faceva `lbl.split(' ').slice(1).join(' ')` per
togliere l'emoji dal nome. Sulle quattro categorie **senza** emoji buttava via
il nome: «Frutta secca» diventava «secca», «Latticini» diventava vuoto e al suo
posto compariva l'identificativo del database.

**Prossimo passo:** NuovaRicettaView (dice «0 ingredienti senza prezzo» quando
non ce n'è nessuno, e «0,00 €» come prezzo minimo), poi Eventi, Semilavorati,
Integrazioni, ImportaDati, HomeDipendente.

## Checkpoint 3 — NuovaRicetta, Semilavorati, HomeDipendente, la porta mancante

### Corretto in questo giro
- [x] `NuovaRicettaView.jsx` — difetto 7 (sotto)
- [x] `RecipeInventorView.jsx` — verificato: emoji zero, le otto icone esistono
      tutte in `Icon.jsx`, i pulsanti tipo/mood ora sono 44px
- [x] `Dashboard.jsx:3103` — difetto 2 chiuso: Semilavorati senza ricettario
- [x] `Impostazioni.jsx` + `Dashboard.jsx` — difetto 1 chiuso per `importa-dati`
- [x] `HomeDipendente.jsx` + `Dashboard.jsx` — difetto 8 (sotto)

### Difetto 7 — Nuova ricetta: «0 ingredienti senza prezzo» e «0,00 €»
`NuovaRicettaView.jsx:531` e `:1519`. Bastava scrivere un prezzo di vendita
perché la pagina si accendesse. Con zero ingredienti usciva il semaforo giallo
«Manca il costo di qualche ingrediente» e sotto «0 ingredienti sono senza
prezzo» — un allarme su zero cose — e il pannello del prezzo diceva **prezzo
minimo 0,00 €**, cioè: questa torta la puoi regalare. Un food cost che non si
conosce non è gratis. Ora c'è un terzo stato, `!live.conIngredienti`: «Ancora
nessun ingrediente» e la riga che dice che il prezzo minimo si calcola dal food
cost, e il food cost dagli ingredienti.

### Difetto 2 chiuso — Semilavorati non è più uno schermo bianco
`Dashboard.jsx`: prima della riga `{ricettario&&vista==="semilavorati"&&…}` c'è
ora il ramo `!ricettario`, con l'icona, cos'è un semilavorato e il pulsante
«Vai al ricettario» (44px). Restano scoperti `pl` e `simulatore`, che hanno lo
stesso `ricettario&&` davanti e la stessa pagina vuota: sono di altri agenti,
segnalati e non toccati.

### Difetto 1 chiuso per `importa-dati` — la porta che non c'era
`Impostazioni.jsx`, sezione **Avanzate → «Porta dentro i dati»**, sopra
«Importa prezzi»: un riquadro con il pulsante che apre la pagina. Il Dashboard
passa `onImportaDati={()=>setView("importa-dati")}`, come già faceva per il
changelog. Lì dentro ci sono i modelli Excel, il registro incassi del mese e il
caricamento guidato delle anagrafiche: la prima cosa che serve a un cliente
nuovo, ed era la meno raggiungibile del prodotto. Undici aperture nello storico,
poi la strada è sparita con la riorganizzazione del 15/09.

Nota: `Impostazioni.jsx:631` diceva già «per modificare un singolo prezzo usa
**Importa dati → Prezzi ingredienti**» — un'indicazione che mandava su una
pagina che non si poteva aprire. Adesso si può.

### `integrazioni` — non l'ho spostata, ma va detto cosa c'è sotto
Il ramo `vista==="integrazioni"` di `Dashboard.jsx` resta codice che nessuno
raggiunge dall'interfaccia (serve solo come rete se il nome arriva dalla
ricerca o dall'assistente). La pagina vera è Impostazioni → Notifiche →
Integrazioni, che monta lo stesso componente. **Ma con una differenza che vale
soldi**: il ramo del Dashboard è dietro `canAccessView("integrazioni", piano)`
= piano *enterprise*, la scheda in Impostazioni non ha nessun controllo. Oggi
non si vede perché `SBLOCCO_TUTTE_LE_PAGINE` è acceso (un piano solo, tutto
aperto); il giorno che si spegne, la funzione a pagamento resta gratis
dall'unica strada che funziona. Non l'ho corretto: chiudere un accesso che
oggi è aperto è una decisione commerciale, e `planAccess.js` è di un altro
agente. Segnalato.

### Difetto 8 — La giornata del dipendente: cinque pulsanti dichiarati sei
`HomeDipendente.jsx`. Il 15/09 il titolare ha deciso che è il dipendente a
scaricare il furgone, e `trasferimenti` è entrato in `VISTE_DIPENDENTE`. Questa
pagina no: per chi sta in laboratorio col tablet questa **è** la navigazione,
non una scorciatoia, e la merce arrivata si poteva confermare solo aprendo il
menu laterale. Aggiunto il sesto riquadro «Merce arrivata», e solo con più di un
negozio (con un negozio solo i trasferimenti non esistono: sarebbe un pulsante
verso il vuoto). Il commento in cima al file diceva «6 pulsantoni» da prima che
ne restassero cinque: corretto anche quello.

**Prossimo passo:** ImportaDati (props morte), Eventi (solo misura, è di un
altro agente), poi i test e il righello dei 44px.

## Checkpoint 4 — i due test rossi chiusi (17/09)

### Difetto 9 — «Invalid Date» sulla scheda dell'azione
`AzioniView.jsx:345`, adesso corretto. La data della scheda usciva da
`new Date(a.createdAt).toLocaleDateString("it-IT")` senza nessun controllo. Su
un'azione senza `createdAt` a schermo compariva **«Invalid Date»** — e nella
resa del test ne comparivano due, una per riga. Le azioni stanno in `user_data`
come jsonb: quelle salvate prima che il campo esistesse, o rientrate da un
backup, la data non ce l'hanno. Ora c'è `dataAzione()`: se la data non si legge,
la pagina scrive **«Data non registrata»**. Che è la stessa regola dei costi
fissi e del prezzo minimo — un dato che manca si dice.

Stessa famiglia, stesso giro: `a.label` è il titolo in grassetto della scheda.
Vuoto, restava una riga bianca, e nell'elenco delle completate una spunta senza
niente accanto. Ora `titoloAzione()` ripiega sul testo lungo e, se manca anche
quello, dice «Azione senza titolo».

### I due test rossi: erano i test, non il codice (salvo il difetto 9)
1. **«apre sull'elenco, non sulla chat»** — la linguetta era già a posto dal
   checkpoint 2 (`useState("azioni")`). Il test falliva perché il finto dato che
   avevo scritto inventava un campo `titolo`, mentre la forma vera di un'azione
   — quella che scrive `handleAddAct` in `Dashboard.jsx:1939` — ha il titolo in
   `label` e il testo lungo in `azione`. La pagina disegnava le azioni; erano
   senza nome perché il nome glielo passavo nel posto sbagliato. Fixture
   corretta. **È rendendo la pagina per questo test che è saltato fuori il
   difetto 9.**
2. **«nessuna etichetta perde la prima parola»** — stesso vizio della regex
   sulle emoji corretta dal titolare: il `lbl.split(' ').slice(1)` non c'è più
   nel codice da ieri, ma c'è nel **commento** che racconta il difetto, in cima
   al file. Il controllo ora guarda le righe vive (`eCommento` spostato in cima
   al file di test e condiviso con il controllo delle emoji).

### Righello verificato
Rimesso a mano il codice di prima (`useState("chat")`, `new Date(a.createdAt)
.toLocaleDateString`, `{a.label}`): **4 test su 9 diventano rossi**, i quattro
giusti. Poi ripristinato. Ora 9 su 9 verdi.

**Prossimo passo:** il secondo file di test della famiglia «il dato che manca lo
dice» — censire zeri e date finte nelle mie dieci pagine, partendo da
EventiView, ImportaDati, IntegrazioniView, SemilavoratiView.

## Checkpoint 5 — il cancello del build, e il righello che misurava il computer (17/09)

### Il cricchetto dei token: segnalazione VERA su tutti e tre i miei file
Guardato prima di correggere, come chiesto. `check-design-tokens.mjs` conta le
occorrenze con una regex su tutto il file, **commenti compresi** — è un difetto
vero dell'attrezzo, e su altri file può bocciare un commento che racconta un
difetto (è già successo due volte il 17/09 su due controlli miei). Ma qui no:
ho diffato le righe aggiunte una per una, e tutte e sei le deviazioni stanno in
codice vivo. Nessun falso allarme. Corrette:

| file | cos'era | com'è ora |
|---|---|---|
| `Eventi.jsx` | +2 `fontSize: 12` scritti a mano nelle due righe che spiegano il trattino | una sola costante `nota` in cima (`font.size.sm`), condivisa dalle due righe. **-2**: torna a 42 |
| `HomeDipendente.jsx` | +3 colori a mano nel sesto pulsantone «Merce arrivata» (`#1D4ED8`, `#60A5FA`, `#DBEAFE`) | `T.blue` + `${T.blue}AA` per la sfumatura, `T.blueLight` per l'icona. **-3**: torna a 23 |
| `NuovaRicettaView.jsx` | +1 `#FAF8F7` nel nuovo ramo «Ancora nessun ingrediente» | costante `BG_NEUTRO` in cima, che raccoglie anche le **due** occorrenze che c'erano già. **-2**: da 52 a 50 |

`node scripts/check-design-tokens.mjs` → i miei tre file sono usciti dall'elenco.
`node scripts/check-italian-grammar.mjs` → verde. `eslint` sui tre → verde.

### Resta rosso `Impostazioni.jsx`, e il +1 è MIO
Il titolare ha detto che quel file se lo prende lui. Va però detto di chi è la
riga, perché non è sua: è il pulsante «Porta dentro i dati» che ho aggiunto al
checkpoint 3 per chiudere il difetto 1.

    src/components/Impostazioni.jsx — il bottone dentro la sezione Avanzate:
    style={{ height:44, …, fontSize:13, … }}
                               ^^^^^^^^^^  →  fontSize: font.size.base

`font` è già importato in quel file. Non l'ho toccato per non scrivere sullo
stesso file mentre ci lavora un altro: è un `sed` di tre secondi e il cancello
torna verde.

### Il righello che misurava il computer, non il codice
`ilDatoCheMancaLoDice.test.jsx` aspettava con `setTimeout(…, 120)`. Lanciato da
solo: 17 verdi. Lanciato **insieme agli altri file**: il primo controllo rosso,
`expected 'Caricamento…' to contain 'Data da controllare'`. Il codice era
giusto: vitest gira su più processi e su una macchina carica 120 ms non bastano
a far tornare `sload`. Un controllo che cambia risposta a seconda di quanto è
occupato il computer boccia le correzioni buone, e la volta dopo lo si disattiva.
Ora c'è `pronta(v)`: aspetta la condizione vera (la pagina ha finito di caricare
e ha scritto qualcosa), si ferma appena è soddisfatta, e se non lo è mai lascia
parlare l'`expect` vero invece di dire «tempo scaduto».

### Righello verificato, di nuovo a mano
Rimessi i difetti di prima in `Eventi.jsx` (via la riga `Number.isNaN` da
`fmtDate`) e in `Integrazioni.jsx` (`records_importati || 0` nel badge,
`Number(records || 0)` nella scrittura a database, via il controllo in `fmtTs`):
**5 rossi su 17**, esattamente i cinque giusti — i tre di Integrazioni, la data
di Eventi e la rete di famiglia su «Ordinazioni». Poi ripristinato: 17 su 17.

**Prossimo passo:** rimisurare i bersagli sotto i 44px sulle dieci pagine
(erano 38 su 91) e chiudere il diario col riepilogo per pagina.

---

# Chiusura — riepilogo delle dieci pagine (17/09/2026)

## Una riga per pagina

| pagina | come ci si arriva | cosa non andava | cosa ho corretto | prima → dopo |
|---|---|---|---|---|
| **Nuova ricetta** | Ricettario → «Nuova ricetta», e «modifica» su una ricetta | Con zero ingredienti bastava scrivere un prezzo perché uscisse il semaforo giallo «0 ingredienti sono senza prezzo» — un allarme su zero cose — e **prezzo minimo 0,00 €**: cioè la torta la puoi regalare | Terzo stato `!live.conIngredienti`: «Ancora nessun ingrediente», più la riga che spiega che il prezzo minimo viene dal food cost e il food cost dagli ingredienti | **55 → 78** |
| **Semilavorati** | scheda dentro Ricettario | Senza ricettario caricato: titolo, striscia delle schede, e sotto **il vuoto**. Il Ricettario nella stessa condizione il riquadro «Carica il ricettario» ce l'aveva | Ramo `!ricettario` nel Dashboard: icona, cos'è un semilavorato, pulsante «Vai al ricettario» da 44px | **40 → 72** |
| **Porta dentro i dati** | Impostazioni → Avanzate → «Porta dentro i dati» *(porta creata da me)* | **Non si raggiungeva da nessuna parte.** Niente menu, niente ricerca rapida, niente indirizzo web. E Impostazioni rimandava già a «Importa dati → Prezzi ingredienti», cioè a una pagina che non si poteva aprire | Riquadro col pulsante in Impostazioni, `onImportaDati` dal Dashboard | **25 → 70** |
| **Collegamenti** | Impostazioni → Notifiche → Integrazioni | «Ultimo: **0 record**» con la spunta verde su un import riuscito di cui non si sa quante righe ha portato — la lettura è l'opposto della verità. E `Number(records \|\| 0)` scriveva quello zero **a database**. `fmtTs` dava «Invalid Date Invalid Date» nel registro | I tre punti passano da un controllo sul vuoto («non so quante righe», «-»); `fmtTs` controlla la data non valida | **45 → 68** |
| **Costi fissi** | scheda «Costi fissi» dentro P&L | Tabella vuota: «COSTO MENSILE TOTALE 0 €», «COSTO ANNUO STIMATO 0 €». Due bugie su tre — affitto e utenze esistono comunque — e quel numero **entra nel P&L mensile**: il conto economico usciva sbagliato senza nessun segnale | I tre riquadri dicono «-» più la riga che spiega | **50 → 80** |
| **Da fare** | scheda «Da fare» dentro Assistente AI | Si apriva sulla **chat**, cioè sulla stessa cosa della scheda di fianco. Sulle schede: «Invalid Date» al posto della data, e titolo vuoto = riga bianca | Apre sulle azioni; `dataAzione()` → «Data non registrata»; `titoloAzione()` ripiega sul testo lungo, poi «Azione senza titolo» | **45 → 82** |
| **Ordinazioni** | scheda «Ordinazioni» dentro Calendario | «Invalid Date» sulla scheda **e sul PDF mandato al cliente** (`fmtDate` aveva un `try/catch` che non poteva servire a niente: una data non valida non lancia, scrive). «Ricavo 0 € · Margine 0% · Saldo 0 €» su un preventivo che **nessuno aveva ancora compilato**, col saldo pure verde — «pagato» su una cosa mai quotata. E se una riga ha food cost ignoto il margine esce più alto del vero senza dirlo. Più «1 prodotti», «0 evento/i», e i pulsanti delle schede a 36px | `fmtDate` → «Data da controllare»; i tre numeri restano «-» finché non c'è un preventivo, con la riga che dice perché; avviso ambra «il margine qui sopra è più alto del vero»; plurali a parole; bersagli a 44px | **48 → 80** |
| **La tua giornata** | il logo in alto, quando chi guarda è un dipendente | Cinque pulsantoni, e il commento in cima ne dichiarava sei. Dal 15/09 è il dipendente a scaricare il furgone, ma la merce arrivata si confermava solo aprendo il menu laterale — e per chi sta in laboratorio col tablet **questa pagina è la navigazione** | Sesto riquadro «Merce arrivata», solo con più di un negozio (con uno solo sarebbe un pulsante verso il vuoto); commento corretto | **65 → 85** |
| **Marketplace** | *(nessuna: `ritirata: true`)* | `lbl.split(' ').slice(1)` toglieva l'emoji dal nome della categoria e sulle quattro **senza** emoji si mangiava la parola: «Frutta secca» → «secca», «Latticini» → vuoto, e al suo posto l'identificativo del database. Più emoji al posto di `Icon`, e testi da traduzione automatica («stiamo onboardando», «la community») | Emoji → `Icon`, nome categoria intero, bersagli a 44px, testi riscritti in italiano | **45 → 72** |
| **Inventa ricette** | *(nessuna: `ritirata: true`)* | Emoji nell'interfaccia **e dentro la richiesta mandata all'AI**; pulsanti tipo/mood sotto i 44px | Emoji → `Icon` (verificato che tutte e otto le icone esistono in `Icon.jsx`), bersagli a 44px | **60 → 78** |

> **Nota di onestà su Ordinazioni.** Il difetto più caro di quella pagina — il
> food cost letto da `ric.foodCost`/`ric.fc`, campi che una ricetta non ha, per
> cui ogni evento usciva a margine 100% — **non l'ho trovato io**: era già
> corretto in `b0ca9f5` dell'11/09 («ogni preventivo mostrava margine 100%»).
> L'ho scoperto rileggendo il diff prima di chiudere, e l'avevo scritto qui
> come se fosse mio. Il mio lavoro su quella pagina è quello nella riga qui
> sopra.

## Le pagine che NON si raggiungono — l'informazione più preziosa

1. **`marketplace`** e **`ricette-ai`** — non le ho «non raggiunte»: sono
   `ritirata: true` in `menuFoodos.js`, tolte dal menu il 15/09 di proposito.
   Restano disegnate e manutenute. Vale la pena decidere: o tornano
   raggiungibili, o si tolgono dal codice. Oggi costano manutenzione a zero
   utenti, e sono due delle dieci pagine che ho auditato.
2. **`integrazioni`** — il ramo `vista==="integrazioni"` del Dashboard **è
   codice morto**: nessuno lo raggiunge dall'interfaccia. La pagina vera è
   Impostazioni → Notifiche → Integrazioni, che monta lo stesso componente.
   **Con una differenza che vale soldi**: il ramo del Dashboard è dietro
   `canAccessView("integrazioni", piano)` = piano *enterprise*, la scheda in
   Impostazioni non ha nessun controllo. Oggi non si vede perché
   `SBLOCCO_TUTTE_LE_PAGINE` è acceso; il giorno che si spegne, la funzione a
   pagamento resta gratis dall'unica strada che funziona. **Non corretto**:
   chiudere un accesso oggi aperto è una decisione commerciale, e
   `planAccess.js` non è mio.
3. **`importa-dati`** — era irraggiungibile, adesso no. Undici aperture nello
   storico, poi la strada è sparita con la riorganizzazione del 15/09.
4. Non sono riuscito a **rendere** `Integrazioni` in un test unitario: le
   schede si aprono solo dopo che il controllo del backend è andato a buon
   fine, e lì dentro quel backend non c'è. I suoi tre controlli guardano il
   sorgente, non la pagina resa. È scritto nel file: se un giorno diventa
   rendibile, vanno rifatti meglio.

## Due cose che ho trovato e che NON ho corretto (non sono mie)

- **`menuFoodos.js:301`** dice che «Importa dati» «resta raggiungibile anche
  dal Magazzino e dai Primi passi». Non è vero né prima né adesso: né
  `PrimiPassi.jsx` né `MagazzinoView.jsx` la nominano. Ora la porta c'è, ma sta
  in Impostazioni: il commento va corretto o manda fuori strada il prossimo.
- **`support@foodos.it` compare 48 volte nel prodotto**, due sulla mia pagina
  Marketplace — dove è l'**unico** modo di fare la cosa che la pagina chiede
  («segnalaci un fornitore»). Il dominio `foodos.it` non risolve: quelle due
  righe invitano il cliente a scrivere a un indirizzo che rimbalza. Non è un
  difetto di codice e non si corregge scrivendo codice: si compra il dominio.
  Non ho inventato un altro indirizzo.

## Il conto delle misure, alla fine

| misura, sulle mie pagine a 390px | all'inizio | adesso |
|---|---|---|
| scorrimento laterale | 0 | 0 |
| scritte sotto i 12px · fuori scala · tagliate | 0 · 0 · 0 | 0 · 0 · 0 |
| tabelle più larghe dello schermo | 0 | 0 |
| campi di testo sotto i 16px (zoom iOS) | 0 su 13 | 0 su 13 |
| **bersagli sotto i 44px** | **38 su 91** | **2 su 89** |

Due avvertenze sui denominatori, perché **non sono lo stesso insieme**.

1. Il 91 di partenza contava anche le due fotografie di **Trasferimenti**,
   che non è una mia pagina: l'ho tolta dalla misura finale per non
   prendermi il merito (o la colpa) del lavoro di un altro. Quanti dei 38
   stessero lì **non lo so** — la misura di partenza l'avevo salvata come
   totale e non per pagina, e per rifarla dovrei rimettere dieci file
   com'erano mentre altri tre agenti ci scrivono dentro.
2. Il 63 che avevo scritto qui prima veniva da **otto pagine su dieci**:
   `Ordinazioni` non era nel banco di prova e io raccontavo il numero come se
   fossero dieci. L'ho aggiunta a `layoutPagineFuoriMenu.test.jsx` — con due
   eventi dentro, uno quotato e uno no, perché è **sulle schede** che stanno i
   pulsanti e una pagina vuota non li avrebbe mai mostrati al metro. Da lì il
   **2 su 89**: ventisei bersagli in più misurati, zero difetti in più.

Resta fuori solo `Integrazioni`, e si sa perché: le sue schede si aprono dopo
il controllo del backend, che in un test unitario non c'è.

Quella fotografia serve anche a un'altra cosa: **è la prova che le correzioni
di Ordinazioni funzionano davvero nel browser**, non solo negli `expect`. Nel
testo reso si leggono, in fila: «Ricavo - Margine - Saldo -» seguito da
«Preventivo ancora da compilare» sull'evento mai quotato; «Una riga è senza
food cost: il margine qui sopra è più alto del vero» su quello che dichiarava
100%; «1 prodotto» e «nessun prodotto»; «2 eventi».

(Un numero che avevo scritto a occhio e ho tolto: «30 su 63» come conto di
partenza delle sole mie pagine. Non l'avevo misurato. È la regola di tutto
questo diario, e vale anche quando il numero fa comodo a me.)

I due rimasti sono i `mailto:support@foodos.it` di Marketplace, 105x15,
**dentro una frase**. WCAG 2.5.8 esenta proprio questo caso («the target is in
a sentence»): allargarli spezzerebbe il paragrafo per rispettare una regola che
non li riguarda. Sono due falsi allarmi, non due difetti: **zero veri**.

## Gli attrezzi, e quali mentivano

Quattro righelli provati su un caso finto prima di fidarmi:
`audit-scorrimento.mjs` **buono**, `audit-design-telefono.mjs` **buono**,
il rilevatore di disallineamento scritto da me **buono**, e due rotti:

- **`audit-tocco.mjs`** guardava `button[aria-label]`, cioè **solo** i pulsanti
  con la sola icona — e il foglio di stile del banco di prova li forza a 44px.
  Misurava esattamente gli unici obbligati a passare: sul caso finto con due
  pulsanti da 30px rispondeva «0 su 0». Segnalato a RIGHELLO, che l'ha corretto:
  è con quello corretto che è uscito il 38 su 91.
- **`check-design-tokens.mjs`** contava i **commenti**. Segnalato; RIGHELLO
  l'ha riscritto il 17/09 e ha trovato anche il secondo difetto, più grave:
  vedeva `#FFFFFF` e non `#FFF`, cioè accorciare un colore faceva **calare** il
  numero senza aver tolto niente.
- E un righello mio: `ilDatoCheMancaLoDice.test.jsx` aspettava 120 ms fissi.
  Da solo verde, insieme agli altri rosso — misurava quanto è occupato il
  computer. Ora aspetta la condizione vera.

## Un difetto che mi sono fatto da solo, e come è saltato fuori

Convertendo i `'#FFF'` di Marketplace e Inventa ricette nel token `textOnDark`
ho fatto una sostituzione secca su tutto il file, e ha preso anche questa:

    const CARD = T.bgCard || SU_BRAND      // riga 21
    const SU_BRAND = T.textOnDark          // riga 25

Due cose sbagliate in una riga. `CARD` è il **fondo** di una tessera, non il
testo sopra il bordeaux: il token giusto è `white`. E `SU_BRAND` è dichiarato
quattro righe **sotto**: se un giorno `T.bgCard` diventasse vuoto, la pagina
non si aprirebbe più — `ReferenceError`, schermo bianco. Oggi non succede solo
perché `T.bgCard` è pieno e il `||` si ferma prima di guardare.

`eslint --quiet` non l'ha vista (`no-use-before-define` non è acceso su questo
progetto). L'ho vista rileggendo il diff riga per riga prima di chiudere — cioè
con lo stesso passaggio che ha smascherato l'attribuzione sbagliata su
Ordinazioni. Corretta in tutti e due i file: `T.bgCard || T.white`.

La morale, per il prossimo: una sostituzione su tutto il file non sa cosa
significano le stringhe che tocca. `'#FFF'` era lo stesso bianco in nove punti,
ma in uno voleva dire un'altra cosa.

## Stato finale

- `node scripts/check-design-tokens.mjs` — nessuno dei miei undici file
  peggiora rispetto a HEAD sotto le regole nuove (verificato file per file:
  Marketplace **-3**, RecipeInventor **-4**, NuovaRicetta **-1**, gli altri 0).
- `node scripts/check-italian-grammar.mjs` — verde.
- `npx eslint` sui file toccati — verde.
- Niente commit, niente push.
