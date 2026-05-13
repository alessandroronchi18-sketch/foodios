export function sanitize(str, maxLen = 500) {
  if (typeof str !== 'string') return ''
  return str
    .slice(0, maxLen)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
}

export function validateEmail(email) {
  return typeof email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    email.length < 255
}

export function validateUUID(id) {
  return typeof id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

export function validateAmount(amount) {
  const n = parseFloat(amount)
  return !isNaN(n) && isFinite(n) && n >= 0 && n < 1_000_000
}

// Rimuove caratteri di controllo e normalizza spazi
export function sanitizeStrict(str, maxLen = 200) {
  return sanitize(str, maxLen)
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
}
