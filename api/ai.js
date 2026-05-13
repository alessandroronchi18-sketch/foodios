export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, getClientIP } from './lib/cors.js'

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Auth
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = await getSupabase()

  // Verifica token
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Token non valido' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Rate limit: 10 richieste/min per utente
  const ip = getClientIP(req)
  const rl = await checkRateLimit(supabase, `ai:${user.id}:${ip}`, 10, 60)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  // Proxy Anthropic
  try {
    const body = await req.json()
    const safeBody = {
      ...body,
      model: body.model || 'claude-sonnet-4-20250514',
      max_tokens: Math.min(body.max_tokens || 1000, 4000),
    }

    // Rimuovi eventuali system prompt injection
    if (Array.isArray(safeBody.messages)) {
      safeBody.messages = safeBody.messages.slice(0, 20) // max 20 messaggi
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
    return new Response(JSON.stringify({ error: 'Errore AI: ' + err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
