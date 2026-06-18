// originGuard — whitelist anti open-redirect su stripe-portal et al.
// Audit 2026-06-17 HIGH: prima mancava il check.

import { describe, it, expect } from 'vitest'
import { ALLOWED_ORIGINS, safeOrigin } from '../../api/lib/originGuard'

const FALLBACK = 'https://foodios.it'

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
    expect(safeOrigin(mkReq('https://foodios.it/', ''))).toBe('https://foodios.it')
  })

  it('estrae solo origin da URL completo con path', () => {
    expect(safeOrigin(mkReq('https://foodios.it/dashboard/x', ''))).toBe('https://foodios.it')
  })

  it('accetta sottodomini *.foodios.it', () => {
    expect(safeOrigin(mkReq('https://app.foodios.it', ''))).toBe('https://app.foodios.it')
    expect(safeOrigin(mkReq('https://admin.foodios.it', ''))).toBe('https://admin.foodios.it')
  })

  it('accetta preview Vercel foodios-* solo', () => {
    expect(safeOrigin(mkReq('https://foodios-pr123.vercel.app', '')))
      .toBe('https://foodios-pr123.vercel.app')
  })

  it('rifiuta altri *.vercel.app non foodios-*', () => {
    expect(safeOrigin(mkReq('https://attacker.vercel.app', ''))).toBe(FALLBACK)
  })

  it('rifiuta origin esterno → fallback', () => {
    expect(safeOrigin(mkReq('https://evil.com', ''))).toBe(FALLBACK)
    expect(safeOrigin(mkReq('https://google.com', ''))).toBe(FALLBACK)
  })

  it('rifiuta tentativi di spoofing (homograph, IDN)', () => {
    // foodios.it.evil.com NON deve passare (endsWith fail)
    expect(safeOrigin(mkReq('https://foodios.it.evil.com', ''))).toBe(FALLBACK)
    // evil.com/foodios.it/path NON deve passare
    expect(safeOrigin(mkReq('https://evil.com/foodios.it/path', ''))).toBe(FALLBACK)
  })

  it('headers vuoti → fallback', () => {
    expect(safeOrigin({ headers: {} })).toBe(FALLBACK)
    expect(safeOrigin({})).toBe(FALLBACK)
  })

  it('referer usato se origin manca', () => {
    expect(safeOrigin(mkReq(null, 'https://foodios.it/x'))).toBe('https://foodios.it')
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
