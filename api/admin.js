export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, getClientIP, json } from './lib/cors.js'
import { sanitize, sanitizeStrict, validateUUID, validateEmail } from './lib/validate.js'
import { safeError } from './lib/safeError.js'
import { verificaAdmin } from './lib/auth.js'

// ADMIN_EMAIL deve essere configurato su Vercel come env var.
// Nessun default hardcoded: se manca, l'endpoint rifiuta SEMPRE.
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase()
const PIANI_VALIDI = ['trial', 'base', 'pro', 'enterprise']

// Fingerprint dei 20 record di DEMO_FATTURE rimossi dal codice di Scadenzario.
// Match per tupla esatta (numero_rif, fornitore, data_fattura) — unica e ad
// alta improbabilità di collidere con fatture reali.
const DEMO_FATTURE_FINGERPRINT = [
  ['160',                  "MELLY'S KOMBUCHA SRL",                                        '2026-04-09'],
  ['349/001',              'MARCO RIVELLA',                                                '2026-04-09'],
  ['INVIT/rst/26/0266800', 'Deliveroo Italy S.R.L.',                                       '2026-04-09'],
  ['10',                   'ERBORISTERIA PURANATURA DI FRANCESCO REGALZI',                 '2026-04-08'],
  ['1/973',                'CONO ARTIC COMMERCIALE SRL',                                   '2026-04-08'],
  ['FT/2026/0042',         'CAFFÈ BORBONE SRL',                                            '2026-04-07'],
  ['FT-2026-00789',        'MULINO BIANCO INGREDIENTS',                                    '2026-04-07'],
  ['2026/88',              'LATTERIA MONTELLO S.P.A.',                                     '2026-04-06'],
  ['IV/2026/001234',       'ENEL ENERGIA S.P.A.',                                          '2026-04-05'],
  ['0541',                 'DOLCIUMI FUMAGALLI SNC',                                       '2026-04-04'],
  ['F/2026/0099',          "MELLY'S KOMBUCHA SRL",                                        '2026-04-03'],
  ['7741/B',               'FORNITORE GENERALE ALIMENTARI',                                '2026-04-02'],
  ['2026-0178',            'PACKAGING EXPRESS SRL',                                        '2026-04-01'],
  ['RCPT/0056',            'CONO ARTIC COMMERCIALE SRL',                                   '2026-03-31'],
  ['FT2026-22',            'MARCO RIVELLA',                                                '2026-03-28'],
  ['2026/104',             'DOLCIUMI FUMAGALLI SNC',                                       '2026-03-25'],
  ['INV-0033',             'ERBORISTERIA PURANATURA DI FRANCESCO REGALZI',                 '2026-03-20'],
  ['26/00312',             'LATTERIA MONTELLO S.P.A.',                                     '2026-03-15'],
  ['DV/2026/0091',         'Deliveroo Italy S.R.L.',                                       '2026-03-10'],
  ['2026-567',             'CAFFÈ BORBONE SRL',                                            '2026-03-05'],
]

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

// verificaAdmin importato da ./lib/auth.js — consolidato per evitare drift
// (avevamo una copia locale che non riceveva il guard isProd su
// DISABLE_ADMIN_MFA introdotto nell'audit giu 2026, che lasciava il pannello
// admin esposto a single-factor in prod). Un solo punto di verita'.

async function logAdmin(supabase, adminEmail, azione, orgId, ip, userAgent) {
  try {
    await supabase.from('admin_log').insert({
      admin_email: adminEmail,
      azione,
      org_id: orgId || null,
      ip,
      user_agent: (userAgent || '').slice(0, 200),
    })
  } catch (e) {
    // Audit 2026-06-17 MEDIUM: prima il catch era muto, errori DiskFull etc
    // sparivano. Console.error perché Sentry server lo cattura; le azioni
    // restano permesse (non vogliamo che il log block l'op stessa).
    console.error('[logAdmin] insert failed:', e?.message, { azione, adminEmail })
  }
}

// ─── handlers GET ──────────────────────────────────────────────────────────

async function getClienti(supabase) {
  // Audit 2026-06-19 Customer 360 lista: arricchiamo ogni riga con flag
  // ha_fatture_scadute, n_integrazioni_attive, n_push_subs in modo che la
  // tabella clienti possa filtrare/badge senza un round-trip per riga.
  const todayIso = new Date().toISOString().slice(0, 10)
  const [overviewRes, usersRes, integR, pushR, scadR] = await Promise.all([
    supabase.from('admin_overview').select('*').order('registrata_il', { ascending: false }),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    fetchSafe(supabase.from('integrazioni').select('organization_id').eq('attiva', true)),
    fetchSafe(supabase.from('push_subscriptions').select('organization_id').eq('active', true)),
    fetchSafe(supabase.from('fatture').select('organization_id, importo, importo_pagato, tipo')
      .lt('data_scadenza', todayIso).or('tipo.is.null,tipo.eq.fattura')),
  ])
  if (overviewRes.error) throw new Error(`admin_overview: ${overviewRes.error.message}`)

  // Aggregazione single-pass O(N) sugli array piatti dei 3 join
  const integByOrg = {}
  for (const r of (integR.data || [])) integByOrg[r.organization_id] = (integByOrg[r.organization_id] || 0) + 1
  const pushByOrg = {}
  for (const r of (pushR.data || [])) pushByOrg[r.organization_id] = (pushByOrg[r.organization_id] || 0) + 1
  const scadByOrg = {}
  for (const r of (scadR.data || [])) {
    if (r.tipo && r.tipo !== 'fattura') continue
    const residuo = (Number(r.importo) || 0) - (Number(r.importo_pagato) || 0)
    if (residuo > 0.01) scadByOrg[r.organization_id] = (scadByOrg[r.organization_id] || 0) + 1
  }

  const authMap = {}
  for (const u of usersRes.data?.users || []) {
    authMap[(u.email || '').toLowerCase()] = {
      last_sign_in_at: u.last_sign_in_at || null,
      created_at: u.created_at || null,
      email_confirmed_at: u.email_confirmed_at || null,
    }
  }

  return (overviewRes.data || []).map(c => {
    const meta = authMap[(c.email || '').toLowerCase()] || {}
    return {
      ...c,
      ultimo_accesso: meta.last_sign_in_at || c.ultimo_accesso || null,
      email_confermata: !!meta.email_confirmed_at,
      n_integrazioni_attive: integByOrg[c.org_id] || 0,
      n_push_subs: pushByOrg[c.org_id] || 0,
      n_fatture_scadute: scadByOrg[c.org_id] || 0,
    }
  })
}

// Audit 2026-06-19 Customer 360 globale: aggrega gli stessi 7 moduli del
// modal cliente ma a livello cross-org per il tab Overview. Tutte le query
// in parallelo, errori swallow → ogni area torna 0 se la tabella manca.
async function getGlobalCustomer360(supabase) {
  const startOfMonth = new Date()
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
  const isoMonthDate = startOfMonth.toISOString().slice(0, 10)
  const todayIso = new Date().toISOString().slice(0, 10)

  const [
    integR, b2bR, posR, pushR, scadR,
  ] = await Promise.all([
    fetchSafe(supabase.from('integrazioni').select('organization_id, tipo, attiva').eq('attiva', true)),
    fetchSafe(supabase.from('vendite_b2b').select('organization_id, totale').gte('data', isoMonthDate)),
    fetchSafe(supabase.from('pos_scontrini').select('organization_id, totale_lordo, provider').gte('data', isoMonthDate)),
    fetchSafe(supabase.from('push_subscriptions').select('organization_id, id').eq('active', true)),
    fetchSafe(supabase.from('fatture').select('organization_id, importo, importo_pagato, tipo')
      .lt('data_scadenza', todayIso).or('tipo.is.null,tipo.eq.fattura')),
  ])

  // Integrazioni: top tipi per # clienti
  const integByTipo = {}
  const integClienti = new Set()
  for (const r of (integR.data || [])) {
    integClienti.add(r.organization_id)
    integByTipo[r.tipo] = (integByTipo[r.tipo] || 0) + 1
  }
  const topTipi = Object.entries(integByTipo)
    .map(([tipo, n]) => ({ tipo, n }))
    .sort((a, b) => b.n - a.n).slice(0, 5)

  // B2B: ricavo totale MTD + clienti attivi
  const b2bClienti = new Set()
  let b2bRicavo = 0
  for (const r of (b2bR.data || [])) {
    b2bClienti.add(r.organization_id)
    b2bRicavo += Number(r.totale) || 0
  }

  // POS: ricavo totale MTD + clienti attivi + provider distinti
  const posClienti = new Set()
  const posProviders = new Set()
  let posRicavo = 0
  for (const r of (posR.data || [])) {
    posClienti.add(r.organization_id)
    if (r.provider) posProviders.add(r.provider)
    posRicavo += Number(r.totale_lordo) || 0
  }

  // Push: dispositivi + clienti
  const pushClienti = new Set()
  for (const r of (pushR.data || [])) pushClienti.add(r.organization_id)

  // Scadenzario: clienti con almeno 1 fattura scaduta non pagata
  const scadClienti = new Set()
  let scadTot = 0
  let scadN = 0
  for (const r of (scadR.data || [])) {
    const tot = Number(r.importo) || 0
    const pag = Number(r.importo_pagato) || 0
    const residuo = tot - pag
    if (residuo > 0.01) {
      scadClienti.add(r.organization_id)
      scadTot += residuo
      scadN++
    }
  }

  return {
    integrazioni: {
      n_clienti: integClienti.size,
      n_attive_totali: (integR.data || []).length,
      top_tipi: topTipi,
    },
    b2b: {
      n_clienti_attivi_mtd: b2bClienti.size,
      ricavo_mtd: Math.round(b2bRicavo * 100) / 100,
      n_vendite_mtd: (b2bR.data || []).length,
    },
    pos: {
      n_clienti_attivi_mtd: posClienti.size,
      ricavo_mtd: Math.round(posRicavo * 100) / 100,
      n_scontrini_mtd: (posR.data || []).length,
      providers: Array.from(posProviders),
    },
    push: {
      n_dispositivi: (pushR.data || []).length,
      n_clienti: pushClienti.size,
    },
    scadenzario: {
      n_clienti_overdue: scadClienti.size,
      n_fatture_overdue: scadN,
      totale_overdue: Math.round(scadTot * 100) / 100,
    },
  }
}

async function getStats(supabase, clienti) {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)

  const totale = clienti.length
  const paganti = clienti.filter(c => c.org_approvata).length
  const trial = clienti.filter(c => !c.org_approvata && c.trial_ends_at && new Date(c.trial_ends_at) > now).length
  const scaduti = clienti.filter(c => !c.org_approvata && c.trial_ends_at && new Date(c.trial_ends_at) <= now).length
  const bloccati = clienti.filter(c => c.attivo === false).length
  const nuoviSettimana = clienti.filter(c => c.registrata_il && new Date(c.registrata_il) > sevenDaysAgo).length
  const nuoviMese = clienti.filter(c => c.registrata_il && new Date(c.registrata_il) > thirtyDaysAgo).length

  // MRR stimato: paganti × prezzo base €39
  const PREZZO_PIANO = { base: 39, pro: 89, enterprise: 199, trial: 0 }
  const mrrStimato = clienti
    .filter(c => c.org_approvata)
    .reduce((acc, c) => acc + (PREZZO_PIANO[c.piano] || 39), 0)

  // Giorni medi rimanenti per i trial attivi
  const trialAttivi = clienti.filter(c => !c.org_approvata && c.trial_ends_at && new Date(c.trial_ends_at) > now)
  const giorniMediTrial = trialAttivi.length === 0 ? 0 :
    Math.round(trialAttivi.reduce((acc, c) => acc + (new Date(c.trial_ends_at) - now) / 86400000, 0) / trialAttivi.length)

  // Conversion: paganti / (paganti + scaduti)  (chi ha avuto trial e ha scelto)
  const trialFiniti = paganti + scaduti
  const conversionRate = trialFiniti === 0 ? 0 : Math.round((paganti / trialFiniti) * 100)

  // Inattivi da >7 giorni
  const inattivi = clienti.filter(c => {
    if (!c.ultimo_accesso) return c.registrata_il && new Date(c.registrata_il) < sevenDaysAgo
    return new Date(c.ultimo_accesso) < sevenDaysAgo
  }).length

  // Crescita settimanale (ultime 12 settimane)
  const settimane = []
  for (let i = 11; i >= 0; i--) {
    const fine = new Date(now.getTime() - i * 7 * 86400000)
    const inizio = new Date(fine.getTime() - 7 * 86400000)
    const count = clienti.filter(c => {
      if (!c.registrata_il) return false
      const d = new Date(c.registrata_il)
      return d >= inizio && d < fine
    }).length
    settimane.push({
      settimana: fine.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
      registrazioni: count,
    })
  }

  // Audit 2026-06-19 Customer 360 globale: include cross-org KPI accanto
  // agli altri stats (no nuova action richiesta lato client).
  const c360 = await getGlobalCustomer360(supabase)

  return {
    totale, paganti, trial, scaduti, bloccati,
    nuoviSettimana, nuoviMese,
    mrrStimato, giorniMediTrial, conversionRate, inattivi,
    crescita: settimane,
    customer360: c360,
  }
}

async function getAuditLog(supabase) {
  const { data: adminLog } = await supabase
    .from('admin_log')
    .select('id, admin_email, azione, org_id, ip, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  return (adminLog || []).map(r => ({
    id: r.id,
    when: r.created_at,
    actor: r.admin_email,
    action: r.azione,
    target: r.org_id,
    ip: r.ip,
  }))
}

// Audit 2026-06-19 Customer 360: estensione del dettaglio cliente con tutte le
// aree precedentemente invisibili dall'admin (integrazioni, vendite B2B, POS,
// push subs, scadenzario, costi aziendali). Ogni query è isolata in try/catch
// per non rompere il modal se una tabella manca o ha schema diverso.
async function fetchSafe(promise) {
  try { return await promise } catch { return { data: null, error: null, count: 0 } }
}

async function getCustomer360(supabase, orgId) {
  const startOfMonth = new Date()
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
  const isoMonth = startOfMonth.toISOString()
  const isoMonthDate = isoMonth.slice(0, 10)
  const next7gg = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const todayIso = new Date().toISOString().slice(0, 10)

  // Tutte le query in parallelo. Errori swallow → la rispettiva area apparirà
  // come { count: 0 } nel modal, non rompe il rendering.
  const [
    integrazioniR, b2bClientiR, b2bVenditeMtdR,
    posR, pushSubsR,
    scadOverdueR, scadProxR,
    costiR, stipendiR,
  ] = await Promise.all([
    fetchSafe(supabase.from('integrazioni')
      .select('id, tipo, attiva, ultimo_sync, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })),
    fetchSafe(supabase.from('clienti_b2b')
      .select('id, attivo', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('attivo', true)),
    fetchSafe(supabase.from('vendite_b2b')
      .select('totale, data, organization_id')
      .eq('organization_id', orgId)
      .gte('data', isoMonthDate)),
    fetchSafe(supabase.from('pos_scontrini')
      .select('totale_lordo, data, provider')
      .eq('organization_id', orgId)
      .gte('data', isoMonthDate)),
    fetchSafe(supabase.from('push_subscriptions')
      .select('id, device_label, user_agent, created_at, last_notified_at, active')
      .eq('organization_id', orgId)
      .eq('active', true)
      .order('created_at', { ascending: false })),
    fetchSafe(supabase.from('fatture')
      .select('id, importo, importo_pagato, data_scadenza, tipo')
      .eq('organization_id', orgId)
      .lt('data_scadenza', todayIso)
      .or('tipo.is.null,tipo.eq.fattura')),
    fetchSafe(supabase.from('fatture')
      .select('id, importo, importo_pagato, data_scadenza, tipo')
      .eq('organization_id', orgId)
      .gte('data_scadenza', todayIso)
      .lte('data_scadenza', next7gg)
      .or('tipo.is.null,tipo.eq.fattura')),
    fetchSafe(supabase.from('costi_aziendali')
      .select('importo, periodicita, attivo')
      .eq('organization_id', orgId)
      .eq('attivo', true)),
    fetchSafe(supabase.from('dipendenti')
      .select('stipendio_lordo_mensile, archiviato')
      .eq('organization_id', orgId)
      .or('archiviato.is.null,archiviato.eq.false')),
  ])

  // ── Integrazioni: lista + count attive ────────────────────────────────────
  const integrazioniRows = integrazioniR.data || []
  const integrazioniAttive = integrazioniRows.filter(r => r.attiva)

  // ── B2B: clienti attivi + ricavo MTD ──────────────────────────────────────
  const b2bVendite = b2bVenditeMtdR.data || []
  const b2bRicavoMtd = b2bVendite.reduce((s, v) => s + (Number(v.totale) || 0), 0)

  // ── POS: scontrini MTD + ricavo MTD + provider distinti ───────────────────
  const posRows = posR.data || []
  const posRicavoMtd = posRows.reduce((s, r) => s + (Number(r.totale_lordo) || 0), 0)
  const posProviders = Array.from(new Set(posRows.map(r => r.provider).filter(Boolean)))

  // ── Push subs: lista (max 8) ──────────────────────────────────────────────
  const pushSubsRows = (pushSubsR.data || []).slice(0, 8)
  const pushSubsCount = (pushSubsR.data || []).length

  // ── Scadenzario: fatture scadute non pagate + prossime 7gg ────────────────
  const scadOverdueRows = (scadOverdueR.data || []).filter(f => {
    // Nota di credito esclusa (tipo='nota_credito' compensa il dovuto)
    if (f.tipo && f.tipo !== 'fattura') return false
    const tot = Number(f.importo) || 0
    const pagato = Number(f.importo_pagato) || 0
    return tot - pagato > 0.01
  })
  const scadOverdueTot = scadOverdueRows.reduce((s, f) => s + Math.max(0, (Number(f.importo) || 0) - (Number(f.importo_pagato) || 0)), 0)
  const scadProxRows = (scadProxR.data || []).filter(f => {
    if (f.tipo && f.tipo !== 'fattura') return false
    return (Number(f.importo) || 0) - (Number(f.importo_pagato) || 0) > 0.01
  })

  // ── Costi aziendali: equivalente mensile ──────────────────────────────────
  const costiRows = costiR.data || []
  const costiMensile = costiRows.reduce((s, c) => {
    const imp = Number(c.importo) || 0
    if (c.periodicita === 'mensile') return s + imp
    if (c.periodicita === 'annuale') return s + (imp / 12)
    // una_tantum: ignorato nel costo ricorrente mensile (UI lo mostra come totale a parte)
    return s
  }, 0)

  // ── Stipendi: lordo mensile attivi ────────────────────────────────────────
  const stipendiRows = stipendiR.data || []
  const stipendiMensile = stipendiRows.reduce((s, d) => s + (Number(d.stipendio_lordo_mensile) || 0), 0)

  return {
    integrazioni: {
      n_attive: integrazioniAttive.length,
      n_totali: integrazioniRows.length,
      items: integrazioniRows.map(r => ({
        id: r.id, tipo: r.tipo, attiva: !!r.attiva,
        ultimo_sync: r.ultimo_sync, created_at: r.created_at,
      })),
    },
    b2b: {
      n_clienti_attivi: b2bClientiR.count || 0,
      n_vendite_mtd: b2bVendite.length,
      ricavo_mtd: Math.round(b2bRicavoMtd * 100) / 100,
    },
    pos: {
      n_scontrini_mtd: posRows.length,
      ricavo_mtd: Math.round(posRicavoMtd * 100) / 100,
      providers: posProviders,
    },
    push: {
      n_attive: pushSubsCount,
      devices: pushSubsRows.map(s => ({
        id: s.id,
        label: s.device_label || null,
        ua_short: (s.user_agent || '').slice(0, 60),
        created_at: s.created_at,
        last_notified_at: s.last_notified_at,
      })),
    },
    scadenzario: {
      n_overdue: scadOverdueRows.length,
      totale_overdue: Math.round(scadOverdueTot * 100) / 100,
      n_prossime_7gg: scadProxRows.length,
    },
    costi: {
      n_voci_attive: costiRows.length,
      totale_mensile: Math.round(costiMensile * 100) / 100,
    },
    stipendi: {
      n_dipendenti: stipendiRows.length,
      lordo_mensile: Math.round(stipendiMensile * 100) / 100,
    },
  }
}

async function getClienteDettaglio(supabase, orgId) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const [sediRes, dataRes, eventiRes, orgRes, fattureCntRes, dipendentiCntRes, profileRes, customer360] = await Promise.all([
    supabase
      .from('sedi')
      .select('id, nome, attiva, is_default')
      .eq('organization_id', orgId)
      .order('is_default', { ascending: false })
      .order('nome'),
    supabase
      .from('user_data')
      .select('data_key, sede_id, updated_at')
      .eq('organization_id', orgId),
    supabase
      .from('audit_log')
      .select('id, created_at, user_email, table_name, operation, new_data')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(25),
    supabase
      .from('organizations')
      .select('stripe_customer_id, stripe_subscription_id, stripe_status, stripe_current_period_end, trial_ends_at, mesi_bonus, note_admin')
      .eq('id', orgId)
      .maybeSingle(),
    supabase
      .from('fatture')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    supabase
      .from('dipendenti')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    supabase
      .from('profiles')
      .select('id, email')
      .eq('organization_id', orgId)
      .eq('ruolo', 'titolare')
      .maybeSingle(),
    getCustomer360(supabase, orgId),
  ])

  const usageMap = {}
  for (const r of dataRes.data || []) {
    const u = usageMap[r.data_key] || { conteggio: 0, ultimo: null, n_sedi: new Set() }
    u.conteggio++
    if (r.sede_id) u.n_sedi.add(r.sede_id)
    if (!u.ultimo || (r.updated_at && r.updated_at > u.ultimo)) u.ultimo = r.updated_at
    usageMap[r.data_key] = u
  }
  const usage = Object.entries(usageMap)
    .map(([data_key, v]) => ({ data_key, conteggio: v.conteggio, ultimo: v.ultimo, n_sedi: v.n_sedi.size }))
    .sort((a, b) => (b.ultimo || '').localeCompare(a.ultimo || ''))

  const eventi = (eventiRes.data || []).map(e => ({
    id: e.id,
    when: e.created_at,
    user_email: e.user_email,
    table_name: e.table_name,
    operation: e.operation,
    label: e.new_data?.label || null,
    ruolo: e.new_data?.ruolo || null,
    sede_id: e.new_data?.sede_id || null,
  }))

  // Activation: 6 step concreti che mappano il percorso "primo valore".
  // Done = true se la condizione e' soddisfatta nello stato attuale del DB.
  const hasKey = k => (usageMap[k]?.conteggio || 0) > 0
  const nFatture = fattureCntRes.count || 0
  const nDipendenti = dipendentiCntRes.count || 0
  // Email confermata: query separata su auth.users via admin API (best-effort).
  let emailConfermata = false
  if (profileRes.data?.id) {
    try {
      const { data: u } = await supabase.auth.admin.getUserById(profileRes.data.id)
      emailConfermata = !!u?.user?.email_confirmed_at
    } catch { /* ignore */ }
  }
  // Ultimo accesso negli ultimi 7gg: usiamo ultimo evento utente piu' recente
  // dal subset usage (chiave operativa) come proxy, oppure last_sign_in tramite
  // l'admin API (gia' chiamata sopra non lo include). Qui usiamo l'ultimo
  // updated_at su user_data come proxy "attivita' recente".
  const ultimoAggiornamentoIso = usage.reduce((acc, u) => u.ultimo && u.ultimo > (acc || '') ? u.ultimo : acc, null)
  const attivo7gg = ultimoAggiornamentoIso ? ultimoAggiornamentoIso > sevenDaysAgo : false

  const activation = {
    steps: [
      { key: 'email_verificata',   label: 'Email verificata',        done: emailConfermata },
      { key: 'sede_creata',        label: 'Sede creata',             done: (sediRes.data || []).length > 0 },
      { key: 'ricettario',         label: 'Ricettario popolato',     done: hasKey('pasticceria-ricettario-v1') },
      { key: 'prima_chiusura',     label: 'Prima chiusura cassa',    done: hasKey('pasticceria-chiusure-v1') },
      { key: 'prima_fattura',      label: 'Prima fattura caricata',  done: nFatture > 0 },
      { key: 'attivo_7gg',         label: 'Attivo ultimi 7 giorni',  done: attivo7gg },
    ],
  }
  activation.score = activation.steps.filter(s => s.done).length
  activation.totale = activation.steps.length

  return {
    sedi: sediRes.data || [],
    usage,
    eventi,
    org: orgRes.data || null,
    activation,
    counts: { fatture: nFatture, dipendenti: nDipendenti },
    // Audit 2026-06-19 Customer 360: campi nuovi (legacy frontend ignora se assenti)
    integrazioni: customer360?.integrazioni || null,
    b2b: customer360?.b2b || null,
    pos: customer360?.pos || null,
    push: customer360?.push || null,
    scadenzario: customer360?.scadenzario || null,
    costi: customer360?.costi || null,
    stipendi: customer360?.stipendi || null,
  }
}

// ─── Email domain blocklist (Audit 2026-06-19) ───────────────────────────
// L'admin può bannare interi domini email dal signup. Il check è in
// handle_new_user (vedi migration 20260703).
async function getEmailBlocklist(supabase) {
  const { data, error } = await supabase
    .from('email_domain_blocklist')
    .select('domain, motivo, created_by, created_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

async function azEmailBlocklistAggiungi(supabase, domain, motivo, addedBy) {
  const d = (domain || '').toLowerCase().trim()
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)) throw new Error('Dominio non valido (formato atteso: esempio.com)')
  if (d.length > 100) throw new Error('Dominio troppo lungo')
  const { error } = await supabase
    .from('email_domain_blocklist')
    .upsert({ domain: d, motivo: (motivo || '').slice(0, 200) || null, created_by: addedBy || null })
  if (error) throw new Error(error.message)
}

async function azEmailBlocklistRimuovi(supabase, domain) {
  const d = (domain || '').toLowerCase().trim()
  if (!d) throw new Error('Dominio obbligatorio')
  const { error } = await supabase
    .from('email_domain_blocklist')
    .delete()
    .eq('domain', d)
  if (error) throw new Error(error.message)
}

// ─── Audit 2026-06-19 Customer 360 write actions ─────────────────────────
// Revoca integrazione di un cliente (set attiva=false). Idempotente: se la
// row non esiste o è già inattiva, no-op. Org-scoped per evitare cross-tenant.
async function azIntegrazioneDisattiva(supabase, orgId, integrazioneId) {
  if (!orgId || !integrazioneId) throw new Error('org_id e integrazione_id obbligatori')
  // Sicurezza: verifica che la row appartenga realmente all'org indicata
  // (defense-in-depth contro forged integrazione_id).
  const { data: row, error: e1 } = await supabase
    .from('integrazioni')
    .select('id, organization_id')
    .eq('id', integrazioneId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (e1) throw new Error(e1.message)
  if (!row) throw new Error('Integrazione non trovata per questa organizzazione')
  const { error: e2 } = await supabase
    .from('integrazioni')
    .update({ attiva: false })
    .eq('id', integrazioneId)
  if (e2) throw new Error(e2.message)
}

// Revoca un dispositivo push (set active=false). Stesso pattern: org-scoped.
// Il prossimo invio /api/push-send vedrà active=false e salterà il device.
async function azPushSubRevoca(supabase, orgId, subId) {
  if (!orgId || !subId) throw new Error('org_id e sub_id obbligatori')
  const { data: row, error: e1 } = await supabase
    .from('push_subscriptions')
    .select('id, organization_id')
    .eq('id', subId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (e1) throw new Error(e1.message)
  if (!row) throw new Error('Sottoscrizione push non trovata per questa organizzazione')
  const { error: e2 } = await supabase
    .from('push_subscriptions')
    .update({ active: false })
    .eq('id', subId)
  if (e2) throw new Error(e2.message)
}

// ─── Note CRM admin ──────────────────────────────────────────────────────
async function azSalvaNoteAdmin(supabase, orgId, nota) {
  // Limite 5000 char per evitare abusi.
  const testo = sanitize(nota || '', 5000)
  const { error } = await supabase
    .from('organizations')
    .update({ note_admin: testo || null })
    .eq('id', orgId)
  if (error) throw new Error(error.message)
}

// ─── Security: login attempts + anomalie + audit log filtrato ───────────
export async function getSecuritySnapshot(supabase, hours = 24) {
  const since = new Date(Date.now() - hours * 3600000).toISOString()

  // Login attempts: success vs failed
  let loginStats = null
  try {
    const { data } = await supabase.from('login_attempts')
      .select('success, email, ip, created_at')
      .gte('created_at', since)
    const total = data?.length || 0
    const ok = (data || []).filter(r => r.success === true).length
    const failed = total - ok
    // Top email failure (potenziali brute-force)
    const failByEmail = {}
    for (const r of (data || [])) {
      if (r.success === false && r.email) failByEmail[r.email] = (failByEmail[r.email] || 0) + 1
    }
    const topFailEmails = Object.entries(failByEmail)
      .filter(([, n]) => n >= 3)  // soglia brute-force suspect
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([email, count]) => ({ email, fail_count: count }))
    loginStats = { total, ok, failed, top_fail_emails: topFailEmails }
  } catch (e) {
    loginStats = { error: e.message?.slice(0, 80) }
  }

  // Anomalie rilevate (da audit_log con operation='anomaly_detected').
  // Audit 2026-06-17 HIGH: prima si selezionavano colonne inesistenti
  // (details/ip) — la tab Security era un placebo che ritornava sempre [].
  // Ora usiamo i nomi reali (new_data/client_ip) con fallback per schema legacy.
  let anomalie = []
  try {
    const { data, error } = await supabase.from('audit_log')
      .select('id, user_id, operation, new_data, created_at, client_ip')
      .eq('operation', 'anomaly_detected')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      // Fallback per schema dove le colonne hanno nomi diversi (old)
      const { data: legacy } = await supabase.from('audit_log')
        .select('id, user_id, operation, created_at')
        .eq('operation', 'anomaly_detected')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50)
      anomalie = (legacy || []).map(r => ({ ...r, new_data: null, client_ip: null }))
    } else {
      anomalie = data || []
    }
  } catch (e) {
    anomalie = []
  }

  // Azioni admin recenti (chi ha fatto cosa)
  let adminLog = []
  try {
    const { data } = await supabase.from('admin_log')
      .select('admin_email, azione, org_id, ip, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100)
    adminLog = data || []
  } catch {}

  return {
    periodo_ore: hours,
    since,
    login: loginStats,
    anomalie,
    admin_log: adminLog,
    generated_at: new Date().toISOString(),
  }
}

// ─── Health: cron + deploy + esterni (audit 2026-06-14) ──────────────────
//
// Stima dello stato del sistema basandosi su:
//  - error_log per individuare cron falliti
//  - daily_briefs/forecast/etc. created_at per "ultimo run" dei cron
//  - audit_log per identificare audit cleanup recente
//  - env build-time per deploy info Vercel
const CRON_SIGNATURES = [
  { id: 'cron-daily-brief',    table: 'daily_briefs',           dateCol: 'created_at',  expectedHour: 7 },
  { id: 'cron-ai-suggestions', table: 'ai_suggestions',         dateCol: 'created_at',  expectedHour: 7 },
  { id: 'cron-forecast',       table: 'forecast_giornaliero',   dateCol: 'created_at',  expectedHour: 7 },
  { id: 'cron-documentary',    table: 'documentary_snapshots',  dateCol: 'created_at',  expectedHour: 7 },
]

async function getCronStatus(supabase) {
  const results = []
  for (const cron of CRON_SIGNATURES) {
    try {
      const { data: latest } = await supabase
        .from(cron.table)
        .select(cron.dateCol)
        .order(cron.dateCol, { ascending: false })
        .limit(1)
        .maybeSingle()
      const lastRun = latest?.[cron.dateCol] || null
      const hoursAgo = lastRun ? (Date.now() - new Date(lastRun).getTime()) / 3600000 : null
      // Status: ok se ha girato negli ultimi 26h (cron giornaliero + margine)
      const status = hoursAgo == null ? 'never' : hoursAgo > 26 ? 'late' : hoursAgo > 24 ? 'pending' : 'ok'
      results.push({
        id: cron.id,
        table: cron.table,
        last_run: lastRun,
        hours_ago: hoursAgo ? Math.round(hoursAgo * 10) / 10 : null,
        status,
        expected_hour_utc: cron.expectedHour,
      })
    } catch (e) {
      results.push({ id: cron.id, status: 'error', error: e.message?.slice(0, 100) })
    }
  }
  return results
}

export async function getHealthSnapshot(supabase) {
  // Stima salute generale del sistema
  const cron = await getCronStatus(supabase)
  // Conta errori critici negli ultimi 24h dal error_log
  let erroriUltime24h = null
  try {
    const ieri = new Date(Date.now() - 86400000).toISOString()
    const { count } = await supabase.from('error_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', ieri)
    erroriUltime24h = count
  } catch {}
  // Conteggio righe nelle 12 tabelle AI (table size estimate)
  const tables = [
    'daily_briefs', 'ai_suggestions', 'brain_conversations',
    'recipe_inventions', 'forecast_giornaliero', 'cashflow_eventi',
    'competitor_prices', 'documentary_snapshots', 'whatsapp_links',
    'extracted_invoices', 'marketplace_listings', 'pos_scontrini',
    'organizations', 'profiles', 'sedi', 'fatture',
  ]
  const tableCounts = {}
  for (const t of tables) {
    try {
      const { count } = await supabase.from(t).select('id', { count: 'exact', head: true })
      tableCounts[t] = count != null ? count : 'n/a'
    } catch { tableCounts[t] = 'n/a' }
  }
  // Build info from Vercel env vars
  const buildInfo = {
    vercel_env: process.env.VERCEL_ENV || 'unknown',
    git_commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown',
    git_branch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    deploy_url: process.env.VERCEL_URL || 'unknown',
  }
  return {
    cron,
    errori_ultime_24h: erroriUltime24h,
    table_counts: tableCounts,
    build: buildInfo,
    generated_at: new Date().toISOString(),
  }
}

// ─── AI Telemetry: stato di tutte le 23 feature AI (audit 2026-06-14) ────
// Aggrega counts da 12 tabelle nuove + stima costi Claude.
//
// Costi Claude (Haiku $0.80/1M token input, Sonnet $3/1M, Opus $15/1M) sono
// STIME basate su mediane d'uso. Per esattezza reale serve l'usage API
// Anthropic — qui ci affidiamo a token_estimate per row del cron.
const COST_PER_FEATURE_USD = {
  daily_brief:   0.0008,   // Haiku ~280 token in + 200 out
  ai_suggestion: 0.0001,   // regola-based, niente AI
  brain_msg:     0.012,    // Sonnet ~3000 token avg
  recipe:        0.080,    // Opus ~4000 token
  ocr_invoice:   0.030,    // Sonnet Vision ~2000 token
  forecast_day:  0.0,      // statistico, niente AI
  documentary:   0.040,    // Opus ~1000 token
  reformulation: 0.060,    // Opus ~2500 token
  recensione:    0.020,    // Sonnet ~1000 token
  competitor:    0.015,    // Sonnet ~700 token
  explain_kpi:   0.018,    // Sonnet ~900 token
}

export async function getAiTelemetry(supabase, days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const today = new Date().toISOString().slice(0, 10)

  // Helper count-only query
  const countSince = async (table, dateCol = 'created_at') => {
    try {
      const { count } = await supabase.from(table)
        .select('id', { count: 'exact', head: true })
        .gte(dateCol, since)
      return count || 0
    } catch { return null }
  }

  // Counts per feature (ultimi N giorni)
  const [
    briefsTot, briefsSent, briefsOpened, briefsSettimanali,
    sugTot, sugAgito, sugRifiut,
    brainConv, brainTodayConv,
    recipeTot, recipeSaved,
    ocrTot, ocrConfidence,
    forecastTot,
    docTot,
    reformTot,
    recensTot,
    competitorTot,
    posScontrini,
    whatsappLinks,
  ] = await Promise.all([
    countSince('daily_briefs'),
    (async () => {
      try {
        const { count } = await supabase.from('daily_briefs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since).not('sent_email_at', 'is', null)
        return count || 0
      } catch { return null }
    })(),
    (async () => {
      try {
        const { count } = await supabase.from('daily_briefs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since).not('opened_at', 'is', null)
        return count || 0
      } catch { return null }
    })(),
    (async () => {
      try {
        const { count } = await supabase.from('daily_briefs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since).eq('tipo', 'settimanale')
        return count || 0
      } catch { return null }
    })(),
    countSince('ai_suggestions'),
    (async () => {
      try {
        const { count } = await supabase.from('ai_suggestions')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since).eq('stato', 'agito')
        return count || 0
      } catch { return null }
    })(),
    (async () => {
      try {
        const { count } = await supabase.from('ai_suggestions')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since).eq('stato', 'rifiutato')
        return count || 0
      } catch { return null }
    })(),
    countSince('brain_conversations', 'ultimo_messaggio_at'),
    (async () => {
      try {
        const { data } = await supabase.from('brain_conversations')
          .select('messages, ultimo_messaggio_at').gte('ultimo_messaggio_at', since)
        let totalMsg = 0
        for (const row of (data || [])) totalMsg += (row.messages || []).length
        return totalMsg
      } catch { return 0 }
    })(),
    countSince('recipe_inventions'),
    (async () => {
      try {
        const { data } = await supabase.from('recipe_inventions')
          .select('salvate_ricettario_ids').gte('created_at', since)
        let s = 0
        for (const r of (data || [])) s += (r.salvate_ricettario_ids || []).length
        return s
      } catch { return 0 }
    })(),
    countSince('extracted_invoices'),
    (async () => {
      try {
        const { data } = await supabase.from('extracted_invoices')
          .select('confidence').gte('created_at', since).not('confidence', 'is', null)
        if (!data || data.length === 0) return null
        const sum = data.reduce((s, r) => s + Number(r.confidence || 0), 0)
        return Math.round((sum / data.length) * 100) / 100
      } catch { return null }
    })(),
    countSince('forecast_giornaliero'),
    countSince('documentary_snapshots'),
    (async () => {
      // reformulation non ha tabella dedicata: salvo niente, count = 0
      return 0
    })(),
    (async () => {
      // recensioni risposte: stateless, count = 0 dal DB
      return 0
    })(),
    countSince('competitor_prices', 'scraped_at'),
    countSince('pos_scontrini', 'received_at'),
    (async () => {
      try {
        const { count } = await supabase.from('whatsapp_links')
          .select('id', { count: 'exact', head: true }).eq('attivo', true)
        return count || 0
      } catch { return null }
    })(),
  ])

  // Stima costo Claude USD ultimi N giorni
  const costUsd =
    (briefsTot || 0)        * COST_PER_FEATURE_USD.daily_brief +
    (brainTodayConv || 0)   * COST_PER_FEATURE_USD.brain_msg +
    (recipeTot || 0)        * COST_PER_FEATURE_USD.recipe +
    (ocrTot || 0)           * COST_PER_FEATURE_USD.ocr_invoice +
    (docTot || 0)           * COST_PER_FEATURE_USD.documentary +
    (forecastTot || 0)      * COST_PER_FEATURE_USD.forecast_day +
    (competitorTot || 0)    * COST_PER_FEATURE_USD.competitor
  const costEur = costUsd * 0.92  // approssimazione cambio USD→EUR

  return {
    periodo_giorni: days,
    since,
    // Daily Brief AI
    daily_brief: {
      tot: briefsTot, sent: briefsSent, opened: briefsOpened,
      open_rate: briefsSent && briefsSent > 0 ? Math.round((briefsOpened / briefsSent) * 100) : null,
      settimanali: briefsSettimanali,
    },
    // AI Suggestions proattive
    ai_suggestions: {
      tot: sugTot, agito: sugAgito, rifiutato: sugRifiut,
      action_rate: sugTot && sugTot > 0 ? Math.round((sugAgito / sugTot) * 100) : null,
    },
    // FoodOS Brain (chat)
    brain: {
      conversazioni: brainConv,
      messaggi_tot: brainTodayConv,
    },
    // Recipe Inventor AI
    recipe_inventor: {
      ricette_generate: recipeTot,
      ricette_salvate: recipeSaved,
      save_rate: recipeTot && recipeTot > 0 ? Math.round((recipeSaved / recipeTot) * 100) : null,
    },
    // OCR fatture
    ocr_fatture: {
      estratte: ocrTot,
      avg_confidence: ocrConfidence,
    },
    // Forecast vendite
    forecast: {
      righe_generate: forecastTot,
    },
    // Documentary AI
    documentary: {
      snapshot_creati: docTot,
    },
    // Competitor pricing
    competitor_pricing: {
      prezzi_tracciati: competitorTot,
    },
    // POS scontrini real-time
    pos_scontrini: {
      ricevuti: posScontrini,
    },
    // WhatsApp Bot
    whatsapp: {
      numeri_attivi: whatsappLinks,
    },
    // Reformulation (stateless, no DB tracking)
    reformulation: {
      richieste: reformTot,
    },
    // Recensioni AI (stateless)
    recensioni: {
      risposte_generate: recensTot,
    },
    // Costi stimati (Claude API)
    costi: {
      usd_estimated: Math.round(costUsd * 100) / 100,
      eur_estimated: Math.round(costEur * 100) / 100,
      detail: 'Stima basata su token medi per feature; non sostituisce Anthropic usage API.',
    },
    generated_at: new Date().toISOString(),
  }
}

// ─── Feedback inbox ──────────────────────────────────────────────────────
async function getFeedback(supabase, soloDaGestire) {
  let q = supabase
    .from('feedback')
    .select('id, organization_id, user_email, ruolo, view_corrente, messaggio, sentiment, url, gestito, gestito_at, gestito_by, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (soloDaGestire) q = q.eq('gestito', false)
  const { data, error } = await q
  if (error) throw new Error(error.message)

  // Arricchisci con nome attivita' (lookup organizations).
  const orgIds = Array.from(new Set((data || []).map(f => f.organization_id).filter(Boolean)))
  let orgMap = {}
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, nome')
      .in('id', orgIds)
    for (const o of orgs || []) orgMap[o.id] = o.nome
  }
  return (data || []).map(f => ({ ...f, nome_attivita: orgMap[f.organization_id] || null }))
}

async function azFeedbackMarcaGestito(supabase, id, adminEmail, gestito) {
  const { error } = await supabase
    .from('feedback')
    .update({
      gestito: !!gestito,
      gestito_at: gestito ? new Date().toISOString() : null,
      gestito_by: gestito ? adminEmail : null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ─── Banner globali ──────────────────────────────────────────────────────
async function getBanners(supabase) {
  const { data, error } = await supabase
    .from('app_banners')
    .select('id, messaggio, tipo, attivo, scade_il, creato_da, creato_il')
    .order('creato_il', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return data || []
}

async function azBannerCrea(supabase, body, adminEmail) {
  const messaggio = sanitize(body.messaggio || '', 500)
  if (!messaggio) throw new Error('Messaggio obbligatorio')
  // Il campo `tipo` nel body e' gia' usato per dispatchare l'action,
  // quindi qui leggiamo `severity` (info/warn/critical/success).
  const severity = ['info', 'warn', 'critical', 'success'].includes(body.severity) ? body.severity : 'info'
  let scadeIl = null
  if (body.scade_il) {
    const d = new Date(body.scade_il)
    if (!isNaN(d.getTime()) && d > new Date()) scadeIl = d.toISOString()
  }
  const { data, error } = await supabase
    .from('app_banners')
    .insert({ messaggio, tipo: severity, scade_il: scadeIl, creato_da: adminEmail, attivo: true })
    .select().single()
  if (error) throw new Error(error.message)
  return data
}

async function azBannerDisattiva(supabase, id) {
  const { error } = await supabase
    .from('app_banners')
    .update({ attivo: false })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

async function azBannerElimina(supabase, id) {
  const { error } = await supabase
    .from('app_banners')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ─── Stripe: MRR reale e eventi recenti ─────────────────────────────────
// Calcolo MRR dalle subscription attive (non dalla stima paganti × prezzo).
// Considera solo subscription in status 'active' o 'trialing' (Stripe le
// fattura entrambe quando finisce il trial). Le altre (canceled, past_due,
// incomplete) NON contribuiscono al MRR.
async function getStripeMrr() {
  const stripe = await getStripe()

  // Pagina su tutte le subscription (limite max 100 per call).
  const considerati = ['active', 'trialing']
  const buckets = { active: 0, trialing: 0, past_due: 0, canceled: 0, incomplete: 0 }
  let mrrCents = 0
  let mrrTrialingCents = 0
  let cursor = null
  let pagine = 0
  while (true) {
    const page = await stripe.subscriptions.list({
      limit: 100, status: 'all', ...(cursor ? { starting_after: cursor } : {}),
    })
    for (const sub of page.data) {
      if (buckets[sub.status] != null) buckets[sub.status]++
      if (!considerati.includes(sub.status)) continue
      // Somma items: ognuno e' un prezzo. amount_decimal o unit_amount × qty.
      for (const it of sub.items?.data || []) {
        const price = it.price
        const qty = it.quantity || 1
        if (!price?.unit_amount) continue
        const amt = price.unit_amount * qty
        // Normalizza a mensile in base a recurring.interval.
        const interval = price.recurring?.interval || 'month'
        const intervalCount = price.recurring?.interval_count || 1
        let perMonth = amt
        if (interval === 'year') perMonth = Math.round(amt / 12 / intervalCount)
        else if (interval === 'week') perMonth = Math.round(amt * 4.33 / intervalCount)
        else if (interval === 'day') perMonth = Math.round(amt * 30 / intervalCount)
        else perMonth = Math.round(amt / intervalCount)
        if (sub.status === 'trialing') mrrTrialingCents += perMonth
        else mrrCents += perMonth
      }
    }
    pagine++
    if (!page.has_more || pagine >= 10) break
    cursor = page.data[page.data.length - 1]?.id
    if (!cursor) break
  }

  // Failed payments ultimi 30 giorni
  let failedCnt = 0
  try {
    const since = Math.floor((Date.now() - 30 * 86400000) / 1000)
    const charges = await stripe.charges.list({ limit: 100, created: { gte: since } })
    failedCnt = (charges.data || []).filter(c => c.status === 'failed').length
  } catch { /* ignore */ }

  return {
    mrr_cents: mrrCents,
    mrr_trialing_cents: mrrTrialingCents,
    mrr_totale_cents: mrrCents + mrrTrialingCents,
    sub_active: buckets.active,
    sub_trialing: buckets.trialing,
    sub_past_due: buckets.past_due,
    sub_canceled: buckets.canceled,
    sub_incomplete: buckets.incomplete,
    failed_30d: failedCnt,
    valuta: 'EUR',
  }
}

// Ultimi N eventi Stripe (subscription/charge/invoice). Filtra per tipi
// rilevanti per il monitoring revenue, scarta il resto (verbosi).
const STRIPE_EVENT_TYPES = [
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.finalized',
  'invoice.upcoming',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
  'charge.succeeded',
  'charge.failed',
  'charge.refunded',
  'checkout.session.completed',
  'customer.created',
  'customer.deleted',
]
async function getStripeEvents() {
  const stripe = await getStripe()
  const events = await stripe.events.list({
    limit: 100,
    types: STRIPE_EVENT_TYPES,
  })
  return (events.data || []).map(e => {
    const obj = e.data?.object || {}
    // Email customer: alcuni eventi hanno customer email, altri customer id.
    const customerEmail = obj.customer_email || obj.receipt_email || null
    const customerId = (typeof obj.customer === 'string') ? obj.customer : obj.customer?.id || null
    const amount =
      obj.amount_paid != null ? obj.amount_paid :
      obj.amount_due != null ? obj.amount_due :
      obj.amount != null ? obj.amount :
      obj.total != null ? obj.total : null
    return {
      id: e.id,
      created: e.created * 1000,
      type: e.type,
      livemode: e.livemode,
      customer_id: customerId,
      customer_email: customerEmail,
      amount_cents: amount,
      currency: obj.currency || null,
      status: obj.status || null,
      sub_status: obj.status, // alias di lettura
    }
  })
}

// ─── Errori recenti (alternativa Sentry) ─────────────────────────────────
async function getErroriRecenti(supabase, limit = 100) {
  const { data, error } = await supabase
    .from('error_log')
    .select('id, endpoint, operation, org_id, user_id, code, status, message, hint, context, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data || []
}

// ─── azioni POST ───────────────────────────────────────────────────────────

async function azApprova(supabase, orgId, req) {
  const r1 = await supabase.from('organizations').update({ approvato: true, attivo: true }).eq('id', orgId)
  if (r1.error) throw new Error(r1.error.message)
  const r2 = await supabase.from('profiles').update({ approvato: true }).eq('organization_id', orgId)
  if (r2.error) throw new Error(r2.error.message)

  // Email approvazione (best-effort) — chiamata server→server con shared secret per
  // distinguere chiamate interne da chiamate utente non-autenticate.
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (process.env.INTERNAL_API_SECRET) {
      headers['x-internal-secret'] = process.env.INTERNAL_API_SECRET
    }
    await fetch(new URL('/api/send-email', req.url).toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ tipo: 'approvazione', orgId }),
    })
  } catch { /* ignore */ }
}

async function azBlocca(supabase, orgId) {
  const r = await supabase.from('organizations').update({ attivo: false }).eq('id', orgId)
  if (r.error) throw new Error(r.error.message)
}

async function azRiattiva(supabase, orgId) {
  const r = await supabase.from('organizations').update({ attivo: true }).eq('id', orgId)
  if (r.error) throw new Error(r.error.message)
}

async function azCambiaPiano(supabase, orgId, valore) {
  if (!PIANI_VALIDI.includes(valore)) throw new Error('Piano non valido')
  const r = await supabase.from('organizations').update({ piano: valore }).eq('id', orgId)
  if (r.error) throw new Error(r.error.message)
}

async function azEstendiTrial(supabase, orgId, giorni) {
  const n = parseInt(giorni, 10)
  if (!Number.isFinite(n) || n < 1 || n > 365) throw new Error('Giorni non validi (1-365)')
  const { data: org } = await supabase
    .from('organizations').select('trial_ends_at').eq('id', orgId).single()
  const base = org?.trial_ends_at ? new Date(org.trial_ends_at) : new Date()
  const now = new Date()
  const partenza = base > now ? base : now
  const nuovo = new Date(partenza.getTime() + n * 86400000)
  const r = await supabase
    .from('organizations').update({ trial_ends_at: nuovo.toISOString() }).eq('id', orgId)
  if (r.error) throw new Error(r.error.message)
}

// Helper: invia magic/recovery link all'admin via Resend invece di restituirlo
// al client (audit 2026-06: il link in response finiva nei log Vercel = rischio
// account takeover se i log leakavano).
// Inoltre notifica il titolare via email: "l'admin ha richiesto accesso".
async function _sendLinkEmail({ to, subject, link, body }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY non configurato (necessario per invio link sicuro)')
  }
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7">
    <h2 style="color:#1C0A0A;margin:0 0 8px;font-size:20px">${subject}</h2>
    <p style="color:#6B4C44;font-size:14px;line-height:1.7;margin:0 0 18px">${body}</p>
    ${link ? `<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;padding:12px 22px;background:#C0392B;color:#FFF;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px">Apri link</a></p><p style="font-size:11px;color:#9C7B76">Il link e' valido una sola volta e scade tra 1 ora.</p>` : ''}
  </div>`
  await resend.emails.send({ from: 'FoodOS <noreply@foodios.it>', to, subject, html })
}

async function azImpersona(supabase, orgId, adminEmail) {
  const { data: prof, error } = await supabase
    .from('profiles').select('email').eq('organization_id', orgId).eq('ruolo', 'titolare').maybeSingle()
  if (error) throw new Error(error.message)
  if (!prof?.email) throw new Error('Profilo titolare non trovato')

  const { data, error: err2 } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: prof.email,
  })
  if (err2) throw new Error(err2.message)
  const link = data?.properties?.action_link || null
  if (!link) throw new Error('Magic link non generato')

  // 1) invia il link all'admin che ha richiesto
  await _sendLinkEmail({
    to: adminEmail,
    subject: 'Magic link impersona ' + prof.email,
    body: `Hai richiesto un accesso impersonando ${prof.email}. Clicca il pulsante sotto entro 1 ora per accedere come il titolare.`,
    link,
  })
  // 2) avverte il titolare (non blocca, log se fallisce)
  try {
    await _sendLinkEmail({
      to: prof.email,
      subject: 'Accesso admin al tuo account FoodOS',
      body: `Per esigenze di supporto, il team FoodOS (${adminEmail}) ha richiesto un accesso temporaneo al tuo account il ${new Date().toLocaleString('it-IT')}. Se questa richiesta non e' attesa, scrivici subito a support@foodios.it.`,
    })
  } catch (e) { console.warn('owner alert email failed:', e.message) }

  return { ok: true, link_sent_to: adminEmail, target_email: prof.email }
}

async function azResetPassword(supabase, orgId, adminEmail) {
  const { data: prof } = await supabase
    .from('profiles').select('email').eq('organization_id', orgId).eq('ruolo', 'titolare').maybeSingle()
  if (!prof?.email) throw new Error('Profilo titolare non trovato')

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: prof.email,
  })
  if (error) throw new Error(error.message)
  const link = data?.properties?.action_link || null
  if (!link) throw new Error('Recovery link non generato')

  // Invia il recovery link direttamente al titolare (cosi non passa dall'admin).
  await _sendLinkEmail({
    to: prof.email,
    subject: 'Reset password FoodOS',
    body: `Per richiesta del team FoodOS (${adminEmail}), e' stato generato un link per resettare la password del tuo account. Cliccalo entro 1 ora.`,
    link,
  })

  return { ok: true, sent_to: prof.email }
}

async function azInviaEmail(req, body, supabase) {
  const destinatario = sanitizeStrict(body.destinatario || '', 255)
  const oggetto = sanitize(body.oggetto || '', 200)
  const messaggio = sanitize(body.messaggio || '', 5000)
  if (!validateEmail(destinatario)) throw new Error('Email destinatario non valida')
  if (!oggetto || !messaggio) throw new Error('Oggetto e messaggio obbligatori')

  // Whitelist: solo a profili registrati in foodios (audit 2026-06: prima
  // l'admin poteva inviare a qualsiasi indirizzo → vettore phishing se
  // account admin compromesso).
  // SECURITY (audit 2026-07-01 HIGH): `.ilike` interpreta `%` e `_` come
  // wildcard SQL. Un attaccante che registra `admin@foodios%` viene matchato
  // dal destinatario `admin@foodios.it`. Escapare PRIMA del confronto.
  const destLow = destinatario.toLowerCase()
  const destEscaped = destLow.replace(/([%_\\])/g, '\\$1')
  const { data: profileMatch } = await supabase
    .from('profiles').select('id')
    .ilike('email', destEscaped).limit(1).maybeSingle()
  if (!profileMatch) {
    throw new Error(
      `Destinatario "${destinatario}" non e' registrato come utente FoodOS. ` +
      `Anti-abuso: l'admin puo' scrivere solo a clienti.`
    )
  }

  // Inoltra a send-email con tipo=custom, includendo l'auth header originale
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')
  const res = await fetch(new URL('/api/send-email', req.url).toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify({ tipo: 'custom', email: destinatario, oggetto, messaggio }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`send-email ha risposto ${res.status}: ${errText.slice(0, 200)}`)
  }
}

// ─── CODICI SCONTO ─────────────────────────────────────────────────────────
// Wrappa Stripe Coupons + Promotion Codes e mantiene una copia in
// `discount_codes` per audit/UI. La verifica reale al checkout è di Stripe
// (allow_promotion_codes già attivo lato session create).

async function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe non configurato')
  const { default: Stripe } = await import('stripe')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
}

async function getCodiciSconto(supabase) {
  const { data, error } = await supabase
    .from('discount_codes')
    .select('*')
    .order('creato_il', { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return data || []
}

function normalizzaCodice(c) {
  return (c || '').toString().trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
}

async function creaCodiceSconto(supabase, body, adminEmail) {
  const codice = normalizzaCodice(body.codice)
  if (codice.length < 3 || codice.length > 30) throw new Error('Codice: 3-30 caratteri alfanumerici')

  const descrizione = sanitize(body.descrizione || '', 200)
  const tipoSconto = body.tipo_sconto === 'amount' ? 'amount' : 'percent'
  const valore = parseInt(body.valore_sconto, 10)
  if (!Number.isFinite(valore) || valore <= 0) throw new Error('Valore sconto non valido')
  if (tipoSconto === 'percent' && valore > 100) throw new Error('Percentuale massima: 100')
  if (tipoSconto === 'amount' && valore > 1_000_000) throw new Error('Sconto fisso troppo alto')

  const durata = ['once', 'repeating', 'forever'].includes(body.durata) ? body.durata : 'once'
  const durataMesi = durata === 'repeating'
    ? Math.max(1, Math.min(60, parseInt(body.durata_mesi, 10) || 1))
    : null

  const maxRedemptions = body.max_redemptions != null && body.max_redemptions !== ''
    ? Math.max(1, Math.min(100000, parseInt(body.max_redemptions, 10) || 1))
    : null

  let scadeIl = null
  if (body.scade_il) {
    const d = new Date(body.scade_il)
    if (!isNaN(d.getTime()) && d > new Date()) scadeIl = d.toISOString()
  }

  // Verifica unicità
  const { data: esiste } = await supabase
    .from('discount_codes').select('id').eq('codice', codice).maybeSingle()
  if (esiste) throw new Error(`Codice "${codice}" già esistente`)

  const stripe = await getStripe()

  // 1. Crea Coupon Stripe
  const couponPayload = { name: codice, metadata: { creato_da: adminEmail, descrizione } }
  if (tipoSconto === 'percent') couponPayload.percent_off = valore
  else { couponPayload.amount_off = valore; couponPayload.currency = 'eur' }
  couponPayload.duration = durata
  if (durata === 'repeating') couponPayload.duration_in_months = durataMesi
  if (maxRedemptions) couponPayload.max_redemptions = maxRedemptions
  if (scadeIl) couponPayload.redeem_by = Math.floor(new Date(scadeIl).getTime() / 1000)

  const coupon = await stripe.coupons.create(couponPayload)

  // 2. Crea Promotion Code (alias leggibile)
  const promoPayload = {
    coupon: coupon.id,
    code: codice,
    active: true,
    metadata: { creato_da: adminEmail, descrizione },
  }
  if (maxRedemptions) promoPayload.max_redemptions = maxRedemptions
  if (scadeIl) promoPayload.expires_at = Math.floor(new Date(scadeIl).getTime() / 1000)

  const promo = await stripe.promotionCodes.create(promoPayload)

  // 3. Salva localmente
  const { data: row, error } = await supabase.from('discount_codes').insert({
    codice,
    descrizione: descrizione || null,
    stripe_coupon_id: coupon.id,
    stripe_promo_code_id: promo.id,
    tipo_sconto: tipoSconto,
    valore_sconto: valore,
    durata,
    durata_mesi: durataMesi,
    max_redemptions: maxRedemptions,
    scade_il: scadeIl,
    piani_validi: Array.isArray(body.piani_validi) && body.piani_validi.length > 0
      ? body.piani_validi.filter(p => ['pro', 'chain'].includes(p))
      : null,
    creato_da: adminEmail,
    attivo: true,
  }).select().single()
  if (error) throw new Error(error.message)

  return row
}

async function disattivaCodiceSconto(supabase, codiceId) {
  const { data: row } = await supabase
    .from('discount_codes').select('*').eq('id', codiceId).single()
  if (!row) throw new Error('Codice non trovato')

  if (row.stripe_promo_code_id) {
    try {
      const stripe = await getStripe()
      await stripe.promotionCodes.update(row.stripe_promo_code_id, { active: false })
    } catch (e) { /* idempotent: il codice in Stripe potrebbe essere già inattivo */ }
  }

  const { error } = await supabase.from('discount_codes')
    .update({ attivo: false, disattivato_il: new Date().toISOString() })
    .eq('id', codiceId)
  if (error) throw new Error(error.message)
}

async function eliminaCodiceSconto(supabase, codiceId) {
  const { data: row } = await supabase
    .from('discount_codes').select('*').eq('id', codiceId).single()
  if (!row) throw new Error('Codice non trovato')

  // Su Stripe non possiamo eliminare un coupon con redemptions: disattiviamo soltanto.
  if (row.stripe_promo_code_id) {
    try {
      const stripe = await getStripe()
      await stripe.promotionCodes.update(row.stripe_promo_code_id, { active: false })
    } catch (e) { /* ignore */ }
  }
  if (row.stripe_coupon_id && row.redemptions === 0) {
    try {
      const stripe = await getStripe()
      await stripe.coupons.del(row.stripe_coupon_id)
    } catch (e) { /* ignore */ }
  }

  const { error } = await supabase.from('discount_codes').delete().eq('id', codiceId)
  if (error) throw new Error(error.message)
}

async function applicaCodiceManuale(supabase, orgId, codice, mesi) {
  // Applicazione manuale dell'admin: regala N mesi gratis a un'organizzazione
  // estendendo direttamente la subscription Stripe via "trial_end" o "discount" inline.
  const codNorm = normalizzaCodice(codice)
  if (codNorm) {
    const { data: cod } = await supabase.from('discount_codes').select('*').eq('codice', codNorm).maybeSingle()
    if (!cod || !cod.attivo) throw new Error('Codice non valido o disattivato')
  }
  const nMesi = Math.max(1, Math.min(60, parseInt(mesi, 10) || 1))

  const { data: org } = await supabase
    .from('organizations').select('id, stripe_subscription_id, trial_ends_at').eq('id', orgId).single()
  if (!org) throw new Error('Organization non trovata')

  if (org.stripe_subscription_id) {
    const stripe = await getStripe()
    const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id)
    const oraSec = Math.floor(Date.now() / 1000)
    const baseSec = (sub.trial_end && sub.trial_end > oraSec) ? sub.trial_end : oraSec
    const newTrialEnd = baseSec + nMesi * 30 * 86400
    await stripe.subscriptions.update(org.stripe_subscription_id, {
      trial_end: newTrialEnd,
      proration_behavior: 'none',
    })
  } else {
    // Org senza sub Stripe: estende il trial interno
    const base = org.trial_ends_at && new Date(org.trial_ends_at) > new Date()
      ? new Date(org.trial_ends_at)
      : new Date()
    const nuovo = new Date(base.getTime() + nMesi * 30 * 86400 * 1000)
    await supabase.from('organizations').update({
      trial_ends_at: nuovo.toISOString(),
    }).eq('id', orgId)
  }

  await supabase.from('discount_redemptions').insert({
    codice: codNorm || `ADMIN_GIFT_${nMesi}M`,
    organization_id: orgId,
  })
  return { mesi: nMesi }
}

// ─── PREZZI PIANI ──────────────────────────────────────────────────────────
async function getPlanPricing(supabase) {
  const { data, error } = await supabase
    .from('plan_pricing')
    .select('plan, prezzo_mese_cents, valuta, stripe_price_id, label, aggiornato_da, aggiornato_il')
    .order('plan')
  if (error) throw new Error(error.message)
  return data || []
}

async function setPlanPricing(supabase, body, adminEmail) {
  const plan = body.plan === 'chain' ? 'chain' : body.plan === 'pro' ? 'pro' : null
  if (!plan) throw new Error('Piano non valido (pro|chain)')

  // Importo in centesimi: intero positivo, max 100.000 €/mese (sanity guard).
  const cents = parseInt(body.prezzo_mese_cents, 10)
  if (!Number.isFinite(cents) || cents < 0 || cents > 10_000_000) {
    throw new Error('Prezzo non valido')
  }
  // stripe_price_id opzionale: deve sembrare un price_id Stripe se presente.
  let stripePriceId = (body.stripe_price_id || '').toString().trim()
  if (stripePriceId && !/^price_[A-Za-z0-9]+$/.test(stripePriceId)) {
    throw new Error('stripe_price_id non valido (atteso "price_...")')
  }
  stripePriceId = stripePriceId || null

  const { data: prev } = await supabase
    .from('plan_pricing').select('prezzo_mese_cents').eq('plan', plan).maybeSingle()

  const { data: row, error } = await supabase
    .from('plan_pricing')
    .upsert({
      plan,
      prezzo_mese_cents: cents,
      stripe_price_id: stripePriceId,
      label: plan === 'chain' ? 'Chain' : 'Pro',
      aggiornato_da: adminEmail,
      aggiornato_il: new Date().toISOString(),
    }, { onConflict: 'plan' })
    .select().single()
  if (error) throw new Error(error.message)

  await supabase.from('plan_pricing_log').insert({
    plan,
    prezzo_vecchio: prev?.prezzo_mese_cents ?? null,
    prezzo_nuovo: cents,
    stripe_price_id: stripePriceId,
    aggiornato_da: adminEmail,
  })
  return row
}

async function azPulisciDemoFatture(supabase, orgId, valore) {
  // STRICT VALIDATION: solo 'preview' (sola lettura) o 'esegui' (cancellazione).
  // Qualunque altro valore (anche vuoto) viene trattato come preview per evitare cancellazioni accidentali.
  const mode = valore === 'esegui' ? 'esegui' : 'preview'

  const { data: fatture, error: fetchErr } = await supabase
    .from('fatture')
    .select('id, fornitore, numero_rif, data_fattura, totale')
    .eq('organization_id', orgId)
  if (fetchErr) throw new Error(fetchErr.message)

  const matches = (fatture || []).filter(f =>
    DEMO_FATTURE_FINGERPRINT.some(([nr, forn, data]) =>
      f.numero_rif === nr && f.fornitore === forn && f.data_fattura === data
    )
  )

  if (mode === 'preview') return { matches, count: matches.length, mode: 'preview' }

  if (matches.length === 0) return { deleted: 0, mode: 'esegui' }

  const { error: delErr } = await supabase
    .from('fatture')
    .delete()
    .in('id', matches.map(m => m.id))
  if (delErr) throw new Error(delErr.message)

  return { deleted: matches.length, matches, mode: 'esegui' }
}

// Tabelle che vengono cancellate insieme all'organization (best-effort).
// Estratto come costante per riusarlo nel preview-count.
// NB: in azElimina ora preferiamo la RPC `admin_org_cascade_delete` (atomica,
// migration 20260630) e fallback solo se la RPC non esiste — questa lista
// resta come fonte per il PREVIEW.
const TABELLE_ELIMINA_ORG = [
  'user_data', 'turni', 'dipendenti', 'dipendenti_stipendio',
  'fornitori', 'ordini_fornitori', 'notifiche', 'integrazioni',
  'sync_log', 'sedi', 'fatture', 'note_giornaliere', 'referral',
  // Tabelle AI nuove (post Daily Brief 2026-06)
  'daily_briefs', 'ai_suggestions', 'brain_conversations',
  'recipe_inventions', 'forecast_giornaliero', 'cashflow_eventi',
  'competitor_prices', 'documentary_snapshots', 'whatsapp_links',
  'extracted_invoices', 'pos_scontrini',
  // Tabelle aggiunte audit 2026-07-01 (residui post-audit):
  'haccp_temperature', 'costi_aziendali', 'scadenzario_pagamenti',
  'inventario_produzione', 'stock_prodotti_finiti', 'vendite_b2b',
  'sdi_invoice_log', 'trasferimenti', 'ai_usage_daily',
  'view_usage_daily', 'feedback', 'audit_log', 'error_log',
  'plan_pricing_log', 'discount_redemptions', 'sdi_emission_queue',
  'cashflow_eventi', 'login_attempts', 'rate_limits',
]

// Conta i record che verrebbero eliminati (dry-run). Usato dall'UI admin per
// mostrare "stai per eliminare 234 righe in 18 tabelle" prima della conferma.
async function azEliminaPreview(supabase, orgId) {
  const counts = {}
  for (const t of TABELLE_ELIMINA_ORG) {
    try {
      const { count } = await supabase.from(t)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
      if (count != null) counts[t] = count
    } catch { /* skip non esistenti */ }
  }
  const { count: nProfiles } = await supabase
    .from('profiles').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)
  counts['profiles'] = nProfiles || 0
  counts['organizations'] = 1
  const totale = Object.values(counts).reduce((s, n) => s + n, 0)
  return { totale, counts }
}

async function azElimina(supabase, orgId, conferma, expectedCount) {
  // Doppia conferma: testo "ELIMINA" + count atteso confermato dal client.
  if (conferma !== 'ELIMINA') throw new Error('Conferma mancante (stringa ELIMINA)')

  // Verifica che il count corrisponda a quello mostrato all'admin al preview.
  // Se nel frattempo i dati sono cambiati (es. nuova fattura), interrompe.
  if (expectedCount != null) {
    const { totale } = await azEliminaPreview(supabase, orgId)
    if (totale !== Number(expectedCount)) {
      throw new Error(
        `Stato cambiato dal preview: ${totale} record vs ${expectedCount} attesi. Riapri il preview.`
      )
    }
  }

  // Snapshot profili PRIMA del delete (servono per auth.users cleanup).
  const { data: profiles } = await supabase
    .from('profiles').select('id, email').eq('organization_id', orgId)

  // Preferiamo la RPC `admin_org_cascade_delete` (migration 20260630): cancella
  // tutte le tabelle figlie in UNA TRANSAZIONE — niente timeout-mezzo-eliminato,
  // rollback automatico su errore. Fallback al loop sequenziale solo se la RPC
  // non e' deployata (DB pre-20260630).
  const { error: rpcErr } = await supabase.rpc('admin_org_cascade_delete', { p_org_id: orgId })
  if (rpcErr) {
    // Fallback: la RPC potrebbe non esistere (migration non applicata) o aver
    // fallito per motivi specifici. Logghiamo e procediamo con DELETE manuali
    // ma senza atomicita'.
    console.warn('[azElimina] admin_org_cascade_delete RPC fallita, fallback al loop:', rpcErr.message)
    for (const t of TABELLE_ELIMINA_ORG) {
      try {
        await supabase.from(t).delete().eq('organization_id', orgId)
      } catch { /* tabella opzionale */ }
    }
    await supabase.from('profiles').delete().eq('organization_id', orgId)
    const r = await supabase.from('organizations').delete().eq('id', orgId)
    if (r.error) throw new Error(r.error.message)
  }

  // Elimina utenti auth (best-effort, in coda). Tracciare fallimenti per evitare
  // utenti orfani che possono ancora fare login senza profilo.
  const fallitiAuth = []
  for (const p of profiles || []) {
    try {
      await supabase.auth.admin.deleteUser(p.id)
    } catch (e) {
      fallitiAuth.push({ id: p.id, email: p.email, error: e?.message })
    }
  }
  if (fallitiAuth.length > 0) {
    // Log su error_log per recovery manuale; non interrompe la pipeline.
    try {
      await supabase.from('error_log').insert({
        endpoint: 'admin.azElimina',
        status_code: 500,
        error_message: `auth.admin.deleteUser fallita per ${fallitiAuth.length} utenti dell'org ${orgId}`,
        context: { orgId, fallitiAuth },
      })
    } catch { /* error_log opzionale */ }
  }
}

// ─── Usage Analytics: quali view i clienti usano di più (audit 2026-06-14) ─
// Aggregato da view_usage_daily (vedi migration 20260614_view_usage_daily.sql).
// Restituisce per la finestra temporale richiesta:
//   - top view per open_count totale + utenti unici + org uniche
//   - bottom view (le meno usate): segnalano possibili candidati alla
//     deprecazione o necessità di onboarding mirato
//   - utenti attivi per giorno (DAU)
//   - retention per view (org che la riusano in 7gg)
export async function getUsageStats(supabase, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

  // 1) Aggregato per view: open_count totale + DAU/MAU + org uniche
  let perView = []
  try {
    const { data } = await supabase
      .from('view_usage_daily')
      .select('view_name, open_count, user_id, organization_id, date')
      .gte('date', since)
      .limit(50000)
    const byView = {}
    for (const r of (data || [])) {
      const v = r.view_name
      if (!byView[v]) byView[v] = { view: v, opens: 0, users: new Set(), orgs: new Set(), dates: new Set() }
      byView[v].opens += (r.open_count || 0)
      byView[v].users.add(r.user_id)
      byView[v].orgs.add(r.organization_id)
      byView[v].dates.add(r.date)
    }
    perView = Object.values(byView).map(v => ({
      view: v.view,
      opens: v.opens,
      utenti_unici: v.users.size,
      org_uniche: v.orgs.size,
      giorni_attivi: v.dates.size,
    })).sort((a, b) => b.opens - a.opens)
  } catch (e) {
    perView = []
  }

  // 2) DAU per gli ultimi giorni
  let dauDaily = []
  try {
    const { data } = await supabase
      .from('view_usage_daily')
      .select('date, user_id')
      .gte('date', since)
      .limit(50000)
    const byDate = {}
    for (const r of (data || [])) {
      if (!byDate[r.date]) byDate[r.date] = new Set()
      byDate[r.date].add(r.user_id)
    }
    dauDaily = Object.entries(byDate)
      .map(([date, users]) => ({ date, dau: users.size }))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch { /* skip */ }

  return {
    periodo_giorni: days,
    since,
    top_view: perView.slice(0, 15),
    bottom_view: perView.slice().reverse().slice(0, 10),  // le 10 meno usate
    totale_view_tracciate: perView.length,
    dau_daily: dauDaily,
    generated_at: new Date().toISOString(),
  }
}

// ─── Cleanup E2E: rimuove account creati dai test Playwright ──────────────
// Pattern email RESTRITTIVI per matchare SOLO i test, mai utenti reali.
// Audit 2026-06-14 PM: il pattern `e2e+%` matchava alias Gmail di utenti
// reali (es. e2e+team@gmail.com). Restretto al dominio dedicato test.
//
// IMPORTANTE: il dominio @foodios-e2e.test è un dominio NON registrabile
// (TLD .test riservato per testing, RFC 2606). Nessun utente reale può
// averla. Sicuro al 100%.
const E2E_EMAIL_PATTERNS = ['%@foodios-e2e.test']

async function findE2EOrgs(supabase) {
  // Pesca tutti i profili con email matchante pattern E2E, poi resolve org_id.
  // Ritorna anche le email per permettere UI preview lista completa.
  const allProfiles = []
  for (const pattern of E2E_EMAIL_PATTERNS) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, email, organization_id')
        .ilike('email', pattern)
      if (data) allProfiles.push(...data)
    } catch { /* skip */ }
  }
  // Dedup per org_id (un'org può avere più profili)
  const byOrg = new Map()
  for (const p of allProfiles) {
    if (!p.organization_id) continue
    if (!byOrg.has(p.organization_id)) byOrg.set(p.organization_id, [])
    byOrg.get(p.organization_id).push(p.email)
  }
  return Array.from(byOrg.entries()).map(([orgId, emails]) => ({ orgId, emails }))
}

async function azCleanupE2EPreview(supabase) {
  const orgs = await findE2EOrgs(supabase)
  return {
    orgs_count: orgs.length,
    orgs: orgs.slice(0, 50),  // primi 50 con email per UI preview
    truncated: orgs.length > 50,
    patterns: E2E_EMAIL_PATTERNS,
  }
}

async function azCleanupE2E(supabase, conferma, expectedCount = null) {
  if (conferma !== 'CLEANUP_E2E') {
    throw new Error('Conferma mancante (stringa CLEANUP_E2E)')
  }
  const orgs = await findE2EOrgs(supabase)
  // Audit 2026-07-01 HIGH: expectedCount check come in azElimina — protegge
  // da cleanup massivo se nel frattempo un test ha creato 500 org per errore.
  if (expectedCount != null && Number(expectedCount) !== orgs.length) {
    throw new Error(
      `Stato cambiato dal preview: ${orgs.length} org E2E vs ${expectedCount} attesi. Riapri il preview.`
    )
  }
  // Cap di sicurezza: se piu' di 200 org E2E sono identificate in una run,
  // probabilmente il pattern e' troppo largo (incident).
  if (orgs.length > 200) {
    throw new Error(`Trovati ${orgs.length} org E2E in una run — limite di sicurezza 200. Verifica i pattern.`)
  }
  const results = { eliminate: 0, falliti: 0, errori: [] }
  for (const { orgId } of orgs) {
    try {
      // Riusa la stessa logica di azElimina via RPC atomica.
      const { error: rpcErr } = await supabase.rpc('admin_org_cascade_delete', { p_org_id: orgId })
      if (rpcErr) {
        // Fallback al loop sequenziale se RPC non c'e' (DB pre-20260630).
        for (const t of TABELLE_ELIMINA_ORG) {
          try { await supabase.from(t).delete().eq('organization_id', orgId) } catch {}
        }
        const { data: profiles } = await supabase
          .from('profiles').select('id').eq('organization_id', orgId)
        await supabase.from('profiles').delete().eq('organization_id', orgId)
        await supabase.from('organizations').delete().eq('id', orgId)
        for (const p of profiles || []) {
          try { await supabase.auth.admin.deleteUser(p.id) } catch {}
        }
      } else {
        // Cleanup utenti auth dopo la cascade (la RPC non tocca auth.users).
        const { data: profiles } = await supabase
          .from('profiles').select('id').eq('organization_id', orgId)
        for (const p of profiles || []) {
          try { await supabase.auth.admin.deleteUser(p.id) } catch {}
        }
      }
      results.eliminate++
    } catch (e) {
      results.falliti++
      results.errori.push({ org_id: orgId, error: e.message?.slice(0, 100) })
    }
  }
  return results
}

// ═══════════════════════════════════════════════════════════════════════
// AUDIT 2026-06-20 — ADMIN v2: activity feed, customer signals, funnel,
// errors grouped, AI cost per cliente, global search, SQL editor sicuro.
// ═══════════════════════════════════════════════════════════════════════

// ─── Activity feed: ultimi 80 eventi mergeati ─────────────────────────────
// Sorgenti: error_log (errori prod), audit_log (modifiche dati), feedback,
// admin_log (azioni admin). Best-effort: se una tabella manca, salta.
async function getActivityFeed(supabase, limit = 80) {
  const [errR, audR, fbR, admR] = await Promise.all([
    fetchSafe(supabase.from('error_log')
      .select('id, created_at, endpoint, operation, code, status, message, org_id')
      .order('created_at', { ascending: false }).limit(40)),
    fetchSafe(supabase.from('audit_log')
      .select('id, created_at, table_name, operation, row_id, new_data')
      .order('created_at', { ascending: false }).limit(40)),
    fetchSafe(supabase.from('feedback')
      .select('id, created_at, sentiment, user_email, messaggio, organization_id')
      .order('created_at', { ascending: false }).limit(20)),
    fetchSafe(supabase.from('admin_log')
      .select('id, created_at, admin_email, azione, org_id')
      .order('created_at', { ascending: false }).limit(20)),
  ])

  const events = []
  for (const e of (errR.data || [])) {
    events.push({
      kind: 'error',
      ts: e.created_at,
      org_id: e.org_id,
      title: `${e.endpoint || '?'} · ${e.operation || ''}`,
      detail: (e.message || '').slice(0, 200),
      code: e.code || `HTTP_${e.status || '?'}`,
      severity: 'err',
      ref_id: e.id,
    })
  }
  for (const e of (audR.data || [])) {
    if (e.table_name === 'organizations' && e.operation === 'UPDATE') {
      const newD = e.new_data || {}
      const title = newD.approvato ? 'Cliente approvato' : (newD.attivo === false ? 'Cliente bloccato' : 'Org aggiornata')
      events.push({
        kind: 'audit',
        ts: e.created_at,
        org_id: e.row_id,
        title,
        detail: '',
        severity: 'info',
        ref_id: e.id,
      })
    }
  }
  for (const f of (fbR.data || [])) {
    events.push({
      kind: 'feedback',
      ts: f.created_at,
      org_id: f.organization_id,
      title: `Feedback ${f.sentiment}: ${f.user_email || 'anonimo'}`,
      detail: (f.messaggio || '').slice(0, 200),
      severity: f.sentiment === 'bug' ? 'warn' : 'info',
      ref_id: f.id,
    })
  }
  for (const a of (admR.data || [])) {
    events.push({
      kind: 'admin',
      ts: a.created_at,
      org_id: a.org_id,
      title: `${a.azione} (${a.admin_email || ''})`,
      detail: '',
      severity: 'info',
      ref_id: a.id,
    })
  }

  events.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
  return events.slice(0, limit)
}

// ─── Customer signals: hot / silent / churning / new-value / normal ──────
// Per ogni org calcola uno status azionabile in base a engagement recente.
async function getCustomerSignals(supabase) {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString()
  const isoMonthDate = (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.toISOString().slice(0,10) })()

  // Bulk fetch: clienti base + ultimi accessi via auth + attività recente
  const [orgsR, usersR, udLastR, errR] = await Promise.all([
    supabase.from('organizations')
      .select('id, nome, approvato, attivo, trial_ends_at, stripe_status, created_at')
      .limit(1000),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    fetchSafe(supabase.from('user_data')
      .select('organization_id, updated_at')
      .gte('updated_at', thirtyDaysAgo)
      .order('updated_at', { ascending: false })
      .limit(5000)),
    fetchSafe(supabase.from('error_log')
      .select('org_id')
      .gte('created_at', sevenDaysAgo)
      .limit(2000)),
  ])
  if (orgsR.error) throw new Error(orgsR.error.message)

  // Mappa per-org delle ultime attività
  const lastUd = new Map()   // org_id → ISO ultimo update
  const cntUd7 = new Map()   // org_id → count user_data updates ultimi 7gg
  const cntUd14 = new Map()  // org_id → count user_data updates 8-14gg fa
  for (const r of (udLastR.data || [])) {
    if (!r.organization_id) continue
    const ts = r.updated_at
    if (!lastUd.has(r.organization_id) || ts > lastUd.get(r.organization_id)) {
      lastUd.set(r.organization_id, ts)
    }
    if (ts >= sevenDaysAgo) {
      cntUd7.set(r.organization_id, (cntUd7.get(r.organization_id) || 0) + 1)
    } else if (ts >= fourteenDaysAgo) {
      cntUd14.set(r.organization_id, (cntUd14.get(r.organization_id) || 0) + 1)
    }
  }
  // Errori produzione per org ultimi 7gg
  const errByOrg = new Map()
  for (const e of (errR.data || [])) {
    if (!e.org_id) continue
    errByOrg.set(e.org_id, (errByOrg.get(e.org_id) || 0) + 1)
  }
  // Mappa email per ultimo sign in (titolare)
  const lastSignInByEmail = {}
  for (const u of (usersR.data?.users || [])) {
    if (u.email) lastSignInByEmail[u.email.toLowerCase()] = u.last_sign_in_at
  }
  // Mappa titolare per org
  const { data: profs } = await supabase.from('profiles')
    .select('organization_id, email, ruolo')
    .eq('ruolo', 'titolare')
    .limit(2000)
  const titolareByOrg = new Map()
  for (const p of (profs || [])) {
    if (!titolareByOrg.has(p.organization_id)) titolareByOrg.set(p.organization_id, p.email?.toLowerCase())
  }

  const signals = []
  for (const o of (orgsR.data || [])) {
    if (o.attivo === false) {
      signals.push({ org_id: o.id, status: 'blocked', detail: 'bloccato manualmente' })
      continue
    }
    const lastUdTs = lastUd.get(o.id) || null
    const c7 = cntUd7.get(o.id) || 0
    const c14 = cntUd14.get(o.id) || 0
    const errs = errByOrg.get(o.id) || 0
    const titolareEmail = titolareByOrg.get(o.id)
    const lastSignIn = titolareEmail ? lastSignInByEmail[titolareEmail] : null
    const trialOk = o.trial_ends_at && new Date(o.trial_ends_at) > now
    const trialDays = o.trial_ends_at ? Math.floor((new Date(o.trial_ends_at) - now) / 86400000) : null

    // CHURNING: pagante con drop attività ≥50% vs settimana scorsa
    if (o.approvato && c14 > 0 && c7 < c14 * 0.5) {
      signals.push({
        org_id: o.id, status: 'churning',
        detail: `attività ${c7} ultimi 7gg vs ${c14} sett. prec. (-${Math.round(100 - 100 * c7 / c14)}%)`,
      })
      continue
    }
    // ERRORS: tanti errori produzione recenti
    if (errs >= 10) {
      signals.push({
        org_id: o.id, status: 'errors',
        detail: `${errs} errori produzione ultimi 7gg`,
      })
      continue
    }
    // HOT: trial < 14gg + ≥3 attività ultima settimana
    if (trialOk && trialDays != null && trialDays <= 14 && c7 >= 3) {
      signals.push({
        org_id: o.id, status: 'hot',
        detail: `trial ${trialDays}gg + ${c7} attività ultimi 7gg`,
      })
      continue
    }
    // NEW VALUE: registrato ≥ 3gg fa + < 14gg + prima attività dopo registrazione
    const ageDays = Math.floor((now - new Date(o.created_at)) / 86400000)
    if (ageDays >= 3 && ageDays <= 14 && c7 >= 1 && !o.approvato) {
      signals.push({
        org_id: o.id, status: 'new_value',
        detail: `registrato ${ageDays}gg fa, attivo`,
      })
      continue
    }
    // SILENT: trial attivo MA 0 attività ultimi 7gg
    if (trialOk && c7 === 0 && ageDays >= 2) {
      signals.push({
        org_id: o.id, status: 'silent',
        detail: 'trial attivo, 0 attività ultimi 7gg',
      })
      continue
    }
    signals.push({ org_id: o.id, status: 'normal', detail: '' })
  }
  return signals
}

// ─── Onboarding funnel: dropoff step per step su clienti registrati ──────
async function getOnboardingFunnel(supabase, days = 60) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const sinceDate = since.slice(0, 10)
  const [orgsR, usersR] = await Promise.all([
    supabase.from('organizations')
      .select('id, created_at, approvato, attivo, trial_ends_at')
      .gte('created_at', since).limit(2000),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ])
  if (orgsR.error) throw new Error(orgsR.error.message)
  const userByEmail = {}
  for (const u of (usersR.data?.users || [])) {
    if (u.email) userByEmail[u.email.toLowerCase()] = u
  }
  const orgs = orgsR.data || []
  const orgIds = orgs.map(o => o.id)
  if (orgIds.length === 0) {
    return { days, n: 0, steps: [] }
  }
  // Bulk per ogni step
  const [sediR, profsR, udR, fattureR] = await Promise.all([
    fetchSafe(supabase.from('sedi').select('organization_id, created_at').in('organization_id', orgIds)),
    fetchSafe(supabase.from('profiles').select('organization_id, email, ruolo').eq('ruolo', 'titolare').in('organization_id', orgIds)),
    fetchSafe(supabase.from('user_data').select('organization_id, data_key, updated_at').in('organization_id', orgIds)
      .in('data_key', ['pasticceria-ricettario-v1', 'pasticceria-chiusure-v1', 'pasticceria-magazzino-v1'])),
    fetchSafe(supabase.from('fatture').select('organization_id, data_emissione').in('organization_id', orgIds).limit(2000)),
  ])
  const sediByOrg = new Set()
  for (const s of (sediR.data || [])) sediByOrg.add(s.organization_id)
  const titolareEmailByOrg = {}
  for (const p of (profsR.data || [])) titolareEmailByOrg[p.organization_id] = (p.email || '').toLowerCase()
  const ricByOrg = new Set()
  const chiusByOrg = new Set()
  for (const u of (udR.data || [])) {
    if (u.data_key === 'pasticceria-ricettario-v1') ricByOrg.add(u.organization_id)
    if (u.data_key === 'pasticceria-chiusure-v1') chiusByOrg.add(u.organization_id)
  }
  const fattByOrg = new Set()
  for (const f of (fattureR.data || [])) fattByOrg.add(f.organization_id)

  let nRegistrati = orgs.length
  let nEmail = 0, nSede = 0, nRicettario = 0, nChiusura = 0, nFattura = 0, nAttivo7gg = 0, nPagante = 0
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  for (const o of orgs) {
    const titEmail = titolareEmailByOrg[o.id]
    const u = titEmail ? userByEmail[titEmail] : null
    if (u?.email_confirmed_at) nEmail++
    if (sediByOrg.has(o.id)) nSede++
    if (ricByOrg.has(o.id)) nRicettario++
    if (chiusByOrg.has(o.id)) nChiusura++
    if (fattByOrg.has(o.id)) nFattura++
    if (u?.last_sign_in_at && u.last_sign_in_at >= sevenDaysAgo) nAttivo7gg++
    if (o.approvato) nPagante++
  }
  const pct = (n) => nRegistrati > 0 ? Math.round(100 * n / nRegistrati) : 0
  return {
    days,
    n: nRegistrati,
    steps: [
      { key: 'registrato',  label: 'Registrato',                  n: nRegistrati, pct: 100 },
      { key: 'email',       label: 'Email confermata',            n: nEmail,      pct: pct(nEmail) },
      { key: 'sede',        label: 'Sede creata',                 n: nSede,       pct: pct(nSede) },
      { key: 'ricettario',  label: 'Ricettario popolato',         n: nRicettario, pct: pct(nRicettario) },
      { key: 'chiusura',    label: 'Prima chiusura cassa',        n: nChiusura,   pct: pct(nChiusura) },
      { key: 'fattura',     label: 'Prima fattura caricata',      n: nFattura,    pct: pct(nFattura) },
      { key: 'attivo7gg',   label: 'Attivo ultimi 7gg',           n: nAttivo7gg,  pct: pct(nAttivo7gg) },
      { key: 'pagante',     label: 'Pagante',                     n: nPagante,    pct: pct(nPagante) },
    ],
  }
}

// ─── Errori raggruppati per endpoint+codice ──────────────────────────────
async function getErrorsGrouped(supabase, days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const { data, error } = await supabase.from('error_log')
    .select('endpoint, operation, code, status, message, org_id, user_id, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) throw new Error(error.message)
  const groups = new Map()
  for (const e of (data || [])) {
    const key = `${e.endpoint || '?'}::${e.operation || ''}::${e.code || `HTTP_${e.status || '?'}`}`
    if (!groups.has(key)) {
      groups.set(key, {
        endpoint: e.endpoint || '?',
        operation: e.operation || '',
        code: e.code || `HTTP_${e.status || '?'}`,
        count: 0,
        users: new Set(),
        orgs: new Set(),
        first_ts: e.created_at,
        last_ts: e.created_at,
        sample_message: e.message || '',
      })
    }
    const g = groups.get(key)
    g.count++
    if (e.user_id) g.users.add(e.user_id)
    if (e.org_id) g.orgs.add(e.org_id)
    if (e.created_at < g.first_ts) g.first_ts = e.created_at
    if (e.created_at > g.last_ts) g.last_ts = e.created_at
  }
  const out = Array.from(groups.values()).map(g => ({
    endpoint: g.endpoint,
    operation: g.operation,
    code: g.code,
    count: g.count,
    n_users: g.users.size,
    n_orgs: g.orgs.size,
    first_ts: g.first_ts,
    last_ts: g.last_ts,
    sample_message: g.sample_message.slice(0, 200),
  }))
  out.sort((a, b) => b.count - a.count)
  return out
}

// ─── AI cost per cliente (ai_usage_daily aggregato) ──────────────────────
async function getAICostByCustomer(supabase, days = 30) {
  const sinceDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const { data, error } = await supabase.from('ai_usage_daily')
    .select('organization_id, feature, calls, cost_usd_estimated, tokens_in_estimated, tokens_out_estimated, last_call_at')
    .gte('date', sinceDate)
    .limit(10000)
  if (error) throw new Error(error.message)
  const byOrg = new Map()
  for (const r of (data || [])) {
    if (!byOrg.has(r.organization_id)) {
      byOrg.set(r.organization_id, {
        organization_id: r.organization_id,
        total_calls: 0,
        total_cost_usd: 0,
        tokens_in: 0,
        tokens_out: 0,
        last_call_at: r.last_call_at,
        by_feature: {},
      })
    }
    const o = byOrg.get(r.organization_id)
    o.total_calls += Number(r.calls) || 0
    o.total_cost_usd += Number(r.cost_usd_estimated) || 0
    o.tokens_in += Number(r.tokens_in_estimated) || 0
    o.tokens_out += Number(r.tokens_out_estimated) || 0
    if (r.last_call_at && r.last_call_at > o.last_call_at) o.last_call_at = r.last_call_at
    o.by_feature[r.feature] = (o.by_feature[r.feature] || 0) + Number(r.cost_usd_estimated || 0)
  }
  // Hydrate con nome cliente
  const orgIds = Array.from(byOrg.keys())
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase.from('organizations')
      .select('id, nome').in('id', orgIds)
    for (const o of (orgs || [])) {
      const e = byOrg.get(o.id)
      if (e) e.nome = o.nome
    }
  }
  const out = Array.from(byOrg.values())
    .map(o => ({
      ...o,
      total_cost_usd: Math.round(o.total_cost_usd * 1000) / 1000,
      top_features: Object.entries(o.by_feature)
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([f, c]) => ({ feature: f, cost_usd: Math.round(c * 1000) / 1000 })),
    }))
    .sort((a, b) => b.total_cost_usd - a.total_cost_usd)
  const tot = out.reduce((s, o) => s + o.total_cost_usd, 0)
  return { days, total_cost_usd: Math.round(tot * 100) / 100, customers: out }
}

// ─── Global search ───────────────────────────────────────────────────────
async function globalSearch(supabase, q) {
  const query = (q || '').trim().slice(0, 100)
  if (query.length < 2) return { clienti: [], errori: [], feedback: [], audit: [] }
  const like = `%${query.replace(/[%_]/g, '\\$&')}%`
  const [clientiR, errR, fbR, audR] = await Promise.all([
    fetchSafe(supabase.from('organizations')
      .select('id, nome, tipo')
      .or(`nome.ilike.${like},nome_attivita.ilike.${like}`)
      .limit(8)),
    fetchSafe(supabase.from('error_log')
      .select('id, endpoint, operation, code, message, created_at, org_id')
      .ilike('message', like)
      .order('created_at', { ascending: false }).limit(8)),
    fetchSafe(supabase.from('feedback')
      .select('id, user_email, messaggio, sentiment, created_at, organization_id')
      .ilike('messaggio', like)
      .order('created_at', { ascending: false }).limit(8)),
    fetchSafe(supabase.from('admin_log')
      .select('id, admin_email, azione, org_id, created_at')
      .or(`azione.ilike.${like},admin_email.ilike.${like}`)
      .order('created_at', { ascending: false }).limit(8)),
  ])
  return {
    clienti: clientiR.data || [],
    errori: (errR.data || []).map(e => ({ ...e, message: (e.message || '').slice(0, 200) })),
    feedback: (fbR.data || []).map(f => ({ ...f, messaggio: (f.messaggio || '').slice(0, 200) })),
    audit: audR.data || [],
  }
}

// ─── SQL editor SELECT-only (sicuro) ─────────────────────────────────────
// Whitelist tabelle leggibili dall'admin. Tutto il resto bloccato a livello
// parser. Niente DDL/DML/funzioni potenzialmente pericolose. Max 500 righe.
const SQL_TABLES_ALLOWED = new Set([
  'organizations', 'profiles', 'sedi', 'user_data', 'fatture', 'fornitori',
  'dipendenti', 'turni', 'clienti_b2b', 'vendite_b2b', 'costi_aziendali',
  'feedback', 'error_log', 'audit_log', 'admin_log', 'rate_limits',
  'banners', 'ai_usage_daily', 'integrazioni', 'push_subscriptions',
  'codici_sconto', 'cron_runs', 'pin_attempts', 'email_domain_blocklist',
  'pos_scontrini', 'scadenzario_pagamenti', 'plan_pricing', 'login_attempts',
  'daily_briefs', 'documentary_snapshots',
])
const SQL_BLOCKED_KEYWORDS = [
  /\binsert\s+into\b/i, /\bupdate\s+\w+\s+set\b/i, /\bdelete\s+from\b/i,
  /\bdrop\s+/i, /\bcreate\s+/i, /\balter\s+/i, /\btruncate\s+/i,
  /\bgrant\s+/i, /\brevoke\s+/i, /\bcopy\s+/i,
  /\bpg_(read_file|catalog|sleep|advisory_lock|stat_file|ls_dir)\b/i,
  /\b(auth\.)?(users|sessions|refresh_tokens|mfa_factors|mfa_amr_claims)\b/i,
  /;\s*\w/,  // statement separator follows by other stuff
]
function validateSafeSelectSQL(q) {
  if (!q || typeof q !== 'string') return { ok: false, error: 'Query vuota' }
  const trimmed = q.trim().replace(/;$/, '').trim()
  if (!trimmed) return { ok: false, error: 'Query vuota' }
  if (trimmed.length > 4000) return { ok: false, error: 'Query troppo lunga (max 4000 char)' }
  if (!/^select\b/i.test(trimmed) && !/^with\b/i.test(trimmed)) {
    return { ok: false, error: 'Solo SELECT/WITH ammessi' }
  }
  for (const pat of SQL_BLOCKED_KEYWORDS) {
    if (pat.test(trimmed)) return { ok: false, error: `Keyword bloccata: ${pat.source}` }
  }
  // Tabelle referenziate: tutte FROM/JOIN <name> devono essere in whitelist
  const tableRefs = []
  const fromJoinRe = /\b(?:from|join)\s+([a-zA-Z_][\w.]*)/gi
  let m
  while ((m = fromJoinRe.exec(trimmed)) !== null) {
    const t = m[1].toLowerCase().replace(/^public\./, '')
    tableRefs.push(t)
  }
  for (const t of tableRefs) {
    // CTE alias non sono in whitelist ma sono dichiarati dentro la query → ok se
    // matchano un WITH ... AS. Skip se non in whitelist E non in WITH.
    if (SQL_TABLES_ALLOWED.has(t)) continue
    // Permetti CTE: cerca "with <t> as ("
    const ctePattern = new RegExp(`\\bwith\\s+${t}\\b\\s+as`, 'i')
    if (ctePattern.test(trimmed)) continue
    // Permetti subsequent "<prev>, <t> as ("
    const ctePattern2 = new RegExp(`,\\s*${t}\\b\\s+as`, 'i')
    if (ctePattern2.test(trimmed)) continue
    return { ok: false, error: `Tabella non permessa: ${t}` }
  }
  return { ok: true, query: trimmed + ' LIMIT 500' }
}

async function runSafeSelectQuery(supabase, q, adminEmail) {
  const v = validateSafeSelectSQL(q)
  if (!v.ok) return { ok: false, error: v.error }
  try {
    // Esecuzione via RPC dedicata se esiste, altrimenti via direct REST
    // (default postgres role del service_role può eseguire SELECT su tutto).
    const { data, error } = await supabase.rpc('admin_safe_select', { p_query: v.query })
    if (error) {
      // Se la RPC non esiste, fallback su error chiaro
      if (error.message?.toLowerCase().includes('does not exist') || error.code === 'PGRST202') {
        return { ok: false, error: 'RPC admin_safe_select non installata in DB. Migration da applicare.', need_migration: true }
      }
      return { ok: false, error: error.message }
    }
    return { ok: true, rows: data || [], count: (data || []).length, query: v.query }
  } catch (e) {
    return { ok: false, error: e.message || 'exception' }
  }
}

// ─── handler principale ────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)

  const ip = getClientIP(req)
  // Audit 2026-07-01 HIGH: cap user-agent IMMEDIATAMENTE per evitare downstream
  // hot logging di stringhe grandi (10KB) — i call site di logAdmin slice gia'
  // a 200 ma req.headers.get puo' essere chiamato altrove in flow.
  const ua = (req.headers.get('user-agent') || '').slice(0, 256)

  // Audit 2026-07-01 HIGH: ADMIN_IPS supporta `*` come bypass (admin in
  // viaggio con IP residenziale variabile) — usa quando OPT_OUT non possibile.
  // Senza wildcard, comportamento storico immutato.
  const ADMIN_IPS = (process.env.ADMIN_IPS || '').split(',').map(s => s.trim()).filter(Boolean)
  const ipAllowAll = ADMIN_IPS.includes('*')
  if (ADMIN_IPS.length > 0 && !ipAllowAll && !ADMIN_IPS.includes(ip)) {
    return json({ error: 'IP non autorizzato' }, 403, req)
  }

  const supabase = await getSupabase()

  // Rate limit (più generoso per admin)
  const rl = await checkRateLimit(supabase, `admin:${ip}`, 60, 60, 300)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  const auth = await verificaAdmin(req, supabase)
  if (!auth.user) {
    // Log dettagliato lato server, ma NON esponiamo l'email/reason completo al chiamante
    // (evita user enumeration: con un Bearer valido di un utente non-admin si vedrebbe la sua email).
    await logAdmin(supabase, 'UNKNOWN', `accesso_negato:${auth.reason}`, null, ip, ua)
    return json({ error: 'Accesso negato' }, 403, req)
  }
  const user = auth.user

  // ── GET ────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'lista'

    try {
      if (action === 'lista') {
        await logAdmin(supabase, user.email, 'lista_clienti', null, ip, ua)
        const clienti = await getClienti(supabase)
        return json({ clienti }, 200, req)
      }

      if (action === 'stats') {
        const clienti = await getClienti(supabase)
        const stats = await getStats(supabase, clienti)
        return json({ clienti, stats }, 200, req)
      }

      if (action === 'audit') {
        const log = await getAuditLog(supabase)
        return json({ log }, 200, req)
      }

      if (action === 'cliente_dettaglio') {
        const orgId = sanitizeStrict(url.searchParams.get('org_id') || '', 36)
        if (!orgId || !validateUUID(orgId)) return json({ error: 'org_id non valido' }, 400, req)
        await logAdmin(supabase, user.email, 'dettaglio_cliente', orgId, ip, ua)
        const dettaglio = await getClienteDettaglio(supabase, orgId)
        return json(dettaglio, 200, req)
      }

      if (action === 'feedback') {
        const soloDaGestire = url.searchParams.get('solo_da_gestire') === '1'
        const list = await getFeedback(supabase, soloDaGestire)
        return json({ feedback: list }, 200, req)
      }

      if (action === 'banners') {
        const list = await getBanners(supabase)
        return json({ banners: list }, 200, req)
      }

      if (action === 'email_blocklist') {
        const list = await getEmailBlocklist(supabase)
        return json({ blocklist: list }, 200, req)
      }

      // ═══ ADMIN v2 — audit 2026-06-20 ═══════════════════════════════
      if (action === 'activity_feed') {
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '60', 10), 200)
        const events = await getActivityFeed(supabase, limit)
        return json({ events }, 200, req)
      }
      if (action === 'customer_signals') {
        const signals = await getCustomerSignals(supabase)
        return json({ signals }, 200, req)
      }
      if (action === 'onboarding_funnel') {
        const days = Math.min(parseInt(url.searchParams.get('days') || '60', 10), 365)
        const funnel = await getOnboardingFunnel(supabase, days)
        await logAdmin(supabase, user.email, `onboarding_funnel:${days}d`, null, ip, ua)
        return json(funnel, 200, req)
      }
      if (action === 'errors_grouped') {
        const days = Math.min(parseInt(url.searchParams.get('days') || '7', 10), 90)
        const groups = await getErrorsGrouped(supabase, days)
        return json({ days, groups }, 200, req)
      }
      if (action === 'ai_cost_by_customer') {
        const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10), 365)
        const data = await getAICostByCustomer(supabase, days)
        return json(data, 200, req)
      }
      if (action === 'global_search') {
        const q = url.searchParams.get('q') || ''
        const data = await globalSearch(supabase, q)
        return json(data, 200, req)
      }

      if (action === 'pending_approvals') {
        // Audit 2026-06-21: lista org in_attesa=true per il signup gate.
        const { data, error } = await supabase.from('organizations')
          .select('id, nome, tipo, created_at, trial_ends_at')
          .eq('in_attesa', true)
          .order('created_at', { ascending: true })
          .limit(200)
        if (error) throw new Error(error.message)
        // Hydrate con titolare email per ogni org
        const ids = (data || []).map(o => o.id)
        const profMap = {}
        if (ids.length > 0) {
          const { data: profs } = await supabase.from('profiles')
            .select('organization_id, email, nome_completo, created_at')
            .in('organization_id', ids).eq('ruolo', 'titolare')
          for (const p of (profs || [])) profMap[p.organization_id] = p
        }
        const orgs = (data || []).map(o => ({
          ...o,
          titolare_email: profMap[o.id]?.email || null,
          titolare_nome: profMap[o.id]?.nome_completo || null,
        }))
        return json({ orgs }, 200, req)
      }

      if (action === 'load_demo_menu') {
        // Audit 2026-06-20: carica menu personalizzato salvato per l'org
        // (così riapri il modal e vedi quello che avevi prima, senza ri-estrazione).
        const orgIdParam = sanitizeStrict(url.searchParams.get('org_id') || '', 36)
        if (!orgIdParam || !validateUUID(orgIdParam)) {
          return json({ error: 'org_id non valido' }, 400, req)
        }
        const { data } = await supabase
          .from('user_data')
          .select('data_value, updated_at')
          .eq('organization_id', orgIdParam)
          .eq('data_key', 'pasticceria-demo-custom-menu-v1')
          .is('sede_id', null)
          .maybeSingle()
        return json({
          menu: data?.data_value || null,
          updated_at: data?.updated_at || null,
        }, 200, req)
      }

      if (action === 'stripe_mrr') {
        // Stripe puo' non essere configurato (pre-revenue) o avere errori di
        // chiamata. Ritorniamo un payload "unavailable" parlante invece di un
        // 500 generico — la UI mostra "Stripe non configurato" e l'admin sa
        // cosa fare.
        if (!process.env.STRIPE_SECRET_KEY) {
          return json({
            unavailable: true,
            reason: 'STRIPE_SECRET_KEY non configurato su Vercel',
            mrr_cents: 0, mrr_trialing_cents: 0,
            sub_active: 0, sub_trialing: 0, sub_past_due: 0, sub_canceled: 0,
            failed_30d: 0, valuta: 'EUR',
          }, 200, req)
        }
        try {
          const data = await getStripeMrr()
          return json(data, 200, req)
        } catch (e) {
          return json({
            unavailable: true,
            reason: `Stripe API: ${(e?.message || 'errore sconosciuto').slice(0, 200)}`,
            mrr_cents: 0, mrr_trialing_cents: 0,
            sub_active: 0, sub_trialing: 0, sub_past_due: 0, sub_canceled: 0,
            failed_30d: 0, valuta: 'EUR',
          }, 200, req)
        }
      }

      if (action === 'stripe_events') {
        if (!process.env.STRIPE_SECRET_KEY) {
          return json({ events: [], unavailable: true, reason: 'STRIPE_SECRET_KEY non configurato' }, 200, req)
        }
        try {
          const events = await getStripeEvents()
          return json({ events }, 200, req)
        } catch (e) {
          return json({ events: [], unavailable: true, reason: `Stripe API: ${(e?.message || '').slice(0, 200)}` }, 200, req)
        }
      }

      if (action === 'errori_recenti') {
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500)
        const errori = await getErroriRecenti(supabase, limit)
        return json({ errori }, 200, req)
      }

      if (action === 'ai_telemetry') {
        const days = Math.min(parseInt(url.searchParams.get('days') || '7', 10) || 7, 90)
        const telemetry = await getAiTelemetry(supabase, days)
        await logAdmin(supabase, user.email, `ai_telemetry:${days}gg`, null, ip, ua)
        return json({ telemetry }, 200, req)
      }

      if (action === 'health') {
        const snapshot = await getHealthSnapshot(supabase)
        await logAdmin(supabase, user.email, 'health_check', null, ip, ua)
        return json({ health: snapshot }, 200, req)
      }

      if (action === 'security') {
        const hours = Math.min(parseInt(url.searchParams.get('hours') || '24', 10) || 24, 168)
        const security = await getSecuritySnapshot(supabase, hours)
        await logAdmin(supabase, user.email, `security_check:${hours}h`, null, ip, ua)
        return json({ security }, 200, req)
      }

      if (action === 'cleanup_e2e_preview') {
        const preview = await azCleanupE2EPreview(supabase)
        await logAdmin(supabase, user.email, 'cleanup_e2e_preview', null, ip, ua)
        return json(preview, 200, req)
      }

      if (action === 'usage_stats') {
        const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10) || 30, 90)
        const stats = await getUsageStats(supabase, days)
        await logAdmin(supabase, user.email, `usage_stats:${days}d`, null, ip, ua)
        return json({ usage: stats }, 200, req)
      }

      if (action === 'migrate_integrazioni') {
        // One-shot: cifra tutte le row con encryption_version=0 e config jsonb non nullo.
        // Idempotente: rieseguito non tocca le row gia' v=1.
        const { encryptConfig, decryptConfig } = await import('./lib/integrationsCrypto.js')
        const { data: rows, error } = await supabase
          .from('integrazioni')
          .select('id, organization_id, tipo, config, encryption_version')
          .or('encryption_version.is.null,encryption_version.eq.0')
        if (error) return json({ error: error.message }, 500, req)
        let migrated = 0
        const errors = []
        for (const r of (rows || [])) {
          if (!r.config) {
            // Niente da cifrare ma marca come migrata (avoid re-process)
            await supabase.from('integrazioni').update({ encryption_version: 1, config: null }).eq('id', r.id)
            migrated++
            continue
          }
          try {
            const enc = await encryptConfig(r.config)
            // Sanity check post-encrypt: decifriamo subito quanto cifrato e
            // verifichiamo che ritorni l'oggetto originale. Se la
            // decryption fallisce ora, fallirebbe anche al prossimo read
            // della integrazione → preferiamo notare ora e abortire la
            // singola row invece di sovrascrivere il jsonb plaintext.
            try {
              const roundTrip = await decryptConfig({
                config_encrypted: enc.config_encrypted,
                config_iv: enc.config_iv,
                config_tag: enc.config_tag,
              })
              if (!roundTrip || JSON.stringify(roundTrip) !== JSON.stringify(r.config)) {
                throw new Error('round-trip mismatch')
              }
            } catch (cryptoErr) {
              errors.push({ id: r.id, tipo: r.tipo, error: `sanity check failed: ${cryptoErr.message}` })
              continue
            }
            const { error: updErr } = await supabase
              .from('integrazioni')
              .update({
                config: null,
                config_encrypted: enc.config_encrypted,
                config_iv: enc.config_iv,
                config_tag: enc.config_tag,
                encryption_version: 1,
              })
              .eq('id', r.id)
            if (updErr) errors.push({ id: r.id, tipo: r.tipo, error: updErr.message })
            else migrated++
          } catch (e) {
            errors.push({ id: r.id, tipo: r.tipo, error: e.message })
          }
        }
        await logAdmin(supabase, user.email, `migrate_integrazioni:${migrated}ok/${errors.length}err`, null, ip, ua)
        return json({ migrated, errors, total: (rows || []).length }, 200, req)
      }

      if (action === 'codici_sconto') {
        await logAdmin(supabase, user.email, 'lista_codici_sconto', null, ip, ua)
        const codici = await getCodiciSconto(supabase)
        return json({ codici }, 200, req)
      }

      if (action === 'plan_pricing') {
        const piani = await getPlanPricing(supabase)
        return json({ piani }, 200, req)
      }

      if (action === 'esporta_csv') {
        await logAdmin(supabase, user.email, 'esporta_csv', null, ip, ua)
        const clienti = await getClienti(supabase)
        const header = 'Nome attivita,Tipo,Email,Nome completo,Piano,Stato,Sedi,Record,Registrata il,Ultimo accesso,Trial scade'
        // Anti-CSV-injection: se il valore inizia con =+-@\t\r, prefisso '
        // (audit 2026-06-17 MEDIUM: un nome_attivita "=cmd|..." si trasforma
        // in formula Excel quando l'admin apre il CSV).
        const q = v => {
          let s = String(v ?? '')
          if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) s = "'" + s
          return `"${s.replace(/"/g, '""')}"`
        }
        const rows = clienti.map(c => {
          const stato = !c.attivo ? 'Bloccato'
            : c.org_approvata ? 'Pagante'
            : (c.trial_ends_at && new Date(c.trial_ends_at) > new Date()) ? 'Trial' : 'Scaduto'
          return [
            q(c.nome_attivita), q(c.tipo), q(c.email), q(c.nome_completo),
            q(c.piano), q(stato), c.num_sedi || 0, c.num_record || 0,
            q(c.registrata_il || ''), q(c.ultimo_accesso || ''), q(c.trial_ends_at || ''),
          ].join(',')
        })
        const csv = '﻿' + [header, ...rows].join('\n')
        return new Response(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="clienti_foodios_${new Date().toISOString().slice(0,10)}.csv"`,
            ...getCorsHeaders(req),
          },
        })
      }

      return json({ error: 'Action non riconosciuta' }, 400, req)
    } catch (err) {
      const safe = safeError(err, { endpoint: 'admin', method: 'GET', action }, 500, supabase)
      return json(safe.body, safe.status, req)
    }
  }

  // ── POST ───────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body
    try { body = await req.json() } catch { return json({ error: 'JSON non valido' }, 400, req) }

    const orgId = sanitizeStrict(body.orgId || '', 36)
    const tipo = sanitizeStrict(body.tipo || '', 50)

    // azioni che non richiedono orgId
    const azioniSenzaOrgId = [
      'invia_email',
      'crea_codice_sconto',
      'disattiva_codice_sconto',
      'elimina_codice_sconto',
      'set_plan_pricing',
      'feedback_marca_gestito',
      'banner_crea',
      'banner_disattiva',
      'banner_elimina',
      'cleanup_e2e',   // batch: opera su tutte le org E2E in una shot
    ]
    if (!tipo) return json({ error: 'Parametro tipo mancante' }, 400, req)
    if (!azioniSenzaOrgId.includes(tipo)) {
      if (!orgId) return json({ error: 'orgId mancante' }, 400, req)
      if (!validateUUID(orgId)) return json({ error: 'orgId non valido' }, 400, req)
    }

    // Rate limit per-azione: oltre al limit globale 60/min, ogni azione "delicata"
    // ha il suo limite stretto. Anche un admin compromesso non puo' cancellare
    // 60 org/min ma solo le quote sotto.
    const PER_ACTION_LIMITS = {
      elimina:                       { max: 2,   windowSec: 60 },   // cancellazioni: 2/min
      blocca:                        { max: 10,  windowSec: 60 },
      riattiva:                      { max: 10,  windowSec: 60 },
      regala_mesi:                   { max: 5,   windowSec: 60 },
      cambia_piano:                  { max: 10,  windowSec: 60 },
      estendi_trial:                 { max: 10,  windowSec: 60 },
      impersona:                     { max: 5,   windowSec: 60 },
      reset_password:                { max: 5,   windowSec: 60 },
      invia_email:                   { max: 30,  windowSec: 60 },   // 30 email manuali/min ok
      pulisci_demo_fatture:          { max: 5,   windowSec: 60 },
      crea_codice_sconto:            { max: 10,  windowSec: 60 },
      disattiva_codice_sconto:       { max: 20,  windowSec: 60 },
      elimina_codice_sconto:         { max: 5,   windowSec: 60 },
      set_plan_pricing:              { max: 5,   windowSec: 60 },
      salva_note_admin:              { max: 60,  windowSec: 60 },   // autosave debounced
      feedback_marca_gestito:        { max: 60,  windowSec: 60 },
      banner_crea:                   { max: 10,  windowSec: 60 },
      banner_disattiva:              { max: 10,  windowSec: 60 },
      banner_elimina:                { max: 10,  windowSec: 60 },
      cleanup_e2e:                   { max: 2,   windowSec: 60 },   // batch massive: 2/min (con preview+conferma UI)
    }
    const perAction = PER_ACTION_LIMITS[tipo]
    if (perAction) {
      // Azioni distruttive: fail-closed. Se la tabella rate_limits non è
      // disponibile preferiamo bloccare piuttosto che lasciar passare un admin
      // potenzialmente compromesso (audit 2026-06-17 HIGH).
      const DESTRUTTIVE = new Set(['elimina', 'cleanup_e2e', 'pulisci_demo_fatture'])
      const failClosed = DESTRUTTIVE.has(tipo)
      const rlAction = await checkRateLimit(
        supabase, `admin:${user.email}:${tipo}`, perAction.max, perAction.windowSec, 900,
        { failClosed }
      )
      if (!rlAction.allowed) {
        await logAdmin(supabase, user.email, `rate_limit_per_action:${tipo}`, orgId || null, ip, ua)
        return rateLimitResponse(rlAction.retryAfter)
      }
    }

    try {
      let result = { ok: true }

      switch (tipo) {
        case 'approva':
          await azApprova(supabase, orgId, req); break
        case 'blocca':
          await azBlocca(supabase, orgId); break
        case 'riattiva':
          await azRiattiva(supabase, orgId); break
        case 'cambia_piano':
          await azCambiaPiano(supabase, orgId, sanitizeStrict(body.valore || '', 50)); break
        case 'estendi_trial':
          await azEstendiTrial(supabase, orgId, body.valore); break
        case 'impersona':
          // Magic link inviato via email (NON in response — audit 2026-06 fix).
          result = { ok: true, ...(await azImpersona(supabase, orgId, user.email)) }
          await logAdmin(supabase, user.email, `impersona_target:${result.target_email}`, orgId || null, ip, ua)
          break
        case 'reset_password':
          // Recovery link inviato direttamente al titolare via email.
          result = { ok: true, ...(await azResetPassword(supabase, orgId, user.email)) }; break
        case 'invia_email':
          await azInviaEmail(req, body, supabase); break
        case 'elimina_preview':
          // Conta i record che verrebbero cancellati per ogni tabella.
          // L'admin deve vedere il count + confermarlo prima di procedere.
          result = { ok: true, ...(await azEliminaPreview(supabase, orgId)) }
          break
        case 'elimina':
          await azElimina(
            supabase, orgId,
            sanitizeStrict(body.conferma || '', 20),
            body.expected_count != null ? Number(body.expected_count) : null
          )
          break
        case 'cleanup_e2e':
          // Audit 2026-07-01 HIGH: passa expectedCount dal preview (UI).
          // Batch cleanup di tutti gli account test E2E (email @foodios-e2e.test, e2e+*, e2e-acc-titolare-*).
          // Doppia conferma stringa CLEANUP_E2E richiesta.
          result = { ok: true, ...(await azCleanupE2E(supabase, sanitizeStrict(body.conferma || '', 20), body.expectedCount)) }
          break
        case 'pulisci_demo_fatture':
          result = { ok: true, ...(await azPulisciDemoFatture(supabase, orgId, sanitizeStrict(body.valore || 'preview', 20))) }; break
        case 'crea_codice_sconto':
          result = { ok: true, codice: await creaCodiceSconto(supabase, body, user.email) }; break
        case 'disattiva_codice_sconto':
          await disattivaCodiceSconto(supabase, sanitizeStrict(body.id || '', 36)); break
        case 'elimina_codice_sconto':
          await eliminaCodiceSconto(supabase, sanitizeStrict(body.id || '', 36)); break
        case 'regala_mesi':
          result = { ok: true, ...(await applicaCodiceManuale(supabase, orgId, body.codice || '', body.mesi)) }; break
        case 'set_plan_pricing':
          result = { ok: true, piano: await setPlanPricing(supabase, body, user.email) }; break
        case 'salva_note_admin':
          await azSalvaNoteAdmin(supabase, orgId, body.nota); break
        case 'feedback_marca_gestito':
          await azFeedbackMarcaGestito(supabase, sanitizeStrict(body.id || '', 36), user.email, !!body.gestito); break
        case 'banner_crea':
          result = { ok: true, banner: await azBannerCrea(supabase, body, user.email) }; break
        case 'banner_disattiva':
          await azBannerDisattiva(supabase, sanitizeStrict(body.id || '', 36)); break
        case 'banner_elimina':
          await azBannerElimina(supabase, sanitizeStrict(body.id || '', 36)); break
        // Audit 2026-06-19 Customer 360 write: revoca integrazione + push sub.
        case 'integrazione_disattiva':
          await azIntegrazioneDisattiva(supabase, orgId, sanitizeStrict(body.integrazione_id || '', 36)); break
        case 'push_sub_revoca':
          await azPushSubRevoca(supabase, orgId, sanitizeStrict(body.sub_id || '', 36)); break
        case 'approva_signup': {
          // Audit 2026-06-21: admin approva una nuova org (in_attesa → false)
          if (!orgId) throw new Error('org_id richiesto')
          const { error } = await supabase.from('organizations')
            .update({
              in_attesa: false,
              approvato_il: new Date().toISOString(),
              approvato_da: user.email,
            })
            .eq('id', orgId)
          if (error) throw new Error(error.message)
          result = { ok: true }
          break
        }
        case 'rifiuta_signup': {
          // Cancellazione fisica dell'org (cascade su sedi, profiles, user_data)
          // + dell'auth user titolare. Action distruttiva: validato con body.confirm
          if (!orgId) throw new Error('org_id richiesto')
          if (body?.confirm !== 'rifiuta') throw new Error('confirm=rifiuta richiesto')
          // Trova auth user del titolare prima di cancellare org
          const { data: titolare } = await supabase.from('profiles')
            .select('id, email').eq('organization_id', orgId).eq('ruolo', 'titolare').maybeSingle()
          await supabase.from('organizations').delete().eq('id', orgId)
          if (titolare?.id) {
            try { await supabase.auth.admin.deleteUser(titolare.id) } catch { /* ignore */ }
          }
          result = { ok: true, deleted: { org: orgId, user: titolare?.id } }
          break
        }
        case 'sql_query': {
          // Audit 2026-06-20: SQL editor read-only per admin.
          // Pattern: validation client-side regex multi-layer + RPC admin_safe_select.
          const q = body?.query || ''
          result = await runSafeSelectQuery(supabase, q, user.email)
          break
        }
        case 'email_blocklist_aggiungi':
          await azEmailBlocklistAggiungi(supabase, body.domain, body.motivo, user.email); break
        case 'email_blocklist_rimuovi':
          await azEmailBlocklistRimuovi(supabase, body.domain); break
        case 'seed_demo_full': {
          // Audit 2026-06-20: popola org di test con 3 mesi di dati realistici
          // (ricettario 15, magazzino 30, chiusure 90gg, produzione, sprechi,
          // fornitori 6, fatture 18, dipendenti 5, turni 12 settimane, clienti
          // B2B 4, vendite B2B 24, costi aziendali 8). Idempotente: cleanup
          // [Demo data] precedenti prima di reinsert.
          if (!orgId) throw new Error('org_id richiesto')
          const { data: sede } = await supabase.from('sedi')
            .select('id').eq('organization_id', orgId).limit(1).maybeSingle()
          const sedeId = sede?.id || null
          const { seedDemoDataFull } = await import('../src/lib/demoSeedFull.js')
          result = await seedDemoDataFull({ orgId, sedeId, supabase })
          break
        }
        case 'seed_demo_personalized': {
          // Audit 2026-06-20: seed con menu personalizzato (prodotti reali
          // del cliente, per pitch). customMenu deve essere {ricette, ingredienti_costi,
          // nome_attivita?, citta?} — costruito client-side da menuExtractor.
          if (!orgId) throw new Error('org_id richiesto')
          const cm = body?.customMenu
          if (!cm || !cm.ricette || Object.keys(cm.ricette).length === 0) {
            throw new Error('customMenu richiesto con almeno 1 ricetta')
          }
          // Limite di sicurezza: max 50 ricette per non esplodere il payload
          if (Object.keys(cm.ricette).length > 50) {
            throw new Error('Massimo 50 ricette per menu')
          }
          const { data: sede } = await supabase.from('sedi')
            .select('id').eq('organization_id', orgId).limit(1).maybeSingle()
          const sedeId = sede?.id || null
          const { seedDemoDataFull } = await import('../src/lib/demoSeedFull.js')
          result = await seedDemoDataFull({ orgId, sedeId, supabase, customMenu: cm })
          break
        }
        case 'save_demo_menu': {
          // Audit 2026-06-20: persiste il menu personalizzato per l'org così
          // riapri il modal e vedi quello che avevi prima.
          if (!orgId) throw new Error('org_id richiesto')
          const cm = body?.customMenu
          if (!cm) throw new Error('customMenu richiesto')
          // Upsert manuale (replica di ssave server-side)
          const { data: existing } = await supabase
            .from('user_data')
            .select('id')
            .eq('organization_id', orgId)
            .eq('data_key', 'pasticceria-demo-custom-menu-v1')
            .is('sede_id', null)
          const now = new Date().toISOString()
          if (existing && existing.length > 0) {
            await supabase.from('user_data')
              .update({ data_value: cm, updated_at: now })
              .eq('organization_id', orgId)
              .eq('data_key', 'pasticceria-demo-custom-menu-v1')
              .is('sede_id', null)
          } else {
            await supabase.from('user_data').insert({
              organization_id: orgId, sede_id: null,
              data_key: 'pasticceria-demo-custom-menu-v1',
              data_value: cm, updated_at: now,
            })
          }
          result = { ok: true, saved_at: now }
          break
        }
        default:
          return json({ error: 'Azione non riconosciuta' }, 400, req)
      }

      await logAdmin(supabase, user.email, tipo, orgId || null, ip, ua)
      return json(result, 200, req)
    } catch (err) {
      const safe = safeError(err, { endpoint: 'admin', method: 'POST', tipo, orgId }, 500, supabase)
      // L'admin_log internamente registra il dettaglio reale; al client va il safe
      await logAdmin(supabase, user.email, `${tipo}_errore:${(err.message || '').slice(0, 80)}`, orgId || null, ip, ua)
      return json(safe.body, safe.status, req)
    }
  }

  return json({ error: 'Method not allowed' }, 405, req)
}
