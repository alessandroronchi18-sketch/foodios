import { describe, it, expect } from 'vitest'
// fmtPrezzo è un export nominale puro di usePlanPricing.js (il default export è
// l'hook React, che NON tocchiamo). usePlanPricing importa React, disponibile
// come dipendenza, quindi l'import in ambiente 'node' è innocuo.
import { fmtPrezzo } from '../../src/lib/usePlanPricing.js'

describe('fmtPrezzo', () => {
  it('intero → senza decimali', () => {
    expect(fmtPrezzo(89)).toBe('89')
    expect(fmtPrezzo(149)).toBe('149')
  })
  it('non intero → 2 decimali con virgola IT', () => {
    expect(fmtPrezzo(89.5)).toBe('89,50')
    expect(fmtPrezzo(12.34)).toBe('12,34')
  })
  it('arrotonda a 2 decimali (un non-intero resta in forma decimale)', () => {
    // 9.999 non è intero → ramo toFixed(2) = "10.00" → "10,00" (NON collassa a "10")
    expect(fmtPrezzo(9.999)).toBe('10,00')
    expect(fmtPrezzo(2.005)).toMatch(/^2,0[01]$/) // floating point
  })
  it('accetta stringhe numeriche', () => {
    expect(fmtPrezzo('89')).toBe('89')
    expect(fmtPrezzo('89.5')).toBe('89,50')
  })
  it('non numerico → stringa vuota', () => {
    expect(fmtPrezzo(NaN)).toBe('')
    expect(fmtPrezzo(undefined)).toBe('') // Number(undefined) === NaN
    expect(fmtPrezzo('abc')).toBe('')
  })
  it('zero → "0"', () => {
    expect(fmtPrezzo(0)).toBe('0')
  })
  it('null → "0" (Number(null) === 0, coerente col caso zero)', () => {
    // Documenta il comportamento reale: null è coercizzato a 0, non a NaN.
    expect(fmtPrezzo(null)).toBe('0')
  })
})
