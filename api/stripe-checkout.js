// POST /api/stripe-checkout
// Body: { plan: 'pro' | 'chain' }
// Auth: Bearer (Supabase JWT)
// Risposta: { url } → redirect a Stripe Checkout
//
// Crea (o ricicla) un Customer Stripe collegato all'organization, poi
// crea una Checkout Session in modalità "subscription" con il price corretto.
// Il client redirige all'URL ricevuto.

export const config = { runtime: 'nodejs' }

import { verificaToken } from './lib/auth.js'

const PLAN_PRICE_MAP = {
  pro:   process.env.STRIPE_PRO_PRICE_ID,
  chain: process.env.STRIPE_CHAIN_PRICE_ID,
}

function origin(req) {
  const h = req.headers
  return (h.origin || h.referer || 'https://foodios-rose.vercel.app').replace(/\/$/, '').split('/').slice(0, 3).join('/')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Stripe non configurato' })

  // Estraiamo il JWT dall'header e verifichiamo (saltiamo il gate trial: chi è scaduto deve poter pagare)
  const tokenReq = {
    headers: { get: (k) => req.headers[k.toLowerCase()] || req.headers[k] },
  }
  const auth = await verificaToken(tokenReq, { skipOrgCheck: true })
  if (!auth.user || !auth.profile?.organization_id) {
    return res.status(401).json({ error: auth.error || 'Non autenticato' })
  }

  const { plan } = req.body || {}
  const priceId = PLAN_PRICE_MAP[plan]
  if (!priceId) return res.status(400).json({ error: `Piano non valido: ${plan}` })

  const { default: Stripe } = await import('stripe')
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  const supabase = auth.supabase

  try {
    // Recupera org + email user
    const { data: org } = await supabase
      .from('organizations')
      .select('id, nome, stripe_customer_id')
      .eq('id', auth.profile.organization_id).maybeSingle()
    if (!org) return res.status(404).json({ error: 'Organization non trovata' })

    // Crea (o riusa) il customer Stripe
    let customerId = org.stripe_customer_id
    if (!customerId) {
      const cust = await stripe.customers.create({
        email: auth.user.email,
        name:  org.nome,
        metadata: { organization_id: org.id },
      })
      customerId = cust.id
      await supabase.from('organizations').update({ stripe_customer_id: customerId }).eq('id', org.id)
    }

    const o = origin(req)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${o}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${o}/?billing=cancel`,
      subscription_data: {
        metadata: { organization_id: org.id, plan },
      },
      metadata: { organization_id: org.id, plan },
      allow_promotion_codes: true,
      locale: 'it',
    })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[stripe-checkout]', err)
    return res.status(500).json({ error: err.message || 'Errore checkout' })
  }
}
