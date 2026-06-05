import { describe, it, expect, beforeEach } from 'vitest'
import {
  getResaIngrediente, setResaIngrediente, hasResaIngrediente,
  loadRese, costoNettoPerG, getStoreRese,
} from '../../src/lib/rese.js'

describe('rese', () => {
  beforeEach(() => {
    // azzera lo store mutabile tra i test
    for (const k of Object.keys(getStoreRese())) setResaIngrediente(k, 1.0)
  })

  it('default 1.0 per ingrediente non impostato', () => {
    expect(getResaIngrediente('mai_visto_xyz')).toBe(1.0)
  })

  it('hasResaIngrediente: false se non impostato, true dopo set', () => {
    expect(hasResaIngrediente('nuovo_ing')).toBe(false)
    setResaIngrediente('nuovo_ing', 0.8)
    expect(hasResaIngrediente('nuovo_ing')).toBe(true)
  })

  it('setResaIngrediente clampa tra 0.01 e 1.0 (0/NaN -> default 1.0)', () => {
    setResaIngrediente('a', 5);     expect(getResaIngrediente('a')).toBe(1.0)  // sopra il max
    setResaIngrediente('b', 0.005); expect(getResaIngrediente('b')).toBe(0.01) // sotto il min
    setResaIngrediente('c', 0.5);   expect(getResaIngrediente('c')).toBe(0.5)
    // resa 0 (o non numerica) non è valida: il codice la tratta come 100% (1.0).
    setResaIngrediente('d', 0);     expect(getResaIngrediente('d')).toBe(1.0)
  })

  it('costoNettoPerG = costoLordo / resa', () => {
    setResaIngrediente('uova', 0.8)
    expect(costoNettoPerG(0.01, 'uova')).toBeCloseTo(0.0125, 6)
    // resa 1.0 (default) -> invariato
    expect(costoNettoPerG(0.02, 'senza_resa')).toBeCloseTo(0.02, 6)
  })

  it('loadRese carica e clampa un oggetto', () => {
    loadRese({ x: 0.7, y: 9, z: -1 })
    expect(getResaIngrediente('x')).toBe(0.7)
    expect(getResaIngrediente('y')).toBe(1.0)
    expect(getResaIngrediente('z')).toBe(0.01)
  })
})
