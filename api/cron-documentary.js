export const config = { runtime: 'edge' }

// Cron Documentary trimestrale (C7)
//
// Eseguito il 1° gennaio/aprile/luglio/ottobre. Per ogni organization:
//   1. Calcola periodo: trimestre appena chiuso (es. il 1 lug genera Q2 = apr-mag-giu)
//   2. Aggrega KPI: ricavi totali, FC medio, top prodotti, n chiusure
//   3. Claude narra il trimestre come "storia" (200-300 parole)
//   4. Salva su public.documentary_snapshots
//
// Idempotente: skip se snapshot esiste già per (org, periodo).

import { verifyBearerSecret } from './lib/cryptoCompare.js'
import { callClaude } from './lib/aiEngine.js'

const MAX_ORG_PER_RUN = 30

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

function trimestreLabel(year, q) { return `Q${q} ${year}` }

function rangeTrimestre(now) {
  // Determina trimestre CHIUSO il giorno prima di now
  const d = new Date(now)
  d.setDate(0)  // ultimo giorno del mese precedente
  const mese = d.getMonth() + 1
  const anno = d.getFullYear()
  let qStart, qEnd, qN
  if (mese >= 1 && mese <= 3)      { qN = 1; qStart = `${anno}-01-01`; qEnd = `${anno}-03-31` }
  else if (mese >= 4 && mese <= 6) { qN = 2; qStart = `${anno}-04-01`; qEnd = `${anno}-06-30` }
  else if (mese >= 7 && mese <= 9) { qN = 3; qStart = `${anno}-07-01`; qEnd = `${anno}-09-30` }
  else                             { qN = 4; qStart = `${anno}-10-01`; qEnd = `${anno}-12-31` }
  return { qN, qStart, qEnd, anno, label: trimestreLabel(anno, qN) }
}

export default async function handler(req) {
  const auth = verifyBearerSecret(
    req.headers.get('Authorization') || req.headers.get('authorization') || '',
    process.env.CRON_SECRET,
  )
  if (!auth.ok) return new Response('Unauthorized', { status: 401 })

  // Run only the 1st day of Jan/Apr/Jul/Oct (manuale check)
  const today = new Date()
  const m = today.getUTCMonth() + 1
  const d = today.getUTCDate()
  const forceRun = (req.url || '').includes('force=1')
  if (!forceRun && !(d === 1 && [1, 4, 7, 10].includes(m))) {
    return new Response(JSON.stringify({ skipped: 'not first day of quarter' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = await getSupabase()
  const periodo = rangeTrimestre(today)
  const stats = { processed: 0, generated: 0, skipped: 0, errors: 0 }

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, nome, nome_attivita')
    .limit(MAX_ORG_PER_RUN)

  for (const org of (orgs || [])) {
    stats.processed++
    try {
      // Skip se già esistente
      const { data: existing } = await supabase
        .from('documentary_snapshots').select('id')
        .eq('organization_id', org.id)
        .eq('periodo', periodo.label)
        .maybeSingle()
      if (existing) { stats.skipped++; continue }

      // Aggrega KPI da tutte le sedi
      const { data: sedi } = await supabase
        .from('sedi').select('id, nome').eq('organization_id', org.id).neq('attiva', false)

      let ricaviTot = 0
      let fcSum = 0, fcCount = 0
      const prodottiMap = {}

      for (const sede of (sedi || [])) {
        const { data: chiu } = await supabase
          .from('user_data').select('data_value')
          .eq('organization_id', org.id).eq('sede_id', sede.id)
          .eq('data_key', 'pasticceria-chiusure-v1').maybeSingle()
        const chiArr = Array.isArray(chiu?.data_value) ? chiu.data_value : []
        for (const c of chiArr) {
          const dt = (c.data || '').slice(0, 10)
          if (dt < periodo.qStart || dt > periodo.qEnd) continue
          ricaviTot += Number(c.kpi?.totV || c.totale || 0)
          const items = Array.isArray(c.prodotti) ? c.prodotti : Array.isArray(c.righe) ? c.righe : []
          for (const r of items) {
            const nome = (r.nome || r.prodotto || '').toUpperCase().trim()
            const q = Number(r.venduto || r.qta || r.pezzi || 0)
            const ric = Number(r.ricavo || r.totale || (q * Number(r.prezzo || 0)))
            if (!nome) continue
            if (!prodottiMap[nome]) prodottiMap[nome] = { nome, qta: 0, ricavo: 0 }
            prodottiMap[nome].qta += q
            prodottiMap[nome].ricavo += ric
          }
        }

        const { data: gior } = await supabase
          .from('user_data').select('data_value')
          .eq('organization_id', org.id).eq('sede_id', sede.id)
          .eq('data_key', 'pasticceria-giornaliero-v1').maybeSingle()
        const giorArr = Array.isArray(gior?.data_value) ? gior.data_value : []
        for (const s of giorArr) {
          const dt = (s.data || '').slice(0, 10)
          if (dt < periodo.qStart || dt > periodo.qEnd) continue
          if (s.ricavoTot > 0) {
            fcSum += (s.fcTot / s.ricavoTot) * 100; fcCount++
          }
        }
      }

      const topProds = Object.values(prodottiMap).sort((a, b) => b.ricavo - a.ricavo).slice(0, 5)
      const kpi = {
        ricavi_trimestre: Math.round(ricaviTot),
        food_cost_medio: fcCount > 0 ? Math.round(fcSum / fcCount * 10) / 10 : null,
        prodotti_diversi_venduti: Object.keys(prodottiMap).length,
        top_prodotto: topProds[0]?.nome || null,
      }

      // Genera narrativa AI
      let narrativa = null, headline = null, highlights = []
      try {
        const system = `Sei un narratore. Scrivi una narrazione breve in italiano elegante
sul trimestre di un'attivita' di pasticceria/gelateria. Output JSON ESATTO:
{
  "headline": "<1 frase ad effetto, 12-18 parole>",
  "narrativa": "<150-220 parole, 3 paragrafi: 1 contesto, 1 numeri, 1 prospettiva>",
  "highlights": ["<frase breve>", "<frase breve>", "<frase breve>", "<frase breve>"]
}
Italiano corrente, tono caloroso ma professionale. NIENTE emoji. SOLO JSON.`
        const userMsg = `Attivita: ${org.nome_attivita || org.nome}
Periodo: ${periodo.label} (${periodo.qStart} - ${periodo.qEnd})
KPI:
${JSON.stringify(kpi, null, 2)}
Top 5 prodotti:
${topProds.map((p, i) => `${i + 1}. ${p.nome} (${p.qta} pz, €${p.ricavo.toFixed(0)})`).join('\n')}`
        const cl = await callClaude({
          system,
          messages: [{ role: 'user', content: userMsg }],
          max_tokens: 800,
          temperature: 0.55,
        })
        const text = (cl.text || '').trim()
        const m2 = text.match(/\{[\s\S]*\}/)
        if (m2) {
          const parsed = JSON.parse(m2[0])
          headline = parsed.headline
          narrativa = parsed.narrativa
          highlights = parsed.highlights || []
        }
      } catch (e) {
        console.warn('docu AI failed:', e.message)
      }

      await supabase.from('documentary_snapshots').insert({
        organization_id: org.id,
        periodo: periodo.label,
        data_inizio: periodo.qStart,
        data_fine: periodo.qEnd,
        contenuto: { kpi, top_prodotti: topProds, headline, narrativa, highlights },
      })
      stats.generated++
    } catch (e) {
      stats.errors++
      console.error('docu org', org.id, e.message)
    }
  }

  return new Response(JSON.stringify({ ok: true, periodo: periodo.label, ...stats }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
