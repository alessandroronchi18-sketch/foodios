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
- [ ] produzioneVeraSenzaRumore.test.js
- [ ] Setaccio automatico sui 238 file
- [ ] Prova di fallimento dei 9 script check-/audit-
- [ ] Gate pre-push

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

File di prodotto ripristinati: `src/views/MarketplaceView.jsx` verificato
identico con `shasum` + `git diff` pulito.

## Prossimo passo
`tests/unit/produzioneVeraSenzaRumore.test.js`: la funzione `dsnValido` è
ricopiata dentro il test invece che presa da `src/main.jsx`.
