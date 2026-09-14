// Zucchetti enterprise webhook receiver
// POST /api/webhook-zucchetti
// Receives real-time sales data from Zucchetti Infinity/Kassa enterprise tier
// Headers: x-webhook-token (o x-zucchetti-secret, o Authorization: Bearer ...)
//
// L'organizzazione si deduce dalla chiave, non dall'intestazione
// `x-organization-id`: prima la chiave era una sola per tutti i clienti
// Zucchetti e l'attività arrivava in chiaro, quindi chi aveva quella chiave
// poteva scrivere chiusure cassa a chiunque. Vedi api/lib/webhookToken.js.

export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, getClientIP } from './lib/cors.js'
import { sanitizeStrict, validateUUID } from './lib/validate.js'
import { safeError } from './lib/safeError.js'
import { leggiToken, risolviToken, segnaUso, organizzazioneAttiva } from './lib/webhookToken.js'

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return handleOptions(request)
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(request) },
    })
  }

  const ip = getClientIP(request)
  const supabase = await getSupabase()

  // Rate limit: 60 req/min per IP (webhook may batch)
  const rl = await checkRateLimit(supabase, `webhook-zucchetti:${ip}`, 60, 60)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  // La chiave del cliente, e da lì l'organizzazione (fail-closed).
  const auth = await risolviToken(supabase, leggiToken(request), 'zucchetti')
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const orgId = auth.organizationId

  let body
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'JSON non valido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Se la cassa dichiara comunque un'organizzazione, deve essere la sua:
  // serve ad accorgersi di una cassa configurata con la chiave sbagliata,
  // non a concedere niente in più.
  const dichiarata = sanitizeStrict(request.headers.get('x-organization-id') || body.organization_id || '', 36)
  if (dichiarata && validateUUID(dichiarata) && dichiarata !== orgId) {
    return new Response(JSON.stringify({ error: 'La chiave non appartiene a questa organizzazione' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    })
  }

  const org = await organizzazioneAttiva(supabase, orgId)
  if (!org.ok) {
    return new Response(JSON.stringify({ error: org.errore }), {
      status: org.stato, headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const vendite = Array.isArray(body.vendite) ? body.vendite : [body]
    // Cap payload size
    const batch = vendite.slice(0, 500)
    let records = 0

    for (const v of batch) {
      const data = sanitizeStrict(v.data || v.date || '', 10) || new Date().toISOString().slice(0, 10)
      const dataKey = `chiusura_${data}`

      const totale = parseFloat(v.totale || v.total || v.importo || 0)
      if (!totale || totale < 0 || totale > 1_000_000) continue

      const nuovaChiusura = {
        totale,
        metodo_pagamento: sanitizeStrict(v.metodo_pagamento || v.payment_method || 'contante', 50),
        reparto: v.reparto ? sanitizeStrict(v.reparto, 100) : null,
        note: 'Zucchetti webhook',
        source: 'zucchetti_webhook',
      }

      const { data: existing } = await supabase
        .from('user_data')
        .select('id, data_value')
        .eq('organization_id', orgId)
        .eq('data_key', dataKey)
        .maybeSingle()

      if (existing) {
        const prev = existing.data_value || {}
        await supabase.from('user_data')
          .update({ data_value: { ...prev, totale: (prev.totale || 0) + totale, source: 'zucchetti_webhook' } })
          .eq('id', existing.id)
      } else {
        await supabase.from('user_data').insert({
          organization_id: orgId,
          data_key: dataKey,
          data_value: nuovaChiusura,
        })
      }
      records++
    }

    await supabase.from('sync_log').insert({
      organization_id: orgId,
      integrazione: 'zucchetti_webhook',
      stato: 'ok',
      records_importati: records,
    })

    await segnaUso(supabase, auth.tokenId)

    return new Response(JSON.stringify({ ok: true, records_importati: records }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(request) },
    })
  } catch (e) {
    await supabase.from('sync_log').insert({
      organization_id: orgId,
      integrazione: 'zucchetti_webhook',
      stato: 'errore',
      errore: (e?.message || '').slice(0, 200),
    }).catch(() => {})

    const safe = safeError(e, { endpoint: 'webhook-zucchetti', orgId })
    return new Response(JSON.stringify(safe.body), {
      status: safe.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
