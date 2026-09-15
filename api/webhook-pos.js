// Universal POS Webhook receiver
// POST /api/webhook-pos
//
// Riceve dati real-time da QUALSIASI cassa che sa fare POST HTTP.
//
// Headers richiesti:
//   x-pos-provider:   id del provider in minuscolo (es. 'tilby',
//                     'cassaincloud', 'rch',
//                     'olivetti', 'custom', 'salvi', 'indaco', 'polotouch',
//                     'ekopos', 'wolf', 'zucchetti')
//   x-webhook-token:  la chiave del cliente, generata dalla pagina Integrazioni
//                     (accettata anche come `x-pos-secret` o
//                     `Authorization: Bearer ...`, per i registratori già
//                     configurati con quei nomi)
//
// L'organizzazione NON si dichiara: si deduce dalla chiave. Fino al 14/09/2026
// esisteva una parola d'ordine per marca di cassa e l'attività arrivava
// nell'intestazione `x-organization-id`, quindi chi aveva la parola d'ordine di
// una marca poteva scrivere incassi nella cassa di chiunque. Adesso ogni
// cliente ha la sua chiave e la chiave dice da sola a chi appartiene;
// `x-organization-id`, se mandato, viene solo confrontato.
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
import { leggiToken, risolviToken, segnaUso, organizzazioneAttiva } from './lib/webhookToken.js'

// Marche di cassa accettate. Aggiungere qui quando se ne collega una nuova:
// non c'è più un segreto per marca da configurare sul server, la chiave la
// genera il cliente dalla pagina Integrazioni.
export const PROVIDER_VALIDI = [
  'tilby',
  'cassaincloud',
  'rch',
  'olivetti',
  'custom',
  'salvi',
  'indaco',
  'polotouch',
  'ekopos',
  'wolf',
  'zucchetti',
]

// Scritture storiche accettate come sinonimo. 'cassainCloud' arrivava con la
// maiuscola e la riga che normalizza l'header la perdeva.
const ALIAS_PROVIDER = { cassaincloud: 'cassaincloud', zucchetti: 'zucchetti' }

export function normalizzaProvider(raw) {
  const p = String(raw || '').trim().toLowerCase()
  if (!p) return null
  const canonico = ALIAS_PROVIDER[p] || p
  return PROVIDER_VALIDI.includes(canonico) ? canonico : null
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

// Una riga di registro per giorno e per collegamento, con il contatore che
// cresce. Se qualcosa va storto non si ferma la richiesta: il registro è una
// nota, non un controllo — lo scontrino è già entrato.
async function registraSync(supabase, orgId, sedeId, integrazione) {
  try {
    const inizioGiornata = new Date(); inizioGiornata.setUTCHours(0, 0, 0, 0)
    const { data: esistente } = await supabase
      .from('sync_log')
      .select('id, records_importati')
      .eq('organization_id', orgId)
      .eq('integrazione', integrazione)
      .eq('stato', 'ok')
      .gte('created_at', inizioGiornata.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (esistente) {
      await supabase.from('sync_log')
        .update({ records_importati: (esistente.records_importati || 0) + 1 })
        .eq('id', esistente.id)
    } else {
      await supabase.from('sync_log').insert({
        organization_id: orgId,
        sede_id: sedeId || null,
        integrazione,
        stato: 'ok',
        records_importati: 1,
      })
    }
  } catch { /* nota, non controllo */ }
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
  const provider = normalizzaProvider(sanitizeStrict(req.headers.get('x-pos-provider') || '', 32))
  if (!provider) {
    return jsonResponse(req, { error: 'x-pos-provider non valido o mancante' }, 400)
  }

  // La chiave del cliente, e da lì l'organizzazione (fail-closed).
  const auth = await risolviToken(supabase, leggiToken(req), provider)
  if (!auth.ok) return jsonResponse(req, { error: 'Unauthorized' }, 401)
  const orgId = auth.organizationId

  // Body parsing
  let body
  try { body = await req.json() } catch { return jsonResponse(req, { error: 'JSON non valido' }, 400) }

  // Se la cassa dichiara comunque un'organizzazione, deve essere la sua.
  // Non è un permesso in più: è un modo per accorgersi di una cassa
  // configurata con la chiave sbagliata invece di scrivere nel posto errato.
  const dichiarata = sanitizeStrict(req.headers.get('x-organization-id') || body.organization_id || '', 36)
  if (dichiarata && validateUUID(dichiarata) && dichiarata !== orgId) {
    return jsonResponse(req, { error: 'La chiave non appartiene a questa organizzazione' }, 403)
  }

  const org = await organizzazioneAttiva(supabase, orgId)
  if (!org.ok) return jsonResponse(req, { error: org.errore }, org.stato)

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
    // Anche il fallimento va nel registro: senza questa riga un webhook che
    // non entra è invisibile dalla pagina Integrazioni, e la card resta
    // ferma all'ultimo sync riuscito.
    await supabase.from('sync_log').insert({
      organization_id: orgId,
      sede_id: sedeId || null,
      integrazione: `${provider}_webhook`,
      stato: 'errore',
      records_importati: 0,
      errore: (error.message || '').slice(0, 200),
    }).catch(() => {})
    return jsonResponse(req, { error: 'DB error: ' + error.message }, 500)
  }

  // Il registro dei collegamenti: una riga al giorno, non una per scontrino.
  //
  // Serve a far vedere al cliente che la cassa sta parlando con Foodos: senza
  // nessuna riga la targhetta in Integrazioni resta ferma e sembra tutto
  // spento. Ma scriverne una per OGNI scontrino vuol dire, in una gelateria
  // che ne batte quattrocento al giorno, quattrocento righe di registro al
  // giorno — centoquarantamila l'anno, per dire quattrocento volte la stessa
  // cosa. La pagina ne mostra le ultime dieci.
  //
  // Quindi: si aggiorna la riga di oggi se c'è già, e se ne apre una nuova
  // solo al primo scontrino della giornata.
  await registraSync(supabase, orgId, sedeId, `${provider}_webhook`)

  await segnaUso(supabase, auth.tokenId)

  return jsonResponse(req, { ok: true, scontrino_id: inserted.id, provider }, 200)
}
