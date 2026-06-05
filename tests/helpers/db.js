// @ts-check
// Helper per test e2e a livello DB/API (senza browser): crea organizzazioni
// EFFIMERE via service key, ottiene un token utente reale via anon sign-in
// (per esercitare le RLS e le RPC come farebbe il client), e ripulisce.
//
// Richiede env: SUPABASE_URL (o VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY,
//               VITE_SUPABASE_ANON_KEY (o SUPABASE_ANON_KEY).
// Se mancano, `hasDbEnv` è false e i test che lo usano vengono skippati.

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE = process.env.SUPABASE_SERVICE_KEY || ''
const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''

export const hasDbEnv = !!(URL && SERVICE && ANON)

const noPersist = { auth: { autoRefreshToken: false, persistSession: false } }

export function serviceClient() {
  return createClient(URL, SERVICE, noPersist)
}

// Crea un'org effimera: nuovo auth user con email confermata → il trigger
// handle_new_user crea organizations + sedi + profiles. Ritorna anche un client
// autenticato col token dell'utente (per testare RLS/RPC dal lato client).
export async function createEphemeralOrg(svc, label = 'e2e') {
  // unicità senza Date.now() condiviso: combiniamo timestamp + random
  const uniq = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const email = `e2e-${label}-${uniq}@foodios-e2e.test`
  const password = `E2e!${uniq}Aa1`

  const { data, error } = await svc.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { nome_attivita: `E2E ${label} ${uniq}`, tipo_attivita: 'pasticceria', citta: 'Torino' },
  })
  if (error) throw new Error('createUser: ' + error.message)
  const userId = data.user.id

  // Attendi il trigger handle_new_user (org + sede + profile).
  let orgId = null
  for (let i = 0; i < 25 && !orgId; i++) {
    await new Promise(r => setTimeout(r, 300))
    const { data: prof } = await svc.from('profiles').select('organization_id').eq('id', userId).maybeSingle()
    orgId = prof?.organization_id || null
  }
  if (!orgId) throw new Error(`trigger handle_new_user non ha creato l'org per ${email}`)

  const { data: sede } = await svc.from('sedi').select('id').eq('organization_id', orgId).limit(1).maybeSingle()
  const sedeId = sede?.id || null

  // Token utente reale (RLS attive) via anon sign-in.
  const anon = createClient(URL, ANON, noPersist)
  const { data: sess, error: signErr } = await anon.auth.signInWithPassword({ email, password })
  if (signErr || !sess?.session) throw new Error('signIn: ' + (signErr?.message || 'no session'))
  const token = sess.session.access_token
  const userClient = createClient(URL, ANON, {
    ...noPersist,
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  return { userId, email, password, orgId, sedeId, token, userClient }
}

// Pulizia best-effort: cancella l'org (cascata su sedi/user_data/stock se FK
// cascade) e l'utente auth. Errori ignorati (è solo igiene post-test).
export async function cleanupOrg(svc, ref) {
  if (!ref) return
  try { if (ref.orgId) await svc.from('organizations').delete().eq('id', ref.orgId) } catch { /* noop */ }
  try { if (ref.userId) await svc.auth.admin.deleteUser(ref.userId) } catch { /* noop */ }
}
