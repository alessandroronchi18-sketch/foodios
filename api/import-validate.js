export const config = { runtime: 'edge' }

// Import Validator — pura validazione, no side effect.
//
// Riceve: entity + mapping (dal step precedente) + rows (tutto il file).
// Applica il mapping riga-per-riga, valida contro schema (tipi, required,
// range), ritorna valid_rows pronte per l'insert + invalid_rows con errori
// riga-per-riga per debug UI.
//
// Logica pura in src/lib/importValidateCore.js (condivisa con CLI e browser).

import { verificaToken, rallentaSeNecessario } from './lib/auth.js'
import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { handleOptions, getClientIP, json } from './lib/cors.js'
import { getEntitySchema, listEntities } from '../src/lib/importSchemas.js'
import { validateRows, findMissingRequired } from '../src/lib/importValidateCore.js'

const MIN_MS = 100
const MAX_ROWS = 5000

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const start = Date.now()

  const { user, profile, error: authErr } = await verificaToken(req)
  if (authErr) {
    await rallentaSeNecessario(start, MIN_MS)
    return json({ error: authErr }, 401, req)
  }
  if (!profile?.organization_id) return json({ error: 'Utente senza organizzazione' }, 404, req)

  const ip = getClientIP(req)
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const rl = await checkRateLimit(supabase, `import-validate:${user.id}:${ip}`, 30, 60, 300)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  let body
  try { body = await req.json() } catch { return json({ error: 'JSON non valido' }, 400, req) }

  const { entity, mapping, rows } = body || {}
  const schema = getEntitySchema(entity)
  if (!schema) return json({ error: `entity "${entity}" non supportato`, valid: listEntities() }, 400, req)
  if (!mapping || typeof mapping !== 'object') return json({ error: 'mapping richiesto' }, 400, req)
  if (!Array.isArray(rows) || rows.length === 0) return json({ error: 'rows richiesto (array non vuoto)' }, 400, req)
  if (rows.length > MAX_ROWS) return json({ error: `troppe rows (${rows.length}, max ${MAX_ROWS} per call)` }, 400, req)

  const missingRequired = findMissingRequired(mapping, schema)
  if (missingRequired.length > 0) {
    return json({
      error: `Field obbligatori senza mapping: ${missingRequired.join(', ')}`,
      missing_required: missingRequired,
    }, 400, req)
  }

  const { valid_rows, invalid_rows, stats } = validateRows(rows, mapping, schema)

  await rallentaSeNecessario(start, MIN_MS)
  return json({
    entity,
    stats,
    valid_rows,
    invalid_rows,
    duration_ms: Date.now() - start,
  }, 200, req)
}
