// Wrapper sicuro su localStorage.
//
// Motivazioni:
//   - Safari in modalita' "Navigazione privata" lancia QuotaExceededError su
//     setItem (anche per 1 byte) → app crasha al primissimo write.
//   - Storage piena (es. molti file Loom embeded) → setItem lancia.
//   - localStorage disabilitato dall'utente o da estensioni → getter lancia.
//
// Comportamento:
//   - get(): ritorna null se non disponibile o key assente.
//   - set(): silently ignora se non disponibile (il caller decide la
//     resilienza). Logga warning in dev per debug.
//   - remove(): idem set.
//   - getJSON()/setJSON(): wrap con JSON.parse/stringify safe.

const isDev = typeof import.meta !== 'undefined' && import.meta?.env?.DEV

function warnDev(op, key, err) {
  if (isDev) console.warn(`[safeStorage] ${op}(${key}) failed:`, err?.message || err)
}

export function get(key) {
  try { return localStorage.getItem(key) }
  catch (e) { warnDev('get', key, e); return null }
}

export function set(key, value) {
  try { localStorage.setItem(key, value); return true }
  catch (e) { warnDev('set', key, e); return false }
}

export function remove(key) {
  try { localStorage.removeItem(key); return true }
  catch (e) { warnDev('remove', key, e); return false }
}

export function getJSON(key, fallback = null) {
  const raw = get(key)
  if (raw == null) return fallback
  try { return JSON.parse(raw) }
  catch (e) { warnDev('getJSON', key, e); return fallback }
}

export function setJSON(key, value) {
  try { return set(key, JSON.stringify(value)) }
  catch (e) { warnDev('setJSON', key, e); return false }
}

// Default export per import compatto: import storage from '...safeStorage'
export default { get, set, remove, getJSON, setJSON }
