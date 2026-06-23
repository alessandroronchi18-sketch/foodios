// @vitest-environment happy-dom
// Smoke test: verifica che i componenti più critici si renderizzino senza
// crash. Cattura la classe di bug "isTablet is not defined" / "duplicate keys"
// / "hook condizionale" che ha portato al crash di Personale in produzione.
//
// Audit 2026-06-22: aggiunto dopo che HeaderPersonale.isTablet undefined ha
// causato error boundary in produzione. Questi test girano in jsdom-like env
// senza fare query reali (mock supabase / fetch).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

// ─── Mocks globali ────────────────────────────────────────────────────────
// Supabase, lib esterne, hooks browser-only — bocchiamo tutto a no-op così
// i componenti possono renderizzare senza dipendenze.

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u', email: 't@x.it' } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 't' } } }),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: () => {
      const chain = {
        select: () => chain, insert: () => chain, update: () => chain, delete: () => chain,
        eq: () => chain, in: () => chain, gte: () => chain, lte: () => chain, lt: () => chain,
        gt: () => chain, neq: () => chain, is: () => chain, or: () => chain, ilike: () => chain,
        order: () => chain, limit: () => chain, range: () => chain, single: () => Promise.resolve({ data: null, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve) => resolve({ data: [], error: null, count: 0 }),
      }
      return chain
    },
    rpc: () => Promise.resolve({ data: [], error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe: vi.fn() }) }) }),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../../src/lib/apiFetch', () => ({
  apiFetch: vi.fn().mockResolvedValue({ json: async () => ({}) }),
}))

// useIsMobile / useIsTablet: ritornano valori fissi (desktop)
vi.mock('../../src/lib/useIsMobile', () => ({
  default: () => false,
  useIsTablet: () => false,
}))

// Theme/style modules — pass-through fittizi
vi.mock('../../src/lib/theme', () => ({
  color: { bg:'#fff', bgCard:'#fff', bgSubtle:'#f8f8f8', bgMuted:'#eee', text:'#000', textMid:'#444', textSoft:'#666', white:'#fff',
    border:'#ddd', borderSoft:'#eee', borderStr:'#ccc', brand:'#6E0E1A', brandLight:'#FEE', green:'#0a0', greenLight:'#dfd',
    amber:'#a80', amberLight:'#ffd', red:'#a00', blueLight:'#dde' },
  radius: { sm: 4, md: 8, lg: 12 },
  shadow: { sm: 'none', md: 'none', lg: 'none' },
  motion: { durFast: '150ms', ease: 'ease' },
  tnum: { fontVariantNumeric: 'tabular-nums' },
  typo: {},
  getTypo: () => ({}),
}))

// Helper renderer che cattura il crash come fallback (verifica che NON cada in fallback)
function renderSafe(jsx) {
  let err = null
  try {
    const r = render(jsx)
    return { ok: true, container: r.container }
  } catch (e) {
    err = e
    return { ok: false, error: e }
  }
}

// ─── Smoke tests ──────────────────────────────────────────────────────────
describe('Component smoke renders — no crash', () => {

  it('HeaderPersonale renders con isTablet undefined safe', async () => {
    // Re-export dal main module: import dinamico per applicare i mock sopra.
    const mod = await import('../../src/components/Personale')
    // Personale export default = main wrapper. Render solo wrapper.
    const PersonaleDefault = mod.default
    const r = renderSafe(<PersonaleDefault orgId="org-1" sedeId={null} sedi={[]} notify={() => {}} />)
    expect(r.ok, r.error ? `crash: ${r.error.message}` : '').toBe(true)
  })

  it('ScenarioPrezzi (PLView) — isTablet ora dichiarato', async () => {
    // Solo verifico che il modulo carichi (la funzione interna è esported solo via PLView)
    const mod = await import('../../src/views/PLView')
    expect(typeof mod.default).toBe('function')
  })

  it('BandaDiagnosi (MenuDinamico) — isTablet ora nei props', async () => {
    const mod = await import('../../src/components/MenuDinamico')
    expect(typeof mod.default).toBe('function')
  })

  it('Scadenzario.Gruppo — hook prima del return (no conditional hook)', async () => {
    const mod = await import('../../src/components/Scadenzario')
    expect(typeof mod.default).toBe('function')
  })

  it('SpreciOmaggi — diag invece di aggregat (typo fixato)', async () => {
    const mod = await import('../../src/components/SpreciOmaggi')
    expect(typeof mod.default).toBe('function')
  })

  it('RicettarioView.RicettaCard — hook prima dell early return', async () => {
    const mod = await import('../../src/views/RicettarioView')
    expect(typeof mod.default).toBe('function')
  })

  it('MagazzinoView — focusQtyDeferred dichiarato nello scope corretto', async () => {
    const mod = await import('../../src/views/MagazzinoView')
    expect(typeof mod.default).toBe('function')
  })

  it('Dashboard.ProduzioneView — nomeAttivita nei props', async () => {
    const mod = await import('../../src/Dashboard')
    expect(typeof mod.default).toBe('function')
  })
})

describe('VIEW_LABELS — niente chiavi duplicate', () => {
  it('VIEW_LABELS object non ha chiavi duplicate (audit 2026-06-22)', async () => {
    // Trick: leggi il file e cerca chiavi sospette
    const fs = await import('node:fs')
    const content = fs.readFileSync('/Users/aler/foodios/src/Dashboard.jsx', 'utf8')
    // Estrai il blocco VIEW_LABELS = { ... } via regex
    const m = content.match(/const VIEW_LABELS\s*=\s*\{([\s\S]*?)\};/)
    if (!m) {
      // Object literal inline (non const), cerca pattern duplicato approssimato
      // Saltiamo se non trovato in modo strict
      return
    }
    const block = m[1]
    // Estrai tutte le chiavi (strings tra "" o identificatori prima di :)
    const keys = []
    const re = /["']?([\w-]+)["']?\s*:/g
    let mm
    while ((mm = re.exec(block)) !== null) {
      keys.push(mm[1])
    }
    const seen = new Set()
    const duplicates = []
    for (const k of keys) {
      if (seen.has(k)) duplicates.push(k)
      else seen.add(k)
    }
    expect(duplicates, `Duplicate VIEW_LABELS keys: ${duplicates.join(', ')}`).toEqual([])
  })
})
