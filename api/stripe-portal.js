// POST /api/stripe-portal
// Auth: Bearer (Supabase JWT)
// Risposta: { url } → redirect al Customer Portal di Stripe
// Permette al titolare di gestire abbonamento, pagamenti, fatture, disdetta.

export const config = { runtime: 'nodejs' }

import { verificaToken } from './lib/auth.js'
import { safeOrigin } from './lib/originGuard.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Stripe non configurato' })

  const tokenReq = { headers: { get: (k) => req.headers[k.toLowerCase()] || req.headers[k] } }
  const auth = await verificaToken(tokenReq, { skipOrgCheck: true })
  if (!auth.user || !auth.profile?.organization_id) {
    return res.status(401).json({ error: auth.error || 'Non autenticato' })
  }
  // Solo il titolare puo' aprire il customer portal (disdetta sub, scaricare
  // fatture, cambiare metodo pagamento). Il dipendente NON deve potere — audit
  // HIGH 17 giu: prima mancava il gate (stripe-checkout.js ce l'ha gia').
  if (auth.profile.ruolo === 'dipendente') {
    return res.status(403).json({ error: 'Solo il titolare puo gestire la sottoscrizione' })
  }

  const { default: Stripe } = await import('stripe')
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

  try {
    const { data: org } = await auth.supabase
      .from('organizations')
      .select('stripe_customer_id')
      .eq('id', auth.profile.organization_id).maybeSingle()

    if (!org?.stripe_customer_id) {
      return res.status(400).json({ error: 'Nessun abbonamento attivo. Avvia un Checkout prima.' })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${safeOrigin(req)}/`,
      locale: 'it',
    })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[stripe-portal]', err)
    return res.status(500).json({ error: err.message })
  }
}
