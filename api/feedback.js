export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { handleOptions, json, getClientIP } from './lib/cors.js'
import { sanitize, sanitizeStrict } from './lib/validate.js'
import { safeError } from './lib/safeError.js'

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

async function getUser(req, supabase) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const { data: { user }, error } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (error || !user) return null
  return user
}

const SENTIMENT_VALIDI = ['bug', 'feature', 'feedback', 'complimento']

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const ip = getClientIP(req)
  const supabase = await getSupabase()

  // Rate limit: 5 feedback/min per IP — abbastanza largo per uso reale,
  // stretto per evitare spam.
  const rl = await checkRateLimit(supabase, `feedback:${ip}`, 5, 60)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  const user = await getUser(req, supabase)
  if (!user) return json({ error: 'Non autorizzato' }, 401, req)

  let body
  try { body = await req.json() } catch { return json({ error: 'JSON non valido' }, 400, req) }

  const messaggio = sanitize(body.messaggio || '', 2000)
  if (!messaggio || messaggio.length < 3) {
    return json({ error: 'Messaggio troppo corto' }, 400, req)
  }
  const sentiment = SENTIMENT_VALIDI.includes(body.sentiment) ? body.sentiment : 'feedback'
  const viewCorrente = sanitizeStrict(body.view_corrente || '', 80)
  const urlCorrente = sanitize(body.url || '', 500)

  // Recupera org + ruolo del profilo per arricchire la riga.
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, ruolo, email')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.organization_id) {
    return json({ error: 'Organizzazione non trovata' }, 404, req)
  }

  try {
    const { error } = await supabase.from('feedback').insert({
      organization_id: profile.organization_id,
      user_id: user.id,
      user_email: profile.email || user.email || null,
      ruolo: profile.ruolo || 'titolare',
      view_corrente: viewCorrente || null,
      messaggio,
      sentiment,
      url: urlCorrente || null,
      user_agent: (req.headers.get('user-agent') || '').slice(0, 300),
    })
    if (error) throw error
    return json({ ok: true }, 200, req)
  } catch (err) {
    const safe = safeError(err, { endpoint: 'feedback', userId: user.id }, 500, supabase)
    return json(safe.body, safe.status, req)
  }
}
