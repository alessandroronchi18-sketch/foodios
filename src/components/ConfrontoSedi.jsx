import React, { useState, useEffect, useMemo } from 'react'
import Icon from './Icon'
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
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: SOFT }}>Caricamento dati sedi…</div>
      ) : (
        <>
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
