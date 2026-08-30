// POST /api/laboratorio-crea
// -----------------------------------------------------------------------------
// Il titolare crea un nuovo account "laboratorio" (email + password condivisa
// per il tablet fisico di quella sede). Passi:
//   1) Verifica che chi chiama sia titolare
//   2) Rate limit 20 crea/15min
//   3) Valida input: email, password sicura, sede_id appartenente all'org, nome
//   4) supabase.auth.admin.createUser (password come scelta dal titolare)
//   5) UPDATE profiles: ruolo=dipendente, is_laboratorio_account=true,
//      laboratorio_sede_id, approvato=true, nome_completo
//   6) Email di notifica al laboratorio (senza password in chiaro)
//
// Se l'account laboratorio esiste già (email trovata in profiles per questa
// org, is_laboratorio_account=true) → aggiorna password + nome + sede.
// Se esiste ma non e' laboratorio → 409 conflict.
//
// La password del laboratorio DEVE essere una password Supabase valida
// (8+ char). Il codice 4 cifre e' un'ALTRA cosa (dipendenti_codici),
// non passa da qui.
// -----------------------------------------------------------------------------

export const config = { runtime: 'edge' }

import { verificaToken } from './lib/auth.js'
import { handleOptions, json } from './lib/cors.js'
import { checkRateLimit } from './lib/rateLimit.js'
import { validateEmail } from './lib/validate.js'
import { templateAccessoLaboratorio } from './lib/emailTemplates.js'

const FROM = 'Foodos <noreply@foodos.it>'
const PWD_MIN = 8

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) return { skipped: true }
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  return resend.emails.send({ from: FROM, to, subject, html })
}

function passwordSicura(p) {
  if (!p || p.length < PWD_MIN) return false
  const hasLetter = /[A-Za-z]/.test(p)
  const hasNumber = /[0-9]/.test(p)
  return hasLetter && hasNumber
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const { user, profile, supabase, error } = await verificaToken(req)
  if (error || !user) return json({ error: error || 'Non autorizzato' }, 401, req)
  if (profile.ruolo === 'dipendente') {
    return json({ error: 'Operazione riservata al titolare' }, 403, req)
  }

  try {
    const rl = await checkRateLimit(supabase, `lab-crea:${user.id}`, 20, 15 * 60)
    if (!rl.allowed) return json({ error: 'Troppi tentativi. Riprova tra qualche minuto.' }, 429, req)
  } catch { /* fail-open */ }

  let body
  try { body = await req.json() } catch { return json({ error: 'Body non valido' }, 400, req) }

  const emailRaw = (body?.email || '').toString().trim().toLowerCase()
  const nome = (body?.nome || '').toString().trim().slice(0, 100)
  const password = body?.password != null ? (body.password || '').toString() : ''
  const passwordProvided = password.length > 0
  const sedeId = (body?.sede_id || '').toString().trim()

  if (!validateEmail(emailRaw)) return json({ error: 'Email non valida' }, 400, req)
  if (!nome || nome.length < 2) return json({ error: 'Dai un nome al laboratorio (es. "Laboratorio Torino")' }, 400, req)
  if (!sedeId) return json({ error: 'Seleziona la sede fisica del laboratorio' }, 400, req)
  if (passwordProvided && !passwordSicura(password)) {
    return json({ error: 'La password del laboratorio deve avere almeno 8 caratteri con lettere e numeri' }, 400, req)
  }
  if (emailRaw === (user.email || '').toLowerCase()) {
    return json({ error: 'Non puoi creare un laboratorio con la tua stessa email' }, 400, req)
  }

  const orgId = profile.organization_id
  const nomeAttivita = (body?.nomeAttivita || '').toString().slice(0, 120) || null

  // Verifica che la sede appartenga all'org del titolare
  const { data: sedeRow, error: sedeErr } = await supabase
    .from('sedi')
    .select('id, nome, organization_id')
    .eq('id', sedeId)
    .maybeSingle()
  if (sedeErr || !sedeRow || sedeRow.organization_id !== orgId) {
    return json({ error: 'Sede non valida' }, 400, req)
  }

  // Cerca profile esistente per questa email in questa org
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id, ruolo, is_laboratorio_account, organization_id')
    .ilike('email', emailRaw)
    .eq('organization_id', orgId)
    .maybeSingle()

  let userId = existingProfile?.id || null
  let created = false

  if (existingProfile) {
    if (existingProfile.ruolo !== 'dipendente' || existingProfile.is_laboratorio_account !== true) {
      return json({
        error: 'Esiste già un account con questa email nella tua organizzazione che non è un laboratorio.',
      }, 409, req)
    }
    // Update password (se fornita) + nome + sede
    const authUpdate = { user_metadata: { nome_completo: nome } }
    if (passwordProvided) authUpdate.password = password
    const { error: updErr } = await supabase.auth.admin.updateUserById(existingProfile.id, authUpdate)
    if (updErr) return json({ error: 'Aggiornamento fallito: ' + updErr.message }, 500, req)
    await supabase.from('profiles').update({
      nome_completo: nome,
      laboratorio_sede_id: sedeId,
      approvato: true,
    }).eq('id', existingProfile.id)
  } else {
    // Nuovo laboratorio: password obbligatoria
    if (!passwordProvided) {
      return json({ error: 'La password del laboratorio e\' obbligatoria per un nuovo account' }, 400, req)
    }
    // Blocca se email già esiste in un'altra org
    const { data: authUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existingAuth = (authUsers?.users || []).find(u => (u.email || '').toLowerCase() === emailRaw)
    if (existingAuth) {
      return json({
        error: 'Questa email e\' gia\' associata a un altro account Foodos. Usa un\'email diversa (es. laboratorio-torino@…).',
      }, 409, req)
    }

    // Insert org_inviti (pilota handle_new_user per associare all'org)
    const { error: invErr } = await supabase.from('org_inviti').insert({
      organization_id: orgId,
      email: emailRaw,
      ruolo: 'dipendente',
      stato: 'pending',
      invited_by: user.id,
    })
    if (invErr && !String(invErr.message).includes('duplicate')) {
      return json({ error: 'Creazione invito fallita: ' + invErr.message }, 500, req)
    }

    const { data: created2, error: createErr } = await supabase.auth.admin.createUser({
      email: emailRaw,
      password,
      email_confirm: true,
      user_metadata: { nome_completo: nome, ruolo: 'dipendente' },
    })
    if (createErr || !created2?.user) {
      try { await supabase.from('org_inviti').delete().eq('organization_id', orgId).ilike('email', emailRaw) } catch { /* noop */ }
      return json({ error: 'Creazione utente fallita: ' + (createErr?.message || 'unknown') }, 500, req)
    }
    userId = created2.user.id
    created = true

    await supabase.from('profiles').update({
      approvato: true,
      nome_completo: nome,
      is_laboratorio_account: true,
      laboratorio_sede_id: sedeId,
    }).eq('id', userId)
  }

  // Email best-effort (no password in chiaro)
  if (created || passwordProvided) {
    try {
      const tmpl = templateAccessoLaboratorio({
        nomeLaboratorio: nome,
        nomeAttivita,
        nomeSede: sedeRow.nome,
        tipo: created ? 'accesso_creato' : 'password_cambiata',
      })
      await sendEmail({ to: emailRaw, subject: tmpl.subject, html: tmpl.html })
    } catch { /* noop */ }
  }

  return json({ ok: true, userId, created, action: created ? 'creato' : 'aggiornato' }, 200, req)
}
