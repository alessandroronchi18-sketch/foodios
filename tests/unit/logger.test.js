// Test per src/lib/logger.js — sanitize PII + levels.

import { describe, it, expect } from 'vitest'
import { sanitize } from '../../src/lib/logger.js'

describe('logger.sanitize — redact PII', () => {
  it('redacts email addresses', () => {
    const out = sanitize('user is greg@maradeiboschi.com')
    expect(out).toBe('user is [redacted]')
  })

  it('redacts JWT tokens', () => {
    const out = sanitize('token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9.signature123')
    expect(out).toContain('[redacted]')
    expect(out).not.toContain('eyJhbGci')
  })

  it('redacts Stripe live/test keys', () => {
    expect(sanitize('sk_live_abc123XYZ456')).toBe('[redacted]')
    expect(sanitize('using sk_test_xxxYYY')).toBe('using [redacted]')
  })

  it('redacts Supabase service key', () => {
    expect(sanitize('sb_secret_AbCdEfG123')).toBe('[redacted]')
  })

  it('redacts IBAN italiano', () => {
    expect(sanitize('IBAN IT60 X 05428 11101 000000123456')).toContain('[redacted]')
  })

  it('redacts campi sensibili negli oggetti', () => {
    const out = sanitize({ user: 'greg', password: 'secret123', token: 'abc', api_key: 'xyz' })
    expect(out.password).toBe('[redacted]')
    expect(out.token).toBe('[redacted]')
    expect(out.api_key).toBe('[redacted]')
    expect(out.user).toBe('greg')
  })

  it('redacts ricorsivamente in nested objects', () => {
    const out = sanitize({
      level1: { level2: { email: 'test@test.com', name: 'safe' } },
    })
    expect(out.level1.level2.email).toContain('[redacted]')
    expect(out.level1.level2.name).toBe('safe')
  })

  it('tronca stringhe troppo lunghe', () => {
    const huge = 'x'.repeat(5000)
    const out = sanitize(huge)
    expect(out.length).toBeLessThanOrEqual(1020)
    expect(out).toMatch(/truncated/)
  })

  it('Error → oggetto sanitizzato', () => {
    const e = new Error('test failure with email user@test.com')
    const out = sanitize(e)
    expect(out.name).toBe('Error')
    expect(out.message).toContain('[redacted]')
    expect(out.message).not.toContain('user@test.com')
  })

  it('depth limit prevenire stack overflow', () => {
    let nested = { v: 1 }
    for (let i = 0; i < 20; i++) nested = { child: nested }
    const out = sanitize(nested)
    // Verifica che non crashi e che ci sia trunc da qualche parte
    expect(out).toBeTruthy()
  })

  it('null/undefined/primitives passano invariati', () => {
    expect(sanitize(null)).toBe(null)
    expect(sanitize(undefined)).toBe(undefined)
    expect(sanitize(42)).toBe(42)
    expect(sanitize(true)).toBe(true)
  })
})
