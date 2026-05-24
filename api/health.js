export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getClientIP } from './lib/cors.js'

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const start = Date.now()
  let dbOk = false
  let supabase = null

  try {
    const { createClient } = await import('@supabase/supabase-js')
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // Rate limit anche su health: 60 req/min per IP, ban 5 min.
    // Senza, è un endpoint di reconnaissance (latency = profilo DB load).
    const ip = getClientIP(req)
    const rl = await checkRateLimit(supabase, `health:${ip}`, 60, 60, 300)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

    const { error } = await supabase.from('organizations').select('id').limit(1)
    dbOk = !error
  } catch { /* db unreachable */ }

  const latency = Date.now() - start
  const status = dbOk ? 200 : 503

  return new Response(JSON.stringify({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk,
    // latency_ms rimosso: era reconnaissance utile per timing attacks su DB
    ts: new Date().toISOString(),
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
