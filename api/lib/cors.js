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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-internal-secret, x-zucchetti-secret, x-organization-id',
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

export function getClientIP(req) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}
