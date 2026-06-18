// exportGuard + auditClient: rate limit lato server PDF export.
// Audit fail-open su rete down: PDF generato comunque, audit best-effort.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock supabase prima di importare i moduli sotto test.
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok-test' } } })),
    },
  },
}))

import { setExportCtx, getExportCtx, gateExport } from '../../src/lib/exportGuard'
import { checkExportPermesso } from '../../src/lib/auditClient'
import { supabase } from '../../src/lib/supabase'

describe('exportGuard context', () => {
  it('setExportCtx + getExportCtx merge superficiale', () => {
    setExportCtx({ email: 'a@b.it', nomeAttivita: 'Bar' })
    expect(getExportCtx()).toEqual({ email: 'a@b.it', nomeAttivita: 'Bar' })
    // merge: solo email cambia
    setExportCtx({ email: 'c@d.it' })
    expect(getExportCtx().email).toBe('c@d.it')
    expect(getExportCtx().nomeAttivita).toBe('Bar')
  })
})

describe('gateExport', () => {
  let origFetch
  beforeEach(() => { origFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = origFetch })

  it('ritorna true se checkExportPermesso ok:true (auth + 200)', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ watermark: '@test' }), { status: 200 }))
    const ok = await gateExport('ricetta', { id: 1 })
    expect(ok).toBe(true)
  })

  it('ritorna false + notify se 429 rate-limited', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ retryAfter: 600 }), { status: 429 }))
    const notify = vi.fn()
    const ok = await gateExport('ricetta', { id: 1 }, notify)
    expect(ok).toBe(false)
    expect(notify).toHaveBeenCalled()
    const msg = notify.mock.calls[0][0]
    expect(msg).toMatch(/troppi PDF/i)
    expect(msg).toMatch(/10 minuti/)
  })

  it('fail-open su 5xx (audit best-effort)', async () => {
    globalThis.fetch = vi.fn(async () => new Response('boom', { status: 500 }))
    expect(await gateExport('ricetta', {})).toBe(true)
  })

  it('fail-open su exception rete', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('network down') })
    expect(await gateExport('ricetta', {})).toBe(true)
  })

  it('session anonima (no JWT) → ok:true anonymous', async () => {
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } })
    const ok = await gateExport('ricetta', {})
    expect(ok).toBe(true)
  })
})

describe('checkExportPermesso', () => {
  let origFetch
  beforeEach(() => {
    origFetch = globalThis.fetch
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
  })
  afterEach(() => { globalThis.fetch = origFetch })

  it('include Bearer token nella request', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{"watermark":"x"}', { status: 200 }))
    await checkExportPermesso('pl', { n_items: 5 })
    expect(globalThis.fetch).toHaveBeenCalled()
    const opts = globalThis.fetch.mock.calls[0][1]
    expect(opts.headers.Authorization).toBe('Bearer tok')
  })

  it('include n_items dal scope', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 }))
    await checkExportPermesso('pl', { n_items: 12 })
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.n_items).toBe(12)
    expect(body.tipo).toBe('pl')
  })

  it('429 ritorna struttura rateLimited completa', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ retryAfter: 1800 }), { status: 429 }))
    const r = await checkExportPermesso('ricetta', {})
    expect(r.ok).toBe(false)
    expect(r.rateLimited).toBe(true)
    expect(r.retryAfter).toBe(1800)
    expect(r.message).toMatch(/30 minuti/)
  })

  it('non bloccante: rete down → ok:true warning:network', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('offline') })
    const r = await checkExportPermesso('x', {})
    expect(r.ok).toBe(true)
    expect(r.warning).toBe('network')
  })
})
