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

// Ricava l'email del profilo dell'utente autenticato (dal Bearer token).
// Usata per forzare i destinatari delle email programmatiche all'indirizzo
// del chiamante stesso: nessuno puo' spedire a un indirizzo arbitrario.
async function getAuthedUserEmail(req, supabase) {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return null
  try {
    const { data: { user } } = await supabase.auth.getUser(token)
    return (user?.email || '').trim() || null
  } catch { return null }
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

  const tipi_validi = ['benvenuto', 'approvazione', 'scadenza_trial', 'custom',
    'magazzino_sotto_soglia', 'fattura_in_scadenza', 'report_mensile']
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

  // Notifiche cron (magazzino/fatture/report) sono server→server: solo secret
  // interno o admin. Senza questo guard verrebbero respinte come 'Tipo non valido'.
  if (['magazzino_sotto_soglia', 'fattura_in_scadenza', 'report_mensile'].includes(tipo) && !isInternal && !adminAuth) {
    return new Response(JSON.stringify({ error: 'Solo chiamata interna' }), {
      status: 403, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }

  // ── Anti-spoofing (audit M6) ──────────────────────────────────────────────
  // I tipi che accettano un destinatario fornito dal chiamante ('email')
  // potevano essere usati per spedire a indirizzi arbitrari (vettore phishing).
  // Regola: il destinatario `email` e' fidato SOLO se la richiesta e' admin o
  // interna. Per un normale utente autenticato il destinatario viene forzato
  // alla SUA stessa email di profilo (derivata server-side dal token); se non
  // e' autenticato la richiesta viene respinta. I tipi 'approvazione' (ricava
  // il titolare dell'org) e 'custom' (gia' admin/interno) restano invariati.
  const TIPI_CON_EMAIL = ['benvenuto', 'scadenza_trial',
    'magazzino_sotto_soglia', 'fattura_in_scadenza', 'report_mensile']
  let recipient = email
  if (TIPI_CON_EMAIL.includes(tipo) && !isInternal && !adminAuth) {
    const ownEmail = await getAuthedUserEmail(req, supabase)
    if (!ownEmail || !validateEmail(ownEmail)) {
      return new Response(JSON.stringify({ error: 'Autenticazione richiesta' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }
    // Ignora l'indirizzo fornito dal client: si invia solo all'utente stesso.
    recipient = ownEmail
  }

  try {
    if (tipo === 'benvenuto') {
      if (!validateEmail(recipient)) throw new Error('Email destinatario mancante')
      await sendEmail({
        to: recipient,
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

      // Safety guard: l'admin puo' inviare custom solo a destinatari registrati
      // come profili nel DB. Impedisce uso come gateway phishing in caso di
      // account admin compromesso. Il match e' case-insensitive.
      // Audit 2026-07-01 HIGH: escape `%`/`_` (wildcard SQL ilike) prima del
      // match — altrimenti un profilo `admin@foodios%` matcherebbe ogni email
      // che inizia per `admin@foodios`. Stesso bug di azInviaEmail.
      const emailLow = email.toLowerCase()
      const emailEscaped = emailLow.replace(/([%_\\])/g, '\\$1')
      const { data: profileMatch } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', emailEscaped)
        .limit(1)
        .maybeSingle()
      if (!profileMatch) {
        return new Response(JSON.stringify({
          error: 'Destinatario non registrato: per ragioni anti-abuso le email custom possono andare solo a clienti esistenti.',
        }), {
          status: 422, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
        })
      }

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
      if (!validateEmail(recipient)) throw new Error('Email destinatario mancante')
      await sendEmail({
        to: recipient,
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
    } else if (tipo === 'magazzino_sotto_soglia') {
      if (!validateEmail(recipient)) throw new Error('Email destinatario mancante')
      const ingredienti = Array.isArray(body.ingredienti) ? body.ingredienti : []
      const righe = ingredienti.map(i => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;color:#1C0A0A;font-size:14px;">${escapeHtml(i.nome || '—')}${i.sede ? ` <span style="color:#9C7B76;">(${escapeHtml(i.sede)})</span>` : ''}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;color:#C0392B;font-size:14px;font-weight:700;text-align:right;">${escapeHtml(String(i.giacenza ?? ''))}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;color:#6B4C44;font-size:14px;text-align:right;">${escapeHtml(String(i.soglia ?? ''))}</td>
        </tr>`).join('')
      await sendEmail({
        to: recipient,
        subject: `⚠️ ${ingredienti.length} ingrediente${ingredienti.length === 1 ? '' : 'i'} sotto soglia — FoodOS`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7;">
            <h1 style="color:#1C0A0A;font-size:22px;margin:0 0 8px;">Scorte sotto soglia 📦</h1>
            <p style="color:#6B4C44;font-size:15px;line-height:1.7;margin:0 0 20px;">
              <strong>${escapeHtml(nomeAttivita || 'La tua attività')}</strong> ha ${ingredienti.length} ingrediente${ingredienti.length === 1 ? '' : 'i'} da riordinare:
            </p>
            <table style="width:100%;border-collapse:collapse;background:#FFF;border:1px solid #E8DDD8;border-radius:8px;overflow:hidden;">
              <thead><tr style="background:#F5EDE8;">
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9C7B76;text-transform:uppercase;">Ingrediente</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:#9C7B76;text-transform:uppercase;">Giacenza</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:#9C7B76;text-transform:uppercase;">Soglia</th>
              </tr></thead>
              <tbody>${righe}</tbody>
            </table>
            <hr style="border:none;border-top:1px solid #E8DDD8;margin:24px 0;">
            <p style="color:#9C7B76;font-size:12px;">Notifica automatica FoodOS · <a href="mailto:${SUPPORT}" style="color:#C0392B;">${SUPPORT}</a></p>
          </div>
        `,
      })
    } else if (tipo === 'fattura_in_scadenza') {
      if (!validateEmail(recipient)) throw new Error('Email destinatario mancante')
      const fatture = Array.isArray(body.fatture) ? body.fatture : []
      const righe = fatture.map(f => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;color:#1C0A0A;font-size:14px;">${escapeHtml(f.fornitore || '—')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;color:#6B4C44;font-size:13px;">${escapeHtml(String(f.data_fattura || ''))}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;color:#C0392B;font-size:14px;font-weight:700;text-align:right;">€ ${Number(f.totale || 0).toFixed(2)}</td>
        </tr>`).join('')
      await sendEmail({
        to: recipient,
        subject: `📄 ${fatture.length} fattur${fatture.length === 1 ? 'a' : 'e'} in scadenza — FoodOS`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7;">
            <h1 style="color:#1C0A0A;font-size:22px;margin:0 0 8px;">Fatture in scadenza</h1>
            <p style="color:#6B4C44;font-size:15px;line-height:1.7;margin:0 0 20px;">
              <strong>${escapeHtml(nomeAttivita || 'La tua attività')}</strong> ha ${fatture.length} fattur${fatture.length === 1 ? 'a' : 'e'} fornitore in scadenza entro 7 giorni:
            </p>
            <table style="width:100%;border-collapse:collapse;background:#FFF;border:1px solid #E8DDD8;border-radius:8px;overflow:hidden;">
              <thead><tr style="background:#F5EDE8;">
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9C7B76;text-transform:uppercase;">Fornitore</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9C7B76;text-transform:uppercase;">Scadenza</th>
                <th style="padding:8px 12px;text-align:right;font-size:11px;color:#9C7B76;text-transform:uppercase;">Totale</th>
              </tr></thead>
              <tbody>${righe}</tbody>
            </table>
            <hr style="border:none;border-top:1px solid #E8DDD8;margin:24px 0;">
            <p style="color:#9C7B76;font-size:12px;">Notifica automatica FoodOS · <a href="mailto:${SUPPORT}" style="color:#C0392B;">${SUPPORT}</a></p>
          </div>
        `,
      })
    } else if (tipo === 'report_mensile') {
      if (!validateEmail(recipient)) throw new Error('Email destinatario mancante')
      const mese = sanitize(body.mese || '', 50)
      const ricavi = Number(body.ricaviTotali || 0)
      const fcMedio = Number(body.foodCostMedio || 0)
      const piuVenduto = sanitize(String(body.prodottoPiuVenduto || ''), 120)
      const menoVenduto = sanitize(String(body.prodottoMenoVenduto || ''), 120)
      const stat = (label, val) => `
        <div style="flex:1;background:#FFF;border:1px solid #E8DDD8;border-radius:8px;padding:14px 16px;">
          <div style="font-size:11px;color:#9C7B76;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">${label}</div>
          <div style="font-size:18px;font-weight:800;color:#1C0A0A;">${val}</div>
        </div>`
      await sendEmail({
        to: recipient,
        subject: `📊 Report ${escapeHtml(mese)} — FoodOS`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7;">
            <h1 style="color:#1C0A0A;font-size:22px;margin:0 0 8px;">Report di ${escapeHtml(mese)}</h1>
            <p style="color:#6B4C44;font-size:15px;line-height:1.7;margin:0 0 20px;">
              Ecco il riepilogo del mese per <strong>${escapeHtml(nomeAttivita || 'la tua attività')}</strong>:
            </p>
            <div style="display:flex;gap:10px;margin-bottom:14px;">
              ${stat('Ricavi', '€ ' + ricavi.toFixed(2))}
              ${stat('Food cost medio', fcMedio.toFixed(1) + '%')}
            </div>
            ${piuVenduto ? `<p style="color:#6B4C44;font-size:14px;line-height:1.7;margin:0 0 6px;">🥇 Più venduto: <strong>${escapeHtml(piuVenduto)}</strong></p>` : ''}
            ${menoVenduto ? `<p style="color:#6B4C44;font-size:14px;line-height:1.7;margin:0;">🐢 Meno venduto: <strong>${escapeHtml(menoVenduto)}</strong></p>` : ''}
            <hr style="border:none;border-top:1px solid #E8DDD8;margin:24px 0;">
            <p style="color:#9C7B76;font-size:12px;">Report automatico FoodOS · <a href="mailto:${SUPPORT}" style="color:#C0392B;">${SUPPORT}</a></p>
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
