export const config = { runtime: 'edge' }

// Import Mapper — AI-assisted column mapping.
//
// Riceve: entity + headers (colonne del file cliente) + sampleRows (2-5 righe di esempio).
// Ritorna: mapping proposto { field_target -> nome_colonna_input } + confidence + note.
//
// Serve sia il wizard UI in-app che il CLI founder-assisted. Chi consuma
// prende il mapping, lo mostra all'utente per revisione, poi passa al
// /api/import-validate + /api/import-execute.

import { verificaToken, rallentaSeNecessario } from './lib/auth.js'
import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, getClientIP, json } from './lib/cors.js'
import { getEntitySchema, listEntities } from '../src/lib/importSchemas.js'

const MIN_MS = 200
const MAX_HEADERS = 200
const MAX_SAMPLE_ROWS = 5

// Costo AI contenuto: input ~1-2k token, output ~500 token. Sonnet 4.6 basta.
const MODEL = 'claude-sonnet-4-6'

function buildSystemPrompt() {
  return `Sei un esperto di data migration per software gestionale della ristorazione italiana.

Riceverai:
- Uno SCHEMA TARGET (JSON) con la lista dei field che il sistema si aspetta per una specifica entita (fornitori, dipendenti, ecc.). Ogni field ha: name, type, required, hint (spiegazione umana), aliases (nomi comuni).
- Un file INPUT del cliente con: headers (nomi delle colonne) + fino a 5 sample rows.

Il tuo compito: MAPPARE ciascuna colonna del file input a un field dello schema target, quando c'e un match sensato.

REGOLE:
1. Un field schema puo essere mappato a UNA colonna input al massimo.
2. Una colonna input puo essere mappata a UN field schema al massimo.
3. Se una colonna input non ha corrispondenza ragionevole (es. "IBAN" non rientra nello schema fornitori), lasciala unmapped.
4. Se un field required NON ha match, aggiungilo a missing_required.
5. Usa gli aliases come guida forte: se la colonna input matcha un alias esatto, mappa con confidence 1.0.
6. Guarda i sample rows per confermare il tipo: se il field target e' "email" ma la colonna input contiene valori come "3391234567", NON mappare.
7. Per numerici (costo_orario, ore_settimana, ecc.): la colonna input deve contenere valori parseabili come numeri.
8. Confidence:
   - 1.0 = certezza (alias esatto + tipo coerente)
   - 0.8 = molto probabile (nome simile + tipo coerente)
   - 0.5 = plausibile ma da rivedere
   - < 0.5 = meglio non mappare (lascia unmapped e spiega in notes)

FORMATO OUTPUT (JSON, nessun altro testo):
{
  "mapping": {
    "<field_target_1>": "<nome_colonna_input>",
    "<field_target_2>": "<nome_colonna_input>",
    ...
  },
  "confidence": {
    "<field_target_1>": 0.95,
    "<field_target_2>": 0.7,
    ...
  },
  "unmapped_columns": ["<colonna_input_1>", ...],
  "missing_required": ["<field_required_senza_match>", ...],
  "notes": "Breve spiegazione (max 200 parole) delle decisioni non ovvie."
}

Nessun testo prima o dopo il JSON.`
}

function buildUserPrompt({ schema, headers, sampleRows }) {
  const fieldsSummary = schema.fields.map(f => ({
    name: f.name,
    type: f.type,
    required: !!f.required,
    hint: f.hint,
    aliases: f.aliases || [],
  }))
  return `SCHEMA TARGET (${schema.label}):
${JSON.stringify({ description: schema.description, fields: fieldsSummary }, null, 2)}

FILE INPUT — headers:
${JSON.stringify(headers)}

FILE INPUT — sample rows (max ${MAX_SAMPLE_ROWS}):
${JSON.stringify(sampleRows, null, 2)}

Restituisci il JSON di mapping come richiesto.`
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const start = Date.now()

  const { user, profile, error: authErr } = await verificaToken(req)
  if (authErr) {
    await rallentaSeNecessario(start, MIN_MS)
    return json({ error: authErr }, 401, req)
  }
  const orgId = profile?.organization_id
  if (!orgId) return json({ error: 'Utente senza organizzazione' }, 404, req)

  const ip = getClientIP(req)
  // Rate limit stretto: import mapping e' operazione rara (una volta per file/cliente)
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const rl = await checkRateLimit(supabase, `import-map:${user.id}:${ip}`, 10, 60, 600)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  let body
  try { body = await req.json() } catch { return json({ error: 'JSON non valido' }, 400, req) }

  const { entity, headers, sampleRows } = body || {}
  if (typeof entity !== 'string' || !entity) {
    return json({ error: 'entity richiesto', valid: listEntities() }, 400, req)
  }
  const schema = getEntitySchema(entity)
  if (!schema) {
    return json({ error: `entity "${entity}" non supportato`, valid: listEntities() }, 400, req)
  }
  if (!Array.isArray(headers) || headers.length === 0) {
    return json({ error: 'headers richiesto (array non vuoto)' }, 400, req)
  }
  if (headers.length > MAX_HEADERS) {
    return json({ error: `troppi headers (${headers.length}, max ${MAX_HEADERS})` }, 400, req)
  }
  const cleanHeaders = headers.map(h => String(h ?? '').trim()).filter(Boolean)
  if (cleanHeaders.length === 0) {
    return json({ error: 'headers vuoti dopo trim' }, 400, req)
  }
  const cleanSamples = Array.isArray(sampleRows)
    ? sampleRows.slice(0, MAX_SAMPLE_ROWS)
    : []

  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY non configurata' }, 503, req)
  }

  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), 25000)
  let resp
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: buildSystemPrompt(),
        messages: [
          { role: 'user', content: buildUserPrompt({ schema, headers: cleanHeaders, sampleRows: cleanSamples }) },
        ],
      }),
    })
  } catch (e) {
    clearTimeout(timeoutId)
    await rallentaSeNecessario(start, MIN_MS)
    if (e?.name === 'AbortError') {
      return json({ error: 'Timeout AI (25s)' }, 504, req)
    }
    return json({ error: 'Errore chiamata AI: ' + (e?.message || 'unknown') }, 502, req)
  }
  clearTimeout(timeoutId)

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    await rallentaSeNecessario(start, MIN_MS)
    return json({ error: `AI HTTP ${resp.status}: ${txt.slice(0, 500)}` }, 502, req)
  }

  let payload
  try { payload = await resp.json() } catch { return json({ error: 'Risposta AI non JSON' }, 502, req) }

  const rawText = payload?.content?.[0]?.text || ''
  if (!rawText) return json({ error: 'Risposta AI vuota' }, 502, req)

  // Robustness: se Claude ha aggiunto testo extra, prova a estrarre il primo JSON.
  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/)
    if (match) {
      try { parsed = JSON.parse(match[0]) } catch { /* fallthrough */ }
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return json({ error: 'Impossibile parsare risposta AI', raw: rawText.slice(0, 500) }, 502, req)
  }

  // Sanity check output shape
  const mapping = (parsed.mapping && typeof parsed.mapping === 'object') ? parsed.mapping : {}
  const confidence = (parsed.confidence && typeof parsed.confidence === 'object') ? parsed.confidence : {}
  const unmapped_columns = Array.isArray(parsed.unmapped_columns) ? parsed.unmapped_columns : []
  const missing_required = Array.isArray(parsed.missing_required) ? parsed.missing_required : []
  const notes = typeof parsed.notes === 'string' ? parsed.notes : ''

  // Verifica che il mapping usi solo field validi dallo schema + colonne esistenti.
  const validFields = new Set(schema.fields.map(f => f.name))
  const validCols = new Set(cleanHeaders)
  const cleanMapping = {}
  const cleanConf = {}
  for (const [field, col] of Object.entries(mapping)) {
    if (!validFields.has(field)) continue
    if (typeof col !== 'string' || !validCols.has(col)) continue
    cleanMapping[field] = col
    const c = Number(confidence[field])
    cleanConf[field] = Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.5
  }

  await rallentaSeNecessario(start, MIN_MS)
  return json({
    entity,
    mapping: cleanMapping,
    confidence: cleanConf,
    unmapped_columns,
    missing_required,
    notes,
    model: MODEL,
    duration_ms: Date.now() - start,
  }, 200, req)
}
