import { supabase } from './supabase'

// Chiavi condivise tra sedi (ricettario, regole, prezzi importati)
const SHARED_KEYS = [
  'pasticceria-ricettario-v1',
  'pasticceria-ai-v1',
  'pasticceria-actions-v1',
  'pasticceria-esclusi-v1',
  'pasticceria-prezzi-importati-v1',
  'pasticceria-regole-v1',
  'pasticceria-semilavorati-v1',
]

// Helper: applica il filtro sede_id corretto (.is per null, .eq altrimenti).
function applySedeFilter(q, sedeId) {
  return sedeId === null ? q.is('sede_id', null) : q.eq('sede_id', sedeId)
}

export async function sload(key, orgId, sedeId) {
  if (!orgId) return null
  const isShared = SHARED_KEYS.includes(key)
  const effectiveSedeId = isShared ? null : (sedeId || null)

  // Resiliente ai duplicati: order by updated_at desc + limit 1.
  // Senza limit/single, evitiamo PGRST116 quando ci sono righe duplicate
  // legacy (NULL trattato come distinto dall'UNIQUE constraint).
  let q = supabase
    .from('user_data')
    .select('data_value, updated_at')
    .eq('organization_id', orgId)
    .eq('data_key', key)
  q = applySedeFilter(q, effectiveSedeId)
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(1)

  if (error) {
    console.error('sload error:', key, error)
    return null
  }
  return data?.[0]?.data_value ?? null
}

export async function ssave(key, value, orgId, sedeId) {
  if (!orgId) {
    const err = new Error('ssave: orgId mancante')
    console.error(err.message, { key })
    throw err
  }
  const isShared = SHARED_KEYS.includes(key)
  const effectiveSedeId = isShared ? null : (sedeId || null)
  const payload = { organization_id: orgId, sede_id: effectiveSedeId, data_key: key, data_value: value, updated_at: new Date().toISOString() }

  // Strategia: SELECT id esistenti → UPDATE su tutti, oppure INSERT se non esiste.
  // Questo è IDEMPOTENTE anche con sede_id=NULL e UNIQUE constraint mal configurato:
  // se ci sono duplicati legacy, li aggiorniamo tutti (e il dedupe SQL li ripulirà).
  // Evitiamo upsert con onConflict che fallisce silenziosamente quando il vincolo
  // non considera NULL come uguale (bug PostgreSQL default).
  let qSel = supabase
    .from('user_data')
    .select('id')
    .eq('organization_id', orgId)
    .eq('data_key', key)
  qSel = applySedeFilter(qSel, effectiveSedeId)
  const { data: existing, error: selErr } = await qSel

  if (selErr) {
    console.error('ssave SELECT fallito:', key, selErr)
    throw selErr
  }

  if (existing && existing.length > 0) {
    // UPDATE su TUTTE le righe (gestione duplicati legacy).
    // Idempotente: anche se ci sono N righe duplicate, ognuna avrà lo stesso value.
    let qUpd = supabase
      .from('user_data')
      .update({ data_value: value, updated_at: payload.updated_at })
      .eq('organization_id', orgId)
      .eq('data_key', key)
    qUpd = applySedeFilter(qUpd, effectiveSedeId)
    const { error: updErr } = await qUpd
    if (updErr) {
      console.error('ssave UPDATE fallito:', key, updErr)
      throw updErr
    }
    return
  }

  // Nessuna riga: INSERT pulita.
  const { error: insErr } = await supabase.from('user_data').insert(payload)
  if (insErr) {
    // Race condition possibile: tra il SELECT e l'INSERT un altro client ha inserito.
    // In quel caso ritentiamo con UPDATE.
    if (insErr.code === '23505') {
      let qRetry = supabase
        .from('user_data')
        .update({ data_value: value, updated_at: payload.updated_at })
        .eq('organization_id', orgId)
        .eq('data_key', key)
      qRetry = applySedeFilter(qRetry, effectiveSedeId)
      const { error: retryErr } = await qRetry
      if (retryErr) {
        console.error('ssave INSERT→UPDATE retry fallito:', key, retryErr)
        throw retryErr
      }
      return
    }
    console.error('ssave INSERT fallito:', key, insErr)
    throw insErr
  }
}

export async function sdelete(key, orgId, sedeId) {
  if (!orgId) return
  const isShared = SHARED_KEYS.includes(key)
  const effectiveSedeId = isShared ? null : (sedeId || null)

  let q = supabase
    .from('user_data')
    .delete()
    .eq('organization_id', orgId)
    .eq('data_key', key)
  q = applySedeFilter(q, effectiveSedeId)
  const { error } = await q

  if (error) console.error('sdelete error:', key, error)
}
