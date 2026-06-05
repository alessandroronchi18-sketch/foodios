import { describe, it, expect } from 'vitest'
import {
  componentiNormalizzati, costoComponentiUnita, matchFormato,
  fcStimatoFormato, avgFCperGCategoria, riconciliaFormati,
} from '../../src/lib/formatiVendita.js'
import { buildIngCosti } from '../../src/lib/foodcost.js'

const ic = (m) => { const o = {}; for (const [n, kg] of Object.entries(m)) o[n] = { costoKg: kg, costoG: kg / 1000 }; return o }

describe('componentiNormalizzati', () => {
  it('normalizza array di componenti', () => {
    const c = componentiNormalizzati({ componenti: [{ nome: 'Cono', qta: 1, costo: 0.06 }] })
    expect(c).toEqual([{ nome: 'Cono', qta: 1, costo: 0.06 }])
  })
  it('converte il legacy costoContenitore in un componente', () => {
    expect(componentiNormalizzati({ costoContenitore: 0.2 })).toEqual([{ nome: 'Contenitore', qta: 1, costo: 0.2 }])
  })
  it('vuoto se niente componenti né legacy', () => {
    expect(componentiNormalizzati({})).toEqual([])
  })
})

describe('costoComponentiUnita', () => {
  it('somma qta*costo', () => {
    expect(costoComponentiUnita({ componenti: [{ nome: 'a', qta: 2, costo: 0.1 }, { nome: 'b', qta: 1, costo: 0.05 }] }))
      .toBeCloseTo(0.25, 6)
  })
})

describe('matchFormato', () => {
  const formati = [
    { id: 'f1', nome: 'Vaschetta 500', alias: ['vasch 500'] },
    { id: 'f2', nome: 'Cono' },
  ]
  it('match per nome (case/spazi-insensitive)', () => {
    expect(matchFormato('VASCHETTA 500', formati)?.id).toBe('f1')
  })
  it('match per alias', () => {
    expect(matchFormato('Vasch 500', formati)?.id).toBe('f1')
  })
  it('niente match -> null', () => {
    expect(matchFormato('Tiramisù', formati)).toBeNull()
  })
})

describe('fcStimatoFormato', () => {
  it('= componenti + baseQtaG * FC_medio/g', () => {
    const f = { baseQtaG: 100, componenti: [{ nome: 'box', qta: 1, costo: 0.2 }] }
    expect(fcStimatoFormato(f, 0.01)).toBeCloseTo(0.2 + 100 * 0.01, 6) // 1.2
  })
})

describe('avgFCperGCategoria — match categoria case-insensitive', () => {
  it('una ricetta "gelato" rientra nella categoria "Gelato"', () => {
    const ingCosti = buildIngCosti(ic({ latte_y: 1.0 })) // 0.001 €/g
    const ricettario = { ricette: {
      FIORDILATTE: { nome: 'FIORDILATTE', categoria: 'gelato', tipo: 'fetta', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'latte_y', qty1stampo: 1000 }] }, // fc 1.0, peso 1000 -> 0.001/g
    } }
    const avg = avgFCperGCategoria('Gelato', ricettario, ingCosti)
    expect(avg).toBeCloseTo(0.001, 6)
  })
})

describe('riconciliaFormati — FIX: categoria case-insensitive (grammi prodotti non persi)', () => {
  it('formato "Gelato" + ricetta "gelato" riconciliano i grammi prodotti', () => {
    const ingCosti = buildIngCosti(ic({ latte_y: 1.0 }))
    const formati = [{ id: 'f1', nome: 'Vaschetta 500', categoria: 'Gelato', baseQtaG: 500,
      componenti: [{ nome: 'vaschetta', qta: 1, costo: 0.2 }] }]
    const ricettario = { ricette: {
      FIORDILATTE: { nome: 'FIORDILATTE', categoria: 'gelato', tipo: 'fetta', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'latte_y', qty1stampo: 1000 }] },
    } }
    const sessione = { prodotti: [{ nome: 'FIORDILATTE', stampi: 2 }] } // 2 * 1000g = 2000g prodotti
    const venduto = [{ nome: 'Vaschetta 500', qta: 4, totale: 20 }]     // 4 * 500g = 2000g venduti

    const { righe, categorie } = riconciliaFormati(venduto, formati, sessione, ricettario, ingCosti)

    expect(righe).toHaveLength(1)
    const cat = categorie.find(c => c.categoria === 'Gelato')
    expect(cat).toBeTruthy()
    expect(cat.gVenduti).toBeCloseTo(2000, 3)
    // col bug case-sensitive gProdotti restava 0 e st diventava null
    expect(cat.gProdotti).toBeCloseTo(2000, 3)
    expect(cat.st).toBeCloseTo(100, 1) // sell-through 100%
  })
})
