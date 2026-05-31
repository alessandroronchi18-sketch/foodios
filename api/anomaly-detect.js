export const config = { runtime: 'edge' }

import { verifyBearerSecret } from './lib/cryptoCompare.js'

// Anomaly detection — chiamato dal cron giornaliero (aggiungere in vercel.json se desiderato).
// Identifica:
//   1) Login da paese diverso dalla maggioranza degli ultimi 30 login dell'email
//   2) Più di N export ricettario / sessione (default 50) in una stessa ora per org
//   3) Burst di fail login (>10 in 1h) per stessa email
//
// I findings vengono inseriti in audit_log con operation='anomaly_detected'.
// Se ADMIN_EMAIL e RESEND_API_KEY sono configurati, notifica l'admin via email
// (best-effort, fail-soft).

const EXPORT_THRESHOLD_PER_HOUR = 50
const FAIL_BURST_THRESHOLD = 10
const COUNTRY_HISTORY_LIMIT = 30

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

async function detectCountryAnomalies(supabase) {
  // Per ogni email che ha avuto un login successful nell'ultima ora,
  // controlla se il paese è diverso dal "paese dominante" degli ultimi 30 login.
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
  const { data: recent, error } = await supabase
    .from('login_attempts')
    .select('email, country, ip, ip')
    .gte('created_at', oneHourAgo)
    .eq('success', true)
    .not('country', 'is', null)
  if (error || !recent?.length) return []

  const anomalies = []
  const checkedEmails = new Set()
  for (const row of recent) {
    if (checkedEmails.has(row.email)) continue
    checkedEmails.add(row.email)
    // Storico paesi degli ultimi 30 successful login (escluso quello corrente)
    const { data: hist } = await supabase
      .from('login_attempts')
      .select('country')
      .eq('email', row.email)
      .eq('success', true)
      .not('country', 'is', null)
      .order('created_at', { ascending: false })
      .limit(COUNTRY_HISTORY_LIMIT)
    if (!hist || hist.length < 3) continue // troppi pochi dati per stabilire normale

    const counts = {}
    for (const r of hist) counts[r.country] = (counts[r.country] || 0) + 1
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const dominant = sorted[0][0]
    const dominantShare = sorted[0][1] / hist.length

    if (row.country !== dominant && dominantShare > 0.7) {
      anomalies.push({
        kind: 'country_change',
        email: row.email,
        current_country: row.country,
        dominant_country: dominant,
        dominant_share: dominantShare,
      })
    }
  }
  return anomalies
}

async function detectExportBursts(supabase) {
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
  const { data: events, error } = await supabase
    .from('audit_log')
    .select('organization_id, user_id, user_email, operation, created_at')
    .gte('created_at', oneHourAgo)
    // ilike case-insensitive: copre anche 'EXPORT_ricettario' / 'Export_*'.
    .ilike('operation', 'export_%')
  if (error || !events?.length) return []

  const counter = {}
  for (const e of events) {
    if (!e.organization_id) continue
    const key = `${e.organization_id}|${e.user_email || ''}`
    counter[key] = (counter[key] || 0) + 1
  }
  const anomalies = []
  for (const [key, count] of Object.entries(counter)) {
    if (count >= EXPORT_THRESHOLD_PER_HOUR) {
      const [orgId, email] = key.split('|')
      anomalies.push({ kind: 'export_burst', organization_id: orgId, user_email: email, count })
    }
  }
  return anomalies
}

async function detectFailBursts(supabase) {
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
  try {
    const { data: rows, error } = await supabase
      .from('login_attempts')
      .select('email')
      .gte('created_at', oneHourAgo)
      .eq('success', false)
    if (error || !rows?.length) return []
    const counter = {}
    for (const r of rows) counter[r.email] = (counter[r.email] || 0) + 1
    return Object.entries(counter)
      .filter(([, c]) => c >= FAIL_BURST_THRESHOLD)
      .map(([email, count]) => ({ kind: 'fail_burst', email, count }))
  } catch { return [] }
}

async function logFindings(supabase, findings) {
  if (!findings.length) return
  await supabase.from('audit_log').insert(findings.map(f => ({
    operation: 'anomaly_detected',
    user_email: f.email || null,
    organization_id: f.organization_id || null,
    new_data: f,
  }))).catch(() => {})
}

async function notifyAdminIfNeeded(req, findings) {
  if (!findings.length) return
  if (!process.env.RESEND_API_KEY) return
  const admin = (process.env.ADMIN_EMAIL || '').trim()
  if (!admin) return
  if (!process.env.INTERNAL_API_SECRET) return // niente secret = niente invio (anti-spam)

  const lines = findings.slice(0, 50).map(f => `• ${JSON.stringify(f)}`).join('\n')
  const messaggio = [
    `Rilevate ${findings.length} anomalie nell'ultima ora:`,
    ``,
    lines,
    ``,
    `Controlla admin_log per dettagli.`,
  ].join('\n')

  try {
    await fetch(new URL('/api/send-email', req.url).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify({
        tipo: 'custom',
        email: admin,
        oggetto: `🚨 FoodOS — ${findings.length} anomalie rilevate`,
        messaggio,
      }),
    })
  } catch { /* notifica best-effort */ }
}

export default async function handler(req) {
  // Protezione: CRON_SECRET come per gli altri cron (fail-closed)
  const authCheck = verifyBearerSecret(
    req.headers.get('Authorization') || req.headers.get('authorization') || '',
    process.env.CRON_SECRET,
  )
  if (!authCheck.ok) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = await getSupabase()
  const [countryAnomalies, exportBursts, failBursts] = await Promise.all([
    detectCountryAnomalies(supabase).catch(() => []),
    detectExportBursts(supabase).catch(() => []),
    detectFailBursts(supabase).catch(() => []),
  ])
  const findings = [...countryAnomalies, ...exportBursts, ...failBursts]

  await logFindings(supabase, findings)
  await notifyAdminIfNeeded(req, findings)

  return new Response(JSON.stringify({
    ok: true,
    findings_count: findings.length,
    by_kind: {
      country_change: countryAnomalies.length,
      export_burst: exportBursts.length,
      fail_burst: failBursts.length,
    },
  }), { headers: { 'Content-Type': 'application/json' } })
}
