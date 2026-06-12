export const config = { runtime: 'edge' }

// OCR Fattura Fornitore (A7)
//
// L'utente carica foto/PDF fattura. Endpoint usa Claude Vision per estrarre:
// fornitore (nome+P.IVA), data emissione+scadenza, numero, importi (netto/lordo/IVA),
// righe ingredienti (nome+qta+prezzo), categoria suggerita.
//
// Salva su public.extracted_invoices per audit log + restituisce il JSON
// estratto al client che lo presenta editabile prima di salvare la fattura.

import { verificaToken, rallentaSeNecessario } from './lib/auth.js'
import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, getClientIP, json } from './lib/cors.js'
import { safeError } from './lib/safeError.js'

const MAX_BODY = 12 * 1024 * 1024  // 12MB (fattura PDF/foto compressa)
const MIN_MS = 200

const SYSTEM = `Sei un OCR specializzato in fatture italiane di fornitori
per pasticcerie/gelaterie/bar.

Riceverai un'immagine (foto o PDF rasterizzato) di una fattura. Estrai i
campi e restituisci SOLO un JSON valido in questo formato esatto:

{
  "fornitore_nome": "<ragione sociale>",
  "fornitore_piva": "<P.IVA o codice fiscale, solo numeri>",
  "data_emissione": "YYYY-MM-DD",
  "data_scadenza": "YYYY-MM-DD",
  "numero_fattura": "<numero/codice>",
  "importo_netto": <numero>,
  "importo_iva": <numero>,
  "importo_lordo": <numero>,
  "categoria_suggerita": "<materie_prime|utenze|manutenzione|servizi|affitto|consumabili|trasporti|altro>",
  "righe": [
    { "descrizione": "<descrizione riga>", "quantita": <num>, "unita": "<kg|l|pz|...>", "prezzo_unit": <num>, "totale_riga": <num> }
  ],
  "confidence": <0-1, quanto sei sicuro dell estrazione>
}

REGOLE:
- Tutti i numeri come number (non stringhe), virgola decimale convertita in punto.
- Date in ISO 8601. Se manca scadenza, ripeti emissione.
- Se non riesci a leggere un campo, metti null.
- Categoria: deduci dal tipo di prodotti/servizi (ingredienti -> materie_prime; energia/gas/acqua -> utenze; etc.)
- "righe": fino a 30 max, tronca se piu lunghe.
- NIENTE testo prima/dopo il JSON. NIENTE markdown. SOLO il JSON.`

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const start = Date.now()
  const { user, profile, error: authErr } = await verificaToken(req)
  if (authErr) { await rallentaSeNecessario(start, MIN_MS); return json({ error: authErr }, 401, req) }
  const orgId = profile?.organization_id
  if (!orgId) return json({ error: 'Org non trovata' }, 404, req)

  const ip = getClientIP(req)
  const supabase = await getSupabase()
  const rl = await checkRateLimit(supabase, `ocr-fattura:${user.id}:${ip}`, 20, 60, 600)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  let body
  try { body = await req.json() } catch { return json({ error: 'JSON non valido' }, 400, req) }

  const { image_base64, image_media_type = 'image/jpeg', sede_id = null } = body || {}
  if (!image_base64 || typeof image_base64 !== 'string') {
    return json({ error: 'image_base64 mancante' }, 400, req)
  }
  if (image_base64.length > MAX_BODY * 1.4) {
    return json({ error: 'Immagine troppo grande (max 12MB)' }, 413, req)
  }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'].includes(image_media_type)) {
    return json({ error: 'Tipo file non supportato' }, 400, req)
  }

  // Chiamata Claude Vision
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY non configurata' }, 503, req)
  }

  // Timeout 25s (sotto il limite Edge Function di 30s).
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
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image_media_type, data: image_base64 } },
            { type: 'text', text: 'Estrai i campi e restituisci SOLO il JSON.' },
          ],
        }],
      }),
    })
  } catch (e) {
    clearTimeout(timeoutId)
    if (e.name === 'AbortError') return json({ error: 'OCR timeout (>25s). Riprova con una foto piu nitida.' }, 504, req)
    return json({ error: 'Errore Claude: ' + e.message }, 502, req)
  }
  clearTimeout(timeoutId)

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    return json({ error: 'Claude error', detail: txt.slice(0, 200) }, 502, req)
  }
  const aiJson = await resp.json()
  const text = (aiJson.content || []).find(c => c.type === 'text')?.text || ''
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) {
    return json({ error: 'AI non ha estratto JSON', raw: text.slice(0, 300) }, 502, req)
  }
  let extracted
  try { extracted = JSON.parse(m[0]) } catch (e) {
    return json({ error: 'JSON parsing fallito: ' + e.message }, 502, req)
  }

  // Persist audit log
  let savedId = null
  try {
    const { data } = await supabase
      .from('extracted_invoices')
      .insert({
        organization_id: orgId, sede_id,
        fornitore_nome: extracted.fornitore_nome || null,
        fornitore_piva: extracted.fornitore_piva || null,
        data_emissione: extracted.data_emissione || null,
        data_scadenza: extracted.data_scadenza || null,
        importo_lordo: Number(extracted.importo_lordo) || null,
        importo_netto: Number(extracted.importo_netto) || null,
        importo_iva: Number(extracted.importo_iva) || null,
        numero_fattura: extracted.numero_fattura || null,
        categoria: extracted.categoria_suggerita || null,
        righe: extracted.righe || [],
        confidence: Number(extracted.confidence) || null,
      })
      .select('id').single()
    savedId = data?.id || null
  } catch (e) {
    // Non blocchiamo: il log e' un nice-to-have, la response e' la cosa importante.
    console.warn('extracted_invoices insert failed:', e.message)
  }

  return json({ ok: true, extracted, audit_id: savedId, model: aiJson.model }, 200, req)
}
