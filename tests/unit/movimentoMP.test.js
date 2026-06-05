import { describe, it, expect, beforeEach, vi } from 'vitest'

// Store in-memory che simula user_data per-sede (keyed orgId::sedeId).
const { store } = vi.hoisted(() => ({ store: new Map() }))
const k = (orgId, sedeId) => `${orgId}::${sedeId}`

vi.mock('../../src/lib/storage.js', () => ({
  sload: vi.fn(async (key, orgId, sedeId) => store.get(k(orgId, sedeId)) ?? null),
  ssave: vi.fn(async (key, val, orgId, sedeId) => { store.set(k(orgId, sedeId), val) }),
}))

import {
  getGiacenzaMP, spostaMaterialePrima, rollbackMaterialePrima, scaricoMP, caricoMP,
} from '../../src/lib/movimentoMP.js'

const ORG = 'org1'

beforeEach(() => {
  store.clear()
  store.set(k(ORG, 'A'), { farina: { giacenza_g: 1000, soglia_g: 200 } })
  store.set(k(ORG, 'B'), { farina: { giacenza_g: 100, soglia_g: 0 } })
})

describe('getGiacenzaMP', () => {
  it('legge la giacenza corrente (0 se assente)', async () => {
    expect(await getGiacenzaMP(ORG, 'A', 'farina')).toBe(1000)
    expect(await getGiacenzaMP(ORG, 'A', 'zucchero')).toBe(0)
  })
})

describe('spostaMaterialePrima', () => {
  it('sposta grammi da A a B', async () => {
    const res = await spostaMaterialePrima({ orgId: ORG, sedeDa: 'A', sedeA: 'B', ingrediente: 'farina', quantita: 300 })
    expect(res.giacenzaDa).toBe(700)
    expect(res.giacenzaA).toBe(400)
    expect(await getGiacenzaMP(ORG, 'A', 'farina')).toBe(700)
    expect(await getGiacenzaMP(ORG, 'B', 'farina')).toBe(400)
  })

  it('crea la voce nella sede destinazione se non esiste', async () => {
    await spostaMaterialePrima({ orgId: ORG, sedeDa: 'A', sedeA: 'B', ingrediente: 'zucchero', quantita: 0 }).catch(() => {})
    store.set(k(ORG, 'A'), { zucchero: { giacenza_g: 500 } })
    await spostaMaterialePrima({ orgId: ORG, sedeDa: 'A', sedeA: 'B', ingrediente: 'zucchero', quantita: 200 })
    expect(await getGiacenzaMP(ORG, 'B', 'zucchero')).toBe(200)
  })

  it('lancia se disponibilità insufficiente (senza consentiNegativo)', async () => {
    await expect(spostaMaterialePrima({ orgId: ORG, sedeDa: 'A', sedeA: 'B', ingrediente: 'farina', quantita: 5000 }))
      .rejects.toThrow(/insufficiente/i)
    // nessuna mutazione
    expect(await getGiacenzaMP(ORG, 'A', 'farina')).toBe(1000)
  })

  it('valida parametri (sedi uguali, qta<=0, orgId mancante)', async () => {
    await expect(spostaMaterialePrima({ orgId: ORG, sedeDa: 'A', sedeA: 'A', ingrediente: 'farina', quantita: 10 })).rejects.toThrow(/coincid/i)
    await expect(spostaMaterialePrima({ orgId: ORG, sedeDa: 'A', sedeA: 'B', ingrediente: 'farina', quantita: 0 })).rejects.toThrow(/Quantita/i)
    await expect(spostaMaterialePrima({ sedeDa: 'A', sedeA: 'B', ingrediente: 'farina', quantita: 10 })).rejects.toThrow(/orgId/i)
  })

  it('non scende sotto zero in partenza (Math.max 0)', async () => {
    await spostaMaterialePrima({ orgId: ORG, sedeDa: 'A', sedeA: 'B', ingrediente: 'farina', quantita: 1000, consentiNegativo: true })
    expect(await getGiacenzaMP(ORG, 'A', 'farina')).toBe(0)
  })
})

describe('rollbackMaterialePrima', () => {
  it('inverte un trasferimento A→B riportando la MP in A', async () => {
    await spostaMaterialePrima({ orgId: ORG, sedeDa: 'A', sedeA: 'B', ingrediente: 'farina', quantita: 300 })
    await rollbackMaterialePrima({ orgId: ORG, sedeDa: 'A', sedeA: 'B', ingrediente: 'farina', quantita: 300 })
    expect(await getGiacenzaMP(ORG, 'A', 'farina')).toBe(1000)
    expect(await getGiacenzaMP(ORG, 'B', 'farina')).toBe(100)
  })
})

describe('scaricoMP / caricoMP', () => {
  it('scarico riduce, lancia se insufficiente', async () => {
    expect(await scaricoMP({ orgId: ORG, sedeId: 'A', ingrediente: 'farina', quantita: 400 })).toBe(600)
    await expect(scaricoMP({ orgId: ORG, sedeId: 'A', ingrediente: 'farina', quantita: 99999 })).rejects.toThrow(/insufficiente/i)
  })
  it('carico incrementa (crea voce se assente)', async () => {
    expect(await caricoMP({ orgId: ORG, sedeId: 'B', ingrediente: 'farina', quantita: 50 })).toBe(150)
    expect(await caricoMP({ orgId: ORG, sedeId: 'B', ingrediente: 'burro', quantita: 80 })).toBe(80)
  })
})
