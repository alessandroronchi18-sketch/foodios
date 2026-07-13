import { describe, it, expect } from 'vitest'
import {
  normIng, translateProdottoEN, translateIngredienteEN,
  isRicettaValida, isSemilavorato, getR, REGOLE, resetRegoleRuntime,
  mergeIngredientiPerNorm,
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

describe('mergeIngredientiPerNorm', () => {
  it('accorpa tuorlo + tuorli sommando quantita', () => {
    const out = mergeIngredientiPerNorm([
      { nome: 'tuorlo', quantita: 40 },
      { nome: 'tuorli', quantita: 20 },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].quantita).toBe(60)
    expect(out[0].nome).toBe('tuorlo') // preferisce la forma canonica singolare
  })
  it('accorpa Uova + uovo case-insensitive', () => {
    const out = mergeIngredientiPerNorm([
      { nome: 'Uova', quantita: 100 },
      { nome: 'uovo', quantita: 55 },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].quantita).toBe(155)
  })
  it('mantiene ingredienti distinti senza aggregare', () => {
    const out = mergeIngredientiPerNorm([
      { nome: 'burro', quantita: 100 },
      { nome: 'zucchero', quantita: 80 },
    ])
    expect(out).toHaveLength(2)
  })
  it('supporta qtyField alternativo (qty1stampo)', () => {
    const out = mergeIngredientiPerNorm([
      { nome: 'mandorle', qty1stampo: 50, costoPerG: 0 },
      { nome: 'mandorla', qty1stampo: 30, costoPerG: 0 },
    ], { qtyField: 'qty1stampo' })
    expect(out).toHaveLength(1)
    expect(out[0].qty1stampo).toBe(80)
  })
  it('salta ingredienti con nome vuoto', () => {
    const out = mergeIngredientiPerNorm([
      { nome: '', quantita: 5 },
      { nome: '  ', quantita: 3 },
      { nome: 'burro', quantita: 100 },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].nome).toBe('burro')
  })
  it('input non-array → array vuoto', () => {
    expect(mergeIngredientiPerNorm(null)).toEqual([])
    expect(mergeIngredientiPerNorm(undefined)).toEqual([])
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
