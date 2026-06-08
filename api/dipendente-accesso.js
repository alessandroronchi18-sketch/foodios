// Azioni del titolare sugli account dipendente: ATTIVA / DISATTIVA / ELIMINA.
// Lato client la RLS NON consente al titolare di aggiornare la riga profiles di
// un altro utente (l'update è un no-op silenzioso): quindi queste azioni passano
// dal server con la service key. Autorizzazione: solo il TITOLARE dell'org del
// dipendente. Invito/revoca inviti restano client-side (RLS su org_inviti).
export const config = { runtime: 'edge' }

import { verificaToken } from './lib/auth.js'
import { handleOptions, json } from './lib/cors.js'

const AZIONI = ['attiva', 'disattiva', 'elimina']

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const { user, profile, supabase, error } = await verificaToken(req)
  if (error || !user) return json({ error: error || 'Non autorizzato' }, 401, req)
  if (profile.ruolo === 'dipendente') return json({ error: 'Operazione riservata al titolare' }, 403, req)
  const orgId = profile.organization_id

  let body
  try { body = await req.json() } catch { return json({ error: 'Body non valido' }, 400, req) }
  const targetUserId = (body?.targetUserId || '').toString()
  const azione = (body?.azione || '').toString()
  if (!targetUserId) return json({ error: 'targetUserId mancante' }, 400, req)
  if (!AZIONI.includes(azione)) return json({ error: 'azione non valida' }, 400, req)
  if (targetUserId === user.id) return json({ error: 'Non puoi modificare il tuo stesso account' }, 400, req)

  // Il target deve essere un DIPENDENTE della STESSA org del titolare.
  const { data: target, error: tErr } = await supabase
    .from('profiles').select('id, organization_id, ruolo, email').eq('id', targetUserId).maybeSingle()
  if (tErr) return json({ error: 'Lettura profilo fallita' }, 500, req)
  if (!target || target.organization_id !== orgId) return json({ error: 'Dipendente non trovato nella tua azienda' }, 404, req)
  if (target.ruolo !== 'dipendente') return json({ error: 'Operazione consentita solo sugli account dipendente' }, 403, req)

  if (azione === 'elimina') {
    const { error: pErr } = await supabase.from('profiles').delete().eq('id', targetUserId).eq('organization_id', orgId)
    if (pErr) return json({ error: 'Eliminazione fallita: ' + pErr.message }, 500, req)
    if (target.email) {
      try { await supabase.from('org_inviti').delete().eq('organization_id', orgId).ilike('email', target.email) } catch { /* noop */ }
    }
    try { await supabase.auth.admin.deleteUser(targetUserId) } catch { /* accesso già revocato senza profilo */ }
    return json({ ok: true, azione }, 200, req)
  }

  // attiva / disattiva → service key (bypassa la RLS che blocca l'update cross-user)
  const approvato = azione === 'attiva'
  const { error: uErr } = await supabase
    .from('profiles').update({ approvato }).eq('id', targetUserId).eq('organization_id', orgId)
  if (uErr) return json({ error: 'Aggiornamento fallito: ' + uErr.message }, 500, req)
  return json({ ok: true, azione, approvato }, 200, req)
}
