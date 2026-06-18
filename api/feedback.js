export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { handleOptions, json, getClientIP } from './lib/cors.js'
import { sanitize, sanitizeStrict, validateUrl } from './lib/validate.js'
import { safeError } from './lib/safeError.js'
import { verificaToken } from './lib/auth.js'

const SENTIMENT_VALIDI = ['bug', 'feature', 'feedback', 'complimento']

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const ip = getClientIP(req)

  // Auth canonico via verificaToken (gate org attiva + trial — audit 2026-06-17
  // MEDIUM: prima si usava getUser locale che non verificava lo stato dell'org,
  // permettendo a trial scaduti o org disattivate di continuare a spammare).
  const { user, profile, supabase, error } = await verificaToken(req)
  if (error || !user) return json({ error: error || 'Non autorizzato' }, 401, req)

  // Rate limit doppio: per IP (5/min) E per user (10/min) — audit 2026-06-17
  // MEDIUM: solo per IP era aggirabile cambiando rete (mobile/wifi).
  const rl = await checkRateLimit(supabase, `feedback:${ip}`, 5, 60)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)
  const rlUser = await checkRateLimit(supabase, `feedback-user:${user.id}`, 10, 60)
  if (!rlUser.allowed) return rateLimitResponse(rlUser.retryAfter)

  let body
  try { body = await req.json() } catch { return json({ error: 'JSON non valido' }, 400, req) }

  const messaggio = sanitize(body.messaggio || '', 2000)
  if (!messaggio || messaggio.length < 3) {
    return json({ error: 'Messaggio troppo corto' }, 400, req)
  }
  const sentiment = SENTIMENT_VALIDI.includes(body.sentiment) ? body.sentiment : 'feedback'
  const viewCorrente = sanitizeStrict(body.view_corrente || '', 80)
  // URL utente: sanitize + valida protocol (http/https). Difesa anti-XSS
  // contro javascript:/data:/vbscript: che ne admin inbox potrebbero
  // diventare click malicious.
  const urlRaw = sanitize(body.url || '', 500)
  const urlCorrente = validateUrl(urlRaw) ? urlRaw : ''

  if (!profile?.organization_id) {
    return json({ error: 'Organizzazione non trovata' }, 404, req)
  }

  try {
    const { error } = await supabase.from('feedback').insert({
      organization_id: profile.organization_id,
      user_id: user.id,
      user_email: profile.email || user.email || null,
      ruolo: profile.ruolo || 'titolare',
      view_corrente: viewCorrente || null,
      messaggio,
      sentiment,
      url: urlCorrente || null,
      user_agent: (req.headers.get('user-agent') || '').slice(0, 300),
      // Audit 2026-07-01 HIGH: client_ip per forensica anti-abuso (spam, contenuto
      // offensivo). Stessa pipeline IP usata da login-guard / rate-limit.
      client_ip: ip || null,
    })
    if (error) throw error

    // Notifica admin: best-effort fire-and-forget. Se ADMIN_EMAIL o
    // INTERNAL_API_SECRET o RESEND_API_KEY non sono configurati, salta in
    // silenzio (la riga DB e' stata scritta comunque → admin vedra' nel pannello).
    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase()
    if (adminEmail && process.env.RESEND_API_KEY) {
      const sentimentLabel = ({
        bug: '🐛 Bug', feature: '💡 Idea', feedback: '💬 Feedback', complimento: '🎉 Complimento',
      })[sentiment] || '💬 Feedback'

      // Carica nome attivita' per la subject
      let nomeAttivita = 'cliente'
      try {
        const { data: org } = await supabase
          .from('organizations')
          .select('nome')
          .eq('id', profile.organization_id)
          .single()
        if (org?.nome) nomeAttivita = org.nome
      } catch { /* ignore */ }

      const base = new URL(req.url).origin
      const internalHeaders = process.env.INTERNAL_API_SECRET
        ? { 'x-internal-secret': process.env.INTERNAL_API_SECRET }
        : {}
      // Usa /api/send-email tipo='custom' tramite secret interno (bypassa
      // l'auth admin che richiederebbe un JWT admin in questa chiamata).
      fetch(`${base}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...internalHeaders },
        body: JSON.stringify({
          tipo: 'custom',
          email: adminEmail,
          oggetto: `${sentimentLabel} da ${nomeAttivita}`,
          messaggio: [
            `Cliente: ${nomeAttivita} (${profile.email || user.email || '—'})`,
            viewCorrente ? `Vista: ${viewCorrente}` : null,
            urlCorrente ? `URL: ${urlCorrente}` : null,
            '',
            messaggio,
            '',
            '— Apri il pannello admin → 📨 Feedback dai clienti per gestire.',
          ].filter(Boolean).join('\n'),
        }),
      }).catch(e => console.error('[feedback] admin notify failed', e?.message))
    }

    return json({ ok: true }, 200, req)
  } catch (err) {
    const safe = safeError(err, { endpoint: 'feedback', userId: user.id }, 500, supabase)
    return json(safe.body, safe.status, req)
  }
}
