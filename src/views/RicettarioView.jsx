// RicettarioView + TortaCard — estratti da Dashboard.jsx.
// TortaCard è il card espandibile usato sia dal Ricettario che dai Semilavorati.

import React, { useEffect, useMemo, useState } from 'react'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
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

const fmt  = v => `${Number(v).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})} €`
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
  // Sort della Distinta costi — click sulle etichette dell'header riordina.
  // Default: costo decrescente (gli ingredienti più cari in cima).
  const [sortKey, setSortKey] = useState('costoCalc')
  const [sortDir, setSortDir] = useState('desc')
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir(key === 'nome' ? 'asc' : 'desc') }
  }

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
  // formatNome: "zucchero_canna" → "Zucchero canna" (underscore→spazio,
  // prima lettera maiuscola, resto minuscolo).
  const formatNome = (s) => {
    if (!s) return ''
    const cleaned = String(s).replace(/_/g, ' ').toLowerCase().trim()
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }
  const ingListBase = (ric.ingredienti || [])
    .filter(ing => !ING_SKIP_DISPLAY.includes(normIng(ing.nome || '').toLowerCase().trim()))
    .map(ing => {
      const c = ingCosti[normIng(ing.nome)]
      const costoCalc = c ? parseFloat((ing.qty1stampo * c.costoG).toFixed(3)) : 0
      return { ...ing, nomeDisplay: formatNome(ing.nome), costoCalc, costoPerGCalc: c?.costoG || 0, pct: fc > 0 ? (costoCalc / fc * 100) : 0, isStima: c?.isStima || false, mancante: !c }
    })
  // Sort sincrono (niente useMemo: siamo dopo l'early return su tipo
  // 'interno', e useMemo violerebbe le rules-of-hooks). N ingredienti per
  // ricetta è < 50 → sort O(n log n) trascurabile.
  const ingList = [...ingListBase].sort((a, b) => {
    if (sortKey === 'nome') {
      const sa = a.nomeDisplay || '', sb = b.nomeDisplay || ''
      return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
    }
    const va = a[sortKey], vb = b[sortKey]
    const na = Number(va) || 0, nb = Number(vb) || 0
    return sortDir === 'asc' ? na - nb : nb - na
  })

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
  // Click sulla zona vuota dell'header → collapse (richiesta UX 26/06):
  // se riclicco la card si richiude. Lo fa solo se il click NON è su un
  // bottone, input, h3 (modifica), label o link — quelli mantengono il
  // loro handler.
  const collapseOnEmptyClick = (e) => {
    if (e.target.closest('button, input, textarea, h3, label, a, svg')) return
    if (open) { setOpen(false); setExpanded(false); return }
    setExpanded(false)
  }
  return (
    <div className={open ? undefined : 'fos-tile'} style={{ background: isSemi ? SEMI.bg : T.bgCard, border: `1px solid ${isSemi ? SEMI.border : T.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: isSemi ? '0 1px 2px rgba(142,68,173,0.05), 0 10px 28px rgba(142,68,173,0.07)' : '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
      {/* Header — cliccabile per chiudere/comprimere */}
      <div onClick={collapseOnEmptyClick} style={{ padding: isMobile ? '14px 16px' : '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderBottom: open ? `1px solid ${isSemi ? SEMI.divider : C.border}` : 'none', cursor: 'pointer' }}>
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

        {/* KPI inline — su mobile occupano tutta la riga (grid 4 col), su desktop
            ognuna ha minWidth 86 così tutti i box hanno la stessa larghezza:
            niente "fisarmonica" tra ricette con margine 1 cifra vs 4 cifre. */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? `repeat(${isSemi ? 3 : 4}, 1fr)` : `repeat(${isSemi ? 3 : 4}, minmax(86px, 1fr))`, gap: isMobile ? 6 : 6, alignItems: 'stretch', flexShrink: 0, flexBasis: isMobile ? '100%' : 'auto', width: isMobile ? '100%' : 'auto' }}>
          {(isSemi ? [
            { lbl: 'Peso batch', val: pesoTotSemi >= 1000 ? `${(Number(pesoTotSemi) / 1000).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : `${Math.round(Number(pesoTotSemi)||0).toLocaleString('it-IT')} g`, c: C.text, bg: SEMI.panel },
            { lbl: 'Costo batch', val: fmt(fc), c: SEMI.accent, bg: SEMI.accentLight, bold: true },
            { lbl: 'Costo / kg', val: fmt(costoGSemi * 1000), c: SEMI.accent, bg: SEMI.accentLight, bold: true },
          ] : [
            // Ordine (26/06): Ricavo, Margine, Margine %, Food cost a destra.
            { lbl: 'Ricavo', val: fmt(ricavo), c: C.text, bg: '#F8F4F2' },
            { lbl: 'Margine', val: fmt(margine), c: mc, bg: mbg, bold: true },
            { lbl: 'Margine %', val: fmtp(margPct), c: mc, bg: mbg, bold: true },
            { lbl: 'Food cost', val: fmt(fc), c: C.red, bg: C.redLight },
          ]).map(({ lbl, val, c, bg, bold }, i) => (
            <div key={i} style={{ background: bg, padding: isMobile ? '7px 6px' : '8px 10px', borderRadius: 8, textAlign: 'center', minWidth: 0, minHeight: 48, display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
              <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 3, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lbl}</div>
              <div style={{ fontSize: isMobile ? 11.5 : 13, fontWeight: bold ? 900 : 700, color: c, ...TNUM, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Actions — su mobile su riga dedicata, bottoni grid 2 colonne uniformi
            con il bottone "Riduci card" full-width sopra come barra principale. */}
        <div style={{ display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? '1fr 1fr' : undefined, gap: 6, alignItems: 'stretch', flexShrink: 0, flexWrap: 'wrap', flexBasis: isMobile ? '100%' : 'auto', width: isMobile ? '100%' : 'auto' }}>
          <button onClick={() => { setExpanded(false); setOpen(false); setEditMode(false) }}
            aria-label="Riduci card"
            title="Riduci"
            style={{ height: isMobile ? 40 : 34, ...(isMobile ? { gridColumn: '1 / -1' } : { width: 34 }), borderRadius: 7, border: `1px solid ${isSemi ? SEMI.border : C.borderStr}`, background: 'transparent', cursor: 'pointer', color: isSemi ? SEMI.accent : C.textMid, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, fontWeight: 700 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
            {isMobile && <span>Riduci</span>}
          </button>
          <button onClick={() => setOpen(o => !o)}
            style={{ height: isMobile ? 40 : 34, padding: '0 12px', borderRadius: 7, border: `1px solid ${isSemi ? SEMI.border : C.borderStr}`, background: 'transparent', fontSize: 11, fontWeight: 700, color: isSemi ? SEMI.accent : C.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            {open ? '▲ Chiudi' : '▼ Dettaglio'}
          </button>
          {!isSemi && (
            <button onClick={() => { setEditPrezzo(reg.prezzo); setEditUnita(reg.unita); setEditMode(e => !e) }}
              style={{ height: isMobile ? 40 : 34, padding: '0 12px', borderRadius: 7, border: `1px solid ${editMode ? C.red : C.borderStr}`, background: editMode ? C.redLight : 'transparent', fontSize: 11, fontWeight: 700, color: editMode ? C.red : C.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Icon name="edit" size={13} /> Prezzo
            </button>
          )}
          {onEdit && (
            <button onClick={() => onEdit(ric.nome)}
              style={{ height: isMobile ? 40 : 34, padding: '0 12px', borderRadius: 7, border: `1px solid ${C.red}`, background: C.red, color: C.white, fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
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
            style={{ height: isMobile ? 40 : 34, padding: '0 12px', borderRadius: 7, border: `1px solid ${isSemi ? SEMI.border : C.borderStr}`, background: 'transparent', fontSize: 11, fontWeight: 700, color: isSemi ? SEMI.accent : C.textMid, cursor: exportingPdf ? 'not-allowed' : 'pointer', opacity: exportingPdf ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, ...(isMobile && isSemi ? { gridColumn: '1 / -1' } : {}) }}>
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
            <input type="number" inputMode="numeric" min="1" max="100" value={editUnita} onChange={e => setEditUnita(e.target.value)}
              style={{ width: isMobile ? 80 : 64, padding: '8px 8px', minHeight: isMobile ? 44 : 'auto', borderRadius: 6, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 12, fontWeight: 700, color: C.text, textAlign: 'center' }}/>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase' }}>€ / {reg.tipo === 'fetta' ? 'fetta' : 'pezzo'}</label>
            <input type="number" inputMode="decimal" min="0" step="0.1" value={editPrezzo} onChange={e => setEditPrezzo(e.target.value)}
              style={{ width: isMobile ? 90 : 72, padding: '8px 8px', minHeight: isMobile ? 44 : 'auto', borderRadius: 6, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 12, fontWeight: 700, color: C.text, textAlign: 'center' }}/>
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
        <div style={{ padding: isMobile ? '16px 14px 20px' : '24px 24px 28px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 0.9fr', gap: isMobile ? 18 : 28, boxSizing: 'border-box', width: '100%', minWidth: 0 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7, letterSpacing: '0.01em' }}><Icon name="receipt" size={14} /> Distinta costi</div>
            {/* Container tabella: overflowX auto + scroll hint a destra (sfumatura)
                per segnalare visivamente che ci sono altre colonne da scrollare.
                minWidth 560 cosi le 5 colonne (Ingr/g/€-g/Costo/%FC) non si
                comprimono troppo su mobile 375px. */}
            <div style={{ position: 'relative', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: isMobile ? 560 : 'auto' }}>
                <thead>
                  <tr style={{ background: '#F8F4F2' }}>
                    {[
                      ['Ingrediente', 'Materia prima usata nella ricetta', 'nome'],
                      ['g / st.', 'Grammi di ingrediente per UNO stampo (o batch) della ricetta', 'qty1stampo'],
                      ['€ / g', "Costo di un grammo dell'ingrediente (prezzo materia prima ÷ 1000 se al kg)", 'costoPerGCalc'],
                      ['Costo', 'Costo di questo ingrediente per uno stampo = g/st. × €/g', 'costoCalc'],
                      ['%FC', 'Peso percentuale di questo ingrediente sul food cost totale della ricetta', 'pct'],
                    ].map(([h, tip, key], i) => {
                      const isActive = sortKey === key
                      const arrow = isActive ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
                      return (
                        <th key={h}
                          onClick={() => toggleSort(key)}
                          style={{ padding: '9px 12px', textAlign: i === 0 ? 'left' : 'right', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isActive ? C.text : C.textSoft, borderBottom: `1px solid ${C.border}`, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                          <Tip text={tip} width={240}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>{h}{arrow}</span>
                          </Tip>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {ingList.map((ing, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: C.text }}>
                        {ing.nomeDisplay}
                        {ing.isStima && <span style={{ fontSize: 7, marginLeft: 4, background: C.amberLight, color: C.amber, padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>stima</span>}
                        {ing.mancante && <span style={{ fontSize: 7, marginLeft: 4, background: C.redLight, color: C.red, padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>n/d</span>}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: C.textMid, ...TNUM, whiteSpace: 'nowrap' }}>{ing.qty1stampo}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: C.textSoft, ...TNUM, fontSize: 9.5, whiteSpace: 'nowrap' }}>{ing.costoPerGCalc > 0 ? ing.costoPerGCalc.toFixed(4) : '—'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: ing.costoCalc > 0 ? C.text : C.textSoft, ...TNUM, whiteSpace: 'nowrap' }}>{ing.costoCalc > 0 ? fmt(ing.costoCalc) : '—'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                        {ing.pct > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <div style={{ width: 44, height: 5, background: '#EEE', borderRadius: 3, flexShrink: 0 }}>
                              <div style={{ width: `${Math.min(100, ing.pct)}%`, height: 5, background: ing.pct > 30 ? C.red : ing.pct > 15 ? C.amber : '#AAB', borderRadius: 3 }}/>
                            </div>
                            <span style={{ fontSize: 9.5, color: C.textMid, width: 30, textAlign: 'right', fontWeight: 700, ...TNUM }}>{ing.pct.toFixed(0)}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {/* TOTALE: stesso padding e textAlign delle celle "Costo" sopra
                      → "2,40 €" del totale è perfettamente incolonnato con i
                      valori "1,32 €", "0,36 €" etc. dei singoli ingredienti.
                      Le 3 colonne a sinistra restano spannate per il label. */}
                  <tr style={{ background: '#F0EAE6', borderTop: `2px solid ${C.borderStr}` }}>
                    <td colSpan={3} style={{ padding: '11px 12px', fontWeight: 800, fontSize: 11, color: C.text, letterSpacing: '0.05em' }}>TOTALE</td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 900, fontSize: 12, color: C.red, ...TNUM, whiteSpace: 'nowrap' }}>{fmt(fc)}</td>
                    <td/>
                  </tr>
                </tfoot>
              </table>
              </div>
              {/* Scroll hint: sfumatura bianco→trasparente sul lato destro per
                  indicare visivamente che si puo' scrollare la tabella. Solo mobile. */}
              {isMobile && (
                <div aria-hidden="true" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 28, pointerEvents: 'none',
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.95) 100%)' }}/>
              )}
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
                    // Grid 3 col: nome (1fr ellipsis) | € (right) | % (right).
                    // Larghezze fisse sulle ultime due → tutti gli € sono uno
                    // sotto l'altro e tutte le % sono uno sotto l'altro.
                    <div key={i} style={{ marginBottom: 10, minHeight: 26 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 78px 44px', alignItems: 'baseline', gap: 10, fontSize: 11, marginBottom: 4 }}>
                        <span style={{ color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{formatNome(ing.nome)}</span>
                        <span style={{ color: C.textMid, fontWeight: 700, ...TNUM, whiteSpace: 'nowrap', textAlign: 'right' }}>{fmt(ing.costoCalc)}</span>
                        <span style={{ color: C.textSoft, fontWeight: 600, ...TNUM, whiteSpace: 'nowrap', textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: col, borderRadius: 3, transition: 'width 320ms cubic-bezier(.32,.72,0,1)' }}/>
                      </div>
                    </div>
                  )
                })}
              </div>
              )
            })()}

            {!isSemi && (
              <div style={{ background: '#F8F4F2', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="money" size={14} /> Conto economico per stampo</div>
                {/* 4 righe perfettamente uniformi:
                    - stessa altezza (44), stesso padding (11×14)
                    - label fontSize 12, value fontSize 15, tutti tabular-nums
                    - allineamento via grid 2col (label flex | value right fixed)
                      → ogni € finisce esattamente nella stessa colonna verticale.
                */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { sign: '+', lbl: 'Ricavo',         val: fmt(ricavo),    c: C.green, bg: C.greenLight, brd: `${C.green}25` },
                    { sign: '−', lbl: 'Food cost',      val: `−${fmt(fc)}`,  c: C.red,   bg: C.redLight,   brd: `${C.red}20` },
                    { sign: '=', lbl: 'Margine lordo',  val: fmt(margine),   c: mc,      bg: mbg,          brd: `${mc}25`, prominent: true },
                    { sign: 'Δ', lbl: 'Margine %',      val: fmtp(margPct),  c: mc,      bg: mbg,          brd: `${mc}25` },
                  ].map((r, i) => (
                    <div key={i} style={{
                      padding: '11px 14px', background: r.bg, border: `1px solid ${r.brd}`, borderRadius: 8,
                      display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', minHeight: 44, columnGap: 12,
                    }}>
                      <span style={{ fontSize: 12, color: r.c, fontWeight: r.prominent ? 800 : 700, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{r.sign} {r.lbl}</span>
                      <span style={{ fontSize: 15, fontWeight: 900, color: r.c, ...TNUM, whiteSpace: 'nowrap', textAlign: 'right' }}>{r.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isSemi && (
              <div style={{ background: '#F8F4F2', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="gift" size={14} /> Per singola {reg.tipo}</div>
                {/* Grid 3 col uniformi: ogni card stesso minHeight + label/value
                    incolonnati. Label fontSize 8.5, value 15, gap 6 dentro la card. */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : '1fr 1fr 1fr', gap: 8 }}>
                  {[
                    { lbl: 'Prezzo',    val: fmt(reg.prezzo), c: C.text },
                    { lbl: 'Food cost', val: fmt(fcUnita),    c: C.red },
                    { lbl: 'Margine',   val: fmt(mrgUnita),   c: mrgUnita > 0 ? C.green : C.red },
                  ].map(({ lbl, val, c }) => (
                    <div key={lbl} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '11px 8px', textAlign: 'center', minHeight: 60, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5 }}>
                      <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSoft, lineHeight: 1 }}>{lbl}</div>
                      <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: 900, color: c, ...TNUM, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isSemi && (
              <div style={{ background: SEMI.panel, borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="bank" size={14} /> Riepilogo batch</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : '1fr 1fr 1fr', gap: 8 }}>
                  {[
                    { lbl: 'Peso totale',   val: pesoTotSemi >= 1000 ? `${(Number(pesoTotSemi) / 1000).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : `${Math.round(Number(pesoTotSemi)||0).toLocaleString('it-IT')} g`, c: C.text },
                    { lbl: 'Costo / kg',    val: fmt(costoGSemi * 1000), c: SEMI.accent },
                    { lbl: 'Costo / 100 g', val: fmt(costoGSemi * 100),  c: SEMI.accent },
                  ].map(({ lbl, val, c }) => (
                    <div key={lbl} style={{ background: C.white, border: `1px solid ${SEMI.divider}`, borderRadius: 7, padding: '11px 8px', textAlign: 'center', minHeight: 60, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5 }}>
                      <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSoft, lineHeight: 1 }}>{lbl}</div>
                      <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: 900, color: c, ...TNUM, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</div>
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
  const isTablet = useIsTablet()
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  const ricette = useMemo(() => Object.values(ricettario?.ricette || {})
    .filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo !== 'interno' && getR(r.nome, r).tipo !== 'semilavorato'), [ricettario])
  const semilavorati = useMemo(() => Object.values(ricettario?.ricette || {})
    .filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo === 'semilavorato'), [ricettario])

  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('margine_desc')
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
      if (sortBy === 'nome_az') return a.nome.localeCompare(b.nome)
      if (sortBy === 'nome_za') return b.nome.localeCompare(a.nome)
      const ra = getR(a.nome, a), rb = getR(b.nome, b)
      const { tot: fca } = calcolaFC(a, ingCosti, ricettario), { tot: fcb } = calcolaFC(b, ingCosti, ricettario)
      const fcpa = fca / (ra.unita * ra.prezzo || 1)
      const fcpb = fcb / (rb.unita * rb.prezzo || 1)
      if (sortBy === 'fc_asc')  return fcpa - fcpb
      if (sortBy === 'fc_desc') return fcpb - fcpa
      const ma = ra.unita * ra.prezzo > 0 ? ((ra.unita * ra.prezzo - fca) / (ra.unita * ra.prezzo) * 100) : 0
      const mb = rb.unita * rb.prezzo > 0 ? ((rb.unita * rb.prezzo - fcb) / (rb.unita * rb.prezzo) * 100) : 0
      if (sortBy === 'margine_asc') return ma - mb
      return mb - ma // margine_desc (default)
    })
    return arr
  }, [ricette, search, sortBy, ingCosti, ricettario])

  // Bottone Aggiorna come elemento riusabile: lo posizioniamo in alto a destra
  // (allineato visivamente con il sede selector nella topbar) E lo passiamo a
  // PageTitleHero come 'action' per averli sulla stessa riga del titolo.
  const aggiornaBtn = onUpload && (
    <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px',
      background: T.brandGradient, borderRadius: R.md, cursor: 'pointer',
      fontSize: 13, fontWeight: 700, color: '#fff', boxShadow: S.brandSoft,
      whiteSpace: 'nowrap', alignSelf: isMobile ? 'stretch' : 'auto', flexShrink: 0 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      Aggiorna {LEX.Ricettario.toLowerCase()}
      <input type="file" accept=".xlsx" multiple style={{ display: 'none' }} onChange={e => e.target.files.length && onUpload(Array.from(e.target.files))}/>
    </label>
  )

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
          {aggiornaBtn}
        </div>

        {ricette.length > 0 && (() => {
          const ric = ricette.length, semi = semilavorati.length
          const subRicette = semi > 0
            ? `+ ${semi} semilavorat${semi === 1 ? 'o' : 'i'} (${ric + semi} voci totali)`
            : 'menu attivo'
          return (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: isMobile ? 10 : 16 }}>
              <KPI label={LEX.ricette} value={ric} icon={<Icon name="gift" size={18} />} color={T.text} sub={subRicette} />
              <KPI label="Food cost medio" value={`${(fcMedio * 100).toFixed(1)}%`} icon={<Icon name="barChart" size={18} />}
                color={fcMedio < 0.30 ? T.green : fcMedio < 0.35 ? T.amber : T.brand}
                sub={fcMedio < 0.30 ? 'sotto controllo' : fcMedio < 0.35 ? 'da monitorare' : 'alto — rivedere'} />
              <KPI label="Semilavorati" value={semi} icon={<Icon name="gift" size={18} />} color="#8E44AD" sub="basi e impasti interni" />
            </div>
          )
        })()}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isMobile ? 16 : 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Cerca ${LEX.ricetta}…`}
            style={{ width: '100%', padding: '10px 12px', minHeight: isMobile || isTablet ? 44 : 'auto', border: `1px solid ${T.border}`, borderRadius: R.md,
              fontSize: isMobile || isTablet ? 16 : 13, color: T.text, background: T.bgCard, outline: 'none', fontFamily: 'inherit',
              boxSizing: 'border-box', boxShadow: S.xs }}/>
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: '10px 32px 10px 12px', minHeight: isMobile || isTablet ? 44 : 'auto', border: `1px solid ${T.border}`, borderRadius: R.md,
            fontSize: isMobile || isTablet ? 16 : 13, color: T.text, background: T.bgCard, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}>
          <option value="margine_desc">Margine ↓</option>
          <option value="margine_asc">Margine ↑</option>
          <option value="fc_asc">Food cost ↑</option>
          <option value="fc_desc">Food cost ↓</option>
          <option value="nome_az">Nome A → Z</option>
          <option value="nome_za">Nome Z → A</option>
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
                {/* Ordine richiesto (26/06): MARGINE a sinistra, FOOD COST a destra.
                    Label "Food cost" per esteso (non più "FC" criptico). */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ padding: '10px 12px', background: T.bgSubtle, borderRadius: R.md }}>
                    <div style={{ fontSize: 10, color: T.textSoft, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Margine</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: mC, ...TNUM }}>{marg.toFixed(0)}%</div>
                  </div>
                  <div style={{ padding: '10px 12px', background: T.bgSubtle, borderRadius: R.md }}>
                    <div title="Food Cost: rapporto costo ingredienti / ricavo. Target tipico 25-35% in pasticceria, 22-30% in gelateria." style={{ fontSize: 10, color: T.textSoft, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, cursor: 'help' }}>Food cost</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: fC, ...TNUM }}>{fcPct.toFixed(0)}%</div>
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
