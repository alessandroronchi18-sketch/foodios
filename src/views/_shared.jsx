// Primitive condivise tra le view estratte da Dashboard.jsx.
// Sono volutamente piccole e isolate per evitare il "monolite delle utility".
// Una volta che tutto è migrato, alcune potranno diventare componenti dedicati in components/.

import React, { useState, useRef, useCallback } from 'react'
import { color as T } from '../lib/theme'

// Palette "C.*" usata dal vecchio Dashboard.jsx — mappa diretta ai token theme.
// Usata per non riscrivere ogni accesso a C.foo nei body delle view.
export const C = {
  white:      T.bgCard,
  bgCard:     T.bgCard,
  bg:         T.bg,
  bgSubtle:   T.bgSubtle,
  text:       T.text,
  textMid:    T.textMid,
  textSoft:   T.textSoft,
  border:     T.border,
  borderStr:  T.borderStr,
  borderSoft: T.borderSoft,
  green:      T.green,
  greenLight: T.greenLight,
  amber:      T.amber,
  amberLight: T.amberLight,
  red:        T.brand,
  redLight:   T.brandLight,
  redDark:    T.brandDark,
}

// Formattazione monospaced numerica
export const TNUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

// Colore margine: verde ≥60, ambra 40-60, brand <40
export const margColor = pct => pct >= 60 ? C.green : pct >= 40 ? C.amber : C.red

// Formattazione valuta / percentuale.
// Guard su NaN/undefined: chiusure batch/import possono avere kpi parziali
// (es. kpi:{} senza totV) → senza guard si mostrava "€ NaN".
// Separatore migliaia IT (1.234,56) ovunque, così gli importi grandi sono leggibili.
export const fmt = v => { const n = Number(v); return `€ ${(Number.isFinite(n) ? n : 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
export const fmtp = v => { const n = Number(v); return `${(Number.isFinite(n) ? n : 0).toFixed(1)}%` }
// Valuta arrotondata all'unità con separatore migliaia (es. € 1.234). Per box/KPI.
export const fmt0 = v => { const n = Number(v); return `€ ${Math.round(Number.isFinite(n) ? n : 0).toLocaleString('it-IT')}` }

// KPI card grande premium (usata da Magazzino, Chiusura, Produzione, ecc.)
// Look coerente con la Dashboard home: decoro radiale, chip icona, accento colore.
export function KPI({ label, value, sub, color, highlight, icon, onClick }) {
  const accent = color || T.brand
  const chipBg = highlight ? 'rgba(255,255,255,0.14)' : 'rgba(110,14,26,0.10)'
  const chipColor = highlight ? '#fff' : accent
  return (
    <div className="fos-tile" onClick={onClick} style={{
      position: 'relative', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
      background: highlight ? 'linear-gradient(135deg, #6E0E1A 0%, #4A0612 100%)' : T.bgCard,
      border: `1px solid ${highlight ? '#4A0612' : T.border}`, borderRadius: 18,
      padding: '18px 20px',
      boxShadow: highlight ? '0 14px 34px rgba(110,14,26,0.32), inset 0 1px 0 rgba(255,255,255,0.18)' : '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
    }}>
      {/* decoro radiale d'angolo */}
      <div style={{ position: 'absolute', top: -28, right: -28, width: 92, height: 92, borderRadius: '50%',
        background: highlight ? 'rgba(255,255,255,0.07)' : `${accent}14`, opacity: 0.6, pointerEvents: 'none' }}/>
      {icon && (
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 11, background: chipBg, color: chipColor, fontSize: 17 }}>{icon}</span>
        </div>
      )}
      <div style={{ position: 'relative', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
        color: highlight ? 'rgba(255,255,255,0.76)' : T.textSoft, marginBottom: 6 }}>{label}</div>
      <div style={{ position: 'relative', fontSize: 30, fontWeight: 800, color: highlight ? T.textOnDark : color || T.text,
        letterSpacing: '-0.035em', lineHeight: 1.05, ...TNUM }}>
        {value}
      </div>
      {sub && <div style={{ position: 'relative', fontSize: 12, color: highlight ? 'rgba(255,255,255,0.7)' : T.textSoft, marginTop: 7, fontWeight: 500 }}>{sub}</div>}
    </div>
  )
}

// Tooltip Recharts condiviso (era inline in Dashboard.jsx).
// Importato da StoricoProduzioneView, PLView, ecc. — senza questo modulo dedicato
// le view post-code-split sbattevano contro `ChartTip is not defined`.
export const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: '10px 14px', fontSize: 11,
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    }}>
      <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>{label}</div>
      {/* Audit 2026-07-01 MEDIUM: key={dataKey} stabile (stacked charts hanno
          ordine variabile in payload) — prima key={i} swappava i colori al
          riordino interno di Recharts. */}
      {payload.map((p, i) => (
        <div key={p.dataKey || p.name || i} style={{ color: p.color || C.red }}>{p.name}: <b>{p.value}</b></div>
      ))}
    </div>
  )
}

export function Badge({ label, color = 'green' }) {
  const s = {
    green: { bg: C.greenLight, c: C.green },
    red:   { bg: C.redLight,   c: C.red   },
    amber: { bg: C.amberLight, c: C.amber },
    gray:  { bg: '#F3F3F3',    c: '#888'  },
  }[color] || { bg: '#F3F3F3', c: '#888' }
  return (
    <span style={{
      background: s.bg, color: s.c, fontSize: 10, fontWeight: 600,
      padding: '3px 8px', borderRadius: 12, letterSpacing: '0.04em',
      textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

export const margBadge = pct => {
  if (pct === null || pct === undefined) return null
  if (pct >= 70) return <Badge label="Eccellente" color="green"/>
  if (pct >= 55) return <Badge label="Buono" color="green"/>
  if (pct >= 40) return <Badge label="Accettabile" color="amber"/>
  return <Badge label="Basso — rivedere" color="red"/>
}

// Tooltip su hover (portato fuori dal flow per essere always-on-top)
export function Tip({ text, children, width = 220 }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const ref = useRef(null)
  const handleEnter = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top - 8 })
    setShow(true)
  }
  if (!text) return children
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span style={{
          position: 'fixed',
          left: Math.min(pos.x - width / 2, window.innerWidth - width - 8),
          top: pos.y,
          transform: 'translateY(-100%)',
          zIndex: 99999,
          background: '#1C0A0A',
          color: 'rgba(255,255,255,0.92)',
          fontSize: 11, fontWeight: 500, lineHeight: 1.55,
          padding: '8px 12px', borderRadius: 8,
          width, pointerEvents: 'none',
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          whiteSpace: 'normal',
        }}>
          {text}
          <span style={{
            position: 'absolute', left: '50%', top: '100%',
            transform: 'translateX(-50%)',
            border: '5px solid transparent',
            borderTopColor: '#1C0A0A',
          }}/>
        </span>
      )}
    </span>
  )
}

// Page header standard (titolo gestito dalla topbar, qui solo subtitle + action)
export function PageHeader({ subtitle, action }) {
  if (!subtitle && !action) return null
  return (
    <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      {subtitle && <div style={{ fontSize: 13, color: T.textSoft, letterSpacing: '-0.005em', lineHeight: 1.5, fontWeight: 500, flex: 1, minWidth: 0 }}>{subtitle}</div>}
      {action}
    </div>
  )
}

// Tabella primitives (PLTable, SensTable, etc.)
export const TD = ({ children, right, bold, color, mono, small }) => (
  <td style={{
    padding: '10px 14px', textAlign: right ? 'right' : 'left',
    fontWeight: bold ? 700 : 500, color: color || C.text,
    ...(mono ? TNUM : null),
    fontSize: small ? 10 : 11, whiteSpace: 'nowrap',
  }}>{children}</td>
)

export const TH = ({ children, right }) => (
  // Audit 2026-07-01 LOW: fontSize 8 era sotto-soglia AA su retina/mobile.
  // 10 con letterSpacing un po' ridotto resta compatto ma leggibile.
  <th style={{
    padding: '10px 14px', textAlign: right ? 'right' : 'left',
    fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
    textTransform: 'uppercase', color: C.textSoft,
    borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
  }}>{children}</th>
)

// Hook ordinabile (riusato da PLTable, SensTable, TopIngredientiTable, ecc.)
export function useSortable(defaultKey, defaultDir = 'desc') {
  const [sortKey, setSortKey] = useState(defaultKey)
  const [sortDir, setSortDir] = useState(defaultDir)
  const toggleSort = useCallback((key) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); return prev }
      setSortDir('desc'); return key
    })
  }, [])
  const sort = (arr, getValue) => [...arr].sort((a, b) => {
    const va = getValue ? getValue(a, sortKey) : (a[sortKey] ?? 0)
    const vb = getValue ? getValue(b, sortKey) : (b[sortKey] ?? 0)
    const mul = sortDir === 'desc' ? -1 : 1
    return typeof va === 'string' ? mul * va.localeCompare(vb) : mul * (va - vb)
  })
  return { sortKey, sortDir, toggleSort, sort }
}

// Header tabella sortable.
// Audit 2026-07-01 LOW: a11y keyboard. role=button + tabIndex + Enter/Space.
// aria-sort indica direzione corrente per screen reader.
export function SortTH({ k, children, right, active, dir, onToggle, tip }) {
  return (
    <th
      role="button"
      tabIndex={0}
      aria-sort={active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'}
      onClick={() => onToggle(k)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle(k)
        }
      }}
      title={tip || undefined}
      style={{
        padding: '10px 16px', textAlign: right ? 'right' : 'left',
        fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
        textTransform: 'uppercase', whiteSpace: 'nowrap',
        color: active ? '#6E0E1A' : '#94A3B8',
        borderBottom: '1px solid #E2E8F0',
        background: active ? '#FEF2F2' : 'transparent',
        cursor: 'pointer', userSelect: 'none',
        transition: 'background 0.15s',
        textDecoration: tip ? 'underline dotted' : 'none', textUnderlineOffset: 3,
      }}>
      {children}{active ? (dir === 'desc' ? ' ▼' : ' ▲') : ''}
    </th>
  )
}

// Section header con barra brand
export function SH({ children, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, marginTop: 32 }}>
      <div style={{ width: 3, height: 16, background: T.brand, borderRadius: 2, flexShrink: 0, alignSelf: 'center' }}/>
      <div>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: T.text, letterSpacing: '-0.015em' }}>{children}</h2>
        {sub && <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2, letterSpacing: '-0.005em' }}>{sub}</div>}
      </div>
    </div>
  )
}
