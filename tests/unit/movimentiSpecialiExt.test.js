// movimentiSpeciali — copre i rami non testati da movimentiSpeciali.test.js
// esistente (caricaMovimenti, aggiungiMovimento, eliminaMovimento, aggregaGiorno).

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/storage', () => ({
  sload: vi.fn(),
  ssave: vi.fn(async () => true),
}))
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: 'u1', email: 'u@x.it' } } },
      })),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { ruolo: 'titolare', email: 'u@x.it' } }),
        }),
      }),
    })),
  },
}))

import {
  caricaMovimenti, aggiungiMovimento, eliminaMovimento,
  aggregaGiorno, filtraPerIntervallo, nuovoMovimento,
} from '../../src/lib/movimentiSpeciali'
import { sload, ssave } from '../../src/lib/storage'

describe('caricaMovimenti', () => {
  beforeEach(() => { sload.mockClear(); ssave.mockClear() })

  it('senza orgId → []', async () => {
    expect(await caricaMovimenti(null)).toEqual([])
    expect(sload).not.toHaveBeenCalled()
  })

  it('sload ritorna array → ritorna l\'array', async () => {
    sload.mockResolvedValueOnce([{ id: 'm1' }, { id: 'm2' }])
    const r = await caricaMovimenti('org', 'sede')
    expect(r).toHaveLength(2)
  })

  it('sload ritorna non-array → []', async () => {
    sload.mockResolvedValueOnce(null)
    expect(await caricaMovimenti('org', 'sede')).toEqual([])
    sload.mockResolvedValueOnce({ key: 'broken' })
    expect(await caricaMovimenti('org', 'sede')).toEqual([])
  })

  it('sedeId undefined → passa null a sload', async () => {
    sload.mockResolvedValueOnce([])
    await caricaMovimenti('org')
    expect(sload).toHaveBeenCalledWith(expect.any(String), 'org', null)
  })
})

describe('aggiungiMovimento', () => {
  beforeEach(() => { sload.mockClear(); ssave.mockClear() })

  it('throw senza orgId', async () => {
    await expect(aggiungiMovimento(null, 'sede', {})).rejects.toThrow(/orgId/)
  })

  it('arricchisce con id+ts+autore', async () => {
    sload.mockResolvedValueOnce([])
    const out = await aggiungiMovimento('org', 'sede', { tipo: 'spreco', prodotto: 'X', qta: 5 })
    expect(out.id).toBeDefined()
    expect(out.ts).toBeDefined()
    expect(out.autore_uid).toBe('u1')
    expect(out.autore_ruolo).toBe('titolare')
  })

  it('preserva id e ts custom se passati', async () => {
    sload.mockResolvedValueOnce([])
    const out = await aggiungiMovimento('org', 'sede', {
      id: 'custom-id', ts: '2026-01-01T00:00:00Z', tipo: 'omaggio',
    })
    expect(out.id).toBe('custom-id')
    expect(out.ts).toBe('2026-01-01T00:00:00Z')
  })

  it('chiama ssave con array aggiornato (mov in testa)', async () => {
    sload.mockResolvedValueOnce([{ id: 'old' }])
    await aggiungiMovimento('org', 'sede', { tipo: 'spreco' })
    const callArgs = ssave.mock.calls[0]
    const arr = callArgs[1]
    expect(arr).toHaveLength(2)
    expect(arr[0].tipo).toBe('spreco')   // nuovo in testa
    expect(arr[1].id).toBe('old')
  })
})

describe('eliminaMovimento', () => {
  beforeEach(() => { sload.mockClear(); ssave.mockClear() })

  it('rimuove il movimento per id', async () => {
    sload.mockResolvedValueOnce([{ id: 'A' }, { id: 'B' }, { id: 'C' }])
    const out = await eliminaMovimento('org', 'sede', 'B')
    expect(out).toHaveLength(2)
    expect(out.map(m => m.id)).toEqual(['A', 'C'])
  })

  it('id non esistente → array invariato', async () => {
    sload.mockResolvedValueOnce([{ id: 'A' }])
    const out = await eliminaMovimento('org', 'sede', 'NONE')
    expect(out).toHaveLength(1)
  })
})

describe('filtraPerIntervallo', () => {
  const movs = [
    { id: '1', ts: '2026-06-15T10:00:00Z' },
    { id: '2', ts: '2026-06-20T10:00:00Z' },
    { id: '3', ts: '2026-06-25T10:00:00Z' },
  ]

  it('senza filtri → invariato', () => {
    expect(filtraPerIntervallo(movs)).toEqual(movs)
  })

  it('da=2026-06-18, no a → solo eventi >= da', () => {
    const out = filtraPerIntervallo(movs, '2026-06-18', null)
    expect(out.map(m => m.id)).toEqual(['2', '3'])
  })

  it('range chiuso', () => {
    const out = filtraPerIntervallo(movs, '2026-06-15', '2026-06-20')
    expect(out.map(m => m.id)).toEqual(['1', '2'])
  })

  it('eventi con ts invalido scartati', () => {
    const m = [...movs, { id: '4', ts: 'not-a-date' }]
    const out = filtraPerIntervallo(m, '2026-06-01', '2026-06-30')
    expect(out.find(x => x.id === '4')).toBeUndefined()
  })
})

describe('aggregaGiorno', () => {
  it('aggrega per categoria + prodotto + tot', () => {
    const movs = [
      { ts: '2026-06-15T10:00:00Z', tipo: 'spreco', categoria: 'gelato', prodotto: 'NOCCIOLA', qta: 500, unita: 'g', fcUnit: 0.012 },
      { ts: '2026-06-15T11:00:00Z', tipo: 'omaggio', categoria: 'gelato', prodotto: 'LIMONE', qta: 200, unita: 'g', fcTot: 5, valoreOmaggio: 8 },
      { ts: '2026-06-16T10:00:00Z', tipo: 'spreco', qta: 100, unita: 'g' },  // altro giorno, skip
    ]
    const r = aggregaGiorno(movs, '2026-06-15')
    expect(r.tot.gSpreco).toBe(500)
    expect(r.tot.gOmaggio).toBe(200)
    expect(r.tot.eurOmaggio).toBe(5)
    expect(r.tot.eurRicavoMancato).toBe(8)
    expect(r.perCategoria.gelato.gSpreco).toBe(500)
    expect(r.perCategoria.gelato.gOmaggio).toBe(200)
    expect(r.perProdotto.NOCCIOLA.gSpreco).toBe(500)
    expect(r.perProdotto.LIMONE.gOmaggio).toBe(200)
  })

  it('unita pz contata in nPz, NON in gSpreco/gOmaggio', () => {
    const movs = [
      { ts: '2026-06-15T10:00:00Z', tipo: 'spreco', qta: 3, unita: 'pz', fcTot: 9 },
    ]
    const r = aggregaGiorno(movs, '2026-06-15')
    expect(r.tot.nPzSpreco).toBe(3)
    expect(r.tot.gSpreco).toBe(0)
    expect(r.tot.eurSpreco).toBe(9)
  })

  it('movimenti vuoti → tot a 0', () => {
    const r = aggregaGiorno([], '2026-06-15')
    expect(r.tot.gSpreco).toBe(0)
    expect(r.tot.eurSpreco).toBe(0)
    expect(r.perCategoria).toEqual({})
    expect(r.perProdotto).toEqual({})
  })

  it('mov senza categoria → key vuota \'\'', () => {
    const movs = [
      { ts: '2026-06-15T10:00:00Z', tipo: 'spreco', prodotto: 'X', qta: 100, unita: 'g' },
    ]
    const r = aggregaGiorno(movs, '2026-06-15')
    expect(r.perCategoria['']).toBeDefined()
  })
})

describe('nuovoMovimento', () => {
  it('default tipo=spreco con causale di default', () => {
    const m = nuovoMovimento()
    expect(m.tipo).toBe('spreco')
    expect(m.causale).toBeDefined()
  })

  it('tipo=omaggio default causale appropriata', () => {
    const m = nuovoMovimento('omaggio')
    expect(m.tipo).toBe('omaggio')
  })

  it('campi minimi: tipo, causale, unita default', () => {
    const m = nuovoMovimento()
    expect(m.tipo).toBeDefined()
    expect(m.causale).toBeDefined()
    expect(m.unita).toBe('g')
  })
})
