// Menu Engineering (Kasavana-Smith)
//
// Matrice 2x2: popolarità (asse X) × margine (asse Y).
//   STARS    (alto/alto)   — proteggi, evidenzia in vetrina
//   PLOWHORSE (alto/basso) — popolare ma poco redditizio → alza prezzo o riduci costo
//   PUZZLE   (basso/alto)  — alto margine ma non vende → marketing, promo, riposiziona
//   DOG      (basso/basso) — basso margine, basso volume → considera sostituire
//
// Calcolo:
//   popolarità = (qta venduta nel periodo) / (media qta venduta del menu)
//   margine = prezzo - food_cost  (assoluto € per pezzo)
//
// Soglia: la media è il "centro" della matrice. Le ricette con > media sono "alto".

import React, { useEffect, useMemo, useState } from 'react'
import { sload } from '../lib/storage'
import { color as T } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import { buildIngCosti, calcolaFC, getR } from '../lib/foodcost'
import Icon from '../components/Icon'
import AiExplainButton from '../components/AiExplainButton'
import ExportPdfButton from '../components/ExportPdfButton'

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'
const GREEN = T.green || '#16A34A'
const AMBER = T.amber || '#D97706'

const QUAD_LABEL = {
  STAR:    { lbl: '⭐ Star',       short: 'Star',      bg: '#F0FDF4', fg: GREEN,  desc: 'Tieni stretti: alti volumi + alti margini' },
  PLOWHORSE:{ lbl: '🐎 Plowhorse', short: 'Plowhorse', bg: '#FEF3C7', fg: AMBER,  desc: 'Popolare ma poco redditizio: alza prezzo o riduci food cost' },
  PUZZLE:  { lbl: '🧩 Puzzle',    short: 'Puzzle',   bg: '#E0F2FE', fg: '#0369A1', desc: 'Alto margine ma vende poco: marketing/promo/riposiziona' },
  DOG:     { lbl: '🐕 Dog',       short: 'Dog',      bg: '#FEF2F2', fg: BRAND,  desc: 'Basso margine + basso volume: considera sostituirlo' },
}

function classifica(popolarita, margine, mediaPop, mediaMarg) {
  const pop = popolarita >= mediaPop
  const mar = margine >= mediaMarg
  if (pop && mar) return 'STAR'
  if (pop && !mar) return 'PLOWHORSE'
  if (!pop && mar) return 'PUZZLE'
  return 'DOG'
}

export default function MenuEngineeringView({ orgId, sedeId, ricettario, sedeAttiva }) {
  const isMobile = useIsMobile()
  const [chiusure, setChiusure] = useState([])
  const [periodo, setPeriodo] = useState(30)  // ultimi 30 giorni
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId || !sedeId) { setLoading(false); return }
    let alive = true
    async function load() {
      setLoading(true)
      const data = await sload('pasticceria-chiusure-v1', orgId, sedeId)
      if (alive) {
        setChiusure(Array.isArray(data) ? data : [])
        setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [orgId, sedeId])

  // Aggregazione vendite ultimi N giorni
  const venditeAggregate = useMemo(() => {
    const oggi = new Date(); oggi.setHours(23, 59, 59, 999)
    const inizio = new Date(oggi.getTime() - periodo * 86400000)
    const map = {}
    for (const c of chiusure) {
      const d = new Date(c.data || 0)
      if (d < inizio || d > oggi) continue
      const items = Array.isArray(c.prodotti) ? c.prodotti : Array.isArray(c.righe) ? c.righe : []
      for (const r of items) {
        const nome = (r.nome || r.prodotto || '').toUpperCase().trim()
        if (!nome) continue
        const q = Number(r.venduto || r.qta || r.pezzi || 0)
        const ric = Number(r.ricavo || r.totale || (q * Number(r.prezzo || 0)))
        if (!map[nome]) map[nome] = { nome, qta: 0, ricavo: 0 }
        map[nome].qta += q
        map[nome].ricavo += ric
      }
    }
    return map
  }, [chiusure, periodo])

  // Calcolo FC per ricetta + classificazione
  const items = useMemo(() => {
    const ricetteArr = Array.isArray(ricettario) ? ricettario : []
    if (ricetteArr.length === 0) return []
    const ingCosti = buildIngCosti(ricetteArr)
    const arr = ricetteArr.map(r => {
      const fc = calcolaFC(r, ingCosti, ricetteArr) || {}
      const fcPerPezzo = Number(fc.fcPerPezzo) || Number(fc.fc) || 0
      const prezzo = Number(getR(r, 'prezzo')) || 0
      const margine = prezzo - fcPerPezzo
      const nome = (r.nome || '').toUpperCase().trim()
      const ven = venditeAggregate[nome] || { qta: 0, ricavo: 0 }
      return {
        ricetta: r,
        nome,
        prezzo,
        fcPerPezzo,
        margine,
        marginePct: prezzo > 0 ? (margine / prezzo) * 100 : 0,
        qtaVenduta: ven.qta,
        ricavoTot: ven.ricavo,
        margineTot: ven.qta * margine,
      }
    }).filter(x => x.prezzo > 0)  // ricette senza prezzo non si possono classificare
    return arr
  }, [ricettario, venditeAggregate])

  const itemsValidi = useMemo(() => items.filter(x => x.qtaVenduta > 0), [items])

  const { mediaPop, mediaMarg, classified } = useMemo(() => {
    if (itemsValidi.length === 0) return { mediaPop: 0, mediaMarg: 0, classified: [] }
    const mP = itemsValidi.reduce((s, x) => s + x.qtaVenduta, 0) / itemsValidi.length
    const mM = itemsValidi.reduce((s, x) => s + x.margine, 0) / itemsValidi.length
    const cls = itemsValidi.map(x => ({ ...x, quad: classifica(x.qtaVenduta, x.margine, mP, mM) }))
    return { mediaPop: mP, mediaMarg: mM, classified: cls }
  }, [itemsValidi])

  const stats = useMemo(() => {
    const groups = { STAR: [], PLOWHORSE: [], PUZZLE: [], DOG: [] }
    for (const it of classified) groups[it.quad].push(it)
    Object.values(groups).forEach(g => g.sort((a, b) => b.margineTot - a.margineTot))
    return groups
  }, [classified])

  // Bubble chart SVG: coordinate normalizzate
  const chart = useMemo(() => {
    if (classified.length === 0) return null
    const W = isMobile ? 320 : 640
    const H = isMobile ? 320 : 420
    const PAD = 50
    const maxPop = Math.max(...classified.map(x => x.qtaVenduta), mediaPop * 2)
    const maxMar = Math.max(...classified.map(x => x.margine), mediaMarg * 2)
    const maxRev = Math.max(...classified.map(x => x.ricavoTot), 1)
    const points = classified.map(x => ({
      ...x,
      x: PAD + (x.qtaVenduta / maxPop) * (W - 2 * PAD),
      y: H - PAD - (x.margine / Math.max(maxMar, 0.01)) * (H - 2 * PAD),
      r: Math.max(5, Math.min(28, 5 + (x.ricavoTot / maxRev) * 25)),
    }))
    const xMid = PAD + (mediaPop / maxPop) * (W - 2 * PAD)
    const yMid = H - PAD - (mediaMarg / Math.max(maxMar, 0.01)) * (H - 2 * PAD)
    return { W, H, PAD, points, xMid, yMid }
  }, [classified, isMobile, mediaPop, mediaMarg])

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: BRAND, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          Analisi prodotti
        </div>
        <h1 style={{ margin: '6px 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 800, color: TXT, letterSpacing: '-0.02em' }}>
          Menu engineering
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: SOFT, lineHeight: 1.5 }}>
          Capisci quali prodotti tirano (Star), quali rubano margine (Plowhorse), quali ignori (Puzzle) o devi togliere (Dog).
        </p>
      </div>

      {/* Periodo selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: SOFT, fontWeight: 600, marginRight: 6 }}>Periodo:</span>
        {[7, 14, 30, 60, 90].map(p => (
          <button key={p} onClick={() => setPeriodo(p)}
            style={{
              padding: '5px 12px', borderRadius: 999, border: `1px solid ${BORDER}`,
              background: periodo === p ? TXT : 'transparent',
              color: periodo === p ? '#FFF' : MID,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>{p}gg</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: SOFT }}>Caricamento…</div>
      ) : classified.length === 0 ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 40, textAlign: 'center', color: SOFT }}>
          Nessun prodotto venduto negli ultimi {periodo} giorni. Registra le chiusure cassa per popolare l'analisi.
        </div>
      ) : (
        <>
          {/* Chart bubble + leggenda */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: isMobile ? 14 : 22, marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 13, color: MID, lineHeight: 1.5 }}>
                <strong>{classified.length}</strong> prodotti analizzati · media popolarità {mediaPop.toFixed(1)} pz · media margine €{mediaMarg.toFixed(2)}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <AiExplainButton
                label="Menu engineering"
                value={`${stats.STAR.length} Star, ${stats.PLOWHORSE.length} Plowhorse, ${stats.PUZZLE.length} Puzzle, ${stats.DOG.length} Dog`}
                context={{
                  periodo_giorni: periodo,
                  totale_prodotti: classified.length,
                  stars: stats.STAR.slice(0, 5).map(x => ({ nome: x.nome, qta: x.qtaVenduta, margine_pezzo: x.margine.toFixed(2), margine_totale: x.margineTot.toFixed(0) })),
                  plowhorse: stats.PLOWHORSE.slice(0, 5).map(x => ({ nome: x.nome, qta: x.qtaVenduta, margine_pezzo: x.margine.toFixed(2) })),
                  puzzle: stats.PUZZLE.slice(0, 5).map(x => ({ nome: x.nome, qta: x.qtaVenduta, margine_pezzo: x.margine.toFixed(2) })),
                  dog: stats.DOG.slice(0, 5).map(x => ({ nome: x.nome, qta: x.qtaVenduta })),
                }}
              />
              <ExportPdfButton
                fileName={`menu-engineering-${periodo}gg.pdf`}
                compact
                getReport={() => ({
                  title: 'Menu engineering',
                  subtitle: sedeAttiva?.nome || '',
                  periodo: `Ultimi ${periodo} giorni`,
                  kpi: [
                    { label: '⭐ Stars', value: String(stats.STAR.length), sub: 'da proteggere' },
                    { label: '🐎 Plowhorses', value: String(stats.PLOWHORSE.length), sub: 'rialza prezzo' },
                    { label: '🧩 Puzzles', value: String(stats.PUZZLE.length), sub: 'promo/marketing' },
                    { label: '🐕 Dogs', value: String(stats.DOG.length), sub: 'sostituire' },
                  ],
                  sections: [
                    { title: '⭐ Stars (proteggi)',     table: { columns: ['Prodotto', 'Qta vendute', 'Margine/pz'], alignments: ['left','right','right'], rows: stats.STAR.slice(0, 10).map(x => [x.nome, x.qtaVenduta, '€' + x.margine.toFixed(2)]) } },
                    { title: '🐎 Plowhorses (rialza)',  table: { columns: ['Prodotto', 'Qta', 'Margine/pz'], alignments: ['left','right','right'], rows: stats.PLOWHORSE.slice(0, 10).map(x => [x.nome, x.qtaVenduta, '€' + x.margine.toFixed(2)]) } },
                    { title: '🧩 Puzzles (promo)',      table: { columns: ['Prodotto', 'Qta', 'Margine/pz'], alignments: ['left','right','right'], rows: stats.PUZZLE.slice(0, 10).map(x => [x.nome, x.qtaVenduta, '€' + x.margine.toFixed(2)]) } },
                    { title: '🐕 Dogs (sostituire)',    table: { columns: ['Prodotto', 'Qta', 'Margine/pz'], alignments: ['left','right','right'], rows: stats.DOG.slice(0, 10).map(x => [x.nome, x.qtaVenduta, '€' + x.margine.toFixed(2)]) } },
                  ],
                })}
              />
              </div>
            </div>

            {chart && (
              <div style={{ display: 'flex', justifyContent: 'center', overflow: 'auto' }}>
                <svg width={chart.W} height={chart.H} viewBox={`0 0 ${chart.W} ${chart.H}`}>
                  {/* Quadranti background */}
                  <rect x={chart.PAD} y={chart.PAD} width={chart.xMid - chart.PAD} height={chart.yMid - chart.PAD} fill="#E0F2FE" opacity="0.4" />
                  <rect x={chart.xMid} y={chart.PAD} width={chart.W - chart.PAD - chart.xMid} height={chart.yMid - chart.PAD} fill="#F0FDF4" opacity="0.4" />
                  <rect x={chart.PAD} y={chart.yMid} width={chart.xMid - chart.PAD} height={chart.H - chart.PAD - chart.yMid} fill="#FEF2F2" opacity="0.4" />
                  <rect x={chart.xMid} y={chart.yMid} width={chart.W - chart.PAD - chart.xMid} height={chart.H - chart.PAD - chart.yMid} fill="#FEF3C7" opacity="0.4" />

                  {/* Label quadranti */}
                  <text x={chart.PAD + 8} y={chart.PAD + 16} fontSize="10" fontWeight="700" fill="#0369A1">🧩 PUZZLE</text>
                  <text x={chart.W - chart.PAD - 50} y={chart.PAD + 16} fontSize="10" fontWeight="700" fill={GREEN}>⭐ STAR</text>
                  <text x={chart.PAD + 8} y={chart.H - chart.PAD - 8} fontSize="10" fontWeight="700" fill={BRAND}>🐕 DOG</text>
                  <text x={chart.W - chart.PAD - 70} y={chart.H - chart.PAD - 8} fontSize="10" fontWeight="700" fill={AMBER}>🐎 PLOWHORSE</text>

                  {/* Linee assi */}
                  <line x1={chart.PAD} y1={chart.yMid} x2={chart.W - chart.PAD} y2={chart.yMid} stroke="#CBD5E1" strokeDasharray="4,4" />
                  <line x1={chart.xMid} y1={chart.PAD} x2={chart.xMid} y2={chart.H - chart.PAD} stroke="#CBD5E1" strokeDasharray="4,4" />
                  <line x1={chart.PAD} y1={chart.H - chart.PAD} x2={chart.W - chart.PAD} y2={chart.H - chart.PAD} stroke="#94A3B8" />
                  <line x1={chart.PAD} y1={chart.PAD} x2={chart.PAD} y2={chart.H - chart.PAD} stroke="#94A3B8" />

                  {/* Etichette assi */}
                  <text x={chart.W / 2} y={chart.H - 12} fontSize="10" fill={SOFT} textAnchor="middle">Popolarità (pz venduti) →</text>
                  <text x={14} y={chart.H / 2} fontSize="10" fill={SOFT} textAnchor="middle" transform={`rotate(-90 14 ${chart.H / 2})`}>← Margine €/pz</text>

                  {/* Bubble */}
                  {chart.points.map((p, i) => {
                    const q = QUAD_LABEL[p.quad]
                    return (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r={p.r} fill={q.fg} fillOpacity="0.6" stroke={q.fg} strokeWidth="1.5" />
                        {p.r > 12 && (
                          <text x={p.x} y={p.y + 3} fontSize="9" fill="#FFF" fontWeight="800" textAnchor="middle">
                            {p.nome.slice(0, 8)}
                          </text>
                        )}
                      </g>
                    )
                  })}
                </svg>
              </div>
            )}
          </div>

          {/* 4 quadranti elencati */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 14 }}>
            {['STAR', 'PLOWHORSE', 'PUZZLE', 'DOG'].map(q => {
              const meta = QUAD_LABEL[q]
              const list = stats[q]
              return (
                <div key={q} style={{ background: CARD, border: `1px solid ${meta.fg}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ background: meta.bg, padding: '10px 14px', borderBottom: `1px solid ${meta.fg}` }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: meta.fg }}>{meta.lbl} <span style={{ fontWeight: 500, color: MID }}>· {list.length}</span></div>
                    <div style={{ fontSize: 11, color: MID, marginTop: 2 }}>{meta.desc}</div>
                  </div>
                  <div style={{ padding: 10, maxHeight: 240, overflowY: 'auto' }}>
                    {list.length === 0 ? (
                      <div style={{ fontSize: 12, color: SOFT, textAlign: 'center', padding: 18 }}>Nessun prodotto.</div>
                    ) : list.slice(0, 10).map(x => (
                      <div key={x.nome} style={{ padding: '8px 6px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                        <span style={{ color: TXT, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{x.nome}</span>
                        <span style={{ color: SOFT, fontSize: 11, ...{ fontVariantNumeric: 'tabular-nums' } }}>
                          {x.qtaVenduta}pz · €{x.margine.toFixed(2)}/pz
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
