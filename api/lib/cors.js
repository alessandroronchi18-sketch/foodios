const ALLOWED_ORIGINS = [
  'https://foodios-rose.vercel.app',
  'https://foodios.it',
  'https://www.foodios.it',
  'http://localhost:5173',
  'http://localhost:3000',
]

// Anche i preview deploy Vercel devono poter chiamare l'API.
// Pattern: https://foodios-<sha>-<team>.vercel.app — è ammesso solo se di nostro account.
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/foodios-[a-z0-9]+-alessandroronchi18-7807s-projects\.vercel\.app$/,
]

function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false
  if (ALLOWED_ORIGINS.includes(origin)) return true
  return ALLOWED_ORIGIN_PATTERNS.some(rx => rx.test(origin))
}

export function getCorsHeaders(req) {
  const origin = req?.headers?.get ? req.headers.get('origin') : req?.headers?.origin
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    // x-internal-secret e x-zucchetti-secret sono server-to-server: NON vanno
    // in CORS preflight (audit 2026-06-17 LOW). Lasciamo solo header client.
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-organization-id',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  // Se l'origin non è whitelisted NON emettiamo Allow-Origin: il browser blocca la richiesta.
  return headers
}

export function handleOptions(req) {
  return new Response(null, { status: 204, headers: getCorsHeaders(req) })
}

export function json(data, status = 200, req = null, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(req ? getCorsHeaders(req) : {}),
      ...extraHeaders,
    },
  })
}

// Estrazione IP client con priorità su header tipicamente non-spoofable.
// Su Vercel:
//  - x-real-ip / x-vercel-forwarded-for sono settati dall'edge (sovrascrivono
//    qualsiasi valore inviato dal client).
//  - x-forwarded-for può essere appended dal client (untrusted prima del proxy):
//    Vercel garantisce che l'edge appenda l'IP reale come ULTIMO (non primo).
// Audit 2026-06-17 MEDIUM: prima si prendeva il PRIMO IP di XFF, spoofable.
export function getClientIP(req) {
  const get = (h) => req.headers.get?.(h) || req.headers[h] || req.headers[h.toLowerCase()] || null
  const real = get('x-real-ip') || get('x-vercel-forwarded-for') || get('cf-connecting-ip')
  if (real && typeof real === 'string') return real.split(',')[0].trim()
  const xff = get('x-forwarded-for')
  if (xff && typeof xff === 'string') {
    // Ultimo IP della catena: aggiunto dall'edge Vercel, attendibile.
    const parts = xff.split(',').map(s => s.trim()).filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
  }
  return 'unknown'
}
