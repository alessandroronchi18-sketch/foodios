import { supabase } from './supabase'

// Chiavi condivise tra sedi (ricettario, regole, prezzi importati)
export const SHARED_KEYS = [
  'pasticceria-ricettario-v1',
  'pasticceria-ai-v1',
  'pasticceria-actions-v1',
  'pasticceria-esclusi-v1',
  'pasticceria-prezzi-importati-v1',
  'pasticceria-regole-v1',
  'pasticceria-semilavorati-v1',
  'pasticceria-scenario-operativo-v1',
  'pasticceria-formati-vendita-v1',
  // Log modifiche prezzi: audit trail UNICO per azienda (il ricettario/prezzi è
  // shared, quindi anche il suo storico deve esserlo). Migration 20260616
  // consolida le righe per-sede preesistenti in un'unica riga sede_id=NULL.
  'pasticceria-log-prezzi-v1',
]

export function isSharedKey(key) {
  return SHARED_KEYS.includes(key)
}

// Helper: applica il filtro sede_id corretto (.is per null, .eq altrimenti).
function applySedeFilter(q, sedeId) {
  return sedeId === null ? q.is('sede_id', null) : q.eq('sede_id', sedeId)
}

// Distingue errori transienti (rete, 5xx) — su cui ha senso ritentare — da
// errori "permanenti" (constraint violations, RLS denial, validation).
// Per i transienti il retry con backoff esponenziale recupera dropout brevi
// senza imprigionare il chiamante in un loop infinito su errori veri.
function isTransientError(e) {
  if (!e) return false
  const code = e.code || ''
  // Postgres / PostgREST codes "deterministici" → mai ritentare
  if (code.startsWith('23')) return false  // integrity (unique, fk, not null)
  if (code.startsWith('42')) return false  // syntax / permissions
  if (code === 'PGRST116') return false    // no rows
  if (code === 'PGRST301') return false    // PGRST: row not found
  // Status 4xx → fail fast (auth, permission, validation)
  const status = Number(e.status || 0)
  if (status >= 400 && status < 500) return false
  if (status >= 500 && status < 600) return true
  // Errori di rete senza codice/status → transient
  const msg = (e.message || '').toLowerCase()
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('failed to')) return true
  // Default conservativo: NON transient (evita loop su errori sconosciuti)
  return false
}

// Wrapper retry per Supabase calls. Esegue `fn` fino a `attempts` volte,
// con backoff esponenziale partendo da `baseDelayMs`. Solo errori transienti.
async function withRetry(fn, { attempts = 3, baseDelayMs = 300 } = {}) {
  let lastErr = null
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (!isTransientError(e) || i === attempts - 1) throw e
      const wait = baseDelayMs * Math.pow(2, i)  // 300ms, 600ms, 1200ms
      await new Promise(r => setTimeout(r, wait))
    }
  }
  throw lastErr
}

export async function sload(key, orgId, sedeId) {
  if (!orgId) return null
  const isShared = SHARED_KEYS.includes(key)
  const effectiveSedeId = isShared ? null : (sedeId || null)

  // Resiliente ai duplicati: order by updated_at desc + limit 1.
  return await withRetry(async () => {
    let q = supabase
      .from('user_data')
      .select('data_value, updated_at')
      .eq('organization_id', orgId)
      .eq('data_key', key)
    q = applySedeFilter(q, effectiveSedeId)
    const { data, error } = await q.order('updated_at', { ascending: false }).limit(1)
    if (error) {
      console.error('sload error:', key, error)
      // Per sload preferiamo restituire null su errore transient (sennò
      // l'app si rompe a ogni hiccup di rete). Lo throw qui non finisce nel
      // retry diretto, ma in pratica gli errori transient fanno ritentare.
      const e = new Error(error.message || 'sload failed')
      e.code = error.code; e.status = error.status
      throw e
    }
    return data?.[0]?.data_value ?? null
  }).catch(() => null)
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
  // Idempotente anche con duplicati legacy. Wrappato in retry per resilienza rete.
  return await withRetry(async () => {
    let qSel = supabase
      .from('user_data')
      .select('id')
      .eq('organization_id', orgId)
      .eq('data_key', key)
    qSel = applySedeFilter(qSel, effectiveSedeId)
    const { data: existing, error: selErr } = await qSel
    if (selErr) {
      const e = new Error(selErr.message || 'ssave SELECT failed')
      e.code = selErr.code; e.status = selErr.status
      throw e
    }

    if (existing && existing.length > 0) {
      // UPDATE su TUTTE le righe (gestione duplicati legacy).
      let qUpd = supabase
        .from('user_data')
        .update({ data_value: value, updated_at: payload.updated_at })
        .eq('organization_id', orgId)
        .eq('data_key', key)
      qUpd = applySedeFilter(qUpd, effectiveSedeId)
      const { error: updErr } = await qUpd
      if (updErr) {
        const e = new Error(updErr.message || 'ssave UPDATE failed')
        e.code = updErr.code; e.status = updErr.status
        throw e
      }
      return
    }

    // Nessuna riga: INSERT pulita.
    const { error: insErr } = await supabase.from('user_data').insert(payload)
    if (insErr) {
      // Race condition possibile: tra il SELECT e l'INSERT un altro client ha
      // inserito. In quel caso ritentiamo con UPDATE (gestito inline, non e' un
      // retry transient — e' una resolution di concorrenza).
      if (insErr.code === '23505') {
        let qRetry = supabase
          .from('user_data')
          .update({ data_value: value, updated_at: payload.updated_at })
          .eq('organization_id', orgId)
          .eq('data_key', key)
        qRetry = applySedeFilter(qRetry, effectiveSedeId)
        const { error: retryErr } = await qRetry
        if (retryErr) {
          const e = new Error(retryErr.message || 'ssave race UPDATE failed')
          e.code = retryErr.code; e.status = retryErr.status
          throw e
        }
        return
      }
      const e = new Error(insErr.message || 'ssave INSERT failed')
      e.code = insErr.code; e.status = insErr.status
      throw e
    }
  })
}

/**
 * Carica una chiave PER-SEDE per tutte le sedi di un'org.
 * Restituisce { [sedeId]: data_value }.
 * Utile per la "Vista azienda" che aggrega KPI di tutte le sedi.
 * Per chiavi shared non ha senso e ritorna un singolo entry con key 'shared'.
 */
export async function sloadAllSedi(key, orgId) {
  if (!orgId) return {}
  if (isSharedKey(key)) {
    const v = await sload(key, orgId, null)
    return { shared: v }
  }
  const { data, error } = await supabase
    .from('user_data')
    .select('sede_id, data_value, updated_at')
    .eq('organization_id', orgId)
    .eq('data_key', key)
    .order('updated_at', { ascending: false })
  if (error) { console.error('sloadAllSedi error:', key, error); return {} }
  const out = {}
  for (const row of (data || [])) {
    const id = row.sede_id || 'shared'
    if (!(id in out)) out[id] = row.data_value
  }
  return out
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
