export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, getClientIP, json } from './lib/cors.js'
import { sanitize, sanitizeStrict, validateUUID, validateEmail } from './lib/validate.js'

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'alessandroar@maradeiboschi.com').toLowerCase()
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
      console.error('admin GET error:', err)
      return json({ error: err.message }, 500, req)
    }
  }

  // ── POST ───────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body
    try { body = await req.json() } catch { return json({ error: 'JSON non valido' }, 400, req) }

    const orgId = sanitizeStrict(body.orgId || '', 36)
    const tipo = sanitizeStrict(body.tipo || '', 50)

    // azioni che non richiedono orgId: invia_email
    const azioniSenzaOrgId = ['invia_email']
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
        default:
          return json({ error: 'Azione non riconosciuta' }, 400, req)
      }

      await logAdmin(supabase, user.email, tipo, orgId || null, ip, ua)
      return json(result, 200, req)
    } catch (err) {
      console.error(`admin POST ${tipo} error:`, err)
      await logAdmin(supabase, user.email, `${tipo}_errore:${(err.message || '').slice(0, 80)}`, orgId || null, ip, ua)
      return json({ error: err.message || 'Errore interno' }, 500, req)
    }
  }

  return json({ error: 'Method not allowed' }, 405, req)
}
