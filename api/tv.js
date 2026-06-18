export const config = { runtime: 'edge' }

import { getCorsHeaders, handleOptions, getClientIP } from './lib/cors.js'
import { checkRateLimit, rateLimitResponse } from './lib/rateLimit.js'

const TV_KEY = 'pasticceria-tv-token-v1'

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

function errResponse(error, status, req) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
  })
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'GET') return errResponse('Method not allowed', 405, req)

  // Token accettato in priorità da Authorization: Bearer (header non finisce
  // in log/referer come la querystring). Fallback query per retrocompatibilità.
  // Audit 2026-06-17 MEDIUM.
  const authHdr = req.headers.get?.('authorization') || req.headers.get?.('Authorization') || ''
  const headerToken = authHdr.startsWith('Bearer ') ? authHdr.slice(7).trim() : ''
  const url = new URL(req.url)
  const token = headerToken || (url.searchParams.get('token') || '').trim()

  if (!token || token.length < 16 || token.length > 64) {
    return errResponse('token mancante o non valido', 400, req)
  }

  let supabase
  try { supabase = await getSupabase() } catch (e) { return errResponse('supabase init failed', 500, req) }

  // Rate limit: 60 req/min per IP (audit 2026-06-17 LOW: rate-limit per
  // prefisso di token dava una quota fresca a chi vede 8 char del token in
  // screenshot della TV. Solo IP è più conservativo).
  const ip = getClientIP(req)
  const rlKey = `tv:${ip}`
  const rl = await checkRateLimit(supabase, rlKey, 60, 60, 300)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  // Lookup costant-time via SHA-256 del token: la row in user_data ha
  // data_value.token_hash = sha256(token). Filtriamo direttamente in SQL,
  // niente scan + plaintext compare (no timing attack).
  // Fallback legacy: row senza token_hash → match plaintext (deprecated).
  const tokenBuf = new TextEncoder().encode(token)
  const tokenHashBuf = await crypto.subtle.digest('SHA-256', tokenBuf)
  const tokenHash = Array.from(new Uint8Array(tokenHashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')

  // Primo tentativo: hash-based lookup (versione 2026-05+).
  let match = null
  {
    const { data: rows, error } = await supabase
      .from('user_data')
      .select('organization_id, data_value')
      .eq('data_key', TV_KEY)
      .is('sede_id', null)
      .eq('data_value->>token_hash', tokenHash)
      .limit(1)
    if (error) return errResponse('lookup token failed', 500, req)
    match = rows?.[0] || null
  }
  // Fallback legacy: row senza token_hash (utenti pre-fix). Scan limitato.
  // Si auto-cura: appena l'utente rigenera il token, la row ha token_hash.
  if (!match) {
    const { data: rows } = await supabase
      .from('user_data')
      .select('organization_id, data_value')
      .eq('data_key', TV_KEY)
      .is('sede_id', null)
      .is('data_value->>token_hash', null)
      .limit(50)
    match = (rows || []).find(r => r?.data_value?.token === token) || null
  }
  if (!match) return errResponse('token non valido', 403, req)

  const orgId = match.organization_id

  // Org info + sedi attive in parallelo.
  const [orgRes, sediRes] = await Promise.all([
    supabase.from('organizations').select('id, nome, tipo').eq('id', orgId).single(),
    supabase.from('sedi').select('id, nome, citta, is_default').eq('organization_id', orgId).neq('attiva', false),
  ])
  if (orgRes.error || sediRes.error) return errResponse('caricamento org fallito', 500, req)
  const org = orgRes.data
  const sedi = sediRes.data || []

  // Filtro opzionale sede
  const sedeIdParam = (url.searchParams.get('sede') || '').trim() || null
  const sediFiltro = sedeIdParam ? sedi.filter(s => s.id === sedeIdParam) : sedi
  const sediIds = sediFiltro.map(s => s.id)

  // Stock prodotti finiti per le sedi richieste
  const stockRes = sediIds.length
    ? await supabase.from('stock_prodotti_finiti')
        .select('sede_id, prodotto_nome, quantita')
        .eq('organization_id', orgId)
        .in('sede_id', sediIds)
    : { data: [], error: null }

  // Giornaliero (produzione di oggi) per sede da user_data
  // Per ogni sede leggo la chiave 'pasticceria-giornaliero-v1' e filtro le sessioni di oggi.
  const today = new Date().toISOString().slice(0, 10)

  const sediWithKpi = await Promise.all(sediFiltro.map(async (sede) => {
    const { data: gd } = await supabase
      .from('user_data')
      .select('data_value')
      .eq('organization_id', orgId)
      .eq('data_key', 'pasticceria-giornaliero-v1')
      .eq('sede_id', sede.id)
      .order('updated_at', { ascending: false })
      .limit(1)
    const giorArr = Array.isArray(gd?.[0]?.data_value) ? gd[0].data_value : []
    const sessioniOggi = giorArr.filter(s => (s.data || '').startsWith(today))
    const prodOggi = sessioniOggi.reduce((acc, sess) =>
      acc + (sess.prodotti || []).reduce((p, x) => p + (Number(x.stampi) || 0), 0), 0)

    const stockSede = (stockRes.data || []).filter(r => r.sede_id === sede.id)
    const stockTot = stockSede.reduce((s, r) => s + Number(r.quantita || 0), 0)
    const stockPerProdotto = stockSede
      .map(r => ({ nome: r.prodotto_nome, quantita: Number(r.quantita || 0) }))
      .filter(x => x.quantita > 0)
      .sort((a, b) => b.quantita - a.quantita)
      .slice(0, 12)

    return {
      id: sede.id,
      nome: sede.nome,
      citta: sede.citta,
      prodOggi,
      stockTot,
      stockPerProdotto,
    }
  }))

  return new Response(JSON.stringify({
    org: { nome: org.nome, tipo: org.tipo },
    sedi: sediWithKpi,
    generato_il: new Date().toISOString(),
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...getCorsHeaders(req),
    },
  })
}
