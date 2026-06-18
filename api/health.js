export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getClientIP } from './lib/cors.js'

// Audit 2026-07-01 batch 12 Osservabilita: endpoint diagnostico per
// uptime checker esterno (UptimeRobot/Pingdom) + admin debug.
// SHAPE STABILE — non rompere senza bump version (smoke-prod.yml dipende
// dalla presenza di `"status":"ok"` e `"db":true`).
//
// Output esteso solo se `?diag=1` (richiede ?adminSecret per dati sensibili).

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const url = new URL(req.url)
  const wantDiag = url.searchParams.get('diag') === '1'
  const adminSecret = url.searchParams.get('adminSecret') || ''

  let dbOk = false
  let supabase = null
  let cronGiornaliero = null
  let dbLatencyMs = null

  try {
    const { createClient } = await import('@supabase/supabase-js')
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // Rate limit anche su health: 60 req/min per IP, ban 5 min.
    const ip = getClientIP(req)
    const rl = await checkRateLimit(supabase, `health:${ip}`, 60, 60, 300)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

    const t0 = Date.now()
    const { error } = await supabase.from('organizations').select('id').limit(1)
    dbLatencyMs = Date.now() - t0
    dbOk = !error
  } catch { /* db unreachable */ }

  // Diagnostico esteso (admin only): ultimo cron-giornaliero status + count critici.
  const isAuthorizedDiag = wantDiag && adminSecret && adminSecret === (process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET || '')
  if (isAuthorizedDiag && supabase) {
    try {
      const { data: cr } = await supabase
        .from('cron_runs')
        .select('job_name, run_date, started_at, completed_at, status, error_message')
        .order('started_at', { ascending: false })
        .limit(5)
      cronGiornaliero = Array.isArray(cr) ? cr : null
    } catch { cronGiornaliero = null }
  }

  const status = dbOk ? 200 : 503
  const body = {
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk,
    ts: new Date().toISOString(),
    // Audit 2026-07-01: latency dato utile per uptime monitor — esposto
    // SOLO se ?diag=1 (anti-timing reconnaissance senza diag flag).
    ...(wantDiag ? { db_latency_ms: dbLatencyMs } : {}),
    ...(isAuthorizedDiag ? {
      cron_recent: cronGiornaliero,
      vercel_env: process.env.VERCEL_ENV || null,
      vercel_url: process.env.VERCEL_URL || null,
      node_env: process.env.NODE_ENV || null,
      configured: {
        admin_email: !!process.env.ADMIN_EMAIL,
        resend: !!process.env.RESEND_API_KEY,
        slack_webhook: !!process.env.SLACK_WEBHOOK_URL,
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        stripe: !!process.env.STRIPE_SECRET_KEY,
        sdi_provider: process.env.SDI_PROVIDER || null,
        fic_token: !!process.env.FATTURE_IN_CLOUD_TOKEN,
      },
    } : {}),
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
