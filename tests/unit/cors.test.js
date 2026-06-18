// cors — helpers CORS + getClientIP.
// Audit 2026-06-17 MEDIUM: getClientIP usa l'ULTIMO IP di x-forwarded-for
// (settato da edge Vercel, attendibile) invece del primo (spoofable).

import { describe, it, expect } from 'vitest'
import { getCorsHeaders, handleOptions, json, getClientIP } from '../../api/lib/cors.js'

// Helper per costruire request "Vercel-style" con headers come oggetto plain.
function mkReq(headers = {}) {
  return { headers }
}

// Helper per request "Fetch API style" con headers.get(...).
function mkFetchReq(headers = {}) {
  return {
    headers: {
      get: (name) => headers[name] ?? headers[name.toLowerCase()] ?? null,
    },
  }
}

describe('getCorsHeaders', () => {
  it('include Allow-Methods/Headers/Max-Age/Vary di base', () => {
    const h = getCorsHeaders(mkReq({ origin: 'https://foodios.it' }))
    expect(h['Access-Control-Allow-Methods']).toContain('GET')
    expect(h['Access-Control-Allow-Methods']).toContain('POST')
    expect(h['Access-Control-Allow-Methods']).toContain('OPTIONS')
    expect(h['Access-Control-Allow-Headers']).toContain('Content-Type')
    expect(h['Access-Control-Allow-Headers']).toContain('Authorization')
    expect(h['Access-Control-Allow-Headers']).toContain('x-organization-id')
    expect(h['Access-Control-Max-Age']).toBe('86400')
    expect(h['Vary']).toBe('Origin')
  })

  it('NON include header server-to-server in Allow-Headers (audit 2026-06-17 LOW)', () => {
    const h = getCorsHeaders(mkReq({ origin: 'https://foodios.it' }))
    expect(h['Access-Control-Allow-Headers']).not.toContain('x-internal-secret')
    expect(h['Access-Control-Allow-Headers']).not.toContain('x-zucchetti-secret')
  })

  it('origin whitelisted → setta Allow-Origin', () => {
    for (const o of ['https://foodios.it', 'https://www.foodios.it', 'https://foodios-rose.vercel.app', 'http://localhost:5173', 'http://localhost:3000']) {
      const h = getCorsHeaders(mkReq({ origin: o }))
      expect(h['Access-Control-Allow-Origin']).toBe(o)
    }
  })

  it('origin non whitelisted → NON setta Allow-Origin (browser blocca)', () => {
    const h = getCorsHeaders(mkReq({ origin: 'https://attacker.com' }))
    expect(h['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('origin pattern preview Vercel foodios-*-team accettato', () => {
    const origin = 'https://foodios-abc123-alessandroronchi18-7807s-projects.vercel.app'
    const h = getCorsHeaders(mkReq({ origin }))
    expect(h['Access-Control-Allow-Origin']).toBe(origin)
  })

  it('altri *.vercel.app non foodios- non accettati', () => {
    const h = getCorsHeaders(mkReq({ origin: 'https://attacker.vercel.app' }))
    expect(h['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('legge origin anche da headers.get (Fetch API)', () => {
    const h = getCorsHeaders(mkFetchReq({ origin: 'https://foodios.it' }))
    expect(h['Access-Control-Allow-Origin']).toBe('https://foodios.it')
  })

  it('origin mancante / null → no Allow-Origin, ma altri header presenti', () => {
    const h = getCorsHeaders(mkReq({}))
    expect(h['Access-Control-Allow-Origin']).toBeUndefined()
    expect(h['Vary']).toBe('Origin')
  })

  it('req null/undefined → fallback senza crash', () => {
    expect(() => getCorsHeaders(null)).not.toThrow()
    expect(() => getCorsHeaders(undefined)).not.toThrow()
  })
})

describe('handleOptions', () => {
  it('ritorna Response status 204', () => {
    const res = handleOptions(mkReq({ origin: 'https://foodios.it' }))
    expect(res).toBeInstanceOf(Response)
    expect(res.status).toBe(204)
  })

  it('include headers CORS', () => {
    const res = handleOptions(mkReq({ origin: 'https://foodios.it' }))
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://foodios.it')
    expect(res.headers.get('Vary')).toBe('Origin')
  })

  it('body vuoto (null)', async () => {
    const res = handleOptions(mkReq({ origin: 'https://foodios.it' }))
    const txt = await res.text()
    expect(txt).toBe('')
  })
})

describe('json', () => {
  it('serializza data come JSON + status di default 200', async () => {
    const res = json({ ok: true })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })

  it('rispetta status custom', () => {
    const res = json({ error: 'x' }, 400)
    expect(res.status).toBe(400)
  })

  it('include CORS headers se req fornito', () => {
    const res = json({ ok: true }, 200, mkReq({ origin: 'https://foodios.it' }))
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://foodios.it')
  })

  it('extraHeaders mergeati', () => {
    const res = json({ ok: true }, 200, null, { 'X-Custom': 'yes' })
    expect(res.headers.get('X-Custom')).toBe('yes')
  })
})

describe('getClientIP', () => {
  it('legge x-real-ip (edge Vercel)', () => {
    const req = mkReq({ 'x-real-ip': '203.0.113.42' })
    expect(getClientIP(req)).toBe('203.0.113.42')
  })

  it('preferisce x-real-ip a x-forwarded-for', () => {
    const req = mkReq({
      'x-real-ip': '203.0.113.42',
      'x-forwarded-for': '1.1.1.1, 2.2.2.2',
    })
    expect(getClientIP(req)).toBe('203.0.113.42')
  })

  it('fallback x-vercel-forwarded-for', () => {
    const req = mkReq({ 'x-vercel-forwarded-for': '198.51.100.7' })
    expect(getClientIP(req)).toBe('198.51.100.7')
  })

  it('fallback cf-connecting-ip', () => {
    const req = mkReq({ 'cf-connecting-ip': '198.51.100.99' })
    expect(getClientIP(req)).toBe('198.51.100.99')
  })

  it('x-forwarded-for → prende ULTIMO IP (edge Vercel attendibile, audit 2026-06-17 MEDIUM)', () => {
    const req = mkReq({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' })
    expect(getClientIP(req)).toBe('3.3.3.3')
  })

  it('x-forwarded-for singolo IP', () => {
    const req = mkReq({ 'x-forwarded-for': '4.4.4.4' })
    expect(getClientIP(req)).toBe('4.4.4.4')
  })

  it('x-forwarded-for con spazi viene trimmato', () => {
    const req = mkReq({ 'x-forwarded-for': '  1.1.1.1 , 2.2.2.2  ' })
    expect(getClientIP(req)).toBe('2.2.2.2')
  })

  it('nessun header → "unknown"', () => {
    expect(getClientIP(mkReq({}))).toBe('unknown')
  })

  it('x-forwarded-for vuoto/spazi → "unknown"', () => {
    expect(getClientIP(mkReq({ 'x-forwarded-for': '   ' }))).toBe('unknown')
    expect(getClientIP(mkReq({ 'x-forwarded-for': ',,,' }))).toBe('unknown')
  })

  it('legge anche tramite headers.get (Fetch API)', () => {
    const req = mkFetchReq({ 'x-real-ip': '5.5.5.5' })
    expect(getClientIP(req)).toBe('5.5.5.5')
  })

  it('x-real-ip con comma → prende primo (single IP semantics)', () => {
    const req = mkReq({ 'x-real-ip': '6.6.6.6, ignored' })
    expect(getClientIP(req)).toBe('6.6.6.6')
  })
})
