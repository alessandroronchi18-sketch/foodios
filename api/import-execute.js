export const config = { runtime: 'edge' }

// Import Executor — batch insert su Supabase.
//
// Riceve: entity + rows validate (output di /api/import-validate).
// Applica batch insert nella tabella target con organization_id derivato
// dal JWT utente (NON dal body). Ritorna { inserted, failed, log }.
//
// Sicurezza:
//   - organization_id non e' accettato dal body: viene sempre da profile.
//   - Usa il client Supabase user-bound (con JWT), NON service_role → passa
//     dalle policy RLS. Anche se un client malicious inviasse rows con
//     organization_id != quello del profile, la policy blocca.
//
// Idempotency:
//   - Le tabelle target (v1: fornitori, dipendenti) non hanno unique
//     constraint su nome, quindi rilanciare l'import duplica le righe.
//     TODO v2: aggiungere unique index su (organization_id, nome) e usare upsert.
//     Per ora, il chiamante deve sapere se l'entity è già stata importata.

import { verificaToken, rallentaSeNecessario } from './lib/auth.js'
import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, getClientIP, json } from './lib/cors.js'
import { getEntitySchema, listEntities } from '../src/lib/importSchemas.js'

const MIN_MS = 200
const MAX_ROWS = 5000
const BATCH_SIZE = 200

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const start = Date.now()

  const { user, profile, supabase, error: authErr } = await verificaToken(req)
  if (authErr) {
    await rallentaSeNecessario(start, MIN_MS)
    return json({ error: authErr }, 401, req)
  }
  const orgId = profile?.organization_id
  if (!orgId) return json({ error: 'Utente senza organizzazione' }, 404, req)

  const ip = getClientIP(req)
  // Rate limit stretto: execute è l'operazione più pesante
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const rl = await checkRateLimit(admin, `import-execute:${user.id}:${ip}`, 5, 60, 600)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  let body
  try { body = await req.json() } catch { return json({ error: 'JSON non valido' }, 400, req) }

  const { entity, rows, dry_run = false } = body || {}
  const schema = getEntitySchema(entity)
  if (!schema) return json({ error: `entity "${entity}" non supportato`, valid: listEntities() }, 400, req)
  if (!Array.isArray(rows) || rows.length === 0) return json({ error: 'rows richiesto (array non vuoto)' }, 400, req)
  if (rows.length > MAX_ROWS) return json({ error: `troppe rows (${rows.length}, max ${MAX_ROWS})` }, 400, req)

  // Prepara le rows: forza organization_id dal profilo (NON dal body).
  const validFieldNames = new Set(schema.fields.map(f => f.name))
  const prepared = rows.map(r => {
    if (!r || typeof r !== 'object') return null
    const out = { organization_id: orgId }
    for (const [k, v] of Object.entries(r)) {
      if (validFieldNames.has(k)) out[k] = v
    }
    return out
  }).filter(Boolean)

  if (prepared.length === 0) return json({ error: 'nessuna riga valida dopo la preparazione' }, 400, req)

  if (dry_run) {
    return json({
      entity,
      dry_run: true,
      would_insert: prepared.length,
      sample: prepared.slice(0, 3),
      duration_ms: Date.now() - start,
    }, 200, req)
  }

  // Batch insert. Il client `supabase` da verificaToken e' user-bound (JWT),
  // quindi rispetta RLS. Per fornitori/dipendenti la policy "*_own" richiede
  // che organization_id sia dell'utente → già forzato sopra.
  const inserted = []
  const failed = []
  for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
    const chunk = prepared.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase
      .from(schema.table)
      .insert(chunk)
      .select('id')
    if (error) {
      failed.push({
        batch_start: i,
        batch_size: chunk.length,
        error: error.message || String(error),
      })
    } else {
      inserted.push(...(data || []).map(r => r.id))
    }
  }

  await rallentaSeNecessario(start, MIN_MS)
  return json({
    entity,
    dry_run: false,
    inserted_count: inserted.length,
    inserted_ids: inserted.slice(0, 20),  // solo primi 20 per non appesantire response
    failed_batches: failed,
    total_attempted: prepared.length,
    duration_ms: Date.now() - start,
  }, 200, req)
}
