import { describe, it, expect } from 'vitest'
import { resaGrammi, pesoIngredientiG } from '../../src/lib/foodcost.js'

describe('pesoIngredientiG', () => {
  it('somma qty1stampo di tutti gli ingredienti', () => {
    const ric = { ingredienti: [{ qty1stampo: 500 }, { qty1stampo: 300 }, { qty1stampo: 210.4 }] }
    expect(pesoIngredientiG(ric)).toBeCloseTo(1010.4, 3)
  })
  it('ricetta senza ingredienti → 0', () => {
    expect(pesoIngredientiG({ ingredienti: [] })).toBe(0)
    expect(pesoIngredientiG({})).toBe(0)
    expect(pesoIngredientiG(null)).toBe(0)
  })
  it('ignora valori non numerici (NaN/null/string)', () => {
    const ric = { ingredienti: [{ qty1stampo: 100 }, { qty1stampo: 'boh' }, { qty1stampo: null }, { qty1stampo: 50 }] }
    expect(pesoIngredientiG(ric)).toBe(150)
  })
})

describe('resaGrammi', () => {
  it('usa ric.resa_g esplicito quando presente e valido', () => {
    const ric = { tipo: 'gusto', resa_g: 1000, ingredienti: [{ qty1stampo: 1010.4 }] }
    expect(resaGrammi(ric)).toBe(1000)
  })
  it('fallback su somma ingredienti se resa_g mancante', () => {
    const ric = { tipo: 'gusto', ingredienti: [{ qty1stampo: 500 }, { qty1stampo: 500 }] }
    expect(resaGrammi(ric)).toBe(1000)
  })
  it('fallback su somma anche per stampi/pezzi (referenza peso stampo)', () => {
    const ric = { tipo: 'fetta', ingredienti: [{ qty1stampo: 300 }, { qty1stampo: 250 }] }
    expect(resaGrammi(ric)).toBe(550)
  })
  it('resa_g esplicita override sulla somma per stampi/pezzi', () => {
    const ric = { tipo: 'fetta', resa_g: 1200, ingredienti: [{ qty1stampo: 1180 }] }
    expect(resaGrammi(ric)).toBe(1200)
  })
  it('resa_g invalida (0, negativa, NaN, stringa) → fallback su somma', () => {
    const ings = [{ qty1stampo: 800 }]
    expect(resaGrammi({ tipo: 'gusto', resa_g: 0, ingredienti: ings })).toBe(800)
    expect(resaGrammi({ tipo: 'gusto', resa_g: -100, ingredienti: ings })).toBe(800)
    expect(resaGrammi({ tipo: 'gusto', resa_g: NaN, ingredienti: ings })).toBe(800)
    expect(resaGrammi({ tipo: 'gusto', resa_g: 'boh', ingredienti: ings })).toBe(800)
  })
  it('gusto senza ingredienti né resa: fallback a 1000g (default sensato)', () => {
    expect(resaGrammi({ tipo: 'gusto' })).toBe(1000)
    expect(resaGrammi({ tipo: 'gusto', ingredienti: [] })).toBe(1000)
  })
  it('stampi senza ingredienti né resa: 0 (segnala "ricetta vuota")', () => {
    expect(resaGrammi({ tipo: 'fetta' })).toBe(0)
    expect(resaGrammi({ tipo: 'pezzo', ingredienti: [] })).toBe(0)
  })
  it('caso reale gelato: ingredienti 1010.4g per resa 1000g', () => {
    const ric = { tipo: 'gusto', resa_g: 1000, ingredienti: [
      { qty1stampo: 500 }, { qty1stampo: 300 }, { qty1stampo: 210.4 },
    ]}
    // pesoIngredientiG dà 1010.4 (perdita evaporazione), resaGrammi 1000
    expect(pesoIngredientiG(ric)).toBeCloseTo(1010.4, 3)
    expect(resaGrammi(ric)).toBe(1000)
    // Impatto su fc/kg (immaginando fc totale ingredienti = 3.03 €):
    //   Prima (senza resa): fc/kg = 3.03 / (1010.4/1000) = 3.00 €/kg
    //   Ora (con resa=1000): fc/kg = 3.03 / (1000/1000) = 3.03 €/kg
    // Sul lungo (100 kg finiti): +3€ di food cost dichiarato = +3€ margine
    // corretto invece che sfasato.
    const fcTot = 3.03
    const fcPerKgOld = fcTot / (pesoIngredientiG(ric) / 1000)
    const fcPerKgNew = fcTot / (resaGrammi(ric) / 1000)
    expect(fcPerKgOld).toBeCloseTo(3.00, 2)
    expect(fcPerKgNew).toBeCloseTo(3.03, 2)
  })
})
