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
