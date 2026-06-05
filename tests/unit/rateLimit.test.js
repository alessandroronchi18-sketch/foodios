import { describe, it, expect } from 'vitest'
import { checkRateLimit, rateLimitResponse } from '../../api/lib/rateLimit.js'

// Stub Supabase minimale: ritorna `row` su select, registra le upsert.
function fakeSupabase(row, opts = {}) {
  const upserts = []
  const sb = {
    upserts,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => {
        if (opts.throwOnSelect) throw new Error('db down')
        return { data: row }
      } }) }),
      upsert: async (vals) => { upserts.push(vals); return {} },
    }),
  }
  return sb
}

const nowISO = () => new Date().toISOString()

describe('checkRateLimit', () => {
  it('prima richiesta (nessuna row) → allowed e inizializza la finestra', async () => {
    const sb = fakeSupabase(null)
    const r = await checkRateLimit(sb, 'k', 5, 60)
    expect(r.allowed).toBe(true)
    expect(sb.upserts[0]).toMatchObject({ key: 'k', count: 1 })
  })

  it('sotto soglia nella finestra → allowed, incrementa count', async () => {
    const sb = fakeSupabase({ count: 2, window_start: nowISO(), blocked_until: null })
    const r = await checkRateLimit(sb, 'k', 5, 60)
    expect(r.allowed).toBe(true)
    expect(sb.upserts[0].count).toBe(3)
  })

  it('superata la soglia → bloccato con retryAfter = blockSec', async () => {
    const sb = fakeSupabase({ count: 5, window_start: nowISO(), blocked_until: null })
    const r = await checkRateLimit(sb, 'k', 5, 60, 900)
    expect(r.allowed).toBe(false)
    expect(r.retryAfter).toBe(900)
    expect(sb.upserts[0].blocked_until).toBeTruthy()
  })

  it('blocco ancora attivo → negato senza incrementare', async () => {
    const future = new Date(Date.now() + 120000).toISOString()
    const sb = fakeSupabase({ count: 99, window_start: nowISO(), blocked_until: future })
    const r = await checkRateLimit(sb, 'k', 5, 60)
    expect(r.allowed).toBe(false)
    expect(r.retryAfter).toBeGreaterThan(0)
    expect(sb.upserts).toHaveLength(0) // nessuna scrittura
  })

  it('finestra scaduta → reset a count 1', async () => {
    const old = new Date(Date.now() - 10 * 60000).toISOString() // 10 min fa
    const sb = fakeSupabase({ count: 99, window_start: old, blocked_until: null })
    const r = await checkRateLimit(sb, 'k', 5, 60)
    expect(r.allowed).toBe(true)
    expect(sb.upserts[0].count).toBe(1)
  })

  it('fail-open: se il DB lancia, lascia passare', async () => {
    const sb = fakeSupabase(null, { throwOnSelect: true })
    const r = await checkRateLimit(sb, 'k', 5, 60)
    expect(r.allowed).toBe(true)
  })
})

describe('rateLimitResponse', () => {
  it('ritorna 429 con header Retry-After', async () => {
    const res = rateLimitResponse(42)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('42')
    const body = await res.json()
    expect(body.retryAfter).toBe(42)
  })
})
