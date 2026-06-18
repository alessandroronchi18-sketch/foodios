// stockPF — wrapper Supabase per stock prodotti finiti per-sede.
// Test si concentrano su guard input + shape result + aggregation logic.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase', () => {
  const fromMock = vi.fn(() => mkChain())
  const rpcMock = vi.fn(async () => ({ data: { ok: true }, error: null }))
  return { supabase: { from: fromMock, rpc: rpcMock } }
})

function mkChain(returnValue = { data: [], error: null }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    then: (cb) => Promise.resolve(returnValue).then(cb),
  }
  return chain
}

import {
  loadStockPF, loadStockPFAllSedi, loadMovimentiPF,
  caricoProduzionePF, scaricoVenditaPF, scartoPF,
  caricoBatchPF, loadStockPFTotali,
} from '../../src/lib/stockPF'
import { supabase } from '../../src/lib/supabase'

describe('stockPF letture — guard mancante input', () => {
  beforeEach(() => { supabase.from.mockClear(); supabase.rpc.mockClear() })

  it('loadStockPF senza orgId/sedeId → []', async () => {
    expect(await loadStockPF(null, null)).toEqual([])
    expect(await loadStockPF('o', null)).toEqual([])
    expect(await loadStockPF(null, 's')).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('loadStockPFAllSedi senza orgId → {}', async () => {
    expect(await loadStockPFAllSedi(null)).toEqual({})
  })

  it('loadMovimentiPF senza orgId/sedeId → []', async () => {
    expect(await loadMovimentiPF(null, null)).toEqual([])
  })

  it('loadStockPFTotali senza orgId → {}', async () => {
    expect(await loadStockPFTotali(null)).toEqual({})
  })
})

describe('stockPF letture — query supabase', () => {
  beforeEach(() => { supabase.from.mockClear() })

  it('loadStockPF chiama from("stock_prodotti_finiti") con .eq org+sede', async () => {
    await loadStockPF('org', 'sede')
    expect(supabase.from).toHaveBeenCalledWith('stock_prodotti_finiti')
  })

  it('loadMovimentiPF default limit 100', async () => {
    await loadMovimentiPF('org', 'sede')
    const chain = supabase.from.mock.results[0].value
    expect(chain.limit).toHaveBeenCalledWith(100)
  })

  it('loadMovimentiPF limit custom', async () => {
    await loadMovimentiPF('org', 'sede', { limit: 50 })
    const chain = supabase.from.mock.results[0].value
    expect(chain.limit).toHaveBeenCalledWith(50)
  })

  it('loadStockPFAllSedi raggruppa per sede_id', async () => {
    supabase.from.mockImplementationOnce(() => mkChain({
      data: [
        { sede_id: 'A', prodotto_nome: 'X', quantita: 5 },
        { sede_id: 'A', prodotto_nome: 'Y', quantita: 3 },
        { sede_id: 'B', prodotto_nome: 'X', quantita: 2 },
      ],
      error: null,
    }))
    const out = await loadStockPFAllSedi('org')
    expect(Object.keys(out)).toEqual(['A', 'B'])
    expect(out.A).toHaveLength(2)
    expect(out.B).toHaveLength(1)
  })

  it('loadStockPFTotali somma per nome cross-sede', async () => {
    supabase.from.mockImplementationOnce(() => mkChain({
      data: [
        { prodotto_nome: 'X', quantita: 5 },
        { prodotto_nome: 'X', quantita: 3 },
        { prodotto_nome: 'Y', quantita: 1 },
      ],
      error: null,
    }))
    const out = await loadStockPFTotali('org')
    expect(out.X).toBe(8)
    expect(out.Y).toBe(1)
  })

  it('error supabase → ritorna fallback senza throw', async () => {
    supabase.from.mockImplementationOnce(() => mkChain({ data: null, error: { message: 'fail' } }))
    expect(await loadStockPF('org', 'sede')).toEqual([])
  })
})

describe('stockPF RPC scritture', () => {
  beforeEach(() => { supabase.rpc.mockClear() })

  it('caricoProduzionePF chiama RPC con params', async () => {
    await caricoProduzionePF({ sedeId: 's', prodotto: 'P', quantita: 5 })
    expect(supabase.rpc).toHaveBeenCalledWith('stock_pf_carico_produzione', expect.objectContaining({
      p_sede: 's', p_prodotto: 'P', p_quantita: 5, p_unita: 'pz',
    }))
  })

  it('scaricoVenditaPF guard quantita<=0 → throw', async () => {
    await expect(scaricoVenditaPF({ sedeId: 's', prodotto: 'P', quantita: 0 }))
      .rejects.toThrow(/quantita deve essere > 0/)
    await expect(scaricoVenditaPF({ sedeId: 's', prodotto: 'P', quantita: -5 }))
      .rejects.toThrow(/quantita/)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('scaricoVenditaPF q>0 → chiama RPC', async () => {
    await scaricoVenditaPF({ sedeId: 's', prodotto: 'P', quantita: 3 })
    expect(supabase.rpc).toHaveBeenCalledWith('stock_pf_scarico_vendita', expect.any(Object))
  })

  it('scartoPF guard q>0 (audit 2026-07-01 LOW)', async () => {
    await expect(scartoPF({ sedeId: 's', prodotto: 'P', quantita: 0 }))
      .rejects.toThrow(/[Qq]uantita.*> 0/)
  })

  it('scartoPF q>0 → chiama RPC', async () => {
    await scartoPF({ sedeId: 's', prodotto: 'P', quantita: 2 })
    expect(supabase.rpc).toHaveBeenCalledWith('stock_pf_scarto', expect.any(Object))
  })

  it('caricoProduzionePF supabase error → throw', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc fail' } })
    await expect(caricoProduzionePF({ sedeId: 's', prodotto: 'P', quantita: 1 }))
      .rejects.toThrow()
  })
})

describe('caricoBatchPF', () => {
  beforeEach(() => { supabase.rpc.mockClear() })

  it('chiama caricoProduzionePF per ogni item valido', async () => {
    supabase.rpc.mockResolvedValue({ data: {}, error: null })
    const items = [
      { prodotto: 'A', quantita: 5, unita: 'pz' },
      { prodotto: 'B', quantita: 3, unita: 'g' },
    ]
    const res = await caricoBatchPF('s', items)
    expect(res.ok).toBe(true)
    expect(res.errors).toEqual([])
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })

  it('skippa item invalidi (no prodotto, q<=0)', async () => {
    supabase.rpc.mockResolvedValue({ data: {}, error: null })
    const items = [
      { prodotto: 'A', quantita: 5 },
      { quantita: 3 },                  // no prodotto
      { prodotto: 'B', quantita: 0 },   // q non > 0
    ]
    const res = await caricoBatchPF('s', items)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(res.ok).toBe(true)
  })

  it('cattura errore per singolo item, continua', async () => {
    supabase.rpc.mockImplementation(async (name, args) => {
      if (args.p_prodotto === 'BAD') return { data: null, error: { message: 'rpc rejected' } }
      return { data: {}, error: null }
    })
    const items = [
      { prodotto: 'OK', quantita: 1 },
      { prodotto: 'BAD', quantita: 1 },
      { prodotto: 'OK2', quantita: 1 },
    ]
    const res = await caricoBatchPF('s', items)
    expect(res.ok).toBe(false)
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0].prodotto).toBe('BAD')
    expect(supabase.rpc).toHaveBeenCalledTimes(3)
  })

  it('items null/undefined → no-op ok', async () => {
    expect(await caricoBatchPF('s', null)).toEqual({ ok: true, errors: [] })
    expect(await caricoBatchPF('s', undefined)).toEqual({ ok: true, errors: [] })
  })
})
