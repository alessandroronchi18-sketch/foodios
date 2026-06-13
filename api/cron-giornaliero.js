export const config = { runtime: 'edge' }

// Cron consolidato per piano Hobby Vercel (max 2 cron/giorno).
// Eseguito ogni mattina alle 07:00 UTC. Esegue in sequenza:
//   1) cron-notifiche (alert magazzino sotto soglia, fatture in scadenza)
//   2) anomaly-detect (login da paese diverso, burst export, fail login)
//   3) cron-report-mensile (solo il 1° del mese)
//
// Ogni sub-handler ha la sua auth via CRON_SECRET → riusiamo le funzioni
// importando l'handler default e chiamandolo con una Request mock che porta
// l'origin reale del cron-giornaliero (serve a cron-notifiche per costruire
// fetch interni a /api/send-email).

import { verifyBearerSecret } from './lib/cryptoCompare.js'
import notificheHandler from './cron-notifiche.js'
import anomalyHandler from './anomaly-detect.js'
import reportMensileHandler from './cron-report-mensile.js'
import dailyBriefHandler from './cron-daily-brief.js'
import aiSuggestionsHandler from './cron-ai-suggestions.js'
import forecastHandler from './cron-forecast.js'
import documentaryHandler from './cron-documentary.js'

function makeInternalReq(realUrl, path) {
  const origin = new URL(realUrl).origin
  return new Request(`${origin}${path}`, {
    method: 'GET',
    headers: {
      // Riusa il CRON_SECRET — i sub-handler lo verificano con verifyBearerSecret
      Authorization: `Bearer ${process.env.CRON_SECRET || ''}`,
      'user-agent': 'foodios-cron-giornaliero',
    },
  })
}

// Audit reliability 2026-06-14 PM: ogni step ha un timeout dedicato. Senza
// timeout, 1 stallo Anthropic/Twilio = 30s Vercel timeout = TUTTI gli step
// successivi non girano (cascading failure). Con timeout per-step,
// l'orchestratore continua col prossimo anche se uno hangs.
const STEP_TIMEOUT_MS = 25_000  // 25s per step (Vercel cron limit 60s totale)

async function runStep(name, fn) {
  const start = Date.now()
  try {
    const stepPromise = fn()
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`step timeout ${STEP_TIMEOUT_MS}ms`)), STEP_TIMEOUT_MS)
    )
    const res = await Promise.race([stepPromise, timeoutPromise])
    const ms = Date.now() - start
    let body = null
    try { body = await res.clone().json() } catch {}
    return { step: name, ok: res.ok, status: res.status, ms, body }
  } catch (e) {
    return { step: name, ok: false, error: (e.message || String(e)).slice(0, 200), ms: Date.now() - start }
  }
}

export default async function handler(req) {
  // Auth: stesso pattern degli altri cron (fail-closed)
  const authCheck = verifyBearerSecret(
    req.headers.get('Authorization') || req.headers.get('authorization') || '',
    process.env.CRON_SECRET,
  )
  if (!authCheck.ok) {
    return new Response('Unauthorized', { status: 401 })
  }

  const now = new Date()
  const isPrimoDelMese = now.getUTCDate() === 1

  // Audit 2026-06-14 PM: step INDIPENDENTI eseguiti in PARALLELO con
  // Promise.allSettled (no piu' seriale a fail-domino). 1 stallo non
  // blocca gli altri. Solo cleanup-audit-log resta seriale alla fine.
  const independentSteps = [
    ['cron-notifiche',      () => notificheHandler(makeInternalReq(req.url, '/api/cron-notifiche'))],
    ['anomaly-detect',      () => anomalyHandler(makeInternalReq(req.url, '/api/anomaly-detect'))],
    ['cron-daily-brief',    () => dailyBriefHandler(makeInternalReq(req.url, '/api/cron-daily-brief'))],
    ['cron-ai-suggestions', () => aiSuggestionsHandler(makeInternalReq(req.url, '/api/cron-ai-suggestions'))],
    ['cron-forecast',       () => forecastHandler(makeInternalReq(req.url, '/api/cron-forecast'))],
    ['cron-documentary',    () => documentaryHandler(makeInternalReq(req.url, '/api/cron-documentary'))],
  ]
  if (isPrimoDelMese) {
    independentSteps.push(['cron-report-mensile', () => reportMensileHandler(makeInternalReq(req.url, '/api/cron-report-mensile'))])
  }

  const settled = await Promise.allSettled(
    independentSteps.map(([name, fn]) => runStep(name, fn))
  )
  const results = settled.map((s, i) =>
    s.status === 'fulfilled' ? s.value : { step: independentSteps[i][0], ok: false, error: s.reason?.message || 'rejected', ms: 0 }
  )

  // 4) Cleanup audit_log (retention 365 giorni — protegge crescita tabella).
  results.push(await runStep('cleanup-audit-log', async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      const { data, error } = await supabase.rpc('cleanup_audit_log', { retain_days: 365 })
      if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ ok: true, removed: data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message || 'exception' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }))

  return new Response(JSON.stringify({
    ok: true,
    triggered_at: now.toISOString(),
    is_primo_del_mese: isPrimoDelMese,
    steps: results,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
