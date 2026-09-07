// Codici sconto del pannello admin: creazione, disattivazione, eliminazione
// e applicazione manuale a un cliente.
//
// Estratti da api/admin.js. Coordinano la tabella codici_sconto con i coupon
// veri su Stripe, quindi e' l'area dove una modifica sbagliata si vede subito
// in fattura: tenerla in un file suo la rende leggibile per intero senza
// scorrere tremila righe.

import { sanitize } from '../validate.js'
import { getStripe } from './stripeClient.js'

// ─── CODICI SCONTO ─────────────────────────────────────────────────────────
// Wrappa Stripe Coupons + Promotion Codes e mantiene una copia in
// `discount_codes` per audit/UI. La verifica reale al checkout è di Stripe
// (allow_promotion_codes già attivo lato session create).


export async function getCodiciSconto(supabase) {
  const { data, error } = await supabase
    .from('discount_codes')
    .select('*')
    .order('creato_il', { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return data || []
}

export function normalizzaCodice(c) {
  return (c || '').toString().trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
}

export async function creaCodiceSconto(supabase, body, adminEmail) {
  const codice = normalizzaCodice(body.codice)
  if (codice.length < 3 || codice.length > 30) throw new Error('Codice: 3-30 caratteri alfanumerici')

  const descrizione = sanitize(body.descrizione || '', 200)
  const tipoSconto = body.tipo_sconto === 'amount' ? 'amount' : 'percent'
  const valore = parseInt(body.valore_sconto, 10)
  if (!Number.isFinite(valore) || valore <= 0) throw new Error('Valore sconto non valido')
  if (tipoSconto === 'percent' && valore > 100) throw new Error('Percentuale massima: 100')
  if (tipoSconto === 'amount' && valore > 1_000_000) throw new Error('Sconto fisso troppo alto')

  const durata = ['once', 'repeating', 'forever'].includes(body.durata) ? body.durata : 'once'
  const durataMesi = durata === 'repeating'
    ? Math.max(1, Math.min(60, parseInt(body.durata_mesi, 10) || 1))
    : null

  const maxRedemptions = body.max_redemptions != null && body.max_redemptions !== ''
    ? Math.max(1, Math.min(100000, parseInt(body.max_redemptions, 10) || 1))
    : null

  let scadeIl = null
  if (body.scade_il) {
    const d = new Date(body.scade_il)
    if (!isNaN(d.getTime()) && d > new Date()) scadeIl = d.toISOString()
  }

  // Verifica unicità
  const { data: esiste } = await supabase
    .from('discount_codes').select('id').eq('codice', codice).maybeSingle()
  if (esiste) throw new Error(`Codice "${codice}" già esistente`)

  const stripe = await getStripe()

  // 1. Crea Coupon Stripe
  const couponPayload = { name: codice, metadata: { creato_da: adminEmail, descrizione } }
  if (tipoSconto === 'percent') couponPayload.percent_off = valore
  else { couponPayload.amount_off = valore; couponPayload.currency = 'eur' }
  couponPayload.duration = durata
  if (durata === 'repeating') couponPayload.duration_in_months = durataMesi
  if (maxRedemptions) couponPayload.max_redemptions = maxRedemptions
  if (scadeIl) couponPayload.redeem_by = Math.floor(new Date(scadeIl).getTime() / 1000)

  const coupon = await stripe.coupons.create(couponPayload)

  // 2. Crea Promotion Code (alias leggibile)
  const promoPayload = {
    coupon: coupon.id,
    code: codice,
    active: true,
    metadata: { creato_da: adminEmail, descrizione },
  }
  if (maxRedemptions) promoPayload.max_redemptions = maxRedemptions
  if (scadeIl) promoPayload.expires_at = Math.floor(new Date(scadeIl).getTime() / 1000)

  const promo = await stripe.promotionCodes.create(promoPayload)

  // 3. Salva localmente
  const { data: row, error } = await supabase.from('discount_codes').insert({
    codice,
    descrizione: descrizione || null,
    stripe_coupon_id: coupon.id,
    stripe_promo_code_id: promo.id,
    tipo_sconto: tipoSconto,
    valore_sconto: valore,
    durata,
    durata_mesi: durataMesi,
    max_redemptions: maxRedemptions,
    scade_il: scadeIl,
    piani_validi: Array.isArray(body.piani_validi) && body.piani_validi.length > 0
      ? body.piani_validi.filter(p => ['pro', 'chain'].includes(p))
      : null,
    creato_da: adminEmail,
    attivo: true,
  }).select().single()
  if (error) throw new Error(error.message)

  return row
}

export async function disattivaCodiceSconto(supabase, codiceId) {
  const { data: row } = await supabase
    .from('discount_codes').select('*').eq('id', codiceId).single()
  if (!row) throw new Error('Codice non trovato')

  if (row.stripe_promo_code_id) {
    try {
      const stripe = await getStripe()
      await stripe.promotionCodes.update(row.stripe_promo_code_id, { active: false })
    } catch (e) { /* idempotent: il codice in Stripe potrebbe essere già inattivo */ }
  }

  const { error } = await supabase.from('discount_codes')
    .update({ attivo: false, disattivato_il: new Date().toISOString() })
    .eq('id', codiceId)
  if (error) throw new Error(error.message)
}

export async function eliminaCodiceSconto(supabase, codiceId) {
  const { data: row } = await supabase
    .from('discount_codes').select('*').eq('id', codiceId).single()
  if (!row) throw new Error('Codice non trovato')

  // Su Stripe non possiamo eliminare un coupon con redemptions: disattiviamo soltanto.
  if (row.stripe_promo_code_id) {
    try {
      const stripe = await getStripe()
      await stripe.promotionCodes.update(row.stripe_promo_code_id, { active: false })
    } catch (e) { /* ignore */ }
  }
  if (row.stripe_coupon_id && row.redemptions === 0) {
    try {
      const stripe = await getStripe()
      await stripe.coupons.del(row.stripe_coupon_id)
    } catch (e) { /* ignore */ }
  }

  const { error } = await supabase.from('discount_codes').delete().eq('id', codiceId)
  if (error) throw new Error(error.message)
}

export async function applicaCodiceManuale(supabase, orgId, codice, mesi) {
  // Applicazione manuale dell'admin: regala N mesi gratis a un'organizzazione
  // estendendo direttamente la subscription Stripe via "trial_end" o "discount" inline.
  const codNorm = normalizzaCodice(codice)
  if (codNorm) {
    const { data: cod } = await supabase.from('discount_codes').select('*').eq('codice', codNorm).maybeSingle()
    if (!cod || !cod.attivo) throw new Error('Codice non valido o disattivato')
  }
  const nMesi = Math.max(1, Math.min(60, parseInt(mesi, 10) || 1))

  const { data: org } = await supabase
    .from('organizations').select('id, stripe_subscription_id, trial_ends_at').eq('id', orgId).single()
  if (!org) throw new Error('Organization non trovata')

  if (org.stripe_subscription_id) {
    const stripe = await getStripe()
    const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id)
    const oraSec = Math.floor(Date.now() / 1000)
    const baseSec = (sub.trial_end && sub.trial_end > oraSec) ? sub.trial_end : oraSec
    const newTrialEnd = baseSec + nMesi * 30 * 86400
    await stripe.subscriptions.update(org.stripe_subscription_id, {
      trial_end: newTrialEnd,
      proration_behavior: 'none',
    })
  } else {
    // Org senza sub Stripe: estende il trial interno
    const base = org.trial_ends_at && new Date(org.trial_ends_at) > new Date()
      ? new Date(org.trial_ends_at)
      : new Date()
    const nuovo = new Date(base.getTime() + nMesi * 30 * 86400 * 1000)
    await supabase.from('organizations').update({
      trial_ends_at: nuovo.toISOString(),
    }).eq('id', orgId)
  }

  await supabase.from('discount_redemptions').insert({
    codice: codNorm || `ADMIN_GIFT_${nMesi}M`,
    organization_id: orgId,
  })
  return { mesi: nMesi }
}
