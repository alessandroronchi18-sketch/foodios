/**
 * Verifica un Bearer token Supabase e ritorna user + profile + org.
 * Da usare nelle Edge Function al posto della verifica inline.
 *
 * options.skipOrgCheck = true  → salta verifica organizations.attivo + trial.
 *   Usare SOLO per endpoint che non gestiscono dati operativi (es. status sessione).
 *   Tutti gli endpoint normali devono lasciare il check attivo (default).
 */
export async function verificaToken(req, options = {}) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null, profile: null, error: 'Token mancante' }
  }

  const token = authHeader.replace('Bearer ', '').trim()
  if (!token || token.length < 20) {
    return { user: null, profile: null, error: 'Token non valido' }
  }

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) {
      return { user: null, profile: null, error: 'Token scaduto o non valido' }
    }

    // Verifica profilo attivo
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id, approvato, ruolo')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.organization_id) {
      return { user: null, profile: null, error: 'Account non configurato' }
    }

    // ── Gate trial/attivo (default ON, disabilitabile con skipOrgCheck) ────────
    // L'UI può mostrare "trial scaduto", ma senza questo check le API restano
    // chiamabili con curl. Qui blocchiamo lato server.
    if (!options.skipOrgCheck) {
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('attivo, approvato, trial_ends_at')
        .eq('id', profile.organization_id)
        .maybeSingle()
      if (orgErr || !org) {
        return { user: null, profile: null, error: 'Organizzazione non trovata', status: 403 }
      }
      if (org.attivo === false) {
        return { user: null, profile: null, error: 'Organizzazione disattivata', status: 403 }
      }
      // Pagante (approvato=true) → accesso illimitato.
      // Altrimenti, deve essere ancora in trial.
      if (!org.approvato) {
        const trialEnd = org.trial_ends_at ? new Date(org.trial_ends_at) : null
        if (!trialEnd || trialEnd < new Date()) {
          return { user: null, profile: null, error: 'Trial scaduto. Contatta support@foodios.it per attivare l\'abbonamento.', status: 402 }
        }
      }
    }

    return { user, profile, supabase, error: null }
  } catch (err) {
    return { user: null, profile: null, error: 'Errore autenticazione: ' + err.message }
  }
}

/**
 * Anti-timing-attack: assicura che la risposta impieghi almeno minMs.
 * Da chiamare prima di restituire errori di autenticazione.
 */
export async function rallentaSeNecessario(startTime, minMs = 200) {
  const elapsed = Date.now() - startTime
  if (elapsed < minMs) {
    await new Promise(r => setTimeout(r, minMs - elapsed))
  }
}

// ── Admin check condiviso ──────────────────────────────────────────────────
// ADMIN_EMAIL letto a module-load (come admin.js / send-email.js).
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase()

// Decodifica un claim dal payload JWT senza verifica firma. Sicuro perche'
// chiamato solo DOPO supabase.auth.getUser(token) (che verifica la firma).
function decodeJwtClaim(token, claim) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const payload = JSON.parse(atob(b64))
    return payload[claim] ?? null
  } catch {
    return null
  }
}

/**
 * Verifica che il Bearer token appartenga all'admin, con MFA (aal2) obbligatoria
 * salvo override DISABLE_ADMIN_MFA=true. Ritorna { user, reason }.
 * Fail-closed: senza ADMIN_EMAIL configurato nessuno e' admin.
 *
 * NB: api/admin.js mantiene una copia locale identica (per non rischiare
 * regressioni sul pannello admin live). Consolidare qui quando si productionizza
 * il flusso SDI — che e' l'unico altro consumer (api/sdi-emit-invoice.js).
 */
export async function verificaAdmin(req, supabase) {
  if (!ADMIN_EMAIL) return { user: null, reason: 'admin_email_not_configured' }

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, reason: 'no_bearer' }
  }
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return { user: null, reason: 'empty_token' }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error) return { user: null, reason: `getUser_error:${error.message}` }
    if (!user) return { user: null, reason: 'no_user' }
    if ((user.email || '').toLowerCase() !== ADMIN_EMAIL) {
      return { user: null, reason: `not_admin:${user.email}` }
    }
    // DISABLE_ADMIN_MFA e' un flag operativo MOLTO restretto. Audit 2026-06:
    // valido SOLO in development locale puro (no VERCEL_URL = non e' un deploy).
    // Audit 2026-07-01 HIGH: aggiungere VERCEL_ENV check come signal canonico
    // (development|preview|production) — chi avvia `vercel dev` con
    // NODE_ENV=production accidentalmente non bypassa piu' il flag.
    // In QUALSIASI deploy Vercel (production / preview / development URL)
    // VERCEL_URL e' impostato → il flag non si attiva. Fail-closed.
    const isLocalDev = !process.env.VERCEL_URL
      && process.env.NODE_ENV !== 'production'
      && process.env.VERCEL_ENV !== 'production'
      && process.env.VERCEL_ENV !== 'preview'
    if (isLocalDev && (process.env.DISABLE_ADMIN_MFA || '').toLowerCase() === 'true') {
      return { user, reason: 'ok_mfa_disabled_dev_only' }
    }
    // MFA bypass via whitelist email — ATTIVO SOLO in dev locale (no VERCEL_URL).
    // In QUALSIASI deploy Vercel la whitelist viene ignorata: fail-closed.
    // Audit 2026-06: prima questo branch attivava la whitelist anche in prod,
    // di fatto disabilitando MFA per il founder. Ora richiede aal2 ovunque.
    if (isLocalDev) {
      const whitelistRaw = process.env.ADMIN_MFA_WHITELIST || ''
      if (whitelistRaw) {
        const whitelist = whitelistRaw
          .split(',')
          .map(e => e.toLowerCase().trim())
          .filter(Boolean)
        const userEmail = (user.email || '').toLowerCase().trim()
        if (whitelist.includes(userEmail)) {
          return { user, reason: 'ok_mfa_whitelisted_dev_only' }
        }
      }
    }
    const aalLevel = decodeJwtClaim(token, 'aal')
    if (aalLevel !== 'aal2') {
      // Audit 2026-07-01 HIGH: distinguere "exception (transient)" da "factors
      // empty (clean)". Su transient diciamo "errore temporaneo" invece di
      // spingere l'admin a creare un secondo factor.
      let hasVerifiedFactor = false
      let listException = false
      try {
        const { data: f, error } = await supabase.auth.admin.mfa.listFactors({ userId: user.id })
        if (error) { listException = true }
        else hasVerifiedFactor = (f?.factors || []).some(x => x.status === 'verified')
      } catch { listException = true }
      if (listException) {
        return { user: null, reason: 'mfa_check_transient' }
      }
      return { user: null, reason: hasVerifiedFactor ? 'mfa_required' : 'mfa_not_enrolled' }
    }
    return { user, reason: 'ok' }
  } catch (err) {
    return { user: null, reason: `exception:${err.message}` }
  }
}

/**
 * Log di azioni sensibili sull'audit_log.
 * Non blocca in caso di errore.
 */
export async function logAzione(supabase, userId, orgId, azione, dettagli = {}, req = null) {
  try {
    // Audit 2026-07-01 HIGH: client_ip + user_agent per audit forensico
    // (le colonne sono state aggiunte alla 20260701). Se mancano, l'INSERT
    // ignora i campi extra (Postgres errato? no, fallirebbe — quindi devono
    // esistere). req e' opzionale per retrocompatibilita' con callsite legacy.
    let clientIp = null
    let userAgent = null
    if (req?.headers?.get) {
      const ua = (req.headers.get('user-agent') || '').slice(0, 300)
      const xff = (req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') ||
                   req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim()
      userAgent = ua || null
      clientIp = xff || null
    }
    await supabase.from('audit_log').insert({
      table_name: 'actions',
      operation: azione,
      row_id: orgId,
      changed_by: userId,
      new_data: { ...dettagli, timestamp: new Date().toISOString() },
      client_ip: clientIp,
      user_agent: userAgent,
    })
  } catch (err) {
    // Audit 2026-07-01 HIGH: log con codice errore per debug (era silenzioso
    // su exception, mascherando RLS deny o tabella missing).
    console.error('logAzione fallito:', err?.code || '', err?.message || err)
  }
}
