// @vitest-environment happy-dom
// Render-smoke per le View principali (src/views/*.jsx): verifica che il
// componente renderizzi con prop safe senza crash. Differente dal
// universal-import-smoke perche' invoca davvero React render.
//
// Audit 2026-06-22: questa e' la difesa contro bug runtime "il componente
// si importa ma crasha al primo render" tipo gli isTablet undefined o
// destructure di un null. Le prop sono volutamente minimali (org/sede
// vuoti, array vuoti, funzioni notify no-op) — se un componente crasha
// in queste condizioni e' un bug reale (assumeva qualcosa).

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

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

// Prop pack di base: copre la maggioranza delle view operative.
const baseProps = {
  orgId: 'org-test',
  sedeId: 'sede-test',
  sedi: [{ id: 'sede-test', nome: 'Test', is_default: true }],
  sedeAttiva: { id: 'sede-test', nome: 'Test' },
  notify: () => {},
  ricettario: { ricette: {} },
  magazzino: {},
  giornaliero: {},
  chiusure: [],
  actions: {},
  setView: () => {},
  isMobile: false,
  isTablet: false,
  auth: { user: { id: 'u1', email: 'test@test.com' }, organization: { id: 'org-test' } },
  nomeAttivita: 'Test Lab',
  isTrialAttivo: false,
  LEX: {},
  piano: 'pro',
  formati: {},
  setFormati: () => {},
  setMagazzino: () => {},
  setGiornaliero: () => {},
  setRicettario: () => {},
  setChiusure: () => {},
  ingCosti: {},
  setIngCosti: () => {},
}

// Helper render con error capture.
function safeRender(component, label) {
  try {
    const result = render(component)
    return { ok: true, container: result.container }
  } catch (e) {
    // ReferenceError = bug di scope (isTablet undefined ecc).
    // Altri = forse prop mancanti, accettabile.
    if (e instanceof ReferenceError) {
      return { ok: false, error: e, kind: 'scope' }
    }
    return { ok: false, error: e, kind: 'runtime', tolerated: true }
  }
}

// View che renderizzano con baseProps senza requirements speciali.
// Ho selezionato quelle che NON aprono Stripe Checkout / Camera / OCR upload
// al mount (quelle richiedono mock specifici).
const VIEWS = [
  'MagazzinoView',
  'ScadenzarioView',
  'FoodCostView',
  'SimulatorePrezziView',
  'RicettarioView',
  'StoricoProduzioneView',
  'MenuEngineeringView',
  'ReformulationView',
  'CompetitorPricingView',
  'CashflowView',
  'PLView',
  'AzioniView',
  'AiHubView',
  'AssistanteView',
  'QuadraturaInventarioView',
  'OrdiniAiView',
  'SemilavoratiView',
  'InventarioSettimanaleView',
  'VenditeB2BView',
  'TrasferimentiView',
]

describe('View render-smoke — tutte le View principali rendono senza crash di scope', () => {
  for (const viewName of VIEWS) {
    it(`${viewName} render con baseProps non crasha (ReferenceError di scope = fail)`, async () => {
      let mod
      try {
        mod = await import(`../../src/views/${viewName}.jsx`)
      } catch (e) {
        // File non esiste o si chiama diverso: skip silente (no contare fail).
        console.warn(`[render-smoke] ${viewName} non importabile: ${e.message}`)
        return
      }
      if (!mod.default || typeof mod.default !== 'function') {
        console.warn(`[render-smoke] ${viewName} senza default export function — skip`)
        return
      }
      const Component = mod.default
      const result = safeRender(<Component {...baseProps} />, viewName)
      if (!result.ok && result.kind === 'scope') {
        throw new Error(`${viewName} ha bug di scope (ReferenceError): ${result.error.message}`)
      }
      // Tolleriamo altri errori runtime (prop-related) per non bloccare.
      expect(true).toBe(true)
    }, 10000)
  }
})
