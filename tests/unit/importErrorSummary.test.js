// Il riassunto degli errori di un import.
//
// Quando un file di 1.700 righe non passa la validazione, il problema quasi
// sempre è UNO solo ripetuto 1.700 volte. Questo riassunto lo dice in una
// frase, invece di far scorrere 1.700 righe rosse a un pasticcere.

import { describe, it, expect } from 'vitest'
import { summarizeErrors } from '../../src/lib/importErrorSummary'

const riga = (...errors) => ({ row_index: 0, errors, row_data: {} })

describe('summarizeErrors — quando non deve dire niente', () => {
  it('nessun errore, nessun riassunto', () => {
    expect(summarizeErrors([])).toBe(null)
    expect(summarizeErrors(null)).toBe(null)
    expect(summarizeErrors(undefined)).toBe(null)
    expect(summarizeErrors('non un array')).toBe(null)
  })

  it('errori tutti diversi: meglio tacere che indovinare', () => {
    // Sotto il 50% di una sola categoria non c'è un «problema principale»:
    // un riassunto sbagliato manda l'utente a correggere la cosa sbagliata.
    const r = summarizeErrors([
      riga('data non valida'),
      riga('sede_id non trovato'),
      riga('quantita: non e\' un numero valido'),
      riga('campo obbligatorio vuoto'),
    ])
    expect(r).toBe(null)
  })

  it('errori che non riconosce: nessun riassunto', () => {
    expect(summarizeErrors([riga('qualcosa di strano'), riga('altro ancora')])).toBe(null)
  })

  it('righe senza campo errors non fanno esplodere niente', () => {
    expect(() => summarizeErrors([{ row_index: 1 }, { row_index: 2, errors: null }])).not.toThrow()
  })
})

describe('summarizeErrors — i cinque casi che riconosce', () => {
  const casi = [
    ['mese non capito',  ['data "null-05-12" non valida'], /di che mese/i,          /ANNO-MESE/],
    ['sedi diverse',     ['sede_id "BERTHOLLET" non trovato'], /nomi delle sedi/i,  /Impostazioni/],
    ['date illeggibili', ['data non valida'], /date non sono/i,                     /GG\/MM\/AAAA/],
    ['numeri con testo', ['produzione_g: non e\' un numero valido'], /come numeri/i, /Rimuovi il testo/],
    ['campi vuoti',      ['gusto_nome: campo obbligatorio vuoto'], /Mancano dati/i, /passo precedente/],
  ]

  for (const [nome, errori, titolo, suggerimento] of casi) {
    it(`riconosce: ${nome}`, () => {
      const r = summarizeErrors(Array.from({ length: 10 }, () => riga(...errori)))
      expect(r, nome).not.toBe(null)
      expect(r.title, nome).toMatch(titolo)
      expect(r.hint, nome).toMatch(suggerimento)
    })
  }

  it('basta la maggioranza, non serve l\'unanimità', () => {
    const righe = [
      ...Array.from({ length: 6 }, () => riga('data "null-05-12" non valida')),
      riga('qualcosa d\'altro'), riga('e un altro ancora'),
      riga('boh'), riga('mah'),
    ]
    expect(summarizeErrors(righe).title).toMatch(/di che mese/i)
  })

  it('esattamente metà basta (la soglia è inclusiva)', () => {
    const righe = [
      ...Array.from({ length: 5 }, () => riga('sede_id "X" non trovato')),
      ...Array.from({ length: 5 }, () => riga('boh')),
    ]
    expect(summarizeErrors(righe).title).toMatch(/nomi delle sedi/i)
  })
})

describe('summarizeErrors — come parla', () => {
  it('ogni messaggio è in italiano, senza nomi di colonne del database', () => {
    const tutti = [
      ['data "null-05-12" non valida'],
      ['sede_id "X" non trovato'],
      ['data non valida'],
      ['produzione_g: non e\' un numero valido'],
      ['gusto_nome: campo obbligatorio vuoto'],
    ]
    for (const errori of tutti) {
      const r = summarizeErrors(Array.from({ length: 4 }, () => riga(...errori)))
      expect(r.title).not.toMatch(/_id|_g\b|null-|undefined/)
      expect(r.title.length).toBeGreaterThan(15)
      expect(r.hint.length).toBeGreaterThan(30)
    }
  })

  it('non contiene gergo inglese', () => {
    const r = summarizeErrors(Array.from({ length: 4 }, () => riga('data non valida')))
    expect(`${r.title} ${r.hint}`.toLowerCase()).not.toMatch(/\b(error|invalid|parse|row|field|required)\b/)
  })
})
