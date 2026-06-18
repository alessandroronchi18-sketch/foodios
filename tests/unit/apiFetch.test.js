// @vitest-environment happy-dom
// apiFetch — wrapper auth + refresh token + redirect login.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sessionRef = { access_token: 'init-token' }

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: sessionRef.access_token ? { access_token: sessionRef.access_token } : null } })),
      refreshSession: vi.fn(async () => ({ data: { session: { access_token: 'refreshed-token' } }, error: null })),
      signOut: vi.fn(async () => {}),
    },
  },
}))

import { apiFetch, apiGet, apiPost } from '../../src/lib/apiFetch'
import { supabase } from '../../src/lib/supabase'

const origReplace = global.window?.location?.replace
let replaceCalls = []

beforeEach(() => {
  sessionRef.access_token = 'init-token'
  supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'init-token' } } })
  supabase.auth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'refreshed-token' } }, error: null })
  supabase.auth.signOut.mockClear()
  replaceCalls = []
  // Override location.replace (happy-dom)
  Object.defineProperty(global.window.location, 'replace', {
    configurable: true,
    value: (url) => replaceCalls.push(url),
  })
})

afterEach(() => {
  globalThis.fetch = undefined
})

describe('apiFetch — auth header injection', () => {
  it('inietta Authorization Bearer dal session token', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 }))
    await apiFetch('/api/admin?action=x')
    expect(globalThis.fetch).toHaveBeenCalled()
    const opts = globalThis.fetch.mock.calls[0][1]
    expect(opts.headers.Authorization).toBe('Bearer init-token')
  })

  it('inietta Content-Type JSON se body presente non-FormData', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 }))
    await apiFetch('/api/admin', { method: 'POST', body: JSON.stringify({ x: 1 }) })
    const opts = globalThis.fetch.mock.calls[0][1]
    expect(opts.headers['Content-Type']).toBe('application/json')
  })

  it('NON inietta Content-Type per FormData (browser lo fa con boundary)', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 }))
    const fd = new FormData()
    await apiFetch('/api/upload', { method: 'POST', body: fd })
    const opts = globalThis.fetch.mock.calls[0][1]
    expect(opts.headers['Content-Type']).toBeUndefined()
  })
})

describe('apiFetch — sessione mancante', () => {
  it('senza token in session → redirect login + throw', async () => {
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } })
    await expect(apiFetch('/api/x')).rejects.toThrow(/Sessione non valida/)
  })
})

describe('apiFetch — 401 + refresh', () => {
  it('401 → refresh + retry → 200 ok', async () => {
    let calls = 0
    globalThis.fetch = vi.fn(async () => {
      calls++
      return calls === 1
        ? new Response('unauth', { status: 401 })
        : new Response('{}', { status: 200 })
    })
    const res = await apiFetch('/api/x')
    expect(res.status).toBe(200)
    expect(supabase.auth.refreshSession).toHaveBeenCalled()
    // 2a chiamata con refreshed-token
    const opts2 = globalThis.fetch.mock.calls[1][1]
    expect(opts2.headers.Authorization).toBe('Bearer refreshed-token')
  })

  it('refresh fallito → redirect login + throw', async () => {
    globalThis.fetch = vi.fn(async () => new Response('unauth', { status: 401 }))
    supabase.auth.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: { message: 'expired' } })
    await expect(apiFetch('/api/x')).rejects.toThrow(/Sessione scaduta/)
  })

  it('401 anche dopo refresh → logout', async () => {
    globalThis.fetch = vi.fn(async () => new Response('unauth', { status: 401 }))
    await expect(apiFetch('/api/x')).rejects.toThrow(/Sessione/)
  })
})

describe('apiFetch — error responses', () => {
  it('4xx/5xx → throw con messaggio dal body.error', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'invalid input' }), { status: 400 }))
    await expect(apiFetch('/api/x')).rejects.toThrow('invalid input')
  })

  it('error.status preservato', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 500 }))
    try {
      await apiFetch('/api/x')
    } catch (e) {
      expect(e.status).toBe(500)
    }
  })

  it('body non-JSON → fallback "Errore N"', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<html>500</html>', { status: 500 }))
    await expect(apiFetch('/api/x')).rejects.toThrow('Errore 500')
  })
})

describe('apiGet / apiPost helpers', () => {
  it('apiGet → ritorna .json()', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, n: 7 }), { status: 200 }))
    const data = await apiGet('/api/stats')
    expect(data).toEqual({ ok: true, n: 7 })
  })

  it('apiPost → method POST + body JSON.stringify', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
    await apiPost('/api/admin', { tipo: 'x', n: 1 })
    const opts = globalThis.fetch.mock.calls[0][1]
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ tipo: 'x', n: 1 })
  })
})
