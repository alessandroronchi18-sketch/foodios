// @vitest-environment happy-dom
//
// Struttura del Magazzino: quello che si legge in cima e come si sta in pagina.
//
// Difetti verificati il 14/09/2026, l'ultimo pezzo dell'audit di magazzino.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

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
  },
}))
vi.mock('../../src/lib/storage', () => ({ ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}) }))
vi.mock('../../src/lib/stockPF', () => ({
  loadStockPF: async () => [], loadMovimentiPF: async () => [], scartoPF: async () => 0, rettificaPF: async () => 0,
}))

const { default: MagazzinoView } = await import('../../src/views/MagazzinoView.jsx')

const ricettario = {
  ricette: { r1: { nome: 'SACHER', tipo: 'torta', porzioni: 8, prezzo: 30, unita: 8,
    ingredienti: [{ nome: 'burro', qty1stampo: 300 }, { nome: 'zucchero', qty1stampo: 200 }] } },
  ingredienti_costi: { burro: { costoKg: 8.4, costoG: 0.0084 }, zucchero: { costoKg: 1, costoG: 0.001 } },
}
const base = (magazzino) => ({
  ricettario, magazzino, setMagazzino: () => {}, logRif: [], setLogRif: () => {},
  giornaliero: [], logPrezzi: [], notify: () => {}, orgId: 'org-1', sedeId: 's1',
})

beforeEach(() => {
  cleanup()
  try { sessionStorage.clear() } catch { /* niente */ }
})

describe('magazzino — la tessera "Da ordinare" non cambia identità', () => {
  it('con tutto a posto dice quante cose ci sono da comprare', async () => {
    const v = render(<MagazzinoView {...base({
      burro: { nome: 'Burro', giacenza_g: 8000, soglia_g: 1000 },
      zucchero: { nome: 'Zucchero', giacenza_g: 5000, soglia_g: 1000 },
    })} />)
    await waitFor(() => expect(v.container.textContent).toContain('Da ordinare'))
    expect(v.container.textContent).not.toContain('A zero')
  })

  it('anche con un ingrediente finito resta "Da ordinare", non diventa "A zero"', async () => {
    // Prima il riquadro cambiava nome quando qualcosa finiva, e il numero di
    // cosa comprare spariva: due giorni di fila non si potevano confrontare,
    // perché lo stesso posto misurava due cose diverse.
    const v = render(<MagazzinoView {...base({
      burro: { nome: 'Burro', giacenza_g: 0, soglia_g: 1000 },
      zucchero: { nome: 'Zucchero', giacenza_g: 5000, soglia_g: 1000 },
    })} />)
    await waitFor(() => expect(v.container.textContent).toContain('Da ordinare'))
  })
})

describe('magazzino — la scheda aperta si ricorda', () => {
  it('tornando sulla pagina si riapre dove si era', async () => {
    const v = render(<MagazzinoView {...base({ burro: { nome: 'Burro', giacenza_g: 8000, soglia_g: 1000 } })} />)
    await waitFor(() => expect(v.container.textContent).toContain('Carica merce'))
    fireEvent.click(v.getByText('Carica merce'))
    await waitFor(() => expect(document.getElementById('mag-qty-input')).toBeTruthy())
    cleanup()
    const v2 = render(<MagazzinoView {...base({ burro: { nome: 'Burro', giacenza_g: 8000, soglia_g: 1000 } })} />)
    await waitFor(() => expect(document.getElementById('mag-qty-input')).toBeTruthy())
    expect(v2.container.textContent).toContain('Carica merce')
  })
})

describe('magazzino — l\'ordine delle schede segue quanto si usano', () => {
  it('"Carica merce" viene prima di "Prezzi ingredienti"', async () => {
    const v = render(<MagazzinoView {...base({ burro: { nome: 'Burro', giacenza_g: 8000, soglia_g: 1000 } })} />)
    await waitFor(() => expect(v.container.textContent).toContain('Carica merce'))
    const schede = [...v.container.querySelectorAll('[role="tab"]')].map(b => b.textContent)
    expect(schede).toEqual(['Materie prime', 'Carica merce', 'Prodotti finiti', 'Prezzi ingredienti', 'Storico carichi'])
  })
})

describe('magazzino — gli stessi numeri non si ripetono tre volte', () => {
  it('il sottotitolo dice quanti ingredienti ci sono, e basta', async () => {
    const v = render(<MagazzinoView {...base({
      burro: { nome: 'Burro', giacenza_g: 0, soglia_g: 1000 },
      zucchero: { nome: 'Zucchero', giacenza_g: 500, soglia_g: 1000 },
    })} />)
    await waitFor(() => expect(v.container.textContent).toContain('ingredienti'))
    // Prima qui comparivano anche "N a zero" e "N da ordinare", che il semaforo
    // e le tessere ripetono subito sotto.
    expect(v.container.textContent).not.toMatch(/\d+ ingredienti · \d+ a zero/)
  })
})
