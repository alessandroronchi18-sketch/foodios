// Elimina DEFINITIVAMENTE l'accesso di un dipendente: rimuove il profilo, gli
// inviti collegati e l'utente auth. Serve la service key (admin.deleteUser), quindi
// è un endpoint server. Autorizzazione: solo il TITOLARE dell'org del dipendente.
// Invito/attiva/disattiva avvengono invece client-side (RLS titolare-only).
export const config = { runtime: 'edge' }

import { verificaToken } from './lib/auth.js'
import { handleOptions, json } from './lib/cors.js'

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const { user, profile, supabase, error } = await verificaToken(req)
  if (error || !user) return json({ error: error || 'Non autorizzato' }, 401, req)
  // Solo il titolare può eliminare accessi.
  if (profile.ruolo === 'dipendente') return json({ error: 'Operazione riservata al titolare' }, 403, req)
  const orgId = profile.organization_id

  let body
  try { body = await req.json() } catch { return json({ error: 'Body non valido' }, 400, req) }
  const targetUserId = (body?.targetUserId || '').toString()
  if (!targetUserId) return json({ error: 'targetUserId mancante' }, 400, req)
  if (targetUserId === user.id) return json({ error: 'Non puoi eliminare te stesso' }, 400, req)

  // Il target deve essere un DIPENDENTE della STESSA org del titolare.
  const { data: target, error: tErr } = await supabase
    .from('profiles')
    .select('id, organization_id, ruolo, email')
    .eq('id', targetUserId)
    .maybeSingle()
  if (tErr) return json({ error: 'Lettura profilo fallita' }, 500, req)
  if (!target || target.organization_id !== orgId) return json({ error: 'Dipendente non trovato nella tua azienda' }, 404, req)
  if (target.ruolo !== 'dipendente') return json({ error: 'Solo gli account dipendente possono essere eliminati' }, 403, req)

  // 1) profilo, 2) inviti collegati (email), 3) utente auth.
  const { error: pErr } = await supabase.from('profiles').delete().eq('id', targetUserId).eq('organization_id', orgId)
  if (pErr) return json({ error: 'Eliminazione profilo fallita: ' + pErr.message }, 500, req)

  if (target.email) {
    try { await supabase.from('org_inviti').delete().eq('organization_id', orgId).ilike('email', target.email) } catch { /* noop */ }
  }
  try { await supabase.auth.admin.deleteUser(targetUserId) } catch { /* l'accesso è già revocato senza profilo */ }

  return json({ ok: true }, 200, req)
}
