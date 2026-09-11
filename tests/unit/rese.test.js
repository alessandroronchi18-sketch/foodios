// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getResaIngrediente, setResaIngrediente, hasResaIngrediente,
  loadRese, costoNettoPerG, getStoreRese, resetRese,
} from '../../src/lib/rese.js'

describe('rese', () => {
  beforeEach(() => {
    // azzera lo store mutabile tra i test
    for (const k of Object.keys(getStoreRese())) setResaIngrediente(k, 1.0)
  })

  it('default 1.0 per ingrediente non impostato', () => {
    expect(getResaIngrediente('mai_visto_xyz')).toBe(1.0)
  })

  it('hasResaIngrediente: false se non impostato, true dopo set', () => {
    expect(hasResaIngrediente('nuovo_ing')).toBe(false)
    setResaIngrediente('nuovo_ing', 0.8)
    expect(hasResaIngrediente('nuovo_ing')).toBe(true)
  })

  it('setResaIngrediente clampa tra 0.01 e 1.0 (0/NaN -> default 1.0)', () => {
    setResaIngrediente('a', 5);     expect(getResaIngrediente('a')).toBe(1.0)  // sopra il max
    setResaIngrediente('b', 0.005); expect(getResaIngrediente('b')).toBe(0.01) // sotto il min
    setResaIngrediente('c', 0.5);   expect(getResaIngrediente('c')).toBe(0.5)
    // resa 0 (o non numerica) non è valida: il codice la tratta come 100% (1.0).
    setResaIngrediente('d', 0);     expect(getResaIngrediente('d')).toBe(1.0)
  })

  it('costoNettoPerG = costoLordo / resa', () => {
    setResaIngrediente('uova', 0.8)
    expect(costoNettoPerG(0.01, 'uova')).toBeCloseTo(0.0125, 6)
    // resa 1.0 (default) -> invariato
    expect(costoNettoPerG(0.02, 'senza_resa')).toBeCloseTo(0.02, 6)
  })

  it('loadRese carica e clampa un oggetto', () => {
    loadRese({ x: 0.7, y: 9, z: -1 })
    expect(getResaIngrediente('x')).toBe(0.7)
    expect(getResaIngrediente('y')).toBe(1.0)
    expect(getResaIngrediente('z')).toBe(0.01)
  })
})

// ── Le rese vanno nel DATABASE, non solo nel browser ──────────────────────
//
// La resa cambia il food cost: se le uova rendono l'85%, 100 g comprati danno
// 85 g usabili e il costo per grammo usabile sale del 18%. Fino all'11/09/2026
// queste rese stavano SOLO nel localStorage: la chiave `pasticceria-rese-v1`
// non esisteva in nessuna riga di user_data, in tutto il database. Quindi il
// titolare impostava "uova 85%" sul portatile e sul tablet in laboratorio la
// stessa ricetta mostrava un food cost diverso; svuotando i dati del browser
// le rese sparivano senza un avviso; i dipendenti non le vedevano mai.
describe('salvaRese / caricaRese', () => {
  let salvate = null
  let nelDb = null

  beforeEach(() => {
    salvate = null
    nelDb = null
    resetRese()
    try { localStorage.removeItem('pasticceria-rese-v1') } catch { /* noop */ }
    vi.resetModules()
    vi.doMock('../../src/lib/storage', () => ({
      ssave: async (k, v) => { salvate = { k, v } },
      sload: async () => nelDb,
    }))
  })

  it('salva prima sul database e poi nel browser', async () => {
    const { setResaIngrediente, salvaRese } = await import('../../src/lib/rese.js')
    setResaIngrediente('uova', 0.85)
    await salvaRese('org-1')
    expect(salvate.k).toBe('pasticceria-rese-v1')
    expect(salvate.v.uova).toBeCloseTo(0.85, 3)
    expect(JSON.parse(localStorage.getItem('pasticceria-rese-v1')).uova).toBeCloseTo(0.85, 3)
  })

  it('se il database rifiuta, lo dice invece di far credere che sia salvato', async () => {
    vi.doMock('../../src/lib/storage', () => ({
      ssave: async () => { throw new Error('rete') },
      sload: async () => null,
    }))
    const { setResaIngrediente, salvaRese } = await import('../../src/lib/rese.js')
    setResaIngrediente('uova', 0.9)
    await expect(salvaRese('org-1')).rejects.toThrow('rete')
  })

  it('il database vince sul browser', async () => {
    localStorage.setItem('pasticceria-rese-v1', JSON.stringify({ uova: 0.5 }))
    nelDb = { uova: 0.85 }
    const { caricaRese, getResaIngrediente } = await import('../../src/lib/rese.js')
    const esito = await caricaRese('org-1')
    expect(esito.origine).toBe('database')
    expect(getResaIngrediente('uova')).toBeCloseTo(0.85, 3)
  })

  it('quello che era solo nel browser viene portato su una volta sola', async () => {
    localStorage.setItem('pasticceria-rese-v1', JSON.stringify({ uova: 0.85, burro: 0.98 }))
    nelDb = null
    const { caricaRese, getResaIngrediente } = await import('../../src/lib/rese.js')
    const esito = await caricaRese('org-1')
    expect(esito.origine).toBe('browser')
    expect(esito.migrate).toBe(2)
    expect(salvate.v.uova).toBeCloseTo(0.85, 3)
    expect(getResaIngrediente('burro')).toBeCloseTo(0.98, 3)
  })

  it('senza azienda si arrangia col browser, senza esplodere', async () => {
    localStorage.setItem('pasticceria-rese-v1', JSON.stringify({ uova: 0.85 }))
    const { caricaRese, getResaIngrediente } = await import('../../src/lib/rese.js')
    const esito = await caricaRese(null)
    expect(esito.origine).toBe('browser')
    expect(getResaIngrediente('uova')).toBeCloseTo(0.85, 3)
  })
})
