export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const start = Date.now()
  let dbOk = false

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const { error } = await supabase.from('organizations').select('id').limit(1)
    dbOk = !error
  } catch { /* db unreachable */ }

  const latency = Date.now() - start
  const status = dbOk ? 200 : 503

  return new Response(JSON.stringify({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk,
    latency_ms: latency,
    ts: new Date().toISOString(),
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
