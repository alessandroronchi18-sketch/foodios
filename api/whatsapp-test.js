// POST /api/whatsapp-test
// Auth: Bearer (Supabase JWT)
// Invia un messaggio WhatsApp di test al numero salvato in organizations.telefono_whatsapp.
// Usato dal bottone "Invia ora" nel pannello Impostazioni → WhatsApp.

export const config = { runtime: 'edge' }

import { verificaToken } from './lib/auth.js'

async function sendWhatsApp({ to, body }) {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_WHATSAPP_FROM
  if (!sid || !token || !from) throw new Error('Twilio non configurato')

  const auth = btoa(`${sid}:${token}`)
  const form = new URLSearchParams()
  form.set('From', from)
  form.set('To',   to.startsWith('whatsapp:') ? to : `whatsapp:${to}`)
  form.set('Body', body)

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(j.message || `Twilio HTTP ${res.status}`)
  return j
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const auth = await verificaToken(req)
  if (!auth.user) return new Response(JSON.stringify({ error: auth.error || 'Non autenticato' }), { status: 401 })

  const { data: org } = await auth.supabase
    .from('organizations')
    .select('telefono_whatsapp, nome')
    .eq('id', auth.profile.organization_id)
    .maybeSingle()

  if (!org?.telefono_whatsapp) {
    return new Response(JSON.stringify({ error: 'Nessun numero WhatsApp configurato' }), { status: 400 })
  }

  try {
    const body = `📊 *Test report FoodOS*\n${org.nome}\n\nQuesto è un messaggio di prova. Se lo vedi, il setup WhatsApp è OK.\n\nIl report serale arriva ogni giorno alle 22:00.`
    await sendWhatsApp({ to: org.telefono_whatsapp, body })
    return new Response(JSON.stringify({ ok: true, to: org.telefono_whatsapp }), { status: 200 })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
}
