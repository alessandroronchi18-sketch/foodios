// venditeB2B — helpers puri (pulisciRighe, calcolaTotaleRighe) + CRUD clienti/vendite.
// Helper puri sono i piu critici: usati ovunque per normalizzare input prima
// dello scarico stock. Audit 2026-07-01 batch coverage push.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase', () => {
  const fromMock = vi.fn(() => mkChain())
  const rpcMock = vi.fn(async () => ({ data: null, error: null }))
  return { supabase: { from: fromMock, rpc: rpcMock } }
})

function mkChain(returnValue = { data: [], error: null }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    single: vi.fn(async () => returnValue),
    then: (cb) => Promise.resolve(returnValue).then(cb),
  }
  return chain
}

import {
  pulisciRighe, calcolaTotaleRighe,
  loadClientiB2B, salvaClienteB2B, eliminaClienteB2B,
  loadVenditeB2B, salvaVenditaB2B, setStatoVenditaB2B,
  setPagamentoVenditaB2B, eliminaVenditaB2B,
} from '../../src/lib/venditeB2B'
import { supabase } from '../../src/lib/supabase'

describe('pulisciRighe (pure)', () => {
  it('upperc + trim prodotto, normalizza qta/prezzo IT, calcola totale', () => {
    const out = pulisciRighe([
      { prodotto: '  crostata  ', qta: '2,5', prezzo: '3,00' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      prodotto: 'CROSTATA', qta: 2.5, prezzo: 3.0, totale: 7.5,
    })
  })

  it('filtra righe senza prodotto o qta<=0', () => {
    const out = pulisciRighe([
      { prodotto: 'A', qta: 1, prezzo: 2 },
      { prodotto: '', qta: 5, prezzo: 3 },     // no prodotto
      { prodotto: 'B', qta: 0, prezzo: 2 },    // qta zero
      { prodotto: 'C', qta: -1, prezzo: 2 },   // qta negativa
    ])
    expect(out.map(r => r.prodotto)).toEqual(['A'])
  })

  it('input null/undefined → []', () => {
    expect(pulisciRighe(null)).toEqual([])
    expect(pulisciRighe(undefined)).toEqual([])
  })

  it('arrotonda totale ai centesimi', () => {
    const out = pulisciRighe([{ prodotto: 'X', qta: 3, prezzo: 1.999 }])
    expect(out[0].totale).toBe(6.0)  // 5.997 → 6.00
  })
})

describe('calcolaTotaleRighe (pure)', () => {
  it('somma totali pre-calcolati', () => {
    expect(calcolaTotaleRighe([
      { totale: 10 }, { totale: 5.5 }, { totale: 4.5 },
    ])).toBe(20)
  })

  it('fallback qta*prezzo se totale missing/non-finite', () => {
    expect(calcolaTotaleRighe([
      { qta: 3, prezzo: 2.5, totale: NaN },
      { qta: 2, prezzo: 1 },  // no totale
    ])).toBe(9.5)
  })

  it('arrotonda ai centesimi', () => {
    expect(calcolaTotaleRighe([{ totale: 3.999 }, { totale: 1.001 }])).toBe(5.0)
  })

  it('input vuoto/null → 0', () => {
    expect(calcolaTotaleRighe([])).toBe(0)
    expect(calcolaTotaleRighe(null)).toBe(0)
  })
})

describe('clienti B2B CRUD', () => {
  beforeEach(() => { supabase.from.mockClear() })

  it('loadClientiB2B senza orgId → []', async () => {
    expect(await loadClientiB2B(null)).toEqual([])
  })

  it('salvaClienteB2B → throw senza orgId', async () => {
    await expect(salvaClienteB2B(null, { nome: 'X' })).rejects.toThrow(/orgId/)
  })

  it('salvaClienteB2B → throw senza nome', async () => {
    await expect(salvaClienteB2B('org', { nome: '   ' })).rejects.toThrow(/Nome cliente/)
  })

  it('salvaClienteB2B normalizza P.IVA, codice destinatario UPPERCASE', async () => {
    supabase.from.mockImplementationOnce(() => mkChain({ data: { id: 'cli-1' }, error: null }))
    await salvaClienteB2B('org', {
      nome: '  Pasticceria Rossi  ',
      partita_iva: '  12345678901  ',
      codice_destinatario: '  abcdef0  ',
      provincia: 'to',
    })
    const chain = supabase.from.mock.results[0].value
    const args = chain.insert.mock.calls[0][0]
    expect(args.nome).toBe('Pasticceria Rossi')
    expect(args.partita_iva).toBe('12345678901')
    expect(args.codice_destinatario).toBe('ABCDEF0')
    expect(args.provincia).toBe('TO')
  })

  it('salvaClienteB2B con id → UPDATE', async () => {
    await salvaClienteB2B('org', { id: 'cli-1', nome: 'Bar' })
    const chain = supabase.from.mock.results[0].value
    expect(chain.update).toHaveBeenCalled()
  })

  it('eliminaClienteB2B chiama DELETE', async () => {
    await eliminaClienteB2B('cli-1')
    const chain = supabase.from.mock.results[0].value
    expect(chain.delete).toHaveBeenCalled()
  })
})

describe('vendite B2B CRUD', () => {
  beforeEach(() => { supabase.from.mockClear(); supabase.rpc.mockClear() })

  it('loadVenditeB2B senza orgId → []', async () => {
    expect(await loadVenditeB2B(null)).toEqual([])
  })

  it('salvaVenditaB2B throw senza orgId', async () => {
    await expect(salvaVenditaB2B({ orgId: null, righe: [] })).rejects.toThrow(/orgId/)
  })

  it('salvaVenditaB2B throw se nessuna riga valida', async () => {
    await expect(salvaVenditaB2B({
      orgId: 'org', righe: [{ prodotto: '', qta: 0 }],
    })).rejects.toThrow(/almeno un prodotto/)
  })

  it('salvaVenditaB2B insert nuova vendita + scarico stock per ogni riga', async () => {
    supabase.from.mockImplementationOnce(() => mkChain({ data: { id: 'v1' }, error: null }))
    supabase.rpc.mockResolvedValue({ data: 5, error: null })
    const res = await salvaVenditaB2B({
      orgId: 'org', sedeId: 'sed', clienteNome: 'Bar X',
      righe: [{ prodotto: 'A', qta: 2, prezzo: 5 }, { prodotto: 'B', qta: 1, prezzo: 3 }],
    })
    expect(res.id).toBe('v1')
    expect(res.totale).toBe(13)
    // 2 chiamate stock (1 per riga)
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })

  it('salvaVenditaB2B warnings su stock negativo', async () => {
    supabase.from.mockImplementationOnce(() => mkChain({ data: { id: 'v1' }, error: null }))
    supabase.rpc.mockResolvedValue({ data: -3, error: null })  // stock insuff
    const res = await salvaVenditaB2B({
      orgId: 'org', sedeId: 'sed',
      righe: [{ prodotto: 'A', qta: 5, prezzo: 1 }],
    })
    expect(res.warnings).toHaveLength(1)
    expect(res.warnings[0]).toMatch(/scorta insufficiente/i)
  })

  it('eliminaVenditaB2B → load + ripristina stock + delete', async () => {
    supabase.from
      .mockImplementationOnce(() => mkChain({
        data: { id: 'v1', stock_scaricato: true, sede_id: 'sed', righe: [{ prodotto: 'A', qta: 2 }] },
        error: null,
      }))
      .mockImplementation(() => mkChain())
    await eliminaVenditaB2B('v1')
    // RPC ripristino chiamato per ogni riga
    expect(supabase.rpc).toHaveBeenCalled()
  })

  it('setPagamentoVenditaB2B degraded fallback se colonne pagamento non migrate', async () => {
    supabase.from.mockImplementationOnce(() => mkChain({
      data: null, error: { message: 'column "pagata" does not exist' },
    }))
    const r = await setPagamentoVenditaB2B('v1', true, '2026-06-18')
    expect(r.degraded).toBe(true)
  })

  it('setStatoVenditaB2B annullata → ripristino stock + update', async () => {
    supabase.from
      .mockImplementationOnce(() => mkChain({
        data: { id: 'v1', stock_scaricato: true, sede_id: 'sed', righe: [{ prodotto: 'X', qta: 1 }] },
        error: null,
      }))
      .mockImplementation(() => mkChain())
    await setStatoVenditaB2B('v1', 'annullata')
    expect(supabase.rpc).toHaveBeenCalled()  // carico ripristino
  })

  it('setStatoVenditaB2B stato qualsiasi → solo update', async () => {
    supabase.rpc.mockClear()
    await setStatoVenditaB2B('v1', 'fatturata')
    expect(supabase.rpc).not.toHaveBeenCalled()
    const chain = supabase.from.mock.results[0].value
    expect(chain.update).toHaveBeenCalledWith({ stato: 'fatturata' })
  })
})
