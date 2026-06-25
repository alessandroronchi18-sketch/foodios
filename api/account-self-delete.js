export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { handleOptions, json, getClientIP } from './lib/cors.js'
import { sanitize, sanitizeStrict } from './lib/validate.js'
import { safeError } from './lib/safeError.js'
import { verificaToken } from './lib/auth.js'

const MOTIVI_VALIDI = [
  'troppo_costoso',
  'manca_feature',
  'non_lo_uso',
  'cambio_software',
  'troppo_complicato',
  'altro',
]

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const ip = getClientIP(req)

  const { user, profile, supabase, error } = await verificaToken(req)
  if (error || !user) return json({ error: error || 'Non autorizzato' }, 401, req)

  if (profile?.ruolo === 'dipendente') {
    return json({ error: 'Solo il titolare può cancellare l\'account.' }, 403, req)
  }
  if (!profile?.organization_id) {
    return json({ error: 'Organizzazione non trovata.' }, 404, req)
  }

  // Rate limit forte: max 3 tentativi all'ora per utente. Difesa contro
  // brute-forcing del nome attivita' (anche se la sessione e' gia' autenticata).
  const rl = await checkRateLimit(supabase, `acc-del:${user.id}`, 3, 3600)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  let body
  try { body = await req.json() } catch { return json({ error: 'JSON non valido' }, 400, req) }

  const motivo = MOTIVI_VALIDI.includes(body.motivo) ? body.motivo : 'altro'
  const feedback = sanitize(body.feedback || '', 1000)
  const conferma = sanitize(body.conferma_nome || '', 200).trim()

  // Doppio gate: il client deve mandare il nome attivita' esatto come stringa
  // di conferma (anti-cancellazione-per-errore + verifica intenzionalita').
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, nome, deleted_at')
    .eq('id', profile.organization_id)
    .maybeSingle()
  if (orgErr || !org) return json({ error: 'Organizzazione non leggibile.' }, 500, req)
  if (org.deleted_at) {
    return json({ error: 'Account già cancellato.' }, 409, req)
  }

  // Conferma case-insensitive + trim — l'utente non deve impazzire con maiuscole.
  if (conferma.toLowerCase() !== (org.nome || '').trim().toLowerCase()) {
    return json({ error: 'Il nome attività non corrisponde. Cancellazione annullata.' }, 400, req)
  }

  try {
    const { error: upErr } = await supabase
      .from('organizations')
      .update({
        deleted_at: new Date().toISOString(),
        deletion_reason: motivo,
        deletion_feedback: feedback || null,
        attivo: false,
      })
      .eq('id', profile.organization_id)
    if (upErr) throw upErr

    // Notifica admin best-effort: email con dettagli per retention/recovery.
    try {
      const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase()
      if (adminEmail && process.env.RESEND_API_KEY) {
        const motivoLabel = ({
          troppo_costoso: 'Troppo costoso',
          manca_feature: 'Manca una funzionalità',
          non_lo_uso: 'Non lo uso abbastanza',
          cambio_software: 'Sto cambiando software',
          troppo_complicato: 'Troppo complicato da usare',
          altro: 'Altro',
        })[motivo] || motivo

        const headers = { 'Content-Type': 'application/json' }
        if (process.env.INTERNAL_API_SECRET) {
          headers['x-internal-secret'] = process.env.INTERNAL_API_SECRET
        }
        await fetch(new URL('/api/send-email', req.url).toString(), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            to: adminEmail,
            subject: `[FoodOS] Cancellazione account: ${org.nome}`,
            html: `
              <h2>Account cancellato</h2>
              <p><b>${org.nome}</b> (${user.email}) ha cancellato il proprio account.</p>
              <p><b>Motivo:</b> ${motivoLabel}</p>
              ${feedback ? `<p><b>Feedback:</b><br/>${String(feedback).replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>` : ''}
              <p>L'account è in soft-delete: i dati sono integri. Riattiva da pannello admin se necessario.</p>
            `,
          }),
        })
      }
    } catch { /* silent */ }

    // Sign out: invalida tutte le sessioni dell'utente.
    try { await supabase.auth.admin.signOut(user.id) } catch { /* silent */ }

    return json({ ok: true }, 200, req)
  } catch (e) {
    return safeError(e, req, ip, 'account-self-delete')
  }
}
