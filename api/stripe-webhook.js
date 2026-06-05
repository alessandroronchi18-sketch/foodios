// POST /api/stripe-webhook
// Stripe → server. Endpoint pubblico, autenticato tramite firma `Stripe-Signature`.
// Configura su Stripe Dashboard → Webhooks puntando a /api/stripe-webhook
// con eventi:
//   checkout.session.completed
//   customer.updated                  (sync tax_id + address per SDI)
//   customer.subscription.created
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_succeeded         (track redemption codici sconto)
//   invoice.payment_failed
//
// Aggiorna `organizations.approvato`, `.piano`, `.stripe_subscription_id`,
// `.stripe_status`, `.stripe_current_period_end`.
// Invia email transazionali (welcome / failed payment) via Resend se configurato.

export const config = { runtime: 'nodejs', api: { bodyParser: false } }

import { parseSdiCustomFields } from './lib/sdiFields.js'

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

  // Idempotenza: Stripe ritenta i webhook su risposte non-2xx/timeout. Registriamo
  // event.id; se è già presente l'evento è già stato elaborato → rispondiamo 200 e
  // ci fermiamo, evitando doppi conteggi (es. redemptions codici sconto).
  //
  // Policy errori:
  //   23505 = duplicate (atteso, è il caso happy: 200 + duplicate=true).
  //   42P01 = tabella non esiste (setup issue noto pre-migration). Fail-open
  //           per non perdere eventi durante il deploy iniziale.
  //   Altri = sospetto (permission denied, schema corrotto). Fail-CLOSED: 503
  //           così Stripe ritenta automaticamente quando lo stato è ripristinato.
  try {
    const { error: dupErr } = await supabase
      .from('stripe_webhook_events')
      .insert({ event_id: event.id, type: event.type })
    if (dupErr) {
      if (dupErr.code === '23505') {
        return res.status(200).json({ received: true, duplicate: true })
      }
      if (dupErr.code === '42P01') {
        console.warn('[stripe-webhook] idempotency table missing — proceeding (FIX: applicare migration)')
      } else {
        console.error('[stripe-webhook] idempotency check failed, returning 503 for Stripe retry', dupErr.code, dupErr.message)
        return res.status(503).json({ error: 'idempotency check failed', code: dupErr.code })
      }
    }
  } catch (e) {
    console.error('[stripe-webhook] idempotency exception, returning 503', e?.message)
    return res.status(503).json({ error: 'idempotency check exception' })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object
        const orgId = s.metadata?.organization_id
        if (!orgId) break
        // La subscription esiste già; il webhook subscription.created arriverà a breve
        // (o è già arrivato). Qui aggiorniamo customer_id per sicurezza.
        const updates = { stripe_customer_id: s.customer }

        // Codice destinatario SDI + PEC: raccolti via custom_fields del Checkout
        // (P.IVA e indirizzo arrivano invece da customer.updated). Vivono solo
        // sulla session, quindi li sincronizziamo qui su organizations.
        const sdi = parseSdiCustomFields(s.custom_fields)
        Object.assign(updates, sdi)
        if (sdi.codice_destinatario || sdi.pec) {
          updates.business_info_updated_at = new Date().toISOString()
        }

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

      case 'customer.updated': {
        // Sync dati fatturazione (tax_id + address) raccolti durante il checkout
        // su organizations. Usato per la fatturazione elettronica SDI.
        const c = event.data.object
        try {
          const { data: org } = await supabase
            .from('organizations').select('id').eq('stripe_customer_id', c.id).maybeSingle()
          if (!org) break
          const taxId = c.tax_ids?.data?.[0] || null
          // Recupera l'eventuale tax_id (per i nuovi customer Stripe non lo
          // mette in c.tax_ids ma richiede listTaxIds separato — best-effort).
          let pivaFromList = null
          try {
            const tax = await stripe.customers.listTaxIds(c.id, { limit: 1 })
            const it = (tax.data || []).find(t => t.type === 'eu_vat' || t.type === 'it_partita_iva')
            if (it) pivaFromList = it.value
          } catch { /* ignore */ }
          const addr = c.address || {}
          const patch = {
            ragione_sociale: c.name || null,
            partita_iva: pivaFromList || (taxId?.value || null),
            indirizzo: [addr.line1, addr.line2].filter(Boolean).join(', ') || null,
            cap: addr.postal_code || null,
            citta: addr.city || null,
            provincia: addr.state || null,
            nazione: addr.country || 'IT',
            business_info_updated_at: new Date().toISOString(),
          }
          // Sanitizza P.IVA italiana: rimuovi prefisso IT, valida formato.
          // Se la P.IVA non e' 11 cifre la scartiamo (null) invece di
          // salvare un valore malformato che farebbe poi fallire l'emissione
          // SDI con un errore poco diagnosticabile a valle.
          if (patch.partita_iva && patch.nazione === 'IT') {
            const cleaned = String(patch.partita_iva).replace(/^IT/i, '').replace(/[^0-9]/g, '')
            patch.partita_iva = /^[0-9]{11}$/.test(cleaned) ? cleaned : null
          }
          // Aggiorna solo i campi non null (non sovrascrivere con null)
          const filtered = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null))
          if (Object.keys(filtered).length > 1) {
            await supabase.from('organizations').update(filtered).eq('id', org.id)
          }
        } catch (e) { console.error('[stripe-webhook] customer.updated sync', e) }
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
            // Due .eq() parametrici invece di .or() con interpolazione grezza
            // (gli ID Stripe sono alfanumerici, ma evitiamo interpolazione in
            // una filter-string PostgREST). Match per coupon, fallback su promo.
            let cod = null
            {
              const { data } = await supabase
                .from('discount_codes').select('id, codice')
                .eq('stripe_coupon_id', couponId).maybeSingle()
              cod = data
            }
            if (!cod && promoCodeId) {
              const { data } = await supabase
                .from('discount_codes').select('id, codice')
                .eq('stripe_promo_code_id', promoCodeId).maybeSingle()
              cod = data
            }
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

        // Emissione fattura elettronica SDI via Fatture in Cloud (fire-and-forget).
        // Solo se configurato — senza FATTUREINCLOUD_API_TOKEN, skip silenzioso.
        if (process.env.FATTUREINCLOUD_API_TOKEN && process.env.FATTUREINCLOUD_COMPANY_ID && process.env.INTERNAL_API_SECRET) {
          try {
            const base = new URL(req.url, `https://${req.headers.host}`).origin
            // fire-and-forget, NON await: il webhook deve rispondere a Stripe entro 5s
            fetch(`${base}/api/sdi-emit-invoice`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-internal-secret': process.env.INTERNAL_API_SECRET,
              },
              body: JSON.stringify({ stripe_invoice_id: inv.id }),
            }).catch(e => console.error('[stripe-webhook] sdi-emit-invoice trigger failed', e?.message))
          } catch (e) { console.error('[stripe-webhook] sdi trigger error', e?.message) }
        }
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
