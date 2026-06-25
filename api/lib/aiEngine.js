// AI Engine — helpers condivisi per Daily Brief + Proactive Suggestions.
//
// Tutto server-side: chiama Claude direttamente con ANTHROPIC_API_KEY
// (non passa per /api/ai che richiede Bearer utente). Usato dai cron.
//
// Funzioni esportate:
//   callClaude({ system, messages, model, max_tokens, temperature })
//   collectOrgSnapshot({ supabase, orgId, sedeId? })
//   ruleBasedSuggestions(snapshot, { orgId, sedeId })
//   dedupKey({ orgId, sedeId, tipo, entity })

import { safeFetchLLM } from './safeFetch.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'  // economico per cron volumi
const DEFAULT_MAX_TOKENS = 700

// Wrapper fetch Anthropic per chiamate server-to-server (cron, webhook).
export async function callClaude({
  system,
  messages,
  model = DEFAULT_MODEL,
  max_tokens = DEFAULT_MAX_TOKENS,
  temperature = 0.4,
} = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY non configurata')
  }
  const body = { model, max_tokens, messages }
  if (system) body.system = system
  if (Number.isFinite(temperature)) body.temperature = temperature

  const res = await safeFetchLLM(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Claude ${res.status}: ${errText.slice(0, 200)}`)
  }
  const json = await res.json()
  const text = (json.content || []).find(c => c.type === 'text')?.text || ''
  return { text, usage: json.usage, model: json.model }
}

// Chiave deterministica per evitare duplicati attivi sullo stesso soggetto
// (organization + sede + tipo + entity opzionale).
export function dedupKey({ orgId, sedeId, tipo, entity }) {
  const parts = [orgId, sedeId || 'org', tipo, entity || '_'].map(s => String(s || '').toLowerCase().trim())
  return parts.join('|')
}

// ─── KPI SNAPSHOT ────────────────────────────────────────────────────────────
// Raccoglie i KPI di interesse di una organization (eventualmente filtrata
// per sede) negli ultimi 14 giorni. Tutto in 5-6 query DB parallele.
//
// Output:
//   {
//     date: 'YYYY-MM-DD',
//     ricaviIeri, ricaviSettCorr, ricaviSettPrec,
//     foodCostMedio, foodCostIeri,
//     topProdotto: { nome, qta, ricavo },
//     prodottiInCalo: [{ nome, deltaPct }],
//     mpSottoSoglia: [{ nome, giacenza, soglia }],
//     fattureScadute: [{ id, fornitore, importo, scadenza }],
//     fattureInScadenza7gg: [...],
//     chiusureMancanti: [date_iso],
//     turniScoperti: [{ data, reparto }],
//   }
//
// Robusto a dati mancanti: ogni sezione e' indipendente, fallback array vuoto.
// Audit 2026-07-01 LOW: timezone mismatch. `today.setHours(0,0,0,0)` mette
// mezzanotte LOCALE; poi `toISOString().slice(0, 10)` converte in UTC date,
// che durante CEST (+2) e ore [00:00, 02:00) restituisce ieri. Costruiamo
// l'YYYY-MM-DD locale a mano per Europe/Rome.
function localIsoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function collectOrgSnapshot({ supabase, orgId, sedeId = null }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = localIsoDate(today)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayIso = localIsoDate(yesterday)
  const lun = new Date(today); lun.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const lunPrec = new Date(lun); lunPrec.setDate(lunPrec.getDate() - 7)

  const snap = {
    date: todayIso,
    sedeId: sedeId || null,
    ricaviIeri: 0,
    ricaviSettCorr: 0,
    ricaviSettPrec: 0,
    foodCostMedio: null,
    foodCostIeri: null,
    topProdotto: null,
    prodottiInCalo: [],
    mpSottoSoglia: [],
    fattureScadute: [],
    fattureInScadenza7gg: [],
    chiusureMancanti: [],
    turniScoperti: [],
  }

  // Fetch CHIUSURE/giornaliero via user_data (jsonb) — sono per sede.
  // Se sedeId e' null, sommiamo tutte le sedi dell'org.
  const sediQuery = sedeId
    ? supabase.from('sedi').select('id, nome').eq('id', sedeId)
    : supabase.from('sedi').select('id, nome').eq('organization_id', orgId).neq('attiva', false)
  const { data: sedi } = await sediQuery
  const sediArr = sedi || []

  // Carico in parallelo per ogni sede chiusure + giornaliero ultimi 14gg.
  const loadKey = async (sede, key) => {
    const { data } = await supabase
      .from('user_data')
      .select('data_value')
      .eq('organization_id', orgId)
      .eq('sede_id', sede.id)
      .eq('data_key', key)
      .maybeSingle()
    return Array.isArray(data?.data_value) ? data.data_value : []
  }

  const chiusurePerSede = await Promise.all(
    sediArr.map(async s => ({ sede: s, items: await loadKey(s, 'pasticceria-chiusure-v1') }))
  )
  const giornalieroPerSede = await Promise.all(
    sediArr.map(async s => ({ sede: s, items: await loadKey(s, 'pasticceria-giornaliero-v1') }))
  )

  // Aggregato ricavi
  for (const { items } of chiusurePerSede) {
    for (const c of items) {
      const d = (c.data || '').slice(0, 10)
      const tot = Number(c.kpi?.totV || c.totale || 0)
      if (d === yesterdayIso) snap.ricaviIeri += tot
      if (d >= localIsoDate(lun) && d < todayIso) snap.ricaviSettCorr += tot
      if (d >= localIsoDate(lunPrec) && d < localIsoDate(lun)) snap.ricaviSettPrec += tot
    }
  }

  // Food cost medio settimana corrente (giornaliero)
  let fcSum = 0, fcCount = 0, fcSumYesterday = 0, fcCountYesterday = 0
  const lunIso = localIsoDate(lun)
  // (locale dates: yesterdayIso/todayIso/lunIso usano localIsoDate)
  for (const { items } of giornalieroPerSede) {
    for (const sess of items) {
      const d = (sess.data || '').slice(0, 10)
      const rt = Number(sess.ricavoTot)
      const fc = Number(sess.fcTot)
      // NaN guard: salta sessioni con ricavoTot/fcTot non-finiti.
      if (!Number.isFinite(rt) || !Number.isFinite(fc) || rt <= 0) continue
      const pct = (fc / rt) * 100
      if (d >= lunIso && d < todayIso) { fcSum += pct; fcCount++ }
      if (d === yesterdayIso) { fcSumYesterday += pct; fcCountYesterday++ }
    }
  }
  snap.foodCostMedio = fcCount > 0 ? fcSum / fcCount : null
  snap.foodCostIeri = fcCountYesterday > 0 ? fcSumYesterday / fcCountYesterday : null

  // Top prodotto + prodotti in calo (settimana vs settimana prec.)
  const venduto = {}    // { nome: { sett: qta, prec: qta, ricavo: € } }
  for (const { items } of chiusurePerSede) {
    for (const c of items) {
      const d = (c.data || '').slice(0, 10)
      const inSett = d >= localIsoDate(lun) && d < todayIso
      const inPrec = d >= localIsoDate(lunPrec) && d < localIsoDate(lun)
      if (!inSett && !inPrec) continue
      const items2 = Array.isArray(c.prodotti) ? c.prodotti : Array.isArray(c.righe) ? c.righe : []
      for (const r of items2) {
        const nome = (r.nome || r.prodotto || '').toUpperCase().trim()
        if (!nome) continue
        if (!venduto[nome]) venduto[nome] = { sett: 0, prec: 0, ricavo: 0 }
        const q = Number(r.venduto || r.qta || r.pezzi || 0)
        const ric = Number(r.ricavo || r.totale || (q * Number(r.prezzo || 0)))
        if (inSett) { venduto[nome].sett += q; venduto[nome].ricavo += ric }
        if (inPrec) { venduto[nome].prec += q }
      }
    }
  }
  const arr = Object.entries(venduto)
  if (arr.length > 0) {
    arr.sort((a, b) => b[1].ricavo - a[1].ricavo)
    const [topNome, topV] = arr[0]
    snap.topProdotto = { nome: topNome, qta: topV.sett, ricavo: topV.ricavo }
    snap.prodottiInCalo = arr
      .filter(([, v]) => v.prec >= 5 && v.sett < v.prec * 0.8)
      .slice(0, 5)
      .map(([nome, v]) => ({ nome, deltaPct: v.prec > 0 ? ((v.sett - v.prec) / v.prec) * 100 : 0, sett: v.sett, prec: v.prec }))
  }

  // Magazzino sotto soglia (tabella materie_prime / soglie via user_data magazzino).
  for (const sede of sediArr) {
    const { data } = await supabase
      .from('user_data')
      .select('data_value')
      .eq('organization_id', orgId)
      .eq('sede_id', sede.id)
      .eq('data_key', 'pasticceria-magazzino-v1')
      .maybeSingle()
    const mag = data?.data_value || {}
    for (const [nome, info] of Object.entries(mag)) {
      const giacenza = Number(info?.giacenza_g ?? info?.giacenza ?? 0)
      const soglia = Number(info?.soglia_min_g ?? info?.soglia ?? 0)
      if (soglia > 0 && giacenza <= soglia) {
        snap.mpSottoSoglia.push({ nome, giacenza, soglia, sede: sede.nome })
      }
    }
  }

  // Fatture fornitori scadute / in scadenza 7gg.
  // PII safety: tronchiamo nome fornitore a 24 char e omettiamo P.IVA prima
  // di passare a Claude (vedi cron-daily-brief.js buildUserPayload).
  {
    const { data: fatture } = await supabase
      .from('fatture')
      .select('id, fornitore_nome, importo_lordo, data_scadenza, stato')
      .eq('organization_id', orgId)
      .neq('stato', 'pagata')
      .lte('data_scadenza', localIsoDate(new Date(today.getTime() + 7 * 86400000)))
    const truncName = (s) => {
      const v = String(s || '').trim()
      return v.length > 24 ? v.slice(0, 24) + '…' : v
    }
    for (const f of (fatture || [])) {
      if (!f.data_scadenza) continue
      const row = {
        id: f.id, fornitore: truncName(f.fornitore_nome),
        importo: Number(f.importo_lordo || 0), scadenza: f.data_scadenza,
      }
      if (f.data_scadenza < todayIso) snap.fattureScadute.push(row)
      else snap.fattureInScadenza7gg.push(row)
    }
  }

  // Chiusure mancanti negli ultimi 3 giorni (ognuna su almeno una sede).
  for (let i = 1; i <= 3; i++) {
    const dt = new Date(today); dt.setDate(dt.getDate() - i)
    const iso = dt.toISOString().slice(0, 10)
    const someClosed = chiusurePerSede.some(({ items }) =>
      items.some(c => (c.data || '').slice(0, 10) === iso))
    if (!someClosed) snap.chiusureMancanti.push(iso)
  }

  // Turni scoperti prossimi 3 giorni (basato su tabella turni).
  {
    const dom = localIsoDate(new Date(today.getTime() + 3 * 86400000))
    const { data: turni } = await supabase
      .from('turni')
      .select('data, reparto, sede_id')
      .eq('organization_id', orgId)
      .gte('data', todayIso).lte('data', dom)
    const presenti = new Set((turni || []).map(t => `${t.data}|${t.sede_id || '_'}`))
    for (const s of sediArr) {
      for (let i = 0; i < 3; i++) {
        const dt = localIsoDate(new Date(today.getTime() + i * 86400000))
        if (!presenti.has(`${dt}|${s.id}`)) {
          snap.turniScoperti.push({ data: dt, sede: s.nome })
        }
      }
    }
  }

  return snap
}

// ─── RULE-BASED SUGGESTIONS ─────────────────────────────────────────────────
// Genera suggerimenti deterministici dal snapshot. Veloci, prevedibili,
// non costano token Claude. L'AI generativa li arricchisce solo con
// suggestion narrative aggiuntiva, non sostituisce queste.
export function ruleBasedSuggestions(snap, { orgId, sedeId } = {}) {
  const out = []
  const today = snap.date

  // Magazzino sotto soglia
  for (const mp of snap.mpSottoSoglia.slice(0, 5)) {
    out.push({
      organization_id: orgId, sede_id: sedeId || null,
      tipo: 'magazzino_sotto_soglia',
      severita: 'warning',
      titolo: `${mp.nome} sotto soglia`,
      descrizione: `Giacenza ${mp.giacenza}g <= soglia ${mp.soglia}g${mp.sede ? ` (sede ${mp.sede})` : ''}. Riordina entro 2-3 giorni.`,
      cta_view: 'magazzino',
      cta_label: 'Vai al magazzino',
      payload: mp,
      dedup_key: dedupKey({ orgId, sedeId, tipo: 'mp_sotto_soglia', entity: mp.nome }),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    })
  }

  // Fatture scadute
  for (const f of snap.fattureScadute.slice(0, 5)) {
    out.push({
      organization_id: orgId, sede_id: sedeId || null,
      tipo: 'fattura_scaduta',
      severita: 'critical',
      titolo: `Fattura scaduta: ${f.fornitore}`,
      descrizione: `€${f.importo.toFixed(2)} dovuti il ${f.scadenza}. Paga o concorda dilazione col fornitore.`,
      cta_view: 'scadenzario',
      cta_label: 'Vai allo scadenzario',
      payload: f,
      dedup_key: dedupKey({ orgId, sedeId, tipo: 'fattura_scaduta', entity: f.id }),
      expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    })
  }

  // Fatture in scadenza nei prossimi 7gg
  for (const f of snap.fattureInScadenza7gg.slice(0, 3)) {
    out.push({
      organization_id: orgId, sede_id: sedeId || null,
      tipo: 'fattura_in_scadenza',
      severita: 'warning',
      titolo: `Fattura ${f.fornitore} in scadenza`,
      descrizione: `€${f.importo.toFixed(2)} scade il ${f.scadenza}. Pianifica il pagamento.`,
      cta_view: 'scadenzario', cta_label: 'Vai allo scadenzario',
      payload: f,
      dedup_key: dedupKey({ orgId, sedeId, tipo: 'fattura_in_scadenza', entity: f.id }),
      expires_at: new Date(Date.now() + 10 * 86400000).toISOString(),
    })
  }

  // Food cost alto
  if (snap.foodCostMedio != null && snap.foodCostMedio > 38) {
    out.push({
      organization_id: orgId, sede_id: sedeId || null,
      tipo: 'food_cost_alto',
      severita: snap.foodCostMedio > 42 ? 'critical' : 'warning',
      titolo: `Food cost medio ${snap.foodCostMedio.toFixed(1)}%`,
      descrizione: `Sopra la soglia 38%. Controlla rese, scarti e prezzi ingredienti per le ricette più vendute.`,
      cta_view: 'pl', cta_label: 'Vai al P&L',
      payload: { foodCost: snap.foodCostMedio },
      dedup_key: dedupKey({ orgId, sedeId, tipo: 'food_cost_alto', entity: today.slice(0, 7) }),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    })
  }

  // Prodotti in calo
  for (const p of snap.prodottiInCalo.slice(0, 3)) {
    out.push({
      organization_id: orgId, sede_id: sedeId || null,
      tipo: 'prodotto_in_calo',
      severita: 'info',
      titolo: `${p.nome}: ${p.deltaPct.toFixed(0)}% vs settimana scorsa`,
      descrizione: `Venduti ${p.sett} pz vs ${p.prec} la settimana prec. Valuta promo, ricambio in vetrina o sostituzione.`,
      cta_view: 'storico', cta_label: 'Apri storico',
      payload: p,
      dedup_key: dedupKey({ orgId, sedeId, tipo: 'prodotto_in_calo', entity: p.nome }),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    })
  }

  // Chiusure mancanti
  if (snap.chiusureMancanti.length > 0) {
    out.push({
      organization_id: orgId, sede_id: sedeId || null,
      tipo: 'chiusura_mancante',
      severita: 'info',
      titolo: `${snap.chiusureMancanti.length} chiusur${snap.chiusureMancanti.length === 1 ? 'a' : 'e'} cassa mancante/i`,
      descrizione: `Manca la registrazione cassa per ${snap.chiusureMancanti.join(', ')}. Regolarizza per non perdere il dato.`,
      cta_view: 'chiusura', cta_label: 'Apri chiusura',
      payload: { days: snap.chiusureMancanti },
      dedup_key: dedupKey({ orgId, sedeId, tipo: 'chiusura_mancante', entity: snap.chiusureMancanti[0] }),
      expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    })
  }

  // Turni scoperti
  if (snap.turniScoperti.length > 0) {
    out.push({
      organization_id: orgId, sede_id: sedeId || null,
      tipo: 'turni_scoperti',
      severita: 'warning',
      titolo: `${snap.turniScoperti.length} turn${snap.turniScoperti.length === 1 ? 'o' : 'i'} ancora scoperti`,
      descrizione: `Prossimi giorni senza personale assegnato. Pianifica per evitare scoperture.`,
      cta_view: 'personale', cta_label: 'Apri personale',
      payload: { turni: snap.turniScoperti.slice(0, 5) },
      dedup_key: dedupKey({ orgId, sedeId, tipo: 'turni_scoperti', entity: snap.turniScoperti[0]?.data }),
      expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    })
  }

  // Trend ricavi (opportunity / warning)
  if (snap.ricaviSettPrec > 0) {
    const deltaPct = ((snap.ricaviSettCorr - snap.ricaviSettPrec) / snap.ricaviSettPrec) * 100
    if (deltaPct >= 15) {
      out.push({
        organization_id: orgId, sede_id: sedeId || null,
        tipo: 'ricavi_in_crescita',
        severita: 'opportunity',
        titolo: `Settimana +${deltaPct.toFixed(0)}% vs precedente`,
        descrizione: `Ricavi €${snap.ricaviSettCorr.toFixed(0)} vs €${snap.ricaviSettPrec.toFixed(0)}. Capitalizza con promo o nuova referenza.`,
        cta_view: 'pl', cta_label: 'Apri P&L',
        payload: { delta: deltaPct, cur: snap.ricaviSettCorr, prev: snap.ricaviSettPrec },
        dedup_key: dedupKey({ orgId, sedeId, tipo: 'ricavi_su', entity: today.slice(0, 7) }),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
    } else if (deltaPct <= -15) {
      out.push({
        organization_id: orgId, sede_id: sedeId || null,
        tipo: 'ricavi_in_calo',
        severita: 'warning',
        titolo: `Settimana ${deltaPct.toFixed(0)}% vs precedente`,
        descrizione: `Ricavi €${snap.ricaviSettCorr.toFixed(0)} vs €${snap.ricaviSettPrec.toFixed(0)}. Verifica meteo/eventi/concorrenza zona.`,
        cta_view: 'pl', cta_label: 'Apri P&L',
        payload: { delta: deltaPct, cur: snap.ricaviSettCorr, prev: snap.ricaviSettPrec },
        dedup_key: dedupKey({ orgId, sedeId, tipo: 'ricavi_giu', entity: today.slice(0, 7) }),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
    }
  }

  return out
}
