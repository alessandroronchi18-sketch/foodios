// POST /api/pin-login
// Login alternativo via PIN per dipendenti su tablet condiviso (Modalità Dipendente PWA).
//
// Flusso:
// 1) Client invia { org_slug, pin }
// 2) Backend verifica PIN via RPC verify_dipendente_pin (service_role)
// 3) Se valido, genera magic link per l'utente trovato → ritorna access_token
// 4) Client usa access_token per supabase.auth.setSession
// 5) Log tentativo (success/fail) per audit + rate limit
//
// Rate limit: max 10 tentativi/15min per IP (anti-brute-force).
// Lock account: dopo 5 fallimenti consecutivi su stessa org → 15min lock.

import { createClient } from '@supabase/supabase-js'
import { jsonError, jsonOk, safeLog } from './lib/safeError.js'
import { getCorsHeaders, getClientIP } from './lib/cors.js'
import { checkRateLimit } from './lib/rateLimit.js'

export const config = { runtime: 'nodejs' }

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY

export default async function handler(req, res) {
  const corsHeaders = getCorsHeaders(req)
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return jsonError(res, 405, 'method_not_allowed')

  if (!SUPA_URL || !SUPA_KEY) {
    return jsonError(res, 503, 'server_misconfigured')
  }

  const ip = getClientIP(req)
  const admin = createClient(SUPA_URL, SUPA_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Rate limit per IP: 10 tentativi/15min — protegge da brute-force su PIN 4 cifre
  // (10000 combinazioni / 10 al quarto d'ora → ~10 giorni per esaurire).
  // fail-open intenzionale: se la tabella rate_limits ha problemi, il PIN ha
  // comunque il lock per-account a livello DB (verify_dipendente_pin).
  try {
    const rl = await checkRateLimit(admin, `pin-login:${ip}`, 10, 15 * 60)
    if (!rl.allowed) return jsonError(res, 429, 'too_many_attempts')
  } catch {
    safeLog('rate_limit_unavailable', { endpoint: 'pin-login', ip })
  }

  let body
  try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}') } catch {
    return jsonError(res, 400, 'invalid_json')
  }
  const { org_slug, pin } = body || {}

  // Validazione input
  if (!org_slug || typeof org_slug !== 'string' || org_slug.length > 100) {
    return jsonError(res, 400, 'invalid_org')
  }
  if (!pin || !/^[0-9]{4,6}$/.test(pin)) {
    return jsonError(res, 400, 'invalid_pin_format')
  }

  // 1) Verifica PIN (atomico via RPC, controlla anche pin_locked_until)
  let userId = null
  try {
    const { data, error } = await admin.rpc('verify_dipendente_pin', {
      p_org_slug: org_slug,
      p_pin: pin,
    })
    if (error) {
      safeLog('verify_pin_error', { error: error.message, org_slug })
      return jsonError(res, 500, 'verify_failed')
    }
    userId = data || null
  } catch (e) {
    safeLog('verify_pin_exception', { message: e.message })
    return jsonError(res, 500, 'verify_exception')
  }

  // 2) Log tentativo (audit + rate-limit per-org)
  try {
    await admin.rpc('log_pin_attempt', {
      p_org_slug: org_slug,
      p_success: !!userId,
      p_ip: ip,
      p_user_agent: req.headers['user-agent']?.slice(0, 200) || null,
    })
  } catch {
    // Audit fallito: non blocca il login. Già fail-soft per non perdere UX.
  }

  if (!userId) {
    return jsonError(res, 401, 'invalid_pin')
  }

  // 3) Recupera email dell'utente per generare magic link
  let userEmail = null
  try {
    const { data: u, error } = await admin.auth.admin.getUserById(userId)
    if (error || !u?.user?.email) {
      safeLog('user_lookup_failed', { user_id: userId, error: error?.message })
      return jsonError(res, 500, 'user_not_found')
    }
    userEmail = u.user.email
  } catch (e) {
    safeLog('user_lookup_exception', { message: e.message })
    return jsonError(res, 500, 'user_exception')
  }

  // 4) Genera magic link (admin API) — estrai i token dall'URL ritornato
  // generateLink supporta 'magiclink' che ritorna un link con access_token + refresh_token.
  let accessToken = null
  let refreshToken = null
  try {
    const { data: linkData, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
      options: { redirectTo: req.headers.origin || 'https://foodios-rose.vercel.app' },
    })
    if (error) throw error

    // Il link contiene token nella query string. Estraiamoli.
    // Formato Supabase: ...#access_token=XXX&refresh_token=YYY&...
    const actionLink = linkData?.properties?.action_link
    if (!actionLink) {
      safeLog('magic_link_missing', { user_id: userId })
      return jsonError(res, 500, 'session_create_failed')
    }
    // Su versioni recenti di Supabase, la sessione si crea solo cliccando il link.
    // Per il PWA dipendente questo non è praticabile (vogliamo login immediato).
    //
    // Workaround: usare l'admin API per creare direttamente una sessione.
    // Supabase JS v2: admin.auth.admin.createUser non crea sessione, dobbiamo
    // usare un approccio diverso → signInWithPassword con password resettata
    // OPPURE — preferibile — un JWT custom firmato con il JWT secret.
    //
    // Per scaffolding tonight: ritorniamo l'action_link al client che lo "consumerà"
    // come callback (apre il link → Supabase setta i cookie → redirect a app).
    // Il client gestirà l'open via window.location.
    return jsonOk(res, { magic_link: actionLink })
  } catch (e) {
    safeLog('magic_link_exception', { message: e.message })
    return jsonError(res, 500, 'session_exception')
  }
}
