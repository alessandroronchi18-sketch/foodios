const ALLOWED_ORIGINS = [
  'https://foodios-rose.vercel.app',
  'https://foodios.it',
  'https://www.foodios.it',
  'http://localhost:5173',
  'http://localhost:3000',
]

export function getCorsHeaders(req) {
  const origin = req?.headers?.get ? req.headers.get('origin') : req?.headers?.origin
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
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
