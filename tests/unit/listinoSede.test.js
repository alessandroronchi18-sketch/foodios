import { describe, it, expect } from 'vitest'
import {
  getRegSede, getPrezzoFormatoSede, applicaListinoAiFormati, haOverridePerRicetta,
} from '../../src/lib/listinoSede.js'

// Ricetta minima (getR fa fallback quando reg non e' presettato in REGOLE).
const RIC_FETTA = { nome: 'TORTA CIOCCOLATO', tipo: 'fetta', unita: 8, prezzo: 4, ingredienti: [] }
const RIC_GUSTO = { nome: 'PISTACCHIO', tipo: 'gusto', unita: 1, prezzo: 0, ingredienti: [], categoria: 'Gusto' }

describe('getRegSede', () => {
  it('senza listino ritorna reg base', () => {
    const r = getRegSede('TORTA CIOCCOLATO', RIC_FETTA, null)
    expect(r.prezzo).toBe(4)
    expect(r.unita).toBe(8)
    expect(r.tipo).toBe('fetta')
  })
  it('listino vuoto ritorna reg base', () => {
    expect(getRegSede('TORTA CIOCCOLATO', RIC_FETTA, {})).toMatchObject({ prezzo: 4, unita: 8 })
    expect(getRegSede('TORTA CIOCCOLATO', RIC_FETTA, { ricette: {} })).toMatchObject({ prezzo: 4, unita: 8 })
  })
  it('override prezzo E unita', () => {
    const listino = { ricette: { 'TORTA CIOCCOLATO': { prezzo: 5.5, unita: 10 } } }
    const r = getRegSede('TORTA CIOCCOLATO', RIC_FETTA, listino)
    expect(r.prezzo).toBe(5.5)
    expect(r.unita).toBe(10)
    expect(r.tipo).toBe('fetta') // tipo NON overridabile
  })
  it('override solo prezzo (unita conserva base)', () => {
    const listino = { ricette: { 'TORTA CIOCCOLATO': { prezzo: 3.5 } } }
    const r = getRegSede('TORTA CIOCCOLATO', RIC_FETTA, listino)
    expect(r.prezzo).toBe(3.5)
    expect(r.unita).toBe(8) // base
  })
  it('override solo unita (prezzo conserva base)', () => {
    const listino = { ricette: { 'TORTA CIOCCOLATO': { unita: 6 } } }
    const r = getRegSede('TORTA CIOCCOLATO', RIC_FETTA, listino)
    expect(r.unita).toBe(6)
    expect(r.prezzo).toBe(4)
  })
  it('override prezzo=0 valido (deve stare, non fallback al base)', () => {
    const listino = { ricette: { 'TORTA CIOCCOLATO': { prezzo: 0 } } }
    const r = getRegSede('TORTA CIOCCOLATO', RIC_FETTA, listino)
    expect(r.prezzo).toBe(0)
  })
  it('override con valori non-finiti (NaN/undefined) → base', () => {
    const listino = { ricette: { 'TORTA CIOCCOLATO': { prezzo: NaN, unita: undefined } } }
    const r = getRegSede('TORTA CIOCCOLATO', RIC_FETTA, listino)
    expect(r.prezzo).toBe(4)
    expect(r.unita).toBe(8)
  })
  it('ricetta senza override nel listino → base', () => {
    const listino = { ricette: { 'ALTRA': { prezzo: 99 } } }
    const r = getRegSede('TORTA CIOCCOLATO', RIC_FETTA, listino)
    expect(r.prezzo).toBe(4)
  })
})

describe('getPrezzoFormatoSede', () => {
  const F = { id: 'fmt-1', nome: 'Cono piccolo', prezzoDefault: 2.5, baseQtaG: 80 }

  it('senza listino ritorna prezzoDefault base', () => {
    expect(getPrezzoFormatoSede(F, null)).toBe(2.5)
    expect(getPrezzoFormatoSede(F, {})).toBe(2.5)
  })
  it('override prezzoDefault viene applicato', () => {
    const listino = { formati: { 'fmt-1': { prezzoDefault: 3.2 } } }
    expect(getPrezzoFormatoSede(F, listino)).toBe(3.2)
  })
  it('override prezzoDefault=0 → 0 (valido)', () => {
    const listino = { formati: { 'fmt-1': { prezzoDefault: 0 } } }
    expect(getPrezzoFormatoSede(F, listino)).toBe(0)
  })
  it('override id diverso → base', () => {
    const listino = { formati: { 'altro-id': { prezzoDefault: 99 } } }
    expect(getPrezzoFormatoSede(F, listino)).toBe(2.5)
  })
  it('formato senza id o senza prezzo → 0 (edge)', () => {
    expect(getPrezzoFormatoSede({ id: 'x' }, null)).toBe(0)
    expect(getPrezzoFormatoSede(null, null)).toBe(0)
  })
})

describe('applicaListinoAiFormati', () => {
  const formati = [
    { id: 'f1', nome: 'Cono', prezzoDefault: 2.5, baseQtaG: 80 },
    { id: 'f2', nome: 'Vaschetta', prezzoDefault: 10, baseQtaG: 500 },
  ]

  it('array vuoto o non-array → passa through', () => {
    expect(applicaListinoAiFormati([], null)).toEqual([])
    expect(applicaListinoAiFormati(undefined, null)).toEqual([])
    expect(applicaListinoAiFormati(null, null)).toEqual([])
  })
  it('senza listino ritorna copia con prezzi base', () => {
    const out = applicaListinoAiFormati(formati, null)
    expect(out.map(f => f.prezzoDefault)).toEqual([2.5, 10])
    // non muta l'originale
    expect(out).not.toBe(formati)
    expect(formati[0].prezzoDefault).toBe(2.5)
  })
  it('override sostituisce solo i formati matched', () => {
    const listino = { formati: { 'f1': { prezzoDefault: 3.2 } } }
    const out = applicaListinoAiFormati(formati, listino)
    expect(out.find(f => f.id === 'f1').prezzoDefault).toBe(3.2)
    expect(out.find(f => f.id === 'f2').prezzoDefault).toBe(10) // invariato
    // altri campi preservati
    expect(out.find(f => f.id === 'f1').baseQtaG).toBe(80)
  })
})

describe('haOverridePerRicetta', () => {
  it('false se nessuna sede ha override per quella ricetta', () => {
    const listini = {
      'sede-a': { ricette: { 'ALTRA': { prezzo: 5 } } },
      'sede-b': { ricette: {} },
    }
    expect(haOverridePerRicetta('TORTA', listini)).toBe(false)
  })
  it('true se almeno una sede ha override', () => {
    const listini = {
      'sede-a': { ricette: {} },
      'sede-b': { ricette: { 'TORTA': { prezzo: 3.5 } } },
    }
    expect(haOverridePerRicetta('TORTA', listini)).toBe(true)
  })
  it('input null/undefined → false', () => {
    expect(haOverridePerRicetta('TORTA', null)).toBe(false)
    expect(haOverridePerRicetta('TORTA', undefined)).toBe(false)
    expect(haOverridePerRicetta('TORTA', {})).toBe(false)
  })
})

describe('getRegSede — smoke gusto', () => {
  it('gusto: prezzo=0 (base) resta 0 senza override', () => {
    const r = getRegSede('PISTACCHIO', RIC_GUSTO, null)
    expect(r.prezzo).toBe(0)
    expect(r.tipo).toBe('gusto')
  })
  it('gusto: override prezzo (es. Milano 25 €/kg) applicato', () => {
    const listino = { ricette: { 'PISTACCHIO': { prezzo: 25 } } }
    const r = getRegSede('PISTACCHIO', RIC_GUSTO, listino)
    expect(r.prezzo).toBe(25)
    expect(r.tipo).toBe('gusto') // invariante
  })
})
