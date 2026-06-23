import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { dedupKey, ruleBasedSuggestions, collectOrgSnapshot, callClaude } from '../../api/lib/aiEngine.js'

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

  // ─── Edge case: truncation nome fornitore (audit PII) ──────────────────
  it('fattura scaduta con fornitore già troncato a 24 char rimane inalterato', () => {
    // collectOrgSnapshot tronca al volo, qui simuliamo già troncato
    const long = 'PASTICCERIA MARA DEI BOS…'
    const snap = { ...baseSnap, fattureScadute: [{ id: 'f9', fornitore: long, importo: 50.5, scadenza: '2026-04-01' }] }
    const out = ruleBasedSuggestions(snap, ctx)
    const f = out.find(s => s.tipo === 'fattura_scaduta')
    expect(f).toBeDefined()
    expect(f.titolo).toContain(long)
    expect(f.descrizione).toContain('€50.50')
  })

  it('food cost esattamente 38 → NON genera suggerimento (soglia stretta >38)', () => {
    const out = ruleBasedSuggestions({ ...baseSnap, foodCostMedio: 38 }, ctx)
    expect(out.find(s => s.tipo === 'food_cost_alto')).toBeUndefined()
  })

  it('ricavi delta esattamente 15% → genera ricavi_in_crescita (>= 15)', () => {
    // 1150 vs 1000 → +15% esatto.
    const out = ruleBasedSuggestions({ ...baseSnap, ricaviSettCorr: 1150, ricaviSettPrec: 1000 }, ctx)
    expect(out.find(s => s.tipo === 'ricavi_in_crescita')).toBeDefined()
  })

  it('ricavi delta 14.9% → nessun trigger (sotto soglia)', () => {
    const out = ruleBasedSuggestions({ ...baseSnap, ricaviSettCorr: 1149, ricaviSettPrec: 1000 }, ctx)
    expect(out.find(s => s.tipo === 'ricavi_in_crescita')).toBeUndefined()
    expect(out.find(s => s.tipo === 'ricavi_in_calo')).toBeUndefined()
  })

  it('ricavi prec=0 → no suggestion (divisione per zero evitata)', () => {
    const out = ruleBasedSuggestions({ ...baseSnap, ricaviSettCorr: 999, ricaviSettPrec: 0 }, ctx)
    expect(out.find(s => s.tipo === 'ricavi_in_crescita')).toBeUndefined()
    expect(out.find(s => s.tipo === 'ricavi_in_calo')).toBeUndefined()
  })

  it('turni scoperti → singolare/plurale nel titolo', () => {
    const o1 = ruleBasedSuggestions({ ...baseSnap, turniScoperti: [{ data: '2026-06-18', sede: 'X' }] }, ctx)
    expect(o1.find(s => s.tipo === 'turni_scoperti').titolo).toContain('1 turno')
    const o2 = ruleBasedSuggestions({ ...baseSnap, turniScoperti: [
      { data: '2026-06-18', sede: 'X' }, { data: '2026-06-19', sede: 'Y' },
    ] }, ctx)
    expect(o2.find(s => s.tipo === 'turni_scoperti').titolo).toContain('2 turni')
  })
})

// ─── collectOrgSnapshot ─────────────────────────────────────────────────
// Mock Supabase con builder pattern fluente. La funzione fa molte query
// concatenate; mockiamo solo lo strettamente necessario.

// Builder helper: ritorna un mock supabase il cui from() risponde con
// una mappa { tabella: handler({ key }) } in base alla data_key richiesta.
function mockSupabase({ sedi = [], userData = {}, fatture = [], turni = [] } = {}) {
  // userData = { [`${sedeId}|${data_key}`]: value }
  const builder = (handler) => {
    const b = {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      neq: vi.fn(() => b),
      lte: vi.fn(() => b),
      gte: vi.fn(() => b),
      maybeSingle: vi.fn(() => handler()),
      then: undefined, // not a thenable; resolve via maybeSingle or final method
    }
    return b
  }
  return {
    from: vi.fn((table) => {
      const state = { table, filters: {} }
      const chain = {
        _state: state,
        select: vi.fn(function (..._args) { return chain }),
        eq: vi.fn(function (col, val) { state.filters[col] = val; return chain }),
        neq: vi.fn(function (col, val) { state.filters[`!${col}`] = val; return chain }),
        lte: vi.fn(function (col, val) { state.filters[`<=${col}`] = val; return chain }),
        gte: vi.fn(function (col, val) { state.filters[`>=${col}`] = val; return chain }),
        maybeSingle: vi.fn(async function () {
          if (state.table === 'user_data') {
            const k = `${state.filters.sede_id}|${state.filters.data_key}`
            if (userData[k] !== undefined) return { data: { data_value: userData[k] } }
            return { data: null }
          }
          return { data: null }
        }),
        // Per query terminali senza maybeSingle (await chain finale)
        then: function (resolve, reject) {
          if (state.table === 'sedi') return resolve({ data: sedi })
          if (state.table === 'fatture') return resolve({ data: fatture })
          if (state.table === 'turni') return resolve({ data: turni })
          return resolve({ data: [] })
        },
      }
      return chain
    }),
  }
}

describe('collectOrgSnapshot', () => {
  it('snapshot base: zero sedi → tutti i campi default vuoti', async () => {
    const supabase = mockSupabase({ sedi: [] })
    const snap = await collectOrgSnapshot({ supabase, orgId: 'org-1' })
    expect(snap.ricaviIeri).toBe(0)
    expect(snap.ricaviSettCorr).toBe(0)
    expect(snap.foodCostMedio).toBeNull()
    expect(snap.foodCostIeri).toBeNull()
    expect(snap.mpSottoSoglia).toEqual([])
    expect(snap.fattureScadute).toEqual([])
    expect(snap.fattureInScadenza7gg).toEqual([])
    expect(snap.chiusureMancanti.length).toBeGreaterThanOrEqual(1)
    expect(snap.turniScoperti).toEqual([])
  })

  it('date in formato YYYY-MM-DD locale (timezone Europe/Rome, audit 2026-07-01 LOW)', async () => {
    const supabase = mockSupabase()
    const snap = await collectOrgSnapshot({ supabase, orgId: 'org-1' })
    expect(snap.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // localIsoDate(today) NON deve drift di un giorno per TZ.
    const now = new Date()
    const expectedLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(snap.date).toBe(expectedLocal)
  })

  it('ricavi: somma chiusure di ieri della sede attiva', async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const yest = new Date(today); yest.setDate(yest.getDate() - 1)
    const yIso = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`
    const supabase = mockSupabase({
      sedi: [{ id: 'sede-A', nome: 'Centro' }],
      userData: {
        'sede-A|pasticceria-chiusure-v1': [
          { data: yIso, kpi: { totV: 500 } },
          { data: yIso, totale: 300 },
        ],
      },
    })
    const snap = await collectOrgSnapshot({ supabase, orgId: 'org-1', sedeId: 'sede-A' })
    expect(snap.ricaviIeri).toBe(800)
  })

  it('fatture scadute: tronca fornitore a 24 char + ellipsis (audit PII)', async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const past = new Date(today); past.setDate(past.getDate() - 5)
    const pIso = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`
    const supabase = mockSupabase({
      sedi: [{ id: 'sede-A', nome: 'X' }],
      fatture: [
        // 30 char → deve essere troncato a 24 + ellipsis
        { id: 'f1', fornitore_nome: 'PASTICCERIA MARA DEI BOSCHI SRL', importo_lordo: 199.99, data_scadenza: pIso, stato: 'da_pagare' },
      ],
    })
    const snap = await collectOrgSnapshot({ supabase, orgId: 'org-1', sedeId: 'sede-A' })
    expect(snap.fattureScadute.length).toBe(1)
    const row = snap.fattureScadute[0]
    // 24 char + '…' (ellipsis utf-8)
    expect(row.fornitore.length).toBeLessThanOrEqual(25)
    expect(row.fornitore.endsWith('…')).toBe(true)
    // P.IVA NON deve essere presente nel row (audit PII)
    expect(row).not.toHaveProperty('partita_iva')
    expect(row).not.toHaveProperty('codice_fiscale')
  })

  it('fattura con nome corto NON viene troncata', async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const past = new Date(today); past.setDate(past.getDate() - 1)
    const pIso = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`
    const supabase = mockSupabase({
      sedi: [{ id: 'sede-A', nome: 'X' }],
      fatture: [
        { id: 'f1', fornitore_nome: 'BREVE SRL', importo_lordo: 10, data_scadenza: pIso, stato: 'da_pagare' },
      ],
    })
    const snap = await collectOrgSnapshot({ supabase, orgId: 'org-1', sedeId: 'sede-A' })
    expect(snap.fattureScadute[0].fornitore).toBe('BREVE SRL')
    expect(snap.fattureScadute[0].fornitore).not.toContain('…')
  })

  // Skip: test fragile su date — fallisce quando "today" cade troppo vicino al
  // mese precedente (es. inizio mese, la settimana corrente attraversa il bordo
  // mese). Audit 2026-06-22: da rifare con clock mock invece di Date reale.
  it.skip('food cost: NaN ricavoTot/fcTot vengono saltati (NaN guard)', async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const lun = new Date(today); lun.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    const lunIso = `${lun.getFullYear()}-${String(lun.getMonth() + 1).padStart(2, '0')}-${String(lun.getDate()).padStart(2, '0')}`
    const supabase = mockSupabase({
      sedi: [{ id: 'sede-A', nome: 'X' }],
      userData: {
        'sede-A|pasticceria-giornaliero-v1': [
          { data: lunIso, ricavoTot: NaN, fcTot: 100 },     // skip
          { data: lunIso, ricavoTot: 1000, fcTot: NaN },    // skip
          { data: lunIso, ricavoTot: 0, fcTot: 0 },         // skip (ricavoTot<=0)
          { data: lunIso, ricavoTot: 1000, fcTot: 350 },    // 35%
        ],
      },
    })
    const snap = await collectOrgSnapshot({ supabase, orgId: 'org-1', sedeId: 'sede-A' })
    expect(snap.foodCostMedio).toBeCloseTo(35, 1)
  })

  it('food cost: nessun dato valido → foodCostMedio null (no NaN bleed)', async () => {
    const supabase = mockSupabase({
      sedi: [{ id: 'sede-A', nome: 'X' }],
      userData: {
        'sede-A|pasticceria-giornaliero-v1': [
          { data: '2099-01-01', ricavoTot: 1000, fcTot: 350 }, // futuro: fuori range settimana corrente
        ],
      },
    })
    const snap = await collectOrgSnapshot({ supabase, orgId: 'org-1', sedeId: 'sede-A' })
    expect(snap.foodCostMedio).toBeNull()
    expect(Number.isNaN(snap.foodCostMedio)).toBe(false)
  })

  it('magazzino sotto soglia: legge giacenza_g e soglia_min_g', async () => {
    const supabase = mockSupabase({
      sedi: [{ id: 'sede-A', nome: 'Centro' }],
      userData: {
        'sede-A|pasticceria-magazzino-v1': {
          pistacchio: { giacenza_g: 200, soglia_min_g: 500 },
          farina: { giacenza_g: 5000, soglia_min_g: 1000 },     // OK
          cacao: { giacenza: 50, soglia: 100 },                  // fallback chiavi alt
        },
      },
    })
    const snap = await collectOrgSnapshot({ supabase, orgId: 'org-1', sedeId: 'sede-A' })
    const nomi = snap.mpSottoSoglia.map(m => m.nome)
    expect(nomi).toContain('pistacchio')
    expect(nomi).toContain('cacao')
    expect(nomi).not.toContain('farina')
  })

  it('magazzino: soglia 0 → NON considerato sotto soglia', async () => {
    const supabase = mockSupabase({
      sedi: [{ id: 'sede-A', nome: 'X' }],
      userData: {
        'sede-A|pasticceria-magazzino-v1': { x: { giacenza_g: 0, soglia_min_g: 0 } },
      },
    })
    const snap = await collectOrgSnapshot({ supabase, orgId: 'org-1', sedeId: 'sede-A' })
    expect(snap.mpSottoSoglia).toEqual([])
  })

  it('orgId con multi-sede: NON crasha, aggrega', async () => {
    const supabase = mockSupabase({
      sedi: [{ id: 'sede-A', nome: 'A' }, { id: 'sede-B', nome: 'B' }],
    })
    const snap = await collectOrgSnapshot({ supabase, orgId: 'org-1' })
    expect(snap.sedeId).toBeNull()
    expect(snap).toHaveProperty('topProdotto')
  })
})

// ─── callClaude ─────────────────────────────────────────────────────────

describe('callClaude', () => {
  let origFetch, origKey
  beforeEach(() => {
    origFetch = globalThis.fetch
    origKey = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  })
  afterEach(() => {
    globalThis.fetch = origFetch
    process.env.ANTHROPIC_API_KEY = origKey
  })

  it('manca ANTHROPIC_API_KEY → throw', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(callClaude({ messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toThrow(/ANTHROPIC_API_KEY/)
  })

  it('200 → ritorna text/usage/model', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        content: [{ type: 'text', text: 'Ciao' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-haiku-4-5-20251001',
      }), { status: 200 }))
    const r = await callClaude({ messages: [{ role: 'user', content: 'hi' }] })
    expect(r.text).toBe('Ciao')
    expect(r.usage.input_tokens).toBe(10)
    expect(r.model).toBe('claude-haiku-4-5-20251001')
  })

  it('error response → throw con status', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('rate limited', { status: 429 }))
    await expect(callClaude({ messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toThrow(/429/)
  })

  it('passa system + temperature', async () => {
    let body = null
    globalThis.fetch = vi.fn(async (url, opts) => {
      body = JSON.parse(opts.body)
      return new Response(JSON.stringify({ content: [], usage: {}, model: 'x' }), { status: 200 })
    })
    await callClaude({ system: 'sei un assistente', messages: [{ role: 'user', content: 'hi' }], temperature: 0.7 })
    expect(body.system).toBe('sei un assistente')
    expect(body.temperature).toBe(0.7)
  })

  it('content vuoto → text=""', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ content: [], usage: {}, model: 'x' }), { status: 200 }))
    const r = await callClaude({ messages: [{ role: 'user', content: 'hi' }] })
    expect(r.text).toBe('')
  })
})
