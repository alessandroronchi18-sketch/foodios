// Test per gli helper pure di foodcost.js NON coperti dalla suite principale
// (foodcost.test.js si concentra su calcolaFC/FCStorico/FCDettaglio/buildIngCosti).
// Audit 2026-06-19 P4: lift coverage 76.7% → ~85% sui ramoli untouched.

import { describe, it, expect } from 'vitest'
import {
  normIng,
  translateProdottoEN,
  translateIngredienteEN,
  isRicettaValida,
  NOMI_SKIP,
  REGOLE,
  resetRegoleRuntime,
  getR,
  isSemilavorato,
} from '../../src/lib/foodcost.js'

describe('normIng', () => {
  it('trim + lowercase + collapse whitespace', () => {
    expect(normIng('  Farina   00 ')).toBe('farina 00')
  })
  it('plurale→singolare via SING_PLUR map (uova→uovo)', () => {
    expect(normIng('Uova')).toBe('uovo')
    expect(normIng('Mandorle')).toBe('mandorla')
  })
  it('null/undefined/empty → stringa vuota', () => {
    expect(normIng(null)).toBe('')
    expect(normIng(undefined)).toBe('')
    expect(normIng('')).toBe('')
  })
  it('input già normalizzato resta uguale', () => {
    expect(normIng('zucchero')).toBe('zucchero')
  })
})

describe('translateProdottoEN', () => {
  it('mappa traduzione nota → uppercase IT', () => {
    expect(translateProdottoEN('carrot cake')).toBe('TORTA DI CAROTE')
    expect(translateProdottoEN('Banana Bread')).toBe('BANANA BREAD')
    expect(translateProdottoEN('shortcrust pastry')).toBe('PASTA FROLLA')
  })
  it('case-insensitive sul lookup', () => {
    expect(translateProdottoEN('Apple Pie')).toBe('TORTA DI MELE')
  })
  it('non-mappato → fallback uppercase originale', () => {
    expect(translateProdottoEN('mystery dessert')).toBe('MYSTERY DESSERT')
  })
  it('null/empty → ritorna input invariato (no crash)', () => {
    expect(translateProdottoEN('')).toBe('')
    expect(translateProdottoEN(null)).toBe(null)
    expect(translateProdottoEN(undefined)).toBe(undefined)
  })
})

describe('translateIngredienteEN', () => {
  it('mappa traduzione nota EN→IT (lowercase target)', () => {
    expect(translateIngredienteEN('flour')).toBe('farina 00')
    expect(translateIngredienteEN('eggs')).toBe('uovo')
    expect(translateIngredienteEN('Heavy Cream')).toBe('panna fresca')
  })
  it('non-mappato → ritorna input invariato (NON uppercase, diverso da prodotti)', () => {
    expect(translateIngredienteEN('schmaltz')).toBe('schmaltz')
  })
  it('null/empty → ritorna input invariato', () => {
    expect(translateIngredienteEN('')).toBe('')
    expect(translateIngredienteEN(null)).toBe(null)
  })
})

describe('isRicettaValida', () => {
  it('nome valido → true', () => {
    expect(isRicettaValida('TORTA AL LIMONE')).toBe(true)
    expect(isRicettaValida('cookies')).toBe(true)
  })
  it('nome nello skip-list → false (case-insensitive)', () => {
    for (const skip of NOMI_SKIP) {
      expect(isRicettaValida(skip)).toBe(false)
      expect(isRicettaValida(skip.toUpperCase())).toBe(false)
      expect(isRicettaValida(`  ${skip}  `)).toBe(false)
    }
  })
  it('falsy → false', () => {
    expect(isRicettaValida('')).toBe('')          // legacy: ritorna il valore falsy raw
    expect(isRicettaValida(null)).toBe(null)
    expect(isRicettaValida(undefined)).toBe(undefined)
  })
})

describe('getR', () => {
  it('regola built-in nota → ritorna la regola', () => {
    const r = getR('TORTA DI CAROTE', null)
    expect(r.unita).toBe(8)
    expect(r.prezzo).toBe(5)
    expect(r.tipo).toBe('fetta')
  })
  it('ricetta manuale → usa i campi della ricetta', () => {
    const r = getR('NUOVA TORTA', { unita: 12, prezzo: 6, tipo: 'pezzo' })
    expect(r).toEqual({ unita: 12, prezzo: 6, tipo: 'pezzo' })
  })
  it('ricetta manuale con tipo mancante → default fetta', () => {
    const r = getR('TORTA SENZA TIPO', { unita: 10, prezzo: 4 })
    expect(r.tipo).toBe('fetta')
  })
  it('ricetta manuale con unita 0/null → preservato come 0', () => {
    const r = getR('SEMILAV', { unita: 0, prezzo: 0, tipo: 'semilavorato' })
    expect(r.unita).toBe(0)
    expect(r.tipo).toBe('semilavorato')
  })
  it('nessuna regola né ricetta → default (8 unità, 4€, fetta)', () => {
    const r = getR('SCONOSCIUTA', null)
    expect(r).toEqual({ unita: 8, prezzo: 4, tipo: 'fetta' })
  })
  it('ricetta con unita undefined ma altri campi → torna ai default', () => {
    const r = getR('NO_UNITA', { prezzo: 3 })
    expect(r.unita).toBe(8)  // default branch
  })
})

describe('isSemilavorato', () => {
  it('ricetta esiste con tipo=semilavorato → true', () => {
    const ricettario = { ricette: { 'CREMA': { nome: 'CREMA', tipo: 'semilavorato' } } }
    expect(isSemilavorato('CREMA', ricettario)).toBe(true)
  })
  it('ricetta esiste ma tipo=fetta → false', () => {
    const ricettario = { ricette: { 'TORTA': { tipo: 'fetta' } } }
    expect(isSemilavorato('TORTA', ricettario)).toBe(false)
  })
  it('lookup case-insensitive (toUpperCase fallback)', () => {
    const ricettario = { ricette: { 'CREMA PASTICCERA': { tipo: 'semilavorato' } } }
    expect(isSemilavorato('crema pasticcera', ricettario)).toBe(true)
  })
  it('ricettario null/undefined → false (no crash)', () => {
    expect(isSemilavorato('CREMA', null)).toBe(false)
    expect(isSemilavorato('CREMA', undefined)).toBe(false)
  })
  it('ricetta nota in REGOLE (built-in) come semilavorato', () => {
    // PASTA FROLLA è in REGOLE come tipo:semilavorato
    const ricettario = { ricette: { 'PASTA FROLLA': { nome: 'PASTA FROLLA' /* niente tipo */ } } }
    expect(isSemilavorato('PASTA FROLLA', ricettario)).toBe(true)
  })
  it('nome non in ricettario → false', () => {
    expect(isSemilavorato('INESISTENTE', { ricette: {} })).toBe(false)
  })
})

describe('calcolaFCDettaglio — semilavorato sub-tree', () => {
  it('riconosce un ingrediente che è un semilavorato del ricettario e ricorre nel dettaglio', async () => {
    const { calcolaFCDettaglio, buildIngCosti } = await import('../../src/lib/foodcost.js')
    // Semilavorato CREMA: farina 100g (1€/kg) + zucchero 200g (1€/kg) = 0.3€ totale, peso 300g
    // Costo unitario semi = 0.3/300 = 0.001 €/g
    const ricettario = {
      ricette: {
        'CREMA TEST': {
          nome: 'CREMA TEST', tipo: 'semilavorato', unita: 0, prezzo: 0,
          ingredienti: [
            { nome: 'farina', qty1stampo: 100 },
            { nome: 'zucchero', qty1stampo: 200 },
          ],
        },
      },
    }
    const ingCosti = buildIngCosti({
      farina: { costoKg: 1, costoG: 0.001 },
      zucchero: { costoKg: 1, costoG: 0.001 },
    })
    // Ricetta che usa CREMA come ingrediente (250g)
    const ricetta = {
      nome: 'TORTA', tipo: 'fetta', unita: 1, prezzo: 0,
      ingredienti: [
        { nome: 'CREMA TEST', qty1stampo: 250 },
        { nome: 'farina', qty1stampo: 50 },
      ],
    }
    const { tot, righe } = calcolaFCDettaglio(ricetta, ingCosti, ricettario)
    expect(righe.length).toBe(2)
    const semiRow = righe.find(r => r.isSemilavorato)
    expect(semiRow, 'deve esistere una riga isSemilavorato:true').toBeTruthy()
    expect(semiRow.nome).toBe('CREMA TEST')
    // costo atteso semilavorato: 250 * (0.3/300) = 0.25 €
    expect(semiRow.costo).toBeCloseTo(0.25, 3)
    // costo atteso farina: 50 * 0.001 = 0.05 €
    expect(righe.find(r => r.nome === 'farina').costo).toBeCloseTo(0.05, 3)
    // totale: 0.30 (ordinato: semi prima per costo desc)
    expect(tot).toBeCloseTo(0.30, 3)
    expect(righe[0].nome).toBe('CREMA TEST')  // sort desc per costo
  })

  it('semilavorato senza peso (peso=0) viene saltato silenziosamente in Dettaglio', async () => {
    const { calcolaFCDettaglio, buildIngCosti } = await import('../../src/lib/foodcost.js')
    const ricettario = {
      ricette: {
        'SEMI VUOTO': {
          nome: 'SEMI VUOTO', tipo: 'semilavorato',
          ingredienti: [{ nome: 'farina', qty1stampo: 0 }],  // peso totale=0 → skip
        },
      },
    }
    const ingCosti = buildIngCosti({ farina: { costoKg: 1, costoG: 0.001 } })
    const ricetta = {
      nome: 'X', ingredienti: [{ nome: 'SEMI VUOTO', qty1stampo: 100 }],
    }
    const { tot, righe } = calcolaFCDettaglio(ricetta, ingCosti, ricettario)
    // SEMI VUOTO ha peso 0 → nessuna riga generata
    expect(righe.length).toBe(0)
    expect(tot).toBe(0)
  })
})

describe('resetRegoleRuntime', () => {
  it('rimuove SOLO le chiavi runtime, preserva i built-in', () => {
    // Inietta una regola runtime (simula caricamento ricettario da org)
    REGOLE['ORG_X_TORTA'] = { unita: 6, prezzo: 3, tipo: 'fetta' }
    expect(REGOLE['ORG_X_TORTA']).toBeTruthy()

    resetRegoleRuntime()

    // Built-in preservata
    expect(REGOLE['TORTA DI CAROTE']).toBeTruthy()
    expect(REGOLE['COOKIES']).toBeTruthy()
    expect(REGOLE['PASTA FROLLA']).toBeTruthy()
    // Runtime rimossa
    expect(REGOLE['ORG_X_TORTA']).toBeUndefined()
  })
  it('chiamata su stato pulito è no-op (idempotente)', () => {
    const built = Object.keys(REGOLE).length
    resetRegoleRuntime()
    resetRegoleRuntime()
    expect(Object.keys(REGOLE).length).toBe(built)
  })
})
