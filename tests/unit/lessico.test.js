import { describe, it, expect } from 'vitest'
import { lessico, haLessicoDedicato } from '../../src/lib/lessico.js'

describe('lessico', () => {
  it('pasticceria/sconosciuta/null -> vocabolario generico', () => {
    for (const t of ['pasticceria', 'cioccolateria', 'panificio', 'bar', 'altro', 'xxx', null, undefined, '']) {
      const L = lessico(t)
      expect(L.prodotti).toBe('prodotti')
      expect(L.Ricettario).toBe('Ricettario')
      expect(L.nuovaRicetta).toBe('Nuova ricetta')
    }
  })

  it('gelateria -> gusti', () => {
    const L = lessico('gelateria')
    expect(L.prodotti).toBe('gusti')
    expect(L.Prodotto).toBe('Gusto')
    expect(L.Ricettario).toBe('Ricettario gusti')
    expect(L.nuovaRicetta).toBe('Nuovo gusto')
  })

  it('pizzeria -> pizze, ristorante -> piatti, pasta_fresca -> formati', () => {
    expect(lessico('pizzeria').prodotti).toBe('pizze')
    expect(lessico('ristorante').Prodotti).toBe('Piatti')
    expect(lessico('pasta_fresca').prodotti).toBe('formati')
  })

  it('case-insensitive sulla chiave', () => {
    expect(lessico('GELATERIA').prodotti).toBe('gusti')
    expect(lessico(' Gelateria ').prodotti).toBe('gusti')
  })

  it('il merge è sempre completo (nessun campo undefined)', () => {
    const L = lessico('gelateria')
    for (const k of Object.keys(lessico('pasticceria'))) {
      expect(L[k]).toBeDefined()
    }
  })

  it('haLessicoDedicato vero solo per le categorie con override', () => {
    expect(haLessicoDedicato('gelateria')).toBe(true)
    expect(haLessicoDedicato('pizzeria')).toBe(true)
    expect(haLessicoDedicato('pasticceria')).toBe(false)
    expect(haLessicoDedicato('xxx')).toBe(false)
  })
})
