# Diario agente MAGAZZINO — audit Foodos 16/09/2026

## Mandato
Importazioni e movimenti di merce: tutto quello che fa entrare e uscire quantità.
Se un movimento si perde, ogni numero a valle è sbagliato e nessuno se ne accorge.

## Piano (scritto prima di cominciare)
1. Leggere REGOLE.md + CLAUDE.md. [fatto]
2. Mappare i file: inventarioProduzione.js, inventarioImport.js, trasferimenti.js,
   autoDetectFormat.js, import*.js, parse*.js, MagazzinoView, InventarioSettimanaleView,
   ImportWizard.
3. Verificare le 6 piste note, una per una, sul codice.
4. Aprire il DB di Mara (`889e7fc2-...`) e misurare la PARTITA DOPPIA per sede/periodo:
   rimanenza iniziale + entrate − uscite − venduto = rimanenza finale.
5. Per ogni difetto: misura prima → correzione → misura dopo → tre test.

## Stato
- [x] REGOLE.md e CLAUDE.md letti
- [ ] Mappa dei file di import/movimento
- [ ] Piste 1-6 verificate sul codice
- [ ] Connessione DB + partita doppia
- [ ] Correzioni
- [ ] Test

## Prossimo passo
Leggere inventarioProduzione.js e autoDetectFormat.js.

---
## Checkpoint 25% — 16/09, mappa e prime conferme

Connessione DB OK. Org Mara `889e7fc2-…`, 3 sedi:
Carlina `e0d3370b`, Berthollet `af9f2192`, De Gasperi `bbb7554e`.

### Cosa c'è davvero nei dati di Mara (misurato)
- `inventario_produzione`: 7.013 righe (Berthollet 2.177, Carlina 2.636,
  De Gasperi 2.200), dal 2026-05-01 al 2026-09-15.
- `trasferimenti`: **1 riga sola** (Carlina→Berthollet, 1 pz, stato `inviato`,
  15/09). La pagina trasferimenti di fatto non è usata.
- `vendite_b2b`: **0 righe**.
- `user_data`: NESSUNA chiave `pasticceria-chiusure-v1` → **zero chiusure**.
- `spedito_g` totale: 1 g (Carlina). `scarto_g` totale: 0 su tutte le sedi.

### Partita doppia sui dati veri (query SQL, formula di `cellaVenduto`)
| sede | celle | non calcolabili | negative | kg negativi | kg venduti |
|---|---|---|---|---|---|
| Berthollet | 2.177 | 27 | 205 | −1.046,5 | 7.154,7 |
| Carlina | 2.636 | 30 | 95 | −309,1 | 10.385,4 |
| De Gasperi | 2.200 | 30 | 275 | −1.232,3 | 7.813,1 |
| **totale** | **7.013** | **87** | **575** | **−2.587,9** | **25.353,2** |

575 celle su 7.013 (8,2%) non quadrano, per 2.587,9 kg. È il buco da spiegare.

### Piste — stato
1. Seconda importazione consegne stesso giorno → **CONFERMATA sul codice**,
   `src/lib/importDelivery.js:198-200`: nel ramo `soloTotale` scrive
   `totV: kpiPrec.totV` — cioè si riassegna da solo. Il netto della SECONDA
   fonte non entra mai in `totV`. Non riproducibile sui dati di Mara (0 chiusure):
   serve un caso di prova.
2. Trasferimenti in entrata → **CONFERMATA, difetto di SCHEMA**:
   `inventario_produzione` ha `spedito_g` e NON ha `ricevuto_g`
   (verificato in information_schema). `confermaRicezione` in
   `src/components/TrasferimentiView.jsx:396` non scrive nulla nell'inventario
   della sede che riceve. Su Mara non è misurabile (1 solo trasferimento).
3. kg B2B due volte → da verificare: `kpiQuadraturaSettimana` sottrae i B2B,
   `ricaviDaInventario`/`totaliPerGusto` (usati da PLView e AnalisiInventario)
   NO. Su Mara 0 vendite B2B → serve caso di prova.
4. `avgST: 0` finto → **CONFERMATA**: `importEcommerce.js:156`,
   `importCassa.js:494`, `importDelivery.js:220`. A valle
   `StoricoProduzioneView` filtra `avgST != null`: lo zero entra nella media.
5. `inventarioImport.js` scollegato → da verificare.
6. `parseEkoPos`/`parseWolf` fuori da `PATTERNS` → **CONFERMATA**,
   `importCassa.js:355-370`. Da verificare anche `parseFile` (riga 432): il
   dispatch conosce solo 7 sistemi su 15 e sugli altri lancia
   «Sistema non riconosciuto».

## Prossimo passo
Leggere `inventarioImport.js`, `ImportWizard.jsx`, `ImportaDatiView` (dove?).

---
## Checkpoint 50% — 16/09, IL BUCO DEI 2.588 kg È SPIEGATO

Org Mara = `889e7fc2-fb93-42eb-96f1-e73b3e738a12` (nel checkpoint 25% avevo
troncato l'uuid: quello giusto è questo).

### La risposta: non è un difetto del conto, è una cella vuota letta come zero

Ho classificato le 575 celle negative. Il risultato è netto:

| classe | celle | kg |
|---|---|---|
| la rimanenza del giorno PRIMA è 0 | **550** | **−2.469,6** |
| la rimanenza del giorno prima è > 0 | 25 | −118,4 |

**Il 95,4% del buco viene da un giorno la cui rimanenza è scritta 0.**
E guardata dall'altro lato: delle 655 celle che partono da una rimanenza
precedente a zero, **550 (84%) finiscono in negativo**. Quando la rimanenza
precedente è > 0, le negative sono 25 su 6.271 (0,4%).

### Perché quello zero è falso (tre prove indipendenti)

1. **Chi ha zero in vetrina aveva prodotto quel giorno.** Le righe con
   `rimanenza_g = 0` sono 660: in **658 (99,7%)** c'è produzione lo stesso
   giorno, in media 5,87 kg. Nelle righe con rimanenza > 0 la produzione c'è
   solo nel 59,8% dei casi. Cioè: hanno prodotto quasi 6 kg di un gusto e a
   fine giornata in vetrina ce n'erano zero grammi — 658 volte in 4 mesi e
   mezzo.
2. **Il venduto che ne esce è tre volte il normale.** Nei giorni con
   `rimanenza_g = 0` il venduto medio di un singolo gusto in un singolo
   negozio è **10,06 kg**; negli altri giorni è **3,00 kg**.
3. **Ha la forma dell'abitudine di una persona, non di un fatto commerciale.**
   Berthollet lascia la rimanenza a zero il martedì (43% delle righe) e il
   mercoledì (26,5%); De Gasperi il mercoledì (63,6%) e il martedì (24,7%);
   Carlina il martedì (20,5%). Negli altri giorni sta sotto il 5%. Un gusto
   che finisce davvero non sceglie il giorno della settimana.

Esempio vero, MAROTTO a Berthollet (il gusto più prodotto lì):
```
04/08 mar  prod 8.000  riman     0
05/08 mer  prod     0  riman 4.800   -> venduto  −4.800 g
11/08 mar  prod 8.000  riman     0
12/08 mer  prod     0  riman 6.900   -> venduto  −6.900 g
13/08 gio  prod 8.000  riman     0
15/08 sab  prod     0  riman 7.100   -> venduto  −7.100 g
```
Tre martedì/giovedì di fila con 8 kg prodotti e zero rimasti, e il giorno dopo
il gelato c'è senza che nessuno l'abbia fatto.

### Il difetto nel codice (due pezzi, uno di parser e uno di schema)

**a) `src/lib/inventarioImport.js`, `parseFoglioInventario` (righe ~183-196).**
```js
const valore = parseGrammi(row[j])
if (valore == null) continue          // cella vuota: salto
...
if (!r) { r = { ..., produzione_g: 0, rimanenza_g: 0 }; out.righe.push(r) }
if (meta.tipo === 'prod') r.produzione_g = valore
else if (meta.tipo === 'riman') r.rimanenza_g = valore
```
Se nel foglio del cliente la colonna PROD è compilata e la colonna RIMAN. è
VUOTA, la riga viene creata lo stesso (dalla cella PROD) con
`rimanenza_g: 0`, e la RIMAN. vuota viene saltata dal `continue`. Risultato:
«non l'hanno scritto» diventa «era vuota». È lo stesso difetto di `avgST: 0`,
ma su un numero che pesa dieci volte di più.

**b) Schema: `inventario_produzione.rimanenza_g bigint NOT NULL DEFAULT 0`.**
Anche volendo, il parser non avrebbe dove mettere «non lo so». Nella tabella
manca la possibilità di dire che un dato non c'è. Serve una migrazione.

### Effetto misurato sui numeri che il cliente vede
- 575 celle mostrate come «da controllare» che non sono errori del gelataio:
  sono caselle vuote. Le negative vere (rimanenza precedente > 0) sono **25**.
  Il 96% degli allarmi è rumore, e sotto il rumore le 25 vere non si vedono.
- Il venduto giornaliero per gusto è sballato in due giorni consecutivi:
  +10 kg sul giorno con la casella vuota, −4,5 kg medi sul giorno dopo.
- Il totale del periodo regge quasi (la somma telescopica si annulla), ma il
  confronto con la cassa e la classifica dei gusti no.

### La seconda causa, quantificata: la merce tra le sedi
Ho rifatto la partita doppia **sommando le tre sedi** (per gusto/giorno):
le negative passano da −2.587,9 kg a **−1.324,8 kg**. Cioè **1.263 kg (49%)
del buco sparisce appena si smette di trattare le sedi come separate**: è
gelato che si sposta tra Carlina, Berthollet e De Gasperi senza che nessuno
lo registri. Combacia con la pista 2 (manca `ricevuto_g`) e con il calendario:
Berthollet non produce il mercoledì (solo 27,9% di righe con produzione),
De Gasperi non produce il giovedì (27,9%). Sono i giorni di rifornimento.

Le due cause si sovrappongono (una cella può avere tutti e due i problemi):
la casella vuota spiega il 95% delle celle, il movimento tra sedi spiega il
49% dei chili.

### Altro misurato
- Nessuna riga ha `note` compilata; `created_by` è NULL su tutte e 7.013 →
  **i dati sono tutti entrati da import**, nessuno è stato scritto a mano.
  Caricati tra il 03/09 e il 15/09/2026.
- Vincolo `inv_prod_unique_riga` su (org, sede, gusto, data): niente righe
  doppie. Quella pista è chiusa.

## Prossimo passo
Scrivere la migrazione additiva (rimanenza_g nullable + `ricevuto_g`), poi
correggere `parseFoglioInventario` e `cellaVenduto`, poi i test.

---
## Checkpoint 75% — 16/09, correzioni scritte, test rosso sistemato

### Il test rosso: era tarato sullo schema vecchio
`tests/unit/importSchemas.test.js` > «i valori di scorta rispettano il tipo e i
limiti» pretendeva che un `default` di un campo `number` fosse un numero. Ho
messo `default: null` su `produzione_inventario.rimanenza_g` e il test è
diventato rosso.

Non è la modifica a essere sbagliata, ed è il test che ho aggiornato, perché
`default: null` NON è la stessa cosa di non avere un default:
`importValidateCore.js:124` scrive il default solo se `!== undefined`, e questo
schema ha `upsertOn: true` — un campo assente lascia in piedi il valore già
sulla riga, `null` lo sovrascrive. Serve a chi reimporta un file corretto dopo
aver svuotato una cella sbagliata: senza `default: null` il vecchio numero
resterebbe lì per sempre. `ImportWizard.jsx:782` prevedeva già il caso
(`f.default === null` -> «resta vuoto»): era il test a non saperlo.

La regola nuova è più stretta di prima, non più larga: `default: null` è
ammesso solo su campi NON obbligatori (un campo obbligatorio che vale «non lo
so» è una contraddizione). Verificato: 42/42 verdi.

### Correzioni già scritte (tutte da rileggere, nessun commit)
- `src/lib/importSchemas.js` — `rimanenza_g` default null + hint che spiega la
  differenza fra vuoto e zero.
- `src/lib/inventarioImport.js` — `parseFoglioInventario` crea la riga con
  `rimanenza_g: null`; `diffConDb` non trasforma più null in 0.
- `src/lib/inventarioProduzione.js` — `salvaCella` non scrive la rimanenza se
  non ce l'ha; `aggiungiSpedito` non inventa lo 0; `indicizzaPerGustoGiorno`
  propaga null e legge `ricevuto_g`; `cellaVenduto` somma `+ ricevuto` e
  restituisce «non calcolabile» con due motivi distinti (la casella di oggi
  vuota / quella di ieri vuota); `rimanenzaDiPartenza` propaga null.
- `src/lib/importEcommerce.js`, `importCassa.js`, `importDelivery.js` — i tre
  `avgST: 0` sono diventati `avgST: null`.
- `src/lib/importDelivery.js` — `totV` non si riassegna più a se stesso: si
  ricalcola da `cassaImport` + netto di TUTTE le fonti delivery, e con lui
  `totM` e `totMP`.
- `src/lib/importCassa.js` — il pattern semi-generico ora dice il vero: cinque
  marche con lo stesso schema CSV, non tre.
- `supabase/migrations/20260916c_…sql` — pronta, NON applicata.

## Prossimo passo
Controllare che i consumatori a valle reggano i null nuovi (cellaVenduto,
rimanenzaDiPartenza, avgST), poi il dispatch di `parseFile`, i kg B2B doppi,
`inventarioImport.js` scollegato, e i test.

### Aggiornamento — correzioni fatte dopo il checkpoint 75%
- `inventarioProduzione.js`: le SELECT ora chiedono `ricevuto_g` e, se il
  database non ce l'ha ancora (errore 42703), rifanno la query senza. Senza
  questo, il codice pubblicato prima della migrazione lasciava la pagina
  inventario vuota. `caricaStoricoMensile` chiedeva solo prod/riman/scarto:
  contava come venduta la merce spedita a un'altra sede.
- `classificaGusti`: il residuo medio si fa sui giorni in cui la rimanenza è
  scritta. Contare i giorni non rilevati come «zero rimasto» abbassava la
  media e faceva sembrare che un gusto girasse.
- `serieVendutoMultiSede`: `riman` unito fra sedi resta null se una sede non
  l'ha scritta; aggiunta la somma di `ricevuto`.
- `importCassa.js`: `SISTEMI_CASSA`, elenco unico. Erano due elenchi a mano:
  15 parser scritti, 6 voci nel menu di Cassa, 7 casi nel dispatch. Chi ha
  una Tilby, una RCH, una Olivetti, una Salvi/Indaco/Polotouch/Eko/Wolf non
  trovava la propria cassa e concludeva che non la leggevamo.
  `ChiusuraView.jsx` ora genera il menu da quell'elenco.
- **Difetto nuovo trovato per strada**, `importCassa.js` `mergeInChiusureCassa`:
  il filtro anti-doppione confrontava `c.fonte` (scritto dal parser: «Cassa in
  Cloud») con l'argomento `fonte` (passato da ChiusuraView: «cassaincloud»).
  Non coincidevano mai: reimportare lo stesso file lasciava due righe uguali
  in `cassaImport`, tre al terzo giro.
- `importDelivery.js`: il nuovo `totV` prende l'ULTIMO import di cassa, non la
  somma. Due import di cassa nello stesso giorno sono due letture dello stesso
  incasso (fiscale + lettore carte), non due incassi.
- `chiusure.js:311` — QUARTO `avgST` finto della stessa famiglia:
  `Number(vecchia?.kpi?.avgST) || 0` nell'import del registro incassi.
  Ora resta null.
- `ricaviDaInventario`: accetta `venditeB2B` e toglie i kg dell'ingrosso prima
  di valorizzarli al prezzo del banco, poi riaggiunge il fatturato B2B vero.
  Su Mara vale 0 € (zero righe `vendite_b2b`): è un caso costruito, non una
  misura. **I due chiamanti — `PLView.jsx` e `ConfrontoSedi.jsx` — non passano
  ancora le righe B2B**: il risultato dichiara `b2bConsiderato: false`.

---
## Ripresa 17/09 — i 2.588 kg, risposta definitiva coi numeri

Rimisurati da zero sul database di Mara (`889e7fc2-…`), stessa formula di
`cellaVenduto` (rimanenza dell'ultimo giorno registrato entro 7 giorni).
I numeri del checkpoint 50% reggono al secondo passaggio:

| sede | celle | non calcolabili | negative | kg negativi |
|---|---|---|---|---|
| Berthollet | 2.177 | 27 | 205 | −1.046,5 |
| Carlina | 2.636 | 30 | 95 | −309,1 |
| De Gasperi | 2.200 | 30 | 275 | −1.232,3 |
| **totale** | **7.013** | **87** | **575** | **−2.588,0** |

Venduto positivo 27.941,2 kg; al netto delle negative 25.353,2 kg.

### Le 575 celle incrociate con le due cause (una query, quattro righe)

| la rimanenza di ieri | sommando le tre sedi | celle | kg |
|---|---|---|---|
| A. scritta 0 (casella vuota) | il conto **torna** | 264 | −940,6 |
| A. scritta 0 (casella vuota) | ancora negativo | 286 | −1.528,9 |
| B. maggiore di zero | il conto **torna** | 14 | −17,2 |
| B. maggiore di zero | ancora negativo | **11** | **−101,2** |

Da leggere così:
- **casella vuota letta come zero: 550 celle, −2.469,6 kg (95,4% delle celle)**;
- **merce spostata fra sedi e mai registrata: 278 celle, −957,8 kg** (sono le
  celle che tornano appena si sommano i tre negozi: 37% dei chili);
- le due cause si sovrappongono su 264 celle;
- **resta fuori da tutte e due: 11 celle su 7.013 (0,16%), −101,2 kg (3,9%)**.

**Quindi la formula del venduto non è sbagliata.** Il 96,1% dei chili che non
quadrano è dato che il prodotto perde o legge male, non aritmetica.

### Le 11 celle che restano, guardate una per una
Due sono errori di battitura nel foglio del cliente, e si vedono a occhio:
- De Gasperi, MANGO, 21/08: rimanenza scritta **60,0 kg** (media 3,83, 95°
  percentile 6,38) → un giorno con 4 kg prodotti e 60 in vetrina. Venduto −53,1 kg.
- De Gasperi, FRANKIE LIME, 15/05: rimanenza **33,9 kg** (95° percentile 5,60).
  Venduto −29,7 kg.

Da sole fanno −82,8 kg, l'82% del residuo. Le altre nove stanno fra −6,5 e
−0,1 kg: gelato arrivato dall'altro negozio o mezzo chilo di svista.
Nessuna delle 11 ha `scostamento_accettato`.

**L'avviso «da controllare» funziona, ma è sommerso**: 11 celle vere su 575
segnalate, il 2%. Ecco perché il difetto della casella vuota vale più di quanto
sembra: non toglie solo 2.470 kg fantasma dai conti, riaccende un allarme che
oggi nessuno guarda.

### Nota onesta sulla correzione
Le 660 righe che oggi hanno `rimanenza_g = 0` **restano com'erano**: non si può
sapere a posteriori quali erano vetrine vuote davvero. La correzione vale dai
prossimi import in avanti. Per lo storico serve una passata con Mara davanti
allo schermo — oppure, se rifà l'import degli stessi fogli, si sistema da sé.

## Prossimo passo
`ricevuto_g` manca nelle tre SELECT che passano `columns` a mano; poi i kg B2B
contati due volte nei due chiamanti; poi `inventarioImport.js` scollegato.

---
## Chiusura 17/09 — riepilogo di tutto il lavoro

### 1. Il risultato principale: i 2.588 kg che non quadravano
La casella della rimanenza **vuota** veniva salvata come **zero**, e zero in
quella casella non vuol dire «non lo sappiamo»: vuol dire «vetrina vuota,
venduto tutto». Su 575 celle che non quadravano, **550 (95,4%) per 2.469,6 kg**
nascono da lì. Restano 11 celle vere su 7.013 (0,16%, −101,2 kg), e due di
quelle sono errori di battitura nel foglio del cliente — De Gasperi, MANGO,
21/08: 60 kg di rimanenza dichiarati in un giorno con 4 kg prodotti.

**L'effetto secondario vale quanto la correzione.** L'avviso «da controllare»
funzionava già. Ma segnalava 575 celle di cui 564 non erano errori di nessuno,
e con 564 falsi allarmi su 575 (il 98%) quell'avviso non lo guardava più
nessuno. Togliere lo zero finto non toglie solo 2.470 kg fantasma dai conti:
riaccende un allarme spento, dentro cui le 11 segnalazioni vere erano
invisibili.

### 2. Numeri riverificati sul database di Mara il 17/09
Tutte le affermazioni scritte nella migrazione sono state rimisurate una per
una prima di consegnarla. Tornano, tranne una, che ho corretto:

| affermazione | misurato |
|---|---|
| 7.013 righe, 01/05 → 15/09 | ✔ |
| 575 celle negative, −2.588,0 kg | ✔ |
| per sede 205 / 95 / 275, −1.046,5 / −309,1 / −1.232,3 kg | ✔ |
| 550 celle con rimanenza di ieri a 0, −2.469,6 kg | ✔ |
| 655 celle partono da 0, 550 negative (84%) | ✔ |
| 25 negative su 6.271 quando ieri è > 0 (0,4%) | ✔ |
| 660 righe con rimanenza 0, 658 con produzione (99,7%), media 5,87 kg | ✔ |
| venduto medio 10,06 kg contro 3,00 kg | ✔ |
| Bert mar 43,0% / mer 26,5%, DeG mer 63,6% / mar 24,7%, Carlina mar 20,5% | ✔ |
| Bert non produce il mercoledì (27,9%), DeG il giovedì (27,9%) | ✔ |
| sommando le tre sedi il buco scende a −1.324,8 kg (−1.263 kg, 49%) | ✔ |
| 2.559 righe con produzione zero · 1 trasferimento · 0 vendite B2B | ✔ |
| celle negative concentrate: Bert mer **40,7%**, DeG gio 55,7% | ✗ → **40,4%** |

Corretto il 40,7% → 40,4% nella migrazione e nel commento del test.
L'esempio MAROTTO a Berthollet è stato riletto riga per riga dal database ed è
esatto.

### 3. Stato della migrazione
`20260916c_inventario_rimanenza_non_scritta_e_ricevuto.sql` è **completa e non
applicata**. Verificato oggi in `information_schema`: `rimanenza_g` è ancora
`bigint NOT NULL DEFAULT 0` e `ricevuto_g` non esiste. Per questo tutto il
codice che chiede `ricevuto_g` ha un secondo giro sull'errore 42703: chi
pubblica prima della migrazione non trova pagine vuote.
Dopo l'applicazione, `node scripts/check-migrazioni-applicate.mjs` smetterà di
segnalare `ricevuto_g` come colonna promessa e mai creata.

### 4. Correzioni chiuse oggi (i tre punti che restavano)

**a) `ricevuto_g` mancava nelle SELECT scritte a mano.** Erano quattro elenchi
di colonne ricopiati a mano, non tre: `StoricoProduzioneView.jsx` (una
costante `COLONNE_INV`, non un `columns:`) e **due** `.select(...)` dentro
`InventarioSettimanaleView.jsx`. Quella del pannello di dettaglio di un gusto
non aveva nemmeno `spedito_g`: mostrava come venduti al banco i chili mandati
a un altro negozio. Ora tutte partono da `COLONNE_VENDUTO`.

**b) La spedizione fra negozi scriveva l'arrivo dentro la rimanenza.**
`InventarioSettimanaleView.jsx`, comando «spedisci a un'altra sede»:
```js
rimanenza_g: (cellDest?.rimanenza_g || 0) + qtaG   // prima
```
I chili arrivati venivano sommati a *quanto è rimasto in vetrina stasera* —
che nessuno ha ancora pesato, perché la spedizione si registra durante il
giorno. Due bugie in una riga: che stasera ci fossero esattamente quei chili,
e che non fossero entrati da nessuna parte. Il negozio che riceve risultava
vendere meno di zero il giorno dell'arrivo e troppo il giorno dopo. E il
`|| 0` era la casella-vuota-letta-come-zero entrata da un'altra porta: se la
cella non esisteva, la rimanenza nasceva uguale ai chili arrivati.
Ora: `ricevuto_g: (cellDest?.ricevuto_g || 0) + qtaG` e
`rimanenza_g: cellDest?.rimanenza_g ?? null`, sui due lati.
`salvaCella` accetta `ricevuto_g` come accetta `spedito_g` (patch-only: chi
non ne sa niente non lo azzera) e sull'errore 42703 riprova senza, avvisando
che quei grammi non sono stati registrati.

**c) Il pannello di un gusto sommava i negozi PRIMA del conto.**
`DrilldownGustoModal` schiacciava le righe di tutte le sedi su una chiave sola
e poi calcolava. Funziona solo se tutti i negozi hanno registrato lo stesso
giorno — e Mara ne salta: Berthollet il mercoledì, De Gasperi il giovedì.
Quando un negozio manca, la sua rimanenza resta nella somma di ieri e sparisce
da quella di oggi, e la differenza esce come «venduto». Nel caso di prova sono
5,2 kg venduti da nessuno. Ora usa `serieVendutoMultiSede` (conta negozio per
negozio, somma dopo), che è la regola che il resto del prodotto già seguiva.

**d) I kg B2B contati due volte: era già chiuso.** Riverificato: `PLView.jsx`
carica `venditeB2BPeriodo` e chiama `scorporaB2B`; `ConfrontoSedi.jsx` passa
`venditeB2B` a `ricaviDaInventario` con `includiSenzaSede: false`. Su Mara
vale 0 € (zero righe `vendite_b2b`): è provato su casi costruiti, e il diario
lo dice.

### 5. Il difetto più grande che resta aperto: `inventarioImport.js` scollegato
`src/lib/inventarioImport.js` sono 700 righe che sanno leggere il file Excel
**vero** di Mara: riconoscono i fogli per struttura (uno per negozio, uno
TOTALI, uno RISTORANTI, uno GELATO ELIMINATO), controllano i propri totali
contro il foglio di riepilogo del cliente e dicono cosa cambia rispetto al
database. **Nessun file di `src/` lo importa.** Lo importano solo i test.

Quello che arriva davvero nel database passa dal percorso generico
(`ImportWizard` → `importUnpivot` → `importSchemas`), che ha **tre** schemi —
fornitori, dipendenti, produzione a inventario — non ne ha uno per gli scarti
né uno per le consegne all'ingrosso, e non guarda i nomi dei fogli: legge solo
le colonne PROD/RIMAN.

Il conto, misurato sul database il 17/09:
```
7.013 righe di inventario, 3 negozi, 32 gusti, dal 01/05 al 15/09
scarto_g:     0 g  su tutte e 7.013 le righe
vendite_b2b:  0 righe
```
Quattro mesi e mezzo di gelateria senza un grammo buttato e senza una consegna
a un ristorante. Non è un dato: sono due fogli che nessuno ha letto.

**Non l'ho collegato** perché la porta d'ingresso è `ImportWizard.jsx`, che in
questo audit è assegnato a un altro agente. Ho lasciato il libro mastro in
`tests/unit/merceCheEntraEdEsce.test.js` (sezione 8): elenca i parser
scollegati e diventa rosso appena qualcuno ne collega uno, così l'elenco resta
vero. **È il primo lavoro da fare dopo questo audit.**

### 6. Il righello era rotto, ed è la parte più istruttiva
Il controllo che avrebbe dovuto impedire questo difetto esisteva già
(«nessuna colonna scritta a mano dimentica `ricevuto_g`») ed era **verde**
mentre quattro query gli stavano davanti. Guardava tre file su ~200 e solo le
stringhe scritte dopo `columns:` — e il quarto elenco stava in
`const COLONNE_INV = '...'`, dove `columns:` riceve il *nome* della costante,
non la stringa. Ora cammina su tutto `src/` e legge ogni stringa che nomina
insieme `produzione_g` e `rimanenza_g`.
Provato sul codice di prima delle correzioni: **10 elenchi bocciati**, fra cui
`caricaStoricoMensile`, che non aveva nemmeno `spedito_g`.

### 7. Test lasciati
- `tests/unit/merceCheEntraEdEsce.test.js` — 50 test. Sezione 6 (la spedizione
  scritta dentro la rimanenza), 7 (il pannello che schiacciava i negozi),
  8 (i parser scollegati), più il righello rifatto e la prova che sa dire di no.
- `tests/unit/inventarioProduzioneExt.test.js` — 41 test, con `ricevuto_g`
  patch-only, il ripiego sul 42703 e la prova che un errore diverso si propaga.
- Riprova, correzione e contorno per ognuno dei tre difetti.
- Dove il difetto non è riproducibile sui dati di Mara è **scritto nel test**:
  i trasferimenti (una riga sola nel database) e l'ingrosso (zero righe) sono
  casi costruiti; il difetto della casella vuota e quello dei parser
  scollegati sono misurati sui dati veri.

### 8. Stato della suite
Verde su tutto quello che ho toccato (253 test dei nove file di area).
`node scripts/check-italian-grammar.mjs` OK, `npx eslint --quiet` OK.
**Resta rosso `tests/unit/attrezziCheSannoDireNo.test.js`** (2 test in
timeout a 180 s): è un file **non tracciato**, creato oggi alle 09:55
dall'agente RIGHELLO, che apre un browser vero per rendere le pagine. Fallisce
anche da solo e non tocca niente dell'inventario: non è mio e non l'ho toccato.

## Prossimo passo
Collegare `inventarioImport.js` alla procedura di importazione (serve
`ImportWizard.jsx`, oggi di un altro agente): senza, gli scarti e le consegne
all'ingrosso di Mara continuano a non entrare. Poi applicare la migrazione
`20260916c` e togliere i tre ripieghi sull'errore 42703.
