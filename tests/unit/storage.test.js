// storage.js — copertura completa del wrapper persistenza FoodOS.
// `sload`/`ssave`/`ssaveBatch`/`sloadWithVersion`/`ssaveVersioned`/
// `sloadAllSedi`/`sdelete` parlano con Supabase tramite chain fluent
// (`.from().select().eq().eq().is/eq().order().limit()` ecc.); mockiamo
// il client una volta sola e cambiamo il `returnValue` per scenario tramite
// l'helper `tests/helpers/supabaseMock.js`.
//
// Coverage target: >=80% lines (baseline 1% pre-test). Anche la classificazione
// chiavi pure (SHARED_KEYS / isSharedKey) e' ricoperta qui in modo da
// consolidare gli assert in un unico file.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockChain, mockSupabase } from '../helpers/supabaseMock.js'

vi.mock('../../src/lib/supabase', () => ({ supabase: mockSupabase() }))

import {
  SHARED_KEYS, isSharedKey,
  sload, ssave, ssaveBatch,
  sloadWithVersion, ssaveVersioned,
  sloadAllSedi, sdelete,
} from '../../src/lib/storage.js'
import { supabase } from '../../src/lib/supabase'

beforeEach(() => {
  supabase.from.mockReset()
  supabase.rpc.mockReset()
  // Default chain (vuoto, no error) per gli scenari "happy path".
  supabase.from.mockImplementation(() => mockChain({ data: [], error: null }))
  supabase.rpc.mockResolvedValue({ data: null, error: null })
  // Silence console.error noise nelle assertion negative.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ---------------------------------------------------------------------------
// SHARED_KEYS / isSharedKey — subset puro
// ---------------------------------------------------------------------------
describe('SHARED_KEYS / isSharedKey', () => {
  it('SHARED_KEYS contiene le chiavi note shared', () => {
    expect(SHARED_KEYS).toContain('pasticceria-ricettario-v1')
    expect(SHARED_KEYS).toContain('pasticceria-formati-vendita-v1')
    expect(SHARED_KEYS).toContain('pasticceria-log-prezzi-v1')
    expect(SHARED_KEYS).toContain('pasticceria-organigramma-v1')
  })

  it('SHARED_KEYS NON contiene chiavi per-sede note', () => {
    expect(SHARED_KEYS).not.toContain('pasticceria-magazzino-v1')
    expect(SHARED_KEYS).not.toContain('pasticceria-chiusure-v1')
    expect(SHARED_KEYS).not.toContain('pasticceria-giornaliero-v1')
  })

  it('isSharedKey true per le chiavi shared note', () => {
    expect(isSharedKey('pasticceria-ricettario-v1')).toBe(true)
    expect(isSharedKey('pasticceria-ai-v1')).toBe(true)
    expect(isSharedKey('pasticceria-regole-v1')).toBe(true)
  })

  it('isSharedKey false per chiavi per-sede o sconosciute', () => {
    expect(isSharedKey('pasticceria-magazzino-v1')).toBe(false)
    expect(isSharedKey('chiave-inventata-v1')).toBe(false)
    expect(isSharedKey('')).toBe(false)
    expect(isSharedKey(null)).toBe(false)
    expect(isSharedKey(undefined)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// sload
// ---------------------------------------------------------------------------
describe('sload', () => {
  it('senza orgId ritorna null (no query)', async () => {
    const r = await sload('pasticceria-magazzino-v1', null, 'sede')
    expect(r).toBeNull()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('shared key: filtra sede_id IS NULL ignorando sedeId passato', async () => {
    const chain = mockChain({
      data: [{ data_value: { x: 1 }, updated_at: '2026-01-01' }],
      error: null,
    })
    supabase.from.mockImplementationOnce(() => chain)
    const r = await sload('pasticceria-ricettario-v1', 'org', 'sede-da-ignorare')
    expect(r).toEqual({ x: 1 })
    // Shared → si usa .is('sede_id', null), MAI .eq('sede_id', 'sede-da-ignorare').
    expect(chain.is).toHaveBeenCalledWith('sede_id', null)
    const eqCalls = chain.eq.mock.calls
    expect(eqCalls.some(c => c[0] === 'sede_id')).toBe(false)
  })

  it('per-sede key: filtra .eq("sede_id", sedeId)', async () => {
    const chain = mockChain({
      data: [{ data_value: 'val', updated_at: '2026-01-01' }],
      error: null,
    })
    supabase.from.mockImplementationOnce(() => chain)
    const r = await sload('pasticceria-magazzino-v1', 'org', 'sede-1')
    expect(r).toBe('val')
    expect(chain.eq).toHaveBeenCalledWith('sede_id', 'sede-1')
  })

  it('per-sede key con sedeId null: filtra .is("sede_id", null)', async () => {
    const chain = mockChain({ data: [], error: null })
    supabase.from.mockImplementationOnce(() => chain)
    await sload('pasticceria-magazzino-v1', 'org', null)
    expect(chain.is).toHaveBeenCalledWith('sede_id', null)
  })

  it('empty array → null', async () => {
    supabase.from.mockImplementationOnce(() => mockChain({ data: [], error: null }))
    expect(await sload('pasticceria-magazzino-v1', 'org', 's')).toBeNull()
  })

  it('row presente → ritorna data_value', async () => {
    supabase.from.mockImplementationOnce(() => mockChain({
      data: [{ data_value: { nested: [1, 2] }, updated_at: 'now' }],
      error: null,
    }))
    expect(await sload('pasticceria-magazzino-v1', 'org', 's')).toEqual({ nested: [1, 2] })
  })

  it('errore PGRST116 (no rows) → null (no retry)', async () => {
    supabase.from.mockImplementationOnce(() => mockChain({
      data: null, error: { code: 'PGRST116', message: 'no rows' },
    }))
    expect(await sload('pasticceria-magazzino-v1', 'org', 's')).toBeNull()
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('errore transient (status 500) → retry e poi null finale', async () => {
    // Forziamo 3 tentativi tutti falliti con status 500 (transient).
    supabase.from
      .mockImplementationOnce(() => mockChain({ data: null, error: { status: 500, message: 'srv' } }))
      .mockImplementationOnce(() => mockChain({ data: null, error: { status: 500, message: 'srv' } }))
      .mockImplementationOnce(() => mockChain({ data: null, error: { status: 500, message: 'srv' } }))
    const r = await sload('pasticceria-magazzino-v1', 'org', 's')
    expect(r).toBeNull()
    expect(supabase.from).toHaveBeenCalledTimes(3)
  }, 10000)

  it('errore permanente 4xx → fail fast (1 sola chiamata)', async () => {
    supabase.from.mockImplementationOnce(() => mockChain({
      data: null, error: { status: 403, message: 'forbidden' },
    }))
    expect(await sload('pasticceria-magazzino-v1', 'org', 's')).toBeNull()
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// ssave
// ---------------------------------------------------------------------------
describe('ssave', () => {
  it('senza orgId → throw', async () => {
    await expect(ssave('pasticceria-magazzino-v1', { x: 1 }, null, 's'))
      .rejects.toThrow(/orgId mancante/)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('shared key: forza sede_id=null su INSERT', async () => {
    // SELECT vuoto → INSERT path.
    const selChain = mockChain({ data: [], error: null })
    const insChain = mockChain({ error: null })
    supabase.from
      .mockImplementationOnce(() => selChain)  // SELECT
      .mockImplementationOnce(() => insChain)  // INSERT
    await ssave('pasticceria-ricettario-v1', { r: 1 }, 'org', 'sede-da-ignorare')
    expect(selChain.is).toHaveBeenCalledWith('sede_id', null)
    expect(insChain.insert).toHaveBeenCalledTimes(1)
    const payload = insChain.insert.mock.calls[0][0]
    expect(payload.sede_id).toBeNull()
    expect(payload.organization_id).toBe('org')
    expect(payload.data_key).toBe('pasticceria-ricettario-v1')
    expect(payload.data_value).toEqual({ r: 1 })
  })

  it('per-sede key INSERT: payload.sede_id corretto', async () => {
    const selChain = mockChain({ data: [], error: null })
    const insChain = mockChain({ error: null })
    supabase.from
      .mockImplementationOnce(() => selChain)
      .mockImplementationOnce(() => insChain)
    await ssave('pasticceria-magazzino-v1', { stock: 5 }, 'org', 'sede-A')
    expect(selChain.eq).toHaveBeenCalledWith('sede_id', 'sede-A')
    expect(insChain.insert.mock.calls[0][0].sede_id).toBe('sede-A')
  })

  it('row esistente → UPDATE su tutte (no INSERT)', async () => {
    const selChain = mockChain({ data: [{ id: 1 }, { id: 2 }], error: null })
    const updChain = mockChain({ error: null })
    supabase.from
      .mockImplementationOnce(() => selChain)
      .mockImplementationOnce(() => updChain)
    await ssave('pasticceria-magazzino-v1', { stock: 9 }, 'org', 'sede-A')
    expect(updChain.update).toHaveBeenCalledTimes(1)
    const upd = updChain.update.mock.calls[0][0]
    expect(upd.data_value).toEqual({ stock: 9 })
    expect(updChain.eq).toHaveBeenCalledWith('sede_id', 'sede-A')
  })

  it('SELECT error transient (5xx) → retry; alla fine ok', async () => {
    // Tentativo 1: SELECT 500. Tentativo 2: SELECT vuoto + INSERT ok.
    supabase.from
      .mockImplementationOnce(() => mockChain({ data: null, error: { status: 503, message: 'down' } }))
      .mockImplementationOnce(() => mockChain({ data: [], error: null }))   // SELECT 2
      .mockImplementationOnce(() => mockChain({ error: null }))             // INSERT 2
    await expect(ssave('pasticceria-magazzino-v1', { x: 1 }, 'org', 's')).resolves.toBeUndefined()
    expect(supabase.from).toHaveBeenCalledTimes(3)
  }, 10000)

  it('INSERT error permanente (constraint 23502) → throw', async () => {
    supabase.from
      .mockImplementationOnce(() => mockChain({ data: [], error: null }))   // SELECT
      .mockImplementationOnce(() => mockChain({ error: { code: '23502', message: 'not null' } }))
    await expect(ssave('pasticceria-magazzino-v1', { x: 1 }, 'org', 's'))
      .rejects.toThrow(/not null/)
  })

  it('race condition 23505 (duplicate key) → retry inline con UPDATE', async () => {
    const selChain = mockChain({ data: [], error: null })
    const insChain = mockChain({ error: { code: '23505', message: 'dup' } })
    const retryUpdChain = mockChain({ error: null })
    supabase.from
      .mockImplementationOnce(() => selChain)
      .mockImplementationOnce(() => insChain)
      .mockImplementationOnce(() => retryUpdChain)
    await expect(ssave('pasticceria-magazzino-v1', { x: 1 }, 'org', 's')).resolves.toBeUndefined()
    expect(retryUpdChain.update).toHaveBeenCalledTimes(1)
  })

  it('race 23505 ma anche UPDATE retry fallisce → throw', async () => {
    supabase.from
      .mockImplementationOnce(() => mockChain({ data: [], error: null }))
      .mockImplementationOnce(() => mockChain({ error: { code: '23505', message: 'dup' } }))
      .mockImplementationOnce(() => mockChain({ error: { code: '42501', message: 'rls' } }))
    await expect(ssave('pasticceria-magazzino-v1', { x: 1 }, 'org', 's'))
      .rejects.toThrow(/rls/)
  })

  it('UPDATE error 4xx → fail fast throw', async () => {
    supabase.from
      .mockImplementationOnce(() => mockChain({ data: [{ id: 1 }], error: null }))
      .mockImplementationOnce(() => mockChain({ error: { status: 403, message: 'denied' } }))
    await expect(ssave('pasticceria-magazzino-v1', { x: 1 }, 'org', 's'))
      .rejects.toThrow(/denied/)
  })
})

// ---------------------------------------------------------------------------
// ssaveBatch
// ---------------------------------------------------------------------------
describe('ssaveBatch', () => {
  it('senza orgId → throw', async () => {
    await expect(ssaveBatch([{ key: 'a', value: 1 }], null))
      .rejects.toThrow(/orgId mancante/)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('chiama RPC fos_user_data_set_batch con p_items normalizzati', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null })
    await ssaveBatch([
      { key: 'pasticceria-magazzino-v1', value: { m: 1 }, sedeId: 's-A' },
      { key: 'pasticceria-ricettario-v1', value: { r: 1 } },  // shared → sede null forzato
    ], 'org', 's-default')
    expect(supabase.rpc).toHaveBeenCalledWith('fos_user_data_set_batch', expect.any(Object))
    const { p_items } = supabase.rpc.mock.calls[0][1]
    expect(p_items).toHaveLength(2)
    expect(p_items[0]).toEqual({ data_key: 'pasticceria-magazzino-v1', sede_id: 's-A', data_value: { m: 1 } })
    expect(p_items[1]).toEqual({ data_key: 'pasticceria-ricettario-v1', sede_id: null, data_value: { r: 1 } })
  })

  it('fallback sede_id: usa il `sedeId` di default se item non lo passa', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null })
    await ssaveBatch([{ key: 'pasticceria-magazzino-v1', value: 1 }], 'org', 's-default')
    const { p_items } = supabase.rpc.mock.calls[0][1]
    expect(p_items[0].sede_id).toBe('s-default')
  })

  it('items null → p_items=[] e RPC chiamata vuota', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null })
    await ssaveBatch(null, 'org')
    expect(supabase.rpc).toHaveBeenCalledWith('fos_user_data_set_batch', { p_items: [] })
  })

  it('errore permanente (23502) → throw senza retry', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: '23502', message: 'nn' } })
    await expect(ssaveBatch([{ key: 'k', value: 1 }], 'org'))
      .rejects.toThrow(/nn/)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// sloadWithVersion
// ---------------------------------------------------------------------------
describe('sloadWithVersion', () => {
  it('senza orgId → { value:null, version:0 }', async () => {
    expect(await sloadWithVersion('k', null, 's')).toEqual({ value: null, version: 0 })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('row presente → { value, version }', async () => {
    supabase.from.mockImplementationOnce(() => mockChain({
      data: { data_value: { x: 1 }, version: 7 }, error: null,
    }))
    expect(await sloadWithVersion('pasticceria-magazzino-v1', 'org', 's'))
      .toEqual({ value: { x: 1 }, version: 7 })
  })

  it('shared key → filtra sede_id IS NULL', async () => {
    const chain = mockChain({ data: { data_value: 'v', version: 1 }, error: null })
    supabase.from.mockImplementationOnce(() => chain)
    await sloadWithVersion('pasticceria-ricettario-v1', 'org', 'sede-X')
    expect(chain.is).toHaveBeenCalledWith('sede_id', null)
  })

  it('row mancante (data=null) → { value:null, version:0 }', async () => {
    supabase.from.mockImplementationOnce(() => mockChain({ data: null, error: null }))
    expect(await sloadWithVersion('k', 'org', 's')).toEqual({ value: null, version: 0 })
  })

  it('error → { value:null, version:0 } (fail soft)', async () => {
    supabase.from.mockImplementationOnce(() => mockChain({ data: null, error: { message: 'x' } }))
    expect(await sloadWithVersion('k', 'org', 's')).toEqual({ value: null, version: 0 })
  })

  it('version assente nella row → 0 di default', async () => {
    supabase.from.mockImplementationOnce(() => mockChain({
      data: { data_value: 'v' /* no version */ }, error: null,
    }))
    expect(await sloadWithVersion('k', 'org', 's')).toEqual({ value: 'v', version: 0 })
  })
})

// ---------------------------------------------------------------------------
// ssaveVersioned
// ---------------------------------------------------------------------------
describe('ssaveVersioned', () => {
  it('senza orgId → throw', async () => {
    await expect(ssaveVersioned('k', {}, null, 's', 0)).rejects.toThrow(/orgId mancante/)
  })

  it('chiama RPC user_data_set_versioned con i parametri corretti', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 5, error: null })
    const v = await ssaveVersioned('pasticceria-magazzino-v1', { x: 1 }, 'org', 's-A', 4)
    expect(v).toBe(5)
    expect(supabase.rpc).toHaveBeenCalledWith('user_data_set_versioned', {
      p_org_id: 'org',
      p_data_key: 'pasticceria-magazzino-v1',
      p_data_value: { x: 1 },
      p_sede_id: 's-A',
      p_expected_version: 4,
    })
  })

  it('shared key → sede_id forzato a null', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 1, error: null })
    await ssaveVersioned('pasticceria-ricettario-v1', {}, 'org', 'sede-X', 0)
    expect(supabase.rpc.mock.calls[0][1].p_sede_id).toBeNull()
  })

  it('mismatch versione (data=null) → null', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await ssaveVersioned('k', {}, 'org', 's', 99)).toBeNull()
  })

  it('error → throw', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc kaboom' } })
    await expect(ssaveVersioned('k', {}, 'org', 's', 0)).rejects.toThrow(/rpc kaboom/)
  })

  it('expectedVersion omesso → default 0', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 1, error: null })
    await ssaveVersioned('k', {}, 'org', 's')
    expect(supabase.rpc.mock.calls[0][1].p_expected_version).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// sloadAllSedi
// ---------------------------------------------------------------------------
describe('sloadAllSedi', () => {
  it('senza orgId → {}', async () => {
    expect(await sloadAllSedi('k', null)).toEqual({})
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('shared key → { shared: value } via sload', async () => {
    supabase.from.mockImplementationOnce(() => mockChain({
      data: [{ data_value: { r: 1 }, updated_at: 'now' }], error: null,
    }))
    expect(await sloadAllSedi('pasticceria-ricettario-v1', 'org'))
      .toEqual({ shared: { r: 1 } })
  })

  it('per-sede → raggruppa per sede_id, prima row per sede vince (order desc)', async () => {
    supabase.from.mockImplementationOnce(() => mockChain({
      data: [
        { sede_id: 'A', data_value: 'A-new', updated_at: '2026-06-02' },
        { sede_id: 'A', data_value: 'A-old', updated_at: '2026-06-01' },
        { sede_id: 'B', data_value: 'B', updated_at: '2026-06-01' },
      ],
      error: null,
    }))
    expect(await sloadAllSedi('pasticceria-magazzino-v1', 'org'))
      .toEqual({ A: 'A-new', B: 'B' })
  })

  it('per-sede default: esclude sede_id NULL (filtro .not)', async () => {
    const chain = mockChain({
      data: [{ sede_id: 'A', data_value: 'a', updated_at: 'x' }],
      error: null,
    })
    supabase.from.mockImplementationOnce(() => chain)
    await sloadAllSedi('pasticceria-magazzino-v1', 'org')
    expect(chain.not).toHaveBeenCalledWith('sede_id', 'is', null)
  })

  it('includeLegacyNull:true → include `_legacy` per sede_id NULL e NO filtro .not', async () => {
    const chain = mockChain({
      data: [
        { sede_id: 'A', data_value: 'a', updated_at: '2026-01-02' },
        { sede_id: null, data_value: 'legacy', updated_at: '2026-01-01' },
      ],
      error: null,
    })
    supabase.from.mockImplementationOnce(() => chain)
    const out = await sloadAllSedi('pasticceria-magazzino-v1', 'org', { includeLegacyNull: true })
    expect(out).toEqual({ A: 'a', _legacy: 'legacy' })
    expect(chain.not).not.toHaveBeenCalled()
  })

  it('errore supabase → {} (fail soft)', async () => {
    supabase.from.mockImplementationOnce(() => mockChain({
      data: null, error: { message: 'broken' },
    }))
    expect(await sloadAllSedi('pasticceria-magazzino-v1', 'org')).toEqual({})
  })

  it('data null → out vuoto', async () => {
    supabase.from.mockImplementationOnce(() => mockChain({ data: null, error: null }))
    expect(await sloadAllSedi('pasticceria-magazzino-v1', 'org')).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// sdelete
// ---------------------------------------------------------------------------
describe('sdelete', () => {
  it('senza orgId → no-op (nessuna query)', async () => {
    await sdelete('k', null, 's')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('shared key → DELETE con .is("sede_id", null)', async () => {
    const chain = mockChain({ error: null })
    supabase.from.mockImplementationOnce(() => chain)
    await sdelete('pasticceria-ricettario-v1', 'org', 'sede-da-ignorare')
    expect(chain.delete).toHaveBeenCalledTimes(1)
    expect(chain.is).toHaveBeenCalledWith('sede_id', null)
  })

  it('per-sede key → DELETE con .eq("sede_id", sedeId)', async () => {
    const chain = mockChain({ error: null })
    supabase.from.mockImplementationOnce(() => chain)
    await sdelete('pasticceria-magazzino-v1', 'org', 'sede-A')
    expect(chain.delete).toHaveBeenCalledTimes(1)
    expect(chain.eq).toHaveBeenCalledWith('sede_id', 'sede-A')
  })

  it('per-sede key con sedeId null → DELETE con .is("sede_id", null)', async () => {
    const chain = mockChain({ error: null })
    supabase.from.mockImplementationOnce(() => chain)
    await sdelete('pasticceria-magazzino-v1', 'org', null)
    expect(chain.is).toHaveBeenCalledWith('sede_id', null)
  })

  it('errore → log ma non throw', async () => {
    supabase.from.mockImplementationOnce(() => mockChain({
      error: { message: 'oops' },
    }))
    await expect(sdelete('pasticceria-magazzino-v1', 'org', 's')).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})
