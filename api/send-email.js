export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, getClientIP } from './lib/cors.js'
import { sanitize, sanitizeStrict, validateEmail } from './lib/validate.js'
import { verifyRawSecret } from './lib/cryptoCompare.js'
import { safeError } from './lib/safeError.js'

const FROM = 'FoodOS <noreply@foodios.it>'
const SUPPORT = 'support@foodios.it'
// ADMIN_EMAIL deve essere configurato su Vercel. Nessun default hardcoded.
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase()

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

async function sendEmail({ to, subject, html, replyTo }) {
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  return resend.emails.send({
    from: FROM, to, subject, html,
    ...(replyTo ? { reply_to: replyTo } : {}),
  })
}

async function isAdminRequest(req, supabase) {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return false
  try {
    const { data: { user } } = await supabase.auth.getUser(token)
    return (user?.email || '').toLowerCase() === ADMIN_EMAIL
  } catch { return false }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const ip = getClientIP(req)
  const supabase = await getSupabase()

  // Chiamata interna server→server (es. da admin.js dopo approvazione).
  // Verifica shared secret in header. Se OK, salta rate limit.
  const internalCheck = verifyRawSecret(
    req.headers.get('x-internal-secret') || '',
    process.env.INTERNAL_API_SECRET,
  )
  const isInternal = internalCheck.ok

  // Admin ha rate limit più alto
  const adminAuth = !isInternal && await isAdminRequest(req, supabase)
  if (!isInternal) {
    const rlMax = adminAuth ? 100 : 5
    const rlKey = adminAuth ? `email-admin:${ip}` : `email:${ip}`
    const rl = await checkRateLimit(supabase, rlKey, rlMax, 3600, 3600)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter)
  }

  const body = await req.json()

  // Sanitizzazione input
  const tipo         = sanitizeStrict(body.tipo || '', 50)
  const orgId        = sanitizeStrict(body.orgId || '', 36)
  const email        = sanitizeStrict(body.email || '', 255)
  const nomeAttivita = sanitize(body.nomeAttivita || '', 200)

  // Validazione email se fornita
  if (email && !validateEmail(email)) {
    return new Response(JSON.stringify({ error: 'Email non valida' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }

  const tipi_validi = ['benvenuto', 'approvazione', 'scadenza_trial', 'custom']
  if (!tipi_validi.includes(tipo)) {
    return new Response(JSON.stringify({ error: 'Tipo non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }

  // 'custom' richiede autenticazione admin (verificata sopra per il rate limit)
  if (tipo === 'custom' && !adminAuth && !isInternal) {
    return new Response(JSON.stringify({ error: 'Solo admin' }), {
      status: 403, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }

  // 'approvazione' è una notifica server→server: richiede secret interno o admin.
  // Gli altri tipi ('benvenuto', 'scadenza_trial') sono chiamati dal client autenticato
  // o da cron; il rate limit per IP basta come protezione anti-spam.
  if (tipo === 'approvazione' && !isInternal && !adminAuth) {
    return new Response(JSON.stringify({ error: 'Solo chiamata interna' }), {
      status: 403, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }

  try {
    if (tipo === 'benvenuto') {
      if (!validateEmail(email)) throw new Error('Email destinatario mancante')
      await sendEmail({
        to: email,
        subject: 'Benvenuto in FoodOS — la tua prova gratuita è iniziata 🍰',
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7;">
            <h1 style="color:#1C0A0A;font-size:24px;margin:0 0 8px;">Benvenuto in FoodOS! 🎉</h1>
            <p style="color:#6B4C44;font-size:15px;line-height:1.7;margin:0 0 20px;">
              La tua attività <strong>${escapeHtml(nomeAttivita)}</strong> è stata registrata con successo.<br>
              Hai <strong>3 mesi gratuiti</strong> per esplorare tutte le funzionalità —
              nessuna carta di credito richiesta.
            </p>
            <p style="color:#6B4C44;font-size:14px;line-height:1.7;">
              Ti contatteremo entro 24 ore per attivare il tuo account.
            </p>
            <hr style="border:none;border-top:1px solid #E8DDD8;margin:24px 0;">
            <p style="color:#9C7B76;font-size:12px;">
              Domande? Rispondi a questa email o scrivi a
              <a href="mailto:${SUPPORT}" style="color:#C0392B;">${SUPPORT}</a>
            </p>
          </div>
        `,
      })
    } else if (tipo === 'approvazione') {
      const { data: prof } = await supabase
        .from('profiles')
        .select('email, nome_completo')
        .eq('organization_id', orgId)
        .eq('ruolo', 'titolare')
        .single()
      const { data: org } = await supabase
        .from('organizations')
        .select('nome')
        .eq('id', orgId)
        .single()

      if (prof?.email && validateEmail(prof.email)) {
        await sendEmail({
          to: prof.email,
          subject: 'Il tuo account FoodOS è attivo! ✅',
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7;">
              <h1 style="color:#1C0A0A;font-size:24px;margin:0 0 8px;">Account attivato! 🎉</h1>
              <p style="color:#6B4C44;font-size:15px;line-height:1.7;margin:0 0 20px;">
                Ciao ${escapeHtml(prof.nome_completo || '')},<br>
                il tuo account per <strong>${escapeHtml(org?.nome || 'la tua attività')}</strong> è stato attivato.
              </p>
              <a href="https://foodios.it"
                 style="display:inline-block;padding:12px 28px;background:#C0392B;color:#FFF;
                        border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">
                Vai alla dashboard →
              </a>
              <hr style="border:none;border-top:1px solid #E8DDD8;margin:24px 0;">
              <p style="color:#9C7B76;font-size:12px;">
                Hai domande? Scrivici a
                <a href="mailto:${SUPPORT}" style="color:#C0392B;">${SUPPORT}</a>
              </p>
            </div>
          `,
        })
      }
    } else if (tipo === 'custom') {
      const oggetto = sanitize(body.oggetto || '', 200)
      const messaggio = sanitize(body.messaggio || '', 5000)
      if (!validateEmail(email)) throw new Error('Email destinatario mancante')
      if (!oggetto || !messaggio) throw new Error('Oggetto e messaggio obbligatori')

      // Converte newline in <br> per leggibilità, escapa HTML
      const bodyHtml = escapeHtml(messaggio).replace(/\n/g, '<br>')

      await sendEmail({
        to: email,
        subject: oggetto,
        replyTo: SUPPORT,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7;">
            <div style="background:#FFF;border:1px solid #E8DDD8;border-radius:12px;padding:28px 24px;">
              <p style="color:#1C0A0A;font-size:15px;line-height:1.7;margin:0 0 16px;">${bodyHtml}</p>
            </div>
            <hr style="border:none;border-top:1px solid #E8DDD8;margin:24px 0;">
            <p style="color:#9C7B76;font-size:12px;">
              Inviato dal team FoodOS · scrivici a
              <a href="mailto:${SUPPORT}" style="color:#C0392B;">${SUPPORT}</a>
            </p>
          </div>
        `,
      })
    } else if (tipo === 'scadenza_trial') {
      if (!validateEmail(email)) throw new Error('Email destinatario mancante')
      await sendEmail({
        to: email,
        subject: 'La tua prova FoodOS scade tra 7 giorni ⏰',
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7;">
            <h1 style="color:#1C0A0A;font-size:24px;margin:0 0 8px;">La tua prova sta per scadere</h1>
            <p style="color:#6B4C44;font-size:15px;line-height:1.7;margin:0 0 20px;">
              La tua prova gratuita di FoodOS scade tra <strong>7 giorni</strong>.<br>
              I tuoi dati saranno conservati, ma non potrai accedervi senza un abbonamento attivo.
            </p>
            <a href="mailto:${SUPPORT}?subject=Attivazione%20abbonamento%20FoodOS"
               style="display:inline-block;padding:12px 28px;background:#C0392B;color:#FFF;
                      border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">
              Attiva ora →
            </a>
            <hr style="border:none;border-top:1px solid #E8DDD8;margin:24px 0;">
            <p style="color:#9C7B76;font-size:12px;">
              Hai domande? Scrivi a
              <a href="mailto:${SUPPORT}" style="color:#C0392B;">${SUPPORT}</a>
            </p>
          </div>
        `,
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  } catch (err) {
    const safe = safeError(err, { endpoint: 'send-email', tipo })
    return new Response(JSON.stringify(safe.body), {
      status: safe.status, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }
}
