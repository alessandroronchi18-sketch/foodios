export const config = { runtime: 'edge' }

// Endpoint pubblico (no auth): restituisce i prezzi correnti dei piani,
// letti dalla tabella plan_pricing. Usato da landing, pannello abbonamento, ecc.
// Cache 60s lato CDN per non martellare il DB.
const FALLBACK = {
  pro:   { plan: 'pro',   prezzo_mese_cents: 8900,  valuta: 'eur', label: 'Pro' },
  chain: { plan: 'chain', prezzo_mese_cents: 14900, valuta: 'eur', label: 'Chain' },
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })

  let piani = FALLBACK
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
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
