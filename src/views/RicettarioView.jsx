// RicettarioView + TortaCard — estratti da Dashboard.jsx.
// TortaCard è il card espandibile usato sia dal Ricettario che dai Semilavorati.

import React, { useEffect, useMemo, useState } from 'react'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import {
  buildIngCosti, calcolaFC, getR, isRicettaValida, normIng, REGOLE,
} from '../lib/foodcost'
import { ALLERGENI, ALLERGENE_COLORS } from '../lib/allergeni'
import { lessico } from '../lib/lessico'
import { exportRicettaPDF } from '../lib/exportPDF'
import { gateExport, getExportCtx } from '../lib/exportGuard'
import Icon from '../components/Icon'
import {
  C, TNUM, margColor, margBadge, Badge, Tip, KPI,
} from './_shared'

const fmt  = v => `€ ${Number(v).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmtp = v => `${Number(v).toFixed(1)}%`
const PIE_COLORS = [C.red, '#E07040', '#D4A030', '#5B8FCE', '#7B7B7B', '#A0522D']

// ─── TortaCard ───────────────────────────────────────────────────────────────
function TortaCard({ ric, ingCosti, ricettario, onUpdateRegola, onEdit, variant = 'ricetta' }) {
  // Audit 2026-06-22 CRITICAL: TUTTI gli hook DEVONO essere chiamati prima
  // dell'early return (regole React). Il vecchio codice metteva 3 useState +
  // 1 useEffect DOPO `if (reg.tipo === 'interno') return null` → hook order
  // diverso tra render → silent state corruption.
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  // Audit 2026-06-24: card collapsed di default — su mobile e desktop.
  // L'utente vede solo nome + 1 KPI essenziale; al tap si espande l'header
  // pieno con KPI inline + bottoni. Riduce "minestrone" visivo richiesto
  // dal design partner.
  const [expanded, setExpanded] = useState(false)
  const reg = getR(ric.nome, ric)
  const isSemi = variant === 'semilavorato' || reg.tipo === 'semilavorato'

  const [editPrezzo, setEditPrezzo] = useState(reg.prezzo)
  const [editUnita, setEditUnita] = useState(reg.unita)
  const [exportingPdf, setExportingPdf] = useState(false)

  // Reset state quando cambia ricetta (impersonation admin / cambio org).
  useEffect(() => {
    setEditPrezzo(reg.prezzo)
    setEditUnita(reg.unita)
  }, [ric.nome, reg.prezzo, reg.unita])

  // Early return DOPO tutti gli hook.
  if (reg.tipo === 'interno') return null

  const handleSaveRegola = () => {
    const p = parseFloat(editPrezzo) || reg.prezzo
    const u = parseInt(editUnita) || reg.unita
    // Audit 2026-07-01 HIGH: non mutare il singleton REGOLE — onUpdateRegola
    // persiste il dato nella ricetta, getR lo legge da li. Mutare REGOLE
    // significa inquinare org B dopo impersonation di org A.
    onUpdateRegola(ric.nome, { prezzo: p, unita: u })
    setEditMode(false)
  }

  const { tot: fc, mancanti } = calcolaFC(ric, ingCosti, ricettario)
  const ricavo = parseFloat((reg.unita * reg.prezzo).toFixed(2))
  const margine = parseFloat((ricavo - fc).toFixed(2))
  const margPct = ricavo > 0 ? (margine / ricavo * 100) : 0
  const fcUnita = reg.unita > 0 ? fc / reg.unita : 0
  const mrgUnita = reg.prezzo - fcUnita
  const mc = margColor(margPct)
  const mbg = margPct >= 60 ? C.greenLight : margPct >= 40 ? C.amberLight : C.redLight

  const pesoTotSemi = (ric.ingredienti || []).reduce((s, i) => s + (i.qty1stampo || 0), 0)
  const costoGSemi = pesoTotSemi > 0 ? fc / pesoTotSemi : 0

  const SEMI = { bg: '#FAF6FF', border: '#C9A4DC', accent: '#8E44AD', accentLight: '#F0E4FA', panel: '#F5F0FA', divider: '#E5D4F0' }

  const ING_SKIP_DISPLAY = ['ingrediente', 'ingredient', 'ingredienti', 'n/d', 'nan', 'undefined', 'nome ingrediente in minuscolo']
  const ingList = (ric.ingredienti || [])
    .filter(ing => !ING_SKIP_DISPLAY.includes(normIng(ing.nome || '').toLowerCase().trim()))
    .map(ing => {
      const c = ingCosti[normIng(ing.nome)]
      const costoCalc = c ? parseFloat((ing.qty1stampo * c.costoG).toFixed(3)) : 0
      return { ...ing, costoCalc, costoPerGCalc: c?.costoG || 0, pct: fc > 0 ? (costoCalc / fc * 100) : 0, isStima: c?.isStima || false, mancante: !c }
    }).sort((a, b) => b.costoCalc - a.costoCalc)

  const pieRaw = ingList.filter(i => i.costoCalc > 0).slice(0, 5)
  const resto = fc - pieRaw.reduce((s, i) => s + i.costoCalc, 0)
  const pieData = [...pieRaw, ...(resto > 0.01 ? [{ nome: 'Altri', costoCalc: parseFloat(resto.toFixed(3)) }] : [])]

  // ─── Card COLLAPSED ───────────────────────────────────────────────
  // Mostra solo: nome + badge qualità + 1 KPI chiave (Margine % per ricette,
  // Costo/kg per semilavorati) + chevron. Tap → espande l'header pieno.
  if (!expanded) {
    const kpiPrim = isSemi
      ? { lbl: 'Costo / kg', val: fmt(costoGSemi * 1000), c: SEMI.accent }
      : { lbl: 'Margine', val: fmtp(margPct), c: mc }
    const kpiSec = isSemi
      ? { lbl: 'Peso batch', val: pesoTotSemi >= 1000 ? `${(Number(pesoTotSemi) / 1000).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : `${Math.round(Number(pesoTotSemi)||0).toLocaleString('it-IT')} g`, c: C.text }
      : { lbl: 'Ricavo', val: fmt(ricavo), c: C.text }
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(true)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(true) } }}
        className="fos-tile"
        style={{
          background: isSemi ? SEMI.bg : T.bgCard, border: `1px solid ${isSemi ? SEMI.border : T.border}`,
          borderRadius: 18, overflow: 'hidden', cursor: 'pointer',
          boxShadow: isSemi ? '0 1px 2px rgba(142,68,173,0.05), 0 10px 28px rgba(142,68,173,0.07)' : '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
          padding: isMobile ? '14px 16px' : '14px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            {isSemi && (
              <span style={{ padding: '2px 7px', borderRadius: 5, background: SEMI.accentLight, color: SEMI.accent, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Semilavorato</span>
            )}
            {!isSemi && margBadge(margPct)}
            {mancanti.length > 0 && (
              <Badge label={`${mancanti.length} stime`} color="amber"/>
            )}
          </div>
          <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ric.nome}
          </div>
          <div style={{ fontSize: 11, color: C.textSoft, marginTop: 3, ...TNUM }}>
            {kpiSec.lbl}: <span style={{ color: C.textMid, fontWeight: 700 }}>{kpiSec.val}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, lineHeight: 1 }}>{kpiPrim.lbl}</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: kpiPrim.c, marginTop: 4, ...TNUM, lineHeight: 1 }}>{kpiPrim.val}</div>
        </div>
        <div style={{ flexShrink: 0, color: C.textSoft, lineHeight: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    )
  }

  // ─── Card EXPANDED (header pieno + dettaglio opzionale) ─────────────
  return (
    <div className={open ? undefined : 'fos-tile'} style={{ background: isSemi ? SEMI.bg : T.bgCard, border: `1px solid ${isSemi ? SEMI.border : T.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: isSemi ? '0 1px 2px rgba(142,68,173,0.05), 0 10px 28px rgba(142,68,173,0.07)' : '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
      {/* Header */}
      <div style={{ padding: isMobile ? '14px 16px' : '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderBottom: open ? `1px solid ${isSemi ? SEMI.divider : C.border}` : 'none' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            {isSemi && (
              <span style={{ padding: '3px 8px', borderRadius: 5, background: SEMI.accentLight, color: SEMI.accent, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', lineHeight: 1.2 }}>Semilavorato</span>
            )}
            <h3 onClick={onEdit ? () => onEdit(ric.nome) : undefined}
              style={{ margin: 0, fontSize: isMobile ? 15 : 16, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', cursor: onEdit ? 'pointer' : 'default', lineHeight: 1.25 }}>
              {ric.nome}
            </h3>
          </div>
          {/* Etichette qualità/avvisi su riga dedicata: così restano allineate
              nella stessa posizione sotto ogni gusto, indipendentemente dalla
              lunghezza del nome. */}
          {(!isSemi || mancanti.length > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 5, minHeight: 22 }}>
              {!isSemi && (
                <Tip text={`Margine: ${fmtp(margPct)}. Ricavo ${fmt(ricavo)} − FC ${fmt(fc)}.`} width={260}>{margBadge(margPct)}</Tip>
              )}
              {mancanti.length > 0 && (
                <Tip text="Alcuni ingredienti non hanno prezzo reale: FC calcolato su stime HoReCa." width={280}><Badge label={`${mancanti.length} prezzi stimati`} color="amber"/></Tip>
              )}
            </div>
          )}
          <div style={{ fontSize: 11, color: C.textSoft, lineHeight: 1.4 }}>
            {isSemi
              ? `Base interna · ${pesoTotSemi >= 1000 ? `${(Number(pesoTotSemi) / 1000).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : `${Math.round(Number(pesoTotSemi)||0).toLocaleString('it-IT')} g`} per batch${ric.totImpasto1 > 0 ? ` · ${ric.totImpasto1}g impasto` : ''}`
              : `${reg.unita} ${reg.tipo === 'fetta' ? 'fette' : 'pezzi'} × ${fmt(reg.prezzo)}${ric.totImpasto1 > 0 ? ` · ${ric.totImpasto1}g impasto` : ''}`}
          </div>
          {(ric.allergeni || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {(ric.allergeni || []).map(aid => {
                const a = ALLERGENI.find(x => x.id === aid)
                if (!a) return null
                return (
                  <span key={aid} style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `${ALLERGENE_COLORS[aid]}18`, color: ALLERGENE_COLORS[aid], border: `1px solid ${ALLERGENE_COLORS[aid]}40` }}>
                    {a.label}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* KPI inline */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          {(isSemi ? [
            { lbl: 'Peso batch', val: pesoTotSemi >= 1000 ? `${(Number(pesoTotSemi) / 1000).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : `${Math.round(Number(pesoTotSemi)||0).toLocaleString('it-IT')} g`, c: C.text, bg: SEMI.panel },
            { lbl: 'Costo batch', val: fmt(fc), c: SEMI.accent, bg: SEMI.accentLight, bold: true },
            { lbl: 'Costo / kg', val: fmt(costoGSemi * 1000), c: SEMI.accent, bg: SEMI.accentLight, bold: true },
          ] : [
            { lbl: 'Ricavo', val: fmt(ricavo), c: C.text, bg: '#F8F4F2' },
            { lbl: 'Food Cost', val: fmt(fc), c: C.red, bg: C.redLight },
            { lbl: 'Margine', val: fmt(margine), c: mc, bg: mbg, bold: true },
            { lbl: 'Margine %', val: fmtp(margPct), c: mc, bg: mbg, bold: true },
          ]).map(({ lbl, val, c, bg, bold }, i) => (
            <div key={i} style={{ background: bg, padding: '7px 12px', borderRadius: 8, textAlign: 'center', minWidth: 72, height: 46, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 2, lineHeight: 1 }}>{lbl}</div>
              <div style={{ fontSize: 12.5, fontWeight: bold ? 900 : 700, color: c, ...TNUM, lineHeight: 1.1 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
          <button onClick={() => { setExpanded(false); setOpen(false); setEditMode(false) }}
            aria-label="Riduci card"
            title="Riduci"
            style={{ height: 34, width: 34, borderRadius: 7, border: `1px solid ${isSemi ? SEMI.border : C.borderStr}`, background: 'transparent', cursor: 'pointer', color: isSemi ? SEMI.accent : C.textMid, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button onClick={() => setOpen(o => !o)}
            style={{ height: 34, padding: '0 12px', borderRadius: 7, border: `1px solid ${isSemi ? SEMI.border : C.borderStr}`, background: 'transparent', fontSize: 11, fontWeight: 700, color: isSemi ? SEMI.accent : C.textMid, cursor: 'pointer' }}>
            {open ? '▲ Chiudi dettaglio' : '▼ Dettaglio'}
          </button>
          {!isSemi && (
            <button onClick={() => { setEditPrezzo(reg.prezzo); setEditUnita(reg.unita); setEditMode(e => !e) }}
              style={{ height: 34, padding: '0 12px', borderRadius: 7, border: `1px solid ${editMode ? C.red : C.borderStr}`, background: editMode ? C.redLight : 'transparent', fontSize: 11, fontWeight: 700, color: editMode ? C.red : C.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Icon name="edit" size={13} /> Prezzo
            </button>
          )}
          {onEdit && (
            <button onClick={() => onEdit(ric.nome)}
              style={{ height: 34, padding: '0 12px', borderRadius: 7, border: `1px solid ${C.red}`, background: C.red, color: C.white, fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Icon name="edit" size={13} /> Modifica
            </button>
          )}
          <button onClick={async () => {
            // Audit 2026-07-01 MEDIUM: prevenire doppio PDF su double-click.
            if (exportingPdf) return
            setExportingPdf(true)
            try {
              if (!(await gateExport('ricettario', { nome: ric.nome }, window.__foodos_notify))) return
              const c = getExportCtx()
              exportRicettaPDF(ric, { tot: fc, perc: ricavo > 0 ? fc / ricavo * 100 : 0 }, ingCosti, c.nomeAttivita, c.email)
            } finally { setExportingPdf(false) }
          }}
            disabled={exportingPdf}
            style={{ height: 34, padding: '0 12px', borderRadius: 7, border: `1px solid ${isSemi ? SEMI.border : C.borderStr}`, background: 'transparent', fontSize: 11, fontWeight: 700, color: isSemi ? SEMI.accent : C.textMid, cursor: exportingPdf ? 'not-allowed' : 'pointer', opacity: exportingPdf ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Icon name="fileText" size={13} /> {exportingPdf ? '…' : 'PDF'}
          </button>
        </div>
      </div>

      {/* Edit inline */}
      {editMode && (
        <div style={{ padding: '14px 24px', background: '#FFF8F7', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Modifica prezzo / {reg.tipo === 'fetta' ? 'fette' : 'pezzi'}:</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase' }}>N°</label>
            <input type="number" min="1" max="100" value={editUnita} onChange={e => setEditUnita(e.target.value)}
              style={{ width: 64, padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.borderStr}`, fontSize: 12, fontWeight: 700, color: C.text, textAlign: 'center' }}/>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase' }}>€ / {reg.tipo === 'fetta' ? 'fetta' : 'pezzo'}</label>
            <input type="number" min="0" step="0.1" value={editPrezzo} onChange={e => setEditPrezzo(e.target.value)}
              style={{ width: 72, padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.borderStr}`, fontSize: 12, fontWeight: 700, color: C.text, textAlign: 'center' }}/>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: C.white, borderRadius: 7, border: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 10, color: C.textSoft }}>Ricavo stimato:</span>
            <span style={{ fontSize: 13, fontWeight: 900, color: C.green, ...TNUM }}>{fmt((parseFloat(editPrezzo) || 0) * (parseInt(editUnita) || 0))}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button onClick={() => setEditMode(false)} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: 11, fontWeight: 700, color: C.textMid, cursor: 'pointer' }}>Annulla</button>
            <button onClick={handleSaveRegola} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: C.red, color: C.white, fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="save" size={13} /> Salva</button>
          </div>
        </div>
      )}

      {/* Dettaglio aperto */}
      {open && (
        <div style={{ padding: '24px 24px 28px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 0.9fr', gap: 28 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="receipt" size={14} /> Distinta costi</div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#F8F4F2' }}>
                    {[
                      ['Ingrediente', 'Materia prima usata nella ricetta'],
                      ['g / st.', 'Grammi di ingrediente per UNO stampo (o batch) della ricetta'],
                      ['€ / g', "Costo di un grammo dell'ingrediente (prezzo materia prima ÷ 1000 se al kg)"],
                      ['Costo', 'Costo di questo ingrediente per uno stampo = g/st. × €/g'],
                      ['%FC', 'Peso percentuale di questo ingrediente sul food cost totale della ricetta'],
                    ].map(([h, tip], i) => (
                      <th key={h} title={tip}
                        style={{ padding: '8px 10px', textAlign: i === 0 ? 'left' : 'right', fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, cursor: 'help', textDecoration: i === 0 ? 'none' : 'underline dotted', textUnderlineOffset: 3 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ingList.map((ing, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: C.text }}>
                        {ing.nome}
                        {ing.isStima && <span style={{ fontSize: 7, marginLeft: 4, background: C.amberLight, color: C.amber, padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>stima</span>}
                        {ing.mancante && <span style={{ fontSize: 7, marginLeft: 4, background: C.redLight, color: C.red, padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>n/d</span>}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: C.textMid, fontFamily: "'JetBrains Mono', monospace" }}>{ing.qty1stampo}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: C.textSoft, fontFamily: "'JetBrains Mono', monospace", fontSize: 9 }}>{ing.costoPerGCalc > 0 ? ing.costoPerGCalc.toFixed(4) : '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: ing.costoCalc > 0 ? C.text : C.textSoft }}>{ing.costoCalc > 0 ? fmt(ing.costoCalc) : '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {ing.pct > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <div style={{ width: 40, height: 5, background: '#EEE', borderRadius: 3 }}>
                              <div style={{ width: `${Math.min(100, ing.pct)}%`, height: 5, background: ing.pct > 30 ? C.red : ing.pct > 15 ? C.amber : '#AAB', borderRadius: 3 }}/>
                            </div>
                            <span style={{ fontSize: 9, color: C.textMid, width: 28, textAlign: 'right', fontWeight: 600 }}>{ing.pct.toFixed(0)}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F0EAE6', borderTop: `2px solid ${C.borderStr}` }}>
                    <td colSpan={3} style={{ padding: '10px 10px', fontWeight: 800, fontSize: 11, color: C.text }}>TOTALE</td>
                    <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 900, fontSize: 13, color: C.red, ...TNUM }}>{fmt(fc)}</td>
                    <td/>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {pieData.length > 0 && (() => {
              const totPie = pieData.reduce((s, x) => s + (x.costoCalc || 0), 0) || 1
              return (
              <div style={{ background: '#F8F4F2', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="barChart" size={14} /> Composizione food cost</div>
                {pieData.map((ing, i) => {
                  const pct = ing.costoCalc / totPie * 100
                  const col = PIE_COLORS[i % PIE_COLORS.length]
                  return (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 10, marginBottom: 3 }}>
                        <span style={{ color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ing.nome}</span>
                        <span style={{ color: C.textMid, fontWeight: 700, flexShrink: 0, ...TNUM }}>{fmt(ing.costoCalc)} · {pct.toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 6, background: '#EAE0DB', borderRadius: 3 }}>
                        <div style={{ height: 6, width: `${Math.min(100, pct)}%`, background: col, borderRadius: 3 }}/>
                      </div>
                    </div>
                  )
                })}
              </div>
              )
            })()}

            {!isSemi && (
              <div style={{ background: '#F8F4F2', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="money" size={14} /> Conto economico per stampo</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ padding: '10px 14px', background: C.greenLight, border: `1px solid ${C.green}25`, borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>+ Ricavo</span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: C.green, ...TNUM }}>{fmt(ricavo)}</span>
                  </div>
                  <div style={{ padding: '10px 14px', background: C.redLight, border: `1px solid ${C.red}20`, borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: C.red, fontWeight: 700 }}>− Food cost</span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: C.red, ...TNUM }}>−{fmt(fc)}</span>
                  </div>
                  <div style={{ padding: '12px 14px', background: mbg, border: `1px solid ${mc}25`, borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: mc, fontWeight: 800 }}>= Margine lordo</span>
                      <span style={{ fontSize: 18, fontWeight: 900, color: mc, ...TNUM }}>{fmt(margine)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: C.textMid }}>Margine %</span>
                      <span style={{ fontWeight: 700, color: mc }}>{fmtp(margPct)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!isSemi && (
              <div style={{ background: '#F8F4F2', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="gift" size={14} /> Per singola {reg.tipo}</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 8 }}>
                  {[
                    { lbl: 'Prezzo', val: fmt(reg.prezzo), c: C.text },
                    { lbl: 'Food cost', val: fmt(fcUnita), c: C.red },
                    { lbl: 'Margine', val: fmt(mrgUnita), c: mrgUnita > 0 ? C.green : C.red },
                  ].map(({ lbl, val, c }) => (
                    <div key={lbl} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 4 }}>{lbl}</div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: c, ...TNUM }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isSemi && (
              <div style={{ background: SEMI.panel, borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="bank" size={14} /> Riepilogo batch</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 8 }}>
                  {[
                    { lbl: 'Peso totale', val: pesoTotSemi >= 1000 ? `${(Number(pesoTotSemi) / 1000).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : `${Math.round(Number(pesoTotSemi)||0).toLocaleString('it-IT')} g`, c: C.text },
                    { lbl: 'Costo / kg', val: fmt(costoGSemi * 1000), c: SEMI.accent },
                    { lbl: 'Costo / 100 g', val: fmt(costoGSemi * 100), c: SEMI.accent },
                  ].map(({ lbl, val, c }) => (
                    <div key={lbl} style={{ background: C.white, border: `1px solid ${SEMI.divider}`, borderRadius: 7, padding: '10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 4 }}>{lbl}</div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: c, ...TNUM }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── RicettarioView ──────────────────────────────────────────────────────────
export default function RicettarioView({ ricettario, onUpdateRegola, onUpload, onEditRicetta, LEX = lessico() }) {
  const isMobile = useIsMobile()
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  const ricette = useMemo(() => Object.values(ricettario?.ricette || {})
    .filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo !== 'interno' && getR(r.nome, r).tipo !== 'semilavorato'), [ricettario])
  const semilavorati = useMemo(() => Object.values(ricettario?.ricette || {})
    .filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo === 'semilavorato'), [ricettario])

  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('margine')
  const [gridView, setGridView] = useState(false)

  const fcMedio = ricette.length === 0 ? 0 : (() => {
    let tot = 0, cnt = 0
    for (const ric of ricette) {
      const reg = getR(ric.nome, ric)
      if (!reg.unita || !reg.prezzo) continue
      const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
      const ricavo = reg.unita * reg.prezzo
      if (ricavo > 0) { tot += fc / ricavo; cnt++ }
    }
    return cnt > 0 ? tot / cnt : 0
  })()

  const filtered = useMemo(() => {
    let arr = ricette.filter(r => r.nome.toLowerCase().includes(search.toLowerCase()))
    arr = [...arr].sort((a, b) => {
      if (sortBy === 'nome') return a.nome.localeCompare(b.nome)
      const ra = getR(a.nome, a), rb = getR(b.nome, b)
      const { tot: fca } = calcolaFC(a, ingCosti, ricettario), { tot: fcb } = calcolaFC(b, ingCosti, ricettario)
      if (sortBy === 'fc') return (fca / (ra.unita * ra.prezzo || 1)) - (fcb / (rb.unita * rb.prezzo || 1))
      const ma = ra.unita * ra.prezzo > 0 ? ((ra.unita * ra.prezzo - fca) / (ra.unita * ra.prezzo) * 100) : 0
      const mb = rb.unita * rb.prezzo > 0 ? ((rb.unita * rb.prezzo - fcb) / (rb.unita * rb.prezzo) * 100) : 0
      return mb - ma
    })
    return arr
  }, [ricette, search, sortBy, ingCosti, ricettario])

  return (
    <div onContextMenu={e => e.preventDefault()} onDragStart={e => e.preventDefault()}
      style={{ maxWidth: 1200, margin: '0 auto', userSelect: 'none' }}>
      <div style={{ marginBottom: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'flex-end', justifyContent: 'space-between', gap: isMobile ? 12 : 14, marginBottom: ricette.length > 0 ? 18 : 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.5, fontWeight: 500 }}>
              {ricette.length > 0
                ? <>Margini e food cost di ogni {LEX.ricetta}, ricalcolati sui prezzi delle materie prime.</>
                : LEX.nessunaRicetta}
            </div>
          </div>
          {onUpload && (
            <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px',
              background: T.brandGradient, borderRadius: R.md, cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: '#fff', boxShadow: S.brandSoft,
              whiteSpace: 'nowrap', alignSelf: isMobile ? 'stretch' : 'auto' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Aggiorna {LEX.Ricettario.toLowerCase()}
              <input type="file" accept=".xlsx" multiple style={{ display: 'none' }} onChange={e => e.target.files.length && onUpload(Array.from(e.target.files))}/>
            </label>
          )}
        </div>

        {ricette.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3,1fr)', gap: isMobile ? 10 : 16 }}>
            <KPI label={LEX.ricette} value={ricette.length} icon={<Icon name="gift" size={18} />} color={T.text} sub={`${Object.keys(ricettario?.ricette || {}).length} voci totali`} />
            <KPI label="Food cost medio" value={`${(fcMedio * 100).toFixed(1)}%`} icon={<Icon name="barChart" size={18} />}
              color={fcMedio < 0.30 ? T.green : fcMedio < 0.35 ? T.amber : T.brand}
              sub={fcMedio < 0.30 ? 'sotto controllo' : fcMedio < 0.35 ? 'da monitorare' : 'alto — rivedere'} />
            <KPI label="Semilavorati" value={semilavorati.length} icon={<Icon name="gift" size={18} />} color="#8E44AD" sub="basi e impasti interni" />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isMobile ? 16 : 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Cerca ${LEX.ricetta}…`}
            style={{ width: '100%', padding: '10px 12px', border: `1px solid ${T.border}`, borderRadius: R.md,
              fontSize: 13, color: T.text, background: T.bgCard, outline: 'none', fontFamily: 'inherit',
              boxSizing: 'border-box', boxShadow: S.xs }}/>
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: '10px 32px 10px 12px', border: `1px solid ${T.border}`, borderRadius: R.md,
            fontSize: 13, color: T.text, background: T.bgCard, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}>
          <option value="margine">Margine ↓</option>
          <option value="fc">Food cost ↑</option>
          <option value="nome">Nome A-Z</option>
        </select>
        <div style={{ display: 'flex', gap: 2, padding: 3, background: T.bgSubtle, borderRadius: R.md }}>
          <button onClick={() => setGridView(false)} style={{ width: 34, height: 32, padding: 0, border: 'none', borderRadius: R.sm, background: !gridView ? T.bgCard : 'transparent', cursor: 'pointer', color: !gridView ? T.text : T.textSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <button onClick={() => setGridView(true)} style={{ width: 34, height: 32, padding: 0, border: 'none', borderRadius: R.sm, background: gridView ? T.bgCard : 'transparent', cursor: 'pointer', color: gridView ? T.text : T.textSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </button>
        </div>
      </div>

      {ricette.length > 0 && filtered.length === 0 && (
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl, padding: '40px 24px', textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 14, color: T.text, fontWeight: 500, marginBottom: 4 }}>Nessun risultato</div>
          <div style={{ fontSize: 13, color: T.textSoft }}>Prova con un altro termine.</div>
        </div>
      )}

      {filtered.length > 0 && (gridView ? (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 32 }}>
          {filtered.map(ric => {
            const reg = getR(ric.nome, ric)
            const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
            const ricavo = reg.prezzo * reg.unita
            const marg = ricavo > 0 ? (ricavo - fc) / ricavo * 100 : 0
            const fcPct = ricavo > 0 ? fc / ricavo * 100 : 0
            const mC = marg >= 60 ? T.green : marg >= 40 ? T.amber : T.brand
            const fC = fcPct <= 30 ? T.green : fcPct <= 40 ? T.amber : T.brand
            return (
              <div key={ric.nome} className="fos-tile" onClick={() => onEditRicetta && onEditRicetta(ric.nome)}
                style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{ric.nome}</div>
                  <div style={{ fontSize: 11, color: T.textSoft, marginTop: 2, ...TNUM }}>{reg.unita || '?'} {reg.tipo || 'pz'} · {fmt(reg.prezzo)}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ padding: '10px 12px', background: T.bgSubtle, borderRadius: R.md }}>
                    <div title="Food Cost: rapporto costo ingredienti / ricavo. Target tipico 25-35% in pasticceria, 22-30% in gelateria." style={{ fontSize: 10, color: T.textSoft, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, cursor: 'help' }}>FC</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: fC, ...TNUM }}>{fcPct.toFixed(0)}%</div>
                  </div>
                  <div style={{ padding: '10px 12px', background: T.bgSubtle, borderRadius: R.md }}>
                    <div style={{ fontSize: 10, color: T.textSoft, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Margine</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: mC, ...TNUM }}>{marg.toFixed(0)}%</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
          {filtered.map(ric => <TortaCard key={ric.nome} ric={ric} ingCosti={ingCosti} ricettario={ricettario} onUpdateRegola={onUpdateRegola} onEdit={onEditRicetta}/>)}
        </div>
      ))}

      {semilavorati.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, paddingTop: 24, borderTop: `1px solid ${T.borderSoft}` }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>Semilavorati</h2>
              <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2 }}>Impasti, creme e basi interne</div>
            </div>
            <span style={{ padding: '4px 10px', borderRadius: 999, background: '#F5EBFB', color: '#8E44AD', fontSize: 11, fontWeight: 600 }}>{semilavorati.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {semilavorati.map(ric => (
              <TortaCard key={ric.nome} ric={ric} ingCosti={ingCosti} ricettario={ricettario} onUpdateRegola={onUpdateRegola} onEdit={onEditRicetta} variant="semilavorato"/>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
