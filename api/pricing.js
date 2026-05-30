export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getClientIP } from './lib/cors.js'

// Endpoint pubblico (no auth): restituisce i prezzi correnti dei piani,
// letti dalla tabella plan_pricing. Usato da landing, pannello abbonamento, ecc.
// Cache 60s lato CDN per non martellare il DB.
// Rate limit applicato come safety net (CDN dovrebbe assorbire la maggior parte).
const FALLBACK = {
  pro:   { plan: 'pro',   prezzo_mese_cents: 8900,  valuta: 'eur', label: 'Pro' },
  chain: { plan: 'chain', prezzo_mese_cents: 14900, valuta: 'eur', label: 'Chain' },
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })

  const ip = getClientIP(req)
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  // 30 req/min/IP: ben oltre l'uso normale (la landing fa 1 chiamata + cache CDN
  // 60s), insufficient per scraping aggressivo.
  const rl = await checkRateLimit(supabase, `pricing:${ip}`, 30, 60)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  let piani = FALLBACK
  try {
    const { data, error } = await supabase
      .from('plan_pricing')
      .select('plan, prezzo_mese_cents, valuta, label')
    if (!error && Array.isArray(data) && data.length > 0) {
      const map = { ...FALLBACK }
      for (const row of data) map[row.plan] = row
      piani = map
    }
  } catch { /* fallback ai prezzi di default */ }

  return new Response(JSON.stringify({ piani }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  })
}
