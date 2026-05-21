export const config = { runtime: 'edge' }

import { getCorsHeaders, handleOptions, json } from './lib/cors.js'

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

  const url = new URL(req.url)
  const token = (url.searchParams.get('token') || '').trim()

  if (!token || token.length < 16 || token.length > 64) {
    return errResponse('token mancante o non valido', 400, req)
  }

  let supabase
  try { supabase = await getSupabase() } catch (e) { return errResponse('supabase init failed', 500, req) }

  // Trova organization tramite token salvato in user_data (chiave shared, sede_id NULL).
  const { data: rows, error: tokErr } = await supabase
    .from('user_data')
    .select('organization_id, data_value')
    .eq('data_key', TV_KEY)
    .is('sede_id', null)
    .limit(50)

  if (tokErr) return errResponse('lookup token failed', 500, req)

  const match = (rows || []).find(r => {
    const t = r?.data_value?.token
    return typeof t === 'string' && t === token
  })
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
