// Zucchetti enterprise webhook receiver
// POST /api/webhook-zucchetti
// Receives real-time sales data from Zucchetti Infinity/Kassa enterprise tier
// Headers: x-zucchetti-secret, x-organization-id

import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'edge' }

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Verify webhook secret
  const secret = request.headers.get('x-zucchetti-secret') || request.headers.get('authorization')?.replace('Bearer ', '')
  const expected = process.env.ZUCCHETTI_WEBHOOK_SECRET
  if (expected && secret !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'JSON non valido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const orgId = request.headers.get('x-organization-id') || body.organization_id
  if (!orgId) {
    return new Response(JSON.stringify({ error: 'x-organization-id header obbligatorio' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const vendite = Array.isArray(body.vendite) ? body.vendite : [body]
    let records = 0

    for (const v of vendite) {
      const data = v.data || v.date || new Date().toISOString().slice(0, 10)
      const dataKey = `chiusura_${data}`

      const totale = parseFloat(v.totale || v.total || v.importo || 0)
      if (!totale) continue

      const nuovaChiusura = {
        totale,
        metodo_pagamento: v.metodo_pagamento || v.payment_method || 'contante',
        reparto: v.reparto || v.department || null,
        note: 'Zucchetti webhook',
        source: 'zucchetti_webhook',
      }

      // Merge with existing chiusura for that day if present
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

    return new Response(JSON.stringify({ ok: true, records_importati: records }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    await supabase.from('sync_log').insert({
      organization_id: orgId,
      integrazione: 'zucchetti_webhook',
      stato: 'errore',
      errore: e.message,
    }).catch(() => {})

    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
