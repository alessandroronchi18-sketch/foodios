import { describe, it, expect } from 'vitest'
import { timingSafeEqual, verifyBearerSecret, verifyRawSecret } from '../../api/lib/cryptoCompare.js'

const SECRET = 'un-secret-lungo-abbastanza-123' // >= 16 char

describe('timingSafeEqual', () => {
  it('uguali -> true', () => {
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true)
  })
  it('diversi (stessa lunghezza) -> false', () => {
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false)
  })
  it('lunghezze diverse -> false (senza crash)', () => {
    expect(timingSafeEqual('abc', 'abcdef')).toBe(false)
    expect(timingSafeEqual('', 'x')).toBe(false)
  })
  it('non-stringhe -> false', () => {
    expect(timingSafeEqual(null, 'x')).toBe(false)
    expect(timingSafeEqual(123, 123)).toBe(false)
  })
})

describe('verifyBearerSecret — fail-closed', () => {
  it('secret non configurato (vuoto/corto) -> ok:false', () => {
    expect(verifyBearerSecret(`Bearer ${SECRET}`, '').ok).toBe(false)
    expect(verifyBearerSecret(`Bearer ${SECRET}`, 'corto').ok).toBe(false) // < 16
    expect(verifyBearerSecret(`Bearer ${SECRET}`, undefined).reason).toBe('secret_not_configured')
  })
  it('header mancante o non Bearer -> ok:false', () => {
    expect(verifyBearerSecret('', SECRET).ok).toBe(false)
    expect(verifyBearerSecret(SECRET, SECRET).reason).toBe('no_bearer') // manca "Bearer "
  })
  it('token corretto -> ok:true, sbagliato -> ok:false', () => {
    expect(verifyBearerSecret(`Bearer ${SECRET}`, SECRET).ok).toBe(true)
    expect(verifyBearerSecret('Bearer sbagliato-ma-lungo-abbastanza', SECRET).ok).toBe(false)
  })
})

describe('verifyRawSecret — fail-closed', () => {
  it('secret non configurato -> ok:false', () => {
    expect(verifyRawSecret(SECRET, '').ok).toBe(false)
  })
  it('valore corretto -> ok:true', () => {
    expect(verifyRawSecret(SECRET, SECRET).ok).toBe(true)
    expect(verifyRawSecret('altro', SECRET).ok).toBe(false)
    expect(verifyRawSecret(null, SECRET).reason).toBe('no_value')
  })
})
