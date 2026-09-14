// @vitest-environment happy-dom
//
// Lo stock in vetrina della home: pezzi e grammi non si sommano.
//
// Sei torte più 8.400 g di gelato diventavano "8.409 pezzi al banco", ed è il
// primo numero che il titolare legge entrando. È lo stesso difetto corretto
// nella scheda Prodotti finiti il 7 set ("Pezzi totali" sommava pezzi e
// grammi), rimasto sulla home.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import React from 'react'

let STOCK = []
vi.mock('../../src/lib/stockPF', () => ({
  loadStockPF: async () => STOCK,
  loadStockPFAllSedi: async () => STOCK,
  loadMovimentiPF: async () => [],
}))
function fluente(res = { data: [], error: null }) {
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(res)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return new Proxy({}, h)
}
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: () => fluente(), rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe() {} }) }) }), removeChannel: () => {},
  },
}))
vi.mock('../../src/lib/storage', () => ({ ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}) }))

const { default: DashboardHomeView } = await import('../../src/views/DashboardHomeView.jsx')

const props = {
  ricettario: { ricette: {}, ingredienti_costi: {} }, magazzino: {}, giornaliero: [], chiusure: [],
  actions: [], setView: () => {}, orgId: 'org-1', sedeId: 's1', nomeAttivita: 'Pasticceria del Corso',
  isTrialAttivo: true, auth: { user: { email: 'anita@maradeiboschi.com' } },
  sedi: [{ id: 's1', nome: 'Corso Vittorio' }], sedeAttiva: { id: 's1', nome: 'Corso Vittorio' },
}

beforeEach(() => {
  cleanup()
  STOCK = [
    { id: 'a', prodotto_nome: 'SACHER', quantita: 6, unita: 'pz', valore_unit: 12, soglia_min: 0, updated_at: new Date().toISOString() },
    { id: 'b', prodotto_nome: 'GELATO NOCCIOLA', quantita: 8400, unita: 'g', valore_unit: 0.02, soglia_min: 0, updated_at: new Date().toISOString() },
    { id: 'c', prodotto_nome: 'CROSTATA', quantita: 3, unita: 'pz', valore_unit: 9, soglia_min: 0, updated_at: new Date().toISOString() },
  ]
})

describe('stock vetrina in home', () => {
  it('conta 9 pezzi, non 8.409', async () => {
    const v = render(<DashboardHomeView {...props} />)
    await waitFor(() => expect(v.container.textContent).toContain('pezzi al banco'))
    expect(v.container.textContent).toContain('9')
    expect(v.container.textContent).not.toContain('8.409')
  })

  it('i chili sfusi si dichiarano a parte', async () => {
    const v = render(<DashboardHomeView {...props} />)
    await waitFor(() => expect(v.container.textContent).toContain('pezzi al banco'))
    expect(v.container.textContent).toContain('8,4 kg sfusi')
  })

  it('ogni riga porta la sua unità di misura', async () => {
    const v = render(<DashboardHomeView {...props} />)
    await waitFor(() => expect(v.container.textContent).toContain('GELATO NOCCIOLA'))
    expect(v.container.textContent).toContain('8,4 kg')
    expect(v.container.textContent).toContain('6 pz')
  })
})
