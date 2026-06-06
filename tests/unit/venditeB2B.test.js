import { describe, it, expect, vi } from 'vitest'
// supabase.js crea il client a top-level con env Vite assenti nei test → mock.
vi.mock('../../src/lib/supabase.js', () => ({ supabase: {} }))
import { pulisciRighe, calcolaTotaleRighe } from '../../src/lib/venditeB2B.js'

describe('pulisciRighe', () => {
  it('UPPERCASE prodotto, numeri IT, totale per riga', () => {
    const out = pulisciRighe([{ prodotto: 'focaccia', qta: '10', prezzo: '1,50' }])
    expect(out).toEqual([{ prodotto: 'FOCACCIA', qta: 10, prezzo: 1.5, totale: 15 }])
  })
  it('arrotonda il totale a 2 decimali', () => {
    expect(pulisciRighe([{ prodotto: 'x', qta: '3', prezzo: '0.333' }])[0].totale).toBe(1)
  })
  it('scarta righe senza prodotto o con qta<=0', () => {
    const out = pulisciRighe([
      { prodotto: '', qta: 5, prezzo: 1 },
      { prodotto: 'PANE', qta: 0, prezzo: 2 },
      { prodotto: '  pane  ', qta: '2', prezzo: '3' },
    ])
    expect(out).toEqual([{ prodotto: 'PANE', qta: 2, prezzo: 3, totale: 6 }])
  })
  it('qta/prezzo non numerici → 0 (riga scartata se qta 0)', () => {
    expect(pulisciRighe([{ prodotto: 'X', qta: 'abc', prezzo: 'def' }])).toEqual([])
  })
  it('input vuoto/nullo → []', () => {
    expect(pulisciRighe(null)).toEqual([])
    expect(pulisciRighe([])).toEqual([])
  })
  it('gestisce sia virgola sia punto come decimale', () => {
    expect(pulisciRighe([{ prodotto: 'A', qta: '1', prezzo: '2.50' }])[0].prezzo).toBe(2.5)
    expect(pulisciRighe([{ prodotto: 'B', qta: '1', prezzo: '2,50' }])[0].prezzo).toBe(2.5)
  })
})

describe('calcolaTotaleRighe', () => {
  it('somma i totali di riga', () => {
    expect(calcolaTotaleRighe([{ totale: 15 }, { totale: 6 }])).toBe(21)
  })
  it('se manca totale lo deriva da qta*prezzo', () => {
    expect(calcolaTotaleRighe([{ qta: 10, prezzo: 1.5 }])).toBe(15)
  })
  it('arrotonda a 2 decimali', () => {
    expect(calcolaTotaleRighe([{ totale: 0.1 }, { totale: 0.2 }])).toBe(0.3)
  })
  it('vuoto → 0', () => {
    expect(calcolaTotaleRighe([])).toBe(0)
    expect(calcolaTotaleRighe(null)).toBe(0)
  })
  it('coerente con pulisciRighe', () => {
    const righe = pulisciRighe([{ prodotto: 'A', qta: '12', prezzo: '0,80' }, { prodotto: 'B', qta: '5', prezzo: '2' }])
    expect(calcolaTotaleRighe(righe)).toBe(19.6)
  })
})
