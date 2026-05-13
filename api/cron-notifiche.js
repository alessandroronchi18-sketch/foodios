export const config = { runtime: 'edge' }

const CRON_SECRET = process.env.CRON_SECRET

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

async function sendEmail(baseUrl, payload) {
  return fetch(`${baseUrl}/api/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(console.error)
}

export default async function handler(req) {
  // Vercel invoca i cron con l'header Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get('Authorization') || ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = await getSupabase()
  const baseUrl  = new URL(req.url).origin
  const oggi     = new Date()
  const isPrimoDelmese = oggi.getDate() === 1

  // Carica tutte le organizzazioni attive
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, nome, email')
    .eq('attivo', true)

  const results = []

  for (const org of orgs || []) {
    const orgId      = org.id
    const email      = org.email
    const nomeAttivita = org.nome || 'La tua attività'

    // ── 1. MAGAZZINO SOTTO SOGLIA ───────────────────────────────────────────
    try {
      const { data: magData } = await supabase
        .from('user_data')
        .select('value')
        .eq('organization_id', orgId)
        .eq('key', 'magazzino')
        .maybeSingle()

      if (magData?.value) {
        const magazzino = typeof magData.value === 'string' ? JSON.parse(magData.value) : magData.value
        const sotto = Object.values(magazzino || {}).filter(ing => {
          const soglia = ing.soglia_g ?? ing.soglia_minima ?? 0
          return soglia > 0 && (ing.giacenza_g ?? 0) <= soglia
        }).map(ing => ({
          nome: ing.nome || ing.name || '—',
          giacenza: `${Math.round(ing.giacenza_g ?? 0)}g`,
          soglia: `${Math.round(ing.soglia_g ?? ing.soglia_minima ?? 0)}g`,
        }))

        if (sotto.length > 0 && email) {
          await sendEmail(baseUrl, {
            tipo: 'magazzino_sotto_soglia',
            email,
            nomeAttivita,
            ingredienti: sotto,
          })
          results.push({ org: orgId, tipo: 'magazzino_sotto_soglia', ingredienti: sotto.length })
        }
      }
    } catch (e) {
      console.error('magazzino check error', orgId, e.message)
    }

    // ── 2. FATTURE IN SCADENZA (entro 7 giorni) ────────────────────────────
    try {
      const scadenzaMax = new Date(oggi)
      scadenzaMax.setDate(scadenzaMax.getDate() + 7)

      const { data: fatture } = await supabase
        .from('fatture')
        .select('numero_rif, data_fattura, fornitore, totale')
        .eq('organization_id', orgId)
        .neq('stato', 'pagata')
        .lte('data_fattura', scadenzaMax.toISOString().slice(0, 10))
        .gte('data_fattura', oggi.toISOString().slice(0, 10))

      if (fatture?.length > 0 && email) {
        await sendEmail(baseUrl, {
          tipo: 'fattura_in_scadenza',
          email,
          nomeAttivita,
          fatture,
        })
        results.push({ org: orgId, tipo: 'fattura_in_scadenza', fatture: fatture.length })
      }
    } catch (e) {
      console.error('fatture check error', orgId, e.message)
    }

    // ── 3. REPORT MENSILE (solo il 1° del mese) ────────────────────────────
    if (isPrimoDelmese) {
      try {
        const mesePrecedente = new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1)
        const meseLabel = mesePrecedente.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
        const inizioMese = mesePrecedente.toISOString().slice(0, 7) + '-01'
        const fineMese   = new Date(oggi.getFullYear(), oggi.getMonth(), 0).toISOString().slice(0, 10)

        // Chiusure del mese precedente dalla user_data
        const { data: chData } = await supabase
          .from('user_data')
          .select('value')
          .eq('organization_id', orgId)
          .eq('key', 'chiusure')
          .maybeSingle()

        let ricaviTotali = 0
        let foodCostMedio = 0
        let prodottoPiuVenduto = null
        let prodottoMenoRedditizio = null

        if (chData?.value) {
          const chiusure = typeof chData.value === 'string' ? JSON.parse(chData.value) : chData.value
          const delMese = Object.values(chiusure || {}).filter(c => {
            const d = c.data || c.date || ''
            return d >= inizioMese && d <= fineMese
          })
          ricaviTotali = delMese.reduce((s, c) => s + (c.kpi?.totV || c.totV || 0), 0)
          const fcVals = delMese.map(c => c.kpi?.fcPct || c.fcPct || 0).filter(v => v > 0)
          foodCostMedio = fcVals.length ? fcVals.reduce((s, v) => s + v, 0) / fcVals.length : 0
        }

        // Produzione del mese precedente
        const { data: gData } = await supabase
          .from('user_data')
          .select('value')
          .eq('organization_id', orgId)
          .eq('key', 'giornaliero')
          .maybeSingle()

        if (gData?.value) {
          const giornaliero = typeof gData.value === 'string' ? JSON.parse(gData.value) : gData.value
          const sessioni = (Array.isArray(giornaliero) ? giornaliero : []).filter(s => {
            const d = s.data || ''
            return d >= inizioMese && d <= fineMese
          })
          const totaliProd = {}
          for (const sess of sessioni) {
            for (const [nome, qty] of Object.entries(sess.qtaMap || {})) {
              totaliProd[nome] = (totaliProd[nome] || 0) + qty
            }
          }
          if (Object.keys(totaliProd).length) {
            const sorted = Object.entries(totaliProd).sort((a, b) => b[1] - a[1])
            prodottoPiuVenduto = sorted[0]?.[0] || null
            prodottoMenoRedditizio = sorted[sorted.length - 1]?.[0] || null
          }
        }

        if (email && ricaviTotali > 0) {
          await sendEmail(baseUrl, {
            tipo: 'report_mensile',
            email,
            nomeAttivita,
            mese: meseLabel,
            ricaviTotali,
            foodCostMedio,
            prodottoPiuVenduto,
            prodottoMenoRedditizio,
          })
          results.push({ org: orgId, tipo: 'report_mensile', mese: meseLabel })
        }
      } catch (e) {
        console.error('report mensile error', orgId, e.message)
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: (orgs || []).length, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
