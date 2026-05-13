export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, getClientIP } from './lib/cors.js'
import { sanitizeStrict, validateUUID } from './lib/validate.js'

const ADMIN_EMAIL = 'alessandroar@maradeiboschi.com'

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

async function verificaAdmin(req, supabase) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const { data: { user }, error } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (error || !user || user.email !== ADMIN_EMAIL) return null
  return user
}

async function logAdmin(supabase, adminEmail, azione, orgId, ip, userAgent) {
  try {
    await supabase.from('admin_log').insert({
      admin_email: adminEmail,
      azione,
      org_id: orgId || null,
      ip,
      user_agent: (userAgent || '').slice(0, 200),
    })
  } catch { /* non bloccare per errore di log */ }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)

  const ip = getClientIP(req)

  // IP Whitelist opzionale
  const ADMIN_IPS = process.env.ADMIN_IPS?.split(',').map(s => s.trim()).filter(Boolean) || []
  if (ADMIN_IPS.length > 0 && !ADMIN_IPS.includes(ip)) {
    return new Response('Forbidden', { status: 403 })
  }

  const supabase = await getSupabase()

  // Rate limit: 30 req/min per IP (più generoso per admin)
  const rl = await checkRateLimit(supabase, `admin:${ip}`, 30, 60, 300)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  const user = await verificaAdmin(req, supabase)
  if (!user) {
    await logAdmin(supabase, 'UNKNOWN', 'accesso_negato', null, ip, req.headers.get('user-agent'))
    return new Response(JSON.stringify({ error: 'Accesso negato' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }

  const ua = req.headers.get('user-agent') || ''

  // GET — lista clienti
  if (req.method === 'GET') {
    await logAdmin(supabase, user.email, 'lista_clienti', null, ip, ua)

    const [overviewRes, usersRes] = await Promise.all([
      supabase.from('admin_overview').select('*').order('registrata_il', { ascending: false }),
      supabase.auth.admin.listUsers({ perPage: 1000 }),
    ])

    if (overviewRes.error) {
      return new Response(JSON.stringify({ error: overviewRes.error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    const authMap = {}
    for (const u of usersRes.data?.users || []) {
      authMap[u.email] = u.last_sign_in_at || null
    }

    const clienti = (overviewRes.data || []).map(c => ({
      ...c,
      ultimo_accesso: authMap[c.email] || null,
    }))

    return new Response(JSON.stringify({ clienti }), {
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }

  // POST — azioni admin
  if (req.method === 'POST') {
    const body = await req.json()
    const orgId = sanitizeStrict(body.orgId || '', 36)
    const tipo  = sanitizeStrict(body.tipo || '', 50)
    const valore = sanitizeStrict(body.valore || '', 100)

    if (!orgId || !tipo) {
      return new Response(JSON.stringify({ error: 'Parametri mancanti' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }
    if (!validateUUID(orgId)) {
      return new Response(JSON.stringify({ error: 'orgId non valido' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    let error = null

    if (tipo === 'approva') {
      const r1 = await supabase.from('organizations').update({ approvato: true }).eq('id', orgId)
      const r2 = await supabase.from('profiles').update({ approvato: true }).eq('organization_id', orgId)
      error = r1.error || r2.error
      if (!error) {
        await fetch(new URL('/api/send-email', req.url).toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: 'approvazione', orgId }),
        }).catch(() => {})
      }
    } else if (tipo === 'blocca') {
      const r = await supabase.from('organizations').update({ attivo: false }).eq('id', orgId)
      error = r.error
    } else if (tipo === 'cambia_piano') {
      const piani = ['trial', 'base', 'pro', 'enterprise']
      if (!piani.includes(valore)) {
        return new Response(JSON.stringify({ error: 'Piano non valido' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
        })
      }
      const r = await supabase.from('organizations').update({ piano: valore }).eq('id', orgId)
      error = r.error
    } else {
      return new Response(JSON.stringify({ error: 'Azione non riconosciuta' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }

    await logAdmin(supabase, user.email, tipo, orgId, ip, ua)

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }

  return new Response('Method not allowed', { status: 405 })
}
