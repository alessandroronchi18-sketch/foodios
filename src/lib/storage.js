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
  if (!orgId) return null
  const isShared = SHARED_KEYS.includes(key)
  const effectiveSedeId = isShared ? null : (sedeId || null)

  const { error } = await supabase
    .from('user_data')
    .upsert(
      {
        organization_id: orgId,
        sede_id: effectiveSedeId,
        data_key: key,
        data_value: value,
      },
      { onConflict: 'organization_id,sede_id,data_key' }
    )

  if (error) {
    console.error('ssave error:', key, error)
    throw error
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
