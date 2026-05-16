export function sanitizeString(str, maxLen = 500) {
  if (typeof str !== 'string') return ''
  return str
    .slice(0, maxLen)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
}

export function sanitizeNumber(n, min = 0, max = 999999) {
  const parsed = parseFloat(n)
  if (isNaN(parsed) || !isFinite(parsed)) return min
  return Math.max(min, Math.min(max, parsed))
}

export function sanitizeEmail(email) {
  if (typeof email !== 'string') return ''
  const clean = email.toLowerCase().trim().slice(0, 254)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? clean : ''
}

export function sanitizeObject(obj, schema) {
  const result = {}
  for (const [key, validator] of Object.entries(schema)) {
    result[key] = validator(obj?.[key])
  }
  return result
}
