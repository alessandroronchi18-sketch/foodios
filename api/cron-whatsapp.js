// /api/cron-whatsapp
// Cron giornaliero — invia report serale WhatsApp ai titolari che hanno
// configurato `organizations.telefono_whatsapp`.
//
// Schedulato in vercel.json a 20:00 UTC = 22:00 CEST (estate) / 21:00 CET (inverno).
// Usa Twilio WhatsApp Business API (con sandbox in sviluppo, sender approvato in prod).
//
// Required ENV:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_WHATSAPP_FROM   (es. "whatsapp:+14155238886" sandbox o sender approvato)
//   CRON_SECRET
//
// Manual run:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron-whatsapp

export const config = { runtime: 'edge' }

import { verifyBearerSecret } from './lib/cryptoCompare.js'

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

function fmtEur(n) {
  return `€${Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtPct(n) {
  return `${Number(n || 0).toFixed(1)}%`
}

// Costruisce KPI del giorno per un'organizzazione
async function kpiOrg(supabase, orgId, sedeId) {
  const today = new Date().toISOString().slice(0, 10)

  // Carica chiusure, giornaliero, ricettario dal user_data
  const [ric, chi, gio] = await Promise.all([
    supabase.from('user_data').select('data_value')
      .eq('organization_id', orgId).eq('data_key', 'pasticceria-ricettario-v1').is('sede_id', null).maybeSingle(),
    supabase.from('user_data').select('data_value')
      .eq('organization_id', orgId).eq('data_key', 'pasticceria-chiusure-v1').eq('sede_id', sedeId).maybeSingle(),
    supabase.from('user_data').select('data_value')
      .eq('organization_id', orgId).eq('data_key', 'pasticceria-giornaliero-v1').eq('sede_id', sedeId).maybeSingle(),
  ])

  const ricettario = ric.data?.data_value || {}
  const chiusure   = Array.isArray(chi.data?.data_value) ? chi.data.data_value : []
  const giornaliero = Array.isArray(gio.data?.data_value) ? gio.data.data_value : []

  const chOggi = chiusure.find(c => c.data === today)
  const ricavi = Number(chOggi?.totale_lordo || chOggi?.totale || 0)

  // Per ogni prodotto venduto oggi, accumula qty × prezzo (ricavo) e qty × foodCostUnit (fc)
  const sessOggi = (giornaliero || []).find(s => s.data === today)
  const prodotti = sessOggi?.prodotti || []

  const ricetteByNome = {}
  for (const r of Object.values(ricettario.ricette || {})) ricetteByNome[(r.nome || '').toLowerCase()] = r

  let totFc = 0, perProd = {}
  for (const p of prodotti) {
    const ric = ricetteByNome[(p.nome || '').toLowerCase()]
    if (!ric) continue
    const reg = ric.reg || {}
    const fcUnit = reg.unita > 0 ? Number(ric.foodCost || ric.fc || 0) / reg.unita : 0
    const prezzo = Number(reg.prezzo || 0)
    const qtyVend = Number(p.venduti || 0)
    const ricavoProd = qtyVend * prezzo
    const fcProd = qtyVend * fcUnit
    totFc += fcProd
    perProd[p.nome] = perProd[p.nome] || { ricavo: 0, fc: 0, margine: 0, margPct: 0 }
    perProd[p.nome].ricavo += ricavoProd
    perProd[p.nome].fc += fcProd
  }
  for (const k of Object.keys(perProd)) {
    const r = perProd[k]
    r.margine = r.ricavo - r.fc
    r.margPct = r.ricavo > 0 ? (r.margine / r.ricavo * 100) : 0
  }

  const fcPct = ricavi > 0 ? (totFc / ricavi * 100) : 0
  const margine = ricavi - totFc

  // Prodotti top / da rivedere
  const list = Object.entries(perProd).map(([nome, v]) => ({ nome, ...v }))
  const top = list.sort((a, b) => b.margine - a.margine)[0]
  const flop = list.filter(p => p.ricavo > 0).sort((a, b) => a.margPct - b.margPct)[0]

  return { today, ricavi, fcPct, margine, top, flop, n: prodotti.length }
}

async function sendWhatsApp({ to, body }) {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_WHATSAPP_FROM
  if (!sid || !token || !from) throw new Error('Twilio non configurato')

  const auth = btoa(`${sid}:${token}`)
  const form = new URLSearchParams()
  form.set('From', from)
  form.set('To',   to.startsWith('whatsapp:') ? to : `whatsapp:${to}`)
  form.set('Body', body)

  const { safeFetch } = await import('./lib/safeFetch.js')
  const res = await safeFetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  }, 10_000)
  const j = await res.json()
  if (!res.ok) throw new Error(j.message || `Twilio HTTP ${res.status}`)
  return j
}

function buildMessage(org, sede, k) {
  const lines = []
  lines.push(`📊 *Report serale FoodOS*`)
  lines.push(`${org.nome}${sede?.nome ? ` · ${sede.nome}` : ''}`)
  lines.push(`Data: ${k.today}`)
  lines.push('')
  if (k.ricavi === 0 && k.n === 0) {
    lines.push('Nessuna chiusura/produzione registrata oggi.')
    lines.push('')
    lines.push('Apri FoodOS e chiudi la giornata in 3 minuti.')
    return lines.join('\n')
  }
  lines.push(`💰 Ricavi: *${fmtEur(k.ricavi)}*`)
  lines.push(`📉 Food cost: *${fmtPct(k.fcPct)}*`)
  lines.push(`📈 Margine: *${fmtEur(k.margine)}*`)
  lines.push('')
  if (k.top) {
    lines.push(`🏆 Top: ${k.top.nome} — ${fmtEur(k.top.margine)} (${fmtPct(k.top.margPct)})`)
  }
  if (k.flop) {
    lines.push(`⚠ Da rivedere: ${k.flop.nome} — margine ${fmtPct(k.flop.margPct)}`)
  }
  lines.push('')
  lines.push('Apri FoodOS per il dettaglio.')
  return lines.join('\n')
}

export default async function handler(req) {
  // Permette anche manual trigger via Bearer per testing
  const authCheck = verifyBearerSecret(
    req.headers.get('Authorization') || req.headers.get('authorization') || '',
    process.env.CRON_SECRET,
  )
  if (!authCheck.ok) return new Response('Unauthorized', { status: 401 })

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_FROM) {
    return new Response(JSON.stringify({ skipped: true, reason: 'Twilio non configurato' }), { status: 200 })
  }

  const supabase = await getSupabase()

  // Trova le org con telefono_whatsapp valorizzato e abbonamento attivo (approvato o trial)
  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, nome, telefono_whatsapp, approvato, trial_ends_at')
    .not('telefono_whatsapp', 'is', null)
    .eq('attivo', true)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const now = new Date()
  const results = []

  for (const org of orgs || []) {
    // Salta org scadute non paganti
    const trialEnd = org.trial_ends_at ? new Date(org.trial_ends_at) : null
    if (!org.approvato && (!trialEnd || trialEnd < now)) {
      results.push({ org: org.nome, skipped: 'trial scaduto' }); continue
    }

    try {
      // Per ora invio per la prima sede default (può evolvere a una sede per ogni titolare)
      const { data: sedi } = await supabase.from('sedi')
        .select('id, nome, is_default').eq('organization_id', org.id).eq('attiva', true)
      const sede = (sedi || []).find(s => s.is_default) || (sedi || [])[0] || null

      const kpi = await kpiOrg(supabase, org.id, sede?.id || null)
      const body = buildMessage(org, sede, kpi)
      await sendWhatsApp({ to: org.telefono_whatsapp, body })
      results.push({ org: org.nome, sent: true, to: org.telefono_whatsapp })
    } catch (e) {
      results.push({ org: org.nome, error: e.message })
    }
  }

  return new Response(JSON.stringify({ total: results.length, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
