export const config = { runtime: 'edge' }

const ADMIN_EMAIL = 'alessandroar@maradeiboschi.com'

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

async function verificaAdmin(req) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null

  const supabase = await getSupabase()
  const { data: { user }, error } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (error || !user || user.email !== ADMIN_EMAIL) return null
  return user
}

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    })
  }

  const user = await verificaAdmin(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Accesso negato' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = await getSupabase()

  // GET — lista clienti
  if (req.method === 'GET') {
    const [overviewRes, usersRes] = await Promise.all([
      supabase.from('admin_overview').select('*').order('registrata_il', { ascending: false }),
      supabase.auth.admin.listUsers({ perPage: 1000 }),
    ])

    if (overviewRes.error) {
      return new Response(JSON.stringify({ error: overviewRes.error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const authMap = {}
    for (const u of usersRes.data?.users || []) {
      authMap[u.email] = u.last_sign_in_at || null
    }

    const clienti = (overviewRes.data || []).map(c => ({
      ...c,
      ultimo_accesso: authMap[c.email] || null,
    }))

    return new Response(JSON.stringify({ clienti }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // POST — azioni admin
  if (req.method === 'POST') {
    const { orgId, tipo, valore } = await req.json()
    if (!orgId || !tipo) {
      return new Response(JSON.stringify({ error: 'Parametri mancanti' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let error = null

    if (tipo === 'approva') {
      const res1 = await supabase
        .from('organizations')
        .update({ approvato: true })
        .eq('id', orgId)
      const res2 = await supabase
        .from('profiles')
        .update({ approvato: true })
        .eq('organization_id', orgId)
      error = res1.error || res2.error

      // Invia email di approvazione
      if (!error) {
        await fetch(new URL('/api/send-email', req.url).toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: 'approvazione', orgId }),
        }).catch(console.error)
      }
    } else if (tipo === 'blocca') {
      const res = await supabase
        .from('organizations')
        .update({ attivo: false })
        .eq('id', orgId)
      error = res.error
    } else if (tipo === 'cambia_piano') {
      const res = await supabase
        .from('organizations')
        .update({ piano: valore })
        .eq('id', orgId)
      error = res.error
    } else {
      return new Response(JSON.stringify({ error: 'Azione non riconosciuta' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response('Method not allowed', { status: 405 })
}
