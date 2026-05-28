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
    // L'admin è target ad alto valore: MFA è obbligatoria. Se la sessione è
    // solo aal1 (password), rifiutiamo: l'admin deve completare il challenge TOTP.
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel({ jwt: token })
      const currentLevel = aal?.currentLevel || null
      const nextLevel = aal?.nextLevel || null
      // currentLevel='aal2' = già autenticato con MFA → OK
      // currentLevel='aal1' && nextLevel='aal2' = ha MFA ma non l'ha usata in questa sessione → BLOCCA
      // nextLevel='aal1' = non ha MFA configurata → BLOCCA (admin DEVE avere MFA)
      if (currentLevel !== 'aal2') {
        return { user: null, reason: nextLevel === 'aal2' ? 'mfa_required' : 'mfa_not_enrolled' }
      }
    } catch (mfaErr) {
      // Se la API MFA non risponde, fail-closed (blocca l'admin)
      return { user: null, reason: 'mfa_check_failed' }
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
  const [sediRes, dataRes, eventiRes, orgRes] = await Promise.all([
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
      .select('stripe_customer_id, stripe_subscription_id, stripe_status, stripe_current_period_end, trial_ends_at, mesi_bonus')
      .eq('id', orgId)
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

  return {
    sedi: sediRes.data || [],
    usage,
    eventi,
    org: orgRes.data || null,
  }
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
      const safe = safeError(err, { endpoint: 'admin', method: 'GET', action })
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
    ]
    if (!tipo) return json({ error: 'Parametro tipo mancante' }, 400, req)
    if (!azioniSenzaOrgId.includes(tipo)) {
      if (!orgId) return json({ error: 'orgId mancante' }, 400, req)
      if (!validateUUID(orgId)) return json({ error: 'orgId non valido' }, 400, req)
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
          result = { ok: true, ...(await azImpersona(supabase, orgId)) }; break
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
        default:
          return json({ error: 'Azione non riconosciuta' }, 400, req)
      }

      await logAdmin(supabase, user.email, tipo, orgId || null, ip, ua)
      return json(result, 200, req)
    } catch (err) {
      const safe = safeError(err, { endpoint: 'admin', method: 'POST', tipo, orgId })
      // L'admin_log internamente registra il dettaglio reale; al client va il safe
      await logAdmin(supabase, user.email, `${tipo}_errore:${(err.message || '').slice(0, 80)}`, orgId || null, ip, ua)
      return json(safe.body, safe.status, req)
    }
  }

  return json({ error: 'Method not allowed' }, 405, req)
}
