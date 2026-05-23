// Constant-time string comparison per evitare timing attacks sui secret.
// Confronta due stringhe lunghezza-equivalente in tempo costante: il confronto
// impiega lo stesso numero di operazioni qualunque sia il punto di mismatch.
//
// USO: per webhook secrets, cron secrets, API keys.
// NON USARE per password (usa bcrypt/scrypt/argon2 server-side).
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) {
    // Esegui comunque un compare fittizio per non leak length via timing.
    let acc = 0
    const max = Math.max(a.length, b.length, 1)
    for (let i = 0; i < max; i++) {
      acc |= (a.charCodeAt(i % a.length || 1) || 0) ^ (b.charCodeAt(i % b.length || 1) || 0)
    }
    return false
  }
  let acc = 0
  for (let i = 0; i < a.length; i++) {
    acc |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return acc === 0
}

// Verifica un Bearer token contro un secret atteso.
// Ritorna { ok: true } se valido, { ok: false, reason } altrimenti.
// FAIL-CLOSED: se l'expected è vuoto (env non configurato), l'auth FALLISCE.
// Questo previene il pattern bug-prone `if (SECRET && actual === SECRET)` che
// permette accesso libero quando il secret non è configurato.
export function verifyBearerSecret(authHeader, expectedSecret) {
  if (!expectedSecret || typeof expectedSecret !== 'string' || expectedSecret.length < 16) {
    return { ok: false, reason: 'secret_not_configured' }
  }
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return { ok: false, reason: 'no_bearer' }
  }
  const token = authHeader.slice(7).trim()
  if (!token) return { ok: false, reason: 'empty_token' }
  return { ok: timingSafeEqual(token, expectedSecret), reason: null }
}

// Variante per header custom (non Bearer).
export function verifyRawSecret(actualValue, expectedSecret) {
  if (!expectedSecret || typeof expectedSecret !== 'string' || expectedSecret.length < 16) {
    return { ok: false, reason: 'secret_not_configured' }
  }
  if (!actualValue || typeof actualValue !== 'string') {
    return { ok: false, reason: 'no_value' }
  }
  return { ok: timingSafeEqual(actualValue, expectedSecret), reason: null }
}
