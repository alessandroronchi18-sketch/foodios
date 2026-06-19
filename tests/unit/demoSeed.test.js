// Demo seed: verifica che i dati popolati siano coerenti (ricette con
// ingredienti che hanno prezzi in ingredienti_costi, magazzino con quantita
// positive, chiusure con KPI sensati).
//
// NB: NON testa la persistenza Supabase (richiederebbe mock pesante). Testa
// la STRUTTURA dei dati che il seeder produce.

import { describe, it, expect, vi } from 'vitest'

// Per evitare di triggerare l'init Supabase, mockiamo il modulo.
vi.mock('../../src/lib/storage', () => ({
  ssave: vi.fn(async () => true),
}))
// Mock dinamico per supabase: i test che testano hasDemoData possono
// overriddare la chain via supabaseRef.responseQueue.
const supabaseRef = {
  responseQueue: [],  // [{ data, error }] in ordine FIFO
  selectError: null,
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: async () => ({ error: null }),
      select: () => ({
        eq: function () {
          return this  // chain
        },
        maybeSingle: async () => {
          if (supabaseRef.selectError) throw supabaseRef.selectError
          const next = supabaseRef.responseQueue.shift()
          return next || { data: null, error: null }
        },
      }),
    }),
  },
}))

import { seedDemoData, hasDemoData } from '../../src/lib/demoSeed'
import { ssave } from '../../src/lib/storage'

describe('seedDemoData — struttura', () => {
  it('throws se orgId mancante', async () => {
    await expect(seedDemoData({ orgId: null })).rejects.toThrow('orgId richiesto')
  })

  it('ritorna count corretti su 5 ricette + 15 ingredienti + 15 magazzino + chiusure', async () => {
    const res = await seedDemoData({ orgId: 'fake-org', sedeId: 'fake-sede' })
    expect(res.ok).toBe(true)
    expect(res.counts.ricette).toBe(5)
    expect(res.counts.ingredienti).toBe(15)
    expect(res.counts.magazzino).toBe(15)
    // Chiusure: 6 giorni feriali su 7 (domenica esclusa, range 7gg fa).
    expect(res.counts.chiusure).toBeGreaterThanOrEqual(5)
    expect(res.counts.chiusure).toBeLessThanOrEqual(6)
  })

  it('chiama ssave 3 volte (ricettario shared + magazzino+chiusure per-sede)', async () => {
    ssave.mockClear()
    await seedDemoData({ orgId: 'fake-org', sedeId: 'fake-sede' })
    expect(ssave).toHaveBeenCalledTimes(3)
    // ricettario salvato con sedeId=null (shared)
    const ricCall = ssave.mock.calls.find(c => c[0] === 'pasticceria-ricettario-v1')
    expect(ricCall[3]).toBeNull() // 4th arg sedeId
    // magazzino + chiusure salvati con sedeId
    const magCall = ssave.mock.calls.find(c => c[0] === 'pasticceria-magazzino-v1')
    expect(magCall[3]).toBe('fake-sede')
  })

  it('ricette demo hanno tutti gli ingredienti coperti in ingredienti_costi', async () => {
    ssave.mockClear()
    await seedDemoData({ orgId: 'fake-org', sedeId: 'fake-sede' })
    const ricCall = ssave.mock.calls.find(c => c[0] === 'pasticceria-ricettario-v1')
    const ricettario = ricCall[1]
    const costi = ricettario.ingredienti_costi
    for (const [nomeRic, ric] of Object.entries(ricettario.ricette)) {
      for (const ing of ric.ingredienti) {
        expect(costi[ing.nome], `${nomeRic} usa ingrediente "${ing.nome}" non in ingredienti_costi`)
          .toBeDefined()
      }
    }
  })

  it('magazzino demo: tutte giacenze > soglia (no soglia-violation iniziale)', async () => {
    ssave.mockClear()
    await seedDemoData({ orgId: 'fake-org', sedeId: 'fake-sede' })
    const magCall = ssave.mock.calls.find(c => c[0] === 'pasticceria-magazzino-v1')
    const magazzino = magCall[1]
    for (const [k, v] of Object.entries(magazzino)) {
      expect(v.giacenza_g, `${k} giacenza`).toBeGreaterThan(0)
      expect(v.giacenza_g, `${k} sopra soglia`).toBeGreaterThan(v.soglia_g)
    }
  })

  it('chiusure demo hanno tutte _demo:true (per cleanup futuro)', async () => {
    ssave.mockClear()
    await seedDemoData({ orgId: 'fake-org', sedeId: 'fake-sede' })
    const chiusCall = ssave.mock.calls.find(c => c[0] === 'pasticceria-chiusure-v1')
    const chiusure = chiusCall[1]
    expect(Array.isArray(chiusure)).toBe(true)
    for (const c of chiusure) {
      expect(c._demo).toBe(true)
      expect(c.id).toMatch(/^demo-ch-/)
      expect(c.kpi.totV).toBeGreaterThan(0)
      expect(c.kpi.totFC).toBeGreaterThan(0)
    }
  })
})

describe('hasDemoData', () => {
  it('senza orgId → false', async () => {
    expect(await hasDemoData({ orgId: null })).toBe(false)
  })

  it('select error → false (fail-safe)', async () => {
    supabaseRef.selectError = new Error('db down')
    expect(await hasDemoData({ orgId: 'o', sedeId: 's' })).toBe(false)
    supabaseRef.selectError = null
  })

  it('row con data_value array contenente _demo=true → true', async () => {
    supabaseRef.responseQueue.push({ data: { data_value: [{ _demo: true }, { id: 'altra' }] } })
    expect(await hasDemoData({ orgId: 'o', sedeId: 's' })).toBe(true)
  })

  it('row con id che inizia per "demo-ch-" → true', async () => {
    supabaseRef.responseQueue.push({ data: { data_value: [{ id: 'demo-ch-2026-06-15' }] } })
    expect(await hasDemoData({ orgId: 'o', sedeId: 's' })).toBe(true)
  })

  it('row senza dati demo → false', async () => {
    supabaseRef.responseQueue.push({ data: { data_value: [{ id: 'ch-2026', _demo: false }] } })
    expect(await hasDemoData({ orgId: 'o', sedeId: 's' })).toBe(false)
  })

  it('data_value non-array → false (no crash)', async () => {
    supabaseRef.responseQueue.push({ data: { data_value: { broken: true } } })
    expect(await hasDemoData({ orgId: 'o', sedeId: 's' })).toBe(false)
  })

  it('row mancante → false', async () => {
    supabaseRef.responseQueue.push({ data: null })
    expect(await hasDemoData({ orgId: 'o', sedeId: 's' })).toBe(false)
  })
})
