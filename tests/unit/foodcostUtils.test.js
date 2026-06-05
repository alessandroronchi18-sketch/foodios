import { describe, it, expect } from 'vitest'
import {
  normIng, translateProdottoEN, translateIngredienteEN,
  isRicettaValida, isSemilavorato, getR, REGOLE, resetRegoleRuntime,
} from '../../src/lib/foodcost.js'

describe('normIng', () => {
  it('lowercase, trim e collassa spazi', () => {
    expect(normIng('  Farina   00  ')).toBe('farina 00')
    expect(normIng('BURRO')).toBe('burro')
  })
  it('mappa plurale→singolare noti (uova→uovo)', () => {
    expect(normIng('Uova')).toBe('uovo')
  })
  it('input falsy → stringa vuota', () => {
    expect(normIng(null)).toBe('')
    expect(normIng(undefined)).toBe('')
  })
})

describe('translateProdottoEN', () => {
  it('traduce nomi EN noti', () => {
    expect(translateProdottoEN('carrot cake')).toBe('TORTA DI CAROTE')
    expect(translateProdottoEN('Apple Pie')).toBe('TORTA DI MELE')
  })
  it('nome sconosciuto → UPPERCASE', () => {
    expect(translateProdottoEN('sacher')).toBe('SACHER')
  })
  it('falsy → invariato', () => {
    expect(translateProdottoEN('')).toBe('')
    expect(translateProdottoEN(null)).toBe(null)
  })
})

describe('translateIngredienteEN', () => {
  it('ingrediente sconosciuto → invariato (NON uppercase)', () => {
    expect(translateIngredienteEN('zucchero a velo')).toBe('zucchero a velo')
  })
  it('falsy → invariato', () => {
    expect(translateIngredienteEN(null)).toBe(null)
  })
})

describe('isRicettaValida', () => {
  it('true per nomi reali', () => {
    expect(isRicettaValida('TORTA DI MELE')).toBe(true)
  })
  it('false per intestazioni/categorie skip', () => {
    for (const skip of ['totale', 'Sconto', 'CATEGORIA', 'nan', 'ricetta', 'bibite']) {
      expect(isRicettaValida(skip)).toBeFalsy()
    }
  })
  it('falsy per vuoto/null', () => {
    expect(isRicettaValida('')).toBeFalsy()
    expect(isRicettaValida(null)).toBeFalsy()
  })
})

describe('getR', () => {
  it('regola built-in da REGOLE', () => {
    expect(getR('COOKIES')).toMatchObject({ unita: 50, tipo: 'pezzo' })
  })
  it('ricetta manuale: legge unita/prezzo/tipo dall’oggetto', () => {
    expect(getR('NUOVA', { unita: 12, prezzo: 6, tipo: 'fetta' })).toMatchObject({ unita: 12, prezzo: 6 })
  })
  it('sconosciuta → default fetta 8×4', () => {
    expect(getR('XYZ')).toEqual({ unita: 8, prezzo: 4, tipo: 'fetta' })
  })
})

describe('isSemilavorato', () => {
  const ricettario = { ricette: {
    'PASTA FROLLA': { nome: 'PASTA FROLLA', tipo: 'semilavorato' },
    'TORTA DI MELE': { nome: 'TORTA DI MELE', tipo: 'fetta' },
  } }
  it('true se la ricetta è semilavorato', () => {
    expect(isSemilavorato('PASTA FROLLA', ricettario)).toBe(true)
  })
  it('false per prodotto finito / assente / senza ricettario', () => {
    expect(isSemilavorato('TORTA DI MELE', ricettario)).toBe(false)
    expect(isSemilavorato('INESISTENTE', ricettario)).toBe(false)
    expect(isSemilavorato('PASTA FROLLA', null)).toBe(false)
  })
})

describe('resetRegoleRuntime', () => {
  it('rimuove le regole runtime ma preserva quelle built-in', () => {
    REGOLE['ORG_CUSTOM_X'] = { unita: 1, prezzo: 9, tipo: 'fetta' }
    expect(REGOLE['ORG_CUSTOM_X']).toBeDefined()
    resetRegoleRuntime()
    expect(REGOLE['ORG_CUSTOM_X']).toBeUndefined()
    expect(REGOLE['COOKIES']).toBeDefined() // built-in resta
  })
})
