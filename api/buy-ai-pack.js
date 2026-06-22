// POST /api/buy-ai-pack
// Cliente sceglie un pacchetto AI (foto_50/foto_200/foto_1000) → ritorna URL
// Stripe Checkout one-shot (mode=payment). Webhook checkout.session.completed
// crea la riga in ai_credit_packs_purchased col calls_remaining=calls_included.
//
// Auth: utente loggato (cookie supabase). Service-role lato server per
// recuperare/aggiornare l'org del chiamante.
//
// Body: { pack_type: 'foto_50'|'foto_200'|'foto_1000' }
// Risposta: { url } (Stripe checkout URL)

export const config = { runtime: 'edge' }

import { handleOptions, getCorsHeaders, json, getClientIP } from './lib/cors.js'
import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { safeError } from './lib/safeError.js'

// Catalogo pacchetti: prezzi e calls inclusi. price_id Stripe configurabile
// via env (STRIPE_PRICE_FOTO_50 etc.); altrimenti usa amount_inline.
const PACKS = {
  foto_50:   { calls: 50,   amount_cents: 500,  label: '50 foto AI · €5' },
  foto_200:  { calls: 200,  amount_cents: 1500, label: '200 foto AI · €15' },
  foto_1000: { calls: 1000, amount_cents: 6000, label: '1000 foto AI · €60' },
}

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

async function getUser(req, supabase) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const { data: { user }, error } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (error || !user) return null
  return user
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'POST richiesto' }, 405, req)

  const ip = getClientIP(req)
  const supabase = await getSupabase()
  const rl = await checkRateLimit(supabase, `buy-pack:${ip}`, 10, 60)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  const user = await getUser(req, supabase)
  if (!user) return json({ error: 'Non autorizzato' }, 401, req)

  let body
  try { body = await req.json() } catch { return json({ error: 'JSON non valido' }, 400, req) }
  const packType = String(body?.pack_type || '').trim()
  const pack = PACKS[packType]
  if (!pack) return json({ error: 'Pack non valido' }, 400, req)

  const { data: profile } = await supabase.from('profiles')
    .select('organization_id, email').eq('id', user.id).maybeSingle()
  if (!profile?.organization_id) return json({ error: 'Org non trovata' }, 404, req)

  if (!process.env.STRIPE_SECRET_KEY) {
    return json({ error: 'Stripe non configurato' }, 503, req)
  }
  const { default: Stripe } = await import('stripe')
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  // Cerca stripe_customer_id dell'org per pre-fill (evita doppi customer)
  const { data: org } = await supabase.from('organizations')
    .select('stripe_customer_id, nome').eq('id', profile.organization_id).maybeSingle()

  const APP_URL = req.headers.get('origin') || 'https://foodios-rose.vercel.app'

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      ...(org?.stripe_customer_id ? { customer: org.stripe_customer_id } : { customer_email: profile.email }),
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: pack.amount_cents,
          product_data: {
            name: `FoodOS · ${pack.label}`,
            description: `Pacchetto di ${pack.calls} analisi AI extra (OCR foto, scontrini, listini).`,
          },
        },
      }],
      metadata: {
        organization_id: profile.organization_id,
        user_id: user.id,
        pack_type: packType,
        calls_included: String(pack.calls),
      },
      success_url: `${APP_URL}/?ai_pack=success&pack=${packType}`,
      cancel_url: `${APP_URL}/?ai_pack=cancel`,
    })
    return json({ url: session.url }, 200, req)
  } catch (e) {
    const safe = safeError(e, { endpoint: 'buy-ai-pack', op: 'create_session', orgId: profile.organization_id })
    return json(safe.body, safe.status, req)
  }
}
