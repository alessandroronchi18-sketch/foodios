import { describe, it, expect } from 'vitest'
import { dedupKey, ruleBasedSuggestions } from '../../api/lib/aiEngine.js'

describe('dedupKey', () => {
  it('produce chiavi deterministiche per stesso input', () => {
    const a = dedupKey({ orgId: 'org-1', sedeId: 'sede-1', tipo: 'food_cost_alto', entity: '2026-05' })
    const b = dedupKey({ orgId: 'org-1', sedeId: 'sede-1', tipo: 'food_cost_alto', entity: '2026-05' })
    expect(a).toBe(b)
  })

  it('chiavi diverse per org diversi', () => {
    const a = dedupKey({ orgId: 'org-1', sedeId: 'sede-1', tipo: 'fattura_scaduta', entity: 'f1' })
    const b = dedupKey({ orgId: 'org-2', sedeId: 'sede-1', tipo: 'fattura_scaduta', entity: 'f1' })
    expect(a).not.toBe(b)
  })

  it('chiavi diverse per entity diverse', () => {
    const a = dedupKey({ orgId: 'org-1', sedeId: 'sede-1', tipo: 'mp_sotto_soglia', entity: 'pistacchio' })
    const b = dedupKey({ orgId: 'org-1', sedeId: 'sede-1', tipo: 'mp_sotto_soglia', entity: 'farina' })
    expect(a).not.toBe(b)
  })

  it('lowercase + trim sui pezzi', () => {
    const a = dedupKey({ orgId: 'org-1', tipo: 'X', entity: 'PISTACCHIO ' })
    const b = dedupKey({ orgId: 'org-1', tipo: 'x', entity: 'pistacchio' })
    expect(a).toBe(b)
  })

  it('sedeId mancante → fallback "org"', () => {
    const k = dedupKey({ orgId: 'org-1', tipo: 'x', entity: 'foo' })
    expect(k).toContain('org')
  })
})

describe('ruleBasedSuggestions', () => {
  const ctx = { orgId: 'org-1', sedeId: 'sede-1' }
  const baseSnap = {
    date: '2026-05-15',
    sedeId: 'sede-1',
    ricaviIeri: 0, ricaviSettCorr: 0, ricaviSettPrec: 0,
    foodCostMedio: null, foodCostIeri: null,
    topProdotto: null, prodottiInCalo: [], mpSottoSoglia: [],
    fattureScadute: [], fattureInScadenza7gg: [],
    chiusureMancanti: [], turniScoperti: [],
  }

  it('snapshot vuoto → zero suggerimenti', () => {
    expect(ruleBasedSuggestions(baseSnap, ctx)).toEqual([])
  })

  it('mp sotto soglia → suggerimento warning', () => {
    const snap = { ...baseSnap, mpSottoSoglia: [{ nome: 'pistacchio', giacenza: 200, soglia: 500, sede: 'Centro' }] }
    const out = ruleBasedSuggestions(snap, ctx)
    expect(out.length).toBe(1)
    expect(out[0].tipo).toBe('magazzino_sotto_soglia')
    expect(out[0].severita).toBe('warning')
    expect(out[0].cta_view).toBe('magazzino')
  })

  it('fattura scaduta → suggerimento critical', () => {
    const snap = { ...baseSnap, fattureScadute: [{ id: 'f1', fornitore: 'X', importo: 100, scadenza: '2026-04-30' }] }
    const out = ruleBasedSuggestions(snap, ctx)
    expect(out.find(s => s.tipo === 'fattura_scaduta')?.severita).toBe('critical')
  })

  it('food cost > 38% → warning, > 42% → critical', () => {
    const out1 = ruleBasedSuggestions({ ...baseSnap, foodCostMedio: 40 }, ctx)
    expect(out1.find(s => s.tipo === 'food_cost_alto')?.severita).toBe('warning')
    const out2 = ruleBasedSuggestions({ ...baseSnap, foodCostMedio: 45 }, ctx)
    expect(out2.find(s => s.tipo === 'food_cost_alto')?.severita).toBe('critical')
  })

  it('ricavi in crescita >= 15% → opportunity', () => {
    const snap = { ...baseSnap, ricaviSettCorr: 1500, ricaviSettPrec: 1000 }
    const out = ruleBasedSuggestions(snap, ctx)
    expect(out.find(s => s.tipo === 'ricavi_in_crescita')?.severita).toBe('opportunity')
  })

  it('ricavi in calo >= 15% → warning', () => {
    const snap = { ...baseSnap, ricaviSettCorr: 700, ricaviSettPrec: 1000 }
    const out = ruleBasedSuggestions(snap, ctx)
    expect(out.find(s => s.tipo === 'ricavi_in_calo')?.severita).toBe('warning')
  })

  it('chiusura mancante → info', () => {
    const snap = { ...baseSnap, chiusureMancanti: ['2026-05-13', '2026-05-14'] }
    const out = ruleBasedSuggestions(snap, ctx)
    expect(out.find(s => s.tipo === 'chiusura_mancante')).toBeDefined()
  })

  it('dedup_key univoca per suggerimento', () => {
    const snap = {
      ...baseSnap,
      mpSottoSoglia: [
        { nome: 'pistacchio', giacenza: 100, soglia: 500 },
        { nome: 'farina', giacenza: 100, soglia: 500 },
      ],
    }
    const out = ruleBasedSuggestions(snap, ctx)
    const keys = out.map(s => s.dedup_key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('limita mpSottoSoglia top 5 (anti-spam)', () => {
    const snap = {
      ...baseSnap,
      mpSottoSoglia: Array.from({ length: 10 }).map((_, i) => ({ nome: `mp${i}`, giacenza: 100, soglia: 500 })),
    }
    const out = ruleBasedSuggestions(snap, ctx).filter(s => s.tipo === 'magazzino_sotto_soglia')
    expect(out.length).toBeLessThanOrEqual(5)
  })

  it('expires_at sempre futuro', () => {
    const snap = { ...baseSnap, mpSottoSoglia: [{ nome: 'x', giacenza: 0, soglia: 100 }] }
    const out = ruleBasedSuggestions(snap, ctx)
    const exp = new Date(out[0].expires_at).getTime()
    expect(exp).toBeGreaterThan(Date.now())
  })
})
