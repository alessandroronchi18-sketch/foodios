export const config = { runtime: 'edge' }

// Import Mapping Save — salva un mapping confermato dal cliente nella
// library cross-cliente. Chiamato fire-and-forget dal wizard dopo un insert
// riuscito. Se fallisce, non blocca il flusso: il mapping non viene salvato
// ma i dati sono comunque stati importati.
//
// Privacy: la library salva SOLO nomi colonne + mapping schema. Nessun valore
// del cliente viene salvato in questa call. Vedi migration 20260901.

import { verificaToken, rallentaSeNecessario } from './lib/auth.js'
import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { handleOptions, getClientIP, json } from './lib/cors.js'
import { getEntitySchema, listEntities } from '../src/lib/importSchemas.js'

const MIN_MS = 100
const MAX_HEADERS = 200

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const start = Date.now()

  const { user, profile, supabase, error: authErr } = await verificaToken(req)
  if (authErr) {
    await rallentaSeNecessario(start, MIN_MS)
    return json({ error: authErr }, 401, req)
  }
  if (!profile?.organization_id) return json({ error: 'Utente senza organizzazione' }, 404, req)

  const ip = getClientIP(req)
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const rl = await checkRateLimit(admin, `import-map-save:${user.id}:${ip}`, 20, 60, 300)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  let body
  try { body = await req.json() } catch { return json({ error: 'JSON non valido' }, 400, req) }

  const { entity, headers, mapping } = body || {}
  const schema = getEntitySchema(entity)
  if (!schema) return json({ error: `entity "${entity}" non supportato`, valid: listEntities() }, 400, req)
  if (!Array.isArray(headers) || headers.length === 0) return json({ error: 'headers richiesto' }, 400, req)
  if (headers.length > MAX_HEADERS) return json({ error: 'headers troppo lunghi' }, 400, req)
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    return json({ error: 'mapping richiesto (oggetto)' }, 400, req)
  }

  // Sanity: mapping deve contenere solo field validi dello schema + colonne presenti in headers
  const validFields = new Set(schema.fields.map(f => f.name))
  const validCols = new Set(headers.map(h => String(h ?? '').trim()).filter(Boolean))
  const cleanMapping = {}
  for (const [field, col] of Object.entries(mapping)) {
    if (!validFields.has(field)) continue
    if (typeof col !== 'string' || !validCols.has(col)) continue
    cleanMapping[field] = col
  }
  if (Object.keys(cleanMapping).length === 0) {
    return json({ error: 'mapping non contiene coppie valide' }, 400, req)
  }

  const cleanHeaders = Array.from(validCols)

  // Chiama la RPC SECURITY DEFINER (usa il client user-bound, non l'admin)
  const { data, error } = await supabase.rpc('save_import_mapping', {
    p_entity: entity,
    p_headers: cleanHeaders,
    p_mapping: cleanMapping,
  })

  if (error) {
    await rallentaSeNecessario(start, MIN_MS)
    return json({ error: `RPC error: ${error.message}` }, 502, req)
  }

  await rallentaSeNecessario(start, MIN_MS)
  return json({
    entity,
    result: data,
    duration_ms: Date.now() - start,
  }, 200, req)
}
