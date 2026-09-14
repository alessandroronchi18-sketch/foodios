// La chiave con cui una cassa entra in Foodos.
//
// Prima c'era una parola d'ordine per marca di cassa (una per Tilby, una per
// RCH...) e l'attività a cui scrivere arrivava in chiaro dentro
// `x-organization-id`: chi aveva la parola d'ordine di una marca poteva
// scrivere incassi nella cassa di qualsiasi cliente, cambiando quell'id.
//
// Adesso ogni cliente ha la SUA chiave, e la chiave dice da sola di chi è:
// nel database c'è solo la sua impronta (SHA-256), e da lì si risale
// all'organizzazione. L'intestazione `x-organization-id` non viene più creduta,
// al massimo viene confrontata.

export async function impronta(token) {
  const bytes = new TextEncoder().encode(token)
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// La chiave può arrivare da più intestazioni: quelle storiche delle casse
// restano accettate, così chi ha già configurato il registratore cambia solo
// il valore e non il nome del campo.
export function leggiToken(req) {
  const h = (nome) => req.headers.get(nome) || ''
  const raw = h('x-webhook-token')
    || h('x-pos-secret')
    || h('x-zucchetti-secret')
    || h('authorization').replace(/^Bearer\s+/i, '')
  return String(raw).trim()
}

// Dalla chiave all'organizzazione. Non dice mai perché ha detto di no in modo
// utile a chi prova a indovinare: il motivo serve solo ai nostri log.
export async function risolviToken(supabase, token, provider) {
  if (!token || token.length < 32) return { ok: false, motivo: 'token_mancante' }

  let hash
  try { hash = await impronta(token) } catch { return { ok: false, motivo: 'hash_fallito' } }

  const { data, error } = await supabase
    .from('webhook_token')
    .select('id, organization_id, provider')
    .eq('token_hash', hash)
    .is('revocato_il', null)
    .maybeSingle()

  if (error) return { ok: false, motivo: 'lettura_fallita' }
  if (!data) return { ok: false, motivo: 'token_sconosciuto' }
  if (provider && data.provider !== provider) return { ok: false, motivo: 'token_altra_marca' }

  return {
    ok: true,
    tokenId: data.id,
    organizationId: data.organization_id,
    provider: data.provider,
  }
}

// Segna quando la chiave è stata usata l'ultima volta: serve alla pagina
// Integrazioni per dire "l'ultimo scontrino è arrivato il ...". Se fallisce,
// la richiesta va avanti lo stesso: è una nota, non un controllo.
export async function segnaUso(supabase, tokenId) {
  if (!tokenId) return
  try {
    await supabase.from('webhook_token')
      .update({ ultimo_uso_il: new Date().toISOString() })
      .eq('id', tokenId)
  } catch { /* nota, non controllo */ }
}

// L'organizzazione esiste ed è attiva? Vale per tutti i webhook delle casse.
export async function organizzazioneAttiva(supabase, orgId) {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, attivo')
      .eq('id', orgId)
      .maybeSingle()
    if (error || !data) return { ok: false, stato: 404, errore: 'Organizzazione non trovata' }
    if (data.attivo === false) return { ok: false, stato: 403, errore: 'Organizzazione disattivata' }
    return { ok: true }
  } catch {
    return { ok: false, stato: 500, errore: 'Verifica organizzazione fallita' }
  }
}
