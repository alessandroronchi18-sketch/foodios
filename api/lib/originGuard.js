// Whitelist origin condivisa fra stripe-checkout, stripe-portal e altri
// endpoint che ritornano URL all'utente (Stripe billing portal session, ecc.).
// Audit 2026-06-17 HIGH: stripe-portal non aveva whitelist → open redirect via
// return_url. Centralizziamo qui per evitare drift.

export const ALLOWED_ORIGINS = new Set([
  'https://foodios.it',
  'https://www.foodios.it',
  'https://foodios-rose.vercel.app',
])

export function safeOrigin(req, fallback = 'https://foodios.it') {
  const h = req.headers || {}
  const raw = (h.origin || h.referer || '').toString()
  if (!raw) return fallback
  const o = raw.replace(/\/$/, '').split('/').slice(0, 3).join('/')
  if (ALLOWED_ORIGINS.has(o)) return o
  try {
    const u = new URL(o)
    if (
      u.hostname.endsWith('.foodios.it') ||
      (u.hostname.endsWith('.vercel.app') && u.hostname.startsWith('foodios-'))
    ) {
      return o
    }
  } catch {}
  return fallback
}
