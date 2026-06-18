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

// Validazione check digit P.IVA IT (Luhn-mod-11). Una P.IVA come 00000000000
// passa la regex /^[0-9]{11}$/ ma è invalida (audit 2026-06-17 MEDIUM).
function isValidPivaIT(piva) {
  if (!/^[0-9]{11}$/.test(piva)) return false
  let sum = 0
  for (let i = 0; i < 10; i++) {
    let d = parseInt(piva[i], 10)
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  const check = (10 - (sum % 10)) % 10
  return check === parseInt(piva[10], 10)
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

  // Idempotenza claim-then-confirm:
  //   - row con processed_at NOT NULL  → event già elaborato con successo → 200 duplicate
  //   - row con processed_at NULL      → claim incompleto (crash precedente / processo
  //                                       in corso). Procediamo: l'handler è idempotente
  //                                       lato applicativo e completare la run è meglio
  //                                       che lasciare side-effects mancanti.
  //   - nessuna row                    → prima volta: upsert (claim) e procedi.
  //
  // Confermiamo (UPDATE processed_at = now()) SOLO se l'handler completa senza eccezioni.
  // Su errore non confermiamo → al retry Stripe ritrova claim NULL e riprova.
  //
  // Policy errori:
  //   42P01 = tabella non esiste (setup issue noto pre-migration). Fail-open
  //           per non perdere eventi durante il deploy iniziale.
  //   Altri errori SQL = fail-CLOSED: 503 così Stripe ritenta.
  let idempotencyAvailable = true
  try {
    const { data: existing, error: selErr } = await supabase
      .from('stripe_webhook_events')
      .select('event_id, type, processed_at')
      .eq('event_id', event.id)
      .maybeSingle()
    if (selErr) {
      if (selErr.code === '42P01') {
        idempotencyAvailable = false
        console.warn('[stripe-webhook] idempotency table missing — proceeding (FIX: applicare migration)')
      } else if (selErr.code === '42703') {
        console.warn('[stripe-webhook] processed_at column missing — applicare 20260624 migration')
        idempotencyAvailable = false
      } else {
        console.error('[stripe-webhook] idempotency select failed', selErr.code, selErr.message)
        return res.status(503).json({ error: 'idempotency check failed', code: selErr.code })
      }
    } else if (existing?.processed_at) {
      // Verifica che il type combaci: se la row registrata ha type diverso da quello
      // dell'evento ricevuto, qualcosa è andato storto (event.id collision improbabile,
      // o manipolazione DB). Logghiamo e accettiamo comunque come duplicate per non
      // ri-eseguire side-effect.
      if (existing.type && existing.type !== event.type) {
        console.warn(`[stripe-webhook] event_id ${event.id} type mismatch: stored=${existing.type} received=${event.type}`)
      }
      return res.status(200).json({ received: true, duplicate: true })
    }

    if (idempotencyAvailable) {
      // Claim: INSERT...ON CONFLICT DO NOTHING per evitare di sovrascrivere
      // accidentalmente processed_at di una row finalizzata (race tra select e claim).
      // Audit 2026-06-17: prima usava upsert senza ignoreDuplicates → in race
      // ri-apriva eventi già finalizzati (double SDI emission, ecc.).
      const { error: upErr } = await supabase
        .from('stripe_webhook_events')
        .upsert(
          { event_id: event.id, type: event.type, processed_at: null },
          { onConflict: 'event_id', ignoreDuplicates: true }
        )
      if (upErr) {
        console.error('[stripe-webhook] idempotency claim failed', upErr.code, upErr.message)
        return res.status(503).json({ error: 'idempotency claim failed', code: upErr.code })
      }
      // Ri-verifica processed_at dopo il claim: in race fra il primo select
      // (esisteva con processed_at=null) e il claim (DO NOTHING), un'altra
      // istanza potrebbe averlo finalizzato.
      const { data: post } = await supabase
        .from('stripe_webhook_events')
        .select('processed_at')
        .eq('event_id', event.id)
        .maybeSingle()
      if (post?.processed_at) {
        return res.status(200).json({ received: true, duplicate: true })
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
        // Audit 2026-06-17 HIGH: include past_due nel "attivo" per dare grace
        // period 3-7gg al cliente (Stripe lascia dunning prima del canceled).
        // unpaid e canceled escludono.
        const isAttivo = ['active', 'trialing', 'past_due'].includes(stato)
        // current_period_end: Stripe API 2024-06-20+ a volte lo espone solo su
        // items[0] anziché top-level. Cerchiamo in entrambi.
        const periodEndTs = sub.current_period_end || sub.items?.data?.[0]?.current_period_end || null
        const periodEnd = periodEndTs ? new Date(periodEndTs * 1000).toISOString() : null

        const patch = {
          stripe_subscription_id: sub.id,
          stripe_status: stato,
          stripe_current_period_end: periodEnd,
          approvato: isAttivo,
        }
        if (piano) patch.piano = piano

        if (orgId) {
          // Audit 2026-06-14 PM: cross-check metadata vs stripe_customer_id per
          // evitare account takeover via metadata tampering (chi controlla Stripe
          // API key puo' rifare la sub puntando a un'altra org). Se mismatch,
          // privilegia il customer_id reale (legato al pagamento avvenuto) e
          // logga l'incident.
          const { data: orgByCustomer } = await supabase
            .from('organizations')
            .select('id')
            .eq('stripe_customer_id', sub.customer)
            .maybeSingle()
          if (orgByCustomer && orgByCustomer.id !== orgId) {
            console.warn(`[stripe-webhook] metadata mismatch: sub.metadata.organization_id=${orgId} vs customer.org=${orgByCustomer.id}; trusting customer_id`)
            await supabase.from('error_log').insert({
              endpoint: 'stripe-webhook',
              operation: 'metadata_mismatch',
              code: 'STRIPE_METADATA_TAMPER',
              message: `sub ${sub.id}: metadata.org=${orgId} != customer.org=${orgByCustomer.id}`,
              org_id: orgByCustomer.id,
            }).catch(() => {})
            // Audit 2026-07-01 HIGH: oltre a sincronizzare verso l'org reale,
            // forziamo Stripe a ritentare (alert su mismatch) ritornando 500.
            // Cosi' processed_at NON viene marcato e gli admin vedono l'incident
            // ripetersi finche' qualcuno non interviene manualmente.
            await supabase.from('organizations').update(patch).eq('id', orgByCustomer.id)
            return res.status(500).json({ error: 'metadata_mismatch — admin alert' })
          } else {
            await supabase.from('organizations').update(patch).eq('id', orgId)
          }
        } else {
          // Fallback: trova org via customer_id (no metadata setto da checkout)
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
          // Recupera l'eventuale tax_id SOLO se non già in c.tax_ids (audit
          // 2026-06-17 MEDIUM: prima chiamava listTaxIds anche quando taxId era
          // disponibile, sprecando rate limit Stripe).
          let pivaFromList = null
          if (!taxId) {
            try {
              const tax = await stripe.customers.listTaxIds(c.id, { limit: 1 })
              const it = (tax.data || []).find(t => t.type === 'eu_vat' || t.type === 'it_partita_iva')
              if (it) pivaFromList = it.value
            } catch { /* ignore */ }
          }
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
          // Sanitizza P.IVA italiana: rimuovi prefisso IT, valida formato +
          // verifica check digit Luhn-mod-11 (audit 2026-06-17 MEDIUM).
          // Una P.IVA tipo 00000000000 passa la regex ma è invalida; meglio
          // scartarla qui piuttosto che far fallire SDI a valle con errore criptico.
          if (patch.partita_iva && patch.nazione === 'IT') {
            const cleaned = String(patch.partita_iva).replace(/^IT/i, '').replace(/[^0-9]/g, '')
            if (/^[0-9]{11}$/.test(cleaned) && isValidPivaIT(cleaned)) {
              patch.partita_iva = cleaned
            } else {
              patch.partita_iva = null
            }
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

        // Emissione fattura elettronica SDI: accodata su sdi_emission_queue.
        // Una funzione cron schedulata processa la coda. Pattern queue-first per
        // evitare il fire-and-forget fetch che su serverless veniva troncato
        // (audit 2026-06-17 HIGH).
        if (process.env.FATTUREINCLOUD_API_TOKEN && process.env.FATTUREINCLOUD_COMPANY_ID) {
          try {
            await supabase.from('sdi_emission_queue').insert({
              stripe_invoice_id: inv.id,
              status: 'pending',
            })
          } catch (e) {
            // Tabella forse non ancora migrata: log e fallback su trigger sincrono.
            console.warn('[stripe-webhook] sdi_emission_queue insert failed, falling back to sync emit', e?.message)
            if (process.env.INTERNAL_API_SECRET && process.env.PUBLIC_BASE_URL) {
              try {
                // Await: paghiamo latenza ma garantiamo che la richiesta parta.
                // Se SDI fallisce, ritorniamo comunque 200 a Stripe e ripiombiamo
                // sulla queue alla prossima fattura.
                await fetch(`${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/sdi-emit-invoice`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-internal-secret': process.env.INTERNAL_API_SECRET,
                  },
                  body: JSON.stringify({ stripe_invoice_id: inv.id }),
                })
              } catch (fe) {
                console.error('[stripe-webhook] sdi sync fallback failed', fe?.message)
              }
            }
          }
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
    // NON segnamo processed_at: al retry Stripe ritrova claim NULL e ritenta.
    return res.status(500).json({ error: err.message })
  }

  // Conferma idempotency: l'handler è completato senza eccezioni.
  if (idempotencyAvailable) {
    const { error: confirmErr } = await supabase
      .from('stripe_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', event.id)
    if (confirmErr) {
      // L'handler ha già applicato le side-effects. Il fail della UPDATE significa
      // che al prossimo retry Stripe rifarà tutto — affidiamoci alla idempotency
      // applicativa delle singole side-effects (organizations.update by id è
      // idempotente; redemption codici ha unique constraint; SDI ha claim-first).
      console.warn('[stripe-webhook] confirm update failed (retry possible)', confirmErr.code, confirmErr.message)
    }
  }

  return res.status(200).json({ received: true })
}
