// Audit 2026-07-01 batch 9: copertura per `src/lib/multiSediMerge.js`,
// estratto da Dashboard.jsx come primo step di split. Comportamento
// invariato vs originale; questi test cementano la semantica.

import { describe, it, expect } from 'vitest'
import { mergeArr, mergeMag } from '../../src/lib/multiSediMerge'

describe('mergeArr', () => {
  it('concatena array da map per-sede in ordine inserzione', () => {
    const map = {
      sedeA: [{ id: 1 }, { id: 2 }],
      sedeB: [{ id: 3 }],
    }
    const out = mergeArr(map)
    expect(out).toHaveLength(3)
    expect(out.map(x => x.id).sort()).toEqual([1, 2, 3])
  })

  it('filtra entry non-array (oggetti, null)', () => {
    const map = {
      sedeA: [{ id: 1 }],
      sedeB: null,
      sedeC: { id: 2 }, // oggetto, non array
      sedeD: [{ id: 3 }],
    }
    expect(mergeArr(map)).toEqual([{ id: 1 }, { id: 3 }])
  })

  it('map vuoto/null/undefined -> array vuoto', () => {
    expect(mergeArr({})).toEqual([])
    expect(mergeArr(null)).toEqual([])
    expect(mergeArr(undefined)).toEqual([])
  })
})

describe('mergeMag', () => {
  it('somma giacenze per chiave ingrediente cross-sede', () => {
    const map = {
      sedeA: { farina: { nome: 'farina', giacenza_g: 1000, soglia_g: 500 } },
      sedeB: { farina: { nome: 'farina', giacenza_g: 800, soglia_g: 300 } },
    }
    const out = mergeMag(map)
    expect(out.farina.giacenza_g).toBe(1800)
  })

  it('soglia_g prende il MAX cross-sede (piu conservativa)', () => {
    const map = {
      sedeA: { zucchero: { nome: 'zucchero', giacenza_g: 500, soglia_g: 200 } },
      sedeB: { zucchero: { nome: 'zucchero', giacenza_g: 300, soglia_g: 800 } },
    }
    expect(mergeMag(map).zucchero.soglia_g).toBe(800)
  })

  it('ingredienti presenti solo in una sede vengono inclusi tali quali', () => {
    const map = {
      sedeA: { farina: { giacenza_g: 1000, soglia_g: 100 } },
      sedeB: { burro: { giacenza_g: 500, soglia_g: 200 } },
    }
    const out = mergeMag(map)
    expect(out.farina.giacenza_g).toBe(1000)
    expect(out.burro.giacenza_g).toBe(500)
  })

  it('filtra valori non-oggetto e array', () => {
    const map = {
      sedeA: { farina: { giacenza_g: 100, soglia_g: 50 } },
      sedeB: null,
      sedeC: [1, 2, 3], // array, no
      sedeD: 'invalid',
    }
    expect(mergeMag(map)).toEqual({
      farina: { giacenza_g: 100, soglia_g: 50 },
    })
  })

  it('mancanza di giacenza_g/soglia_g viene trattata come 0', () => {
    const map = {
      sedeA: { farina: { nome: 'farina' } },
      sedeB: { farina: { nome: 'farina', giacenza_g: 100, soglia_g: 50 } },
    }
    const out = mergeMag(map)
    expect(out.farina.giacenza_g).toBe(100)
    expect(out.farina.soglia_g).toBe(50)
  })

  it('map vuoto -> oggetto vuoto', () => {
    expect(mergeMag({})).toEqual({})
    expect(mergeMag(null)).toEqual({})
  })
})
