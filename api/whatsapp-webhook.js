export const config = { runtime: 'edge' }

// WhatsApp Bot webhook (C2) - SCAFFOLDING
//
// Riceve messaggi da Twilio (o Meta Business API) e:
//   1. Identifica l'utente FoodOS via whatsapp_links.phone_number
//   2. Parsifica l'intent con Claude (es. "ho incassato 1200 oggi" -> registra)
//   3. Esegue azione + risponde con conferma
//
// MVP: solo riconoscimento user + risposta echo "Benvenuto, presto attivo".
// V1 prod: necessita TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN env vars.
// V2: tool-use Claude per operazioni reali (registrare ricavi, spreco,
// fattura, etc.).

import { safeError } from './lib/safeError.js'

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

function twimlResponse(text) {
  // Risposta XML che Twilio accetta direttamente
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</Message></Response>`
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    let body = {}
    const ct = (req.headers.get('content-type') || '').toLowerCase()
    if (ct.includes('application/x-www-form-urlencoded')) {
      const raw = await req.text()
      const params = new URLSearchParams(raw)
      params.forEach((v, k) => { body[k] = v })
    } else {
      body = await req.json().catch(() => ({}))
    }

    // Twilio invia: From="whatsapp:+39xxx", Body="testo", AccountSid=...
    const from = body.From || body.from || ''
    const text = body.Body || body.body || ''
    const phone = String(from).replace(/^whatsapp:/i, '').replace(/[^+\d]/g, '')

    if (!phone || !text) {
      return twimlResponse('Messaggio non valido')
    }

    const supabase = await getSupabase()
    const { data: link } = await supabase
      .from('whatsapp_links')
      .select('id, organization_id, user_id, attivo')
      .eq('phone_number', phone)
      .eq('attivo', true)
      .maybeSingle()

    if (!link) {
      return twimlResponse(`Ciao! Il numero ${phone} non e' collegato a nessun account FoodOS.\n\nPer collegarlo, vai nell'app FoodOS -> Impostazioni -> WhatsApp.`)
    }

    // Aggiorna ultimo messaggio
    await supabase.from('whatsapp_links')
      .update({ ultimo_messaggio_at: new Date().toISOString() })
      .eq('id', link.id)

    // MVP: echo + suggerimento. Quando attivi il tool-use AI questa sezione cresce.
    const lower = text.trim().toLowerCase()
    if (lower === 'aiuto' || lower === 'help' || lower === '?') {
      return twimlResponse(
`📋 Comandi disponibili:
- "kpi" - riassunto giornata
- "scorte" - cosa manca in magazzino
- "fatture" - fatture in scadenza
- "spreco <prodotto> <qta>" - registra spreco
- domande libere (l'AI risponde)`
      )
    }

    // Risposta default in attesa di tool-use AI completo
    return twimlResponse(
`Ho ricevuto: "${text.slice(0, 60)}"\n\nIl bot AI completo arriva con il piano Chain.\nScrivi "aiuto" per i comandi.`
    )
  } catch (e) {
    const safe = safeError(e, { endpoint: 'whatsapp-webhook' })
    return twimlResponse('Errore tecnico: ' + (safe.body?.error || 'sconosciuto'))
  }
}
