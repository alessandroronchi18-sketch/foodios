// Report Stripe del pannello admin: MRR reale ed eventi recenti.
//
// Estratti da api/admin.js. Parlano solo con Stripe, non toccano il database,
// quindi si isolano senza attriti.

import { getStripe } from './stripeClient.js'

// ─── Stripe: MRR reale e eventi recenti ─────────────────────────────────
// Calcolo MRR dalle subscription attive (non dalla stima paganti × prezzo).
// Considera solo subscription in status 'active' o 'trialing' (Stripe le
// fattura entrambe quando finisce il trial). Le altre (canceled, past_due,
// incomplete) NON contribuiscono al MRR.
export async function getStripeMrr() {
  const stripe = await getStripe()

  // Pagina su tutte le subscription (limite max 100 per call).
  const considerati = ['active', 'trialing']
  const buckets = { active: 0, trialing: 0, past_due: 0, canceled: 0, incomplete: 0 }
  let mrrCents = 0
  let mrrTrialingCents = 0
  let cursor = null
  let pagine = 0
  while (true) {
    const page = await stripe.subscriptions.list({
      limit: 100, status: 'all', ...(cursor ? { starting_after: cursor } : {}),
    })
    for (const sub of page.data) {
      if (buckets[sub.status] != null) buckets[sub.status]++
      if (!considerati.includes(sub.status)) continue
      // Somma items: ognuno e' un prezzo. amount_decimal o unit_amount × qty.
      for (const it of sub.items?.data || []) {
        const price = it.price
        const qty = it.quantity || 1
        if (!price?.unit_amount) continue
        const amt = price.unit_amount * qty
        // Normalizza a mensile in base a recurring.interval.
        const interval = price.recurring?.interval || 'month'
        const intervalCount = price.recurring?.interval_count || 1
        let perMonth = amt
        if (interval === 'year') perMonth = Math.round(amt / 12 / intervalCount)
        else if (interval === 'week') perMonth = Math.round(amt * 4.33 / intervalCount)
        else if (interval === 'day') perMonth = Math.round(amt * 30 / intervalCount)
        else perMonth = Math.round(amt / intervalCount)
        if (sub.status === 'trialing') mrrTrialingCents += perMonth
        else mrrCents += perMonth
      }
    }
    pagine++
    if (!page.has_more || pagine >= 10) break
    cursor = page.data[page.data.length - 1]?.id
    if (!cursor) break
  }

  // Failed payments ultimi 30 giorni
  let failedCnt = 0
  try {
    const since = Math.floor((Date.now() - 30 * 86400000) / 1000)
    const charges = await stripe.charges.list({ limit: 100, created: { gte: since } })
    failedCnt = (charges.data || []).filter(c => c.status === 'failed').length
  } catch { /* ignore */ }

  return {
    mrr_cents: mrrCents,
    mrr_trialing_cents: mrrTrialingCents,
    mrr_totale_cents: mrrCents + mrrTrialingCents,
    sub_active: buckets.active,
    sub_trialing: buckets.trialing,
    sub_past_due: buckets.past_due,
    sub_canceled: buckets.canceled,
    sub_incomplete: buckets.incomplete,
    failed_30d: failedCnt,
    valuta: 'EUR',
  }
}

// Ultimi N eventi Stripe (subscription/charge/invoice). Filtra per tipi
// rilevanti per il monitoring revenue, scarta il resto (verbosi).
export const STRIPE_EVENT_TYPES = [
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.finalized',
  'invoice.upcoming',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
  'charge.succeeded',
  'charge.failed',
  'charge.refunded',
  'checkout.session.completed',
  'customer.created',
  'customer.deleted',
]
export async function getStripeEvents() {
  const stripe = await getStripe()
  const events = await stripe.events.list({
    limit: 100,
    types: STRIPE_EVENT_TYPES,
  })
  return (events.data || []).map(e => {
    const obj = e.data?.object || {}
    // Email customer: alcuni eventi hanno customer email, altri customer id.
    const customerEmail = obj.customer_email || obj.receipt_email || null
    const customerId = (typeof obj.customer === 'string') ? obj.customer : obj.customer?.id || null
    const amount =
      obj.amount_paid != null ? obj.amount_paid :
      obj.amount_due != null ? obj.amount_due :
      obj.amount != null ? obj.amount :
      obj.total != null ? obj.total : null
    return {
      id: e.id,
      created: e.created * 1000,
      type: e.type,
      livemode: e.livemode,
      customer_id: customerId,
      customer_email: customerEmail,
      amount_cents: amount,
      currency: obj.currency || null,
      status: obj.status || null,
      sub_status: obj.status, // alias di lettura
    }
  })
}
