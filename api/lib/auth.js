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

/**
 * Log di azioni sensibili sull'audit_log.
 * Non blocca in caso di errore.
 */
export async function logAzione(supabase, userId, orgId, azione, dettagli = {}) {
  try {
    await supabase.from('audit_log').insert({
      table_name: 'actions',
      operation: azione,
      row_id: orgId,
      changed_by: userId,
      new_data: { ...dettagli, timestamp: new Date().toISOString() },
    })
  } catch (err) {
    console.error('logAzione fallito:', err.message)
  }
}
