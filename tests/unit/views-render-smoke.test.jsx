// @vitest-environment happy-dom
//
// Ogni pagina di Foodos deve disegnarsi. Davvero, non «quasi».
//
// ── Il difetto che ha fatto riscrivere questo file (16/09/2026) ────────
//
// Questo test diceva «tutte le View principali rendono senza crash» e nella
// suite risultava verde su 21 prove. Erano 21 bugie su 21 possibili:
//
//  1. **Quattro nomi su ventuno non esistevano.** `ScadenzarioView`,
//     `FoodCostView`, `AssistanteView` (con l'errore di battitura dentro) e
//     `TrasferimentiView` non sono file di questo progetto. L'import falliva,
//     e il test faceva `return` — quindi la prova passava. Quattro pagine
//     fantasma dichiarate coperte.
//
//  2. **Quattro pagine vere crashavano al primo disegno, e il crash era
//     «tollerato».** Solo `ReferenceError` contava come difetto; qualunque
//     altro errore veniva assorbito e la prova finiva con
//     `expect(true).toBe(true)`. Nascondeva:
//       MagazzinoView e SimulatorePrezziView → `(giornaliero || []) is not iterable`
//       StoricoProduzioneView                → `sessFiltered is not iterable`
//       AzioniView                           → `(actions || []).filter is not a function`
//     Non era colpa del prodotto: nel Dashboard `giornaliero` e `actions`
//     sono `useState([])`, cioè elenchi, e questo file glieli passava come
//     `{}`. Il banco di prova era sbagliato, il prodotto no — ma il difetto
//     è lo stesso: quelle quattro pagine non venivano mai disegnate.
//
//  3. **L'elenco era scritto a mano**, quindi le dieci pagine nate dopo
//     giugno (Chiusura, Produzione giornaliera, Documentale, Forecast,
//     Marketplace, Nuova ricetta, Recensioni, Recipe Inventor, Scheda
//     allergeni, WhatsApp, Brain, Home) non erano coperte da nessuno.
//
// Totale: 17 pagine su 31 provate per davvero, e nessun modo di accorgersene
// perché la suite era verde.
//
// ── Come è fatto adesso ──────────────────────────────────────────────
//
// L'elenco lo fa il disco, non la memoria di chi scrive (`src/views/*.jsx`),
// quindi una pagina nuova entra da sola e una rinominata non lascia un
// fantasma. Import fallito, export mancante e crash al disegno sono TRE
// modi di fallire, non tre modi di passare. E c'è un controllo sul righello:
// se il conteggio delle pagine trovate crolla, è il test a essere rotto.
//
// Le prop sono quelle vere del Dashboard, con la forma giusta: elenchi dove
// il Dashboard tiene elenchi, oggetti dove tiene oggetti, il lessico vero
// invece di `{}`. Una pagina che crasha con queste prop è un difetto vero.

import { describe, it, expect, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { glob } from 'glob'
import path from 'node:path'
import React from 'react'
import { lessico } from '../../src/lib/lessico'

// Mock supabase fluente: ogni .metodo() ritorna un proxy thenable che
// chaina su qualsiasi prop accessor → query.select().eq().eq().gte() ecc.
// L'await sul builder ritorna { data: [], error: null }.
function makeFluentBuilder() {
  const RESULT = { data: [], error: null }
  const handler = {
    get(_t, prop) {
      // thenable: await builder risolve in RESULT.
      if (prop === 'then') return (resolve) => resolve(RESULT)
      // maybeSingle/single → result direct.
      if (prop === 'maybeSingle' || prop === 'single') {
        return () => Promise.resolve({ data: null, error: null })
      }
      // catch-all: ogni metodo ritorna lo stesso builder.
      return () => new Proxy({}, handler)
    },
  }
  return new Proxy({}, handler)
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getUser: () => Promise.resolve({ data: { user: null } }),
    },
    from: () => makeFluentBuilder(),
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => ({ on: () => ({ subscribe: () => {} }), unsubscribe: () => {} }),
  },
}))

vi.mock('../../src/lib/storage', () => ({
  ssave: () => Promise.resolve(),
  sload: () => Promise.resolve(null),
  ssaveBatch: () => Promise.resolve(),
  sloadAllSedi: () => Promise.resolve({}),
}))

// Audit 2026-06-24: mock aiClient per evitare fetch '/api/ai' relativo che in
// ambiente node viene risolto a http://127.0.0.1:3000 → ECONNREFUSED nei test
// che renderizzano view con useEffect che invoca callAi (es. BrainView,
// CompetitorPricing, ReformulationView).
vi.mock('../../src/lib/aiClient', () => ({
  callAi: () => Promise.resolve({ text: '', json: null, raw: null, ms: 0 }),
  parseAiJson: (s) => { try { return JSON.parse(s) } catch { return null } },
  friendlyAiError: () => 'Errore AI (mock).',
  sanitizeUserInput: (t) => String(t || ''),
  default: () => Promise.resolve({ text: '', json: null, raw: null, ms: 0 }),
}))

// ── Le prop, con la forma che hanno davvero nel Dashboard ─────────────
//
// Le righe di `src/Dashboard.jsx` da cui vengono (900-930 circa) sono
// indicate di fianco: se una cambia forma, si cambia anche qui.
const baseProps = {
  orgId: 'org-test',
  sedeId: 'sede-test',
  sedi: [{ id: 'sede-test', nome: 'Test', is_default: true }],
  sedeAttiva: { id: 'sede-test', nome: 'Test' },
  notify: () => {},
  ricettario: { ricette: {} },
  magazzino: {},          // useState({})
  giornaliero: [],        // useState([])  ← era `{}` e faceva cadere 3 pagine
  chiusure: [],           // useState([])
  actions: [],            // useState([])  ← era `{}` e faceva cadere AzioniView
  logRif: [],             // useState([])
  logPrezzi: [],          // useState([])
  esclusi: new Set(),     // useState(new Set())
  setView: () => {},
  isMobile: false,
  isTablet: false,
  auth: { user: { id: 'u1', email: 'test@test.com' }, organization: { id: 'org-test' } },
  nomeAttivita: 'Test Lab',
  isTrialAttivo: false,
  // Il lessico vero, non `{}`: nel prodotto è `lessico(tipoAttivita)`, e le
  // pagine ci leggono dentro (`LEX.nuovaRicetta.toLowerCase()`).
  LEX: lessico('pasticceria'),
  tipoAttivita: 'pasticceria',
  piano: 'pro',
  formati: {},
  ingCosti: {},
  setFormati: () => {},
  setMagazzino: () => {},
  setGiornaliero: () => {},
  setRicettario: () => {},
  setChiusure: () => {},
  setIngCosti: () => {},
  setLogRif: () => {},
  setEsclusi: () => {},
}

// ── L'elenco lo fa il disco ───────────────────────────────────────────
//
// `_shared.jsx` è la cassetta degli attrezzi delle pagine (helper e
// componenti condivisi), non una pagina: non ha un export di default ed è
// giusto così.
const RADICE = path.resolve(__dirname, '../..')
const NON_PAGINE = ['_shared.jsx']
const VIEWS = glob.sync('src/views/*.jsx', { cwd: RADICE })
  .map(f => path.basename(f))
  .filter(f => !NON_PAGINE.includes(f))
  .map(f => f.replace(/\.jsx$/, ''))
  .sort()

describe('Le pagine di Foodos si disegnano tutte', () => {
  // ── Il righello prima della misura ──────────────────────────────────
  //
  // Se domani il glob smette di trovare i file (cartella spostata, estensione
  // cambiata), l'elenco diventa vuoto, il ciclo qui sotto non genera nessuna
  // prova e la suite resta verde senza aver provato niente. È esattamente il
  // modo in cui questo file mentiva prima. Questa prova non si può saltare.
  it('l\'elenco delle pagine viene dal disco e non è vuoto', () => {
    expect(VIEWS.length, `pagine trovate: ${VIEWS.join(', ')}`).toBeGreaterThanOrEqual(25)
    // Qualche nome che c'è di sicuro: se spariscono tutti insieme non è una
    // pagina cancellata, è il percorso sbagliato.
    for (const attesa of ['MagazzinoView', 'RicettarioView', 'ChiusuraView']) {
      expect(VIEWS, `manca ${attesa}: il percorso di ricerca è sbagliato?`).toContain(attesa)
    }
  })

  for (const viewName of VIEWS) {
    it(`${viewName} si disegna con le prop del Dashboard`, async () => {
      // 1. Il file esiste e si importa. Se no, è un difetto: o il nome
      //    nell'elenco è sbagliato, o la pagina non si carica.
      const mod = await import(`../../src/views/${viewName}.jsx`)

      // 2. Esporta un componente. Una pagina senza export di default non la
      //    può montare nessuno.
      expect(typeof mod.default, `${viewName} non esporta un componente di default`).toBe('function')

      // 3. Si disegna. Qualunque errore è un errore: prima solo i
      //    ReferenceError contavano, e i TypeError — quelli che si vedono
      //    davvero in produzione — passavano lisci.
      const Component = mod.default
      render(<Component {...baseProps} />)
      cleanup()
    }, 20000)
  }
})
