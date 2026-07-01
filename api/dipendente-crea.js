// POST /api/dipendente-crea
// -----------------------------------------------------------------------------
// Il titolare crea un nuovo dipendente specificando: email, nome, codice 6 cifre.
// Questo endpoint fa 4 cose:
//   1) Verifica che chi chiama sia titolare della propria org
//   2) Inserisce riga in org_inviti (email pre-autorizzata) — pilota handle_new_user()
//   3) supabase.auth.admin.createUser(email, password=codice, email_confirm=true)
//      → trigger handle_new_user() consuma l'invito e crea profile (dipendente, approvato=false)
//   4) UPDATE profiles.approvato=true (il titolare ha gia' autorizzato) + set nome_completo
//   5) email di notifica al dipendente via Resend (NO codice in chiaro nell'email)
//
// Se il dipendente esiste gia' (email trovata in profiles per questa org):
//   → aggiorna solo password + nome (equivalente a "cambia codice / cambia nome")
//
// Autorizzazione: solo TITOLARE dell'org.
// Rate limit: 20 chiamate / 15min per titolare (previene abuso creazione).
// -----------------------------------------------------------------------------

export const config = { runtime: 'edge' }

import { verificaToken } from './lib/auth.js'
import { handleOptions, json } from './lib/cors.js'
import { checkRateLimit } from './lib/rateLimit.js'
import { validateEmail } from './lib/validate.js'
import { templateAccessoDipendente } from './lib/emailTemplates.js'

const FROM = 'Foodos <noreply@foodios.it>'
const CODICE_RE = /^\d{6}$/
const CODICI_BANNATI = new Set([
  '000000','111111','222222','333333','444444','555555','666666','777777','888888','999999',
  '123456','654321','012345','543210',
])

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) return { skipped: true }
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  return resend.emails.send({ from: FROM, to, subject, html })
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const { user, profile, supabase, error } = await verificaToken(req)
  if (error || !user) return json({ error: error || 'Non autorizzato' }, 401, req)
  if (profile.ruolo === 'dipendente') {
    return json({ error: 'Operazione riservata al titolare' }, 403, req)
  }

  // Rate limit per titolare (previene creazione massa/abuso).
  try {
    const rl = await checkRateLimit(supabase, `dip-crea:${user.id}`, 20, 15 * 60)
    if (!rl.allowed) return json({ error: 'Troppi tentativi. Riprova tra qualche minuto.' }, 429, req)
  } catch { /* fail-open sul rate limit */ }

  let body
  try { body = await req.json() } catch { return json({ error: 'Body non valido' }, 400, req) }

  const emailRaw = (body?.email || '').toString().trim().toLowerCase()
  const nome = (body?.nome || '').toString().trim().slice(0, 100)
  const codice = body?.codice != null ? (body.codice || '').toString().trim() : ''
  const codiceProvided = codice.length > 0

  if (!validateEmail(emailRaw)) return json({ error: 'Email non valida' }, 400, req)
  if (!nome || nome.length < 2) return json({ error: 'Nome mancante (minimo 2 caratteri)' }, 400, req)
  // Codice obbligatorio solo se stiamo creando un nuovo dipendente (branch sotto lo forza)
  if (codiceProvided) {
    if (!CODICE_RE.test(codice)) return json({ error: 'Il codice deve essere di 6 cifre numeriche' }, 400, req)
    if (CODICI_BANNATI.has(codice)) {
      return json({ error: 'Codice troppo semplice (evita sequenze e ripetizioni come 123456 o 000000)' }, 400, req)
    }
  }
  if (emailRaw === (user.email || '').toLowerCase()) {
    return json({ error: 'Non puoi creare un accesso dipendente con la tua stessa email' }, 400, req)
  }

  const orgId = profile.organization_id
  const nomeAttivita = (body?.nomeAttivita || '').toString().slice(0, 120) || null

  // Passo 1: verifica se esiste gia' un profile dipendente per questa email nella stessa org.
  // Se si → "cambia codice / aggiorna nome" (branch update).
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id, organization_id, ruolo, email')
    .ilike('email', emailRaw)
    .eq('organization_id', orgId)
    .maybeSingle()

  let userId = existingProfile?.id || null
  let created = false

  if (existingProfile) {
    if (existingProfile.ruolo !== 'dipendente') {
      return json({ error: 'Esiste gia\' un account con questa email che non e\' un dipendente' }, 400, req)
    }
    // Update codice (se fornito) + nome_completo. Nome sempre aggiornato.
    const authUpdate = { user_metadata: { nome_completo: nome } }
    if (codiceProvided) authUpdate.password = codice
    const { error: updErr } = await supabase.auth.admin.updateUserById(existingProfile.id, authUpdate)
    if (updErr) {
      return json({ error: 'Aggiornamento fallito: ' + updErr.message }, 500, req)
    }
    const profileUpdate = { nome_completo: nome, approvato: true }
    if (codiceProvided) profileUpdate.dipendente_codice_set_at = new Date().toISOString()
    await supabase.from('profiles').update(profileUpdate).eq('id', existingProfile.id)
    // Assicura che l'invito sia marcato accettato (idempotenza)
    try {
      await supabase.from('org_inviti')
        .update({ stato: 'accettato', accepted_user_id: existingProfile.id, accepted_at: new Date().toISOString() })
        .eq('organization_id', orgId).ilike('email', emailRaw).eq('stato', 'pending')
    } catch { /* noop */ }
  } else {
    // Nuovo dipendente: il codice diventa obbligatorio.
    if (!codiceProvided) {
      return json({ error: 'Il codice a 6 cifre e\' obbligatorio per un nuovo dipendente' }, 400, req)
    }
    // Verifica che questa email non appartenga a un TITOLARE di un'altra org.
    // Se sì, blocca (non possiamo riassegnare un titolare ad altra org).
    const { data: authUserByEmail } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existingAuthUser = (authUserByEmail?.users || []).find(u => (u.email || '').toLowerCase() === emailRaw)
    if (existingAuthUser) {
      // Auth user gia' esistente ma senza profile in questa org → conflitto multi-org non gestito
      return json({
        error: 'Questa email e\' gia\' associata a un altro account Foodos. Il dipendente deve usare una email diversa (es. mario.laboratorio@… per separarla da quella personale).',
      }, 409, req)
    }

    // Passo 2: crea invito pre-autorizzato (handle_new_user leggera l'org da qui)
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

    // Passo 3: crea auth user con password = codice, email confermata (bypassa email verification)
    const { data: created2, error: createErr } = await supabase.auth.admin.createUser({
      email: emailRaw,
      password: codice,
      email_confirm: true,
      user_metadata: { nome_completo: nome, ruolo: 'dipendente' },
    })
    if (createErr || !created2?.user) {
      // Rollback invito
      try { await supabase.from('org_inviti').delete().eq('organization_id', orgId).ilike('email', emailRaw) } catch { /* noop */ }
      return json({ error: 'Creazione utente fallita: ' + (createErr?.message || 'unknown') }, 500, req)
    }
    userId = created2.user.id
    created = true

    // Passo 4: approva il dipendente (trigger l'ha inserito approvato=false)
    await supabase.from('profiles')
      .update({
        approvato: true,
        nome_completo: nome,
        dipendente_codice_set_at: new Date().toISOString(),
      })
      .eq('id', userId)
  }

  // Passo 5: email di notifica (best-effort, non blocca l'operazione)
  // Manda email solo se: dipendente creato, oppure codice effettivamente cambiato.
  // Se abbiamo solo aggiornato il nome senza cambiare codice → nessuna email.
  const shouldNotify = created || codiceProvided
  if (shouldNotify) {
    try {
      const tmpl = templateAccessoDipendente({
        nomeDipendente: nome,
        nomeAttivita,
        tipo: created ? 'accesso_creato' : 'codice_cambiato',
      })
      await sendEmail({ to: emailRaw, subject: tmpl.subject, html: tmpl.html })
    } catch { /* email non blocca l'operazione */ }
  }

  return json({ ok: true, userId, created, action: created ? 'creato' : 'aggiornato' }, 200, req)
}
