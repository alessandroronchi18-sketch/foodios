// @vitest-environment happy-dom
//
// Il registro non deve portarsi dietro i dati delle persone.
//
// `logger.js` scrive nella console, manda a Sentry, e in certi casi al
// server. Tutto quello che ci passa esce dal computer del cliente e finisce
// da qualcun altro: se dentro c'è un indirizzo email, un IBAN o una chiave
// di accesso, è uscito anche quello.
//
// 57 righe al 49% di copertura fino al 15/09/2026, e la parte scoperta era
// proprio `sanitize`: la funzione il cui unico compito è togliere quei dati.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import logger, { sanitize } from '../../src/lib/logger'

beforeEach(() => { vi.restoreAllMocks() })
afterEach(() => { delete window.Sentry })

describe('sanitize: cosa toglie', () => {
  it('gli indirizzi email', () => {
    expect(sanitize('scrivi a mara@maradeiboschi.com per info'))
      .toBe('scrivi a [redacted] per info')
    expect(sanitize('a.b+tag@sotto.dominio.co.uk')).toBe('[redacted]')
  })

  it('gli IBAN italiani, anche con gli spazi', () => {
    expect(sanitize('IBAN IT60X0542811101000000123456')).toMatch(/\[redacted\]/)
    expect(sanitize('IT 60 X 05428 11101 000000123456')).toMatch(/\[redacted\]/)
  })

  it('i gettoni di accesso', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc-DEF_123'
    expect(sanitize(`Authorization: Bearer ${jwt}`)).not.toContain('eyJ')
  })

  it('le chiavi di Stripe e di Supabase', () => {
    expect(sanitize('sk_live_51ABCdef')).toBe('[redacted]')
    expect(sanitize('sk_test_51ABCdef')).toBe('[redacted]')
    expect(sanitize('sb_secret_aBcD-1234_xy')).toBe('[redacted]')
  })

  it('più cose nella stessa frase, tutte', () => {
    const r = sanitize('mara@x.it ha pagato con sk_live_999')
    expect(r).not.toContain('mara@x.it')
    expect(r).not.toContain('sk_live_999')
  })

  it('i campi che si chiamano come un segreto, qualunque cosa contengano', () => {
    const r = sanitize({
      password: 'ciao', token: 'x', secret: 'y', api_key: 'z',
      apikey: 'w', authorization: 'v', access_token: 'u', refresh_token: 't',
      AUTHORIZATION: 'maiuscolo',
      nome: 'Mara',
    })
    for (const k of ['password', 'token', 'secret', 'api_key', 'apikey',
                     'authorization', 'access_token', 'refresh_token', 'AUTHORIZATION']) {
      expect(r[k], k).toBe('[redacted]')
    }
    expect(r.nome).toBe('Mara')   // quello che non è un segreto resta
  })
})

describe('sanitize: cosa lascia stare', () => {
  it('numeri, booleani, nulli', () => {
    expect(sanitize(42)).toBe(42)
    expect(sanitize(0)).toBe(0)
    expect(sanitize(true)).toBe(true)
    expect(sanitize(null)).toBe(null)
    expect(sanitize(undefined)).toBe(undefined)
  })

  it('il testo normale', () => {
    expect(sanitize('Ho prodotto 12 Sacher oggi')).toBe('Ho prodotto 12 Sacher oggi')
  })

  it('una parola che somiglia a un\'email ma non lo è', () => {
    expect(sanitize('chiocciola @ mezzogiorno')).toBe('chiocciola @ mezzogiorno')
  })
})

describe('sanitize: non si fa esplodere né riempire', () => {
  it('un testo lunghissimo viene tagliato, e lo dice', () => {
    const r = sanitize('a'.repeat(5000))
    expect(r.length).toBeLessThan(1100)
    expect(r).toMatch(/…\[truncated\]$/)
  })

  it('un elenco lunghissimo si ferma a cinquanta', () => {
    expect(sanitize(Array.from({ length: 500 }, (_, i) => i))).toHaveLength(50)
  })

  it('un oggetto con trecento campi si ferma a trenta, e lo dichiara', () => {
    const grande = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`c${i}`, i]))
    const r = sanitize(grande)
    expect(Object.keys(r).length).toBeLessThanOrEqual(32)
    expect(r._truncated).toBe(true)
  })

  it('un oggetto annidato all\'infinito si ferma', () => {
    let profondo = { v: 'mara@x.it' }
    for (let i = 0; i < 20; i++) profondo = { dentro: profondo }
    expect(() => sanitize(profondo)).not.toThrow()
    expect(JSON.stringify(sanitize(profondo))).toContain('[truncated:deep]')
  })

  it('un oggetto che rimanda a se stesso non fa girare a vuoto', () => {
    const ciclo = { nome: 'x' }
    ciclo.se_stesso = ciclo
    expect(() => sanitize(ciclo)).not.toThrow()
  })

  it('un errore diventa nome, messaggio e traccia — ripuliti', () => {
    const e = new Error('non riesco a scrivere per mara@x.it')
    const r = sanitize(e)
    expect(r.name).toBe('Error')
    expect(r.message).not.toContain('mara@x.it')
    expect(r).toHaveProperty('stack')
  })

  it('anche dentro un elenco e dentro un oggetto', () => {
    const r = sanitize({ utenti: ['a@b.it', { mail: 'c@d.it' }] })
    expect(JSON.stringify(r)).not.toContain('@b.it')
    expect(JSON.stringify(r)).not.toContain('@d.it')
  })
})

describe('quello che finisce davvero nella console', () => {
  it('ogni riga ha livello, messaggio e ora', () => {
    const spia = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('qualcosa non va', new Error('boom'), { pagina: 'magazzino' })
    const [prefisso, riga] = spia.mock.calls[0]
    expect(prefisso).toBe('[fos]')
    expect(riga).toMatchObject({ level: 'error', msg: 'qualcosa non va', pagina: 'magazzino' })
    expect(riga.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(riga.error.message).toBe('boom')
  })

  it('il contesto passa dal filtro, non solo il messaggio', () => {
    const spia = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.warn('salvataggio lento', { utente: 'mara@maradeiboschi.com', token: 'segreto' })
    const riga = spia.mock.calls[0][1]
    expect(riga.utente).toBe('[redacted]')
    expect(riga.token).toBe('[redacted]')
  })

  it('anche il messaggio, non solo il contesto', () => {
    const spia = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.warn('errore per mara@x.it')
    expect(spia.mock.calls[0][1].msg).not.toContain('mara@x.it')
  })

  it('una console rotta non fa cadere l\'applicazione', () => {
    vi.spyOn(console, 'error').mockImplementation(() => { throw new Error('console rotta') })
    expect(() => logger.error('x', new Error('y'))).not.toThrow()
  })
})

describe('quello che finisce a Sentry', () => {
  it('un errore diventa un\'eccezione, con il contesto ripulito', () => {
    const captureException = vi.fn()
    window.Sentry = { captureException, captureMessage: vi.fn() }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const e = new Error('boom')
    logger.error('non salvato', e, { utente: 'mara@x.it' })
    expect(captureException).toHaveBeenCalledWith(e, expect.objectContaining({
      extra: { utente: '[redacted]' }, level: 'error',
    }))
  })

  it('un avviso diventa un messaggio', () => {
    const captureMessage = vi.fn()
    window.Sentry = { captureException: vi.fn(), captureMessage }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.warn('lento')
    expect(captureMessage).toHaveBeenCalledWith('lento', expect.objectContaining({ level: 'warn' }))
  })

  it('senza Sentry non succede niente di male', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => logger.warn('x')).not.toThrow()
  })

  it('un Sentry che va in errore non fa cadere l\'applicazione', () => {
    window.Sentry = { captureException: () => { throw new Error('sentry giù') }, captureMessage: vi.fn() }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => logger.error('x', new Error('y'))).not.toThrow()
  })

  it('un errore senza oggetto errore ne costruisce uno', () => {
    const captureException = vi.fn()
    window.Sentry = { captureException, captureMessage: vi.fn() }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('solo un messaggio')
    expect(captureException.mock.calls[0][0]).toBeInstanceOf(Error)
  })
})

describe('il cronometro', () => {
  it('misura e scrive i millisecondi', () => {
    const spia = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const t = logger.time('caricamento magazzino')
    t.end({ righe: 120 })
    const riga = spia.mock.calls.at(-1)?.[1]
    expect(riga.msg).toBe('timing:caricamento magazzino')
    expect(typeof riga.ms).toBe('number')
    expect(riga.ms).toBeGreaterThanOrEqual(0)
    expect(riga.righe).toBe(120)
  })

  it('si può chiudere senza contesto', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    expect(() => logger.time('x').end()).not.toThrow()
  })
})
