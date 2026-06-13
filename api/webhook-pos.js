// Universal POS Webhook receiver
// POST /api/webhook-pos
//
// Riceve dati real-time da QUALSIASI cassa che sa fare POST HTTP.
// Generalizza il pattern di webhook-zucchetti.js per supportare piu provider.
//
// Headers richiesti:
//   x-pos-provider:   id del provider (es. 'tilby', 'cassainCloud', 'rch',
//                     'olivetti', 'custom', 'salvi', 'indaco', 'polotouch',
//                     'ekopos', 'wolf', 'zucchetti')
//   x-pos-secret:     shared secret per autenticare (env vars per provider)
//   x-organization-id: UUID org FoodOS
//
// Body JSON (formato universale):
//   {
//     "data": "YYYY-MM-DD",       // data scontrino
//     "ora": "HH:MM:SS",          // opzionale
//     "numero_scontrino": "...",  // opzionale ma utile per dedup
//     "totale_lordo": 12.50,      // EUR, sempre presente
//     "iva": 1.13,                // EUR, opzionale
//     "metodo_pagamento": "...",  // opzionale (CONTANTI/CARTA/SATISPAY/etc)
//     "sede_id": "uuid",          // opzionale, riferimento sede FoodOS
//     "righe": [                  // opzionale ma valorizzato se possibile
//       { "prodotto": "Cannolo", "quantita": 2, "prezzo": 3.50, "totale": 7.00, "iva_pct": 10 },
//       ...
//     ]
//   }
//
// Output JSON:
//   200 { ok: true, scontrino_id: "uuid" }
//   401 { error: 'Unauthorized' }
//   409 { error: 'Already imported', scontrino_id }   (idempotency)
//   422 { error: '...' }

export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, getClientIP } from './lib/cors.js'
import { sanitizeStrict, validateUUID } from './lib/validate.js'
import { verifyRawSecret } from './lib/cryptoCompare.js'

// Mapping provider → env var secret. Aggiungere qui nuovi provider.
// Pattern env var: POS_<PROVIDER>_SECRET (es. POS_TILBY_SECRET).
const PROVIDER_SECRET_ENV = {
  tilby:        'POS_TILBY_SECRET',
  cassainCloud: 'POS_CASSAINCLOUD_SECRET',
  rch:          'POS_RCH_SECRET',
  olivetti:     'POS_OLIVETTI_SECRET',
  custom:       'POS_CUSTOM_SECRET',
  salvi:        'POS_SALVI_SECRET',
  indaco:       'POS_INDACO_SECRET',
  polotouch:    'POS_POLOTOUCH_SECRET',
  ekopos:       'POS_EKOPOS_SECRET',
  wolf:         'POS_WOLF_SECRET',
  zucchetti:    'ZUCCHETTI_WEBHOOK_SECRET',  // alias storico
}

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

function jsonResponse(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
  })
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const ip = getClientIP(req)
  const supabase = await getSupabase()

  // Rate limit per provider+ip (60 req/min default; raise for high-volume POS)
  const rl = await checkRateLimit(supabase, `webhook-pos:${ip}`, 120, 60)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  // Provider discrimination
  const provider = sanitizeStrict(req.headers.get('x-pos-provider') || '', 32).toLowerCase()
  if (!provider || !PROVIDER_SECRET_ENV[provider]) {
    return jsonResponse(req, { error: 'x-pos-provider non valido o mancante' }, 400)
  }

  // Secret verification (fail-closed)
  const expectedSecret = process.env[PROVIDER_SECRET_ENV[provider]]
  if (!expectedSecret) {
    return jsonResponse(req, { error: `Provider ${provider} non configurato sul server` }, 503)
  }
  const provided = req.headers.get('x-pos-secret')
    || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const check = verifyRawSecret(provided, expectedSecret)
  if (!check.ok) return jsonResponse(req, { error: 'Unauthorized' }, 401)

  // Body parsing
  let body
  try { body = await req.json() } catch { return jsonResponse(req, { error: 'JSON non valido' }, 400) }

  // Organization
  const rawOrgId = req.headers.get('x-organization-id') || body.organization_id
  const orgId = sanitizeStrict(rawOrgId || '', 36)
  if (!orgId || !validateUUID(orgId)) {
    return jsonResponse(req, { error: 'x-organization-id non valido' }, 400)
  }

  // Required fields
  const data = sanitizeStrict(body.data || body.date || '', 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return jsonResponse(req, { error: 'data richiesta (YYYY-MM-DD)' }, 400)
  }
  const totaleLordo = Number(body.totale_lordo || body.totale || body.amount || 0)
  if (!Number.isFinite(totaleLordo) || totaleLordo <= 0 || totaleLordo > 100000) {
    return jsonResponse(req, { error: 'totale_lordo invalido (0-100000)' }, 422)
  }

  // Sede opzionale
  const sedeId = body.sede_id && validateUUID(body.sede_id) ? body.sede_id : null

  // Idempotency: se ricevo lo stesso numero_scontrino per stesso provider/org
  // nello stesso giorno, ritorno il record esistente.
  const numeroScontrino = sanitizeStrict(body.numero_scontrino || '', 64) || null
  let existing = null
  if (numeroScontrino) {
    const { data: prev } = await supabase
      .from('pos_scontrini')
      .select('id')
      .eq('organization_id', orgId)
      .eq('provider', provider)
      .eq('data', data)
      .eq('numero_scontrino', numeroScontrino)
      .maybeSingle()
    if (prev) {
      return jsonResponse(req, { error: 'Already imported', scontrino_id: prev.id }, 409)
    }
  }

  // Insert scontrino
  const row = {
    organization_id: orgId,
    sede_id:         sedeId,
    provider,
    data,
    ora:             sanitizeStrict(body.ora || '', 8) || null,
    numero_scontrino: numeroScontrino,
    totale_lordo:    Math.round(totaleLordo * 100) / 100,
    iva:             Number(body.iva || 0) || 0,
    metodo_pagamento: sanitizeStrict(body.metodo_pagamento || '', 32) || null,
    righe:           Array.isArray(body.righe) ? body.righe.slice(0, 100) : [],
    received_at:     new Date().toISOString(),
  }

  const { data: inserted, error } = await supabase
    .from('pos_scontrini')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    return jsonResponse(req, { error: 'DB error: ' + error.message }, 500)
  }

  return jsonResponse(req, { ok: true, scontrino_id: inserted.id, provider }, 200)
}
