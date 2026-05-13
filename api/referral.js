export const config = { runtime: 'edge' }

import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'
import { getCorsHeaders, handleOptions, json, getClientIP } from './lib/cors.js'
import { sanitizeStrict } from './lib/validate.js'

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
  const digits = Math.floor(1000 + Math.random() * 9000)
  return `${prefix}${digits}`
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
      let codice
      let attempts = 0
      do {
        codice = generaCodice(nomeBase)
        const { data: existing } = await supabase
          .from('referral').select('id').eq('codice', codice).maybeSingle()
        if (!existing) break
        attempts++
      } while (attempts < 10)

      const { data: created, error } = await supabase
        .from('referral')
        .insert({ organization_id: orgId, codice })
        .select()
        .single()

      if (error) return json({ error: error.message }, 500, req)
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

    const trialEnd = new Date()
    trialEnd.setDate(trialEnd.getDate() + 60)

    await supabase.from('organizations').update({
      referral_code_usato: codice,
      trial_ends_at: trialEnd.toISOString(),
    }).eq('id', orgId)

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
