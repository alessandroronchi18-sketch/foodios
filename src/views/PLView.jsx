// PLView — Profit & Loss completo (estratto da Dashboard.jsx).
// Include 5 sub-componenti specifici: BarreRicavo, TopIngredientiTable,
// ScenarioPrezzi, PLTable, SensTable.
//
// Primitive condivise (Tip, margBadge, margColor, TD, TH, SortTH, useSortable,
// Badge, C palette) vengono da ./_shared.

import React, { useState, useMemo, useEffect } from 'react'
import { sload, ssave } from '../lib/storage'
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
  C, TNUM, margColor, margBadge, Badge, Tip, PageHeader, SH, TD, TH,
  useSortable, SortTH, fmt, fmt0, KPI, ChartTip,
} from './_shared'
import Icon from '../components/Icon'
import AiExplainButton from '../components/AiExplainButton'
import ExportPdfButton from '../components/ExportPdfButton'

// Ombra premium coerente con la Dashboard home (card/contenitori principali).
const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'

// ─── BARRE RICAVO (stacked margine vs food cost) ─────────────────────────────
function BarreRicavo({ rows, euro, pct }) {
  const [tooltip, setTooltip] = useState(null)

  return (
    <>
      <SH sub="Verde = margine lordo che resta in cassa · Rosso = costo ingredienti · Passa il mouse sulla barra per il dettaglio">Dove va ogni euro di ricavo — per stampo</SH>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px', marginBottom: 28,
        boxShadow: SHADOW_PREMIUM, position: 'relative' }}
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
                <div style={{ fontSize: 11, color: C.green, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="dot" size={10} color={C.green} />Margine lordo</div>
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
                <div style={{ fontSize: 11, color: C.red, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="dot" size={10} color={C.red} />Costo ingredienti</div>
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
      <SH sub="Aggregato su tutti i prodotti — clicca le intestazioni per ordinare">Ingredienti per Impatto sul Food Cost</SH>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, overflowX: 'auto', marginBottom: 28, boxShadow: SHADOW_PREMIUM, position: 'relative' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#F8F4F2' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 8, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}` }}>Ingrediente</th>
              <th title="In quante ricette compare questo ingrediente" style={{ padding: '10px 14px', textAlign: 'left', fontSize: 8, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, textDecoration: 'underline dotted', textUnderlineOffset: 3, cursor: 'help' }}>Usato in</th>
              <SortTH k="qty" right active={sortKey === 'qty'} dir={sortDir} onToggle={toggleSort} tip="Grammi totali dell'ingrediente sommando una porzione di ogni ricetta che lo usa">Qty tot. (g)</SortTH>
              <SortTH k="costoTot" right active={sortKey === 'costoTot'} dir={sortDir} onToggle={toggleSort} tip="Costo di questo ingrediente per stampo, sommato sulle ricette che lo usano">Costo/stampo</SortTH>
              <SortTH k="pctTot" right active={sortKey === 'pctTot'} dir={sortDir} onToggle={toggleSort} tip="Quanto pesa questo ingrediente sul food cost complessivo del ricettario">% FC totale</SortTH>
              <SortTH k="costoG" right active={sortKey === 'costoG'} dir={sortDir} onToggle={toggleSort} tip="Costo di un singolo grammo dell'ingrediente">€ / g</SortTH>
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
                    {ing.costoG > 0 ? `${ing.costoG.toFixed(4)} €` : '—'}
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
  // Audit 2026-06-22: isTablet usato al rigo 290 ma mai chiamato → ReferenceError
  // in build minificato (stessa classe del bug HeaderPersonale).
  const isTablet = useIsTablet()
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
          <button onClick={reset} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: 11, fontWeight: 700, color: C.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="refresh" size={12} />Reset tutto</button>
        )}
      </div>

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px', marginBottom: 28, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
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
      <SH sub="Clicca le intestazioni per ordinare ▼▲">Tabella Riepilogativa P&L</SH>
      {/* Audit 2026-06-25: overflowX:auto sul container + minWidth tabella per
          consentire lo scroll orizzontale su mobile/tablet senza tagliare i
          numeri; numeri tabular-nums e allineati a destra; riga TOTALE 800. */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, overflowX: 'auto', marginBottom: 28, boxShadow: SHADOW_PREMIUM }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 760 }}>
            <thead>
              <tr style={{ background: '#F8F4F2' }}>
                <SortTH k="nome" active={sortKey === 'nome'} dir={sortDir} onToggle={toggleSort}>Prodotto</SortTH>
                <SortTH k="unita" right active={sortKey === 'unita'} dir={sortDir} onToggle={toggleSort} tip="Numero di pezzi/fette ricavati da uno stampo">Unità/st.</SortTH>
                <SortTH k="prezzo" right active={sortKey === 'prezzo'} dir={sortDir} onToggle={toggleSort} tip="Prezzo di vendita di un singolo pezzo/fetta">Prezzo/un.</SortTH>
                <SortTH k="ricavo" right active={sortKey === 'ricavo'} dir={sortDir} onToggle={toggleSort} tip="Ricavo da uno stampo = unità × prezzo">Ricavo/st.</SortTH>
                <SortTH k="fc" right active={sortKey === 'fc'} dir={sortDir} onToggle={toggleSort} tip="Food cost (costo ingredienti) di uno stampo">FC/st.</SortTH>
                <SortTH k="fcPct" right active={sortKey === 'fcPct'} dir={sortDir} onToggle={toggleSort} tip="Incidenza % del food cost sul ricavo (FC ÷ ricavo)">FC ratio</SortTH>
                <SortTH k="margine" right active={sortKey === 'margine'} dir={sortDir} onToggle={toggleSort} tip="Margine lordo per stampo = ricavo − food cost">Margine/st.</SortTH>
                <SortTH k="margPct" right active={sortKey === 'margPct'} dir={sortDir} onToggle={toggleSort} tip="Margine lordo in percentuale sul ricavo">Marg. %</SortTH>
                <SortTH k="fcUnita" right active={sortKey === 'fcUnita'} dir={sortDir} onToggle={toggleSort} tip="Food cost di un singolo pezzo/fetta">FC/un.</SortTH>
                <SortTH k="mrgUnita" right active={sortKey === 'mrgUnita'} dir={sortDir} onToggle={toggleSort} tip="Margine lordo di un singolo pezzo/fetta">Marg./un.</SortTH>
                <th title="Valutazione complessiva del margine del prodotto" style={{ padding: '10px 14px', fontSize: 8, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, textAlign: 'right', textDecoration: 'underline dotted', textUnderlineOffset: 3, cursor: 'help' }}>Rating</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.nome} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                  <TD bold>{r.nome}</TD>
                  <TD right color={C.textMid}>{r.reg.unita} {r.reg.tipo === 'fetta' ? 'fette' : 'pz'}</TD>
                  <TD right bold color={C.text} mono>{euro(r.reg.prezzo)}</TD>
                  <TD right bold color={C.green} mono>{fmt0(r.ricavo)}</TD>
                  <TD right color={C.red} mono>{euro(r.fc)}</TD>
                  <TD right color={r.fcPct < 30 ? C.green : r.fcPct < 40 ? C.amber : C.red} bold>{pct(r.fcPct)}</TD>
                  <TD right bold color={margColor(r.margPct)} mono>{fmt0(r.margine)}</TD>
                  <TD right bold color={margColor(r.margPct)}>{pct(r.margPct)}</TD>
                  <TD right color={C.red} small mono>{euro(r.fcUnita)}</TD>
                  <TD right bold color={r.mrgUnita > 0 ? C.green : C.red} mono>{euro(r.mrgUnita)}</TD>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>{margBadge(r.margPct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#F0EAE6', borderTop: `2px solid ${C.borderStr}` }}>
                <td colSpan={3} style={{ padding: '12px 14px', fontWeight: 800, fontSize: 12, color: C.text }}>TOTALE / MEDIA</td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: C.green, ...TNUM }}>{fmt0(totRicavo)}</td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: C.red, ...TNUM }}>{euro(totFC)}</td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: fcAvg < 30 ? C.green : fcAvg < 40 ? C.amber : C.red }}>{pct(fcAvg)}</td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: margColor(avgMarg), ...TNUM }}>{fmt0(totMargine)}</td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: margColor(avgMarg) }}>{pct(avgMarg)}</td>
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
      <SH sub="Cosa succede se i costi materie prime salgono">Sensitivity: Impatto Aumento Costi</SH>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', overflowX: 'auto', marginBottom: 28, boxShadow: SHADOW_PREMIUM }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 580 }}>
            <thead>
              <tr style={{ background: '#F8F4F2' }}>
                <SortTH k="nome" active={sortKey === 'nome'} dir={sortDir} onToggle={toggleSort}>Prodotto</SortTH>
                <SortTH k="margPct" right active={sortKey === 'margPct'} dir={sortDir} onToggle={toggleSort} tip="Margine % con i costi attuali">Margine attuale</SortTH>
                <SortTH k="marg10" right active={sortKey === 'marg10'} dir={sortDir} onToggle={toggleSort} tip="Margine % se il food cost aumentasse del 10% (es. rincaro materie prime)">FC +10% → marg.</SortTH>
                <SortTH k="marg20" right active={sortKey === 'marg20'} dir={sortDir} onToggle={toggleSort} tip="Margine % se il food cost aumentasse del 20%">FC +20% → marg.</SortTH>
                <SortTH k="ricavo" right active={sortKey === 'ricavo'} dir={sortDir} onToggle={toggleSort} tip="Aumento di food cost che azzera il margine: oltre questa soglia vendi in perdita">Break-even FC</SortTH>
                <SortTH k="headroom" right active={sortKey === 'headroom'} dir={sortDir} onToggle={toggleSort} tip="Margine di sicurezza: quanto possono salire i costi prima di erodere la redditività">Headroom</SortTH>
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
const SK_PL_COSTI = 'pl-costi-fissi-v1' // per-sede: { affitto, utenze, altro, personale }

export default function PLView({ ricettario, chiusure = [], orgId, sedeId, onUpdateRegola, notify }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  const ricette = Object.values(ricettario?.ricette || {})
    .filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo !== 'interno' && getR(r.nome, r).tipo !== 'semilavorato')

  // Costi aziendali extra-food (consumabili, manutenzione, utenze, ammortamenti)
  // - vengono sottratti per ottenere il margine NETTO mensile/annuale.
  // Caricati on-mount. Default 0 se l'utente non li ha ancora configurati.
  const [costiAziendali, setCostiAziendali] = useState([])
  useEffect(() => {
    if (!orgId) return
    import('../lib/costiAziendali').then(({ caricaCostiAziendali, totaleMensile }) => {
      caricaCostiAziendali(orgId, sedeId).then(arr => {
        setCostiAziendali(arr)
      })
    }).catch(() => { /* tabella non ancora migrata: ignora */ })
  }, [orgId, sedeId])

  // Audit 2026-06-25: euro/pct delegano agli helper condivisi (`fmt`/`fmtp`)
  // così IT thousands separator + simbolo € dopo cifra restano coerenti
  // ovunque (KPI, tabelle, conto economico, banda costi extra-food).
  const euro = v => fmt(v)
  const pct = v => `${Number(v).toFixed(1)}%`
  const cardP = { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, boxShadow: SHADOW_PREMIUM }

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
  // Audit 2026-07-01 LOW: guard division by zero (rows vuoto -> NaN).
  const avgMarg = rows.length > 0
    ? rows.reduce((s, r) => s + r.margPct, 0) / rows.length
    : 0
  const best = rows[0]
  const worst = rows[rows.length - 1]
  const fcAvg = totRicavo > 0 ? (totFC / totRicavo * 100) : 0

  // ═══ P&L MENSILE REALE (ricavi+food cost dalle chiusure, personale+costi fissi input) ═══
  const [mese, setMese] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  // Audit 2026-06-25: il filtro temporale è ora un date range picker (dal/al).
  // Default = primo del mese corrente → oggi. `mese` resta come "mese di
  // riferimento" per le label, derivato dalla data finale del range.
  const today = new Date()
  const _ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const [dateFrom, setDateFrom] = useState(() => _ymd(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [dateTo, setDateTo] = useState(() => _ymd(today))
  const [costi, setCosti] = useState({ affitto: 0, utenze: 0, altro: 0, personale: 0 })
  const [editCosti, setEditCosti] = useState(false)
  const [savingCosti, setSavingCosti] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [targetLavoro, setTargetLavoro] = useState(30)

  useEffect(() => {
    if (!orgId) return
    let alive = true
    sload(SK_PL_COSTI, orgId, sedeId).then(d => {
      if (alive && d && typeof d === 'object') setCosti({ affitto: +d.affitto || 0, utenze: +d.utenze || 0, altro: +d.altro || 0, personale: +d.personale || 0 })
    }).catch(() => {})
    return () => { alive = false }
  }, [orgId, sedeId])

  async function salvaCosti(next) {
    setSavingCosti(true)
    try {
      await ssave(SK_PL_COSTI, next, orgId, sedeId)
      setCosti(next)
      setEditCosti(false)
    } catch (e) {
      // Audit 2026-07-01 HIGH: il vecchio catch swallow silenzioso lasciava
      // l'utente convinto di aver salvato. Mostriamo errore esplicito.
      try { notify?.('Errore salvataggio costi: ' + (e?.message || 'sconosciuto'), false) } catch {}
    } finally { setSavingCosti(false) }
  }

  const mesiDisponibili = useMemo(() => {
    const s = new Set()
    for (const c of (chiusure || [])) if (c?.data) s.add(c.data.slice(0, 7))
    const arr = [...s].sort().reverse()
    if (!arr.includes(mese)) arr.unshift(mese)
    return arr
  }, [chiusure, mese])

  // Audit 2026-06-25: aggregazione su un range data->data (inclusivi).
  // Sostituisce aggMese(ym) mantenendo la stessa shape {ricavi, foodcost, giorni}.
  const aggRange = (from, to) => {
    let ricavi = 0, foodcost = 0, giorni = 0
    if (!from || !to) return { ricavi, foodcost, giorni }
    for (const c of (chiusure || [])) {
      if (!c?.data) continue
      const d = c.data.slice(0, 10)
      if (d < from || d > to) continue
      ricavi += Number(c.kpi?.totV) || 0
      foodcost += Number(c.kpi?.totFC) || 0
      giorni++
    }
    return { ricavi, foodcost, giorni }
  }
  const meseLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) }
  // Range etichetta: "1 giu — 24 giu 2026" (compatta per UI).
  const rangeLabel = (from, to) => {
    if (!from || !to) return ''
    const f = new Date(from + 'T00:00:00')
    const t = new Date(to + 'T00:00:00')
    const fmtD = (d, withYear) => d.toLocaleDateString('it-IT', withYear
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'short' })
    if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return ''
    return `${fmtD(f, f.getFullYear() !== t.getFullYear())} — ${fmtD(t, true)}`
  }
  // Range del periodo precedente di pari durata, per confronto vs mese prec.
  const prevRange = (from, to) => {
    if (!from || !to) return { from, to }
    const f = new Date(from + 'T00:00:00')
    const t = new Date(to + 'T00:00:00')
    const ms = t - f
    const pt = new Date(f.getTime() - 86400000) // giorno prima di "from"
    const pf = new Date(pt.getTime() - ms)
    return { from: _ymd(pf), to: _ymd(pt) }
  }

  const plMese = useMemo(() => {
    const cur = aggRange(dateFrom, dateTo)
    const pr = prevRange(dateFrom, dateTo)
    const prev = aggRange(pr.from, pr.to)
    const costiFissi = (+costi.affitto || 0) + (+costi.utenze || 0) + (+costi.altro || 0)
    const personale = +costi.personale || 0
    const margineLordo = cur.ricavi - cur.foodcost
    const utile = margineLordo - personale - costiFissi
    const fcPct = cur.ricavi > 0 ? cur.foodcost / cur.ricavi * 100 : 0
    const lavPct = cur.ricavi > 0 ? personale / cur.ricavi * 100 : 0
    const margOpPct = cur.ricavi > 0 ? utile / cur.ricavi * 100 : 0
    const mcPct = cur.ricavi > 0 ? margineLordo / cur.ricavi : 0.7
    const breakeven = mcPct > 0 ? (personale + costiFissi) / mcPct : 0
    const utilePrev = (prev.ricavi - prev.foodcost) - personale - costiFissi
    return { cur, prev, costiFissi, personale, margineLordo, utile, fcPct, lavPct, margOpPct, breakeven, utilePrev }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- aggRange/prevRange sono pure closures stabili sui props (chiusure) già in deps
  }, [chiusure, dateFrom, dateTo, costi])

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
  if (!rows.length && !(chiusure || []).length) return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center', padding: '32px 24px',
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 18, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
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
        subtitle={'Conto economico mensile reale + analisi di redditività del listino'}
        action={
          <button onClick={async () => {
            // Audit 2026-07-01 MEDIUM: disabled durante export per evitare doppio
            // PDF (gateExport e' async + jsPDF e' sincrono ma il rate-limit gate
            // puo' ritornare con delay).
            if (exportingPdf) return
            setExportingPdf(true)
            try {
              if (!(await gateExport('pl', { n_items: rows.length }, window.__foodos_notify))) return
              const c = getExportCtx()
              exportPLCompleto({
                rows,
                topIngredienti: topIngredienti.slice(0, 12),
                insights,
                fcAvg, avgMarg, totRicavo, totFC, totMargine,
              }, c.nomeAttivita, c.email)
            } finally { setExportingPdf(false) }
          }}
            disabled={exportingPdf}
            style={{ padding: '10px 16px', borderRadius: R.md, border: `1px solid ${T.border}`, background: T.bgCard,
              fontSize: 13, fontWeight: 500, color: T.textMid, cursor: exportingPdf ? 'not-allowed' : 'pointer', letterSpacing: '-0.005em',
              opacity: exportingPdf ? 0.6 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: S.sm }}>
            <Icon name="fileText" size={14} />{exportingPdf ? 'Generazione…' : 'Esporta PDF'}
          </button>
        }
      />

      {/* ═══ P&L MENSILE REALE ═══ */}
      <SH sub="Ricavi e food cost reali dalle chiusure di cassa, meno costo del personale e costi fissi. = utile vero del periodo.">Conto economico · {rangeLabel(dateFrom, dateTo)}</SH>

      {/* Audit 2026-06-25: dropdown mese → date range picker (dal/al).
          Default = primo del mese corrente → oggi. Input type=date nativi
          per restare consistenti con il resto della dashboard. */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.textMid, fontWeight: 600 }}>
            Dal
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: R.md, border: `1px solid ${T.border}`, background: T.bgCard, fontSize: 13, color: T.text, fontWeight: 600, minHeight: 40, fontVariantNumeric: 'tabular-nums' }}
            />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.textMid, fontWeight: 600 }}>
            Al
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={e => setDateTo(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: R.md, border: `1px solid ${T.border}`, background: T.bgCard, fontSize: 13, color: T.text, fontWeight: 600, minHeight: 40, fontVariantNumeric: 'tabular-nums' }}
            />
          </label>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setEditCosti(v => !v)}
          style={{ padding: '8px 14px', borderRadius: R.md, border: `1px solid ${T.border}`, background: T.bgCard, fontSize: 12.5, fontWeight: 600, color: T.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="gear" size={14} /> Costi fissi & personale
        </button>
      </div>

      {editCosti && (
        <div style={{ ...cardP, padding: isMobile ? 14 : 18, marginBottom: 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 14, alignItems: 'end' }}>
          {[['affitto', 'Affitto / mese'], ['utenze', 'Utenze / mese'], ['altro', 'Altri costi fissi'], ['personale', 'Costo personale / mese']].map(([k, lbl]) => (
            <div key={k}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: T.textSoft, marginBottom: 6 }}>{lbl}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 12px', minHeight: 44, background: T.bgCard }}>
                <span style={{ color: T.textSoft, fontSize: 13 }}>€</span>
                <input type="number" inputMode="decimal" value={costi[k] || ''} onChange={e => setCosti(c => ({ ...c, [k]: e.target.value }))}
                  placeholder="0" style={{ border: 'none', outline: 'none', width: '100%', fontSize: isMobile ? 16 : 14, fontWeight: 700, color: T.text, background: 'transparent', ...TNUM }} />
              </div>
            </div>
          ))}
          <div style={{ gridColumn: isMobile ? '1 / -1' : 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => salvaCosti({ affitto: +costi.affitto || 0, utenze: +costi.utenze || 0, altro: +costi.altro || 0, personale: +costi.personale || 0 })} disabled={savingCosti}
              style={{ flex: 1, padding: '11px 16px', minHeight: 44, borderRadius: R.md, border: 'none', background: T.brand, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{savingCosti ? 'Salvo…' : 'Salva'}</button>
            <button onClick={() => { setEditCosti(false); sload(SK_PL_COSTI, orgId, sedeId).then(d => d && setCosti({ affitto: +d.affitto || 0, utenze: +d.utenze || 0, altro: +d.altro || 0, personale: +d.personale || 0 })).catch(() => {}) }}
              style={{ padding: '11px 16px', minHeight: 44, borderRadius: R.md, border: `1px solid ${T.border}`, background: T.bgCard, fontSize: 13, color: T.textMid, cursor: 'pointer' }}>Annulla</button>
          </div>
        </div>
      )}

      {plMese.cur.giorni === 0 ? (
        <div style={{ ...cardP, padding: 32, textAlign: 'center', color: T.textSoft, fontSize: 13, marginBottom: 28 }}>
          Nessuna chiusura di cassa registrata nel periodo selezionato ({rangeLabel(dateFrom, dateTo)}). Registra le chiusure (sezione Cassa) per vedere il conto economico.
        </div>
      ) : (
        <>
          {/* KPI diagnosi */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16, marginBottom: 14 }}>
            <KPI icon={<Icon name="barChart" size={18} />} label="Ricavi del periodo" value={fmt0(plMese.cur.ricavi)} sub={`${plMese.cur.giorni} giorni${plMese.prev.ricavi ? ` · ${plMese.cur.ricavi >= plMese.prev.ricavi ? '+' : ''}${fmt0(plMese.cur.ricavi - plMese.prev.ricavi)} vs periodo prec.` : ''}`} />
            <KPI icon={<Icon name="bulb" size={18} />} label="Utile del periodo" value={fmt0(plMese.utile)} highlight={plMese.utile >= 0} color={plMese.utile >= 0 ? undefined : T.brand}
              sub={`margine operativo ${pct(plMese.margOpPct)}`} />
            <KPI icon={<Icon name="receipt" size={18} />} label="Food cost" value={pct(plMese.fcPct)} color={plMese.fcPct <= 30 ? T.green : plMese.fcPct <= 40 ? T.amber : T.brand} sub={fmt0(plMese.cur.foodcost)} />
            <KPI icon={<Icon name="users" size={18} />} label="Costo lavoro" value={pct(plMese.lavPct)} color={plMese.lavPct <= targetLavoro ? T.green : plMese.lavPct <= targetLavoro + 10 ? T.amber : T.brand} sub={`target ${targetLavoro}% · ${fmt0(plMese.personale)}`} />
          </div>

          {/* AI explain + Export PDF */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <AiExplainButton
              label={`P&L ${rangeLabel(dateFrom, dateTo)}`}
              value={`Utile ${fmt0(plMese.utile)} · FC ${pct(plMese.fcPct)}`}
              context={{
                periodo: rangeLabel(dateFrom, dateTo),
                giorni: plMese.cur.giorni,
                ricavi: plMese.cur.ricavi,
                ricavi_periodo_prec: plMese.prev?.ricavi,
                foodcost_eur: plMese.cur.foodcost,
                foodcost_pct: plMese.fcPct,
                costo_lavoro_eur: plMese.personale,
                costo_lavoro_pct: plMese.lavPct,
                target_lavoro_pct: targetLavoro,
                margine_operativo_pct: plMese.margOpPct,
                utile: plMese.utile,
              }}
            />
            <ExportPdfButton
              fileName={`pl-${(dateFrom || '').replace(/-/g, '')}-${(dateTo || '').replace(/-/g, '')}.pdf`}
              getReport={() => ({
                title: 'Conto economico',
                subtitle: `Periodo: ${rangeLabel(dateFrom, dateTo)}`,
                periodo: plMese.prev?.ricavi > 0 ? `vs periodo prec. (variazione ${pct(((plMese.cur.ricavi - plMese.prev.ricavi) / plMese.prev.ricavi) * 100)})` : undefined,
                kpi: [
                  { label: 'Ricavi', value: `${fmt0(plMese.cur.ricavi)} €`, sub: `${plMese.cur.giorni} giorni` },
                  { label: 'Food cost', value: pct(plMese.fcPct), sub: `${fmt0(plMese.cur.foodcost)} €` },
                  { label: 'Costo lavoro', value: pct(plMese.lavPct), sub: `${fmt0(plMese.personale)} €` },
                  { label: 'Utile', value: `${fmt0(plMese.utile)} €`, sub: `margine op. ${pct(plMese.margOpPct)}` },
                ],
                sections: [
                  {
                    title: 'Conto economico a cascata',
                    table: {
                      columns: ['Voce', 'Importo €', '% sui ricavi'],
                      alignments: ['left', 'right', 'right'],
                      rows: [
                        ['Ricavi totali', fmt0(plMese.cur.ricavi), '100%'],
                        ['- Food cost', `(${fmt0(plMese.cur.foodcost)})`, pct(plMese.fcPct)],
                        ['= Margine lordo', fmt0(plMese.cur.ricavi - plMese.cur.foodcost), pct(100 - plMese.fcPct)],
                        ['- Costo lavoro', `(${fmt0(plMese.personale)})`, pct(plMese.lavPct)],
                        ['= Margine operativo', fmt0(plMese.utile), pct(plMese.margOpPct)],
                      ],
                    },
                  },
                ],
              })}
            />
          </div>

          {/* Conto economico a cascata */}
          <div style={{ ...cardP, padding: isMobile ? '16px 18px' : '20px 26px', marginBottom: 28 }}>
            {(() => {
              const Row = ({ label, val, pctv, bold, neg, strong, sub }) => (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: strong ? '12px 0' : '8px 0', borderTop: strong ? `2px solid ${T.text}` : 'none' }}>
                  <span style={{ fontSize: strong ? 14 : 13, fontWeight: strong || bold ? 800 : 500, color: strong ? T.text : T.textMid, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}{sub && <span style={{ fontSize: 11, color: T.textSoft, fontWeight: 500 }}> · {sub}</span>}</span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: isMobile ? 8 : 12, flexShrink: 0 }}>
                    {pctv != null && <span style={{ fontSize: 11.5, color: T.textSoft, ...TNUM, minWidth: 46, textAlign: 'right' }}>{pct(pctv)}</span>}
                    <span style={{ fontSize: strong ? (isMobile ? 18 : 20) : 14, fontWeight: strong || bold ? 800 : 600, color: strong ? (val >= 0 ? T.green : T.brand) : (neg ? T.brand : T.text), ...TNUM, minWidth: isMobile ? 80 : 100, textAlign: 'right' }}>
                      {neg && val !== 0 ? '−' : ''}{fmt0(Math.abs(val))}
                    </span>
                  </span>
                </div>
              )
              return (
                <>
                  <Row label="Ricavi" val={plMese.cur.ricavi} pctv={100} bold />
                  <Row label="Food cost (materie prime)" val={plMese.cur.foodcost} pctv={plMese.fcPct} neg />
                  <Row label="Margine lordo" val={plMese.margineLordo} pctv={plMese.cur.ricavi > 0 ? plMese.margineLordo / plMese.cur.ricavi * 100 : 0} bold />
                  <Row label="Costo del personale" val={plMese.personale} pctv={plMese.lavPct} neg />
                  <Row label="Costi fissi (affitto, utenze, altro)" val={plMese.costiFissi} pctv={plMese.cur.ricavi > 0 ? plMese.costiFissi / plMese.cur.ricavi * 100 : 0} neg />
                  <Row label={plMese.utile >= 0 ? 'UTILE DEL PERIODO' : 'PERDITA DEL PERIODO'} val={plMese.utile} pctv={plMese.margOpPct} strong />
                  <div style={{ fontSize: 11.5, color: T.textSoft, marginTop: 10, lineHeight: 1.5 }}>
                    Break-even: servono <b style={{ color: T.text }}>{fmt0(plMese.breakeven)}</b> di ricavi/mese per coprire personale e costi fissi
                    {(plMese.personale + plMese.costiFissi) === 0 && ' · imposta i costi fissi e il personale per un calcolo completo'}.
                  </div>
                </>
              )
            })()}
          </div>
        </>
      )}

      {rows.length > 0 && (<>
      {/* Audit 2026-06-25: temporaneamente disabilitata.
      <SH sub="Redditività teorica di ogni ricetta ai prezzi di listino — utile per le decisioni su prezzi e ricette.">Analisi del listino (teorica)</SH>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#F8F4F2', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
        <span style={{ lineHeight: 1, marginTop: 1, color: C.textMid }}><Icon name="bulb" size={16} /></span>
        <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.55 }}>
          <b style={{ color: C.text }}>Numeri teorici, non riferiti a un periodo.</b> Mostrano ricavo, food cost e margine <b>per un singolo stampo di ciascun prodotto</b>, ai <b>prezzi di listino attuali</b> — servono a capire la redditività delle ricette. Per ricavi e margini <b>reali nel tempo</b> (giorno · settimana · mese) apri la sezione <b>Storico</b>.
        </div>
      </div>
      */}

      {/* ESTRATTO CONTO ECONOMICO — colpo d'occhio: Ricavi − Food cost = Margine */}
      {(() => {
        const fcPct = totRicavo > 0 ? (totFC / totRicavo) * 100 : 0
        const margPctTot = totRicavo > 0 ? (totMargine / totRicavo) * 100 : 0
        const inUtile = totMargine >= 0
        const margC = inUtile ? C.green : C.red
        const gw = Math.max(0, Math.min(100, margPctTot))
        const num = { ...TNUM, fontVariantNumeric: 'tabular-nums' }
        // Stili UNIFORMI: stessa dimensione per le 3 voci e per i 3 valori.
        const cellP = { fontSize: 13, fontWeight: 700, padding: '10px 0', textAlign: 'right', alignSelf: 'center', ...num }
        const cellA = { fontSize: 16, fontWeight: 800, padding: '10px 0', textAlign: 'right', alignSelf: 'center', ...num }
        const Voce = ({ dot, children }) => (
          <div style={{ fontSize: 14, fontWeight: 700, padding: '10px 0', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: dot, flexShrink: 0 }}/>
            <span style={{ color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
          </div>
        )
        return (
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16,
            padding: isMobile ? '20px' : '24px 28px', marginBottom: 28, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>

            {/* Header coerente con "Insights chiave" */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 3, height: 18, background: C.red, borderRadius: 2, flexShrink: 0 }}/>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>Conto economico</h2>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.textSoft, background: '#F8F4F2', padding: '4px 10px', borderRadius: 20 }}>a regime · prezzi di listino</span>
            </div>

            {/* Statement: griglia 3 colonne — voce | % | importo, tutto incolonnato
                con dimensioni IDENTICHE su tutte le righe. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', columnGap: isMobile ? 18 : 36, alignItems: 'center' }}>
              {/* Ricavi */}
              <Voce dot="#C9BEB6">Ricavi</Voce>
              <div style={{ ...cellP, color: C.textSoft }}>100.0%</div>
              <div style={{ ...cellA, color: C.text }}>{fmt0(totRicavo)}</div>

              {/* Food cost */}
              <Voce dot={C.red}>Food cost</Voce>
              <div style={{ ...cellP, color: C.red }}>{fcPct.toFixed(1)}%</div>
              <div style={{ ...cellA, color: C.red }}>−{fmt0(totFC)}</div>

              {/* Linea di chiusura (stile bilancio) */}
              <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${C.border}`, margin: '4px 0' }}/>

              {/* Margine lordo */}
              <Voce dot={margC}>Margine lordo</Voce>
              <div style={{ ...cellP, color: margC }}>{margPctTot.toFixed(1)}%</div>
              <div style={{ ...cellA, color: margC }}>{fmt0(totMargine)}</div>
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
          <SH sub="Cosa dicono i tuoi dati, generato in automatico">Insights chiave</SH>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,1fr)', gap: 12, alignItems: 'stretch' }}>
            {[...insights].sort((a, b) => ({ critical: 0, warn: 1, ok: 2 }[a.tipo] - { critical: 0, warn: 1, ok: 2 }[b.tipo])).map((ins, i) => {
              const palette = ins.tipo === 'critical'
                ? { bg: C.redLight, fg: C.red, lbl: 'CRITICO', icon: <Icon name="warning" size={14} /> }
                : ins.tipo === 'warn'
                ? { bg: C.amberLight, fg: C.amber, lbl: 'ATTENZIONE', icon: '!' }
                : { bg: C.greenLight, fg: C.green, lbl: 'OK', icon: '✓' }
              return (
                <div key={i} style={{
                  background: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${palette.fg}`,
                  borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12,
                  boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
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

      {/* KPI STRIP
          Audit 2026-06-25: grid responsive (mobile 1col 480px ≤ tablet 2col ≤
          1024 3col ≤ desktop 6col), tile con width:100% + boxSizing:border-box
          per evitare overflow su tablet stretti, minHeight uniformi
          (label 28 / value 32 / sub 16-28). Numeri sempre € dopo cifra via fmt0. */}
      <div style={{ display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2,minmax(0,1fr))' : isTablet ? 'repeat(3,minmax(0,1fr))' : 'repeat(6,minmax(0,1fr))',
        gap: 12, marginBottom: 36 }}>
        {[
          { lbl: 'Prodotti', val: rows.length, sub: 'nel listino', hi: true, tip: 'Numero di prodotti finiti nel listino (esclusi semilavorati e ricette interne).' },
          { lbl: 'Ricavo/stampo', val: fmt0(totRicavo), sub: 'somma tutti i prodotti', color: T.green, tip: 'Somma del ricavo teorico di uno stampo di ciascun prodotto, ai prezzi di listino.' },
          { lbl: 'Food cost tot.', val: fmt0(totFC), sub: `FC ratio ${pct(fcAvg)}`, color: T.brand, tip: 'Costo totale degli ingredienti per uno stampo di ciascun prodotto. FC ratio = food cost ÷ ricavo.' },
          { lbl: 'Margine lordo', val: fmt0(totMargine), sub: `${pct(avgMarg)} medio`, color: margColor(avgMarg), tip: 'Ricavo meno food cost, prima di personale, affitto e utenze. La % è la media dei margini di prodotto.' },
          { lbl: 'Miglior margine', val: best.short, sub: pct(best.margPct), color: T.green, tip: 'Il prodotto con il margine percentuale più alto del listino.' },
          { lbl: 'Da ottimizzare', val: worst.short, sub: pct(worst.margPct), color: T.brand, tip: 'Il prodotto con il margine percentuale più basso: rivedi prezzo o ricetta.' },
        ].map(({ lbl, val, sub, hi, color, tip }, i) => (
          <div key={i} className="fos-tile" style={{
            width: '100%', boxSizing: 'border-box', minWidth: 0,
            background: hi ? T.brand : T.bgCard,
            border: `1px solid ${hi ? T.brandDark : T.border}`, borderRadius: 16,
            padding: '14px 16px',
            display: 'flex', flexDirection: 'column',
            boxShadow: hi ? '0 4px 14px rgba(110,14,26,0.22)' : SHADOW_PREMIUM }}>
            <Tip text={tip} width={240}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'help',
                color: hi ? 'rgba(255,255,255,0.7)' : T.textSoft, marginBottom: 6, minHeight: 28, lineHeight: 1.25,
                borderBottom: `1px dashed ${hi ? 'rgba(255,255,255,0.28)' : 'rgba(155,120,115,0.4)'}` }}>{lbl}</div>
            </Tip>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em',
              color: hi ? T.textOnDark : color || T.text, lineHeight: 1.15, minHeight: 32, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...TNUM }}>{val}</div>
            <div style={{ fontSize: 11, color: hi ? 'rgba(255,255,255,0.62)' : T.textSoft, marginTop: 5, minHeight: 16, maxHeight: 28, overflow: 'hidden', lineHeight: 1.4 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Banda costi azienda + margine netto.
          Mostra il costo mensile dei costi extra-food (consumabili, manutenzione,
          ammortamenti, utenze) configurati dall'utente, e il margine NETTO
          stimato = (totMargine ipotetico mensile * 30) − costi extra.
          NB: stima a margine teorico, non sostituisce un commercialista. */}
      <CostiNettoBanda
        costiAziendali={costiAziendali}
        totMargine={totMargine}
        euro={euro}
        isMobile={isMobile}
      />

      <BarreRicavo rows={rows} euro={euro} pct={pct}/>
      <PLTable rows={rows} euro={euro} pct={pct} totRicavo={totRicavo} totFC={totFC} totMargine={totMargine} fcAvg={fcAvg} avgMarg={avgMarg}/>
      <TopIngredientiTable ricettario={ricettario} ingCosti={ingCosti} euro={euro} pct={pct}/>
      {/* Simulatore Scenari di Prezzo rimosso: duplicato della sezione Food Cost. */}
      <SensTable rows={rows} euro={euro} pct={pct}/>

      {/* Grafici di riepilogo */}
      <SH>Grafici di Riepilogo</SH>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, marginBottom: 28 }}>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', boxShadow: SHADOW_PREMIUM }}>
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
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 4 }}>Ricavo vs Margine per stampo</div>
          {/* Audit 2026-06-25 Recharts style guide: ResponsiveContainer 100%
              + height responsive (mobile 220 / desktop 280), CartesianGrid
              #E5E9EF dashed senza linee verticali, Bar radius [6,6,0,0] e
              stroke brand #6E0E1A, ChartTip condiviso, etichette assi 11/64748B,
              margin responsive. */}
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
            <BarChart
              data={[...rows].sort((a, b) => b.ricavo - a.ricavo)}
              layout="vertical"
              margin={isMobile ? { top: 8, right: 16, left: 8, bottom: 32 } : { top: 12, right: 24, left: 12, bottom: 40 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E9EF" vertical={false} />
              <XAxis type="number" tickFormatter={v => `${Math.round(v).toLocaleString('it-IT')} €`} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="short" width={80} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false}/>
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="ricavo" name="Ricavo" fill={C.green} fillOpacity={0.2} stroke="#6E0E1A" strokeOpacity={0.15} radius={[6, 6, 0, 0]}/>
              <Bar dataKey="margine" name="Margine" stroke="#6E0E1A" strokeOpacity={0.25} radius={[6, 6, 0, 0]}>
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
        <div style={{ background: C.greenLight, border: `1px solid ${C.green}30`, borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.green, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="checkCircle" size={13} />Benchmark pasticceria</div>
          {[['Food cost ideale', '< 28–30%'], ['Margine target', '70–72%'], ['Accettabile', '55–70%']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11 }}>
              <span style={{ color: C.textMid }}>{k}</span><span style={{ color: C.green, fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ background: C.amberLight, border: `1px solid ${C.amber}30`, borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.amber, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="bulb" size={13} />Leve di ottimizzazione</div>
          {[['Aumentare prezzo +0,50€/fetta', 'Margine sale ~8-12pp'], ['Ridurre FC del 10%', 'Negozia bulk'], ['Tagliare prodotti < 50% marg.', 'Sostituisci con migliori']].map(([k, v]) => (
            <div key={k} style={{ padding: '6px 0', fontSize: 10 }}>
              <div style={{ color: C.amber, fontWeight: 700 }}>{k}</div>
              <div style={{ color: C.textMid, lineHeight: 1.4 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      </>)}
    </div>
  )
}

// ── Banda: costi extra-food + margine netto stimato ───────────────────────
// totMargine arriva dalla sezione P&L (ricavo - foodcost per ricetta).
// Il margine NETTO sottrae i costi aziendali extra: consumabili, manutenzione,
// ammortamenti, utenze, ecc. Stima informativa, non sostituisce un commercialista.
function CostiNettoBanda({ costiAziendali, totMargine, euro, isMobile }) {
  const totCostiMensili = (costiAziendali || []).reduce((s, v) => {
    const x = Number(v.importo) || 0
    if (v.periodicita === 'annuale' || v.periodicita === 'una_tantum') return s + x / 12
    return s + x
  }, 0)
  const totCostiAnnui = totCostiMensili * 12
  const margineNetto = totMargine - totCostiMensili
  const margPct = totMargine > 0 ? (margineNetto / totMargine * 100) : 0
  const noConfig = (costiAziendali || []).length === 0
  return (
    <div style={{
      width: '100%', boxSizing: 'border-box',
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: 16, padding: isMobile ? 16 : 20, marginBottom: 28,
      boxShadow: SHADOW_PREMIUM,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Costi extra-food &amp; margine netto stimato</div>
          <div style={{ fontSize: 11.5, color: T.textSoft, marginTop: 2, lineHeight: 1.5 }}>
            {noConfig
              ? 'Aggiungi consumabili, utenze, manutenzione in "Costi aziendali" per vedere il margine netto.'
              : 'Margine lordo meno costi extra (consumabili, manutenzione, ammortamenti, utenze).'
            }
          </div>
        </div>
      </div>
      {/* Audit 2026-06-25: grid responsive con minmax(0,1fr) per evitare che i
          box trasbordino quando i numeri sono lunghi (es. "1.234.567,89 €"). */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(4,minmax(0,1fr))', gap: 12 }}>
        <BoxKpi label="Costi mensili" value={euro(totCostiMensili)} color={T.brand} small />
        <BoxKpi label="Costi annui" value={euro(totCostiAnnui)} color={T.textMid} small />
        <BoxKpi label="Margine lordo (rif.)" value={euro(totMargine)} color={T.textSoft} small />
        <BoxKpi
          label="Margine netto mensile (stima)"
          value={euro(margineNetto)}
          color={margineNetto >= 0 ? T.green : T.brand}
          highlight
        />
      </div>
      {noConfig && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEF9EB', border: '1px solid #FDE68A', borderRadius: 10, fontSize: 12, color: '#78350F' }}>
          Vai in <strong>Andamento &amp; costi → Costi aziendali</strong> per aggiungere i tuoi costi extra-food (fazzoletti, coppette, utenze, manutenzioni).
        </div>
      )}
    </div>
  )
}

function BoxKpi({ label, value, color, highlight, small }) {
  // Audit 2026-06-25: width:100% + boxSizing:border-box + minWidth:0 evita
  // overflow nei grid stretti; minHeight uniformi (label 28, value 32) per
  // allineare i box anche se le etichette vanno su 2 righe.
  return (
    <div style={{
      width: '100%', boxSizing: 'border-box', minWidth: 0,
      padding: small ? '10px 12px' : '14px 16px',
      background: highlight ? '#FEF9EB' : T.bgSubtle,
      border: highlight ? '1px solid #FDE68A' : `1px solid ${T.border}`,
      borderRadius: 10,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, minHeight: 28, lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: small ? 17 : 20, fontWeight: 800, color, ...TNUM, letterSpacing: '-0.02em', minHeight: 32, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}
