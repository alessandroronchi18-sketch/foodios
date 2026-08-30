// originGuard — whitelist anti open-redirect su stripe-portal et al.
// Audit 2026-06-17 HIGH: prima mancava il check.

import { describe, it, expect } from 'vitest'
import { ALLOWED_ORIGINS, safeOrigin } from '../../api/lib/originGuard'

const FALLBACK = 'https://foodos.it'

function mkReq(origin, referer) {
  return { headers: { origin, referer } }
}

describe('safeOrigin', () => {
  it('accetta origin in ALLOWED_ORIGINS', () => {
    for (const o of ALLOWED_ORIGINS) {
      expect(safeOrigin(mkReq(o, ''))).toBe(o)
    }
  })

  it('strip trailing slash', () => {
    expect(safeOrigin(mkReq('https://foodos.it/', ''))).toBe('https://foodos.it')
  })

  it('estrae solo origin da URL completo con path', () => {
    expect(safeOrigin(mkReq('https://foodos.it/dashboard/x', ''))).toBe('https://foodos.it')
  })

  it('accetta sottodomini *.foodos.it', () => {
    expect(safeOrigin(mkReq('https://app.foodos.it', ''))).toBe('https://app.foodos.it')
    expect(safeOrigin(mkReq('https://admin.foodos.it', ''))).toBe('https://admin.foodos.it')
  })

  it('accetta preview Vercel foodos-* solo', () => {
    expect(safeOrigin(mkReq('https://foodos-pr123.vercel.app', '')))
      .toBe('https://foodos-pr123.vercel.app')
  })

  it('rifiuta altri *.vercel.app non foodos-*', () => {
    expect(safeOrigin(mkReq('https://attacker.vercel.app', ''))).toBe(FALLBACK)
  })

  it('rifiuta origin esterno → fallback', () => {
    expect(safeOrigin(mkReq('https://evil.com', ''))).toBe(FALLBACK)
    expect(safeOrigin(mkReq('https://google.com', ''))).toBe(FALLBACK)
  })

  it('rifiuta tentativi di spoofing (homograph, IDN)', () => {
    // foodos.it.evil.com NON deve passare (endsWith fail)
    expect(safeOrigin(mkReq('https://foodos.it.evil.com', ''))).toBe(FALLBACK)
    // evil.com/foodos.it/path NON deve passare
    expect(safeOrigin(mkReq('https://evil.com/foodos.it/path', ''))).toBe(FALLBACK)
  })

  it('headers vuoti → fallback', () => {
    expect(safeOrigin({ headers: {} })).toBe(FALLBACK)
    expect(safeOrigin({})).toBe(FALLBACK)
  })

  it('referer usato se origin manca', () => {
    expect(safeOrigin(mkReq(null, 'https://foodos.it/x'))).toBe('https://foodos.it')
  })

  it('fallback custom passato come 2o arg', () => {
    expect(safeOrigin(mkReq('https://evil.com', ''), 'https://custom.io'))
      .toBe('https://custom.io')
  })

  it('URL non valido → fallback (catch interno)', () => {
    expect(safeOrigin(mkReq('not-a-url', ''))).toBe(FALLBACK)
    expect(safeOrigin(mkReq('javascript:alert(1)', ''))).toBe(FALLBACK)
  })
})
