import { supabase } from './supabase'

// Chiama /api/audit-export per:
//  1) registrare l'export nel audit_log lato server (con IP server e UA reale)
//  2) applicare il rate limit per org
// Ritorna { ok: true } se l'export è autorizzato, { ok: false, rateLimited, retryAfter, message } altrimenti.
// In caso di errore di rete / endpoint giù → fail-open (ok: true) per non bloccare l'utente,
// l'audit lato server è "best-effort" perché il PDF si genera comunque sul client.
export async function checkExportPermesso(tipo, scope = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { ok: true, anonymous: true }

    const r = await fetch('/api/audit-export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ tipo, scope, n_items: scope?.n_items }),
    })

    if (r.status === 429) {
      const j = await r.json().catch(() => ({}))
      const min = Math.ceil((j.retryAfter || 3600) / 60)
      return {
        ok: false,
        rateLimited: true,
        retryAfter: j.retryAfter || 3600,
        message: `Hai esportato troppi PDF in poco tempo (limite di sicurezza). Riprova tra circa ${min} minuti.`,
      }
    }
    if (!r.ok) return { ok: true, warning: 'audit_failed' }
    const j = await r.json()
    return { ok: true, watermark: j.watermark }
  } catch (e) {
    return { ok: true, warning: 'network' }
  }
}
