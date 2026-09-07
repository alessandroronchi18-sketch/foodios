// Optimistic concurrency su user_data.
//
// Scenario che questi test difendono: il titolare apre il magazzino sul
// portatile, il dipendente lo apre sul tablet in laboratorio, tutti e due
// salvano. Prima chi salvava per secondo cancellava il lavoro del primo senza
// che comparisse alcun errore. Ora deve arrivare un ConcurrentEditError.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()
const fromMock = vi.fn()

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (...a) => fromMock(...a),
    rpc: (...a) => rpcMock(...a),
  },
}))

import {
  sload, ssave, ssaveBatch, ConcurrentEditError,
  _peekVersion, _resetVersions,
} from '../../src/lib/storage'

const ORG = 'org-1'
const SEDE = 'sede-1'
const KEY = 'pasticceria-magazzino-v1'   // per-sede
const SHARED_KEY = 'pasticceria-ricettario-v1'

// Catena di query che restituisce una riga con la version indicata.
function mockSelectRow(row) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data: row ? [row] : [], error: null })),
    maybeSingle: vi.fn(async () => ({ data: row || null, error: null })),
    update: vi.fn(() => chain),
    insert: vi.fn(async () => ({ error: null })),
  }
  fromMock.mockReturnValue(chain)
  return chain
}

beforeEach(() => {
  _resetVersions()
  rpcMock.mockReset()
  fromMock.mockReset()
})

describe('tracciamento della version', () => {
  it('sload memorizza la version letta', async () => {
    mockSelectRow({ data_value: { a: 1 }, updated_at: 'x', version: 7 })
    await sload(KEY, ORG, SEDE)
    expect(_peekVersion(KEY, ORG, SEDE)).toBe(7)
  })

  it('una chiave mai caricata non ha version tracciata', () => {
    expect(_peekVersion(KEY, ORG, SEDE)).toBeUndefined()
  })

  it('le chiavi shared sono tracciate con sede null, non con la sede passata', async () => {
    mockSelectRow({ data_value: {}, updated_at: 'x', version: 3 })
    await sload(SHARED_KEY, ORG, SEDE)
    expect(_peekVersion(SHARED_KEY, ORG, null)).toBe(3)
  })

  it('se la riga non esiste, la version viene dimenticata', async () => {
    mockSelectRow({ data_value: {}, updated_at: 'x', version: 4 })
    await sload(KEY, ORG, SEDE)
    expect(_peekVersion(KEY, ORG, SEDE)).toBe(4)

    mockSelectRow(null)
    await sload(KEY, ORG, SEDE)
    expect(_peekVersion(KEY, ORG, SEDE)).toBeUndefined()
  })
})

describe('ssave con version nota', () => {
  it('passa alla RPC versionata la version che aveva letto', async () => {
    mockSelectRow({ data_value: {}, updated_at: 'x', version: 5 })
    await sload(KEY, ORG, SEDE)

    rpcMock.mockResolvedValue({ data: 6, error: null })
    await ssave(KEY, { b: 2 }, ORG, SEDE)

    expect(rpcMock).toHaveBeenCalledWith('user_data_set_versioned', expect.objectContaining({
      p_org_id: ORG,
      p_data_key: KEY,
      p_sede_id: SEDE,
      p_expected_version: 5,
    }))
  })

  it('dopo un salvataggio riuscito tiene la version nuova, così i salvataggi successivi restano protetti', async () => {
    mockSelectRow({ data_value: {}, updated_at: 'x', version: 5 })
    await sload(KEY, ORG, SEDE)

    rpcMock.mockResolvedValue({ data: 6, error: null })
    await ssave(KEY, { b: 2 }, ORG, SEDE)
    expect(_peekVersion(KEY, ORG, SEDE)).toBe(6)

    rpcMock.mockResolvedValue({ data: 7, error: null })
    await ssave(KEY, { b: 3 }, ORG, SEDE)
    expect(rpcMock).toHaveBeenLastCalledWith('user_data_set_versioned', expect.objectContaining({
      p_expected_version: 6,
    }))
  })

  it('se un altro utente ha scritto nel frattempo lancia ConcurrentEditError invece di sovrascrivere', async () => {
    mockSelectRow({ data_value: {}, updated_at: 'x', version: 5 })
    await sload(KEY, ORG, SEDE)

    rpcMock.mockResolvedValue({ data: null, error: null })   // mismatch
    await expect(ssave(KEY, { b: 2 }, ORG, SEDE)).rejects.toThrow(ConcurrentEditError)
  })

  it("il messaggio di conflitto e' in italiano e dice cosa fare", async () => {
    mockSelectRow({ data_value: {}, updated_at: 'x', version: 1 })
    await sload(KEY, ORG, SEDE)
    rpcMock.mockResolvedValue({ data: null, error: null })

    await expect(ssave(KEY, {}, ORG, SEDE)).rejects.toThrow(/Ricarica la pagina/)
  })

  it('dopo un conflitto dimentica la version, così il tentativo successivo non ripete il falso conflitto', async () => {
    mockSelectRow({ data_value: {}, updated_at: 'x', version: 5 })
    await sload(KEY, ORG, SEDE)

    rpcMock.mockResolvedValue({ data: null, error: null })
    await expect(ssave(KEY, {}, ORG, SEDE)).rejects.toThrow(ConcurrentEditError)
    expect(_peekVersion(KEY, ORG, SEDE)).toBeUndefined()
  })
})

describe('ssave senza version nota', () => {
  it('non chiama la RPC versionata e resta sul percorso semplice', async () => {
    const chain = mockSelectRow(null)
    chain.limit = vi.fn(async () => ({ data: [], error: null }))
    // select id esistenti → nessuna riga → insert
    chain.select = vi.fn(() => ({ ...chain, eq: vi.fn(() => ({ ...chain, eq: vi.fn(async () => ({ data: [], error: null })) })) }))

    await ssave(KEY, { x: 1 }, ORG, SEDE).catch(() => {})
    expect(rpcMock).not.toHaveBeenCalledWith('user_data_set_versioned', expect.anything())
  })
})

describe('ssaveBatch', () => {
  it('dimentica le version delle chiavi che ha scritto', async () => {
    mockSelectRow({ data_value: {}, updated_at: 'x', version: 9 })
    await sload(KEY, ORG, SEDE)
    expect(_peekVersion(KEY, ORG, SEDE)).toBe(9)

    rpcMock.mockResolvedValue({ error: null })
    await ssaveBatch([{ key: KEY, value: { y: 1 } }], ORG, SEDE)

    expect(_peekVersion(KEY, ORG, SEDE)).toBeUndefined()
  })
})
