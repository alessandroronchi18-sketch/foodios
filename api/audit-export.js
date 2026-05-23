export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, getClientIP, json } from './lib/cors.js'
import { verificaToken } from './lib/auth.js'

// Tipi di export con rate limit per ora per org.
// Ricettario è il più sensibile → limite più stringente.
const LIMITS = {
  ricettario:   { perOra: 10, blockSec: 3600 },
  pl:           { perOra: 30, blockSec: 1800 },
  produzione:   { perOra: 50, blockSec: 1800 },
  scadenzario:  { perOra: 50, blockSec: 1800 },
  default:      { perOra: 30, blockSec: 1800 },
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, req)

  const auth = await verificaToken(req)
  if (auth.error) return json({ error: auth.error }, 401, req)
  const { user, profile, supabase } = auth

  let body
  try { body = await req.json() } catch { return json({ error: 'json invalido' }, 400, req) }
  const tipo = String(body?.tipo || '').slice(0, 64).toLowerCase().replace(/[^a-z_]/g, '')
  if (!tipo) return json({ error: 'tipo richiesto' }, 400, req)

  const orgId = profile.organization_id

  // Rate limit per org × tipo
  const cfg = LIMITS[tipo] || LIMITS.default
  const rlKey = `pdf-export:${orgId}:${tipo}`
  const rl = await checkRateLimit(supabase, rlKey, cfg.perOra, 3600, cfg.blockSec)
  if (!rl.allowed) {
    // Log del tentativo bloccato (utile per indagine sicurezza)
    try {
      await supabase.from('audit_log').insert({
        organization_id: orgId,
        user_id: user.id,
        user_email: user.email,
        operation: `export_${tipo}_blocked`,
        user_agent: (req.headers.get('user-agent') || '').slice(0, 256),
        client_ip: getClientIP(req),
        new_data: { retry_after: rl.retryAfter },
      })
    } catch {}
    return rateLimitResponse(rl.retryAfter)
  }

  // Audit log (fail-soft: se la tabella non c'è, ritorna comunque OK)
  try {
    await supabase.from('audit_log').insert({
      organization_id: orgId,
      user_id: user.id,
      user_email: user.email,
      operation: `export_${tipo}`,
      user_agent: (req.headers.get('user-agent') || '').slice(0, 256),
      client_ip: getClientIP(req),
      new_data: { scope: body.scope || null, n_items: Number(body.n_items) || null },
    })
  } catch (e) { /* fail-soft */ }

  return json({
    ok: true,
    watermark: {
      org: profile.organization_id,
      email: user.email,
      ts: new Date().toISOString(),
    },
  }, 200, req)
}
