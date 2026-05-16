/**
 * Verifica un Bearer token Supabase e ritorna user + profile.
 * Da usare nelle Edge Function al posto della verifica inline.
 */
export async function verificaToken(req) {
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
