import React, { useState, useEffect, useMemo } from 'react'
import Icon from './Icon'
import { SkeletonGrid, SkeletonTable, SkeletonList } from './Skeleton'
import ExportPdfButton from './ExportPdfButton'
import PeriodCompareSelector from './PeriodCompareSelector'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import { sload } from '../lib/storage'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import { caricaCostiAziendali, totaleMensile } from '../lib/costiAziendali'

const TXT = T.text
const SOFT = T.textSoft
const MID = T.textMid
const GRN = T.green
const RED = T.brand
const GRN_BG = T.greenLight
const RED_BG = T.brandLight
const AMB = T.amber
const AMB_BG = T.amberLight
const CARD = T.bgCard
const BORDER = T.border
const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" };

function fmt(n) {
  if (n == null) return '—'
  return '€ ' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmt0(n) {
  if (n == null) return '—'
  return '€ ' + Number(n).toLocaleString('it-IT', { maximumFractionDigits: 0 })
}
function fmtInt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('it-IT', { maximumFractionDigits: 0 })
}
function fmtPct(n) {
  if (n == null) return '—'
  return Number(n).toFixed(1) + '%'
}
function fmtDelta(prev, curr, fmtter) {
  if (prev == null || curr == null) return null
  const delta = curr - prev
  if (Math.abs(delta) < 0.01) return null
  const pct = prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : null
  return { delta, pct, sign: delta >= 0 ? '+' : '', positive: delta >= 0, fmt: fmtter || fmt }
}

// Inizio settimana corrente (domenica → lunedì? in Italia tipicamente lunedì).
function getStartOfWeek(offset = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7  // 0 = lunedì
  d.setDate(d.getDate() - dow - 7 * offset)
  return d
}
function getEndOfWeek(start) {
  const e = new Date(start)
  e.setDate(e.getDate() + 7)
  return e
}
function getStartOfMonth(offset = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  d.setMonth(d.getMonth() - offset)
  return d
}
function getEndOfMonth(start) {
  const e = new Date(start)
  e.setMonth(e.getMonth() + 1)
  return e
}

const PERIODI = [
  { id: 'settimana', lbl: 'Settimana' },
  { id: 'mese',      lbl: 'Mese' },
]

export default function ConfrontoSedi({ orgId, sedi }) {
  const isMobile = useIsMobile()
  const [kpiMap, setKpiMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState('settimana')
  const [costiMap, setCostiMap] = useState({})  // sedeId -> totale mensile costi azienda
  const [trend8w, setTrend8w] = useState([])    // [{lunIso, ricavi}] x 8 settimane gruppo
  // ── Grafici interattivi (R96) ─────────────────────────────────────────────
  const [chartType, setChartType] = useState('bar')   // bar | line | pie
  const [chartMetric, setChartMetric] = useState('ricaviCur')  // KPI selezionata
  const [compareMode, setCompareMode] = useState('prev')  // none | prev | year_prev

  const sediAttive = (sedi || []).filter(s => s.attiva !== false)

  useEffect(() => {
    if (!orgId || sediAttive.length < 2) { setLoading(false); return }
    let cancelled = false

    async function loadAll() {
      setLoading(true)
      const today = new Date().toISOString().split('T')[0]
      let curStart, curEnd, prevStart, prevEnd
      if (periodo === 'mese') {
        curStart = getStartOfMonth(0)
        curEnd = getEndOfMonth(curStart)
        prevStart = getStartOfMonth(1)
        prevEnd = getEndOfMonth(prevStart)
      } else {
        curStart = getStartOfWeek(0)
        curEnd = getEndOfWeek(curStart)
        prevStart = getStartOfWeek(1)
        prevEnd = getEndOfWeek(prevStart)
      }
      const results = {}
      const costiResults = {}

      // Carico in una sola query: stock PF + trasferimenti pendenti per tutte le sedi.
      const [stockAll, trasfPending, fattureAll, costiOrg] = await Promise.all([
        supabase.from('stock_prodotti_finiti')
          .select('sede_id, quantita, prodotto_nome')
          .eq('organization_id', orgId),
        supabase.from('trasferimenti')
          .select('sede_a, sede_da, stato')
          .eq('organization_id', orgId)
          .eq('stato', 'inviato'),
        supabase.from('fatture')
          .select('id, sede_id, stato, importo_lordo, data_scadenza')
          .eq('organization_id', orgId),
        caricaCostiAziendali(orgId, null).catch(() => []),
      ])

      // Costi aziendali: globali + per-sede.
      const globaliMensili = totaleMensile((costiOrg || []).filter(c => !c.sede_id))
      for (const s of sediAttive) {
        const speMensile = totaleMensile((costiOrg || []).filter(c => c.sede_id === s.id))
        // I costi globali vengono ripartiti in parti uguali tra le sedi.
        const quotaGlob = sediAttive.length > 0 ? globaliMensili / sediAttive.length : 0
        costiResults[s.id] = speMensile + quotaGlob
      }

      // Aggrego stock PF per sede.
      const stockBySede = {}
      const stockProdsBySede = {}
      for (const r of (stockAll.data || [])) {
        stockBySede[r.sede_id] = (stockBySede[r.sede_id] || 0) + Number(r.quantita || 0)
        stockProdsBySede[r.sede_id] = (stockProdsBySede[r.sede_id] || new Set()).add(r.prodotto_nome)
      }
      // Trasferimenti pendenti per sede destinataria.
      const pendingBySede = {}
      for (const t of (trasfPending.data || [])) {
        pendingBySede[t.sede_a] = (pendingBySede[t.sede_a] || 0) + 1
      }
      // Fatture: non pagate + scadute.
      const fattureBySede = {}
      const fattureScadByS = {}
      const fattureImpByS = {}
      const todayIso = today
      for (const f of (fattureAll.data || [])) {
        if (f.stato !== 'pagata') {
          fattureBySede[f.sede_id] = (fattureBySede[f.sede_id] || 0) + 1
          fattureImpByS[f.sede_id] = (fattureImpByS[f.sede_id] || 0) + Number(f.importo_lordo || 0)
          if (f.data_scadenza && f.data_scadenza < todayIso) {
            fattureScadByS[f.sede_id] = (fattureScadByS[f.sede_id] || 0) + 1
          }
        }
      }

      // Calcola le 8 settimane piu' recenti (per trend sparkline gruppo).
      const trend8 = []
      for (let i = 7; i >= 0; i--) {
        const lun = getStartOfWeek(i)
        const dom = getEndOfWeek(lun)
        trend8.push({ lun, dom, lunIso: lun.toISOString().slice(0, 10), ricavi: 0 })
      }

      // Per ogni sede, carico chiusure + giornaliero (per-sede, non c'è un modo aggregato).
      await Promise.all(sediAttive.map(async (sede) => {
        try {
          const [chiusure, giornaliero] = await Promise.all([
            sload('pasticceria-chiusure-v1', orgId, sede.id),
            sload('pasticceria-giornaliero-v1', orgId, sede.id),
          ])

          const chiusureArr = Array.isArray(chiusure) ? chiusure : []
          const inRange = (d, a, b) => {
            const x = new Date(d)
            x.setHours(0, 0, 0, 0)
            return x >= a && x < b
          }
          const ricaviCur = chiusureArr
            .filter(c => inRange(c.data || 0, curStart, curEnd))
            .reduce((s, c) => s + (c.kpi?.totV || 0), 0)
          const ricaviPrev = chiusureArr
            .filter(c => inRange(c.data || 0, prevStart, prevEnd))
            .reduce((s, c) => s + (c.kpi?.totV || 0), 0)

          // Trend 8 settimane: somma cumulativa nel trend8 condiviso.
          for (const wk of trend8) {
            const sumW = chiusureArr
              .filter(c => inRange(c.data || 0, wk.lun, wk.dom))
              .reduce((s, c) => s + (c.kpi?.totV || 0), 0)
            wk.ricavi += sumW
          }

          const giorArr = Array.isArray(giornaliero) ? giornaliero : []
          // Food cost % nel periodo
          let fcSum = 0, fcCount = 0
          giorArr.forEach(sess => {
            const d = new Date(sess.data || 0)
            d.setHours(0, 0, 0, 0)
            if (d >= curStart && d < curEnd && sess.ricavoTot > 0) {
              fcSum += (sess.fcTot / sess.ricavoTot) * 100
              fcCount++
            }
          })
          const foodCostPct = fcCount > 0 ? fcSum / fcCount : null

          // Margine lordo periodo (ricavi - food cost €)
          let fcEuroCur = 0
          giorArr.forEach(sess => {
            const d = new Date(sess.data || 0)
            d.setHours(0, 0, 0, 0)
            if (d >= curStart && d < curEnd) fcEuroCur += (sess.fcTot || 0)
          })
          const margineLordoCur = ricaviCur - fcEuroCur

          // Costi aziendali ripartiti sul periodo
          const giorniPeriodo = Math.max(1, Math.round((curEnd - curStart) / (1000 * 60 * 60 * 24)))
          const costiPeriodo = (costiResults[sede.id] || 0) * (giorniPeriodo / 30)
          const margineNettoCur = margineLordoCur - costiPeriodo

          const prodOggi = giorArr
            .filter(sess => (sess.data || '').startsWith(today))
            .reduce((s, sess) => s + (sess.prodotti || []).reduce((ps, p) => ps + (p.stampi || 0), 0), 0)

          results[sede.id] = {
            ricaviCur, ricaviPrev,
            foodCostPct,
            margineLordoCur,
            margineNettoCur,
            costiPeriodo,
            prodOggi,
            fattureDaPagare: fattureBySede[sede.id] || 0,
            fattureScadute: fattureScadByS[sede.id] || 0,
            fattureImporto: fattureImpByS[sede.id] || 0,
            stockPF: stockBySede[sede.id] || 0,
            stockProdsCount: (stockProdsBySede[sede.id]?.size) || 0,
            trasfInArrivo: pendingBySede[sede.id] || 0,
          }
        } catch {
          results[sede.id] = {
            ricaviCur: null, ricaviPrev: null,
            foodCostPct: null,
            margineLordoCur: null, margineNettoCur: null, costiPeriodo: null,
            prodOggi: null,
            fattureDaPagare: null, fattureScadute: null, fattureImporto: null,
            stockPF: null, stockProdsCount: null, trasfInArrivo: null,
          }
        }
      }))

      if (!cancelled) {
        setKpiMap(results)
        setCostiMap(costiResults)
        setTrend8w(trend8)
        setLoading(false)
      }
    }

    loadAll()
    return () => { cancelled = true }
  }, [orgId, sediAttive.length, periodo])

  // ── Alerts (dati derivati) ─────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const out = []
    for (const s of sediAttive) {
      const k = kpiMap[s.id]
      if (!k) continue
      if (k.foodCostPct != null && k.foodCostPct > 38) {
        out.push({ sede: s, lvl: 'red', icon: 'receipt', msg: `Food cost ${k.foodCostPct.toFixed(1)}% sopra soglia (38%)` })
      } else if (k.foodCostPct != null && k.foodCostPct > 33) {
        out.push({ sede: s, lvl: 'amber', icon: 'receipt', msg: `Food cost ${k.foodCostPct.toFixed(1)}% — monitorare` })
      }
      if (k.fattureScadute > 0) {
        out.push({ sede: s, lvl: 'red', icon: 'fileText', msg: `${k.fattureScadute} fattur${k.fattureScadute === 1 ? 'a scaduta' : 'e scadute'} da pagare` })
      }
      if (k.trasfInArrivo > 0) {
        out.push({ sede: s, lvl: 'amber', icon: 'truck', msg: `${k.trasfInArrivo} trasferiment${k.trasfInArrivo === 1 ? 'o' : 'i'} in attesa di ricezione` })
      }
      if (k.margineNettoCur != null && k.margineNettoCur < 0) {
        out.push({ sede: s, lvl: 'red', icon: 'money', msg: `Margine netto negativo (${fmt0(k.margineNettoCur)})` })
      }
      if (k.ricaviCur != null && k.ricaviPrev != null && k.ricaviPrev > 0) {
        const calo = ((k.ricaviCur - k.ricaviPrev) / k.ricaviPrev) * 100
        if (calo < -15) out.push({ sede: s, lvl: 'red', icon: 'trendDown', msg: `Ricavi -${Math.abs(calo).toFixed(0)}% vs ${periodo === 'mese' ? 'mese' : 'settimana'} precedente` })
      }
    }
    return out
  }, [kpiMap, sediAttive, periodo])

  // ── Consolidato gruppo (CFO view) ─────────────────────────────────────────
  const consolidato = useMemo(() => {
    let ricCur = 0, ricPrev = 0, margNetto = 0, margLordo = 0, costiPeriodo = 0
    let fcSum = 0, fcCount = 0
    let sediConData = 0
    for (const s of sediAttive) {
      const k = kpiMap[s.id]
      if (!k) continue
      sediConData++
      if (k.ricaviCur != null) ricCur += k.ricaviCur
      if (k.ricaviPrev != null) ricPrev += k.ricaviPrev
      if (k.margineLordoCur != null) margLordo += k.margineLordoCur
      if (k.margineNettoCur != null) margNetto += k.margineNettoCur
      if (k.costiPeriodo != null) costiPeriodo += k.costiPeriodo
      if (k.foodCostPct != null) { fcSum += k.foodCostPct; fcCount++ }
    }
    return {
      ricCur, ricPrev,
      deltaRicPct: ricPrev > 0 ? ((ricCur - ricPrev) / ricPrev) * 100 : null,
      margNetto, margLordo, costiPeriodo,
      foodCostMedio: fcCount > 0 ? fcSum / fcCount : null,
      sediConData,
      margineNettoPct: ricCur > 0 ? (margNetto / ricCur) * 100 : null,
    }
  }, [sediAttive, kpiMap])

  // ── Sede critica + Sede champion (con punteggio composito) ─────────────────
  // Punteggio composito per ogni sede (alto = bene):
  //   margine netto vs ricavi  → +1 a +50
  //   food cost (bassa = bene) → +20 se <30, +10 se <35, 0 se <40, -10 se >=40
  //   trend ricavi             → +15 se >+10%, -15 se <-10%
  //   alert critici            → -20 per ognuno
  const scoreSedi = useMemo(() => {
    return sediAttive.map(s => {
      const k = kpiMap[s.id]
      if (!k) return { sede: s, score: null }
      let score = 50
      if (k.ricaviCur > 0 && k.margineNettoCur != null) {
        score += (k.margineNettoCur / k.ricaviCur) * 50
      }
      if (k.foodCostPct != null) {
        if (k.foodCostPct < 30) score += 20
        else if (k.foodCostPct < 35) score += 10
        else if (k.foodCostPct >= 40) score -= 10
      }
      if (k.ricaviCur != null && k.ricaviPrev > 0) {
        const dPct = ((k.ricaviCur - k.ricaviPrev) / k.ricaviPrev) * 100
        if (dPct >= 10) score += 15
        else if (dPct <= -10) score -= 15
      }
      if (k.fattureScadute > 0) score -= 10
      if (k.margineNettoCur != null && k.margineNettoCur < 0) score -= 20
      return { sede: s, score, k }
    }).filter(x => x.score != null)
  }, [sediAttive, kpiMap])

  const sedeCritica = useMemo(() => {
    if (scoreSedi.length < 2) return null
    const sorted = [...scoreSedi].sort((a, b) => a.score - b.score)
    return sorted[0].score < 40 ? sorted[0] : null
  }, [scoreSedi])

  const sedeChampion = useMemo(() => {
    if (scoreSedi.length < 2) return null
    const sorted = [...scoreSedi].sort((a, b) => b.score - a.score)
    return sorted[0].score > 60 ? sorted[0] : null
  }, [scoreSedi])

  // ── Verdict narrativo gruppo (regola-based, niente AI per zero-cost) ──────
  const verdict = useMemo(() => {
    if (!consolidato || consolidato.sediConData < 2) return null
    const pieces = []
    if (consolidato.deltaRicPct != null && Math.abs(consolidato.deltaRicPct) >= 5) {
      pieces.push(consolidato.deltaRicPct >= 0
        ? `Gruppo in crescita: +${consolidato.deltaRicPct.toFixed(0)}% vs ${periodo === 'mese' ? 'mese' : 'settimana'} precedente`
        : `Gruppo in calo: ${consolidato.deltaRicPct.toFixed(0)}% vs ${periodo === 'mese' ? 'mese' : 'settimana'} precedente`)
    }
    if (sedeChampion && sedeCritica) {
      pieces.push(`${sedeChampion.sede.nome} traina, ${sedeCritica.sede.nome} richiede attenzione`)
    } else if (sedeChampion) {
      pieces.push(`${sedeChampion.sede.nome} sta performando sopra la media`)
    } else if (sedeCritica) {
      pieces.push(`${sedeCritica.sede.nome} richiede attenzione immediata`)
    }
    if (consolidato.margineNettoPct != null) {
      pieces.push(consolidato.margineNettoPct >= 15
        ? `margine netto sano (${consolidato.margineNettoPct.toFixed(0)}%)`
        : consolidato.margineNettoPct >= 5
          ? `margine sotto target (${consolidato.margineNettoPct.toFixed(0)}%)`
          : `margine critico (${consolidato.margineNettoPct.toFixed(0)}%)`)
    }
    return pieces.length > 0 ? pieces.join('. ') + '.' : null
  }, [consolidato, sedeChampion, sedeCritica, periodo])

  // ── Ranking per ricavi periodo ─────────────────────────────────────────────
  const ranking = useMemo(() => {
    return [...sediAttive]
      .map(s => ({ sede: s, ricavi: kpiMap[s.id]?.ricaviCur }))
      .filter(x => x.ricavi != null)
      .sort((a, b) => (b.ricavi || 0) - (a.ricavi || 0))
  }, [sediAttive, kpiMap])

  if (sediAttive.length < 2) return (
    <div style={{ maxWidth: 640, margin: '60px auto', textAlign: 'center', padding: 20 }}>
      <div style={{ marginBottom: 12 }}><Icon name="barChart" size={48} color={SOFT} /></div>
      <h2 style={{ fontSize: 20, color: TXT, marginBottom: 8 }}>Confronto sedi</h2>
      <p style={{ fontSize: 13, color: SOFT, lineHeight: 1.6 }}>
        Disponibile quando hai almeno 2 sedi attive.<br/>
        <strong style={{ color: TXT }}>Vai in Impostazioni → Sedi</strong> per aggiungerne una.
      </p>
    </div>
  )

  function getBestWorst(key, lowerIsBetter = false) {
    const vals = sediAttive
      .map(s => ({ id: s.id, v: kpiMap[s.id]?.[key] }))
      .filter(x => x.v != null)
    if (vals.length < 2) return {}
    const sorted = [...vals].sort((a, b) => lowerIsBetter ? a.v - b.v : b.v - a.v)
    if (sorted[0].v === sorted[sorted.length - 1].v) return {}
    return { best: sorted[0].id, worst: sorted[sorted.length - 1].id }
  }

  const bwRicavi  = getBestWorst('ricaviCur')
  const bwFC      = getBestWorst('foodCostPct', true)
  const bwMargine = getBestWorst('margineNettoCur')
  const bwProd    = getBestWorst('prodOggi')
  const bwFatture = getBestWorst('fattureDaPagare', true)
  const bwStock   = getBestWorst('stockPF')
  const bwArrivo  = getBestWorst('trasfInArrivo', true)

  function cellStyle(sedeId, bw) {
    if (!bw.best) return {}
    if (sedeId === bw.best) return { background: GRN_BG, color: GRN, fontWeight: 800 }
    if (sedeId === bw.worst) return { background: RED_BG, color: RED, fontWeight: 800 }
    return {}
  }

  const periodoLabel = periodo === 'mese' ? 'mese' : 'settimana'

  const RIGHE_KPI = [
    { key: 'ricaviCur',       icon: 'money',    label: `Ricavi ${periodoLabel}`,   fmt: fmt0,    bw: bwRicavi,  prevKey: 'ricaviPrev' },
    { key: 'foodCostPct',     icon: 'receipt',  label: 'Food cost medio',          fmt: fmtPct,  bw: bwFC },
    { key: 'margineNettoCur', icon: 'trendUp',  label: `Margine netto ${periodoLabel}`, fmt: fmt0, bw: bwMargine },
    { key: 'prodOggi',        icon: 'factory',  label: 'Prodotti oggi',            fmt: v => v ?? 0, bw: bwProd },
    { key: 'stockPF',         icon: 'package',  label: 'Stock vetrina',            fmt: v => v != null ? `${fmtInt(v)} pz` : '—', bw: bwStock },
    { key: 'trasfInArrivo',   icon: 'truck',    label: 'Trasf. in arrivo',         fmt: v => v ?? 0, bw: bwArrivo },
    { key: 'fattureDaPagare', icon: 'fileText', label: 'Fatture da pagare',        fmt: v => v ?? 0, bw: bwFatture },
  ]

  const headerStyle = { padding: isMobile ? '8px 10px' : '12px 16px', fontSize: 11, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${BORDER}`, textAlign: 'center' }
  const tdL = { padding: isMobile ? '10px 10px' : '12px 16px', fontSize: 13, color: MID, borderTop: `1px solid ${BORDER}` }
  const tdC = { padding: isMobile ? '10px 10px' : '12px 16px', fontSize: 13, textAlign: 'center', borderTop: `1px solid ${BORDER}`, ...tnum }

  return (
    <div style={{ maxWidth: 1080, padding: isMobile ? 12 : 0 }}>
      {/* Header + selettore periodo */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED, marginBottom: 6 }}>Analisi</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: 12, color: SOFT, lineHeight: 1.5 }}>
            <span style={{ color: GRN, fontWeight: 700 }}>Verde</span> = migliore &nbsp;·&nbsp;
            <span style={{ color: RED, fontWeight: 700 }}>Rosso</span> = peggiore &nbsp;·&nbsp;
            confronto con <strong>{periodo === 'mese' ? 'mese' : 'settimana'} precedente</strong>
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 999, padding: 3 }}>
              {PERIODI.map(p => (
                <button key={p.id} onClick={() => setPeriodo(p.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 999, border: 'none',
                    background: periodo === p.id ? TXT : 'transparent',
                    color: periodo === p.id ? '#fff' : MID,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>
                  {p.lbl}
                </button>
              ))}
            </div>
            <ExportPdfButton
              fileName={`confronto-sedi-${periodo}.pdf`}
              compact
              getReport={() => ({
                title: 'Confronto sedi',
                subtitle: `${sediAttive.length} sedi attive`,
                periodo: `Periodo: ${periodo === 'mese' ? 'mese corrente' : 'settimana corrente'} vs ${periodo} precedente`,
                kpi: consolidato ? [
                  { label: 'Ricavi gruppo', value: `€ ${fmt0(consolidato.ricCur)}`, sub: consolidato.deltaRicPct != null ? `${consolidato.deltaRicPct >= 0 ? '+' : ''}${consolidato.deltaRicPct.toFixed(0)}% vs prec.` : '' },
                  { label: 'Margine netto', value: `€ ${fmt0(consolidato.margNetto)}`, sub: consolidato.margineNettoPct != null ? `${consolidato.margineNettoPct.toFixed(1)}% dei ricavi` : '' },
                  { label: 'Food cost medio', value: consolidato.foodCostMedio != null ? consolidato.foodCostMedio.toFixed(1) + '%' : '—', sub: 'target < 33%' },
                  { label: 'Costi azienda', value: `€ ${fmt0(consolidato.costiPeriodo || 0)}` },
                ] : [],
                sections: [
                  {
                    title: 'KPI per sede',
                    table: {
                      columns: ['Sede', 'Ricavi €', 'Food cost %', 'Margine netto €', 'Trasf. attesi', 'Fatture scadute'],
                      alignments: ['left', 'right', 'right', 'right', 'right', 'right'],
                      rows: sediAttive.map(s => {
                        const k = kpiMap[s.id] || {}
                        return [
                          s.nome,
                          fmt0(k.ricaviCur),
                          k.foodCostPct != null ? k.foodCostPct.toFixed(1) + '%' : '—',
                          fmt0(k.margineNettoCur),
                          String(k.trasfInArrivo || 0),
                          String(k.fattureScadute || 0),
                        ]
                      }),
                    },
                  },
                  ...(alerts.length > 0 ? [{
                    title: 'Alerts da gestire',
                    table: {
                      columns: ['Sede', 'Livello', 'Messaggio'],
                      alignments: ['left', 'left', 'left'],
                      rows: alerts.map(a => [a.sede.nome, a.lvl.toUpperCase(), a.msg]),
                    },
                  }] : []),
                ],
              })}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
          <SkeletonList count={Math.min(sediAttive.length || 3, 5)} height={56} />
          <SkeletonTable rows={5} cols={Math.min((sediAttive.length || 2) + 1, 5)} />
        </div>
      ) : (
        <>
          {/* HERO CONSOLIDATO GRUPPO + verdict narrativo */}
          {consolidato && consolidato.sediConData >= 2 && (
            <div style={{
              background: 'linear-gradient(135deg, #1C0A0A 0%, #4A0612 60%, #6E0E1A 100%)',
              borderRadius: 18, padding: isMobile ? 18 : 26, marginBottom: 16,
              boxShadow: '0 14px 40px rgba(110,14,26,0.32)',
              color: '#FFF', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: -60, right: -30, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,75,58,0.30) 0%, transparent 70%)', pointerEvents: 'none' }}/>
              <div style={{ position: 'relative' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)', marginBottom: 10 }}>
                  Vista gruppo · {consolidato.sediConData} {consolidato.sediConData === 1 ? 'sede' : 'sedi'} attive
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                  gap: isMobile ? 12 : 18,
                }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Ricavi {periodoLabel}</div>
                    <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, marginTop: 4, ...tnum }}>{fmt0(consolidato.ricCur)}</div>
                    {consolidato.deltaRicPct != null && (
                      <div style={{ fontSize: 11, marginTop: 4, color: consolidato.deltaRicPct >= 0 ? '#86EFAC' : '#FCA5A5', fontWeight: 700, ...tnum }}>
                        {consolidato.deltaRicPct >= 0 ? '+' : ''}{consolidato.deltaRicPct.toFixed(0)}% vs prec.
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Margine netto</div>
                    <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, marginTop: 4, color: consolidato.margNetto >= 0 ? '#FFF' : '#FCA5A5', ...tnum }}>
                      {fmt0(consolidato.margNetto)}
                    </div>
                    {consolidato.margineNettoPct != null && (
                      <div style={{ fontSize: 11, marginTop: 4, color: 'rgba(255,255,255,0.65)', fontWeight: 600, ...tnum }}>
                        {consolidato.margineNettoPct.toFixed(1)}% dei ricavi
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Food cost medio</div>
                    <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, marginTop: 4, color: consolidato.foodCostMedio == null ? 'rgba(255,255,255,0.5)' : consolidato.foodCostMedio < 33 ? '#86EFAC' : consolidato.foodCostMedio < 38 ? '#FCD34D' : '#FCA5A5', ...tnum }}>
                      {consolidato.foodCostMedio != null ? consolidato.foodCostMedio.toFixed(1) + '%' : '—'}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 4, color: 'rgba(255,255,255,0.55)' }}>
                      target &lt; 33%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Costi azienda</div>
                    <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, marginTop: 4, ...tnum }}>{fmt0(consolidato.costiPeriodo || 0)}</div>
                    <div style={{ fontSize: 11, marginTop: 4, color: 'rgba(255,255,255,0.55)' }}>
                      personalizzati
                    </div>
                  </div>
                </div>

                {/* Trend sparkline 8 settimane gruppo */}
                {trend8w.length >= 4 && (() => {
                  const max = Math.max(...trend8w.map(w => w.ricavi))
                  const min = Math.min(...trend8w.map(w => w.ricavi))
                  const range = max - min || 1
                  const W = isMobile ? 280 : 520
                  const H = 56
                  const pad = 4
                  const pts = trend8w.map((w, i) => {
                    const x = pad + (i / (trend8w.length - 1)) * (W - 2 * pad)
                    const y = pad + (1 - (w.ricavi - min) / range) * (H - 2 * pad)
                    return [x, y]
                  })
                  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')
                  const dArea = d + ` L${pts[pts.length - 1][0].toFixed(1)},${H - pad} L${pts[0][0].toFixed(1)},${H - pad} Z`
                  return (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                        Trend ricavi · ultime 8 settimane
                      </div>
                      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: '100%', height: 'auto' }}>
                        <path d={dArea} fill="rgba(232,75,58,0.18)" />
                        <path d={d} stroke="#FBD7C9" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
                        {pts.map((p, i) => (
                          <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 3.5 : 2} fill={i === pts.length - 1 ? '#FFF' : '#FBD7C9'} />
                        ))}
                      </svg>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {/* AI VERDICT (narrativo regola-based) */}
          {verdict && (
            <div style={{
              background: '#FFFEF0', border: `1px solid #FDE68A`, borderRadius: 12,
              padding: '14px 18px', marginBottom: 16,
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <div style={{ flexShrink: 0, marginTop: 1 }}>
                <Icon name="sparkles" size={18} color="#B45309" />
              </div>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#92400E', marginBottom: 4 }}>
                  Lettura AI del gruppo
                </div>
                <div style={{ fontSize: 13.5, color: '#451A03', lineHeight: 1.6, fontWeight: 500 }}>
                  {verdict}
                </div>
              </div>
            </div>
          )}

          {/* SEDE CRITICA + SEDE CHAMPION (2 card side-by-side) */}
          {(sedeCritica || sedeChampion) && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : (sedeCritica && sedeChampion ? '1fr 1fr' : '1fr'),
              gap: 12, marginBottom: 16,
            }}>
              {sedeCritica && (
                <div style={{
                  background: '#FEF2F2', border: `1px solid ${RED}`, borderRadius: 12,
                  padding: isMobile ? 14 : 18,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 22 }}>🚨</span>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: RED }}>
                      Sede da gestire subito
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: TXT, marginBottom: 6 }}>
                    <Icon name="pin" size={14} /> {sedeCritica.sede.nome}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: MID, lineHeight: 1.6 }}>
                    {sedeCritica.k?.foodCostPct > 38 && <li>Food cost <strong>{sedeCritica.k.foodCostPct.toFixed(1)}%</strong> sopra soglia</li>}
                    {sedeCritica.k?.margineNettoCur < 0 && <li>Margine netto <strong>{fmt0(sedeCritica.k.margineNettoCur)}</strong></li>}
                    {sedeCritica.k?.ricaviCur != null && sedeCritica.k?.ricaviPrev > 0 && ((sedeCritica.k.ricaviCur - sedeCritica.k.ricaviPrev) / sedeCritica.k.ricaviPrev * 100) <= -10 && <li>Ricavi in calo <strong>{(((sedeCritica.k.ricaviCur - sedeCritica.k.ricaviPrev) / sedeCritica.k.ricaviPrev) * 100).toFixed(0)}%</strong></li>}
                    {sedeCritica.k?.fattureScadute > 0 && <li><strong>{sedeCritica.k.fattureScadute}</strong> fatture scadute</li>}
                    {sedeCritica.k?.trasfInArrivo > 0 && <li><strong>{sedeCritica.k.trasfInArrivo}</strong> trasferimenti in attesa</li>}
                  </ul>
                </div>
              )}
              {sedeChampion && (
                <div style={{
                  background: '#F0FDF4', border: `1px solid ${GRN}`, borderRadius: 12,
                  padding: isMobile ? 14 : 18,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 22 }}>🏆</span>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: GRN }}>
                      Sede champion (replica il modello)
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: TXT, marginBottom: 6 }}>
                    <Icon name="pin" size={14} /> {sedeChampion.sede.nome}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: MID, lineHeight: 1.6 }}>
                    {sedeChampion.k?.foodCostPct != null && sedeChampion.k.foodCostPct < 33 && <li>Food cost <strong>{sedeChampion.k.foodCostPct.toFixed(1)}%</strong> sotto target</li>}
                    {sedeChampion.k?.margineNettoCur > 0 && sedeChampion.k?.ricaviCur > 0 && <li>Margine netto <strong>{((sedeChampion.k.margineNettoCur / sedeChampion.k.ricaviCur) * 100).toFixed(0)}%</strong> dei ricavi</li>}
                    {sedeChampion.k?.ricaviCur != null && sedeChampion.k?.ricaviPrev > 0 && ((sedeChampion.k.ricaviCur - sedeChampion.k.ricaviPrev) / sedeChampion.k.ricaviPrev * 100) >= 10 && <li>Ricavi in crescita <strong>+{(((sedeChampion.k.ricaviCur - sedeChampion.k.ricaviPrev) / sedeChampion.k.ricaviPrev) * 100).toFixed(0)}%</strong></li>}
                    {sedeChampion.k?.fattureDaPagare === 0 && <li>Nessuna fattura scaduta</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* GRAFICO INTERATTIVO — chart switcher + metric + compare */}
          {sediAttive.length >= 2 && (() => {
            const METRICS = [
              { id: 'ricaviCur',       lbl: 'Ricavi',       fmt: v => '€' + fmt0(v) },
              { id: 'foodCostPct',     lbl: 'Food cost %',  fmt: v => v != null ? v.toFixed(1) + '%' : '—' },
              { id: 'margineNettoCur', lbl: 'Margine netto',fmt: v => '€' + fmt0(v) },
              { id: 'fattureScadute',  lbl: 'Fatture scadute', fmt: v => String(v) },
              { id: 'stockPF',         lbl: 'Stock vetrina (pz)', fmt: v => String(v) },
            ]
            const metricDef = METRICS.find(m => m.id === chartMetric) || METRICS[0]
            const prevKey = chartMetric === 'ricaviCur' ? 'ricaviPrev' : null
            const data = sediAttive.map(s => {
              const k = kpiMap[s.id] || {}
              return {
                sede: s.nome.length > 12 ? s.nome.slice(0, 12) + '…' : s.nome,
                fullName: s.nome,
                current: Number(k[chartMetric]) || 0,
                compare: compareMode !== 'none' && prevKey ? (Number(k[prevKey]) || 0) : null,
              }
            })
            const COLORS = ['#6E0E1A', '#D97706', '#16A34A', '#0369A1', '#7E22CE', '#BE185D']
            const COMPARE_COLOR = '#94A3B8'
            return (
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: isMobile ? 14 : 20, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: SOFT }}>
                    📊 Visualizzazione interattiva
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {METRICS.map(m => (
                      <button key={m.id} onClick={() => setChartMetric(m.id)}
                        style={{ padding: '5px 10px', borderRadius: 999, border: `1px solid ${chartMetric === m.id ? RED : BORDER}`, background: chartMetric === m.id ? RED : 'transparent', color: chartMetric === m.id ? '#FFF' : MID, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        {m.lbl}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                  {/* Switcher tipo grafico */}
                  <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 999, padding: 3 }}>
                    {[
                      { id: 'bar',  lbl: 'Barre' },
                      { id: 'line', lbl: 'Linea' },
                      { id: 'pie',  lbl: 'Torta' },
                    ].map(t => (
                      <button key={t.id} onClick={() => setChartType(t.id)}
                        style={{ padding: '5px 12px', borderRadius: 999, border: 'none', background: chartType === t.id ? TXT : 'transparent', color: chartType === t.id ? '#FFF' : MID, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        {t.lbl}
                      </button>
                    ))}
                  </div>
                  {/* Compare temporale */}
                  {prevKey && (
                    <PeriodCompareSelector mode={compareMode} onChange={setCompareMode} compact />
                  )}
                </div>

                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer>
                    {chartType === 'bar' && (
                      <BarChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9"/>
                        <XAxis dataKey="sede" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={v => metricDef.fmt(v)} />
                        <Legend />
                        <Bar dataKey="current" name={`${metricDef.lbl} (attuale)`} fill={RED} radius={[6, 6, 0, 0]} />
                        {compareMode !== 'none' && prevKey && <Bar dataKey="compare" name={metricDef.lbl + ' (confronto)'} fill={COMPARE_COLOR} radius={[6, 6, 0, 0]} />}
                      </BarChart>
                    )}
                    {chartType === 'line' && (
                      <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9"/>
                        <XAxis dataKey="sede" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={v => metricDef.fmt(v)} />
                        <Legend />
                        <Line type="monotone" dataKey="current" name={`${metricDef.lbl} (attuale)`} stroke={RED} strokeWidth={2.5} dot={{ r: 4 }} />
                        {compareMode !== 'none' && prevKey && <Line type="monotone" dataKey="compare" name={metricDef.lbl + ' (confronto)'} stroke={COMPARE_COLOR} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} />}
                      </LineChart>
                    )}
                    {chartType === 'pie' && (
                      <PieChart>
                        <Tooltip formatter={v => metricDef.fmt(v)} />
                        <Legend />
                        <Pie data={data} dataKey="current" nameKey="sede" outerRadius={isMobile ? 80 : 110} label={d => d.sede}>
                          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                      </PieChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            )
          })()}

          {/* RANKING ricavi */}
          {ranking.length >= 2 && (
            <div style={{ background: 'linear-gradient(180deg, #FFFEF0 0%, #FFF 80%)', border: `1px solid ${BORDER}`, borderRadius: 12, padding: isMobile ? 14 : 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: SOFT, marginBottom: 10 }}>
                🏆 Classifica ricavi {periodoLabel}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ranking.map((r, i) => {
                  const medaglie = ['🥇', '🥈', '🥉']
                  const medal = medaglie[i] || `#${i + 1}`
                  const kk = kpiMap[r.sede.id] || {}
                  const delta = fmtDelta(kk.ricaviPrev, kk.ricaviCur)
                  return (
                    <div key={r.sede.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: i === 0 ? '#FEF9C3' : '#fff', borderRadius: 8, border: `1px solid ${i === 0 ? '#FDE68A' : BORDER}` }}>
                      <div style={{ fontSize: 22, width: 36, textAlign: 'center' }}>{medal}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: TXT, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Icon name="pin" size={13} />{r.sede.nome}
                        </div>
                        {r.sede.citta && <div style={{ fontSize: 11, color: SOFT }}>{r.sede.citta}</div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 16, fontWeight: 900, color: TXT, ...tnum }}>{fmt0(r.ricavi)}</div>
                        {delta && (
                          <div style={{ fontSize: 11, fontWeight: 700, color: delta.positive ? GRN : RED, ...tnum }}>
                            {delta.sign}{fmt0(delta.delta)}{delta.pct != null ? ` (${delta.sign}${delta.pct.toFixed(0)}%)` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ALERTS */}
          {alerts.length > 0 && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: isMobile ? 14 : 18, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: SOFT, marginBottom: 10 }}>
                ⚠️ Alerts da gestire ({alerts.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {alerts.map((a, i) => {
                  const bg = a.lvl === 'red' ? RED_BG : AMB_BG
                  const col = a.lvl === 'red' ? RED : AMB
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: bg, borderRadius: 8 }}>
                      <Icon name={a.icon} size={15} color={col} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: TXT }}>{a.sede.nome}</div>
                        <div style={{ fontSize: 11.5, color: MID }}>{a.msg}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TABELLA KPI COMPLETA */}
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
              {sediAttive.map(s => {
                const k = kpiMap[s.id] || {}
                return (
                  <div key={s.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: TXT, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="pin" size={14} />{s.nome}</div>
                    {s.citta && <div style={{ fontSize: 11, color: SOFT, marginBottom: 12 }}>{s.citta}</div>}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {RIGHE_KPI.map(r => {
                        const cs = cellStyle(s.id, r.bw)
                        const bg = cs.background || '#FAFAFA'
                        const col = cs.color || TXT
                        return (
                          <div key={r.key} style={{ background: bg, borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, color: SOFT, marginBottom: 4, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name={r.icon} size={12} />{r.label}</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: col, ...tnum }}>{r.fmt(k[r.key])}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: CARD, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    <th style={{ ...headerStyle, textAlign: 'left', width: 220 }}>KPI</th>
                    {sediAttive.map(s => (
                      <th key={s.id} style={headerStyle}>
                        {s.nome}
                        {s.citta && <div style={{ fontSize: 10, color: SOFT, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>{s.citta}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RIGHE_KPI.map(r => (
                    <tr key={r.key}>
                      <td style={tdL}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name={r.icon} size={14} />{r.label}</span></td>
                      {sediAttive.map(s => {
                        const k = kpiMap[s.id] || {}
                        const delta = r.prevKey ? fmtDelta(k[r.prevKey], k[r.key], r.fmt) : null
                        return (
                          <td key={s.id} style={{ ...tdC, ...cellStyle(s.id, r.bw) }}>
                            <div>{r.fmt(k[r.key])}</div>
                            {delta && (
                              <div style={{ fontSize: 10, color: delta.positive ? GRN : RED, fontWeight: 700, marginTop: 2 }}>
                                {delta.sign}{r.fmt(delta.delta)}{delta.pct != null ? ` (${delta.sign}${delta.pct.toFixed(0)}%)` : ''}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
