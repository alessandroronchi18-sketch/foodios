export const config = { runtime: 'edge' }

import { verifyBearerSecret } from './lib/cryptoCompare.js'

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

async function sendEmail(baseUrl, payload) {
  return fetch(`${baseUrl}/api/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.INTERNAL_API_SECRET ? { 'x-internal-secret': process.env.INTERNAL_API_SECRET } : {}),
    },
    body: JSON.stringify(payload),
  }).catch(e => { console.error('sendEmail failed', e); return null })
}

// Helper: legge user_data con i nomi colonna CORRETTI (data_key, data_value).
// Le chiavi tipo 'magazzino' usate prima erano inesistenti: il cron silenziosamente
// non faceva nulla. Ora usiamo le chiavi reali (`pasticceria-magazzino-v1`, ecc.).
async function loadUserDataLatest(supabase, orgId, dataKey, sedeId) {
  let q = supabase
    .from('user_data')
    .select('data_value, updated_at')
    .eq('organization_id', orgId)
    .eq('data_key', dataKey)
  q = sedeId === null ? q.is('sede_id', null) : q.eq('sede_id', sedeId)
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(1)
  if (error || !data?.[0]) return null
  return data[0].data_value
}

// Tutte le sedi attive di un'org (servono per leggere chiavi per-sede).
async function loadSediAttive(supabase, orgId) {
  const { data } = await supabase
    .from('sedi')
    .select('id, nome')
    .eq('organization_id', orgId)
    .neq('attiva', false)
  return data || []
}

// Email del titolare per l'org. organizations non ha email; profiles.email del ruolo titolare si'.
async function emailTitolare(supabase, orgId) {
  const { data } = await supabase
    .from('profiles')
    .select('email, nome_completo')
    .eq('organization_id', orgId)
    .eq('ruolo', 'titolare')
    .limit(1)
    .maybeSingle()
  return data || null
}

export default async function handler(req) {
  // Vercel invoca i cron con l'header Authorization: Bearer <CRON_SECRET>.
  // FAIL-CLOSED: se CRON_SECRET non e' configurato, l'endpoint rifiuta sempre.
  const authCheck = verifyBearerSecret(
    req.headers.get('Authorization') || req.headers.get('authorization') || '',
    process.env.CRON_SECRET,
  )
  if (!authCheck.ok) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = await getSupabase()
  const baseUrl  = new URL(req.url).origin
  const oggi     = new Date()
  const oggiIso  = oggi.toISOString().slice(0, 10)
  const isPrimoDelmese = oggi.getDate() === 1

  // Carica tutte le organizzazioni attive (anche scadute: vogliamo email anche a chi sta scadendo).
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, nome, attivo, trial_ends_at, approvato')
    .eq('attivo', true)

  const results = []

  for (const org of orgs || []) {
    const orgId = org.id
    const nomeAttivita = org.nome || 'La tua attivita\''
    const profile = await emailTitolare(supabase, orgId)
    const email = profile?.email
    if (!email) {
      results.push({ org: orgId, skip: 'no_titolare_email' })
      continue
    }

    // ── 0. TRIAL IN SCADENZA (7gg e 1gg dal cutoff) ─────────────────────────
    // Solo se non gia' pagante. Manda 1 sola email per scaglione (7gg, 1gg).
    // Idempotenza: ricontrolliamo prima di inviare se l'utente ha gia' ricevuto
    // notifica per questo scaglione (via user_data chiave 'trial-notify-log-v1').
    try {
      if (!org.approvato && org.trial_ends_at) {
        const fine = new Date(org.trial_ends_at)
        const giorniRimanenti = Math.ceil((fine - oggi) / 86400000)
        const scaglione = giorniRimanenti <= 0 ? null
          : giorniRimanenti <= 1 ? '1gg'
          : giorniRimanenti <= 7 && giorniRimanenti > 1 ? '7gg'
          : null
        if (scaglione) {
          // Verifica log per non duplicare
          const log = await loadUserDataLatest(supabase, orgId, 'trial-notify-log-v1', null) || {}
          if (!log[scaglione]) {
            await sendEmail(baseUrl, {
              tipo: 'scadenza_trial',
              email,
              nomeAttivita,
              giorniRimanenti,
            })
            // Append al log via SELECT id + UPDATE/INSERT (l'UNIQUE su user_data
            // con sede_id NULL e' un partial index — upsert con onConflict non
            // sempre funziona; usiamo la stessa strategia di src/lib/storage.js).
            const nuovoLog = { ...log, [scaglione]: oggiIso }
            const updatedAt = new Date().toISOString()
            const { data: existing } = await supabase
              .from('user_data')
              .select('id')
              .eq('organization_id', orgId)
              .eq('data_key', 'trial-notify-log-v1')
              .is('sede_id', null)
              .limit(1)
              .maybeSingle()
            if (existing) {
              await supabase.from('user_data')
                .update({ data_value: nuovoLog, updated_at: updatedAt })
                .eq('id', existing.id)
            } else {
              await supabase.from('user_data').insert({
                organization_id: orgId,
                sede_id: null,
                data_key: 'trial-notify-log-v1',
                data_value: nuovoLog,
                updated_at: updatedAt,
              })
            }
            results.push({ org: orgId, tipo: 'scadenza_trial', scaglione, giorniRimanenti })
          }
        }
      }
    } catch (e) {
      console.error('trial check error', orgId, e.message)
    }

    // Per le sedi prendiamo tutte le sedi attive, sommiamo i risultati per sede.
    const sedi = await loadSediAttive(supabase, orgId)

    // ── 1. MAGAZZINO SOTTO SOGLIA (per ogni sede) ────────────────────────────
    try {
      const sottoSogliaAggregato = []
      for (const sede of sedi) {
        const magazzino = await loadUserDataLatest(supabase, orgId, 'pasticceria-magazzino-v1', sede.id)
        if (!magazzino || typeof magazzino !== 'object') continue
        const sotto = Object.values(magazzino).filter(ing => {
          const soglia = Number(ing?.soglia_g ?? ing?.soglia_minima ?? 0)
          return soglia > 0 && Number(ing?.giacenza_g ?? 0) <= soglia
        }).map(ing => ({
          nome: ing.nome || ing.name || '—',
          giacenza: `${Math.round(Number(ing.giacenza_g ?? 0))}g`,
          soglia: `${Math.round(Number(ing.soglia_g ?? ing.soglia_minima ?? 0))}g`,
          sede: sede.nome || null,
        }))
        sottoSogliaAggregato.push(...sotto)
      }
      if (sottoSogliaAggregato.length > 0) {
        await sendEmail(baseUrl, {
          tipo: 'magazzino_sotto_soglia',
          email, nomeAttivita,
          ingredienti: sottoSogliaAggregato,
        })
        results.push({ org: orgId, tipo: 'magazzino_sotto_soglia', ingredienti: sottoSogliaAggregato.length })
      }
    } catch (e) {
      console.error('magazzino check error', orgId, e.message)
    }

    // ── 2. FATTURE IN SCADENZA (entro 7 giorni, escluse pagate) ─────────────
    try {
      const scadenzaMax = new Date(oggi)
      scadenzaMax.setDate(scadenzaMax.getDate() + 7)
      const { data: fatture } = await supabase
        .from('fatture')
        .select('numero_rif, data_fattura, fornitore, totale')
        .eq('organization_id', orgId)
        .neq('stato', 'pagata')
        .lte('data_fattura', scadenzaMax.toISOString().slice(0, 10))
        .gte('data_fattura', oggiIso)
      if (fatture?.length > 0) {
        await sendEmail(baseUrl, {
          tipo: 'fattura_in_scadenza',
          email, nomeAttivita, fatture,
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

        let ricaviTotali = 0
        let foodCostMedio = 0
        let prodottoPiuVenduto = null
        let prodottoMenoVenduto = null

        // Aggrega chiusure di tutte le sedi
        for (const sede of sedi) {
          const chiusure = await loadUserDataLatest(supabase, orgId, 'pasticceria-chiusure-v1', sede.id)
          if (!Array.isArray(chiusure)) continue
          const delMese = chiusure.filter(c => {
            const d = c?.data || ''
            return d >= inizioMese && d <= fineMese
          })
          ricaviTotali += delMese.reduce((s, c) => s + Number(c?.kpi?.totV || c?.totV || 0), 0)
          const fcVals = delMese.map(c => Number(c?.kpi?.fcPct || c?.fcPct || 0)).filter(v => v > 0)
          if (fcVals.length) foodCostMedio = fcVals.reduce((s, v) => s + v, 0) / fcVals.length
        }

        // Aggrega produzione di tutte le sedi
        const totaliProd = {}
        for (const sede of sedi) {
          const giornaliero = await loadUserDataLatest(supabase, orgId, 'pasticceria-giornaliero-v1', sede.id)
          if (!Array.isArray(giornaliero)) continue
          const sessioni = giornaliero.filter(s => {
            const d = s?.data || ''
            return d >= inizioMese && d <= fineMese
          })
          for (const sess of sessioni) {
            for (const p of (sess.prodotti || [])) {
              const q = Number(p?.stampi || 0)
              if (q > 0) totaliProd[p.nome] = (totaliProd[p.nome] || 0) + q
            }
          }
        }
        if (Object.keys(totaliProd).length) {
          const sorted = Object.entries(totaliProd).sort((a, b) => b[1] - a[1])
          prodottoPiuVenduto = sorted[0]?.[0] || null
          prodottoMenoVenduto = sorted[sorted.length - 1]?.[0] || null
        }

        if (ricaviTotali > 0) {
          await sendEmail(baseUrl, {
            tipo: 'report_mensile',
            email, nomeAttivita,
            mese: meseLabel,
            ricaviTotali,
            foodCostMedio,
            prodottoPiuVenduto,
            prodottoMenoVenduto,
          })
          results.push({ org: orgId, tipo: 'report_mensile', mese: meseLabel, ricaviTotali })
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
