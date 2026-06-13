export const config = { runtime: 'edge' }

// Cron Forecast vendite (B1)
//
// Per ogni organization+sede, calcola previsione vendite per i prossimi 7
// giorni per ciascun prodotto venduto negli ultimi 60gg. Algoritmo MVP:
//
//   1. Per ogni prodotto, calcola media vendita per giorno-della-settimana
//      negli ultimi 60gg (es. "cannolo lunedi media 8 pz, martedi 12 pz").
//   2. Recupera meteo prossimi 7gg via Open-Meteo (gratis, no key) per la
//      citta della sede.
//   3. Applica correzione meteo: caldo (+10% gelato, -5% caffe), piovoso
//      (-15% per attivita di passaggio).
//   4. Conferma range con z-score della deviazione storica.
//
// Persiste su forecast_giornaliero con conflict resolution per data.
// Volutamente semplice: il modello "meteo+eventi" pieno arrivera' in v2.

import { verifyBearerSecret } from './lib/cryptoCompare.js'
import { safeError } from './lib/safeError.js'

const MAX_ORG_PER_RUN = 20
const FORECAST_DAYS = 7

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

// Open-Meteo: gratis, no API key, copre Italia con precisione cittadina.
// Geocoding semplice via OpenMeteo geocoding API.
async function meteoFor(citta, days = 7) {
  if (!citta) return null
  try {
    const { safeFetch } = await import('./lib/safeFetch.js')
    // 1) Geocoding (Open-Meteo gratis, no api key)
    const geoRes = await safeFetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(citta)}&count=1&country=IT&language=it`, {}, 8_000)
    const geo = await geoRes.json()
    const loc = (geo.results || [])[0]
    if (!loc) return null
    if (loc.country_code && loc.country_code !== 'IT') return null  // safety: solo Italia
    // 2) Forecast giornaliero
    const fcUrl = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&forecast_days=${days}&timezone=Europe%2FRome`
    const fcRes = await safeFetch(fcUrl, {}, 8_000)
    const fc = await fcRes.json()
    const out = []
    const daily = fc.daily || {}
    const dates = daily.time || []
    for (let i = 0; i < dates.length; i++) {
      out.push({
        data: dates[i],
        t_max: daily.temperature_2m_max?.[i] ?? null,
        t_min: daily.temperature_2m_min?.[i] ?? null,
        precip: daily.precipitation_sum?.[i] ?? 0,
        weather_code: daily.weather_code?.[i] ?? null,
      })
    }
    return out
  } catch { return null }
}

function correzioneMeteo(meteo, tipoBusiness) {
  if (!meteo) return 1
  let mult = 1
  // Caldo (>28C): +15% gelato/freddi, -5% caldo/caffe
  if (meteo.t_max >= 28) {
    if (tipoBusiness === 'gelateria') mult *= 1.15
    else mult *= 0.97
  }
  // Freddo (<10C): -5% gelato, +10% caldo
  if (meteo.t_max <= 10) {
    if (tipoBusiness === 'gelateria') mult *= 0.80
    else mult *= 1.05
  }
  // Pioggia significativa (>5mm): -15%
  if (meteo.precip > 5) mult *= 0.85
  return mult
}

export default async function handler(req) {
  const auth = verifyBearerSecret(
    req.headers.get('Authorization') || req.headers.get('authorization') || '',
    process.env.CRON_SECRET,
  )
  if (!auth.ok) return new Response('Unauthorized', { status: 401 })

  const supabase = await getSupabase()
  const stats = { processed: 0, forecasted: 0, errors: 0 }

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, nome, nome_attivita, tipo')
    .limit(MAX_ORG_PER_RUN)

  for (const org of (orgs || [])) {
    stats.processed++
    try {
      const { data: sedi } = await supabase
        .from('sedi')
        .select('id, nome, citta')
        .eq('organization_id', org.id)
        .neq('attiva', false)
      for (const sede of (sedi || [])) {
        // Carica chiusure ultimi 60gg
        const { data: chRow } = await supabase
          .from('user_data')
          .select('data_value')
          .eq('organization_id', org.id)
          .eq('sede_id', sede.id)
          .eq('data_key', 'pasticceria-chiusure-v1')
          .maybeSingle()
        const chiusure = Array.isArray(chRow?.data_value) ? chRow.data_value : []
        if (chiusure.length === 0) continue

        // Aggrego per (prodotto, dayOfWeek) media qta
        const oggi = new Date(); oggi.setHours(0, 0, 0, 0)
        const start60 = new Date(oggi.getTime() - 60 * 86400000)
        const bucket = {}  // { prodotto: { 0: [q,q...], 1: [...] ... 6 } }
        for (const c of chiusure) {
          const d = new Date(c.data || 0)
          if (d < start60 || d > oggi) continue
          const dow = (d.getDay() + 6) % 7  // 0 lunedi
          const items = Array.isArray(c.prodotti) ? c.prodotti : Array.isArray(c.righe) ? c.righe : []
          for (const r of items) {
            const nome = (r.nome || r.prodotto || '').toUpperCase().trim()
            if (!nome) continue
            const q = Number(r.venduto || r.qta || r.pezzi || 0)
            if (!bucket[nome]) bucket[nome] = {}
            if (!bucket[nome][dow]) bucket[nome][dow] = []
            bucket[nome][dow].push(q)
          }
        }
        // Top 30 prodotti per volume totale
        const totals = Object.entries(bucket).map(([nome, dows]) => {
          const tot = Object.values(dows).flat().reduce((s, x) => s + x, 0)
          return { nome, dows, tot }
        }).sort((a, b) => b.tot - a.tot).slice(0, 30)

        // Meteo prossimi 7gg
        const meteo = await meteoFor(sede.citta || org.nome_attivita, FORECAST_DAYS)

        // Per ogni prodotto top, genera 7gg forecast
        for (let i = 0; i < FORECAST_DAYS; i++) {
          const dt = new Date(oggi.getTime() + i * 86400000)
          const iso = dt.toISOString().slice(0, 10)
          const dow = (dt.getDay() + 6) % 7
          const meteoDay = meteo?.[i]
          const mult = correzioneMeteo(meteoDay, org.tipo)

          for (const { nome, dows } of totals) {
            const samples = dows[dow] || []
            if (samples.length === 0) continue
            const mean = samples.reduce((s, x) => s + x, 0) / samples.length
            const variance = samples.reduce((s, x) => s + (x - mean) ** 2, 0) / samples.length
            const std = Math.sqrt(variance)
            const qta = Math.max(0, mean * mult)
            const conf = samples.length >= 4 ? Math.min(0.95, 0.5 + (samples.length / 20)) : 0.45

            await supabase.from('forecast_giornaliero').upsert({
              organization_id: org.id,
              sede_id: sede.id,
              prodotto: nome,
              data: iso,
              qta_prevista: Math.round(qta * 10) / 10,
              qta_min: Math.round(Math.max(0, qta - std) * 10) / 10,
              qta_max: Math.round((qta + std) * 10) / 10,
              confidence: conf,
              fattori: {
                base_mean: Math.round(mean * 10) / 10,
                meteo_mult: mult,
                samples_n: samples.length,
                meteo: meteoDay || null,
              },
            }, { onConflict: 'organization_id,sede_id,prodotto,data' })
            stats.forecasted++
          }
        }
      }
    } catch (e) {
      stats.errors++
      console.error('forecast org', org.id, e.message)
    }
  }

  return new Response(JSON.stringify({ ok: true, ...stats }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
