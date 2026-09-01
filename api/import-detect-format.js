export const config = { runtime: 'edge' }

// Import Detect Format — chiede a Claude di analizzare i sheet di un file
// e proporre una config di UNPIVOT (WIDE→LONG) automatica.
//
// Input:  entity + sheets (nome + prime 20 righe di ciascuno).
// Output: { format: 'long'|'wide', unpivot_config, notes, source }
//
// Privacy: come /api/import-map, arrivano SOLO 20 righe di sample per sheet
// (per capire la struttura). I dati completi restano nel browser.

import { verificaToken, rallentaSeNecessario } from './lib/auth.js'
import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { handleOptions, getClientIP, json } from './lib/cors.js'
import { getEntitySchema, listEntities } from '../src/lib/importSchemas.js'

const MIN_MS = 200
const MAX_ROWS_PER_SHEET = 20
const MAX_SHEETS = 10
const MODEL = 'claude-sonnet-4-6'

function buildSystemPrompt() {
  return `Sei un esperto di data migration per software gestionale della ristorazione italiana. Riconosci il FORMATO di file Excel/CSV che i clienti caricano e proponi come trasformarli in LONG (una riga per ogni combinazione delle dimensioni).

Riceverai:
- SCHEMA TARGET dell'entita' Foodos (nomi field attesi).
- SHEETS del file: nome + prime 20 righe (2D array di celle).

Il tuo compito: capire se il file e' gia' LONG oppure WIDE, e proporre una config JSON che il codice applichera' per esplodere le colonne.

CATEGORIE FORMATO:

1. **LONG**: una riga per ogni combinazione (gia' pronta per il DB). Esempio:
   data | sede | gusto | produzione_g
   2026-05-01 | Torino | Nocciola | 2500

2. **WIDE**: dimensioni sparse nelle colonne. Sotto-varianti:
   - **WIDE multi-header**: prime 2-3 righe sono header (settimana + numero + label PROD/RIMAN.). Colonne di aggregato calcolato mescolate (VENDUTO, TOTALE). Riga finale TOTALE.
   - **WIDE multi-sheet**: una tab per sede/dimensione, dentro ogni tab formato WIDE o LONG.

FORMATO OUTPUT (JSON, SOLO JSON, nessun altro testo):

Per LONG:
{
  "format": "long",
  "unpivot_config": {
    "format": "long",
    "header_rows": 1,
    "sheets_to_process": ["nome_tab"],
    "sheet_name_field": "sede"     // se serve, altrimenti null
  },
  "notes": "..."
}

Per WIDE:
{
  "format": "wide",
  "unpivot_config": {
    "format": "wide",
    "header_rows": 3,               // quante righe di header
    "row_dimension": {
      "header_col": 0,               // colonna dove c'e' il nome (es. gusto)
      "field": "gusto_nome"          // field target Foodos
    },
    "column_groups": [{
      "label_row": 2,                // riga con "PROD"/"RIMAN."
      "day_number_row": 1,           // riga col numero giorno
      "month_iso": "2026-05",        // se sai il mese (dal nome file o header), altrimenti chiedi conferma via notes
      "date_field": "data",
      "measures": [
        {"label": "PROD", "field": "produzione_g"},
        {"label": "RIMAN.", "field": "rimanenza_g"}
      ]
    }],
    "sheet_name_field": "sede",       // il nome del sheet diventa il valore di "sede"
    "sheets_to_process": ["BERTHOLLET", "CARLINA", "DE GASPERI"],
    "sheets_to_skip": ["TOTALI", "ALTRI PRODOTTI"],
    "skip_row_starts": ["TOTALE"],
    "skip_col_header_contains": ["VENDUTO", "TOTALE"]
  },
  "notes": "Riconosciuto formato registro produzione gelateria italiana con 3 sedi in tab separate..."
}

REGOLE:
1. Se il nome tab ha spazi leading/trailing, il codice fa trim: puoi usare la versione trimmata.
2. Se non riesci a dedurre month_iso, mettilo null e spiega in notes che va confermato.
3. Se i sheet aggregate/altri sono chiaramente riepiloghi da ignorare, mettili in sheets_to_skip.
4. Se il formato non e' riconosciuto o e' misto/ambiguo, ritorna { "format": "unknown", "unpivot_config": null, "notes": "spiegazione" }.
5. Per registri produzione gelateria italiana: quasi sempre WIDE multi-header con coppie (PROD, RIMAN.), separatori VENDUTO SETTIMANA, riga TOTALE. Applica il pattern se vedi indizi.

Nessun testo prima o dopo il JSON.`
}

function buildUserPrompt({ schema, sheets }) {
  const fieldsSummary = schema.fields.map(f => ({
    name: f.name, type: f.type, required: !!f.required, hint: f.hint,
  }))
  const sheetsBrief = Object.entries(sheets).map(([name, rows]) => ({
    name, sample: rows.slice(0, MAX_ROWS_PER_SHEET),
  }))
  return `SCHEMA TARGET (${schema.label}):
${JSON.stringify({ description: schema.description, fields: fieldsSummary }, null, 2)}

FILE INPUT — sheets (max ${MAX_SHEETS}, prime ${MAX_ROWS_PER_SHEET} righe ciascuno):
${JSON.stringify(sheetsBrief, null, 2)}

Restituisci il JSON di detect+config come richiesto.`
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
  if (!profile?.organization_id) return json({ error: 'Utente senza organizzazione' }, 404, req)

  const ip = getClientIP(req)
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const rl = await checkRateLimit(admin, `import-detect:${user.id}:${ip}`, 10, 60, 600)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  let body
  try { body = await req.json() } catch { return json({ error: 'JSON non valido' }, 400, req) }

  const { entity, sheets } = body || {}
  const schema = getEntitySchema(entity)
  if (!schema) return json({ error: `entity "${entity}" non supportato`, valid: listEntities() }, 400, req)
  if (!sheets || typeof sheets !== 'object') return json({ error: 'sheets richiesto (oggetto {nome: righe})' }, 400, req)
  const sheetKeys = Object.keys(sheets)
  if (sheetKeys.length === 0) return json({ error: 'nessuno sheet' }, 400, req)
  if (sheetKeys.length > MAX_SHEETS) return json({ error: `troppi sheet (${sheetKeys.length}, max ${MAX_SHEETS})` }, 400, req)

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
        max_tokens: 3072,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildUserPrompt({ schema, sheets }) }],
      }),
    })
  } catch (e) {
    clearTimeout(timeoutId)
    await rallentaSeNecessario(start, MIN_MS)
    if (e?.name === 'AbortError') return json({ error: 'Timeout AI (25s)' }, 504, req)
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

  let parsed
  try { parsed = JSON.parse(rawText) }
  catch {
    const match = rawText.match(/\{[\s\S]*\}/)
    if (match) { try { parsed = JSON.parse(match[0]) } catch { /* */ } }
  }
  if (!parsed || typeof parsed !== 'object') {
    return json({ error: 'Impossibile parsare risposta AI', raw: rawText.slice(0, 500) }, 502, req)
  }

  await rallentaSeNecessario(start, MIN_MS)
  return json({
    entity,
    format: parsed.format || 'unknown',
    unpivot_config: parsed.unpivot_config || null,
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    source: 'ai',
    model: MODEL,
    duration_ms: Date.now() - start,
  }, 200, req)
}
