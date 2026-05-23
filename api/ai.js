export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, getClientIP } from './lib/cors.js'
import { verificaToken, rallentaSeNecessario } from './lib/auth.js'

const MAX_BODY_BYTES = 10_485_760 // 10 MB — foto compresse client-side stanno sotto 2MB tipicamente
const MAX_MESSAGES = 20
const MIN_RESPONSE_MS = 200

function errResponse(error, status, req) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
  })
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return errResponse('Method not allowed', 405, req)

  const startTime = Date.now()

  // Auth rafforzata
  const { user, profile, supabase, error: authErr } = await verificaToken(req)
  if (authErr) {
    await rallentaSeNecessario(startTime, MIN_RESPONSE_MS)
    return errResponse(authErr, 401, req)
  }

  // Rate limit per utente+IP (10 req/min, ban 15min)
  const ip = getClientIP(req)
  const rl = await checkRateLimit(supabase, `ai:${user.id}:${ip}`, 10, 60)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  // Body validation
  let body
  try {
    const text = await req.text()
    if (text.length > MAX_BODY_BYTES) {
      return errResponse('Immagine troppo grande. Riprova con una foto più piccola (max 8MB).', 413, req)
    }
    body = JSON.parse(text)
  } catch {
    return errResponse('Body non valido', 400, req)
  }

  if (!body || typeof body !== 'object') {
    return errResponse('Body non valido', 400, req)
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return errResponse('Messages richiesto', 400, req)
  }

  // ── Zero-trust: se il client dichiara una organization_id nel body, deve
  //    corrispondere a quella del profilo. Impedisce a un client compromesso
  //    di richiedere analisi sui dati di un'altra org passando ricettario altrui.
  if (body.organization_id && body.organization_id !== profile.organization_id) {
    try {
      await supabase.from('audit_log').insert({
        organization_id: profile.organization_id,
        user_id: user.id,
        user_email: user.email,
        operation: 'ai_cross_org_block',
        user_agent: (req.headers.get('user-agent') || '').slice(0, 256),
        client_ip: ip,
        new_data: { requested_org: body.organization_id },
      })
    } catch {}
    await rallentaSeNecessario(startTime, MIN_RESPONSE_MS)
    return errResponse('organization mismatch', 403, req)
  }

  // Audit fail-soft: registriamo che è stata fatta una chiamata AI
  // (no payload del prompt — può contenere dati sensibili)
  try {
    await supabase.from('audit_log').insert({
      organization_id: profile.organization_id,
      user_id: user.id,
      user_email: user.email,
      operation: 'ai_call',
      user_agent: (req.headers.get('user-agent') || '').slice(0, 256),
      client_ip: ip,
      new_data: { n_messages: body.messages.length, model: body.model || 'claude-sonnet-4-6' },
    })
  } catch {}

  // Proxy Anthropic con parametri controllati
  try {
    // Sanitizza messages: solo role user/assistant accettati.
    // Un role 'system' iniettato dal client potrebbe sovrascrivere istruzioni
    // di sistema applicate altrove → filtriamo qui per sicurezza.
    const sanitizedMessages = body.messages
      .slice(0, MAX_MESSAGES)
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content != null)
    if (sanitizedMessages.length === 0) {
      return errResponse('Messages: nessun ruolo user/assistant valido', 400, req)
    }
    const safeBody = {
      ...body,
      model: body.model || 'claude-sonnet-4-6',
      max_tokens: Math.min(Math.max(parseInt(body.max_tokens) || 1000, 1), 4000),
      messages: sanitizedMessages,
    }
    // Rimuovi eventuale organization_id dal body inoltrato ad Anthropic (era solo per zero-trust check)
    delete safeBody.organization_id

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(safeBody),
    })

    const data = await response.json()
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  } catch (err) {
    return errResponse('Errore AI: ' + err.message, 500, req)
  }
}
