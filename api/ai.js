export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, getClientIP } from './lib/cors.js'
import { verificaToken, rallentaSeNecessario } from './lib/auth.js'

const MAX_BODY_BYTES = 500_000 // 500 KB
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
  const { user, supabase, error: authErr } = await verificaToken(req)
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
      return errResponse('Richiesta troppo grande', 413, req)
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

  // Proxy Anthropic con parametri controllati
  try {
    const safeBody = {
      ...body,
      model: body.model || 'claude-sonnet-4-6',
      max_tokens: Math.min(Math.max(parseInt(body.max_tokens) || 1000, 1), 4000),
      messages: body.messages.slice(0, MAX_MESSAGES),
    }

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
