import React, { useState, useEffect } from 'react'
import { sload } from '../lib/storage'
import { supabase } from '../lib/supabase'

const TXT = '#1C0A0A'
const SOFT = '#9C7B76'
const MID = '#4A3728'
const GRN = '#16A34A'
const RED = '#C0392B'
const GRN_BG = '#F0FDF4'
const RED_BG = '#FFF5F5'

function fmt(n) {
  if (n == null) return '—'
  return '€' + n.toFixed(2)
}

function getStartOfWeek() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

export default function ConfrontoSedi({ orgId, sedi }) {
  const [kpiMap, setKpiMap] = useState({})
  const [loading, setLoading] = useState(true)

  const sediAttive = (sedi || []).filter(s => s.attiva !== false)

  useEffect(() => {
    if (!orgId || sediAttive.length < 2) { setLoading(false); return }

    async function loadAll() {
      const today = new Date().toISOString().split('T')[0]
      const startOfWeek = getStartOfWeek()
      const results = {}

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

          const { data: fatture } = await supabase
            .from('fatture')
            .select('id, stato')
            .eq('organization_id', orgId)
            .eq('sede_id', sede.id)

          const fattureDaPagare = (fatture || []).filter(f => f.stato !== 'pagata').length

          results[sede.id] = { ricaviSettimana, foodCostPct, prodOggi, fattureDaPagare }
        } catch {
          results[sede.id] = { ricaviSettimana: null, foodCostPct: null, prodOggi: null, fattureDaPagare: null }
        }
      }))

      setKpiMap(results)
      setLoading(false)
    }

    loadAll()
  }, [orgId, sedi?.length])

  if (sediAttive.length < 2) return (
    <div style={{ maxWidth: 640, padding: '60px 0', textAlign: 'center', color: SOFT, fontSize: 13 }}>
      Il confronto sedi è disponibile quando hai almeno 2 sedi attive.
    </div>
  )

  function getBestWorst(key, lowerIsBetter = false) {
    const vals = sediAttive
      .map(s => ({ id: s.id, v: kpiMap[s.id]?.[key] }))
      .filter(x => x.v != null && x.v !== 0 || key === 'prodOggi')
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

  function tdStyle(sedeId, bw) {
    if (!bw.best) return {}
    if (sedeId === bw.best) return { background: GRN_BG, color: GRN, fontWeight: 800 }
    if (sedeId === bw.worst) return { background: RED_BG, color: RED, fontWeight: 800 }
    return {}
  }

  const th = { padding: '12px 16px', fontSize: 11, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #F1F5F9', textAlign: 'center' }
  const tdL = { padding: '12px 16px', fontSize: 13, color: MID, borderTop: '1px solid #F1F5F9' }
  const tdC = { padding: '12px 16px', fontSize: 13, textAlign: 'center', borderTop: '1px solid #F1F5F9' }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C0392B', marginBottom: 6 }}>Analisi</div>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 900, color: TXT, letterSpacing: '-0.03em' }}>Confronto Sedi</h1>
        <p style={{ margin: 0, fontSize: 12, color: SOFT }}>
          Verde = performance migliore &nbsp;·&nbsp; Rosso = performance peggiore
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: SOFT }}>Caricamento dati sedi…</div>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: 28 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#FFF', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={{ ...th, textAlign: 'left', width: 200 }}>KPI</th>
                {sediAttive.map(s => (
                  <th key={s.id} style={th}>
                    {s.nome}
                    {s.citta && <div style={{ fontSize: 10, color: SOFT, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>{s.citta}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdL}>💰 Ricavi settimana</td>
                {sediAttive.map(s => (
                  <td key={s.id} style={{ ...tdC, ...tdStyle(s.id, bwRicavi) }}>
                    {fmt(kpiMap[s.id]?.ricaviSettimana)}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={tdL}>🧾 Food cost medio</td>
                {sediAttive.map(s => (
                  <td key={s.id} style={{ ...tdC, ...tdStyle(s.id, bwFC) }}>
                    {kpiMap[s.id]?.foodCostPct != null ? kpiMap[s.id].foodCostPct.toFixed(1) + '%' : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={tdL}>🏭 Prodotti oggi</td>
                {sediAttive.map(s => (
                  <td key={s.id} style={{ ...tdC, ...tdStyle(s.id, bwProd) }}>
                    {kpiMap[s.id]?.prodOggi ?? 0}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={tdL}>📄 Fatture da pagare</td>
                {sediAttive.map(s => (
                  <td key={s.id} style={{ ...tdC, ...tdStyle(s.id, bwFatture) }}>
                    {kpiMap[s.id]?.fattureDaPagare ?? 0}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
