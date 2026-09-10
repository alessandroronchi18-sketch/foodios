import { describe, it, expect, vi, beforeEach } from 'vitest'
const fromMock = vi.fn()
vi.mock('../../src/lib/supabase', () => ({
  supabase: { from: (...a) => fromMock(...a), rpc: vi.fn() },
}))
import { salvaChiusure, foodcostNoto } from '../../src/lib/chiusure'
import { mergeInChiusureCassa } from '../../src/lib/importCassa'

function chain() {
  const calls = { upsert: null, notArgs: null, eq: [], is: 0, deleteCalled: false }
  const c = {
    select: vi.fn(() => c), eq: vi.fn((k, v) => { calls.eq.push([k, v]); return c }),
    is: vi.fn(() => { calls.is++; return c }), gte: vi.fn(() => c), lte: vi.fn(() => c),
    not: vi.fn((...a) => { calls.notArgs = a; return c }),
    order: vi.fn(async () => ({ data: [], error: null })),
    upsert: vi.fn(async (rows, opt) => { calls.upsert = { rows, opt }; return { error: null } }),
    delete: vi.fn(() => { calls.deleteCalled = true; return c }),
    then: (cb) => Promise.resolve({ error: null }).then(cb),
  }
  fromMock.mockReturnValue(c)
  return calls
}
beforeEach(() => fromMock.mockReset())

describe('AUDIT', () => {
  it('A: il rec del salvataggio dettaglio azzera i canali', async () => {
    const calls = chain()
    // rec identico a ChiusuraView:747-752
    const rec = { id: 'ch-2026-09-10', data: '2026-09-10', salvatoAt: 'x', venduto: [{nome:'CONO'}],
      confronto: [], formati: [], kpi: { totV: 500, totFC: 150, totM: 350, totS: 0, totMP: 70, avgST: 80 } }
    await salvaChiusure('org', 'sede', [rec])
    const r = calls.upsert.rows[0]
    console.log('RIGA UPSERT:', JSON.stringify({ pos: r.incasso_pos, contanti: r.incasso_contanti, delivery: r.incasso_delivery, extra: r.extra }))
    expect(r.incasso_pos).toBe(null)
    console.log('DELETE not() args:', JSON.stringify(calls.notArgs))
  })
  it('B: array vuoto -> delete senza filtro data', async () => {
    const calls = chain()
    await salvaChiusure('org', 'sede', [])
    console.log('vuoto: deleteCalled=', calls.deleteCalled, 'notArgs=', JSON.stringify(calls.notArgs), 'eq=', JSON.stringify(calls.eq))
  })
  it('C: import cassa nuovo giorno -> foodcostNoto true con FC 0', () => {
    const nuove = mergeInChiusureCassa([], [{ data: '2026-08-01', importo: 812.5, iva: 0, fonte: 'Cassa in Cloud' }], 'cassaincloud')
    const g = nuove[0]
    console.log('giorno importato:', JSON.stringify(g.kpi), 'foodcostNoto=', foodcostNoto(g), 'solo_totale=', g.solo_totale)
    expect(foodcostNoto(g)).toBe(true)
    expect(g.kpi.totFC).toBe(0)
    expect(g.kpi.totM).toBe(812.5)
    expect(g.kpi.totMP).toBe(0)
  })
  it('D: import cassa su giorno esistente non tocca i canali ma sovrascrive totV', () => {
    const esistente = { data: '2026-08-01', kpi: { totV: 900, totFC: 300, totM: 600, totMP: 66.7, pos: 700, contanti: 200 }, venduto: [] }
    const nuove = mergeInChiusureCassa([esistente], [{ data: '2026-08-01', importo: 500, fonte: 'X' }], 'x')
    console.log('merge esistente:', JSON.stringify(nuove[0].kpi))
  })
})
