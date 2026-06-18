// safeError — handler errori standardizzato (no leak schema DB, logging best-effort).
// Strategia: stash/restore di NODE_ENV + VERCEL_ENV per coprire ramo PROD/dev.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// IS_PROD viene calcolato a module-load → resetModules + dynamic import per
// forzare il branch giusto per ogni gruppo di test.
const ORIG_ENV = { ...process.env }

async function loadModule({ prod = false } = {}) {
  vi.resetModules()
  process.env = { ...ORIG_ENV }
  if (prod) {
    process.env.NODE_ENV = 'production'
    process.env.VERCEL_ENV = 'production'
  } else {
    process.env.NODE_ENV = 'test'
    delete process.env.VERCEL_ENV
  }
  return await import('../../api/lib/safeError.js')
}

afterEach(() => {
  process.env = { ...ORIG_ENV }
})

describe('publicErrorMessage — DEV mode', () => {
  let mod
  beforeEach(async () => { mod = await loadModule({ prod: false }) })

  it('ritorna [code] message se presenti', () => {
    expect(mod.publicErrorMessage({ code: '23505', message: 'duplicate key' }))
      .toBe('[23505] duplicate key')
  })

  it('ritorna solo message se code mancante', () => {
    expect(mod.publicErrorMessage({ message: 'boom' })).toBe('boom')
  })

  it('default "Errore" se né code né message', () => {
    expect(mod.publicErrorMessage({})).toBe('Errore')
    expect(mod.publicErrorMessage(null)).toBe('Errore')
  })
})

describe('publicErrorMessage — PROD mode (mapping safe)', () => {
  let mod
  beforeEach(async () => { mod = await loadModule({ prod: true }) })

  it('23505 → "Risorsa già esistente"', () => {
    expect(mod.publicErrorMessage({ code: '23505', message: 'leak schema' }))
      .toBe('Risorsa già esistente')
  })

  it('23503 → "Riferimento non valido"', () => {
    expect(mod.publicErrorMessage({ code: '23503' })).toBe('Riferimento non valido')
  })

  it('23502 → "Dato obbligatorio mancante"', () => {
    expect(mod.publicErrorMessage({ code: '23502' })).toBe('Dato obbligatorio mancante')
  })

  it('42P01 → "Servizio non disponibile"', () => {
    expect(mod.publicErrorMessage({ code: '42P01' })).toBe('Servizio non disponibile')
  })

  it('42501 → "Permessi insufficienti"', () => {
    expect(mod.publicErrorMessage({ code: '42501' })).toBe('Permessi insufficienti')
  })

  it('PGRST116 → "Risorsa non trovata"', () => {
    expect(mod.publicErrorMessage({ code: 'PGRST116' })).toBe('Risorsa non trovata')
  })

  it('status 401/403/404 → messaggio mappato', () => {
    expect(mod.publicErrorMessage({ status: 401 })).toBe('Non autorizzato')
    expect(mod.publicErrorMessage({ status: 403 })).toBe('Accesso negato')
    expect(mod.publicErrorMessage({ status: 404 })).toBe('Risorsa non trovata')
  })

  it('errore sconosciuto → "Errore interno" (no leak)', () => {
    expect(mod.publicErrorMessage({ message: 'column "secret_pwd" does not exist' }))
      .toBe('Errore interno')
  })

  it('null/undefined → "Errore interno"', () => {
    expect(mod.publicErrorMessage(null)).toBe('Errore interno')
    expect(mod.publicErrorMessage(undefined)).toBe('Errore interno')
  })
})

describe('safeError — body + status', () => {
  let mod
  let consoleErrSpy
  beforeEach(async () => {
    mod = await loadModule({ prod: true })
    consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { consoleErrSpy.mockRestore() })

  it('usa error.status se valido (4xx-5xx)', () => {
    const { body, status } = mod.safeError({ status: 404, message: 'x' })
    expect(status).toBe(404)
    expect(body).toEqual({ error: 'Risorsa non trovata' })
  })

  it('usa error.statusCode come fallback', () => {
    const { status } = mod.safeError({ statusCode: 401 })
    expect(status).toBe(401)
  })

  it('usa fallbackStatus se nessuno status nell errore', () => {
    const { status } = mod.safeError(new Error('x'), {}, 502)
    expect(status).toBe(502)
  })

  it('default fallback = 500 se non passato', () => {
    const { status } = mod.safeError(new Error('x'))
    expect(status).toBe(500)
  })

  it('status fuori range 400-600 → forzato a 500', () => {
    const { status } = mod.safeError({ status: 200 })
    expect(status).toBe(500)
  })

  it('status non numerico → 500', () => {
    const { status } = mod.safeError({ status: 'boh' })
    expect(status).toBe(500)
  })

  it('logga su console.error con prefisso [safeError]', () => {
    mod.safeError(new Error('failure'), { endpoint: 'admin' })
    expect(consoleErrSpy).toHaveBeenCalledWith('[safeError]', expect.stringContaining('failure'))
  })

  it('cattura senza throw anche se error ha riferimenti ciclici', () => {
    const ciclo = { message: 'x' }; ciclo.self = ciclo
    expect(() => mod.safeError(ciclo)).not.toThrow()
    expect(consoleErrSpy).toHaveBeenCalled()
  })
})

describe('safeError — persistenza DB best-effort', () => {
  let mod
  beforeEach(async () => {
    mod = await loadModule({ prod: true })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  function mkSupabase() {
    const insert = vi.fn(() => ({
      then: (ok, ko) => { ok && ok(); return { catch: () => {} } },
    }))
    const from = vi.fn(() => ({ insert }))
    return { from, insert }
  }

  it('persiste su error_log se supabase passato', () => {
    const sb = mkSupabase()
    mod.safeError(
      { code: '23505', message: 'dup', status: 409, hint: 'idx_unique', stack: 'stack...' },
      { endpoint: 'orders', op: 'create', orgId: 'org1', userId: 'user1' },
      500,
      sb
    )
    expect(sb.from).toHaveBeenCalledWith('error_log')
    expect(sb.insert).toHaveBeenCalled()
    const row = sb.insert.mock.calls[0][0]
    expect(row.endpoint).toBe('orders')
    expect(row.operation).toBe('create')
    expect(row.org_id).toBe('org1')
    expect(row.user_id).toBe('user1')
    expect(row.code).toBe('23505')
    expect(row.status).toBe(409)
    expect(row.message).toBe('dup')
    expect(row.hint).toBe('idx_unique')
  })

  it('tronca message a 1000 caratteri', () => {
    const sb = mkSupabase()
    const longMsg = 'x'.repeat(2000)
    mod.safeError({ message: longMsg }, {}, 500, sb)
    expect(sb.insert.mock.calls[0][0].message.length).toBe(1000)
  })

  it('tronca code a 80 e stack a 2000', () => {
    const sb = mkSupabase()
    mod.safeError({ code: 'C'.repeat(200), stack: 'S'.repeat(5000) }, {}, 500, sb)
    const row = sb.insert.mock.calls[0][0]
    expect(row.code.length).toBe(80)
    expect(row.stack.length).toBe(2000)
  })

  it('status non-numero → null (non finisce su colonna int)', () => {
    const sb = mkSupabase()
    mod.safeError({ status: '500' }, {}, 500, sb)
    expect(sb.insert.mock.calls[0][0].status).toBeNull()
  })

  it('accetta op/tipo/action come alias di operation', () => {
    const sb = mkSupabase()
    mod.safeError({ message: 'x' }, { tipo: 'tipoX' }, 500, sb)
    expect(sb.insert.mock.calls[0][0].operation).toBe('tipoX')

    const sb2 = mkSupabase()
    mod.safeError({ message: 'x' }, { action: 'actY' }, 500, sb2)
    expect(sb2.insert.mock.calls[0][0].operation).toBe('actY')
  })

  it('accetta org_id/user_id (snake_case) come alias', () => {
    const sb = mkSupabase()
    mod.safeError({ message: 'x' }, { org_id: 'O', user_id: 'U' }, 500, sb)
    const row = sb.insert.mock.calls[0][0]
    expect(row.org_id).toBe('O')
    expect(row.user_id).toBe('U')
  })

  it('supabase null → non chiama from', () => {
    // se non c è client non deve esplodere
    expect(() => mod.safeError(new Error('x'), {}, 500, null)).not.toThrow()
  })

  it('errore nella query insert → silenzioso (best-effort)', () => {
    const broken = {
      from: () => { throw new Error('connection lost') },
    }
    expect(() => mod.safeError(new Error('x'), {}, 500, broken)).not.toThrow()
  })
})

describe('safeErrorResponse — Response wrapper', () => {
  let mod
  beforeEach(async () => {
    mod = await loadModule({ prod: true })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('ritorna Response con JSON body e header Content-Type', async () => {
    const resp = mod.safeErrorResponse({ code: '23505' }, { endpoint: 'x' })
    expect(resp).toBeInstanceOf(Response)
    expect(resp.headers.get('Content-Type')).toBe('application/json')
    const body = await resp.json()
    expect(body).toEqual({ error: 'Risorsa già esistente' })
  })

  it('include corsHeaders nel response', () => {
    const resp = mod.safeErrorResponse(new Error('x'), {}, 500, { 'Access-Control-Allow-Origin': '*' })
    expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('status code usa quello dell errore', () => {
    const resp = mod.safeErrorResponse({ status: 403 })
    expect(resp.status).toBe(403)
  })
})
