// POST /api/sdi-emit-invoice
//
// Emette una fattura elettronica al Sistema di Interscambio (SDI) via Fatture
// in Cloud per il cliente associato a una Stripe invoice pagata.
//
// Triggerato da:
//   1. Webhook Stripe `invoice.payment_succeeded` (fire-and-forget, async)
//   2. Chiamata manuale admin (per re-emit / debug)
//
// Body (POST):
//   { stripe_invoice_id: "in_..." }  → carica i dati da Stripe + org DB
//   { organization_id: "uuid", importo_netto: 89.00, ... }  → manual mode (admin)
//
// Auth:
//   - Internal: header `x-internal-secret` con INTERNAL_API_SECRET (chiamato da webhook)
//   - Admin: Bearer token + ADMIN_EMAIL (per re-emit manuale)
//
// Env vars richieste:
//   FATTUREINCLOUD_API_TOKEN
//   FATTUREINCLOUD_COMPANY_ID
//   INTERNAL_API_SECRET (per chiamate webhook)
//
// Idempotenza:
//   Salviamo `sdi_invoice_log` per (stripe_invoice_id, ric_organization_id) — se
//   gia' emessa, no-op + ritorna l'id Fatture in Cloud preesistente.

export const config = { runtime: 'nodejs' }

import { verificaAdmin } from './lib/auth.js'
import { verifyRawSecret } from './lib/cryptoCompare.js'
import { safeError } from './lib/safeError.js'
import {
  loadSdiProvider,
  isSdiProviderConfigured,
  activeSdiProviderId,
  activeSdiProviderRequiredEnv,
} from './lib/sdiProvider.js'

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

// Cap di sicurezza sul body: il payload e' solo JSON con poche chiavi (orgId,
// stripeInvoiceId, importoNetto, ecc). Senza limite, un client malizioso con
// internal-secret puo' streamare GB esaurendo memoria edge.
const MAX_BODY_BYTES = 64 * 1024 // 64KB
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    let size = 0
    let aborted = false
    req.on('data', c => {
      if (aborted) return
      size += c.length
      if (size > MAX_BODY_BYTES) {
        aborted = true
        try { req.destroy() } catch {}
        return reject(new Error(`body too large (>${MAX_BODY_BYTES} bytes)`))
      }
      raw += c
    })
    req.on('end', () => {
      if (aborted) return
      try { resolve(raw ? JSON.parse(raw) : {}) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!isSdiProviderConfigured()) {
    return res.status(503).json({
      error: `Provider SDI '${activeSdiProviderId()}' non configurato`,
      missing: activeSdiProviderRequiredEnv().filter(k => !process.env[k]),
    })
  }
  const sdi = await loadSdiProvider()
  const { upsertCliente, emettiFatturaElettronica } = sdi

  // Auth: o internal-secret (chiamata da webhook), o admin Bearer.
  const internalCheck = verifyRawSecret(req.headers['x-internal-secret'] || '', process.env.INTERNAL_API_SECRET)
  const isInternal = internalCheck.ok
  const supabase = await getSupabase()
  let adminUser = null
  if (!isInternal) {
    const tokenReq = { headers: { get: (k) => req.headers[k.toLowerCase()] || req.headers[k] } }
    const adminCheck = await verificaAdmin(tokenReq, supabase)
    if (!adminCheck.user) return res.status(403).json({ error: 'Accesso negato (richiesto admin o internal-secret)' })
    adminUser = adminCheck.user
  }

  let body
  try { body = await readBody(req) } catch { return res.status(400).json({ error: 'JSON non valido' }) }

  const stripeInvoiceId = (body.stripe_invoice_id || '').toString().trim()
  let orgId = (body.organization_id || '').toString().trim()
  let importoNetto = Number(body.importo_netto || 0)
  let pianoLabel = (body.piano || '').toString().trim()
  // Aliquota IVA dinamica: derivata da inv.total_tax_amounts[].tax_rate se
  // Stripe Tax attivo, altrimenti default 22 (audit 2026-06-17 HIGH).
  let aliquotaIvaPct = Number(body.aliquota_iva || 22)

  // Modalita' 1: chiamata da webhook con solo stripe_invoice_id
  // → carica dati invoice da Stripe + risali a organization
  if (stripeInvoiceId && !orgId) {
    try {
      const { default: Stripe } = await import('stripe')
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
      const inv = await stripe.invoices.retrieve(stripeInvoiceId)
      const cust = await stripe.customers.retrieve(inv.customer)
      orgId = cust?.metadata?.organization_id || null
      if (!orgId) {
        const { data: org } = await supabase
          .from('organizations').select('id').eq('stripe_customer_id', inv.customer).maybeSingle()
        orgId = org?.id || null
      }
      // Calcolo netto: preferire subtotal_excluding_tax (presente solo con Stripe Tax
      // attivo). Se non c'è, dedurre dal totale: con Stripe Tax disattivato il prezzo
      // Stripe è inclusivo IVA → netto = total / (1 + IVA).
      const subtotalExcl = Number.isFinite(inv.subtotal_excluding_tax) ? inv.subtotal_excluding_tax : null
      const taxAmount = Number.isFinite(inv.tax) ? inv.tax : null
      // Aliquota IVA dall'invoice se presente; altrimenti 22 default.
      try {
        const rateFromInvoice = inv.total_tax_amounts?.[0]?.tax_rate
        if (rateFromInvoice) {
          const rate = typeof rateFromInvoice === 'string'
            ? await stripe.taxRates.retrieve(rateFromInvoice)
            : rateFromInvoice
          if (Number.isFinite(rate?.percentage)) aliquotaIvaPct = Number(rate.percentage)
        }
      } catch { /* keep default 22 */ }
      if (subtotalExcl != null) {
        importoNetto = subtotalExcl / 100
      } else if (taxAmount != null && taxAmount > 0) {
        importoNetto = (inv.amount_paid - taxAmount) / 100
      } else {
        // Nessun dato IVA da Stripe: assumi prezzo IVA-inclusiva (setup tipico non-Tax).
        importoNetto = (inv.amount_paid / 100) / (1 + aliquotaIvaPct / 100)
      }
      pianoLabel = inv.lines?.data?.[0]?.description || 'Abbonamento FoodOS'
    } catch (e) {
      return res.status(400).json({ error: `Stripe lookup fallito: ${e.message}` })
    }
  }

  if (!orgId) return res.status(400).json({ error: 'organization_id mancante (o non risolvibile da stripe_invoice_id)' })
  if (!Number.isFinite(importoNetto) || importoNetto <= 0) {
    return res.status(400).json({ error: 'importo_netto invalido (atteso > 0)' })
  }

  // Carica dati fatturazione dall'org
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, nome, ragione_sociale, partita_iva, codice_fiscale, codice_destinatario, pec, indirizzo, cap, citta, provincia, nazione')
    .eq('id', orgId).single()
  if (orgErr || !org) return res.status(404).json({ error: 'Organization non trovata' })

  // Verifica dati fatturazione minimi
  const ragione = org.ragione_sociale || org.nome
  const piva = (org.partita_iva || '').trim()
  if (!ragione || !piva) {
    return res.status(422).json({
      error: 'Dati fatturazione cliente incompleti',
      missing: { ragione_sociale: !ragione, partita_iva: !piva },
      hint: 'Il cliente non ha completato i dati fiscali durante il checkout Stripe',
    })
  }

  // Idempotency claim-first (race-free): inserisce una riga 'pending' con chiave
  // UNICA PRIMA di emettere. Chi vince l'insert emette; gli altri trovano la
  // riga e fanno no-op. Evita la doppia fattura SDI anche sotto retry concorrenti
  // del webhook (a differenza del vecchio check-then-emit) e copre il manual emit.
  const idempotencyKey = (body.idempotency_key || '').toString().trim() ||
    (stripeInvoiceId
      ? `stripe:${stripeInvoiceId}`
      : `manual:${orgId}:${Math.round(importoNetto * 100)}:${new Date().toISOString().slice(0, 7)}`)

  // Soglia "stale": un claim pending oltre questa eta' indica un crash della
  // function precedente (OOM, timeout, redeploy). 15 minuti e' il limite Vercel
  // funziona + margine per FiC; oltre, e' sicuro reclaimare.
  const STALE_CLAIM_MS = 15 * 60 * 1000
  const staleCutoff = new Date(Date.now() - STALE_CLAIM_MS).toISOString()

  let claimId = null
  try {
    const { data: claim } = await supabase
      .from('sdi_invoice_log')
      .upsert({
        organization_id: orgId,
        stripe_invoice_id: stripeInvoiceId || null,
        idempotency_key: idempotencyKey,
        importo_netto_cents: Math.round(importoNetto * 100),
        status: 'pending',
        emessa_da: adminUser?.email || 'webhook',
      }, { onConflict: 'idempotency_key', ignoreDuplicates: true })
      .select('id')
      .maybeSingle()

    if (!claim) {
      // Chiave gia presente: emissione fatta, in corso o crashata.
      const { data: existingLog } = await supabase
        .from('sdi_invoice_log')
        .select('id, fic_invoice_id, status, created_at, updated_at')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      if (existingLog?.fic_invoice_id) {
        return res.status(200).json({
          already_emitted: true,
          fic_invoice_id: existingLog.fic_invoice_id,
          status: existingLog.status,
        })
      }
      // Reclaim di pending stale (crash precedente). Confrontiamo updated_at
      // (più recente di created_at se qualcosa l'ha toccato) con la soglia.
      const lastTouch = existingLog?.updated_at || existingLog?.created_at
      const isStale = existingLog?.status === 'pending' && lastTouch && lastTouch < staleCutoff
      if (isStale) {
        // Conditional delete: solo se la row e' ANCORA stale e con lo stesso id
        // (race-safe: due processi paralleli, solo uno vince la delete).
        const { data: deleted } = await supabase
          .from('sdi_invoice_log')
          .delete()
          .eq('id', existingLog.id)
          .eq('status', 'pending')
          .lt('updated_at', staleCutoff)
          .select('id')
          .maybeSingle()
        if (deleted) {
          // Riprova il claim ora che lo stale e' rimosso.
          const { data: retryClaim } = await supabase
            .from('sdi_invoice_log')
            .upsert({
              organization_id: orgId,
              stripe_invoice_id: stripeInvoiceId || null,
              idempotency_key: idempotencyKey,
              importo_netto_cents: Math.round(importoNetto * 100),
              status: 'pending',
              emessa_da: adminUser?.email || 'webhook',
            }, { onConflict: 'idempotency_key', ignoreDuplicates: true })
            .select('id')
            .maybeSingle()
          if (retryClaim) {
            claimId = retryClaim.id
            console.warn('[sdi-emit-invoice] reclaim of stale pending', { idempotencyKey, prevId: existingLog.id })
          }
        }
        // Se la delete non e' andata (un altro processo ha vinto) cadiamo nel 409 sotto.
      }
      if (!claimId) {
        return res.status(409).json({
          error: 'Emissione gia in corso per questa fattura, riprova tra poco',
          status: existingLog?.status || 'pending',
        })
      }
    } else {
      claimId = claim.id
    }
  } catch (e) {
    // Senza claim non possiamo garantire l'idempotenza: fail-closed (meglio non
    // emettere che rischiare la doppia fattura). Richiede la migration 20260617.
    const safe = safeError(e, { endpoint: 'sdi-emit-invoice', op: 'idempotencyClaim', orgId }, 503, supabase)
    return res.status(safe.status).json(safe.body)
  }

  // Rilascia il claim se l'emissione fallisce, così un retry puo' riprovare.
  const rilasciaClaim = async () => {
    try { await supabase.from('sdi_invoice_log').delete().eq('id', claimId) } catch { /* best-effort */ }
  }

  // 1. Upsert cliente su FiC
  let cliente
  try {
    cliente = await upsertCliente({
      ragioneSociale: ragione,
      partitaIva: piva,
      codiceFiscale: org.codice_fiscale,
      indirizzo: org.indirizzo,
      cap: org.cap,
      citta: org.citta,
      provincia: org.provincia,
      nazione: org.nazione || 'IT',
      codiceDestinatario: org.codice_destinatario,
      pec: org.pec,
    })
  } catch (e) {
    await rilasciaClaim()
    const safe = safeError(e, { endpoint: 'sdi-emit-invoice', op: 'upsertCliente', orgId }, 500, supabase)
    return res.status(safe.status).json(safe.body)
  }

  // 2. Emetti fattura
  let invoice
  try {
    invoice = await emettiFatturaElettronica({
      clienteId: cliente.id,
      data: new Date().toISOString().slice(0, 10),
      scadenza: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      oggetto: pianoLabel || `Abbonamento FoodOS — ${ragione}`,
      importoNetto,
      aliquotaIva: aliquotaIvaPct,
      transmit: true,
      stripeInvoiceId,
    })
  } catch (e) {
    await rilasciaClaim()
    const safe = safeError(e, { endpoint: 'sdi-emit-invoice', op: 'emettiFattura', orgId, importoNetto }, 500, supabase)
    return res.status(safe.status).json(safe.body)
  }

  // 3. Completa il claim con i dati della fattura emessa (pending → emessa).
  try {
    await supabase.from('sdi_invoice_log').update({
      fic_invoice_id: invoice.id,
      fic_cliente_id: cliente.id,
      status: 'emessa',
      updated_at: new Date().toISOString(),
    }).eq('id', claimId)
  } catch (e) {
    console.error('[sdi-emit-invoice] claim update failed', e.message)
  }

  return res.status(200).json({
    ok: true,
    fic_invoice_id: invoice.id,
    fic_cliente_id: cliente.id,
    cliente_creato: cliente.isNew,
    importo_netto: importoNetto,
  })
}
