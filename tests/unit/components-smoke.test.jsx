// @vitest-environment happy-dom
// I componenti grandi si disegnano davvero, e mettono qualcosa a schermo.
// crash. Cattura la classe di bug "isTablet is not defined" / "duplicate keys"
// / "hook condizionale" che ha portato al crash di Personale in produzione.
//
// Audit 2026-06-22: aggiunto dopo che HeaderPersonale.isTablet undefined ha
// causato error boundary in produzione. Questi test girano in jsdom-like env
// senza fare query reali (mock supabase / fetch).

import { describe, it, expect, vi } from 'vitest'
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
// Il tema VERO, con solo ombre e animazioni spente.
//
// Qui c'era una copia a mano dei token: un elenco di chiavi scritte a mano che
// per forza restava indietro rispetto a theme.js. È già successo due volte —
// prima con `typo`, che era `{}` e faceva crashare ogni componente che usa
// `typo.small.fontSize` invece di una misura scritta a mano; poi con `font`,
// che non c'era proprio. Ogni volta il test puniva chi usava i token, cioè
// esattamente la cosa che il cricchetto del design chiede di fare.
//
// Adesso si parte dal modulo vero e si spengono le due cose che a un test di
// render non servono (ombre e transizioni). Un token nuovo in theme.js non può
// più rompere questo file.
vi.mock('../../src/lib/theme', async (importOriginal) => {
  const vero = await importOriginal()
  return {
    ...vero,
    shadow: { ...vero.shadow, xs: 'none', sm: 'none', md: 'none', lg: 'none', xl: 'none' },
    motion: { ...vero.motion, durFast: '150ms', ease: 'ease' },
  }
})

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

// ─── I componenti si disegnano davvero ────────────────────────────────────

// Elenco: [nome del file in src/components, prop minime del Dashboard].
// Le prop sono quelle vere: se un componente cambia firma e nessuno aggiorna
// qui, il render cade e si vede.
const COMPONENTI = [
  ['Personale', { orgId: 'org-1', sedeId: null, sedi: [], notify: () => {} }],
  ['MenuDinamico', { orgId: 'org-1', sedeId: 's1', sedi: [], ricettario: { ricette: {}, ingredienti_costi: {} }, notify: () => {} }],
  ['Scadenzario', { orgId: 'org-1', sedeId: 's1', sedi: [], notify: () => {} }],
  ['SpreciOmaggi', { orgId: 'org-1', sedeId: 's1', sedi: [], ricettario: { ricette: {}, ingredienti_costi: {} }, notify: () => {} }],
]

describe('i componenti grandi si disegnano con le prop del Dashboard', () => {
  it.each(COMPONENTI)('%s si monta e mette qualcosa a schermo', async (nome, props) => {
    const mod = await import(`../../src/components/${nome}.jsx`)
    expect(typeof mod.default, `${nome} non esporta un componente di default`).toBe('function')
    const Componente = mod.default
    const r = renderSafe(<Componente {...props} />)
    expect(r.ok, r.error ? `${nome} cade al primo disegno: ${r.error.message}` : '').toBe(true)
    // La prova che mancava: «non cade» è vero anche per un componente che
    // torna `null`. Il 19/09/2026, mettendo `return null` in cima a tutti e
    // 101 i componenti del prodotto, questo file restava verde su 9 prove su
    // 9 — sette dicevano solo `typeof mod.default === 'function'`.
    expect(r.container.textContent.trim().length + r.container.querySelectorAll('*').length,
      `${nome} si monta ma non disegna niente`).toBeGreaterThan(0)
  }, 20000)
})
