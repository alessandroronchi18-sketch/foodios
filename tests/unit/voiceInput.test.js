// @vitest-environment happy-dom
// useVoiceInput — parser numerico parlato + cleanup testuale.
// Funzioni pure isolate dal hook (che richiederebbe SpeechRecognition mock).

import { describe, it, expect } from 'vitest'
import { parseNumeroParlato, cleanVoiceText } from '../../src/lib/useVoiceInput.js'

describe('parseNumeroParlato', () => {
  it('riconosce digit puri', () => {
    expect(parseNumeroParlato('3')).toBe(3)
    expect(parseNumeroParlato('10.5')).toBe(10.5)
    expect(parseNumeroParlato('1,5')).toBe(1.5)
  })

  it('riconosce digit dentro frase ("aggiungi 5 kg")', () => {
    expect(parseNumeroParlato('aggiungi 5 kg di nocciola')).toBe(5)
  })

  it('riconosce parole italiane base', () => {
    expect(parseNumeroParlato('tre')).toBe(3)
    expect(parseNumeroParlato('cinque vaschette')).toBe(5)
    expect(parseNumeroParlato('dieci')).toBe(10)
  })

  it('compone decine + unità', () => {
    expect(parseNumeroParlato('venti tre kg')).toBe(23)
    expect(parseNumeroParlato('cinquanta')).toBe(50)
  })

  it('compone centinaia/migliaia (token separati)', () => {
    expect(parseNumeroParlato('cento')).toBe(100)
    expect(parseNumeroParlato('mille')).toBe(1000)
    // Composti tipo "duecento" (parola singola) non sono nel dizionario: ritorna
    // null. Va bene perché il pattern UX è "due cento" o si usa il digit "200".
    expect(parseNumeroParlato('duecento grammi')).toBeNull()
  })

  it('parser virgola decimale', () => {
    expect(parseNumeroParlato('uno virgola cinque')).toBeCloseTo(1.5)
    expect(parseNumeroParlato('due punto due')).toBeCloseTo(2.2)
  })

  it('ritorna null su input vuoto o non numerico', () => {
    expect(parseNumeroParlato('')).toBeNull()
    expect(parseNumeroParlato(null)).toBeNull()
    expect(parseNumeroParlato('ciao mondo')).toBeNull()
  })

  it('è case-insensitive', () => {
    expect(parseNumeroParlato('TRE')).toBe(3)
    expect(parseNumeroParlato('Tre KG')).toBe(3)
  })
})

describe('cleanVoiceText', () => {
  it('rimuove punteggiatura finale', () => {
    expect(cleanVoiceText('nocciola piemonte.')).toBe('Nocciola piemonte')
    expect(cleanVoiceText('latte fresco,')).toBe('Latte fresco')
  })

  it('capitalizza la prima lettera', () => {
    expect(cleanVoiceText('cioccolato fondente')).toBe('Cioccolato fondente')
  })

  it('gestisce stringhe vuote', () => {
    expect(cleanVoiceText('')).toBe('')
    expect(cleanVoiceText(null)).toBe('')
  })

  it('trim spazi esterni', () => {
    expect(cleanVoiceText('  vaniglia  ')).toBe('Vaniglia')
  })
})
