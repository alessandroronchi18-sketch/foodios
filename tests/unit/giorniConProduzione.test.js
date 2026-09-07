// giorniConProduzione: quali giorni hanno davvero avuto produzione.
//
// Nasce dall'audit del Calendario del 07/09. In metodo inventario la produzione
// sta in inventario_produzione, non nel blob `giornaliero`: il Calendario
// leggeva il blob e mostrava a Mara un muro di rosso pur avendo 123 giorni di
// produzione registrata e una copertura reale fra il 97% e il 100%.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const fromMock = vi.fn()
vi.mock('../../src/lib/supabase', () => ({ supabase: { from: (...a) => fromMock(...a) } }))

import { giorniConProduzione } from '../../src/lib/inventarioProduzione'

function chain(rows, error = null) {
  const c = {
    select: vi.fn(() => c),
    eq: vi.fn(() => c),
    gte: vi.fn(() => c),
    lte: vi.fn(() => c),
    or: vi.fn(() => c),
    then: (cb) => Promise.resolve({ data: rows, error }).then(cb),
  }
  fromMock.mockReturnValue(c)
  return c
}

beforeEach(() => { fromMock.mockReset() })

describe('giorniConProduzione', () => {
  it('restituisce un Set delle date, senza duplicati', async () => {
    chain([{ data: '2026-08-01' }, { data: '2026-08-01' }, { data: '2026-08-02' }])
    const s = await giorniConProduzione('org', 'sede', '2026-08-01', '2026-08-31')
    expect(s).toBeInstanceOf(Set)
    expect(s.size).toBe(2)
    expect(s.has('2026-08-01')).toBe(true)
  })

  it('chiede solo la colonna data: non scarica migliaia di righe di gusti per accendere un pallino', async () => {
    const c = chain([])
    await giorniConProduzione('org', 'sede', '2026-08-01', '2026-08-31')
    expect(c.select).toHaveBeenCalledWith('data')
  })

  it('esclude le righe a zero: una cella lasciata aperta nel foglio non è una giornata di lavoro', async () => {
    const c = chain([])
    await giorniConProduzione('org', 'sede', '2026-08-01', '2026-08-31')
    expect(c.or).toHaveBeenCalledWith('produzione_g.gt.0,scarto_g.gt.0')
  })

  it('applica i limiti di data', async () => {
    const c = chain([])
    await giorniConProduzione('org', 'sede', '2026-08-01', '2026-08-31')
    expect(c.gte).toHaveBeenCalledWith('data', '2026-08-01')
    expect(c.lte).toHaveBeenCalledWith('data', '2026-08-31')
  })

  it('filtra per sede quando la sede è indicata', async () => {
    const c = chain([])
    await giorniConProduzione('org', 'sede-1', '2026-08-01', '2026-08-31')
    expect(c.eq).toHaveBeenCalledWith('sede_id', 'sede-1')
  })

  it('senza sede aggrega tutte le sedi', async () => {
    const c = chain([])
    await giorniConProduzione('org', null, '2026-08-01', '2026-08-31')
    expect(c.eq).not.toHaveBeenCalledWith('sede_id', null)
  })

  it('senza parametri obbligatori non interroga il database', async () => {
    const s = await giorniConProduzione(null, 'sede', '2026-08-01', '2026-08-31')
    expect(s.size).toBe(0)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('su errore restituisce un insieme vuoto invece di far cadere il calendario', async () => {
    chain(null, { message: 'boom' })
    const s = await giorniConProduzione('org', 'sede', '2026-08-01', '2026-08-31')
    expect(s.size).toBe(0)
  })
})
