import { describe, it, expect } from 'vitest'
import { sanitizeString, sanitizeNumber, sanitizeEmail, sanitizeObject } from '../../src/lib/sanitize.js'

describe('sanitizeString', () => {
  it('rimuove tag <script>…</script>', () => {
    expect(sanitizeString('ciao<script>alert(1)</script>mondo')).toBe('ciaomondo')
  })
  it('neutralizza javascript: e data:text/html', () => {
    expect(sanitizeString('javascript:alert(1)')).toBe('alert(1)')
    expect(sanitizeString('data:text/html,<x>')).toContain('<x>')
    expect(sanitizeString('data:text/html,foo')).not.toContain('data:text/html')
  })
  it('rimuove handler inline onX=', () => {
    expect(sanitizeString('<img src=x onerror=alert(1)>')).not.toContain('onerror=')
  })
  it('rispetta maxLen e fa trim', () => {
    expect(sanitizeString('  abc  ')).toBe('abc')
    expect(sanitizeString('abcdef', 3)).toBe('abc')
  })
  it('input non-stringa → stringa vuota', () => {
    expect(sanitizeString(null)).toBe('')
    expect(sanitizeString(42)).toBe('')
    expect(sanitizeString(undefined)).toBe('')
  })
})

describe('sanitizeNumber', () => {
  it('clampa tra min e max', () => {
    expect(sanitizeNumber('5', 0, 10)).toBe(5)
    expect(sanitizeNumber('-3', 0, 10)).toBe(0)
    expect(sanitizeNumber('99', 0, 10)).toBe(10)
  })
  it('NaN/Infinity → min', () => {
    expect(sanitizeNumber('abc', 2)).toBe(2)
    expect(sanitizeNumber(Infinity, 1)).toBe(1)
    expect(sanitizeNumber('', 7)).toBe(7)
  })
  it('parsa decimali e numeri', () => {
    expect(sanitizeNumber('3.14')).toBeCloseTo(3.14)
    expect(sanitizeNumber(12.5, 0, 100)).toBe(12.5)
  })
})

describe('sanitizeEmail', () => {
  it('normalizza e valida email corrette', () => {
    expect(sanitizeEmail('  Mario.Rossi@Example.COM ')).toBe('mario.rossi@example.com')
  })
  it('rifiuta email malformate → stringa vuota', () => {
    expect(sanitizeEmail('not-an-email')).toBe('')
    expect(sanitizeEmail('a@b')).toBe('')
    expect(sanitizeEmail('a @b.com')).toBe('')
    expect(sanitizeEmail(123)).toBe('')
  })
})

describe('sanitizeObject', () => {
  it('applica lo schema di validator a ogni chiave', () => {
    const schema = {
      nome: v => sanitizeString(v, 10),
      qta: v => sanitizeNumber(v, 0, 100),
      email: v => sanitizeEmail(v),
    }
    const out = sanitizeObject({ nome: '<script>x</script>Bob', qta: '500', email: 'X@Y.IT', extra: 'ignorato' }, schema)
    expect(out).toEqual({ nome: 'Bob', qta: 100, email: 'x@y.it' })
    expect(out).not.toHaveProperty('extra')
  })
  it('gestisce input null/undefined senza crash', () => {
    const out = sanitizeObject(null, { a: v => sanitizeNumber(v, 1) })
    expect(out).toEqual({ a: 1 })
  })
})
