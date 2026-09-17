# Diario agente SOLDI — audit Foodos 16/09/2026

## Mandato
Ogni punto del prodotto dove si calcola un euro o una percentuale.
Cerco numeri SBAGLIATI nelle pagine di bilancio.

## Piano (scritto prima di cominciare)
1. Leggere le due correzioni di oggi (`plSensibilita.js`, `mediaFoodCost.js`) per
   capire la forma della famiglia: «costo su dati incompleti trattato come costo basso».
2. Aprire la connessione ai dati veri di Mara dei Boschi
   (org `889e7fc2-fb93-42eb-96f1-e73b3e738a12`) e misurare PRIMA.
3. Verificare le 5 piste note:
   - media €/kg non pesata
   - tre formule per «quanto devo al fornitore»
   - `normNome` non normalizza S.R.L./SRL (~118.000 € doppi)
   - ricavi ConfrontoSedi vs P&L (28% di scarto)
   - `scontrino_medio_eur` fuori da COLONNE in chiusure.js
4. Caccia agli altri membri della famiglia: ogni `/ costo`, ogni media, ogni
   filtro `> 0` usato come «dato completo».
5. Per ogni difetto: misura prima → correzione → misura dopo → tre test.

## Stato
- [x] Letto REGOLE.md e CLAUDE.md
- [ ] Lette le due correzioni di riferimento
- [ ] Connessione DB verificata
- [ ] Inventario dei punti di calcolo

## Prossimo passo
Leggere plSensibilita.js e mediaFoodCost.js.

---
## Checkpoint 25% — 16/09, difetti confermati sui dati veri

Connessione DB OK (`scratchpad/qf.sh`). Org Mara: 3.104 fatture, 58 ricette,
6 ingredienti con prezzo (su ~99 nomi), 5 formati di vendita, 0 chiusure.

### D1 — Note di credito: due formule, tutte e due sbagliate (CONFERMATO)
Nel DB vero **non esiste nemmeno una riga con `tipo='nota_credito'`**: tutte
3.104 sono `tipo='fattura'`, e le 4 note di credito vere sono fatture con
`totale` NEGATIVO (Enel −365,55; Morra −10; Enel −10; Enel −10).
- `src/lib/fatture.js:residuoFattura` → `segno * Math.max(0, totale - pagato)`.
  Con totale −365,55 e pagato 0 fa `max(0, −365,55)` = **0**: il credito sparisce.
- `src/lib/pagamentiFornitore.js:residuoDa` → fa `Math.abs()` su totale e
  pagato e poi moltiplica per il segno dedotto dall'ETICHETTA: risultato
  **+365,55**, cioè un DEBITO dove c'è un credito. Errore di 731,10 € di swing.
- `src/lib/scadenzeFatture.js:arricchisci` è già stato corretto oggi e prende
  il segno dall'IMPORTO. È la formula che deve sopravvivere.

### D2 — `scontrino_medio_eur` scritto e mai riletto (CONFERMATO)
`src/lib/chiusure.js:19` la costante `COLONNE` non contiene
`scontrino_medio_eur`; la riga 40 lo legge (`r.scontrino_medio_eur`) → sempre
`null`. La colonna ESISTE nel DB (verificata in information_schema).
Salvato alla riga 68, mai riletto: lo scontrino medio in euro è perso.

### D3 — Fornitori contati due volte per la forma societaria (CONFERMATO)
`normNome` (scadenzeFatture.js:40) fa solo upper+trim+spazi.
Sui dati veri 9 fornitori hanno due varianti «SRL» / «S.R.L.»:
FOODINHO 41.324 €, RBS 35.415 €, SPAZIOTTANTOTTO 7.082 €, PERINOVESCO 5.646 €,
PEYRANO 2.528 €, FARCOMI 2.257 €, LUOGO DIVINO 987 €, RCH 586 €,
CASALINGHI SICIGNANO 24 € = **95.847 €** su 199 fatture spezzati in due schede.

### D4 — Media €/kg non pesata (CONFERMATO, radice fuori dai miei file)
`src/lib/formatiVendita.js:avgPrezzoPerKgCategoria` fa la media aritmetica
semplice del €/kg dei formati. Sui dati veri di Mara:
CONO PICCOLO 35,00 · CONO MEDIO 32,14 · CONO GRANDE 30,56 · VASCH 1KG 28,00 ·
VASCH ½KG 28,00 → media semplice **30,74 €/kg**, media pesata sui grammi
**28,91 €/kg**: +6,3% di ricavo inventato su OGNI gusto del P&L.
`formatiVendita.js` non è nella mia lista: la correzione va fatta a valle.

## Prossimo passo
Scansione sistematica: ogni `/ costo`, ogni media, ogni `> 0` usato come
«dato completo» nei miei file. Poi PLView vs ConfrontoSedi (pista 4).

---
## Checkpoint 50% — il difetto più grosso: la correzione di stamattina non è collegata

### D0 — «MANGO JERRY SPICY +51.654%» È ANCORA A SCHERMO (CRITICO)
`src/views/PLView.jsx:1831` passa a `SensTable` le righe costruite alla riga
812. Quella mappa fa `const { tot: fc } = calcolaFC(...)` e **butta via
`mancanti`**: nessuna riga ha `fcParziale`. `righeSensibilita` filtra
`!r?.fcParziale`, che su `undefined` è sempre vero → **passano tutte**.
Il `fcParziale` esiste davvero, ma su un ALTRO array di righe (riga 1111,
tabella dei gusti), che a `SensTable` non arriva mai.

Simulazione sui dati veri di Mara (`scratchpad/sim.mjs`, 55 ricette):
```
righeSensibilita SENZA fcParziale (oggi):  validi 45 · costoIncompleto 0
    MANGO JERRY SPICY          +51.654,1%   (3 ingredienti su 6 senza prezzo)
    AMOUR FOU, MYSTIC, LIMONE  +36.936,1%   (2 su 4)
    NOCCIOLA VEGANA             +7.454,7%   (3 su 5)
righeSensibilita CON fcParziale (atteso):  validi 4 · costoIncompleto 41
    FIOR DI PANNA 1.116,2% · FOGLIA DI FICO 1.116,2% · CIOCCOLATO BIANCO 973,7%
```

### D0-bis — la card FOOD COST del P&L dice 4,9%
Stessa radice: `totFC/totRicavo` sulle righe «con prezzo», senza controllare
che il costo sia completo. Sui dati veri: ricavo 1.789,88 €, food cost 87,22 €
→ **4,9%**. Sulle sole 4 ricette col costo completo è 8,5%. Per una gelateria
il vero sta fra 25% e 35%. È il gemello di «FOOD COST MEDIO 4,8%» del
Ricettario, ma nella pagina di bilancio.

### D1 — media €/kg, misurata
media semplice 30,7397 €/kg · media pesata sui grammi 28,9063 €/kg
→ +1,8334 €/kg, **+6,34% su ogni ricavo di gusto**.
Su ~6.930 kg/mese (luglio 2026: 7.182 kg prodotti) fa **≈12.707 € al mese**
di ricavo inventato. Radice: `euroKgMedioFormati` (inventarioProduzione.js) e
`avgPrezzoPerKgCategoria` (formatiVendita.js), due copie, entrambe non pesate.

### D4 — ConfrontoSedi legge le chiusure dal BLOB LEGACY
`ConfrontoSedi.jsx:200` → `sload('pasticceria-chiusure-v1', …)`.
Il P&L legge da `caricaChiusure` → tabella `chiusure_cassa` (migration
20260907b). `salvaChiusure` scrive SOLO sulla tabella: il blob è una fotografia
ferma al 7 settembre. Org `7d15fb9c`: 79 chiusure, 45.856 € — oggi i due
coincidono per caso, ogni chiusura registrata da qui in poi li fa divergere.

### D5 — «fatture scadute» in ConfrontoSedi è SEMPRE zero
`ConfrontoSedi.jsx:181` usa `f.data_scadenza < todayIso`. In produzione
`data_scadenza` è NULL su **3.520 fatture su 3.520** (verificato). Lo
Scadenzario la deduce da `data_fattura + termini`. Mara: 69 fatture aperte per
43.066,67 €, e la pagina multi-sede non ne segnala nessuna.

### D6/D7 — vedi checkpoint 25% (scontrino_medio_eur) e chiusure.js:
`importaChiusureIncassi` scrive `avgST: Number(vecchia?.kpi?.avgST) || 0`:
trasforma «non rilevato» in «0% smaltito», contro la regola dichiarata due
funzioni sopra.

## Ordine di lavoro
D0 → D1 → D2 (note di credito) → D3 (fornitori doppi) → D4/D5 → D6/D7.

## Prossimo passo
Correggere D0 in PLView.jsx e scrivere i test.

---
## Checkpoint 75% — D0 e D0-bis CHIUSI

### D0 — la correzione di stamattina ora è collegata
**Misura PRIMA** (`scratchpad/sim-d0.mjs` sui dati veri di Mara, 58 ricette):
righeSensibilita → validi **45**, costoIncompleto **0**.
In cima: MANGO JERRY SPICY +51.654,1% · AMOUR FOU +36.936,1% · NOCCIOLA
VEGANA +7.454,7% · MYSTIC +5.644% · BANANA +4.779,4%.

**Correzione** — `src/views/PLView.jsx`:
- riga ~815: `const { tot: fc } = calcolaFC(...)` → `const { tot: fc, mancanti } = calcolaFC(...)`
- la riga costruita porta ora `fcParziale: (mancanti || []).length > 0` e `mancanti`

**Misura DOPO**: validi **4** (FIOR DI PANNA · FOGLIA DI FICO · FIOR DI
CROCCANTE · CIOCCOLATO BIANCO), costoIncompleto **41**, senzaPrezzo 13.

### D0-bis — la card FOOD COST
**Misura PRIMA**: ricavo 1.560,54 € · food cost 72,11 € → **4,6%** su 48
prodotti (44 dei quali col costo incompleto).
**Nuovo modulo** `src/lib/totaliSuCostiNoti.js` (stessa forma di
`mediaFoodCost.js`): ricavo, food cost e margine si calcolano tutti e tre
sullo STESSO insieme — prezzo di vendita + costo completo — così il conto
economico non si contraddice da solo. Conta e dichiara gli esclusi divisi per
motivo, col food cost dei senza-prezzo e il ricavo dei costo-incompleto.
**Misura DOPO**: 4 righe · ricavo 132,17 € · fc 11,20 € · margine 120,97 €
→ FC ratio **8,5%**. Fuori: 10 senza prezzo (94,87 € di materie prime) e
**44 col costo incompleto, per 1.428,37 € di ricavo teorico** — ora scritto.

Toccati anche, nella stessa pagina: `PLTable` (il testo degli esclusi era in
due copie, ora è il componente `NotaEsclusi` e dice tutti e due i motivi), le
tre card KPI (sottotitolo «su N prodotti su M»), il badge del Conto economico.

**Test**: `tests/unit/plCostoIncompletoCollegato.test.js`, 14 test.
Riproduce (la riga senza `fcParziale` passa il filtro; `calcolaFC` restituisce
davvero `mancanti` — righello verificato), correzione, e intorno (R−FC=M,
motivi che non si sovrappongono, elenco vuoto, prodotto in perdita, media dei
margini vs margine del totale, best/worst sui soli costi noti).

## Prossimo passo
D1 — media €/kg non pesata. Radice in `formatiVendita.js:avgPrezzoPerKgCategoria`
e `inventarioProduzione.js:euroKgMedioFormati`: due copie, entrambe non pesate.
Da fondere in UN modulo pesato sui grammi. Nel resto di `inventarioProduzione.js`
NON entrare (ci lavora MAGAZZINO).

---
## D1 CHIUSO — media €/kg ora pesata sui grammi, in un posto solo

**Misura PRIMA** (formati veri di Mara): media semplice **30,7397 €/kg**.
**Misura DOPO**: media pesata **28,9063 €/kg** — scarto **6,34%**.
Su 6.930 kg/mese: 213.026 € → 200.320 €, cioè **12.706 €/mese di ricavo
inventato** tolti dal P&L.

**Nuovo modulo** `src/lib/prezzoMedioAlKg.js`: somma degli incassi diviso
somma dei grammi. Dichiara anche quello che ancora NON sa (pesa i formati come
se se ne vendesse uno di ciascuno: il mix di vendita vero non è in questi dati).

Le due copie ora la chiamano:
- `src/lib/formatiVendita.js:avgPrezzoPerKgCategoria` → `prezzoMedioAlKg(src)`
  (la scelta della categoria e i fallback restano dov'erano)
- `src/lib/inventarioProduzione.js:euroKgMedioFormati` → `prezzoMedioAlKg(formati)`
  Nel resto di quel file non sono entrato. Unica eccezione: il commento di
  `ricaviDaInventario` dichiarava «media semplice dei formati» e sarebbe
  rimasto una bugia — riscritto, 4 righe, nessun codice toccato.

**Test**: `tests/unit/prezzoMedioAlKgPesato.test.js`, 11 test (con la vecchia
formula tenuta dentro per misurare lo scarto). Aggiornati 6 test esistenti che
fotografavano i numeri non pesati, ognuno col perché scritto sopra:
`formatiVendita.test.js` (1), `inventarioProduzioneExt.test.js` (1),
`useRicavoFlat.test.jsx` (4).

### ⚠ Non mio: la suite ha 10 rossi in `tests/unit/aiEngine.test.js`
`ReferenceError: giornoItaliano is not defined` (aiEngine.test.js:369). È
lavoro in corso dell'agente DATE su `api/lib/aiEngine.js` + `dateLocal.js`:
il test usa `giornoItaliano` senza importarlo. Io non ho toccato quei file.

## Prossimo passo
D2 — note di credito: `fatture.js:residuoFattura` dà 0 dove c'è un credito,
`pagamentiFornitore.js:residuoDa` dà +365,55 (un DEBITO). La formula giusta è
quella già corretta oggi in `scadenzeFatture.js:arricchisci`: il segno si
prende dall'IMPORTO, non dall'etichetta.

---
## D2 CHIUSO — la nota di credito si riconosce dall'importo, non dall'etichetta

**Misura PRIMA** (`scratchpad/sim-d2.mjs`: le 6 fatture Enel aperte di Mara,
10.189,10 €, più la nota di credito da −365,55 € com'è il giorno in cui arriva):

```
Cashflow    (fatture.js)          10.189,10 €   il credito sparisce
Pagamenti   (pagamentiFornitore)  10.554,65 €   il credito è un DEBITO
dovuto vero                        9.823,55 €
```
365,55 € di scarto fra due pagine sugli stessi dati; 731,10 € fra la pagina
peggiore e la verità. Dalla pagina sbagliata partono i bonifici.

**Correzione** — nuova funzione `isNotaCredito(f)` in `src/lib/fatture.js`:
è nota di credito se lo dice l'etichetta **oppure** se il totale è negativo.
Le due regole stanno insieme (`parseFatturaXML` l'etichetta la scrive per
TD04/TD08; queste fatture sono entrate da altre strade).

Chiamata da `residuoFattura`, e da altri **tre punti della stessa famiglia**
trovati dietro allo stesso filo:
- `pagamentiFornitore.js:ordinePagamento` — il credito non finiva in cima:
  il bonifico chiudeva fatture invece di consumare prima il credito;
- `pagamentiFornitore.js:testoEstrattoConto` — la nota di credito era
  elencata sotto «Ci risultano da saldare» con l'importo in POSITIVO, mentre
  il totale in fondo era giusto: una mail al fornitore che chiede 365,55 € che
  invece deve lui, e con le righe che non tornano col totale;
- `riconciliazioneBanca.js:proponiAbbinamenti` — la nota di credito restava
  fra le candidate e, siccome lì il residuo si calcola in valore assoluto, un
  bonifico da 365,55 € ci si abbinava esatto: un clic chiudeva il documento
  sbagliato.

**Trovato per strada**: `residuoFattura` restituiva `-0` quando un credito è
usato fino all'ultimo centesimo (`-1 * 0` in JavaScript). Con la regola dei
numeri italiani del progetto (`toLocaleString('it-IT')`) a schermo diventa
**«-0,00 €»**. Ora è zero vero.

**Misura DOPO**: tutte e tre le pagine dicono **9.823,55 €**. Un bonifico da
5.000 € usa prima il credito (5.365,55 € imputati), chiude 3 fatture e lascia
un acconto sulla quarta. L'estratto conto mette il credito sotto «A nostro
credito» e le righe tornano col totale. La banca non abbina più la NC.

**Test**: `tests/unit/noteCreditoSegnoImporto.test.js`, 20 test.
Riproduce (le due vecchie formule ricopiate: 0 e +365,55; il vecchio ordine
metteva una fattura davanti al credito), correzione (le tre pagine allineate,
l'etichetta che continua a valere), intorno (imputazione, lettera al
fornitore, riconciliazione bancaria, pagata-a-mano, credito usato a metà,
acconto oltre il credito, riepilogo per periodo, e il righello: senza note di
credito i numeri non si muovono).

## Prossimo passo
D3 — fornitori doppi S.R.L./SRL: `normNome` (scadenzeFatture.js:40) fa solo
upper+trim+spazi. 95.847 € su 199 fatture spezzati in due schede su 9
fornitori.

---
## D3 CHIUSO — un punto in più non fa un secondo fornitore

**Misura PRIMA** (`scratchpad/out-d3.txt`, sulle 3.520 fatture vere):
**321 schede fornitore** dove i fornitori sono 312. Nove hanno due scritture
della stessa ragione sociale, per **104.619,41 € su 221 fatture**, di cui
**9.925,33 € ancora da pagare**:

```
FOODINHO S.R.L. + FOODINHO, SRL          93 fatture   45.352,97 €   (aperte 14 · 5.109,39 €)
RBS S.R.L. + RBS SRL                     64 fatture   40.047,52 €   (aperte  8 · 4.632,94 €)
SPAZIOTTANTOTTO S.R.L. + ... SRL         15 fatture    7.191,90 €   (aperte  2 ·   109,80 €)
PERINOVESCO · PEYRANO · FARCOMI · LUOGO DIVINO · RCH · CASALINGHI SICIGNANO
```
FOODINHO era la riga #13 (38.237,72 €) **e** la #37 (7.115,25 €).
SPAZIOTTANTOTTO era la #44 e la #105 invece della #37.

Il numero è più grande di quello che avevo scritto al checkpoint 25% (95.847 €):
lì avevo cercato solo la coppia S.R.L./SRL e mi ero perso **FOODINHO, che si
spezza su una VIRGOLA** («FOODINHO, SRL»), da sola la coppia più grossa.

**Correzione** — `normNome` (`src/lib/scadenzeFatture.js`) ora:
maiuscolo · accenti appiattiti («SOCIETÀ» = «SOCIETA'», tutte e due nel DB) ·
trattino e barra → spazio · punti, virgole, apostrofi, virgolette **tolti**,
non sostituiti con uno spazio (il dettaglio che conta: «S.R.L.» deve diventare
«SRL», non «S R L» — col primo tentativo non univa niente).

Non toglie la forma societaria di proposito: «ROSSI SRL» e «ROSSI SPA»
possono essere due società dello stesso gruppo, e sui dati veri toglierla non
unirebbe nessun'altra coppia. Rischio senza guadagno.

`fornitoriDaFatture.js:normNomeFornitore` era una **copia identica** della
stessa regola in un altro file: ora è `export { normNome as normNomeFornitore }`.
Una regola, un posto.

**Misura DOPO**: 321 → **312 schede**, nove accorpamenti, **esattamente le
nove coppie** e nessun'altra. Il righello regge nei due sensi.

**Test**: `tests/unit/fornitoriStessaRagioneSociale.test.js`, 16 test.
Riproduce (la vecchia regola teneva separate tutte e nove), correzione
(le nove coppie, «S.R.L.»→«SRL», accenti, trattini, le due copie ora una),
righello (SRL≠SPA, nomi diversi restano diversi, 12 scritture → 9 chiavi,
il vuoto non diventa una chiave finta), intorno (spesa in una riga, la pagina
Fornitori non ripropone chi c'è già, i termini e l'IBAN valgono per tutte e
due le scritture — senza IBAN la fattura resta fuori dal bonifico SEPA —,
il bonifico cumulativo imputa tutte e due).

## Prossimo passo
D4 — `ConfrontoSedi.jsx:200` legge le chiusure dal blob legacy
`pasticceria-chiusure-v1` invece della tabella `chiusure_cassa`. Il blob è
fermo al 7 settembre; `salvaChiusure` scrive solo sulla tabella.

---
## D4 CHIUSO — le chiusure di cassa si leggono da un posto solo

**Misura PRIMA**: `ConfrontoSedi.jsx:200` chiedeva le chiusure a
`sload('pasticceria-chiusure-v1')`, cioè al blob jsonb di `user_data`. Il
conto economico le chiede a `caricaChiusure`, cioè alla tabella
`chiusure_cassa` (migration 20260907b). Dal 7 settembre `salvaChiusure`
scrive SOLO sulla tabella: il blob è la fotografia del giorno della
migrazione. In produzione esiste per UNA sola organizzazione (la demo, 79
giornate); Mara dei Boschi non ce l'ha proprio — la sua pagina multi-sede
leggeva `null` e restava vuota, con l'allarme rosso acceso.

I callsite che chiedevano il blob erano **undici**: Confronto sedi, Dashboard,
Previsioni, Brain, Menu engineering, Ordini AI, Personale, Sprechi e omaggi,
Esporta dati, Export contabilità, Benchmark.

**Correzione** — il dirottamento sta in `src/lib/storage.js`, non sugli undici
callsite: `sload`, `ssave` e `sloadAllSedi` riconoscono la chiave delle
chiusure e passano a `caricaChiusure` / `salvaChiusure` /
`caricaChiusurePerSede`. Stessa ragione per cui quello in scrittura stava già
nel wrapper del Dashboard: con undici punti sparsi, uno resta sempre indietro.
Nuova `caricaChiusurePerSede` in `chiusure.js` (forma di `sloadAllSedi`:
`{ [sedeId]: [chiusure] }`, righe senza sede escluse come faceva il blob).

Ci è entrata anche la scrittura, e non perché fosse rotta: lo stesso
dirottamento era scritto DUE volte (wrapper del Dashboard e di `ChiusuraView`)
e chi chiamava `ssave` senza passare da uno dei due scriveva ancora sul blob —
è il caso di `demoSeed.js`.

**Misura DOPO**: le stesse tre giornate lette dalle due strade danno lo stesso
numero; la chiusura registrata oggi compare in tutte e undici le pagine. Su
errore di rete `sload` dà `null`, non `[]`: «non lo so» non è «la cassa non è
mai stata chiusa».

**Test**: `tests/unit/chiusureUnaSolaFonte.test.js`, 14 test.
Riproduce (la `sload` di prima ricopiata: 1.240,00 € dal blob dove la cassa ne
ha incassati 1.560,50 €; e `null` per chi il blob non ce l'ha), correzione
(le tre funzioni passano dalla tabella e non toccano mai `user_data`, la forma
dati resta quella del blob, la sede giusta), intorno (righello nei due sensi:
le altre chiavi continuano a passare da `user_data` in lettura e in scrittura;
errore di rete → `null`; righe senza sede fuori dal confronto; senza org non
inventa; la pulizia cancella solo le giornate sparite).

---
## D5 CHIUSO — «fatture scadute: 0» mentre ne erano scadute 410

**Misura PRIMA** (query di sola lettura sul database vero, 17/09/2026):

```
fatture totali                                        3.520
aperte                                                  478
aperte con data_scadenza valorizzata                      0   ← su 478
scadute con la regola vecchia (data_scadenza < oggi)      0
scadute con la regola dello Scadenzario                 410   150.193,60 €
   Mara              209   80.180,07 €
   Gelateria Demo    200   69.998,59 €
   Mara dei Boschi     1       14,94 €
```

`ConfrontoSedi.jsx:181` contava `f.data_scadenza && f.data_scadenza < oggi`.
Quella colonna è nulla 3.520 volte su 3.520: una condizione su un campo sempre
nullo è sempre falsa. Il contatore restava a zero, l'allarme rosso non si
accendeva mai e il punteggio della sede non veniva mai penalizzato — mentre lo
Scadenzario, sugli stessi dati, ne contava 410 in ritardo.

**Correzione** — nuova funzione pura `fattureDaPagarePerSede(fatture, oggiIso)`
in `src/lib/confrontoSediCalc.js` (lo stesso posto dove erano già stati tirati
fuori gli altri conti di questa pagina, per poterli provare):
- la scadenza la chiede a `scadenzaFattura`, la stessa funzione dello
  Scadenzario e del Cashflow, che la deriva da `data_fattura + termini` e
  rispetta il «trenta giorni fine mese»;
- l'importo lo chiede a `residuoFattura`: era la **quarta copia** di
  `totale - importo_pagato`, e quella copia contava una nota di credito
  etichettata come un debito;
- porta fuori `stimate` insieme a `scadute`. Quelle date sono convenzioni a
  trenta giorni, non accordi scritti sul documento: la pagina lo dice
  (`fattureScadStimate`, già usato nel messaggio d'allarme).
Il giorno della scadenza non è ancora un ritardo: si è in ritardo dal giorno
dopo.

`ConfrontoSedi.jsx` perde le quattro mappe parallele e l'import diretto di
`residuoFattura`/`scadenzaFattura`: chiama la funzione e legge i quattro campi.

**Misura DOPO**: 410 fatture in ritardo per 150.193,60 €, tutte dichiarate
stimate. Prima: zero.

**Test**: `tests/unit/fattureScaduteSenzaDataScadenza.test.js`, 16 test.
Riproduce (la regola vecchia ricopiata: zero su qualunque numero di fatture;
la vecchia formula dell'importo che fa di una nota di credito un debito),
correzione (deriva la scadenza, dichiara le stime, usa il residuo, raggruppa
per sede), intorno (una `data_scadenza` vera vince sulla stima e non è più
stimata; pagate fuori; pagata a mano vale zero; il giorno della scadenza non
è ritardo; termini a 60 giorni e «fine mese»; fatture senza sede in una voce
loro; righello nei due sensi: input vuoto/storto e conteggio che cambia se
sposto la data di oggi).

### Suite intera dopo l'intercettazione dello storage
`npx vitest run` — **3.944 test, 2 rossi**, tutti e due in
`tests/unit/apreSullaCosaGiusta.test.jsx` (BrainView «apre sull'elenco, non
sulla chat» e Marketplace «nessuna etichetta perde la prima parola»): file
dell'agente PAGINE, scritto oggi, niente a che vedere con lo storage, le
chiusure o le fatture. **Nessuna regressione dal dirottamento.**

### ⚠ Difetti della stessa famiglia in file NON miei
- `src/views/ForecastView.jsx:48` (`diagnosi`) legge il blob con una query
  diretta su `user_data`, senza passare da `sload`: il dirottamento non la
  vede. Chi ha registrato chiusure si sente dire «non hai ancora registrato
  chiusure». File in mano all'agente DATE (modificato adesso).
- `src/components/ConfrontoSedi.jsx:118` fa `new Date().toISOString()` per
  «oggi»: è UTC. Fra mezzanotte e le due di notte, ora italiana, «oggi» è
  ieri, e una fattura scaduta ieri non risulta ancora in ritardo. Famiglia
  dell'agente DATE (`dateLocal.js`), non entro per non incrociare il suo
  lavoro.

## Prossimo passo
Due difetti trovati per strada, da valutare: (a) `demoSeedFull.js:925` scrive
ancora ~90 chiusure demo nel blob `user_data` con un upsert suo
(`userDataUpsert`), che il dirottamento non intercetta: la demo completa nasce
con la cassa invisibile ovunque; (b) 24 fatture aperte di Mara dei Boschi per
14.793,22 € hanno `sede_id` nullo e non compaiono in nessuna colonna del
Confronto sedi.

---
## D8 CHIUSO — il seme della demo scriveva le chiusure nel blob morto

Trovato tirando lo stesso filo di D4. `demoSeedFull.js` non passa da `ssave`:
ha un `userDataUpsert` suo, perché gira anche dentro la funzione Vercel
dell'amministrazione (`api/admin.js:2290`, azioni `seed_demo_full` e
`seed_demo_personalized`) con un client service-role passato da fuori. Il
dirottamento di `storage.js` quel percorso non lo vede.

**Misura PRIMA**: `seedDemoDataFull` scriveva **77 giornate di cassa** nel blob
`pasticceria-chiusure-v1`. Nessuna delle undici pagine che mostrano l'incasso
lo legge più: una demo appena creata nasceva con **zero euro** in P&L,
Confronto sedi, Quadratura, Benchmark, Previsioni. È la prima cosa che guarda
chi sta valutando se comprare il prodotto (`seed_demo_personalized` è proprio
l'azione del pitch ai prospect).

Sul database vero: l'unica organizzazione con chiusure è Gelateria Demo, 79
righe nella tabella e 79 nel blob per 45.856,00 € — seminata PRIMA della
migrazione, quindi i due coincidono. Una demo seminata oggi no.

**Correzione**:
- nuovo modulo `src/lib/chiusuraRiga.js`: la traduzione fra la forma dei
  componenti e la riga di database (`rigaAChiusura`, `chiusuraARiga`,
  `COLONNE`), **senza nessun import**. Serve perché i due mondi non possono
  condividere il client: `demoSeedFull.js` non può importare `chiusure.js`,
  che importa `./supabase`, che legge `import.meta.env` — in Node non esiste e
  l'endpoint dell'amministrazione esploderebbe all'import. Così la regola
  resta una sola: se domani si aggiunge una colonna, i due mondi non divergono.
- `chiusure.js` importa da lì invece di definirle (niente altro cambiato);
- `demoSeedFull.js` ha ora `chiusureUpsert`, che scrive in `chiusure_cassa`
  con `onConflict: organization_id,sede_id,data`. `SK_CHIUS` era rimasta lì
  senza più nessuno che la usasse: tolta, per non far credere al prossimo che
  quel blob sia ancora un posto dove si scrive.

**Misura DOPO**: 77 righe in `chiusure_cassa`, tutte con `is_demo: true`,
`legacy_id` `demo-ch-<data>` (chi ha già una demo seminata prima non si
ritrova le giornate doppie: la chiave naturale è la stessa) e zero righe nel
blob. Il totale riletto dal prodotto è identico a quello scritto.

**Test**: 4 test in coda a `tests/unit/chiusureUnaSolaFonte.test.js` — stessa
famiglia, stesso file. Riproduce (blob pieno di 77 giornate e tabella vuota:
il prodotto legge zero), correzione (77 righe in tabella, nessuna in
`user_data`, marcate demo, org e sede giuste), intorno (la riga porta food
cost, margine, sell-through come percentuale e il dettaglio del venduto, non
solo il totale; il totale riletto coincide con quello scritto).

### Ancora aperto, non mio
`scripts/seed-demo.mjs:423` fa `setData(..., 'pasticceria-chiusure-v1', ...)`:
stesso difetto, ma è uno script di sviluppo, non arriva a un cliente.

## Prossimo passo
Una decisione da prendere col titolare, non da codice: nel Confronto sedi 24
fatture aperte di Mara dei Boschi per **14.793,22 €** hanno `sede_id` nullo
(entrate quando l'organizzazione aveva un punto vendita solo). La pagina
ragiona per sede e non le mostra da nessuna parte: non sono di nessuna delle
due sedi, e sommarle a una delle due sarebbe inventare. Va aggiunta una riga
che le dichiara — dove e con che parole è una scelta di prodotto.

---
## Chiusura — 17/09/2026

**Suite intera**: `npx vitest run` → **264 file, 4.069 test, 0 rossi** (exit 0).
I due rossi della prima passata (3.944 test) erano in
`tests/unit/apreSullaCosaGiusta.test.jsx` dell'agente PAGINE e nel frattempo
li ha sistemati lui. Nessuna regressione dal dirottamento dello storage.

`npx eslint` pulito su tutti i file toccati. `check-italian-grammar.mjs` OK.
`check-design-tokens.mjs` esce 1, ma per quattro file che non sono miei
(`Eventi.jsx`, `Impostazioni.jsx`, `HomeDipendente.jsx`,
`NuovaRicettaView.jsx`): il gate del build resta rosso finché non li sistema
chi ci sta lavorando.

**Difetti chiusi**: D0, D0-bis, D1, D2, D3, D4, D5, D6, D7, D8 — dieci.
**File toccati oggi in questa ripresa**: `src/lib/confrontoSediCalc.js`,
`src/components/ConfrontoSedi.jsx`, `src/lib/chiusuraRiga.js` (nuovo),
`src/lib/chiusure.js`, `src/lib/demoSeedFull.js`, più i due file di test nuovi.
**Niente commit, niente push**, come da ordine.
