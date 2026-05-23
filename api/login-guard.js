export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, getClientIP, json } from './lib/cors.js'
import { sanitizeStrict, validateEmail } from './lib/validate.js'

// Brute-force protection per il login.
// Pattern di uso (lato client AuthPage):
//   1) PRIMA del signInWithPassword → POST { action: 'check', email }
//      → 200 { allowed: true } oppure 423 { allowed: false, until }
//   2) DOPO signIn fallito → POST { action: 'fail', email }
//   3) DOPO signIn riuscito → POST { action: 'success', email } (reset contatore)
//
// La soglia è 5 tentativi falliti in 15 minuti per email → blocco di 30 minuti.
// L'IP è loggato (per anomaly detection) ma non è il chiave di blocco — un attaccante
// può ruotare IP, un utente legittimo no email. Quindi blocchiamo l'email.

const WINDOW_SEC = 15 * 60
const MAX_FAIL = 5
const BLOCK_SEC = 30 * 60

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

async function recentFails(supabase, email) {
  const sinceIso = new Date(Date.now() - WINDOW_SEC * 1000).toISOString()
  try {
    const { data, error } = await supabase
      .from('login_attempts')
      .select('created_at, success')
      .eq('email', email)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) {
      // Se tabella non esiste, fail-soft: niente blocco. La sicurezza extra è opt-in via SQL.
      if (error.code === '42P01') return { rows: [], available: false }
      return { rows: [], available: false }
    }
    return { rows: data || [], available: true }
  } catch { return { rows: [], available: false } }
}

async function notifyTitolare(supabase, req, email, ip, ua) {
  // Best-effort: trova l'orgId del titolare e gli manda email tramite l'endpoint interno.
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('email, organization_id')
      .eq('email', email)
      .maybeSingle()
    if (!prof?.email) return
    if (!process.env.INTERNAL_API_SECRET) return // nessun secret = niente invio (evita spam)

    const messaggio = [
      `Sono stati registrati ${MAX_FAIL} tentativi di accesso falliti per il tuo account.`,
      `L'account è temporaneamente bloccato per 30 minuti.`,
      ``,
      `IP del tentativo: ${ip}`,
      `Browser: ${(ua || '').slice(0, 120)}`,
      ``,
      `Se non sei stato tu, cambia subito la password.`,
    ].join('\n')

    await fetch(new URL('/api/send-email', req.url).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify({
        tipo: 'custom',
        email: prof.email,
        oggetto: '🔒 FoodOS: tentativi di accesso falliti',
        messaggio,
      }),
    })
  } catch { /* notification best-effort */ }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const ip = getClientIP(req)
  const ua = req.headers.get('user-agent') || ''
  // Vercel aggiunge automaticamente x-vercel-ip-country (ISO 2-letter). Comodo per geoIP-lite.
  const country = (req.headers.get('x-vercel-ip-country') || '').slice(0, 2).toUpperCase() || null
  const supabase = await getSupabase()

  // Rate limit aggressivo per IP — anche solo "check" può essere usato per enumerazione.
  const rl = await checkRateLimit(supabase, `login-guard:${ip}`, 30, 60, 600)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  let body
  try { body = await req.json() } catch { return json({ error: 'json invalido' }, 400, req) }

  const action = sanitizeStrict(body.action || '', 16)
  const email = sanitizeStrict(body.email || '', 255).toLowerCase()
  if (!validateEmail(email)) return json({ error: 'email non valida' }, 400, req)
  if (!['check', 'fail', 'success'].includes(action)) {
    return json({ error: 'action non valida' }, 400, req)
  }

  const { rows, available } = await recentFails(supabase, email)
  if (!available) return json({ allowed: true, available: false }, 200, req)

  const fails = rows.filter(r => r.success === false)

  if (action === 'check') {
    if (fails.length >= MAX_FAIL) {
      const oldest = fails[fails.length - 1]
      const blockEnd = new Date(new Date(oldest.created_at).getTime() + BLOCK_SEC * 1000)
      const now = new Date()
      if (now < blockEnd) {
        return json({
          allowed: false,
          retryAfter: Math.ceil((blockEnd - now) / 1000),
          reason: 'too_many_fails',
        }, 423, req)
      }
    }
    return json({ allowed: true }, 200, req)
  }

  if (action === 'success') {
    // Registra il successo: lo lasciamo in tabella per anomaly detection (paese cambiato ecc.)
    try {
      await supabase.from('login_attempts').insert({
        email, success: true, ip, country, user_agent: ua.slice(0, 256),
      })
    } catch {}
    return json({ ok: true }, 200, req)
  }

  if (action === 'fail') {
    try {
      await supabase.from('login_attempts').insert({
        email, success: false, ip, country, user_agent: ua.slice(0, 256),
      })
    } catch {}
    const newFailCount = fails.length + 1
    // Soglia raggiunta → log + notifica
    if (newFailCount === MAX_FAIL) {
      try {
        await supabase.from('audit_log').insert({
          operation: 'login_blocked_brute_force',
          user_email: email,
          user_agent: ua.slice(0, 256),
          client_ip: ip,
          new_data: { fails_in_window: newFailCount, window_sec: WINDOW_SEC, block_sec: BLOCK_SEC },
        })
      } catch {}
      notifyTitolare(supabase, req, email, ip, ua) // fire-and-forget
    }
    return json({
      ok: true,
      fails_recenti: newFailCount,
      bloccato: newFailCount >= MAX_FAIL,
    }, 200, req)
  }

  return json({ error: 'action non gestita' }, 400, req)
}
