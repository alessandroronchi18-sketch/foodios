// Indovinare il mese dal nome del file.
//
// Serve a non chiedere all'utente «di che mese sono questi dati», domanda a
// cui spesso risponde sbagliato: quando sbaglia, tutte le righe finiscono in
// un mese che non esiste e l'import va buttato.

import { describe, it, expect } from 'vitest'
import { guessMonthIsoFromFilename } from '../../src/lib/importDateGuess'

describe('guessMonthIsoFromFilename', () => {
  it('legge i nomi come li scrivono davvero i clienti', () => {
    expect(guessMonthIsoFromFilename('FOGLIO PRODUZIONE MAGGIO 2026.xlsx')).toBe('2026-05')
    expect(guessMonthIsoFromFilename('produzione_giugno_2026.xlsx')).toBe('2026-06')
    expect(guessMonthIsoFromFilename('Inventario-Dicembre-2025.csv')).toBe('2025-12')
    expect(guessMonthIsoFromFilename('2026 gennaio chiusure.xlsx')).toBe('2026-01')
  })

  it('conosce tutti e dodici i mesi', () => {
    const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
      'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
    mesi.forEach((m, i) => {
      const atteso = `2026-${String(i + 1).padStart(2, '0')}`
      expect(guessMonthIsoFromFilename(`file ${m} 2026.xlsx`), m).toBe(atteso)
    })
  })

  it('non si fa ingannare dalle maiuscole', () => {
    expect(guessMonthIsoFromFilename('SETTEMBRE2026.XLSX')).toBe('2026-09')
    expect(guessMonthIsoFromFilename('Settembre2026.xlsx')).toBe('2026-09')
  })

  it('senza mese o senza anno preferisce non rispondere', () => {
    // Meglio chiedere all'utente che indovinare male: un mese sbagliato
    // porta centinaia di righe nel posto sbagliato.
    expect(guessMonthIsoFromFilename('produzione.xlsx')).toBe(null)
    expect(guessMonthIsoFromFilename('maggio.xlsx')).toBe(null)
    expect(guessMonthIsoFromFilename('2026.xlsx')).toBe(null)
    expect(guessMonthIsoFromFilename('no month here.xlsx')).toBe(null)
  })

  it('accetta solo anni 20xx', () => {
    expect(guessMonthIsoFromFilename('maggio 1999.xlsx')).toBe(null)
    expect(guessMonthIsoFromFilename('maggio 2099.xlsx')).toBe('2099-05')
  })

  it('con due mesi nel nome prende il primo dell\'anno', () => {
    // «produzione maggio-giugno 2026»: la scelta è arbitraria ma dev'essere
    // stabile, non dipendere dall'ordine delle chiavi.
    expect(guessMonthIsoFromFilename('produzione maggio-giugno 2026.xlsx')).toBe('2026-05')
    expect(guessMonthIsoFromFilename('produzione giugno-maggio 2026.xlsx')).toBe('2026-05')
  })

  it('regge input non validi senza esplodere', () => {
    for (const v of [null, undefined, '', 42, {}, []]) {
      expect(guessMonthIsoFromFilename(v)).toBe(null)
    }
  })
})
