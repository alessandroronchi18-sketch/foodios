export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, getClientIP } from './lib/cors.js'

// Endpoint receiver per errori dal client.
// Accetta payload anonimi (no auth richiesta), con rate limit aggressivo per IP.
// Se SENTRY_DSN è configurato, inoltra all'API Sentry envelope. Altrimenti logga su audit_log.

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

// Parser del DSN Sentry: https://PUBLIC_KEY@oXXX.ingest.sentry.io/PROJECT_ID
function parseDsn(dsn) {
  try {
    const u = new URL(dsn)
    const publicKey = u.username
    const projectId = u.pathname.replace(/^\//, '')
    return {
      host: u.host,
      projectId,
      publicKey,
      ingestUrl: `https://${u.host}/api/${projectId}/envelope/`,
    }
  } catch { return null }
}

// Costruisce envelope Sentry v7 minimal: header + event item
function buildEnvelope(parsed, payload) {
  const eventId = crypto.randomUUID().replace(/-/g, '')
  const sentAt = new Date().toISOString()
  const envelopeHeader = JSON.stringify({
    event_id: eventId,
    sent_at: sentAt,
    dsn: `https://${parsed.publicKey}@${parsed.host}/${parsed.projectId}`,
  })
  const event = {
    event_id: eventId,
    timestamp: sentAt,
    platform: 'javascript',
    level: payload.level || 'error',
    environment: payload.environment || 'production',
    release: payload.release || undefined,
    exception: {
      values: [{
        type: payload.error?.name || 'Error',
        value: payload.error?.message || 'Unknown',
        stacktrace: payload.error?.stack
          ? { frames: parseStack(payload.error.stack) }
          : undefined,
      }],
    },
    request: {
      url: payload.url || undefined,
      headers: payload.ua ? { 'User-Agent': payload.ua } : undefined,
    },
    user: payload.user ? { id: payload.user.id, hash: payload.user.email_hash } : undefined,
    tags: { source: 'foodios-client' },
    extra: payload.extra ? { detail: payload.extra } : undefined,
  }
  const itemHeader = JSON.stringify({ type: 'event' })
  const itemBody = JSON.stringify(event)
  return `${envelopeHeader}\n${itemHeader}\n${itemBody}\n`
}

function parseStack(stack) {
  return stack.split('\n').slice(0, 30).map(line => ({
    filename: 'app',
    function: line.trim(),
    in_app: true,
  }))
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const ip = getClientIP(req)
  const supabase = await getSupabase()

  // Rate limit per evitare flood: 100 errori/ora per IP, ban 1h
  const rl = await checkRateLimit(supabase, `error-report:${ip}`, 100, 3600, 3600)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  let payload
  try { payload = await req.json() } catch { return new Response('Bad payload', { status: 400 }) }

  // Cap size del payload
  if (JSON.stringify(payload).length > 10_000) {
    return new Response('Payload too large', { status: 413 })
  }

  // Inoltra a Sentry se configurato
  const dsn = process.env.SENTRY_DSN
  if (dsn) {
    const parsed = parseDsn(dsn)
    if (parsed) {
      try {
        const envelope = buildEnvelope(parsed, payload)
        await fetch(parsed.ingestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-sentry-envelope',
            'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=foodios/1.0`,
          },
          body: envelope,
        })
      } catch (e) { /* Sentry giù → fallback su audit_log */ }
    }
  }

  // Backup interno: salviamo in audit_log per audit history
  try {
    await supabase.from('audit_log').insert({
      operation: `client_error_${payload.level || 'error'}`,
      user_agent: (payload.ua || '').slice(0, 256),
      client_ip: ip,
      new_data: {
        message: payload.error?.message?.slice(0, 200),
        url: payload.url,
        env: payload.environment,
      },
    })
  } catch { /* audit_log opzionale */ }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
  })
}
