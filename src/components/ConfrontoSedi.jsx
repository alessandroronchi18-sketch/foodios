import React, { useState, useEffect } from 'react'
import { sload } from '../lib/storage'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'

const TXT = T.text
const SOFT = T.textSoft
const MID = T.textMid
const GRN = T.green
const RED = T.brand
const GRN_BG = T.greenLight
const RED_BG = T.brandLight
const CARD = T.bgCard
const BORDER = T.border
const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" };

function fmt(n) {
  if (n == null) return '—'
  return '€' + Number(n).toFixed(2)
}
function fmtInt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('it-IT', { maximumFractionDigits: 0 })
}

function getStartOfWeek() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

export default function ConfrontoSedi({ orgId, sedi }) {
  const isMobile = useIsMobile()
  const [kpiMap, setKpiMap] = useState({})
  const [loading, setLoading] = useState(true)

  const sediAttive = (sedi || []).filter(s => s.attiva !== false)

  useEffect(() => {
    if (!orgId || sediAttive.length < 2) { setLoading(false); return }
    let cancelled = false

    async function loadAll() {
      const today = new Date().toISOString().split('T')[0]
      const startOfWeek = getStartOfWeek()
      const results = {}

      // Carico in una sola query: stock PF + trasferimenti pendenti per tutte le sedi.
      const [stockAll, trasfPending, fattureAll] = await Promise.all([
        supabase.from('stock_prodotti_finiti')
          .select('sede_id, quantita, prodotto_nome')
          .eq('organization_id', orgId),
        supabase.from('trasferimenti')
          .select('sede_a, sede_da, stato')
          .eq('organization_id', orgId)
          .eq('stato', 'inviato'),
        supabase.from('fatture')
          .select('id, sede_id, stato')
          .eq('organization_id', orgId),
      ])

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
      // Fatture da pagare per sede.
      const fattureBySede = {}
      for (const f of (fattureAll.data || [])) {
        if (f.stato !== 'pagata') {
          fattureBySede[f.sede_id] = (fattureBySede[f.sede_id] || 0) + 1
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
          const ricaviSettimana = chiusureArr
            .filter(c => {
              const d = new Date(c.data || '')
              d.setHours(0, 0, 0, 0)
              return d >= startOfWeek
            })
            .reduce((s, c) => s + (c.kpi?.totV || 0), 0)

          const giorArr = Array.isArray(giornaliero) ? giornaliero : []
          let fcSum = 0, fcCount = 0
          giorArr.forEach(sess => {
            if (sess.ricavoTot > 0) {
              fcSum += (sess.fcTot / sess.ricavoTot) * 100
              fcCount++
            }
          })
          const foodCostPct = fcCount > 0 ? fcSum / fcCount : null

          const prodOggi = giorArr
            .filter(sess => (sess.data || '').startsWith(today))
            .reduce((s, sess) => s + (sess.prodotti || []).reduce((ps, p) => ps + (p.stampi || 0), 0), 0)

          results[sede.id] = {
            ricaviSettimana,
            foodCostPct,
            prodOggi,
            fattureDaPagare: fattureBySede[sede.id] || 0,
            stockPF: stockBySede[sede.id] || 0,
            stockProdsCount: (stockProdsBySede[sede.id]?.size) || 0,
            trasfInArrivo: pendingBySede[sede.id] || 0,
          }
        } catch {
          results[sede.id] = {
            ricaviSettimana: null, foodCostPct: null, prodOggi: null,
            fattureDaPagare: null, stockPF: null, stockProdsCount: null, trasfInArrivo: null,
          }
        }
      }))

      if (!cancelled) {
        setKpiMap(results)
        setLoading(false)
      }
    }

    loadAll()
    return () => { cancelled = true }
  }, [orgId, sediAttive.length])

  if (sediAttive.length < 2) return (
    <div style={{ maxWidth: 640, margin: '60px auto', textAlign: 'center', padding: 20 }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
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

  const bwRicavi = getBestWorst('ricaviSettimana')
  const bwFC = getBestWorst('foodCostPct', true)
  const bwProd = getBestWorst('prodOggi')
  const bwFatture = getBestWorst('fattureDaPagare', true)
  const bwStock = getBestWorst('stockPF')
  const bwArrivo = getBestWorst('trasfInArrivo', true) // meno trasf pendenti = meglio

  function cellStyle(sedeId, bw) {
    if (!bw.best) return {}
    if (sedeId === bw.best) return { background: GRN_BG, color: GRN, fontWeight: 800 }
    if (sedeId === bw.worst) return { background: RED_BG, color: RED, fontWeight: 800 }
    return {}
  }

  // ── Render desktop: tabella affiancata ──────────────────────────────────
  // ── Render mobile: cards verticali, una per sede ────────────────────────

  const RIGHE_KPI = [
    { key: 'ricaviSettimana',  label: '💰 Ricavi settimana',  fmt: fmt,    bw: bwRicavi },
    { key: 'foodCostPct',      label: '🧾 Food cost medio',   fmt: v => v != null ? v.toFixed(1) + '%' : '—', bw: bwFC },
    { key: 'prodOggi',         label: '🏭 Prodotti oggi',     fmt: v => v ?? 0, bw: bwProd },
    { key: 'stockPF',          label: '📦 Stock vetrina',     fmt: v => v != null ? `${fmtInt(v)} pz` : '—', bw: bwStock },
    { key: 'trasfInArrivo',    label: '🚚 Trasf. in arrivo',  fmt: v => v ?? 0, bw: bwArrivo },
    { key: 'fattureDaPagare',  label: '📄 Fatture da pagare', fmt: v => v ?? 0, bw: bwFatture },
  ]

  const headerStyle = { padding: isMobile ? '8px 10px' : '12px 16px', fontSize: 11, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${BORDER}`, textAlign: 'center' }
  const tdL = { padding: isMobile ? '10px 10px' : '12px 16px', fontSize: 13, color: MID, borderTop: `1px solid ${BORDER}` }
  const tdC = { padding: isMobile ? '10px 10px' : '12px 16px', fontSize: 13, textAlign: 'center', borderTop: `1px solid ${BORDER}`, ...tnum }

  return (
    <div style={{ maxWidth: 1080, padding: isMobile ? 12 : 0 }}>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED, marginBottom: 6 }}>Analisi</div>
        <p style={{ margin: 0, fontSize: 12, color: SOFT, lineHeight: 1.5 }}>
          <span style={{ color: GRN, fontWeight: 700 }}>Verde</span> = migliore &nbsp;·&nbsp;
          <span style={{ color: RED, fontWeight: 700 }}>Rosso</span> = peggiore
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: SOFT }}>Caricamento dati sedi…</div>
      ) : isMobile ? (
        // ─── MOBILE: una card per sede ────────────────────────────────────
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 22 }}>
          {sediAttive.map(s => {
            const k = kpiMap[s.id] || {}
            return (
              <div key={s.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: TXT, marginBottom: 4 }}>📍 {s.nome}</div>
                {s.citta && <div style={{ fontSize: 11, color: SOFT, marginBottom: 12 }}>{s.citta}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {RIGHE_KPI.map(r => {
                    const cs = cellStyle(s.id, r.bw)
                    const bg = cs.background || '#FAFAFA'
                    const col = cs.color || TXT
                    return (
                      <div key={r.key} style={{ background: bg, borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ fontSize: 10, color: SOFT, marginBottom: 4, fontWeight: 600 }}>{r.label}</div>
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
        // ─── DESKTOP: tabella ──────────────────────────────────────────────
        <div style={{ overflowX: 'auto', marginTop: 28 }}>
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
                  <td style={tdL}>{r.label}</td>
                  {sediAttive.map(s => (
                    <td key={s.id} style={{ ...tdC, ...cellStyle(s.id, r.bw) }}>
                      {r.fmt(kpiMap[s.id]?.[r.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
