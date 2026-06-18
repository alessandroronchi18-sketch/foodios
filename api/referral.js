export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, json, getClientIP } from './lib/cors.js'
import { sanitizeStrict } from './lib/validate.js'
import { safeError } from './lib/safeError.js'

const APP_URL = 'https://foodios-rose.vercel.app'

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

async function getUser(req, supabase) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const { data: { user }, error } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (error || !user) return null
  return user
}

function generaCodice(nomeAttivita) {
  const prefix = (nomeAttivita || 'FOOD')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X')
  // 6 caratteri alfanumerici crypto-random (no ambigui: niente 0/O, I/1)
  // 32^6 = 1G combinazioni → impossibile da brute-forzare con rate limit attivo.
  const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  const suffix = Array.from(buf, b => ALPH[b % ALPH.length]).join('')
  return `${prefix}${suffix}`
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)

  const ip = getClientIP(req)
  const supabase = await getSupabase()

  // Rate limit: 10 req/min per IP
  const rl = await checkRateLimit(supabase, `referral:${ip}`, 10, 60)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  const user = await getUser(req, supabase)
  if (!user) return json({ error: 'Non autorizzato' }, 401, req)

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.organization_id) return json({ error: 'Organizzazione non trovata' }, 404, req)
  const orgId = profile.organization_id

  if (req.method === 'GET') {
    let { data: referral } = await supabase
      .from('referral')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle()

    if (!referral) {
      const { data: org } = await supabase
        .from('organizations')
        .select('nome, nome_attivita')
        .eq('id', orgId)
        .single()

      const nomeBase = org?.nome || org?.nome_attivita || 'FOOD'

      // Genera + insert con retry esplicito su 23505 (race fra select e insert).
      // Con 32^6 combinazioni le collisioni reali sono ~0; un retry max 5 basta.
      let created = null
      let lastError = null
      for (let attempt = 0; attempt < 5; attempt++) {
        const codice = generaCodice(nomeBase)
        const { data, error } = await supabase
          .from('referral')
          .insert({ organization_id: orgId, codice })
          .select()
          .single()
        if (!error) { created = data; break }
        lastError = error
        // 23505 = unique constraint violation → riprova con nuovo codice random.
        if (error.code !== '23505') break
      }
      if (!created) {
        const safe = safeError(lastError || new Error('referral create failed'), { endpoint: 'referral', op: 'create_code', orgId })
        return json(safe.body, safe.status, req)
      }
      referral = created
    }

    return json({
      codice: referral.codice,
      utilizzi: referral.utilizzi,
      mesi_guadagnati: referral.mesi_guadagnati,
      url: `${APP_URL}/r/${referral.codice}`,
    }, 200, req)
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}))
    // Sanitizza il codice: solo alfanumerico, max 12 caratteri
    const codice = sanitizeStrict(body.codice || '', 12)
      .replace(/[^A-Z0-9]/g, '')
    if (!codice || codice.length < 4) return json({ error: 'Codice non valido' }, 400, req)

    const { data: org } = await supabase
      .from('organizations')
      .select('referral_code_usato, trial_ends_at')
      .eq('id', orgId)
      .single()

    if (org?.referral_code_usato) {
      return json({ error: 'Hai già usato un codice referral' }, 400, req)
    }

    const { data: referral } = await supabase
      .from('referral')
      .select('id, organization_id, utilizzi, mesi_guadagnati')
      .eq('codice', codice)
      .maybeSingle()

    if (!referral) return json({ error: 'Codice non valido' }, 404, req)
    if (referral.organization_id === orgId) {
      return json({ error: 'Non puoi usare il tuo stesso codice' }, 400, req)
    }

    // Bug fix: prima si settava trial_ends_at a now+60 sostituendo l'originale.
    // Se il trial originario era a +90 giorni, l'utente PERDEVA 30 giorni invece
    // di guadagnarne 60. Ora estendiamo correttamente:
    //   - se il trial corrente è in futuro → aggiungi 60 giorni a quello
    //   - se è già scaduto → 60 giorni da oggi
    const trialBaseTs = org?.trial_ends_at ? new Date(org.trial_ends_at).getTime() : 0
    const nowTs = Date.now()
    const startTs = trialBaseTs > nowTs ? trialBaseTs : nowTs
    const trialEnd = new Date(startTs + 60 * 86400_000)

    // Update atomico: applica SOLO se referral_code_usato è ancora NULL.
    // Audit 2026-06-17 CRITICAL: senza questa guardia, due richieste concorrenti
    // dello stesso utente passavano entrambe il check su org?.referral_code_usato
    // e raddoppiavano il trial + bonus referrer.
    const { data: claimed, error: claimErr } = await supabase
      .from('organizations')
      .update({
        referral_code_usato: codice,
        trial_ends_at: trialEnd.toISOString(),
      })
      .eq('id', orgId)
      .is('referral_code_usato', null)
      .select('id')

    if (claimErr) return json({ error: 'Errore applicazione codice' }, 500, req)
    if (!claimed || claimed.length === 0) {
      // Race: un'altra richiesta concorrente ha già applicato un codice referral.
      return json({ error: 'Hai già usato un codice referral' }, 409, req)
    }

    await supabase.from('referral').update({
      utilizzi: referral.utilizzi + 1,
      mesi_guadagnati: referral.mesi_guadagnati + 1,
    }).eq('id', referral.id)

    const { data: invitingOrg } = await supabase
      .from('organizations').select('mesi_bonus').eq('id', referral.organization_id).single()

    await supabase.from('organizations')
      .update({ mesi_bonus: (invitingOrg?.mesi_bonus || 0) + 1 })
      .eq('id', referral.organization_id)

    return json({ success: true, trial_ends_at: trialEnd.toISOString() }, 200, req)
  }

  return json({ error: 'Metodo non supportato' }, 405, req)
}
