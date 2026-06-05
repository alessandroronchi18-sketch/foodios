import { describe, it, expect } from 'vitest'
import {
  sanitize, sanitizeStrict, validateEmail, validateUUID, validateAmount, validateUrl,
} from '../../api/lib/validate.js'

describe('sanitize', () => {
  it('rimuove <script>, javascript: e handler onX=', () => {
    expect(sanitize('<script>alert(1)</script>ciao')).toBe('ciao')
    expect(sanitize('javascript:alert(1)')).not.toContain('javascript:')
    expect(sanitize('<img onerror=alert(1)>')).not.toMatch(/onerror\s*=/i)
  })
  it('taglia a maxLen e trimma; non-stringa -> stringa vuota', () => {
    expect(sanitize('  spazi  ')).toBe('spazi')
    expect(sanitize('abcdef', 3)).toBe('abc')
    expect(sanitize(123)).toBe('')
    expect(sanitize(null)).toBe('')
  })
})

describe('validateEmail', () => {
  it('accetta email valide', () => {
    expect(validateEmail('a@b.it')).toBe(true)
    expect(validateEmail('mario.rossi@foodios.it')).toBe(true)
  })
  it('rifiuta non valide', () => {
    for (const e of ['', 'a@b', 'a b@c.it', 'no-at.it', '@b.it', 123, null]) {
      expect(validateEmail(e)).toBe(false)
    }
  })
})

describe('validateUUID', () => {
  it('accetta UUID v4, rifiuta il resto', () => {
    expect(validateUUID('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true)
    expect(validateUUID('not-a-uuid')).toBe(false)
    expect(validateUUID('')).toBe(false)
  })
})

describe('validateAmount', () => {
  it('accetta >=0 e < 1.000.000', () => {
    expect(validateAmount(0)).toBe(true)
    expect(validateAmount('89.00')).toBe(true)
    expect(validateAmount(-1)).toBe(false)
    expect(validateAmount(1_000_000)).toBe(false)
    expect(validateAmount('abc')).toBe(false)
  })
})

describe('validateUrl', () => {
  it('solo http/https', () => {
    expect(validateUrl('https://foodios.it')).toBe(true)
    expect(validateUrl('http://x.it')).toBe(true)
  })
  it('rifiuta schemi pericolosi e input invalidi', () => {
    for (const u of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc', '', 'non-un-url', null]) {
      expect(validateUrl(u)).toBe(false)
    }
  })
})

describe('sanitizeStrict', () => {
  it('rimuove caratteri di controllo e normalizza spazi', () => {
    // i caratteri di controllo (incluso \t) vengono RIMOSSI, poi gli spazi collassati
    expect(sanitizeStrict('a\x00b\tc   d')).toBe('abc d')
    expect(sanitizeStrict('ciao    mondo')).toBe('ciao mondo')
  })
})
