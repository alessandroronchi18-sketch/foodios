// POST /api/stripe-webhook
// Stripe → server. Endpoint pubblico, autenticato tramite firma `Stripe-Signature`.
// Configura su Stripe Dashboard → Webhooks puntando a /api/stripe-webhook
// con eventi:
//   checkout.session.completed
//   customer.subscription.created
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_failed
//
// Aggiorna `organizations.approvato`, `.piano`, `.stripe_subscription_id`,
// `.stripe_status`, `.stripe_current_period_end`.
// Invia email transazionali (welcome / failed payment) via Resend se configurato.

export const config = { runtime: 'nodejs', api: { bodyParser: false } }

async function readRawBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) return
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'FoodOS <noreply@foodios.it>', to, subject, html,
    })
  } catch (err) {
    console.error('[stripe-webhook] email error', err)
  }
}

function planFromPriceId(priceId) {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'pro'
  if (priceId === process.env.STRIPE_CHAIN_PRICE_ID) return 'enterprise' // Chain → enterprise nel CHECK constraint
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Stripe non configurato' })
  }

  const { default: Stripe } = await import('stripe')
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

  const sig = req.headers['stripe-signature']
  let event
  try {
    const raw = await readRawBody(req)
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('[stripe-webhook] firma non valida:', err.message)
    return res.status(400).send(`Webhook error: ${err.message}`)
  }

  const supabase = await getSupabase()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object
        const orgId = s.metadata?.organization_id
        if (!orgId) break
        // La subscription esiste già; il webhook subscription.created arriverà a breve
        // (o è già arrivato). Qui aggiorniamo customer_id per sicurezza.
        const updates = { stripe_customer_id: s.customer }
        await supabase.from('organizations').update(updates).eq('id', orgId)

        // Email welcome (best-effort)
        const { data: prof } = await supabase
          .from('profiles').select('email').eq('organization_id', orgId).limit(1).maybeSingle()
        if (prof?.email) {
          await sendEmail({
            to: prof.email,
            subject: 'Benvenuto in FoodOS — il tuo abbonamento è attivo',
            html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px">
              <h1 style="color:#6E0E1A;margin:0 0 16px">Abbonamento attivato 🎉</h1>
              <p>Grazie per esserti abbonato a FoodOS. Il tuo account è ora attivo senza limiti di trial.</p>
              <p>Puoi gestire l'abbonamento (cambiare piano, scaricare fatture, disdire) direttamente dalle <strong>Impostazioni → Abbonamento</strong>.</p>
              <p>Hai bisogno di aiuto? Scrivici a <a href="mailto:support@foodios.it">support@foodios.it</a>.</p>
              <p style="color:#94A3B8;font-size:12px;margin-top:32px">FoodOS — il sistema operativo del cibo.</p>
            </div>`,
          })
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object
        const orgId = sub.metadata?.organization_id
        const priceId = sub.items?.data?.[0]?.price?.id
        const piano = planFromPriceId(priceId)
        const stato = sub.status // active | trialing | past_due | canceled | unpaid
        const isAttivo = ['active', 'trialing'].includes(stato)
        const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null

        const patch = {
          stripe_subscription_id: sub.id,
          stripe_status: stato,
          stripe_current_period_end: periodEnd,
          approvato: isAttivo,
        }
        if (piano) patch.piano = piano

        if (orgId) {
          await supabase.from('organizations').update(patch).eq('id', orgId)
        } else {
          // Fallback: trova org via customer_id
          await supabase.from('organizations')
            .update(patch).eq('stripe_customer_id', sub.customer)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await supabase.from('organizations').update({
          stripe_status: 'canceled',
          approvato: false,
        }).eq('stripe_subscription_id', sub.id)
        break
      }

      case 'invoice.payment_succeeded': {
        // Traccia l'utilizzo di codici sconto: ogni fattura pagata che riporta
        // un discount → incrementa redemptions del codice corrispondente.
        const inv = event.data.object
        try {
          const discounts = inv.discount ? [inv.discount] : (inv.discounts || [])
          for (const d of discounts) {
            if (!d || !d.coupon) continue
            const couponId = typeof d.coupon === 'string' ? d.coupon : d.coupon.id
            const promoCodeId = typeof d.promotion_code === 'string' ? d.promotion_code : d.promotion_code?.id
            const { data: cod } = await supabase
              .from('discount_codes').select('id, codice')
              .or(`stripe_coupon_id.eq.${couponId}${promoCodeId ? `,stripe_promo_code_id.eq.${promoCodeId}` : ''}`)
              .maybeSingle()
            if (!cod) continue
            const { data: orgRow } = await supabase
              .from('organizations').select('id').eq('stripe_customer_id', inv.customer).maybeSingle()
            const ammontareScontato = inv.total_discount_amounts?.reduce?.((s, x) => s + (x.amount || 0), 0) || 0
            await supabase.from('discount_redemptions').insert({
              discount_code_id: cod.id,
              codice: cod.codice,
              organization_id: orgRow?.id || null,
              stripe_customer_id: inv.customer,
              stripe_subscription_id: inv.subscription || null,
              stripe_invoice_id: inv.id,
              ammontare_scontato_cents: ammontareScontato,
            })
            await supabase.rpc('increment_discount_redemption', { p_id: cod.id })
              .catch(async () => {
                // Fallback: increment manuale
                const { data: cur } = await supabase
                  .from('discount_codes').select('redemptions').eq('id', cod.id).single()
                await supabase.from('discount_codes')
                  .update({ redemptions: (cur?.redemptions || 0) + 1 })
                  .eq('id', cod.id)
              })
          }
        } catch (e) { console.error('[stripe-webhook] discount tracking', e) }
        break
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object
        const { data: org } = await supabase.from('organizations')
          .select('id').eq('stripe_customer_id', inv.customer).maybeSingle()
        if (!org) break
        await supabase.from('organizations').update({ stripe_status: 'past_due' }).eq('id', org.id)
        const { data: prof } = await supabase
          .from('profiles').select('email').eq('organization_id', org.id).limit(1).maybeSingle()
        if (prof?.email) {
          await sendEmail({
            to: prof.email,
            subject: '⚠️ Pagamento FoodOS non riuscito',
            html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px">
              <h1 style="color:#DC2626;margin:0 0 16px">Pagamento non riuscito</h1>
              <p>Il pagamento del tuo abbonamento FoodOS non è andato a buon fine. Per evitare l'interruzione del servizio aggiorna il metodo di pagamento dalle <strong>Impostazioni → Abbonamento → Gestisci</strong>.</p>
              <p>Se hai bisogno di aiuto scrivi a <a href="mailto:support@foodios.it">support@foodios.it</a>.</p>
            </div>`,
          })
        }
        break
      }

      default:
        // Altri eventi: log e ignora.
        break
    }
  } catch (err) {
    console.error('[stripe-webhook] handler error', err)
    return res.status(500).json({ error: err.message })
  }

  return res.status(200).json({ received: true })
}
