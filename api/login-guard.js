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
// L'IP è loggato (per anomaly detection) ma non è la chiave di blocco — un attaccante
// può ruotare IP, un utente legittimo non può ruotare email. Quindi blocchiamo l'email.
//
// ── Attesa progressiva invece del muro ──────────────────────────────────────
//
// Prima erano 5 tentativi falliti e poi mezz'ora fuori. Su un gestionale usato
// da proprietari di sessanta anni quella soglia si tocca per sbaglio: la
// maiuscola attivata, la password del vecchio account, un carattere accentato.
// Cinque errori onesti e non puoi lavorare per trenta minuti.
//
// Un attaccante e un signore che sbaglia la password si distinguono per la
// VELOCITÀ, non per il numero di tentativi. Un programma ne prova centinaia al
// secondo; una persona ne prova uno ogni dieci o venti secondi. Quindi non un
// muro dopo cinque, ma un'attesa che cresce: impercettibile per chi sbaglia in
// buona fede, insostenibile per chi prova a indovinare.
//
//   1-3 tentativi → nessuna attesa. Capita a tutti.
//   4°  →  5 secondi        7°  →  1 minuto
//   5°  → 15 secondi        8°  →  2 minuti
//   6°  → 30 secondi        9°  →  5 minuti
//                          10° e oltre → 15 minuti
//
// Dopo il decimo tentativo un programma automatico ha ottenuto meno di 20
// prove in un quarto d'ora: la forza bruta è morta comunque. E una persona che
// sbaglia tre volte non si accorge nemmeno che esista un limite.

const WINDOW_SEC = 15 * 60
// Da qui in poi si avvisa il titolare per email: non blocca, informa.
const SOGLIA_AVVISO = 6
// Tentativi tollerati senza alcuna attesa.
const LIBERI = 3
// Attesa in secondi a partire dal 4° tentativo fallito.
const SCALA_ATTESA = [5, 15, 30, 60, 120, 300]
const ATTESA_MAX_SEC = 15 * 60

/** Secondi di attesa dopo `n` tentativi falliti nella finestra. */
export function attesaDopo(n) {
  if (n <= LIBERI) return 0
  const i = n - LIBERI - 1
  return i < SCALA_ATTESA.length ? SCALA_ATTESA[i] : ATTESA_MAX_SEC
}

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
      `Sono stati registrati ${SOGLIA_AVVISO} tentativi di accesso falliti per il tuo account.`,
      `L'accesso non è bloccato, ma dopo ogni errore serve attendere qualche secondo in più.`,
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
    const attesa = attesaDopo(fails.length)
    if (attesa > 0) {
      // L'attesa si conta dal tentativo più RECENTE, non dal più vecchio:
      // altrimenti basterebbe aspettare che la finestra scivoli via per
      // ricominciare da capo ogni quarto d'ora.
      const ultimo = new Date(fails[0].created_at).getTime()
      const fine = ultimo + attesa * 1000
      const adesso = Date.now()
      if (adesso < fine) {
        return json({
          allowed: false,
          retryAfter: Math.ceil((fine - adesso) / 1000),
          tentativiFalliti: fails.length,
          reason: 'attesa_progressiva',
        }, 423, req)
      }
    }
    return json({ allowed: true, tentativiFalliti: fails.length }, 200, req)
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
    // Soglia raggiunta → log + notifica. Non blocca: informa il titolare che
    // qualcuno sta provando, così può reagire se non è stato lui.
    if (newFailCount === SOGLIA_AVVISO) {
      try {
        await supabase.from('audit_log').insert({
          operation: 'login_blocked_brute_force',
          user_email: email,
          user_agent: ua.slice(0, 256),
          client_ip: ip,
          new_data: { fails_in_window: newFailCount, window_sec: WINDOW_SEC, attesa_sec: attesaDopo(newFailCount) },
        })
      } catch {}
      notifyTitolare(supabase, req, email, ip, ua) // fire-and-forget
    }
    return json({
      ok: true,
      fails_recenti: newFailCount,
      attesaSec: attesaDopo(newFailCount),
    }, 200, req)
  }

  return json({ error: 'action non gestita' }, 400, req)
}
