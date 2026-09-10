// @vitest-environment happy-dom
// La pagina Quadratura deve DIRE che ci sono caselle che non tornano.
//
// Perche' questo test esiste. Il motore differenziale calcola il venduto come
// (rimanenza di ieri + prodotto - rimanenza - scarto - spedito). Quando la
// rimanenza scritta e' piu' alta di quanto c'era a disposizione il conto esce
// negativo: la casella "non torna". Sui dati veri del design partner sono 604
// caselle su 7.012 (8,6%) per -2.650 kg su 25.462 totali.
//
// Il totale della pagina somma le caselle col loro segno — che e' giusto,
// perche' azzerarle nasconderebbe l'errore — ma la pagina NON diceva da nessuna
// parte che quel totale contiene 604 caselle sbagliate. Il proprietario leggeva
// un numero piu' basso del vero e si metteva a cercare un ammanco di cassa che
// non c'era: il buco era nella compilazione dell'inventario.
//
// La libreria contava gia' quelle caselle (celleNonQuadrate / kgNonQuadrati);
// era la pagina a buttare via il conteggio. Questo test blocca il ritorno del
// silenzio.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

// Una settimana con UNA casella che non torna: martedi la rimanenza (900 g) e'
// piu' alta della disponibilita' (400 g rimasti + 300 g prodotti = 700 g).
// Venduto = 700 - 900 = -200 g.
const LUN = '2026-09-07'
const RIGHE = [
  { gusto_nome: 'NOCCIOLA', data: '2026-09-06', produzione_g: 1000, rimanenza_g: 400, scarto_g: 0, spedito_g: 0 },
  { gusto_nome: 'NOCCIOLA', data: '2026-09-08', produzione_g: 300,  rimanenza_g: 900, scarto_g: 0, spedito_g: 0 },
]

vi.mock('../../src/lib/inventarioProduzione', async () => {
  const vero = await vi.importActual('../../src/lib/inventarioProduzione')
  return { ...vero, caricaSettimana: vi.fn(async () => RIGHE) }
})

vi.mock('../../src/lib/supabase', () => {
  const RESULT = { data: [], error: null }
  const handler = {
    get(_t, prop) {
      if (prop === 'then') return (resolve) => resolve(RESULT)
      if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve({ data: null, error: null })
      return () => new Proxy({}, handler)
    },
  }
  return {
    supabase: {
      from: () => new Proxy({}, handler),
      rpc: () => Promise.resolve({ data: null, error: null }),
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    },
  }
})

// Un formato di vendita, cosi' euroKg non e' null e la banda KPI si popola.
vi.mock('../../src/lib/storage', () => ({
  ssave: () => Promise.resolve(),
  sload: () => Promise.resolve([
    { id: 'f1', nome: 'Coppetta media', categoria: 'Gelato', baseQtaG: 120, prezzoDefault: 4, componenti: [] },
  ]),
  ssaveBatch: () => Promise.resolve(),
  sloadAllSedi: () => Promise.resolve({}),
}))

const { default: QuadraturaInventarioView } = await import('../../src/views/QuadraturaInventarioView')

const props = {
  orgId: 'org-1',
  sedeId: 'sede-1',
  sedi: [{ id: 'sede-1', nome: 'Centro', attiva: true, is_sede_produzione: true }],
  sedeAttiva: { id: 'sede-1', nome: 'Centro' },
  chiusure: [{ data: '2026-09-08', totale: 500 }],
  metodoProduzione: 'inventario',
  onNavigate: () => {},
}

describe('Quadratura — le caselle che non tornano si vedono', () => {
  beforeEach(() => {
    // La settimana mostrata dipende da oggi: la fissiamo al lunedi dei dati.
    vi.setSystemTime(new Date(`${LUN}T10:00:00`))
  })

  it('scrive quante caselle non tornano e per quanti kg', async () => {
    render(<QuadraturaInventarioView {...props} />)
    await waitFor(() => {
      expect(screen.getByText(/casella non torna|caselle non tornano/i)).toBeTruthy()
    }, { timeout: 5000 })
    // 200 g = 0,2 kg, con la virgola decimale italiana.
    expect(screen.getByText(/0,2 kg/)).toBeTruthy()
    // E deve dire perche', non solo che c'e' un problema.
    expect(screen.getByText(/rimanenza scritta è più alta/i)).toBeTruthy()
  })

  it('non scrive niente quando tutte le caselle tornano', async () => {
    const mod = await import('../../src/lib/inventarioProduzione')
    mod.caricaSettimana.mockImplementation(async () => [
      { gusto_nome: 'NOCCIOLA', data: '2026-09-06', produzione_g: 1000, rimanenza_g: 400, scarto_g: 0, spedito_g: 0 },
      { gusto_nome: 'NOCCIOLA', data: '2026-09-08', produzione_g: 300,  rimanenza_g: 200, scarto_g: 0, spedito_g: 0 },
    ])
    render(<QuadraturaInventarioView {...props} />)
    // "Cassa effettiva" e' una tessera della banda KPI: quando c'e', la pagina
    // ha finito di caricare e l'avviso, se servisse, sarebbe li'.
    await waitFor(() => expect(screen.getByText(/Cassa effettiva/i)).toBeTruthy(), { timeout: 5000 })
    expect(screen.queryByText(/caselle non tornano/i)).toBeNull()
  })
})
