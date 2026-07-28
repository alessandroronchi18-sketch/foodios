import { describe, it, expect } from 'vitest'
import {
  labelPlurale, labelSingolare, isGustoTipo, isSemiOInterno, descrizioneUnita,
} from '../../src/lib/tipoRicetta.js'

describe('labelPlurale', () => {
  it('mappa i tipi noti', () => {
    expect(labelPlurale('fetta')).toBe('fette')
    expect(labelPlurale('pezzo')).toBe('pezzi')
    expect(labelPlurale('gusto')).toBe('kg')
  })
  it('default (tipo sconosciuto o vuoto) → "pezzi"', () => {
    expect(labelPlurale(undefined)).toBe('pezzi')
    expect(labelPlurale('')).toBe('pezzi')
    expect(labelPlurale('sconosciuto')).toBe('pezzi')
    expect(labelPlurale('semilavorato')).toBe('pezzi') // ricadono nel default
  })
})

describe('labelSingolare', () => {
  it('mappa i tipi noti al singolare', () => {
    expect(labelSingolare('fetta')).toBe('fetta')
    expect(labelSingolare('pezzo')).toBe('pezzo')
    expect(labelSingolare('gusto')).toBe('kg')
  })
  it('default → "pezzo"', () => {
    expect(labelSingolare(undefined)).toBe('pezzo')
    expect(labelSingolare('interno')).toBe('pezzo')
  })
})

describe('isGustoTipo', () => {
  it('true solo per "gusto"', () => {
    expect(isGustoTipo('gusto')).toBe(true)
    expect(isGustoTipo('fetta')).toBe(false)
    expect(isGustoTipo('pezzo')).toBe(false)
    expect(isGustoTipo('semilavorato')).toBe(false)
    expect(isGustoTipo(undefined)).toBe(false)
    expect(isGustoTipo(null)).toBe(false)
    expect(isGustoTipo('Gusto')).toBe(false) // case-sensitive: il modello usa slug lowercase
  })
})

describe('isSemiOInterno', () => {
  it('true per semilavorato e interno', () => {
    expect(isSemiOInterno('semilavorato')).toBe(true)
    expect(isSemiOInterno('interno')).toBe(true)
  })
  it('false per output finiti venduti', () => {
    expect(isSemiOInterno('fetta')).toBe(false)
    expect(isSemiOInterno('pezzo')).toBe(false)
    expect(isSemiOInterno('gusto')).toBe(false)
    expect(isSemiOInterno(undefined)).toBe(false)
  })
})

describe('descrizioneUnita', () => {
  it('etichetta tooltip in base al tipo', () => {
    expect(descrizioneUnita('fetta')).toBe('fette per stampo')
    expect(descrizioneUnita('gusto')).toBe('kg per batch (gusto gelateria)')
    expect(descrizioneUnita('pezzo')).toBe('unità')
    expect(descrizioneUnita(undefined)).toBe('unità')
    expect(descrizioneUnita('sconosciuto')).toBe('unità')
  })
})
