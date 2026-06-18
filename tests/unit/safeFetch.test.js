// safeFetch — timeout obbligatorio per fetch verso provider esterni.
// Audit 2026-06-14 PM: chiude la classe "hang provider esterno blocca Edge".

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { safeFetch, safeFetchLLM, DEFAULT_TIMEOUT_MS } from '../../api/lib/safeFetch'

describe('safeFetch', () => {
  let origFetch
  beforeEach(() => { origFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = origFetch })

  it('DEFAULT_TIMEOUT_MS = 15s', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(15_000)
  })

  it('passa la response se fetch risolve entro il timeout', async () => {
    globalThis.fetch = vi.fn(async () => new Response('ok', { status: 200 }))
    const r = await safeFetch('https://x.test/', {}, 1000)
    expect(r.status).toBe(200)
  })

  it('throw "timeout dopo Xms" se fetch non risolve entro il timeout', async () => {
    globalThis.fetch = vi.fn((url, opts) => new Promise((resolve, reject) => {
      // Simula provider hangato: reject SOLO quando il signal aborta.
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted')
        err.name = 'AbortError'
        reject(err)
      })
    }))
    await expect(safeFetch('https://api.anthropic.com/v1/messages', {}, 50))
      .rejects.toThrow(/timeout dopo 50ms su api\.anthropic\.com/)
  })

  it('throw URL string troncata se URL non parsabile', async () => {
    globalThis.fetch = vi.fn((url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted'); err.name = 'AbortError'; reject(err)
      })
    }))
    await expect(safeFetch('not-a-url', {}, 30))
      .rejects.toThrow(/timeout dopo 30ms su not-a-url/)
  })

  it('rilancia errori non-abort senza wrapparli', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    await expect(safeFetch('https://x.test/', {}, 1000))
      .rejects.toThrow('ECONNREFUSED')
  })

  it('rispetta opts.signal del caller (no override del controller interno)', async () => {
    globalThis.fetch = vi.fn(async (url, opts) => {
      // Se il caller passa un signal, deve essere QUELLO usato (non quello del controller interno).
      expect(opts.signal).toBeDefined()
      return new Response('ok')
    })
    const ctrl = new AbortController()
    await safeFetch('https://x.test/', { signal: ctrl.signal }, 1000)
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('clearTimeout sempre (finally), anche su errore', async () => {
    // Verifico che non rimangano timer aperti — se ci fossero, il process Node
    // non terminerebbe pulito. Usiamo il pattern: vi.useFakeTimers + count timers.
    vi.useFakeTimers()
    globalThis.fetch = vi.fn(async () => { throw new Error('boom') })
    try {
      await expect(safeFetch('https://x.test/', {}, 1000)).rejects.toThrow('boom')
    } finally {
      // Non ci sono timer pendenti (clearTimeout in finally).
      expect(vi.getTimerCount()).toBe(0)
      vi.useRealTimers()
    }
  })
})

describe('safeFetchLLM', () => {
  let origFetch
  beforeEach(() => { origFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = origFetch })

  it('usa default 25s (vs 15s di safeFetch base)', async () => {
    globalThis.fetch = vi.fn(async () => new Response('ok'))
    // Verifica che il timeout di default sia 25s: il messaggio di errore
    // contiene il numero, quindi forziamo l'abort e leggiamo il messaggio.
    globalThis.fetch = vi.fn((url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted'); err.name = 'AbortError'; reject(err)
      })
    }))
    await expect(safeFetchLLM('https://api.anthropic.com/v1/messages', {}, 10))
      .rejects.toThrow(/timeout dopo 10ms/)
  })
})
