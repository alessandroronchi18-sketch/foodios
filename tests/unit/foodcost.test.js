import { describe, it, expect, beforeEach } from 'vitest'
import {
  calcolaFC, calcolaFCStorico, calcolaFCDettaglio, buildIngCosti, getPrezzoStoricoKg, normIng,
} from '../../src/lib/foodcost.js'
import { setResaIngrediente, getStoreRese } from '../../src/lib/rese.js'

// helper: costruisce ingredienti_costi grezzo {nome: {costoKg, costoG}}
const ic = (m) => {
  const o = {}
  for (const [n, kg] of Object.entries(m)) o[n] = { costoKg: kg, costoG: kg / 1000 }
  return o
}
const ricetta = (nome, ingredienti, extra = {}) =>
  ({ nome, tipo: 'fetta', unita: 1, prezzo: 0, ingredienti, ...extra })

beforeEach(() => {
  // azzera le rese tra i test (store mutabile a livello modulo)
  for (const k of Object.keys(getStoreRese())) setResaIngrediente(k, 1.0)
})

describe('buildIngCosti', () => {
  it('mappa plurale->singolare (uova->uovo) e rende il lookup raggiungibile', () => {
    const built = buildIngCosti({ uova: { costoKg: 3, costoG: 0.003 } })
    expect(built[normIng('uova')]).toBeTruthy()
    expect(built['uovo'].costoG).toBeCloseTo(0.003, 6)
  })
  it('ignora gli ingredienti con costoG <= 0 (salvo stima HORECA)', () => {
    const built = buildIngCosti({ ing_zero_xyz: { costoKg: 0, costoG: 0 } })
    expect(built['ing_zero_xyz']).toBeUndefined()
  })
})

describe('calcolaFC — base', () => {
  it('somma qty1stampo * costoG', () => {
    const ingCosti = buildIngCosti(ic({ ing_a: 1.0, ing_b: 2.0 })) // 0.001, 0.002 €/g
    const r = ricetta('R1', [
      { nome: 'ing_a', qty1stampo: 100 },
      { nome: 'ing_b', qty1stampo: 50 },
    ])
    const { tot, mancanti } = calcolaFC(r, ingCosti, { ricette: {} })
    expect(mancanti).toEqual([])
    expect(tot).toBeCloseTo(100 * 0.001 + 50 * 0.002, 3) // 0.2
  })

  it('ingrediente assente finisce in mancanti', () => {
    const ingCosti = buildIngCosti(ic({ ing_a: 1.0 }))
    const r = ricetta('R', [
      { nome: 'ing_a', qty1stampo: 100 },
      { nome: 'ingrediente_inesistente_q', qty1stampo: 10 },
    ])
    const { mancanti } = calcolaFC(r, ingCosti, { ricette: {} })
    expect(mancanti).toContain('ingrediente_inesistente_q')
  })
})

describe('calcolaFCDettaglio — breakdown', () => {
  it('la somma delle righe coincide col totale di calcolaFC, ordinate per costo', () => {
    const ingCosti = buildIngCosti(ic({ ing_a: 1.0, ing_b: 4.0 })) // 0.001, 0.004 €/g
    const r = ricetta('R', [
      { nome: 'ing_a', qty1stampo: 100 }, // 0.1
      { nome: 'ing_b', qty1stampo: 50 },  // 0.2
    ])
    const { tot } = calcolaFC(r, ingCosti, { ricette: {} })
    const dett = calcolaFCDettaglio(r, ingCosti, { ricette: {} })
    expect(dett.tot).toBeCloseTo(tot, 3)
    const somma = dett.righe.reduce((s, x) => s + x.costo, 0)
    expect(somma).toBeCloseTo(tot, 3)
    expect(dett.righe[0].nome).toBe('ing_b') // il più caro in cima
  })

  it('segnala gli ingredienti senza prezzo come mancante', () => {
    const ingCosti = buildIngCosti(ic({ ing_a: 1.0 }))
    const r = ricetta('R', [
      { nome: 'ing_a', qty1stampo: 100 },
      { nome: 'ingrediente_inesistente_z', qty1stampo: 10 },
    ])
    const dett = calcolaFCDettaglio(r, ingCosti, { ricette: {} })
    expect(dett.righe.some(x => x.mancante)).toBe(true)
  })
})

describe('calcolaFC — resa', () => {
  it('applica la resa di una foglia (costo / resa)', () => {
    const ingCosti = buildIngCosti(ic({ foglia_x: 10.0 })) // 0.01 €/g
    setResaIngrediente(normIng('foglia_x'), 0.5)
    const r = ricetta('R', [{ nome: 'foglia_x', qty1stampo: 100 }])
    const { tot } = calcolaFC(r, ingCosti, { ricette: {} })
    expect(tot).toBeCloseTo(100 * (0.01 / 0.5), 3) // 2.0
  })

  it('FIX: la resa del semilavorato SOSTITUISCE quelle delle foglie (calo una volta sola)', () => {
    const ingCosti = buildIngCosti(ic({ latte_x: 10.0 })) // 0.01 €/g
    const ricettario = { ricette: {
      'SEMI X': { nome: 'SEMI X', tipo: 'semilavorato', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'latte_x', qty1stampo: 100 }] },
      'TORTA X': { nome: 'TORTA X', tipo: 'fetta', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'semi x', qty1stampo: 50 }] },
    } }
    setResaIngrediente(normIng('latte_x'), 0.8) // resa foglia
    setResaIngrediente(normIng('semi x'), 0.5)  // resa semilavorato
    const { tot } = calcolaFC(ricettario.ricette['TORTA X'], ingCosti, ricettario)
    // CORRETTO (sostituzione): semiTot lordo=1.0, costoG=0.01, /0.5 => 0.02/g * 50 = 1.0
    // BUG (doppio calo) avrebbe dato 1.25
    expect(tot).toBeCloseTo(1.0, 3)
  })
})

describe('calcolaFC — semilavorati ed edge case', () => {
  it('risolve il costo di un semilavorato annidato', () => {
    const ingCosti = buildIngCosti(ic({ base_x: 4.0 })) // 0.004 €/g
    const ricettario = { ricette: {
      'CREMA': { nome: 'CREMA', tipo: 'semilavorato', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'base_x', qty1stampo: 200 }] }, // semiTot 0.8, peso 200 -> 0.004/g
      'DOLCE': { nome: 'DOLCE', tipo: 'fetta', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'crema', qty1stampo: 100 }] },  // 100 * 0.004 = 0.4
    } }
    const { tot, mancanti } = calcolaFC(ricettario.ricette['DOLCE'], ingCosti, ricettario)
    expect(mancanti).toEqual([])
    expect(tot).toBeCloseTo(0.4, 3)
  })

  it('semilavorato senza peso totale -> mancanti (non costo 0 silenzioso)', () => {
    const ingCosti = buildIngCosti(ic({ base_x: 4.0 }))
    const ricettario = { ricette: {
      'VUOTO': { nome: 'VUOTO', tipo: 'semilavorato', unita: 1, prezzo: 0, ingredienti: [] },
      'DOLCE': { nome: 'DOLCE', tipo: 'fetta', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'vuoto', qty1stampo: 100 }] },
    } }
    const { mancanti } = calcolaFC(ricettario.ricette['DOLCE'], ingCosti, ricettario)
    expect(mancanti.some(m => m.includes('VUOTO') || m.toLowerCase().includes('vuoto'))).toBe(true)
  })

  it('ciclo tra semilavorati: gestito senza loop infinito, ritorna risultato finito', () => {
    const ingCosti = buildIngCosti(ic({ base_x: 4.0 }))
    const ricettario = { ricette: {
      'A': { nome: 'A', tipo: 'semilavorato', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'b', qty1stampo: 50 }] },
      'B': { nome: 'B', tipo: 'semilavorato', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'a', qty1stampo: 50 }] },
    } }
    // La garanzia chiave del cycle-detect è non andare in ricorsione infinita:
    // la chiamata deve terminare e restituire un costo finito (niente stack overflow).
    const res = calcolaFC(ricettario.ricette['A'], ingCosti, ricettario)
    expect(Number.isFinite(res.tot)).toBe(true)
    expect(Array.isArray(res.mancanti)).toBe(true)
  })
})

describe('getPrezzoStoricoKg', () => {
  it('FIX: prezzo storico 0 = costo reale (non "sconosciuto")', () => {
    const log = [{ ingrediente: 'burro', prezzoNuovo: 0, prezzoVecchio: 5, data: '2020-01-01' }]
    expect(getPrezzoStoricoKg(log, 'burro', '2021-01-01')).toBe(0)
  })

  it('ritorna il prezzo attivo alla data; null se log vuoto', () => {
    const log = [
      { ingrediente: 'farina', prezzoNuovo: 2, prezzoVecchio: 1, data: '2026-01-01' },
    ]
    expect(getPrezzoStoricoKg(log, 'farina', '2026-06-01')).toBe(2) // dopo la modifica
    expect(getPrezzoStoricoKg(log, 'farina', '2025-06-01')).toBe(1) // prima -> prezzoVecchio
    expect(getPrezzoStoricoKg([], 'farina', '2026-06-01')).toBeNull()
  })
})

describe('calcolaFCStorico', () => {
  it('usa il prezzo storico quando disponibile, altrimenti il corrente', () => {
    const ingCosti = buildIngCosti(ic({ farina: 2.0 })) // corrente 0.002 €/g
    const log = [{ ingrediente: 'farina', prezzoNuovo: 1000, prezzoVecchio: 500, data: '2020-01-01' }]
    const r = ricetta('PANE', [{ nome: 'farina', qty1stampo: 100 }])
    // storico: prezzo 1000 €/kg => 1.0 €/g => 100g = 100
    const { tot } = calcolaFCStorico(r, ingCosti, { ricette: {} }, log, '2021-01-01')
    expect(tot).toBeCloseTo(100 * (1000 / 1000), 1)
  })

  it('FIX: prezzo storico 0 produce food cost 0 per quell\'ingrediente', () => {
    const ingCosti = buildIngCosti(ic({ omaggio: 9.0 })) // corrente alto
    const log = [{ ingrediente: 'omaggio', prezzoNuovo: 0, prezzoVecchio: 9, data: '2020-01-01' }]
    const r = ricetta('R', [{ nome: 'omaggio', qty1stampo: 100 }])
    const { tot } = calcolaFCStorico(r, ingCosti, { ricette: {} }, log, '2021-01-01')
    expect(tot).toBeCloseTo(0, 6) // usa 0, non il prezzo corrente
  })
})
