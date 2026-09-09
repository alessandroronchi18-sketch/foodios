// Le righe di dettaglio devono sommare al totale mostrato.
//
// Sembra ovvio, e per mesi non era vero. Il totale veniva da calcolaFC (che
// risolve i semilavorati per ricorsione e applica le rese), mentre la tabella
// di Nuova Ricetta calcolava ogni riga da se' con `ingCosti[nome] * grammi`.
// Due conti diversi sulla stessa ricetta:
//
//   - "PASTA FROLLA" dentro "CROSTATA" non sta in ingCosti, quindi la riga
//     diceva 0,00 € con il badge "prezzo mancante" mentre il totale la contava
//   - se l'utente inseriva un euro/kg per la frolla, calcolaFC lo ignorava
//     (controlla i semilavorati PRIMA del listino): azione inutile
//   - la resa (banana al 65%, impostabile da Impostazioni) alzava il costo nel
//     totale e non nella riga
//
// Ora entrambi passano da costoRigaIngrediente / calcolaFC e questo test tiene
// insieme le due strade: se qualcuno ne cambia una sola, qui si rompe.

import { describe, it, expect, beforeEach } from 'vitest'
import { buildIngCosti, calcolaFC, calcolaFCDettaglio, costoRigaIngrediente } from '../../src/lib/foodcost.js'
import { setResaIngrediente, resetRese } from '../../src/lib/rese.js'

const ricettario = {
  ricette: {
    'PASTA FROLLA': {
      nome: 'PASTA FROLLA', tipo: 'semilavorato',
      ingredienti: [{ nome: 'farina', qty1stampo: 500 }, { nome: 'burro', qty1stampo: 250 }],
    },
    'SEMI VUOTO': { nome: 'SEMI VUOTO', tipo: 'semilavorato', ingredienti: [] },
  },
  ingredienti_costi: {
    farina: { costoKg: 0.9, costoG: 0.0009 },
    burro: { costoKg: 7.2, costoG: 0.0072 },
    banana: { costoKg: 1.8, costoG: 0.0018 },
  },
}

const ingCosti = buildIngCosti(ricettario.ingredienti_costi)

const sommaRighe = (ricetta) => (ricetta.ingredienti || [])
  .map(i => costoRigaIngrediente(i, ingCosti, ricettario).costo)
  .reduce((a, b) => a + b, 0)

beforeEach(() => resetRese())

describe('costoRigaIngrediente — le righe tornano col totale', () => {
  it('con un semilavorato tra gli ingredienti', () => {
    const ricetta = { nome: 'CROSTATA', tipo: 'fetta', ingredienti: [
      { nome: 'PASTA FROLLA', qty1stampo: 400 },
      { nome: 'farina', qty1stampo: 50 },
    ]}
    const { tot } = calcolaFC(ricetta, ingCosti, ricettario)
    expect(sommaRighe(ricetta)).toBeCloseTo(tot, 2)
    // E la riga del semilavorato ha un costo vero, non zero.
    const r = costoRigaIngrediente(ricetta.ingredienti[0], ingCosti, ricettario)
    expect(r.isSemilavorato).toBe(true)
    expect(r.mancante).toBe(false)
    expect(r.costo).toBeGreaterThan(0)
  })

  it('con una resa impostata sull ingrediente', () => {
    setResaIngrediente('banana', 0.65)
    const ricetta = { nome: 'BANANA CAKE', tipo: 'fetta', ingredienti: [
      { nome: 'banana', qty1stampo: 300 },
      { nome: 'farina', qty1stampo: 200 },
    ]}
    const { tot } = calcolaFC(ricetta, ingCosti, ricettario)
    expect(sommaRighe(ricetta)).toBeCloseTo(tot, 2)
    // 300 g lordi al 65% di resa costano piu' di 300 × 0,0018.
    const r = costoRigaIngrediente(ricetta.ingredienti[0], ingCosti, ricettario)
    expect(r.costo).toBeGreaterThan(300 * 0.0018)
  })

  it('con ingredienti senza prezzo e a zero grammi', () => {
    const ricetta = { nome: 'MISTA', tipo: 'fetta', ingredienti: [
      { nome: 'farina', qty1stampo: 200 },
      { nome: 'polvere di stelle', qty1stampo: 10 },   // non esiste in nessun listino
      { nome: 'scorza arancia', qty1stampo: 0 },       // legittimo: si mette a occhio
    ]}
    const { tot, mancanti } = calcolaFC(ricetta, ingCosti, ricettario)
    expect(sommaRighe(ricetta)).toBeCloseTo(tot, 2)
    expect(mancanti).toContain('polvere di stelle')

    const senzaPrezzo = costoRigaIngrediente(ricetta.ingredienti[1], ingCosti, ricettario)
    expect(senzaPrezzo.mancante).toBe(true)
    expect(senzaPrezzo.motivo).toBe('prezzo mancante')

    // A 0 g non e' un errore, ma va detto che non conta nel food cost.
    const aZero = costoRigaIngrediente(ricetta.ingredienti[2], ingCosti, ricettario)
    expect(aZero.mancante).toBe(false)
    expect(aZero.costo).toBe(0)
    expect(aZero.motivo).toMatch(/non entra nel food cost/)
  })

  it('un prezzo stimato HoReCa e dichiarato come stima', () => {
    // "mascarpone" non e' nel listino di questa azienda ma sta in PREZZI_HORECA.
    const r = costoRigaIngrediente({ nome: 'mascarpone', qty1stampo: 250 }, ingCosti, ricettario)
    expect(r.mancante).toBe(false)
    expect(r.isStima).toBe(true)
    expect(r.motivo).toMatch(/non il tuo/)
    // Il prezzo del listino dell'azienda invece non e' una stima.
    expect(costoRigaIngrediente({ nome: 'burro', qty1stampo: 250 }, ingCosti, ricettario).isStima).toBe(false)
  })

  it('calcolaFCDettaglio e la riga danno lo stesso numero', () => {
    setResaIngrediente('banana', 0.65)
    const ricetta = { nome: 'TUTTO', tipo: 'fetta', ingredienti: [
      { nome: 'PASTA FROLLA', qty1stampo: 400 },
      { nome: 'banana', qty1stampo: 300 },
      { nome: 'mascarpone', qty1stampo: 100 },
      { nome: 'SEMI VUOTO', qty1stampo: 80 },
      { nome: 'polvere di stelle', qty1stampo: 10 },
    ]}
    const { righe } = calcolaFCDettaglio(ricetta, ingCosti, ricettario)
    for (const ing of ricetta.ingredienti) {
      const riga = righe.find(r => r.nome === ing.nome)
      expect(riga, `manca la riga di ${ing.nome}`).toBeTruthy()
      expect(riga.costo).toBeCloseTo(costoRigaIngrediente(ing, ingCosti, ricettario).costo, 3)
    }
    // Nessuna riga sparisce, nemmeno il semilavorato senza ingredienti.
    expect(righe.length).toBe(ricetta.ingredienti.length)
  })
})
