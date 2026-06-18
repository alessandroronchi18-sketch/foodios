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
// Audit 2026-07-01 MEDIUM: Vercel Hobby ha 60s/funzione; con 7+ step in
// allSettled e 25s ciascuno, il wall-clock totale puo' superare 60s prima
// che il cleanup parta. Ridotto a 18s — i sub-handler reali finiscono in
// <10s normalmente, 18s e' margine di sicurezza.
const STEP_TIMEOUT_MS = 18_000

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

  // 5) Audit 2026-07-01 MEDIUM/HIGH: cleanup retention paralleli (error_log,
  //    stripe_webhook_events, login_attempts — vedi migration 20260701).
  //    + past_due grace: org con stripe_status='past_due' da >7gg → approvato=false.
  results.push(await runStep('cleanup-error-log', async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      const { data, error } = await supabase.rpc('error_log_cleanup_old', { p_days: 90 })
      if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
      return new Response(JSON.stringify({ ok: true, removed: data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message || 'exception' }), { status: 500 })
    }
  }))

  results.push(await runStep('cleanup-login-attempts', async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      const { data, error } = await supabase.rpc('login_attempts_cleanup_old', { p_days: 90 })
      if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
      return new Response(JSON.stringify({ ok: true, removed: data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message || 'exception' }), { status: 500 })
    }
  }))

  // 6) Past_due grace: invalida `approvato` per org Stripe non pagate da >7gg.
  results.push(await runStep('stripe-past-due-grace', async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      // Audit 2026-07-01 HIGH: senza, una sub past_due restava approvata fino
      // a `subscription.deleted` (anche 30+ giorni). Concediamo 7gg di grace,
      // poi fail-closed.
      const cutoff = new Date(Date.now() - 7 * 86400000).toISOString()
      const { data, error } = await supabase
        .from('organizations')
        .update({ approvato: false })
        .eq('stripe_status', 'past_due')
        .eq('approvato', true)
        .lt('stripe_current_period_end', cutoff)
        .select('id')
      if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
      return new Response(JSON.stringify({ ok: true, revoked: data?.length || 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message || 'exception' }), { status: 500 })
    }
  }))

  // Audit 2026-07-01 MEDIUM: alerting su ERRORI cron (Slack/email).
  // Se >= 1 step ha ok=false ed esiste ADMIN_EMAIL+RESEND_API_KEY, invia
  // email riepilogativa all'admin per intervenire. Idempotente per giorno
  // via dedup-key cron_runs (vedi migration 20260701).
  const stepsFalliti = results.filter(s => !s.ok)
  if (stepsFalliti.length > 0 && process.env.ADMIN_EMAIL && process.env.RESEND_API_KEY) {
    try {
      const oggi = now.toISOString().slice(0, 10)
      // Dedup: una sola email per (job_name, day). Se gia inviata, skip.
      const { createClient } = await import('@supabase/supabase-js')
      const sup = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      const alertJob = `cron-giornaliero-alert-${oggi}`
      const { data: claim } = await sup.rpc('cron_run_claim', { p_job_name: alertJob })
      if (claim === true) {
        const rows = stepsFalliti.map(s => {
          const err = s.error || s.body?.error || `HTTP ${s.status || '?'}`
          return `<tr><td style="padding:6px 12px;border-bottom:1px solid #E5E7EB">${s.step}</td><td style="padding:6px 12px;border-bottom:1px solid #E5E7EB;color:#DC2626">${err.toString().slice(0, 200)}</td><td style="padding:6px 12px;border-bottom:1px solid #E5E7EB;color:#94A3B8">${s.ms || 0}ms</td></tr>`
        }).join('')
        const html = `<div style="font-family:Inter,system-ui,sans-serif;max-width:680px;margin:0 auto;padding:24px">
          <h1 style="color:#DC2626;margin:0 0 16px;font-size:20px">⚠️ Cron giornaliero FoodOS — ${stepsFalliti.length}/${results.length} step falliti</h1>
          <p style="color:#475569;font-size:14px;margin:0 0 16px">Eseguito alle ${now.toISOString()}. Step falliti:</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden">
            <thead><tr style="background:#FAFAF6"><th style="padding:8px 12px;text-align:left;color:#475569;font-weight:700">Step</th><th style="padding:8px 12px;text-align:left;color:#475569;font-weight:700">Errore</th><th style="padding:8px 12px;text-align:left;color:#475569;font-weight:700">Durata</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="color:#94A3B8;font-size:11px;margin-top:20px">Verifica i log Vercel + error_log su DB. Se ricorrente, rivedi STEP_TIMEOUT_MS o paginazione cron-notifiche.</p>
        </div>`
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'FoodOS <noreply@foodios.it>',
            to: process.env.ADMIN_EMAIL,
            subject: `⚠️ Cron FoodOS — ${stepsFalliti.length} step falliti`,
            html,
          }),
        }).catch(() => { /* alerting best-effort */ })
        try { await sup.rpc('cron_run_mark', { p_job_name: alertJob, p_status: 'ok' }) } catch {}
      }
    } catch (e) {
      console.error('[cron-giornaliero] alerting fallito (non-blocking):', e.message)
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    triggered_at: now.toISOString(),
    is_primo_del_mese: isPrimoDelMese,
    steps: results,
    steps_falliti: stepsFalliti.length,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
