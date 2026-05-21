export const config = { runtime: 'edge' }

import { getCorsHeaders, handleOptions } from './lib/cors.js'
import { verificaToken } from './lib/auth.js'

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

function errResponse(error, status, req) {
  return new Response(JSON.stringify({ error }), {
    status, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
  })
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)) }

async function handleGet(req, supabase) {
  const url = new URL(req.url)
  const tipo = (url.searchParams.get('tipo') || '').trim().toLowerCase().slice(0, 32)
  const citta = (url.searchParams.get('citta') || '').trim().slice(0, 64) || null

  // Lettura aggregata. La tabella benchmarks_anonimi deve essere readable da service key.
  let q = supabase.from('benchmarks_anonimi').select('food_cost_pct, tipo_attivita, citta')
  if (tipo) q = q.eq('tipo_attivita', tipo)
  const { data, error } = await q.limit(5000)
  if (error) {
    // Se la tabella non esiste, ritorniamo null senza errore — il client mostrerà "non disponibile".
    if (error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')) {
      return new Response(JSON.stringify({ available: false }), {
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }
    return errResponse('benchmark read failed', 500, req)
  }
  const rows = data || []
  if (rows.length === 0) {
    return new Response(JSON.stringify({ available: true, sample: 0 }), {
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
    })
  }
  const sumAll = rows.reduce((s, r) => s + Number(r.food_cost_pct || 0), 0)
  const avgAll = sumAll / rows.length
  let sumCitta = 0, nCitta = 0
  if (citta) {
    for (const r of rows) {
      if ((r.citta || '').toLowerCase() === citta.toLowerCase()) {
        sumCitta += Number(r.food_cost_pct || 0); nCitta++
      }
    }
  }
  const avgCitta = nCitta > 0 ? sumCitta / nCitta : null

  return new Response(JSON.stringify({
    available: true,
    sample: rows.length,
    media_settore: Number(avgAll.toFixed(2)),
    media_citta: avgCitta != null ? { valore: Number(avgCitta.toFixed(2)), sample: nCitta } : null,
  }), { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } })
}

async function handlePost(req, user, supabase) {
  let body
  try { body = await req.json() } catch { return errResponse('json invalido', 400, req) }
  const orgId = String(body?.organization_id || '').trim()
  if (!orgId || orgId.length !== 36) return errResponse('organization_id mancante', 400, req)

  // Verifica che l'utente appartenga all'org dichiarata
  const { data: prof, error: profErr } = await supabase.from('profiles')
    .select('organization_id').eq('id', user.id).single()
  if (profErr || !prof) return errResponse('profilo non trovato', 403, req)
  if (prof.organization_id !== orgId) return errResponse('org mismatch', 403, req)

  const tipo = String(body?.tipo_attivita || '').trim().toLowerCase().slice(0, 32)
  const citta = body?.citta ? String(body.citta).trim().slice(0, 64) : null
  const fcPct = clamp(Number(body?.food_cost_pct || 0), 0, 100)
  const anno_mese = String(body?.anno_mese || '').match(/^\d{4}-\d{2}$/) ? body.anno_mese : null
  if (!tipo || !anno_mese || fcPct === 0) return errResponse('payload incompleto', 400, req)

  // Hash deterministico dell'org per evitare duplicati senza esporre org_id.
  const enc = new TextEncoder().encode(`${orgId}|${anno_mese}`)
  const hashBuf = await crypto.subtle.digest('SHA-256', enc)
  const hashArr = Array.from(new Uint8Array(hashBuf))
  const org_hash = hashArr.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)

  const payload = {
    org_hash,
    tipo_attivita: tipo,
    citta,
    food_cost_pct: fcPct,
    anno_mese,
    updated_at: new Date().toISOString(),
  }
  const { error: upErr } = await supabase
    .from('benchmarks_anonimi')
    .upsert(payload, { onConflict: 'org_hash' })

  if (upErr) {
    if (upErr.code === '42P01') {
      return new Response(JSON.stringify({ stored: false, reason: 'tabella benchmarks_anonimi non esiste' }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
      })
    }
    return errResponse('benchmark write failed: ' + upErr.message, 500, req)
  }
  return new Response(JSON.stringify({ stored: true }), {
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
  })
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)

  let supabase
  try { supabase = await getSupabase() } catch { return errResponse('supabase init failed', 500, req) }

  if (req.method === 'GET') return handleGet(req, supabase)

  if (req.method === 'POST') {
    const { user, error: authErr } = await verificaToken(req)
    if (authErr) return errResponse(authErr, 401, req)
    return handlePost(req, user, supabase)
  }

  return errResponse('Method not allowed', 405, req)
}
