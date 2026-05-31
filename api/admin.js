export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, getClientIP, json } from './lib/cors.js'
import { sanitize, sanitizeStrict, validateUUID, validateEmail } from './lib/validate.js'
import { safeError } from './lib/safeError.js'

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

// Decodifica un claim dal payload di un JWT senza verifica firma.
// Sicuro qui perche' chiamato solo DOPO supabase.auth.getUser(token) che
// verifica la firma; serve solo a estrarre claim non esposti dall'API.
function decodeJwtClaim(token, claim) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const payload = JSON.parse(atob(b64))
    return payload[claim] ?? null
  } catch {
    return null
  }
}

async function verificaAdmin(req, supabase) {
  // Fail-closed: senza ADMIN_EMAIL configurato, nessuno è admin.
  if (!ADMIN_EMAIL) return { user: null, reason: 'admin_email_not_configured' }

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, reason: 'no_bearer' }
  }
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return { user: null, reason: 'empty_token' }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error) return { user: null, reason: `getUser_error:${error.message}` }
    if (!user) return { user: null, reason: 'no_user' }
    if ((user.email || '').toLowerCase() !== ADMIN_EMAIL) {
      return { user: null, reason: `not_admin:${user.email}` }
    }
    // ── Enforce MFA per admin ────────────────────────────────────────────
    // L'admin e' target ad alto valore: MFA e' obbligatoria salvo override
    // esplicito via DISABLE_ADMIN_MFA=true (utile in fase pre-revenue prima
    // di configurare TOTP; rimuovere appena MFA e' attiva).
    if ((process.env.DISABLE_ADMIN_MFA || '').toLowerCase() === 'true') {
      return { user, reason: 'ok_mfa_disabled' }
    }
    // La AAL e' un claim del JWT (gia' verificato da getUser sopra), quindi
    // possiamo leggerla decodificando il payload — piu' robusto che
    // supabase.auth.mfa.getAuthenticatorAssuranceLevel(), che richiede una
    // sessione utente sul client e con service_role lancia eccezione.
    const aalLevel = decodeJwtClaim(token, 'aal')
    if (aalLevel !== 'aal2') {
      // Distingue "ha MFA ma non l'ha usata" da "MFA non configurata".
      let hasVerifiedFactor = false
      try {
        const { data: f } = await supabase.auth.admin.mfa.listFactors({ userId: user.id })
        hasVerifiedFactor = (f?.factors || []).some(x => x.status === 'verified')
      } catch { /* se la query factor fallisce, conservativo: mfa_required */ hasVerifiedFactor = true }
      return { user: null, reason: hasVerifiedFactor ? 'mfa_required' : 'mfa_not_enrolled' }
    }
    return { user, reason: 'ok' }
  } catch (err) {
    return { user: null, reason: `exception:${err.message}` }
  }
}

async function logAdmin(supabase, adminEmail, azione, orgId, ip, userAgent) {
  try {
    await supabase.from('admin_log').insert({
      admin_email: adminEmail,
      azione,
      org_id: orgId || null,
      ip,
      user_agent: (userAgent || '').slice(0, 200),
    })
  } catch { /* non bloccare per errore di log */ }
}

// ─── handlers GET ──────────────────────────────────────────────────────────

async function getClienti(supabase) {
  const [overviewRes, usersRes] = await Promise.all([
    supabase.from('admin_overview').select('*').order('registrata_il', { ascending: false }),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ])
  if (overviewRes.error) throw new Error(`admin_overview: ${overviewRes.error.message}`)

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
    }
  })
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

  return {
    totale, paganti, trial, scaduti, bloccati,
    nuoviSettimana, nuoviMese,
    mrrStimato, giorniMediTrial, conversionRate, inattivi,
    crescita: settimane,
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

async function getClienteDettaglio(supabase, orgId) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const [sediRes, dataRes, eventiRes, orgRes, fattureCntRes, dipendentiCntRes, profileRes] = await Promise.all([
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
  }
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

async function azImpersona(supabase, orgId) {
  const { data: prof, error } = await supabase
    .from('profiles').select('email').eq('organization_id', orgId).eq('ruolo', 'titolare').maybeSingle()
  if (error) throw new Error(error.message)
  if (!prof?.email) throw new Error('Profilo titolare non trovato')

  const { data, error: err2 } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: prof.email,
  })
  if (err2) throw new Error(err2.message)
  return { link: data?.properties?.action_link || null, email: prof.email }
}

async function azResetPassword(supabase, orgId) {
  const { data: prof } = await supabase
    .from('profiles').select('email').eq('organization_id', orgId).eq('ruolo', 'titolare').maybeSingle()
  if (!prof?.email) throw new Error('Profilo titolare non trovato')

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: prof.email,
  })
  if (error) throw new Error(error.message)
  return { link: data?.properties?.action_link || null, email: prof.email }
}

async function azInviaEmail(req, body) {
  const destinatario = sanitizeStrict(body.destinatario || '', 255)
  const oggetto = sanitize(body.oggetto || '', 200)
  const messaggio = sanitize(body.messaggio || '', 5000)
  if (!validateEmail(destinatario)) throw new Error('Email destinatario non valida')
  if (!oggetto || !messaggio) throw new Error('Oggetto e messaggio obbligatori')

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

async function azElimina(supabase, orgId, conferma) {
  if (conferma !== 'ELIMINA') throw new Error('Conferma mancante')

  // Tabelle dipendenti dall'organization_id (cascade non sempre garantito)
  const tabelleCascade = [
    'user_data', 'turni', 'dipendenti', 'fornitori', 'ordini_fornitori',
    'notifiche', 'integrazioni', 'sync_log', 'sedi',
  ]
  for (const t of tabelleCascade) {
    try {
      await supabase.from(t).delete().eq('organization_id', orgId)
    } catch { /* tabella opzionale */ }
  }
  // Tabelle condizionali
  for (const t of ['fatture', 'note_giornaliere', 'referral']) {
    try {
      await supabase.from(t).delete().eq('organization_id', orgId)
    } catch { /* può non esistere */ }
  }

  // Recupera utenti dell'org per eliminarli da auth
  const { data: profiles } = await supabase
    .from('profiles').select('id').eq('organization_id', orgId)

  // Elimina i profili (figli di auth.users via FK)
  await supabase.from('profiles').delete().eq('organization_id', orgId)

  // Elimina l'organization
  const r = await supabase.from('organizations').delete().eq('id', orgId)
  if (r.error) throw new Error(r.error.message)

  // Elimina utenti auth (best-effort, in coda)
  for (const p of profiles || []) {
    try { await supabase.auth.admin.deleteUser(p.id) } catch { /* ignore */ }
  }
}

// ─── handler principale ────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)

  const ip = getClientIP(req)
  const ua = req.headers.get('user-agent') || ''

  const ADMIN_IPS = (process.env.ADMIN_IPS || '').split(',').map(s => s.trim()).filter(Boolean)
  if (ADMIN_IPS.length > 0 && !ADMIN_IPS.includes(ip)) {
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

      if (action === 'migrate_integrazioni') {
        // One-shot: cifra tutte le row con encryption_version=0 e config jsonb non nullo.
        // Idempotente: rieseguito non tocca le row gia' v=1.
        const { encryptConfig } = await import('./lib/integrationsCrypto.js')
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
        const rows = clienti.map(c => {
          const stato = !c.attivo ? 'Bloccato'
            : c.org_approvata ? 'Pagante'
            : (c.trial_ends_at && new Date(c.trial_ends_at) > new Date()) ? 'Trial' : 'Scaduto'
          const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`
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
    }
    const perAction = PER_ACTION_LIMITS[tipo]
    if (perAction) {
      const rlAction = await checkRateLimit(supabase, `admin:${user.email}:${tipo}`, perAction.max, perAction.windowSec)
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
          result = { ok: true, ...(await azImpersona(supabase, orgId)) }
          // Audit speciale: tracciamo email impersonata (anti-frode). Il log
          // generico a fondo loop registra solo l'azione 'impersona', qui
          // arricchiamo con la mail del titolare il cui account è stato aperto.
          await logAdmin(supabase, user.email, `impersona_target:${result.email}`, orgId || null, ip, ua)
          break
        case 'reset_password':
          result = { ok: true, ...(await azResetPassword(supabase, orgId)) }; break
        case 'invia_email':
          await azInviaEmail(req, body); break
        case 'elimina':
          await azElimina(supabase, orgId, sanitizeStrict(body.conferma || '', 20)); break
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
