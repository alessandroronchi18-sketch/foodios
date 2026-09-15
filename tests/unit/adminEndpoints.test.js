// Test per i nuovi endpoint admin (audit 2026-06-14):
//   - getSecuritySnapshot (login + anomalie + admin_log)
//   - getHealthSnapshot   (cron + errori + table counts + build info)
//   - getAiTelemetry      (12 feature AI + costo stimato Claude)
//
// I tre helper sono export named in `api/admin.js`. Qui costruiamo un mock
// minimale di Supabase con la stessa fluent API (from, select, gte, eq,
// order, limit, maybeSingle, not, head/count) e verifichiamo che:
//   - il return ha la shape attesa dalla UI (`src/admin/AdminPage.jsx`)
//   - aggregazioni e filtri (es. brute-force >=3 fail) sono corretti
//   - la funzione non esplode quando una tabella manca (catch silenziosi)

import { describe, it, expect, vi } from 'vitest'
// Dal 15/09/2026 queste tre aree stanno in moduli loro: api/admin.js era
// arrivato a 3.035 righe, ed è dove si nascondevano i difetti peggiori
// trovati nell'audit di oggi — sei comandi che non partivano da mesi, un
// listino fermo a tre listini fa, un editor SQL che scriveva.
import { getSecuritySnapshot } from '../../api/lib/admin/sicurezzaPannello.js'
import { getHealthSnapshot } from '../../api/lib/admin/salute.js'
import { getAiTelemetry } from '../../api/lib/admin/telemetriaAi.js'

// ── Mock Supabase fluent builder ──────────────────────────────────────────
// `tables` è una mappa { 'login_attempts': [...], 'audit_log': [...] }
// Le query supportate: select/gte/eq/order/limit/not/head/count/maybeSingle.
// Restituiamo SEMPRE `data` filtrata in-memory + `count` se richiesto.
function makeSupabase(tables, options = {}) {
  const errOnTable = options.errorTables || new Set()
  return {
    from(table) {
      if (errOnTable.has(table)) {
        const err = new Error(`mock error on ${table}`)
        return {
          select() { return this },
          gte() { return this },
          eq() { return this },
          not() { return this },
          order() { return this },
          limit() { return this },
          maybeSingle() { return Promise.reject(err) },
          then(resolve, reject) { return Promise.reject(err).then(resolve, reject) },
        }
      }
      const rows = (tables[table] || []).slice()
      const builder = {
        _filtered: rows,
        _countOnly: false,
        _headOnly: false,
        select(_cols, opts = {}) {
          this._countOnly = !!opts.count
          this._headOnly = !!opts.head
          return this
        },
        gte(col, val) {
          this._filtered = this._filtered.filter(r => r[col] != null && r[col] >= val)
          return this
        },
        eq(col, val) {
          this._filtered = this._filtered.filter(r => r[col] === val)
          return this
        },
        not(col, op, val) {
          // supporta `not('col', 'is', null)` → mantieni se col != null
          if (op === 'is' && val === null) this._filtered = this._filtered.filter(r => r[col] != null)
          return this
        },
        order(col, opts = {}) {
          const asc = opts.ascending !== false
          this._filtered = this._filtered.slice().sort((a, b) => {
            const av = a[col], bv = b[col]
            if (av === bv) return 0
            return (av < bv ? -1 : 1) * (asc ? 1 : -1)
          })
          return this
        },
        limit(n) {
          this._filtered = this._filtered.slice(0, n)
          return this
        },
        maybeSingle() {
          const row = this._filtered[0] || null
          return Promise.resolve({ data: row, error: null })
        },
        // L'oggetto è "thenable": await ritorna { data, count }
        then(resolve) {
          const result = this._headOnly
            ? { data: null, count: this._filtered.length, error: null }
            : this._countOnly
              ? { data: this._filtered, count: this._filtered.length, error: null }
              : { data: this._filtered, error: null }
          return Promise.resolve(result).then(resolve)
        },
      }
      return builder
    },
  }
}

// ── getSecuritySnapshot ───────────────────────────────────────────────────
describe('getSecuritySnapshot', () => {
  it('aggrega login_attempts: ok vs failed', async () => {
    const now = new Date().toISOString()
    const supa = makeSupabase({
      login_attempts: [
        { success: true, email: 'a@b.it', ip: '1.1.1.1', created_at: now },
        { success: true, email: 'c@d.it', ip: '2.2.2.2', created_at: now },
        { success: false, email: 'mario@x.it', ip: '3.3.3.3', created_at: now },
        { success: false, email: 'mario@x.it', ip: '3.3.3.3', created_at: now },
      ],
      audit_log: [],
      admin_log: [],
    })
    const snap = await getSecuritySnapshot(supa, 24)
    expect(snap.login.total).toBe(4)
    expect(snap.login.ok).toBe(2)
    expect(snap.login.failed).toBe(2)
    // Sotto soglia 3 → no brute-force suspect
    expect(snap.login.top_fail_emails).toHaveLength(0)
  })

  it('identifica brute-force suspect (≥3 fallimenti/email)', async () => {
    const now = new Date().toISOString()
    const fail = (email) => ({ success: false, email, ip: '9.9.9.9', created_at: now })
    const supa = makeSupabase({
      login_attempts: [
        fail('attacker@x.it'), fail('attacker@x.it'), fail('attacker@x.it'),
        fail('attacker@x.it'), fail('mario@x.it'),  // 4 attacker, 1 mario
      ],
      audit_log: [],
      admin_log: [],
    })
    const snap = await getSecuritySnapshot(supa, 24)
    expect(snap.login.top_fail_emails).toHaveLength(1)
    expect(snap.login.top_fail_emails[0]).toEqual({ email: 'attacker@x.it', fail_count: 4 })
  })

  it('estrae anomalie dal audit_log (operation=anomaly_detected)', async () => {
    const supa = makeSupabase({
      login_attempts: [],
      audit_log: [
        { id: 'a1', user_id: 'u1', operation: 'anomaly_detected', details: { tipo: 'paese_cambiato' }, created_at: new Date().toISOString() },
        { id: 'a2', user_id: 'u2', operation: 'other', details: {}, created_at: new Date().toISOString() },
      ],
      admin_log: [],
    })
    const snap = await getSecuritySnapshot(supa, 24)
    expect(snap.anomalie).toHaveLength(1)
    expect(snap.anomalie[0].id).toBe('a1')
  })

  it('non esplode se una tabella ha errore (fail-soft)', async () => {
    const supa = makeSupabase(
      { login_attempts: [], audit_log: [], admin_log: [] },
      { errorTables: new Set(['login_attempts']) }
    )
    const snap = await getSecuritySnapshot(supa, 24)
    expect(snap.login).toHaveProperty('error')
    expect(snap.anomalie).toEqual([])
    expect(snap.admin_log).toEqual([])
  })

  it('shape return per la UI', async () => {
    const supa = makeSupabase({ login_attempts: [], audit_log: [], admin_log: [] })
    const snap = await getSecuritySnapshot(supa, 24)
    expect(snap).toHaveProperty('periodo_ore', 24)
    expect(snap).toHaveProperty('since')
    expect(snap).toHaveProperty('login')
    expect(snap).toHaveProperty('anomalie')
    expect(snap).toHaveProperty('admin_log')
    expect(snap).toHaveProperty('generated_at')
  })
})

// ── getHealthSnapshot ─────────────────────────────────────────────────────
//
// Dal 15/09/2026 lo stato di un lavoro notturno viene dal **registro delle
// esecuzioni** (`cron_runs`), non dal fatto che la sua tabella di
// destinazione abbia righe nuove.
//
// Il motivo: le due cose non sono la stessa. `forecast_giornaliero` è vuota
// su tutto il database di produzione, e col vecchio criterio il pannello
// diceva «mai girato» — mentre il lavoro gira ogni notte e semplicemente non
// trova niente da scrivere, perché nessun cliente registra il venduto per
// prodotto. Ci sono voluti dieci minuti di interrogazioni al database per
// stabilire quale delle due fosse.
describe('getHealthSnapshot', () => {
  const OGGI = new Date().toISOString().slice(0, 10)
  const giro = (id, quandoIso, status = 'ok', errore = null) => ({
    job_name: id, run_date: OGGI, completed_at: quandoIso, status, error_message: errore,
  })
  const LAVORI = ['cron-notifiche', 'cron-daily-brief', 'cron-ai-suggestions',
    'cron-forecast', 'cron-documentary', 'anomaly-detect',
    'cleanup-audit-log', 'cleanup-error-log']

  it('marca un lavoro "ok" se ha girato nelle ultime 24 ore', async () => {
    const ora = new Date().toISOString()
    const supa = makeSupabase({
      cron_runs: LAVORI.map(id => giro(id, ora)),
      daily_briefs: [{ created_at: ora }], ai_suggestions: [{ created_at: ora }],
      forecast_giornaliero: [{ created_at: ora }], documentary_snapshots: [{ created_at: ora }],
      error_log: [],
    })
    const snap = await getHealthSnapshot(supa)
    expect(snap.cron).toHaveLength(8)
    for (const c of snap.cron) expect(c.status, c.id).toBe('ok')
  })

  it('marca "late" se l\'ultimo giro è più vecchio di 26 ore', async () => {
    const vecchio = new Date(Date.now() - 30 * 3600000).toISOString()
    const supa = makeSupabase({
      cron_runs: LAVORI.map(id => giro(id, vecchio)),
      daily_briefs: [], ai_suggestions: [], forecast_giornaliero: [], documentary_snapshots: [],
      error_log: [],
    })
    const snap = await getHealthSnapshot(supa)
    for (const c of snap.cron) expect(c.status, c.id).toBe('late')
    expect(snap.cron[0].nota).toMatch(/giorni fa/)
  })

  it('marca "mai_registrato" se del lavoro non c\'è traccia', async () => {
    const supa = makeSupabase({
      cron_runs: [],
      daily_briefs: [], ai_suggestions: [], forecast_giornaliero: [], documentary_snapshots: [],
      error_log: [],
    })
    const snap = await getHealthSnapshot(supa)
    for (const c of snap.cron) expect(c.status, c.id).toBe('mai_registrato')
    expect(snap.cron[0].nota).toMatch(/non ha ancora lasciato traccia/i)
  })

  it('marca "error" se l\'ultimo giro è fallito, e riporta il motivo', async () => {
    const ora = new Date().toISOString()
    const supa = makeSupabase({
      cron_runs: LAVORI.map(id => giro(id, ora, 'error', 'Claude 429: rate limited')),
      daily_briefs: [], ai_suggestions: [], forecast_giornaliero: [], documentary_snapshots: [],
      error_log: [],
    })
    const snap = await getHealthSnapshot(supa)
    for (const c of snap.cron) expect(c.status, c.id).toBe('error')
    expect(snap.cron[0].nota).toMatch(/Claude 429/)
  })

  it('distingue «gira ma non scrive» da «non gira»', async () => {
    // È il caso della previsione vendite: il lavoro gira ogni notte e la sua
    // tabella è vuota da sempre. Col vecchio criterio si leggeva «mai
    // girato», che è un'altra cosa e porta a cercare il guasto dove non c'è.
    const ora = new Date().toISOString()
    const supa = makeSupabase({
      cron_runs: LAVORI.map(id => giro(id, ora)),
      daily_briefs: [{ created_at: ora }], ai_suggestions: [{ created_at: ora }],
      forecast_giornaliero: [],            // gira, ma non ha niente da scrivere
      documentary_snapshots: [{ created_at: ora }],
      error_log: [],
    })
    const snap = await getHealthSnapshot(supa)
    const previsione = snap.cron.find(c => c.id === 'cron-forecast')
    expect(previsione.status, 'il lavoro gira: non è un guasto').toBe('ok')
    expect(previsione.ultima_scrittura).toBe(null)
    expect(previsione.nota).toMatch(/non ha mai scritto niente/)
    // Mentre uno che scrive non ha nessuna nota.
    expect(snap.cron.find(c => c.id === 'cron-daily-brief').nota).toBe(null)
  })

  it('ogni lavoro ha un nome in italiano, non l\'identificativo', async () => {
    const supa = makeSupabase({ cron_runs: [], error_log: [] })
    const snap = await getHealthSnapshot(supa)
    for (const c of snap.cron) {
      expect(c.etichetta, c.id).toBeTruthy()
      expect(c.etichetta, c.id).not.toMatch(/^cron-/)
    }
  })

  it('include build info dalle env Vercel', async () => {
    const prev = { ...process.env }
    process.env.VERCEL_ENV = 'production'
    process.env.VERCEL_GIT_COMMIT_SHA = 'abc1234567'
    process.env.VERCEL_GIT_COMMIT_REF = 'main'
    process.env.VERCEL_URL = 'foodos-rose.vercel.app'
    try {
      const supa = makeSupabase({
        daily_briefs: [], ai_suggestions: [], forecast_giornaliero: [], documentary_snapshots: [],
        error_log: [],
      })
      const snap = await getHealthSnapshot(supa)
      expect(snap.build.vercel_env).toBe('production')
      expect(snap.build.git_commit).toBe('abc1234')  // slice(0,7)
      expect(snap.build.git_branch).toBe('main')
      expect(snap.build.deploy_url).toBe('foodos-rose.vercel.app')
    } finally { process.env = prev }
  })

  it('shape return per la UI', async () => {
    const supa = makeSupabase({
      daily_briefs: [], ai_suggestions: [], forecast_giornaliero: [], documentary_snapshots: [],
      error_log: [],
    })
    const snap = await getHealthSnapshot(supa)
    expect(snap).toHaveProperty('cron')
    expect(snap).toHaveProperty('errori_ultime_24h')
    expect(snap).toHaveProperty('table_counts')
    expect(snap).toHaveProperty('build')
    expect(snap).toHaveProperty('generated_at')
  })
})

// ── getAiTelemetry ────────────────────────────────────────────────────────
describe('getAiTelemetry', () => {
  it('aggrega Daily Brief con open_rate quando sent>0', async () => {
    const now = new Date().toISOString()
    const supa = makeSupabase({
      daily_briefs: [
        { id: '1', created_at: now, sent_email_at: now, opened_at: now,  tipo: 'giornaliero' },
        { id: '2', created_at: now, sent_email_at: now, opened_at: null, tipo: 'giornaliero' },
        { id: '3', created_at: now, sent_email_at: null, opened_at: null, tipo: 'settimanale' },
      ],
      ai_suggestions: [], brain_conversations: [], recipe_inventions: [],
      extracted_invoices: [], forecast_giornaliero: [], documentary_snapshots: [],
      competitor_prices: [], pos_scontrini: [], whatsapp_links: [],
    })
    const snap = await getAiTelemetry(supa, 7)
    expect(snap.daily_brief.tot).toBe(3)
    expect(snap.daily_brief.sent).toBe(2)
    expect(snap.daily_brief.opened).toBe(1)
    expect(snap.daily_brief.open_rate).toBe(50)  // 1/2
    expect(snap.daily_brief.settimanali).toBe(1)
  })

  it('calcola action_rate per ai_suggestions', async () => {
    const now = new Date().toISOString()
    const supa = makeSupabase({
      daily_briefs: [],
      ai_suggestions: [
        { id: '1', created_at: now, stato: 'agito' },
        { id: '2', created_at: now, stato: 'agito' },
        { id: '3', created_at: now, stato: 'rifiutato' },
        { id: '4', created_at: now, stato: 'pending' },
      ],
      brain_conversations: [], recipe_inventions: [], extracted_invoices: [],
      forecast_giornaliero: [], documentary_snapshots: [], competitor_prices: [],
      pos_scontrini: [], whatsapp_links: [],
    })
    const snap = await getAiTelemetry(supa, 7)
    expect(snap.ai_suggestions.tot).toBe(4)
    expect(snap.ai_suggestions.agito).toBe(2)
    expect(snap.ai_suggestions.rifiutato).toBe(1)
    expect(snap.ai_suggestions.action_rate).toBe(50)  // 2/4
  })

  it('stima costo USD/EUR dalle tabelle AI', async () => {
    const now = new Date().toISOString()
    const supa = makeSupabase({
      daily_briefs: Array.from({ length: 100 }, (_, i) => ({ id: `b${i}`, created_at: now })),
      ai_suggestions: [], brain_conversations: [], recipe_inventions: [],
      extracted_invoices: [], forecast_giornaliero: [], documentary_snapshots: [],
      competitor_prices: [], pos_scontrini: [], whatsapp_links: [],
    })
    const snap = await getAiTelemetry(supa, 7)
    // 100 daily_brief * 0.0008 USD ≈ 0.08
    expect(snap.costi.usd_estimated).toBeCloseTo(0.08, 2)
    expect(snap.costi.eur_estimated).toBeGreaterThan(0)
    expect(snap.costi.detail).toContain('Stima')
  })

  it('shape return: tutte le 12 sezioni feature', async () => {
    const supa = makeSupabase({
      daily_briefs: [], ai_suggestions: [], brain_conversations: [], recipe_inventions: [],
      extracted_invoices: [], forecast_giornaliero: [], documentary_snapshots: [],
      competitor_prices: [], pos_scontrini: [], whatsapp_links: [],
    })
    const snap = await getAiTelemetry(supa, 7)
    for (const k of [
      'daily_brief', 'ai_suggestions', 'brain', 'recipe_inventor',
      'ocr_fatture', 'forecast', 'documentary', 'competitor_pricing',
      'pos_scontrini', 'whatsapp', 'reformulation', 'recensioni', 'costi',
    ]) {
      expect(snap, `missing key: ${k}`).toHaveProperty(k)
    }
    expect(snap.periodo_giorni).toBe(7)
  })

  it('open_rate è null se nessun brief inviato', async () => {
    const supa = makeSupabase({
      daily_briefs: [], ai_suggestions: [], brain_conversations: [], recipe_inventions: [],
      extracted_invoices: [], forecast_giornaliero: [], documentary_snapshots: [],
      competitor_prices: [], pos_scontrini: [], whatsapp_links: [],
    })
    const snap = await getAiTelemetry(supa, 7)
    expect(snap.daily_brief.open_rate).toBeNull()
    expect(snap.ai_suggestions.action_rate).toBeNull()
    expect(snap.recipe_inventor.save_rate).toBeNull()
  })
})
