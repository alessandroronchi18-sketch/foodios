export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getClientIP } from './lib/cors.js'

// Endpoint pubblico (no auth): restituisce i prezzi correnti dei piani,
// letti dalla tabella plan_pricing. Usato da landing, pannello abbonamento, ecc.
// Cache 60s lato CDN per non martellare il DB.
// Rate limit applicato come safety net (CDN dovrebbe assorbire la maggior parte).
// Fallback 3-tier (Audit 2026-06-24): include nome_display e descrizione
// così la landing e il pannello abbonamento mostrano qualcosa di sensato
// anche se il DB non risponde (cold start, RLS, downtime Supabase).
const FALLBACK = {
  base:  { plan: 'base',  prezzo_mese_cents: 6900,  valuta: 'eur', label: 'Bottega',
           nome_display: 'Bottega', descrizione: 'Una sede, l\'essenziale.' },
  pro:   { plan: 'pro',   prezzo_mese_cents: 14900, valuta: 'eur', label: 'Maestro',
           nome_display: 'Maestro', descrizione: 'Sostituisce un controller part-time.' },
  chain: { plan: 'chain', prezzo_mese_cents: 39900, valuta: 'eur', label: 'Insegna',
           nome_display: 'Insegna', descrizione: 'Sostituisce 1 controller + IT contractor.' },
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
      .select('plan, prezzo_mese_cents, valuta, label, nome_display, descrizione')
    if (!error && Array.isArray(data) && data.length > 0) {
      const map = { ...FALLBACK }
      // Merge DB su fallback: se DB ha NULL su nome_display/descrizione,
      // tengo il default. Importante: admin che svuota un campo per errore
      // non rompe la landing.
      for (const row of data) {
        const fb = FALLBACK[row.plan] || {}
        map[row.plan] = {
          ...fb, ...row,
          nome_display: row.nome_display || fb.nome_display || row.label,
          descrizione:  row.descrizione  || fb.descrizione  || '',
        }
      }
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
