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

export async function sload(key, orgId, sedeId) {
  if (!orgId) return null
  const isShared = SHARED_KEYS.includes(key)
  const effectiveSedeId = isShared ? null : (sedeId || null)

  const { data, error } = await supabase
    .from('user_data')
    .select('data_value')
    .eq('organization_id', orgId)
    .is('sede_id', effectiveSedeId)
    .eq('data_key', key)
    .maybeSingle()

  if (error) {
    console.error('sload error:', key, error)
    return null
  }
  return data?.data_value ?? null
}

export async function ssave(key, value, orgId, sedeId) {
  if (!orgId) {
    const err = new Error('ssave: orgId mancante')
    console.error(err.message, { key })
    throw err
  }
  const isShared = SHARED_KEYS.includes(key)
  const effectiveSedeId = isShared ? null : (sedeId || null)
  const payload = { organization_id: orgId, sede_id: effectiveSedeId, data_key: key, data_value: value }

  // Tentativo 1: upsert atomico (richiede UNIQUE constraint su org+sede+key)
  const upsertRes = await supabase
    .from('user_data')
    .upsert(payload, { onConflict: 'organization_id,sede_id,data_key' })

  if (!upsertRes.error) return

  // Fallback: SELECT then UPDATE/INSERT manuale — resiliente a UNIQUE mancante
  console.warn('ssave upsert fallito, provo fallback SELECT+INSERT/UPDATE:', key, upsertRes.error)

  const q = supabase.from('user_data').select('id')
    .eq('organization_id', orgId).eq('data_key', key)
  if (effectiveSedeId === null) q.is('sede_id', null); else q.eq('sede_id', effectiveSedeId)
  const { data: existing, error: selErr } = await q.maybeSingle()
  if (selErr) {
    console.error('ssave SELECT fallito:', key, selErr)
    throw selErr
  }

  if (existing) {
    const { error: updErr } = await supabase.from('user_data')
      .update({ data_value: value }).eq('id', existing.id)
    if (updErr) {
      console.error('ssave UPDATE fallito:', key, updErr)
      throw updErr
    }
  } else {
    const { error: insErr } = await supabase.from('user_data').insert(payload)
    if (insErr) {
      console.error('ssave INSERT fallito:', key, insErr)
      throw insErr
    }
  }
}

export async function sdelete(key, orgId, sedeId) {
  if (!orgId) return
  const isShared = SHARED_KEYS.includes(key)
  const effectiveSedeId = isShared ? null : (sedeId || null)

  const { error } = await supabase
    .from('user_data')
    .delete()
    .eq('organization_id', orgId)
    .is('sede_id', effectiveSedeId)
    .eq('data_key', key)

  if (error) console.error('sdelete error:', key, error)
}
