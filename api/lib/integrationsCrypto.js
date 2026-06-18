// Cifratura at-rest per integrazioni.config (API key Zucchetti, Cassa in Cloud,
// SumUp, Deliveroo, ecc.). Usa AES-256-GCM via Web Crypto API (compatibile sia
// con Vercel Edge Runtime che con Node 18+).
//
// Schema row encrypted (encryption_version=1):
//   config_encrypted: base64(ciphertext)
//   config_iv:        base64(12 byte IV — random per ogni write)
//   config_tag:       base64(16 byte GCM auth tag)
//
// Schema row legacy (encryption_version=0):
//   config: jsonb plaintext
//
// La key viene da env INTEGRATIONS_ENCRYPTION_KEY (32 byte base64-encoded).
// Per generare una key nuova: openssl rand -base64 32

let _keyPromise = null

function b64decode(b64) {
  // atob -> Uint8Array
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function b64encode(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

async function getKey() {
  if (_keyPromise) return _keyPromise
  const keyB64 = process.env.INTEGRATIONS_ENCRYPTION_KEY
  if (!keyB64) {
    throw new Error('INTEGRATIONS_ENCRYPTION_KEY non configurato (32 byte base64)')
  }
  const raw = b64decode(keyB64)
  if (raw.length !== 32) {
    throw new Error(`INTEGRATIONS_ENCRYPTION_KEY ha ${raw.length} byte, attesi 32`)
  }
  _keyPromise = crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  return _keyPromise
}

/**
 * Cifra un oggetto JSON in AES-256-GCM. Ritorna { config_encrypted, config_iv, config_tag }
 * pronti da scrivere su `integrazioni`. IV random a ogni call.
 */
export async function encryptConfig(obj) {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(obj || {}))
  const ctAndTag = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, plaintext
  ))
  // GCM: Web Crypto restituisce ciphertext + tag concatenati. Lo splittiamo:
  const tag = ctAndTag.slice(ctAndTag.length - 16)
  const ct  = ctAndTag.slice(0, ctAndTag.length - 16)
  return {
    config_encrypted: b64encode(ct),
    config_iv:        b64encode(iv),
    config_tag:       b64encode(tag),
    encryption_version: 1,
  }
}

/**
 * Decifra una riga `integrazioni`. Accetta sia row con encryption_version=1
 * (decifra), sia row legacy (encryption_version=0, restituisce row.config).
 */
export async function decryptConfig(row) {
  if (!row) return {}
  if (!row.encryption_version || row.encryption_version === 0) {
    // Legacy: ritorna il jsonb plaintext invariato.
    return row.config || {}
  }
  if (!row.config_encrypted || !row.config_iv || !row.config_tag) {
    throw new Error('Riga encrypted ma mancano IV/tag/ciphertext')
  }
  const key = await getKey()
  const iv = b64decode(row.config_iv)
  const ct = b64decode(row.config_encrypted)
  const tag = b64decode(row.config_tag)
  // Ricostruisci il blob che Web Crypto si aspetta (ct+tag)
  const ctAndTag = new Uint8Array(ct.length + tag.length)
  ctAndTag.set(ct, 0)
  ctAndTag.set(tag, ct.length)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, ctAndTag
  )
  const json = new TextDecoder().decode(plaintext)
  try { return JSON.parse(json) } catch { return {} }
}

/**
 * Helper alto livello: carica una riga e ritorna la config decifrata.
 */
export async function loadIntegrazione(supabase, orgId, tipo) {
  const { data, error } = await supabase
    .from('integrazioni')
    .select('id, tipo, attiva, config, config_encrypted, config_iv, config_tag, encryption_version, ultimo_sync')
    .eq('organization_id', orgId)
    .eq('tipo', tipo)
    .eq('attiva', true)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const config = await decryptConfig(data)
  return { ...data, config }
}

/**
 * Helper alto livello: scrive una row cifrata. Se la row esiste, aggiorna;
 * altrimenti insert. Resetta config legacy a null per consistenza.
 */
export async function saveIntegrazione(supabase, { orgId, tipo, config, attiva = true }) {
  const enc = await encryptConfig(config || {})
  const row = {
    organization_id: orgId,
    tipo,
    attiva,
    config: null,                       // legacy column azzerata
    config_encrypted: enc.config_encrypted,
    config_iv: enc.config_iv,
    config_tag: enc.config_tag,
    encryption_version: 1,
    // updated_at via trigger se presente, altrimenti server clock
  }
  // Audit 2026-07-01 MEDIUM: il pattern SELECT+UPDATE/INSERT non e' atomico —
  // due titolari concorrenti che salvano la stessa integrazione causano due
  // INSERT (no UNIQUE constraint storica su (organization_id, tipo)). Soluzione:
  // tentare upsert con onConflict; se UNIQUE non c'e' nella migration, ricade
  // sul pattern legacy SELECT+INSERT (informativo: la migration 20260701 NON
  // aggiunge questo UNIQUE perche' alcune integrazioni storiche hanno duplicati
  // intenzionali — vanno bonificati prima).
  try {
    const { data, error } = await supabase
      .from('integrazioni')
      .upsert(row, { onConflict: 'organization_id,tipo' })
      .select('id')
      .single()
    if (!error && data?.id) return data.id
    // Se l'upsert fallisce per mancanza di UNIQUE, ricadiamo sul fallback.
  } catch { /* fallback */ }

  // Fallback legacy (no constraint): atomicita' non garantita ma riusciamo
  // a non bloccare il flusso.
  const { data: existing } = await supabase
    .from('integrazioni')
    .select('id')
    .eq('organization_id', orgId)
    .eq('tipo', tipo)
    .maybeSingle()
  if (existing) {
    const { error } = await supabase.from('integrazioni').update(row).eq('id', existing.id)
    if (error) throw error
    return existing.id
  } else {
    const { data, error } = await supabase.from('integrazioni').insert(row).select('id').single()
    if (error) throw error
    return data.id
  }
}
