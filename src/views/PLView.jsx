// PLView — Profit & Loss completo (estratto da Dashboard.jsx).
// Include 5 sub-componenti specifici: BarreRicavo, TopIngredientiTable,
// ScenarioPrezzi, PLTable, SensTable.
//
// Primitive condivise (Tip, margBadge, margColor, TD, TH, SortTH, useSortable,
// Badge, C palette) vengono da ./_shared.

import React, { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import {
  buildIngCosti, calcolaFC, getR, isRicettaValida, normIng,
} from '../lib/foodcost'
import { exportPLCompleto } from '../lib/exportPDF'
import { gateExport, getExportCtx } from '../lib/exportGuard'
import {
  C, TNUM, margColor, margBadge, Badge, Tip, PageHeader, TD, TH,
  useSortable, SortTH,
} from './_shared'

// ─── BARRE RICAVO (stacked margine vs food cost) ─────────────────────────────
function BarreRicavo({ rows, euro, pct }) {
  const [tooltip, setTooltip] = useState(null)

  const SH2 = () => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, marginTop: 8 }}>
      <div style={{ width: 3, height: 18, background: C.red, borderRadius: 2, flexShrink: 0, alignSelf: 'center' }}/>
      <div>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.text }}>Dove va ogni euro di ricavo — per stampo</h2>
        <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>
          Verde = margine lordo che resta in cassa &nbsp;·&nbsp; Rosso = costo ingredienti &nbsp;·&nbsp; Passa il mouse sulla barra per il dettaglio
        </div>
      </div>
    </div>
  )

  return (
    <>
      <SH2/>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '24px', marginBottom: 28,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)', position: 'relative' }}
        onMouseLeave={() => setTooltip(null)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {rows.map((r, i) => {
            const mc = margColor(r.margPct)
            const margW = Math.max(0, r.margPct)
            const fcW = Math.max(0, r.fcPct)
            const handleMouseOver = (e, segment) => {
              const rect = e.currentTarget.closest('[data-barre-root]').getBoundingClientRect()
              const barRect = e.currentTarget.parentElement.getBoundingClientRect()
              setTooltip({ nome: r.nome, segment, r,
                x: e.clientX - rect.left,
                y: barRect.top - rect.top - 8 })
            }
            return (
              <div key={r.nome} data-barre-root="">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 7,
                      background: i === 0 ? C.red : i === 1 ? '#E07040' : i === 2 ? C.amber : '#F0EAE6',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 900, color: i < 3 ? C.white : C.textMid, flexShrink: 0 }}>{i + 1}</div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{r.nome}</span>
                    <Tip text={`Valutazione margine: ${pct(r.margPct)}.`} width={260}><span style={{ cursor: 'help' }}>{margBadge(r.margPct)}</span></Tip>
                  </div>
                  <div style={{ display: 'flex', gap: 24, textAlign: 'right' }}>
                    {[
                      { lbl: 'Ricavo', val: euro(r.ricavo), c: C.text, tip: `Ricavo per stampo = ${r.reg.unita} × ${euro(r.reg.prezzo)}.` },
                      { lbl: 'Ingredienti', val: `−${euro(r.fc)}`, c: C.red, tip: `Food cost totale. FC ratio: ${pct(r.fcPct)}.` },
                      { lbl: 'Margine', val: euro(r.margine), c: mc, tip: `Margine lordo. ${pct(r.margPct)} del ricavo.` },
                    ].map(({ lbl, val, c, tip }) => (
                      <Tip key={lbl} text={tip} width={250}>
                        <div style={{ cursor: 'help' }}>
                          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, borderBottom: '1px dashed rgba(155,120,115,0.35)' }}>{lbl}</div>
                          <div style={{ fontSize: 14, fontWeight: 900, color: c, ...TNUM }}>{val}</div>
                        </div>
                      </Tip>
                    ))}
                  </div>
                </div>
                <div style={{ height: 34, borderRadius: 8, overflow: 'hidden', display: 'flex', cursor: 'crosshair', position: 'relative' }} data-barre-root="">
                  <div style={{ width: `${margW}%`, height: '100%', background: mc, opacity: 0.86, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width 0.5s ease', position: 'relative' }}
                    onMouseMove={e => handleMouseOver(e, 'margine')}>
                    {margW > 10 && <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', pointerEvents: 'none' }}>{pct(margW)}</span>}
                  </div>
                  <div style={{ flex: 1, height: '100%', background: C.red, opacity: 0.82, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width 0.5s ease' }}
                    onMouseMove={e => handleMouseOver(e, 'foodcost')}>
                    {fcW > 10 && <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', pointerEvents: 'none' }}>{pct(fcW)}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', marginTop: 4, fontSize: 9, fontWeight: 600, color: C.textSoft }}>
                  <div style={{ width: `${margW}%`, textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>{margW > 18 ? 'margine lordo' : ''}</div>
                  <div style={{ flex: 1, textAlign: 'center' }}>{fcW > 18 ? 'costo ingredienti' : ''}</div>
                </div>
              </div>
            )
          })}
        </div>

        {tooltip && (
          <div style={{ position: 'absolute', left: Math.min(tooltip.x + 12, 560), top: tooltip.y,
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: '14px 18px', boxShadow: '0 6px 24px rgba(0,0,0,0.13)',
            zIndex: 100, minWidth: 260, pointerEvents: 'none' }}>
            <div style={{ fontWeight: 900, fontSize: 13, color: C.text, marginBottom: 10 }}>{tooltip.nome}</div>
            {tooltip.segment === 'margine' ? (
              <>
                <div style={{ fontSize: 11, color: C.green, fontWeight: 700, marginBottom: 6 }}>🟢 Margine lordo</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px', fontSize: 11 }}>
                  <span style={{ color: C.textMid }}>Ricavo stampo</span>
                  <span style={{ fontWeight: 800, color: C.text, ...TNUM, textAlign: 'right' }}>{euro(tooltip.r.ricavo)}</span>
                  <span style={{ color: C.textMid }}>Meno costo ingredienti</span>
                  <span style={{ fontWeight: 800, color: C.red, ...TNUM, textAlign: 'right' }}>−{euro(tooltip.r.fc)}</span>
                  <div style={{ gridColumn: '1/-1', borderTop: `1px solid ${C.border}`, margin: '4px 0' }}/>
                  <span style={{ color: C.green, fontWeight: 700 }}>= Margine lordo</span>
                  <span style={{ fontWeight: 900, color: C.green, ...TNUM, textAlign: 'right' }}>{euro(tooltip.r.margine)}</span>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 11, color: C.red, fontWeight: 700, marginBottom: 6 }}>🔴 Costo ingredienti</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px', fontSize: 11 }}>
                  <span style={{ color: C.textMid }}>Food cost totale</span>
                  <span style={{ fontWeight: 800, color: C.red, ...TNUM, textAlign: 'right' }}>{euro(tooltip.r.fc)}</span>
                  <span style={{ color: C.textMid }}>Su ricavo</span>
                  <span style={{ fontWeight: 800, color: C.text, ...TNUM, textAlign: 'right' }}>{euro(tooltip.r.ricavo)}</span>
                  <div style={{ gridColumn: '1/-1', borderTop: `1px solid ${C.border}`, margin: '4px 0' }}/>
                  <span style={{ color: C.textMid }}>FC ratio</span>
                  <span style={{ fontWeight: 900, color: C.red, textAlign: 'right' }}>{pct(tooltip.r.fcPct)}</span>
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 20, marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.border}`, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: C.green, opacity: 0.86 }}/>
            <span style={{ fontSize: 10, fontWeight: 600, color: C.textMid }}>Margine lordo</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: C.red, opacity: 0.82 }}/>
            <span style={{ fontSize: 10, fontWeight: 600, color: C.textMid }}>Costo ingredienti</span>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── TOP INGREDIENTI ─────────────────────────────────────────────────────────
function TopIngredientiTable({ ricettario, ingCosti, euro, pct }) {
  const { sort, sortKey, sortDir, toggleSort } = useSortable('costoTot')
  const [hovRic, setHovRic] = useState(null)

  const ingMap = {}
  for (const ric of Object.values(ricettario?.ricette || {})) {
    if (!isRicettaValida(ric.nome) || getR(ric.nome, ric).tipo === 'interno') continue
    for (const ing of (ric.ingredienti || [])) {
      const k = normIng(ing.nome)
      const c = ingCosti[k]
      const costoStampo = c ? ing.qty1stampo * c.costoG : 0
      if (!ingMap[k]) ingMap[k] = { nome: ing.nome, k, qty: 0, costoTot: 0, ricette: [], isStima: c?.isStima || false, costoG: c?.costoG || 0 }
      ingMap[k].qty += ing.qty1stampo
      ingMap[k].costoTot += costoStampo
      if (!ingMap[k].ricette.includes(ric.nome)) ingMap[k].ricette.push(ric.nome)
    }
  }
  const grandTotal = Object.values(ingMap).reduce((s, i) => s + i.costoTot, 0)
  const list = sort(Object.values(ingMap).filter(i => i.costoTot > 0).map(i => ({
    ...i, pctTot: grandTotal > 0 ? (i.costoTot / grandTotal * 100) : 0,
  })), (r, k) => (k === 'costoG' ? r.costoG : r[k] || 0))

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 3, height: 18, background: C.red, borderRadius: 2, flexShrink: 0, alignSelf: 'center' }}/>
        <div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.text }}>Ingredienti per Impatto sul Food Cost</h2>
          <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>Aggregato su tutti i prodotti — clicca le intestazioni per ordinare</div>
        </div>
      </div>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'visible', marginBottom: 28, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', position: 'relative' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#F8F4F2' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 8, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}` }}>Ingrediente</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 8, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}` }}>Usato in</th>
              <SortTH k="qty" right active={sortKey === 'qty'} dir={sortDir} onToggle={toggleSort}>Qty tot. (g)</SortTH>
              <SortTH k="costoTot" right active={sortKey === 'costoTot'} dir={sortDir} onToggle={toggleSort}>Costo/stampo</SortTH>
              <SortTH k="pctTot" right active={sortKey === 'pctTot'} dir={sortDir} onToggle={toggleSort}>% FC totale</SortTH>
              <SortTH k="costoG" right active={sortKey === 'costoG'} dir={sortDir} onToggle={toggleSort}>€ / g</SortTH>
            </tr>
          </thead>
          <tbody>
            {list.map((ing, i) => {
              const nRic = ing.ricette.length
              return (
                <tr key={ing.k} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: C.text }}>
                    {ing.nome}
                    {ing.isStima && <span style={{ fontSize: 7, marginLeft: 5, background: C.amberLight, color: C.amber, padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>stima</span>}
                  </td>
                  <td style={{ padding: '10px 14px', position: 'relative', overflow: 'visible' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      onMouseEnter={() => setHovRic({ key: ing.k })}
                      onMouseLeave={() => setHovRic(null)}>
                      {ing.ricette.slice(0, 5).map((_, di) => (
                        <div key={di} style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: ['#6E0E1A', '#E07040', '#B45309', '#5B8FCE', '#7B7B7B'][di % 5] }}/>
                      ))}
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.textMid }}>{nRic} {nRic === 1 ? 'ricetta' : 'ricette'}</span>
                    </div>
                    {hovRic?.key === ing.k && (
                      <div style={{ position: 'absolute', zIndex: 9999, top: '100%', left: 0,
                        background: C.white, border: `1px solid ${C.border}`, borderRadius: 9,
                        padding: '10px 14px', boxShadow: '0 6px 24px rgba(0,0,0,0.13)',
                        minWidth: 180, pointerEvents: 'none', marginTop: 4 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.textSoft, marginBottom: 6 }}>Usato in</div>
                        {ing.ricette.map((r, ri) => (
                          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: ['#6E0E1A', '#E07040', '#B45309', '#5B8FCE', '#7B7B7B'][ri % 5] }}/>
                            <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{r}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: C.textMid }}>{Math.round(ing.qty)}g</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: C.red, ...TNUM }}>{euro(ing.costoTot)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                      <div style={{ width: 60, height: 5, background: '#EEE', borderRadius: 3 }}>
                        <div style={{ width: `${Math.min(100, ing.pctTot * 3)}%`, height: 5, background: C.red, opacity: 0.7, borderRadius: 3 }}/>
                      </div>
                      <span style={{ fontWeight: 700, color: C.text, width: 36, textAlign: 'right' }}>{pct(ing.pctTot)}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, color: C.textSoft, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                    {ing.costoG > 0 ? `€ ${ing.costoG.toFixed(4)}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#F0EAE6', borderTop: `2px solid ${C.borderStr}` }}>
              <td colSpan={3} style={{ padding: '10px 14px', fontWeight: 900, fontSize: 11, color: C.text }}>TOTALE FOOD COST</td>
              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 900, fontSize: 13, color: C.red, ...TNUM }}>{euro(grandTotal)}</td>
              <td colSpan={2}/>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}

// ─── SCENARIO PREZZI ─────────────────────────────────────────────────────────
function ScenarioPrezzi({ rows, euro, pct }) {
  const isMobile = useIsMobile()
  const [prezzi, setPrezzi] = useState(() => Object.fromEntries(rows.map(r => [r.nome, r.reg.prezzo.toFixed(2)])))
  const setP = (nome, v) => setPrezzi(p => ({ ...p, [nome]: v }))

  const scenRows = rows.map(r => {
    const newPrezzo = Math.max(0, parseFloat(prezzi[r.nome]) || 0)
    const delta = r.reg.prezzo > 0 ? ((newPrezzo - r.reg.prezzo) / r.reg.prezzo * 100) : 0
    const newRicavo = parseFloat((r.reg.unita * newPrezzo).toFixed(2))
    const newMarg = parseFloat((newRicavo - r.fc).toFixed(2))
    const newMargPct = newRicavo > 0 ? (newMarg / newRicavo * 100) : 0
    return { ...r, newPrezzo, delta, newRicavo, newMarg, newMargPct,
      diffMarg: parseFloat((newMarg - r.margine).toFixed(2)),
      diffMargPct: parseFloat((newMargPct - r.margPct).toFixed(1)) }
  })
  const totRicavoBase = rows.reduce((s, r) => s + r.ricavo, 0)
  const totRicavoScen = scenRows.reduce((s, r) => s + r.newRicavo, 0)
  const totMargBase = rows.reduce((s, r) => s + r.margine, 0)
  const totMargScen = scenRows.reduce((s, r) => s + r.newMarg, 0)
  const hasChanges = scenRows.some(r => Math.abs(r.delta) > 0.01)
  const reset = () => setPrezzi(Object.fromEntries(rows.map(r => [r.nome, r.reg.prezzo.toFixed(2)])))

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 3, height: 18, background: C.red, borderRadius: 2, flexShrink: 0, alignSelf: 'center' }}/>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.text }}>Simulatore Scenari di Prezzo</h2>
          <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>Inserisci il nuovo prezzo — la variazione % e il nuovo margine si calcolano in tempo reale</div>
        </div>
        {hasChanges && (
          <button onClick={reset} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: 11, fontWeight: 700, color: C.textMid, cursor: 'pointer' }}>↺ Reset tutto</button>
        )}
      </div>

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '24px', marginBottom: 28, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        {hasChanges && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginBottom: 24, padding: '16px 20px', background: '#F8F4F2', borderRadius: 10, border: `1px solid ${C.border}` }}>
            {[
              { lbl: 'Ricavo base', val: euro(totRicavoBase), c: C.textMid },
              { lbl: 'Ricavo scenario', val: euro(totRicavoScen), c: totRicavoScen >= totRicavoBase ? C.green : C.red, sub: (totRicavoScen - totRicavoBase) !== 0 ? (totRicavoScen > totRicavoBase ? '+' : '') + euro(totRicavoScen - totRicavoBase) : null },
              { lbl: 'Margine base', val: euro(totMargBase), c: C.textMid },
              { lbl: 'Margine scenario', val: euro(totMargScen), c: totMargScen >= totMargBase ? C.green : C.red, sub: (totMargScen - totMargBase) !== 0 ? (totMargScen > totMargBase ? '+' : '') + euro(totMargScen - totMargBase) : null },
            ].map(({ lbl, val, c, sub }) => (
              <div key={lbl} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.textSoft, marginBottom: 4 }}>{lbl}</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: c, ...TNUM }}>{val}</div>
                {sub && <div style={{ fontSize: 11, fontWeight: 800, color: c, marginTop: 2 }}>{sub}</div>}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {scenRows.map(r => {
            const changed = Math.abs(r.delta) > 0.01
            const mc = margColor(r.newMargPct)
            const dSign = r.delta > 0 ? '+' : ''
            return (
              <div key={r.nome} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                padding: '14px 18px', borderRadius: 10,
                border: `1px solid ${changed ? C.borderStr : C.border}`,
                background: changed ? (r.delta > 0 ? '#F6FBF7' : '#FEF6F5') : C.white }}>
                <div style={{ width: 180, flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{r.nome}</div>
                  <div style={{ fontSize: 10, color: C.textSoft, marginTop: 2 }}>{r.reg.unita} {r.reg.tipo === 'fetta' ? 'fette' : 'pz'}/stampo</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.textSoft }}>Prezzo / {r.reg.tipo === 'fetta' ? 'fetta' : 'pezzo'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.textMid }}>€</span>
                    <input type="number" min="0" step="0.10" value={prezzi[r.nome]}
                      onChange={e => setP(r.nome, e.target.value)}
                      onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setP(r.nome, v.toFixed(2)) }}
                      style={{ width: 72, padding: '6px 8px', borderRadius: 7, textAlign: 'center',
                        border: `2px solid ${changed ? (r.delta > 0 ? C.green : C.red) : C.border}`,
                        fontSize: 14, fontWeight: 900, color: changed ? (r.delta > 0 ? C.green : C.red) : C.text,
                        ...TNUM, outline: 'none' }}/>
                  </div>
                  <div style={{ fontSize: 9, color: C.textSoft }}>base: {euro(r.reg.prezzo)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 72, padding: '6px 12px', borderRadius: 8,
                  background: !changed ? '#F0EAE6' : r.delta > 0 ? C.greenLight : C.redLight,
                  border: `1px solid ${!changed ? C.border : r.delta > 0 ? C.green : C.red}30` }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: !changed ? C.textSoft : r.delta > 0 ? C.green : C.red, marginBottom: 2 }}>Variazione</div>
                    <div style={{ fontSize: 15, fontWeight: 900, ...TNUM, color: !changed ? C.textSoft : r.delta > 0 ? C.green : C.red }}>
                      {!changed ? '—' : `${dSign}${r.delta.toFixed(1)}%`}
                    </div>
                  </div>
                </div>
                <div style={{ color: C.textSoft, fontSize: 16, flexShrink: 0 }}>→</div>
                <div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}>
                  <div style={{ background: '#F0EAE6', borderRadius: 8, padding: '8px 12px', textAlign: 'center', minWidth: 90 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 3 }}>Margine base</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.textMid, ...TNUM }}>{euro(r.margine)}</div>
                    <div style={{ fontSize: 9, color: C.textSoft, marginTop: 2 }}>{pct(r.margPct)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', color: C.textSoft, fontSize: 14, flexShrink: 0 }}>→</div>
                  <div style={{ background: changed ? (r.newMarg > r.margine ? '#EAF5EE' : '#FDECEA') : '#F8F4F2', borderRadius: 8, padding: '8px 12px', textAlign: 'center', minWidth: 90,
                    border: changed ? `1px solid ${r.newMarg > r.margine ? C.green : C.red}30` : 'none' }}>
                    <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 3 }}>Margine nuovo</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: changed ? mc : C.textMid, ...TNUM }}>{euro(r.newMarg)}</div>
                    <div style={{ fontSize: 9, color: changed ? mc : C.textSoft, marginTop: 2 }}>{pct(r.newMargPct)}</div>
                  </div>
                </div>
                <div style={{ padding: '8px 16px', borderRadius: 8, textAlign: 'center', flexShrink: 0, minWidth: 90,
                  background: !changed ? '#F0EAE6' : r.diffMarg > 0 ? C.greenLight : C.redLight,
                  border: `1px solid ${!changed ? C.border : r.diffMarg > 0 ? C.green : C.red}30` }}>
                  <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: !changed ? C.textSoft : r.diffMarg > 0 ? C.green : C.red, marginBottom: 3 }}>Δ margine</div>
                  <div style={{ fontSize: 18, fontWeight: 900, ...TNUM, color: !changed ? C.textSoft : r.diffMarg > 0 ? C.green : C.red }}>
                    {!changed ? '—' : (r.diffMarg > 0 ? '+' : '') + euro(r.diffMarg)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ─── PL TABLE (sortable) ─────────────────────────────────────────────────────
function PLTable({ rows, euro, pct, totRicavo, totFC, totMargine, fcAvg, avgMarg }) {
  const { sort, sortKey, sortDir, toggleSort } = useSortable('margPct')
  const sorted = sort(rows, (r, k) => {
    if (k === 'nome') return r.nome
    if (k === 'prezzo') return r.reg.prezzo
    if (k === 'unita') return r.reg.unita
    return r[k] || 0
  })
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 3, height: 18, background: C.red, borderRadius: 2, flexShrink: 0, alignSelf: 'center' }}/>
        <div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.text }}>Tabella Riepilogativa P&L</h2>
          <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>Clicca le intestazioni per ordinare ▼▲</div>
        </div>
      </div>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 28, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#F8F4F2' }}>
                <SortTH k="nome" active={sortKey === 'nome'} dir={sortDir} onToggle={toggleSort}>Prodotto</SortTH>
                <SortTH k="unita" right active={sortKey === 'unita'} dir={sortDir} onToggle={toggleSort}>Unità/st.</SortTH>
                <SortTH k="prezzo" right active={sortKey === 'prezzo'} dir={sortDir} onToggle={toggleSort}>Prezzo/un.</SortTH>
                <SortTH k="ricavo" right active={sortKey === 'ricavo'} dir={sortDir} onToggle={toggleSort}>Ricavo/st.</SortTH>
                <SortTH k="fc" right active={sortKey === 'fc'} dir={sortDir} onToggle={toggleSort}>FC/st.</SortTH>
                <SortTH k="fcPct" right active={sortKey === 'fcPct'} dir={sortDir} onToggle={toggleSort}>FC ratio</SortTH>
                <SortTH k="margine" right active={sortKey === 'margine'} dir={sortDir} onToggle={toggleSort}>Margine/st.</SortTH>
                <SortTH k="margPct" right active={sortKey === 'margPct'} dir={sortDir} onToggle={toggleSort}>Marg. %</SortTH>
                <SortTH k="fcUnita" right active={sortKey === 'fcUnita'} dir={sortDir} onToggle={toggleSort}>FC/un.</SortTH>
                <SortTH k="mrgUnita" right active={sortKey === 'mrgUnita'} dir={sortDir} onToggle={toggleSort}>Marg./un.</SortTH>
                <th style={{ padding: '10px 14px', fontSize: 8, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, textAlign: 'right' }}>Rating</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.nome} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                  <TD bold>{r.nome}</TD>
                  <TD right color={C.textMid}>{r.reg.unita} {r.reg.tipo === 'fetta' ? 'fette' : 'pz'}</TD>
                  <TD right bold color={C.text} mono>{euro(r.reg.prezzo)}</TD>
                  <TD right bold color={C.green} mono>{euro(r.ricavo)}</TD>
                  <TD right color={C.red} mono>{euro(r.fc)}</TD>
                  <TD right color={r.fcPct < 30 ? C.green : r.fcPct < 40 ? C.amber : C.red} bold>{pct(r.fcPct)}</TD>
                  <TD right bold color={margColor(r.margPct)} mono>{euro(r.margine)}</TD>
                  <TD right bold color={margColor(r.margPct)}>{pct(r.margPct)}</TD>
                  <TD right color={C.red} small mono>{euro(r.fcUnita)}</TD>
                  <TD right bold color={r.mrgUnita > 0 ? C.green : C.red} mono>{euro(r.mrgUnita)}</TD>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>{margBadge(r.margPct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#F0EAE6', borderTop: `2px solid ${C.borderStr}` }}>
                <td colSpan={3} style={{ padding: '12px 14px', fontWeight: 900, fontSize: 12, color: C.text }}>TOTALE / MEDIA</td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, fontSize: 13, color: C.green, ...TNUM }}>{euro(totRicavo)}</td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, fontSize: 13, color: C.red, ...TNUM }}>{euro(totFC)}</td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: fcAvg < 30 ? C.green : fcAvg < 40 ? C.amber : C.red }}>{pct(fcAvg)}</td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, fontSize: 13, color: margColor(avgMarg), ...TNUM }}>{euro(totMargine)}</td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, color: margColor(avgMarg) }}>{pct(avgMarg)}</td>
                <td colSpan={3}/>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  )
}

// ─── SENSITIVITY TABLE ───────────────────────────────────────────────────────
function SensTable({ rows, euro, pct }) {
  const sensRows = rows.map(r => ({
    ...r,
    marg10: parseFloat((r.ricavo - r.fc * 1.10).toFixed(2)),
    marg20: parseFloat((r.ricavo - r.fc * 1.20).toFixed(2)),
    headroom: parseFloat(((r.ricavo / r.fc - 1) * 100).toFixed(1)),
  }))
  const { sort, sortKey, sortDir, toggleSort } = useSortable('headroom')
  const ss = sort(sensRows, (r, k) => k === 'nome' ? r.nome : (r[k] || 0))
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 3, height: 18, background: C.red, borderRadius: 2, flexShrink: 0, alignSelf: 'center' }}/>
        <div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.text }}>Sensitivity: Impatto Aumento Costi</h2>
          <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>Cosa succede se i costi materie prime salgono</div>
        </div>
      </div>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 28, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 580 }}>
            <thead>
              <tr style={{ background: '#F8F4F2' }}>
                <SortTH k="nome" active={sortKey === 'nome'} dir={sortDir} onToggle={toggleSort}>Prodotto</SortTH>
                <SortTH k="margPct" right active={sortKey === 'margPct'} dir={sortDir} onToggle={toggleSort}>Margine attuale</SortTH>
                <SortTH k="marg10" right active={sortKey === 'marg10'} dir={sortDir} onToggle={toggleSort}>FC +10% → marg.</SortTH>
                <SortTH k="marg20" right active={sortKey === 'marg20'} dir={sortDir} onToggle={toggleSort}>FC +20% → marg.</SortTH>
                <SortTH k="ricavo" right active={sortKey === 'ricavo'} dir={sortDir} onToggle={toggleSort}>Break-even FC</SortTH>
                <SortTH k="headroom" right active={sortKey === 'headroom'} dir={sortDir} onToggle={toggleSort}>Headroom</SortTH>
              </tr>
            </thead>
            <tbody>
              {ss.map((r, i) => (
                <tr key={r.nome} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                  <TD bold>{r.nome}</TD>
                  <TD right bold color={margColor(r.margPct)} mono>{euro(r.margine)} ({pct(r.margPct)})</TD>
                  <TD right bold color={r.marg10 > 0 ? C.green : C.red} mono>{euro(r.marg10)}</TD>
                  <TD right bold color={r.marg20 > 0 ? C.green : C.red} mono>{euro(r.marg20)}</TD>
                  <TD right color={C.textMid} mono>{euro(r.ricavo)}</TD>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <span style={{ background: r.headroom > 50 ? C.greenLight : r.headroom > 25 ? C.amberLight : C.redLight,
                      color: r.headroom > 50 ? C.green : r.headroom > 25 ? C.amber : C.red,
                      fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
                      +{r.headroom.toFixed(0)}% FC tollerabile
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ─── PLView ──────────────────────────────────────────────────────────────────
export default function PLView({ ricettario, onUpdateRegola }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  const ricette = Object.values(ricettario?.ricette || {})
    .filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo !== 'interno' && getR(r.nome, r).tipo !== 'semilavorato')

  const euro = v => `€ ${Number(v).toFixed(2)}`
  const pct = v => `${Number(v).toFixed(1)}%`

  const rows = ricette.map(ric => {
    const reg = getR(ric.nome, ric)
    const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
    const ricavo = parseFloat((reg.unita * reg.prezzo).toFixed(2))
    const margine = parseFloat((ricavo - fc).toFixed(2))
    const margPct = ricavo > 0 ? (margine / ricavo * 100) : 0
    const fcPct = ricavo > 0 ? (fc / ricavo * 100) : 0
    const fcUnita = reg.unita > 0 ? fc / reg.unita : 0
    const mrgUnita = reg.prezzo - fcUnita
    return {
      nome: ric.nome,
      short: ric.nome.replace(/^TORTA (DI |AL |ALLE? )/, '').split(' ').map(w => w[0] + w.slice(1).toLowerCase()).join(' '),
      reg, fc, ricavo, margine, margPct, fcPct, fcUnita, mrgUnita,
    }
  }).sort((a, b) => b.margPct - a.margPct)

  const totRicavo = rows.reduce((s, r) => s + r.ricavo, 0)
  const totFC = rows.reduce((s, r) => s + r.fc, 0)
  const totMargine = rows.reduce((s, r) => s + r.margine, 0)
  const avgMarg = rows.reduce((s, r) => s + r.margPct, 0) / rows.length
  const best = rows[0]
  const worst = rows[rows.length - 1]
  const fcAvg = totRicavo > 0 ? (totFC / totRicavo * 100) : 0

  // Top ingredienti per costo (aggregato, riusato per PDF export)
  const topIngredienti = useMemo(() => {
    const ingMap = {}
    for (const ric of Object.values(ricettario?.ricette || {})) {
      if (!isRicettaValida(ric.nome) || getR(ric.nome, ric).tipo === 'interno') continue
      for (const ing of (ric.ingredienti || [])) {
        const k = normIng(ing.nome)
        const c = ingCosti[k]
        const costoStampo = c ? ing.qty1stampo * c.costoG : 0
        if (!ingMap[k]) ingMap[k] = { nome: ing.nome, costoTot: 0 }
        ingMap[k].costoTot += costoStampo
      }
    }
    const total = Object.values(ingMap).reduce((s, i) => s + i.costoTot, 0)
    return Object.values(ingMap)
      .filter(i => i.costoTot > 0)
      .map(i => ({ ...i, perc: total > 0 ? (i.costoTot / total * 100) : 0 }))
      .sort((a, b) => b.costoTot - a.costoTot)
  }, [ricettario, ingCosti])

  // Insights automatici (computed, mostrati in UI + esportati nel PDF)
  const insights = useMemo(() => {
    const out = []
    const eccellenti = rows.filter(r => r.margPct >= 60).length
    const critici    = rows.filter(r => r.margPct < 40).length
    const vulnerabili = rows.filter(r => r.fc > 0 && ((r.ricavo / r.fc - 1) * 100) < 25)
    const topContrib = [...rows].sort((a, b) => b.margine - a.margine)[0]
    const worstFC    = [...rows].sort((a, b) => b.fcPct - a.fcPct)[0]
    const ricsotto    = rows.filter(r => r.fcPct > 40).length

    if (eccellenti > 0) {
      out.push({ tipo: 'ok', testo: `${eccellenti} ${eccellenti === 1 ? 'prodotto ha' : 'prodotti hanno'} margine ≥ 60% (eccellente).` })
    }
    if (critici > 0) {
      out.push({ tipo: 'critical', testo: `${critici} ${critici === 1 ? 'prodotto è' : 'prodotti sono'} sotto il 40% di margine — rivedere prezzo o ricetta.` })
    }
    if (ricsotto > 0) {
      out.push({ tipo: 'warn', testo: `${ricsotto} ${ricsotto === 1 ? 'prodotto ha' : 'prodotti hanno'} food cost > 40% (benchmark pasticceria: 28–30%).` })
    }
    if (topContrib) {
      out.push({ tipo: 'ok', testo: `Top contributore margine: ${topContrib.nome} (${euro(topContrib.margine)}/stampo, ${pct(topContrib.margPct)}).` })
    }
    if (worstFC && worstFC.fcPct > 35) {
      out.push({ tipo: 'warn', testo: `${worstFC.nome} ha il food cost più alto (${pct(worstFC.fcPct)}) — valuta ingredienti alternativi o aumento prezzo.` })
    }
    if (vulnerabili.length > 0) {
      out.push({ tipo: 'critical', testo: `${vulnerabili.length} ${vulnerabili.length === 1 ? 'prodotto ha' : 'prodotti hanno'} headroom < 25%: con un aumento del 10–20% delle materie prime vanno in perdita.` })
    }
    if (topIngredienti[0] && topIngredienti[0].perc > 25) {
      out.push({ tipo: 'warn', testo: `${topIngredienti[0].nome} pesa ${topIngredienti[0].perc.toFixed(0)}% del food cost totale — concentrazione alta su un singolo ingrediente.` })
    }
    return out
  }, [rows, topIngredienti])

  // Early return DOPO tutti gli hook (Rules of Hooks): rows può passare da
  // vuoto a popolato quando il ricettario si carica async — il return non deve
  // mai precedere gli useMemo, altrimenti il numero di hook cambia tra render.
  if (!rows.length) return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center', padding: '32px 24px',
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl, boxShadow: S.sm }}>
      <div style={{ width: 48, height: 48, borderRadius: R.md, background: T.bgSubtle,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.textSoft, marginBottom: 14 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 6, letterSpacing: '-0.01em' }}>Nessun dato P&amp;L</div>
      <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.5 }}>Carica il ricettario per vedere ricavi, food cost e margine per ogni prodotto.</div>
    </div>
  )

  return (
    <div style={{ maxWidth: 1200 }}>
      <PageHeader
        subtitle={`${rows.length} prodotti · food cost medio ${pct(fcAvg)} · margine medio ${pct(avgMarg)}`}
        action={
          <button onClick={async () => {
            if (!(await gateExport('pl', { n_items: rows.length }, window.__foodos_notify))) return
            const c = getExportCtx()
            exportPLCompleto({
              rows,
              topIngredienti: topIngredienti.slice(0, 12),
              insights,
              fcAvg, avgMarg, totRicavo, totFC, totMargine,
            }, c.nomeAttivita, c.email)
          }}
            style={{ padding: '10px 16px', borderRadius: R.md, border: `1px solid ${T.border}`, background: T.bgCard,
              fontSize: 13, fontWeight: 500, color: T.textMid, cursor: 'pointer', letterSpacing: '-0.005em',
              display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: S.sm }}>
            📄 Esporta PDF
          </button>
        }
      />

      {/* ESTRATTO CONTO ECONOMICO — colpo d'occhio: Ricavi − Food cost = Margine */}
      {(() => {
        const fcPct = totRicavo > 0 ? (totFC / totRicavo) * 100 : 0
        const margPctTot = totRicavo > 0 ? (totMargine / totRicavo) * 100 : 0
        const inUtile = totMargine >= 0
        const margC = inUtile ? C.green : C.red
        const gw = Math.max(0, Math.min(100, margPctTot))
        const num = { ...TNUM, fontVariantNumeric: 'tabular-nums' }
        // celle della griglia: voce (sx) · % (dx) · importo (dx, bordo destro allineato)
        const Cell = ({ children, align = 'left', color = C.text, size = 14, weight = 600, pad = '11px 0' }) => (
          <div style={{ textAlign: align, color, fontSize: size, fontWeight: weight, padding: pad, alignSelf: 'baseline', ...(align !== 'left' ? num : {}) }}>{children}</div>
        )
        return (
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16,
            padding: isMobile ? '20px' : '24px 28px', marginBottom: 28, boxShadow: '0 2px 12px rgba(15,23,42,0.06)' }}>

            {/* Header coerente con "Insights chiave" */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 3, height: 18, background: C.red, borderRadius: 2, flexShrink: 0 }}/>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>Conto economico</h2>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.textSoft, background: '#F8F4F2', padding: '4px 10px', borderRadius: 20 }}>a regime · prezzi di listino</span>
            </div>

            {/* Statement: griglia 3 colonne — voce | % | importo (€ e % incolonnati) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', columnGap: isMobile ? 16 : 28, alignItems: 'baseline' }}>
              {/* Ricavi */}
              <Cell weight={700}>Ricavi</Cell>
              <Cell align="right" color={C.textSoft} size={12} weight={600}>100%</Cell>
              <Cell align="right" weight={700}>{euro(totRicavo)}</Cell>

              {/* Food cost */}
              <Cell color={C.textMid}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: C.red, flexShrink: 0 }}/>
                  Food cost <span style={{ color: C.textSoft, fontWeight: 500 }}>· materie prime</span>
                </span>
              </Cell>
              <Cell align="right" color={C.red} size={12} weight={700}>{fcPct.toFixed(1)}%</Cell>
              <Cell align="right" color={C.red} weight={700}>−{euro(totFC)}</Cell>

              {/* Linea di chiusura (stile bilancio) */}
              <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${C.border}`, margin: '4px 0' }}/>

              {/* Margine lordo — il totale, in evidenza */}
              <Cell color={C.text} size={isMobile ? 15 : 16} weight={800} pad="13px 0 0">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: margC, flexShrink: 0 }}/>
                  Margine lordo
                </span>
              </Cell>
              <Cell align="right" color={margC} size={13} weight={800} pad="13px 0 0">{margPctTot.toFixed(1)}%</Cell>
              <Cell align="right" color={margC} size={isMobile ? 22 : 26} weight={900} pad="9px 0 0">{euro(totMargine)}</Cell>
            </div>

            {/* Barra proporzione + legenda allineata */}
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: C.redLight }}>
                <div style={{ width: `${gw}%`, background: margC, transition: 'width 0.45s cubic-bezier(0.4,0,0.2,1)' }}/>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: margC }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: margC }}/>
                  Margine {margPctTot.toFixed(0)}%
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: C.red }}>
                  Food cost {fcPct.toFixed(0)}%
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.red }}/>
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: C.textSoft, marginTop: 10, lineHeight: 1.4 }}>
                Margine lordo prima di personale, affitto e utenze.
              </div>
            </div>
          </div>
        )
      })()}

      {/* INSIGHTS AUTOMATICI */}
      {insights.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 3, height: 18, background: C.red, borderRadius: 2, flexShrink: 0, alignSelf: 'center' }}/>
            <div>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.text }}>Insights chiave</h2>
              <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>Cosa dicono i tuoi dati, generato in automatico</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,1fr)', gap: 12, alignItems: 'stretch' }}>
            {[...insights].sort((a, b) => ({ critical: 0, warn: 1, ok: 2 }[a.tipo] - { critical: 0, warn: 1, ok: 2 }[b.tipo])).map((ins, i) => {
              const palette = ins.tipo === 'critical'
                ? { bg: C.redLight, fg: C.red, lbl: 'CRITICO', icon: '⚠' }
                : ins.tipo === 'warn'
                ? { bg: C.amberLight, fg: C.amber, lbl: 'ATTENZIONE', icon: '!' }
                : { bg: C.greenLight, fg: C.green, lbl: 'OK', icon: '✓' }
              return (
                <div key={i} style={{
                  background: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${palette.fg}`,
                  borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', background: palette.bg, color: palette.fg,
                    fontSize: 13, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>{palette.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: palette.fg, marginBottom: 3 }}>{palette.lbl}</div>
                    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, fontWeight: 500 }}>{ins.testo}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* KPI STRIP */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(3,1fr)' : 'repeat(6,1fr)', gap: 10, marginBottom: 36 }}>
        {[
          { lbl: 'Prodotti', val: rows.length, sub: 'nel listino', hi: true },
          { lbl: 'Ricavo/stampo', val: euro(totRicavo), sub: 'somma tutti i prodotti', color: T.green },
          { lbl: 'Food cost tot.', val: euro(totFC), sub: `FC ratio ${pct(fcAvg)}`, color: T.brand },
          { lbl: 'Margine lordo', val: euro(totMargine), sub: `${pct(avgMarg)} medio`, color: margColor(avgMarg) },
          { lbl: 'Miglior margine', val: best.short, sub: pct(best.margPct), color: T.green },
          { lbl: 'Da ottimizzare', val: worst.short, sub: pct(worst.margPct), color: T.brand },
        ].map(({ lbl, val, sub, hi, color }, i) => (
          <div key={i} style={{ background: hi ? T.brand : T.bgCard,
            border: `1px solid ${hi ? T.brandDark : T.border}`, borderRadius: R.xl,
            padding: '14px 16px',
            boxShadow: hi ? '0 4px 14px rgba(110,14,26,0.22)' : S.sm }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: hi ? 'rgba(255,255,255,0.7)' : T.textSoft, marginBottom: 6 }}>{lbl}</div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em',
              color: hi ? T.textOnDark : color || T.text, lineHeight: 1.15, ...TNUM }}>{val}</div>
            <div style={{ fontSize: 11, color: hi ? 'rgba(255,255,255,0.62)' : T.textSoft, marginTop: 5 }}>{sub}</div>
          </div>
        ))}
      </div>

      <BarreRicavo rows={rows} euro={euro} pct={pct}/>
      <PLTable rows={rows} euro={euro} pct={pct} totRicavo={totRicavo} totFC={totFC} totMargine={totMargine} fcAvg={fcAvg} avgMarg={avgMarg}/>
      <TopIngredientiTable ricettario={ricettario} ingCosti={ingCosti} euro={euro} pct={pct}/>
      <ScenarioPrezzi rows={rows} euro={euro} pct={pct}/>
      <SensTable rows={rows} euro={euro} pct={pct}/>

      {/* Grafici di riepilogo */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 3, height: 18, background: C.red, borderRadius: 2, flexShrink: 0, alignSelf: 'center' }}/>
        <div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.text }}>Grafici di Riepilogo</h2>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, marginBottom: 28 }}>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 16 }}>Margine % per prodotto</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...rows].sort((a, b) => b.margPct - a.margPct).map(r => {
              const mc = margColor(r.margPct)
              return (
                <div key={r.nome}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.text }}>{r.short}</span>
                    <span style={{ fontSize: 11, fontWeight: 900, color: mc, ...TNUM }}>{pct(r.margPct)}</span>
                  </div>
                  <div style={{ height: 10, background: '#F0EAE6', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, r.margPct)}%`, background: mc, borderRadius: 5 }}/>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 4 }}>Ricavo vs Margine per stampo</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={[...rows].sort((a, b) => b.ricavo - a.ricavo)} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0E8E4" horizontal={false}/>
              <XAxis type="number" tickFormatter={v => `€${v.toFixed(0)}`} tick={{ fill: C.textSoft, fontSize: 9 }} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="short" width={80} tick={{ fill: C.textMid, fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false}/>
              <Tooltip formatter={(v, n) => [`€ ${Number(v).toFixed(2)}`, n]} contentStyle={{ borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 11 }}/>
              <Bar dataKey="ricavo" name="Ricavo" fill={C.green} fillOpacity={0.2} radius={[0, 3, 3, 0]}/>
              <Bar dataKey="margine" name="Margine" radius={[0, 3, 3, 0]}>
                {[...rows].sort((a, b) => b.ricavo - a.ricavo).map((r, i) => (
                  <Cell key={i} fill={margColor(r.margPct)} fillOpacity={0.85}/>
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Benchmark */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 12 }}>
        <div style={{ background: C.greenLight, border: `1px solid ${C.green}30`, borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.green, marginBottom: 10 }}>✅ Benchmark pasticceria</div>
          {[['Food cost ideale', '< 28–30%'], ['Margine target', '70–72%'], ['Accettabile', '55–70%']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11 }}>
              <span style={{ color: C.textMid }}>{k}</span><span style={{ color: C.green, fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ background: C.amberLight, border: `1px solid ${C.amber}30`, borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.amber, marginBottom: 10 }}>💡 Leve di ottimizzazione</div>
          {[['Aumentare prezzo +0,50€/fetta', 'Margine sale ~8-12pp'], ['Ridurre FC del 10%', 'Negozia bulk'], ['Tagliare prodotti < 50% marg.', 'Sostituisci con migliori']].map(([k, v]) => (
            <div key={k} style={{ padding: '6px 0', fontSize: 10 }}>
              <div style={{ color: C.amber, fontWeight: 700 }}>{k}</div>
              <div style={{ color: C.textMid, lineHeight: 1.4 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
