// @vitest-environment happy-dom
// analizzaFotoAI — wrapper /api/ai vision (Claude Sonnet) per estrarre
// JSON strutturato da foto di ricetta. Mock fetch global + supabase.auth.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Stato della sessione mockata, riassegnabile tra test.
const sessionRef = { access_token: 'tok-abc' }

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: sessionRef.access_token ? { access_token: sessionRef.access_token } : null },
      })),
    },
  },
}))

const { analizzaFotoAI } = await import('../../src/lib/analizzaFotoAI.js')
const { supabase } = await import('../../src/lib/supabase.js')

// Mock FileReader: rilascia immediatamente un data URL fake.
class FakeFileReader {
  constructor() {
    this.onload = null
    this.onerror = null
    this.result = null
  }
  readAsDataURL(_blob) {
    this.result = 'data:image/jpeg;base64,QUJDREVG'
    setTimeout(() => { if (this.onload) this.onload({ target: { result: this.result } }) }, 0)
  }
}

function makeFile(type = 'image/jpeg') {
  return { type, name: 'photo.jpg', size: 1234 }
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

describe('analizzaFotoAI', () => {
  let origFetch, origFileReader
  beforeEach(() => {
    origFetch = globalThis.fetch
    origFileReader = globalThis.FileReader
    globalThis.FileReader = FakeFileReader
    sessionRef.access_token = 'tok-abc'
    supabase.auth.getSession.mockImplementation(async () => ({
      data: { session: sessionRef.access_token ? { access_token: sessionRef.access_token } : null },
    }))
  })
  afterEach(() => {
    globalThis.fetch = origFetch
    globalThis.FileReader = origFileReader
    vi.clearAllMocks()
  })

  it('success path: ritorna JSON parsato dal blocco text di Claude', async () => {
    const aiPayload = {
      content: [
        { type: 'text', text: JSON.stringify({
          nome: 'TIRAMISU', categoria: 'Dolci', porzioni: 8,
          ingredienti: [{ nome: 'mascarpone', quantita: 500, unita: 'g' }],
          procedimento: 'mescolare', temperatura: null, tempo_cottura_minuti: null,
        }) },
      ],
    }
    globalThis.fetch = vi.fn(async () => jsonResponse(aiPayload, 200))
    const out = await analizzaFotoAI(makeFile(), 'ricetta')
    expect(out.nome).toBe('TIRAMISU')
    expect(out.categoria).toBe('Dolci')
    expect(out.ingredienti[0].nome).toBe('mascarpone')

    // verifica che fetch sia stato chiamato con il bearer
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/ai', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer tok-abc' }),
    }))
    // body contiene il base64 e il mime
    const callArgs = globalThis.fetch.mock.calls[0][1]
    const body = JSON.parse(callArgs.body)
    expect(body.model).toBe('claude-sonnet-4-6')
    expect(body.messages[0].content[0].source.data).toBe('QUJDREVG')
    expect(body.messages[0].content[0].source.media_type).toBe('image/jpeg')
  })

  it('tipo sconosciuto -> fallback al prompt ricetta', async () => {
    const aiPayload = { content: [{ type: 'text', text: '{"nome":"X","categoria":"Dolci","ingredienti":[]}' }] }
    globalThis.fetch = vi.fn(async () => jsonResponse(aiPayload, 200))
    await analizzaFotoAI(makeFile(), 'tipo-inesistente')
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    const textPrompt = body.messages[0].content[1].text
    expect(textPrompt).toMatch(/Analizza questa immagine di una ricetta/)
  })

  it('sessione assente -> throw "Sessione scaduta"', async () => {
    sessionRef.access_token = null
    globalThis.fetch = vi.fn()
    await expect(analizzaFotoAI(makeFile())).rejects.toThrow(/Sessione scaduta/)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('401 dalla API -> throw "Sessione scaduta durante l\'analisi"', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: 'unauth' }, 401))
    await expect(analizzaFotoAI(makeFile())).rejects.toThrow(/Sessione scaduta durante l'analisi/)
  })

  it('429 dalla API -> messaggio rate-limit dedicato', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: 'rate' }, 429))
    await expect(analizzaFotoAI(makeFile())).rejects.toThrow(/Troppe richieste AI/)
  })

  it('5xx dalla API -> errore generico con status', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: 'boom' }, 503))
    await expect(analizzaFotoAI(makeFile())).rejects.toThrow(/Errore servizio AI \(503\)/)
  })

  it('JSON wrapped in ```json ...``` -> parser pulisce e parsa', async () => {
    const wrapped = '```json\n{"nome":"PANE","categoria":"Pane","ingredienti":[]}\n```'
    globalThis.fetch = vi.fn(async () => jsonResponse({ content: [{ type: 'text', text: wrapped }] }, 200))
    const out = await analizzaFotoAI(makeFile())
    expect(out.nome).toBe('PANE')
    expect(out.categoria).toBe('Pane')
  })

  it('JSON malformato con testo intorno -> regex fallback recupera l\'oggetto', async () => {
    const dirty = 'Ecco il JSON richiesto:\n{"nome":"FOCACCIA","categoria":"Pane","ingredienti":[]}\nFine risposta.'
    globalThis.fetch = vi.fn(async () => jsonResponse({ content: [{ type: 'text', text: dirty }] }, 200))
    const out = await analizzaFotoAI(makeFile())
    expect(out.nome).toBe('FOCACCIA')
  })

  it('risposta non JSON parsabile -> throw "Impossibile leggere la risposta AI"', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ content: [{ type: 'text', text: 'sono solo testo libero' }] }, 200))
    await expect(analizzaFotoAI(makeFile())).rejects.toThrow(/Impossibile leggere la risposta AI/)
  })

  it('content array senza blocchi text -> usa stringa vuota -> throw parser', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ content: [{ type: 'image', source: 'x' }] }, 200))
    await expect(analizzaFotoAI(makeFile())).rejects.toThrow(/Impossibile leggere la risposta AI/)
  })

  it('file senza type -> defaulta a image/jpeg nel body', async () => {
    const aiPayload = { content: [{ type: 'text', text: '{"nome":"X","categoria":"Dolci","ingredienti":[]}' }] }
    globalThis.fetch = vi.fn(async () => jsonResponse(aiPayload, 200))
    const fileSenzaType = { name: 'x.bin' }  // no .type
    await analizzaFotoAI(fileSenzaType)
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.messages[0].content[0].source.media_type).toBe('image/jpeg')
  })
})
