// GET /api/cron-heartbeat
//
// Endpoint di liveness probe richiamato da uptime-monitor esterni
// (UptimeRobot, BetterStack, healthchecks.io). Risponde 200 con timestamp
// quando il deploy Vercel risponde e Supabase è raggiungibile.
//
// Auth: CRON_SECRET (opzionale) oppure pubblico per probe esterni.
// Risposta: { ok: boolean, ts: ISO, services: { db: 'ok'|'down', stripe: 'ok'|'unconfigured' } }
//
// Osservabilità: ogni call aggiorna cron_runs con name='heartbeat' (best effort).

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const out = {
    ok: true,
    ts: new Date().toISOString(),
    deploy: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
    services: { db: 'unknown', stripe: 'unconfigured' },
  }

  // Check Supabase reachable (timeout corto)
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 3000)
      const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/?apikey=${process.env.SUPABASE_SERVICE_KEY}`, {
        signal: ctrl.signal,
      })
      clearTimeout(t)
      out.services.db = r.ok ? 'ok' : `error_${r.status}`
    } catch (e) {
      out.services.db = `down_${e.name || 'unknown'}`
      out.ok = false
    }
  }

  // Stripe configured? (no API call, solo verifica env)
  out.services.stripe = process.env.STRIPE_SECRET_KEY ? 'configured' : 'unconfigured'

  // Logga su cron_runs (best effort, non rompere se DB down).
  if (out.services.db === 'ok' && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/cron_runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          Prefer: 'resolution=ignore-duplicates',
        },
        body: JSON.stringify({
          cron_name: 'heartbeat',
          run_date: new Date().toISOString().slice(0, 10),
          run_at: new Date().toISOString(),
          status: 'ok',
        }),
      })
    } catch {}
  }

  return new Response(JSON.stringify(out), {
    status: out.ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
