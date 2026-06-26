// Primitive condivise tra le view estratte da Dashboard.jsx.
// Sono volutamente piccole e isolate per evitare il "monolite delle utility".
// Una volta che tutto è migrato, alcune potranno diventare componenti dedicati in components/.

import React, { useState, useRef, useCallback } from 'react'
import { color as T } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'

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
//
// CRITICAL FIX 2026-06-25: in alcuni runtime (Node senza ICU full, Safari iOS
// in private browsing) `toLocaleString('it-IT')` SENZA opzioni esplicite
// ritorna "9628" senza separatore migliaia. Forziamo `useGrouping: 'always'`
// + `maximumFractionDigits: 0/2` esplicito su tutti i 3 helper per garantire
// l'output IT-style su qualsiasi runtime.
const NF_IT_2DEC = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })
const NF_IT_0DEC = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: 'always' })

export const fmt = v => { const n = Number(v); return `${NF_IT_2DEC.format(Number.isFinite(n) ? n : 0)} €` }
export const fmtp = v => { const n = Number(v); return `${(Number.isFinite(n) ? n : 0).toFixed(1)}%` }
// Valuta arrotondata all'unità con separatore migliaia (es. 1.234 €). Per box/KPI.
export const fmt0 = v => { const n = Number(v); return `${NF_IT_0DEC.format(Math.round(Number.isFinite(n) ? n : 0))} €` }

// CSS futuristic-clean per tile/KPI shared. Iniettato una volta (idempotente
// se il browser carica più volte _shared — il selettore di style id evita
// duplicati).
// — fos-kpi-tile: hover lift drammatico + ombra brand colorata
// — accent strip animato superiore opzionale (className fos-kpi-accent)
// — sheen sweep al primo render (sottile riflesso che scorre, una volta sola)
// Tutto pause su prefers-reduced-motion.
if (typeof document !== 'undefined' && !document.getElementById('fos-kpi-css')) {
  const s = document.createElement('style')
  s.id = 'fos-kpi-css'
  s.textContent = `
    @keyframes _fos_kpiAccent {
      0%, 100% { background-position: 0% 50%; }
      50%      { background-position: 100% 50%; }
    }
    @keyframes _fos_kpiSheen {
      0%   { transform: translateX(-110%) skewX(-18deg); opacity: 0; }
      40%  { opacity: 0.55; }
      100% { transform: translateX(220%)  skewX(-18deg); opacity: 0; }
    }
    @keyframes _fos_shBarPulse {
      0%, 100% { background-position: 50% 0%;   box-shadow: 0 0 12px rgba(232,75,58,0.45), inset 0 1px 0 rgba(255,255,255,0.18); }
      50%      { background-position: 50% 100%; box-shadow: 0 0 18px rgba(232,75,58,0.65), inset 0 1px 0 rgba(255,255,255,0.22); }
    }
    .fos-kpi-tile {
      transition: transform 0.22s cubic-bezier(.32,.72,0,1), box-shadow 0.22s ease, border-color 0.22s ease;
    }
    .fos-kpi-tile:hover {
      transform: translateY(-4px);
      box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 18px 40px rgba(110,14,26,0.14), 0 2px 8px rgba(110,14,26,0.08);
      border-color: rgba(110,14,26,0.20);
    }
    .fos-kpi-tile.fos-kpi-highlight:hover {
      box-shadow: 0 22px 50px rgba(110,14,26,0.42), inset 0 1px 0 rgba(255,255,255,0.22);
    }
    .fos-kpi-accent {
      animation: _fos_kpiAccent 6s ease-in-out infinite;
    }
    .fos-kpi-sheen {
      animation: _fos_kpiSheen 1.6s cubic-bezier(.32,.72,0,1) 0.2s 1 forwards;
    }
    /* Section header bar — pulsa brand→corallo→brand 3s in loop */
    .fos-sh-bar {
      animation: _fos_shBarPulse 3s ease-in-out infinite;
    }
    /* Tile generiche (.fos-tile usata in 26 punti del codice): hover lift
       potenziato + ombra brand-tinted per coerenza con KPI futuristic.
       ::before aggiunge accent strip top 2px gradient brand (statico, non
       animato per non distrarre quando la pagina ha tante tile). */
    .fos-tile {
      position: relative;
    }
    .fos-tile::before {
      content: '';
      position: absolute;
      top: 0; left: 14%; right: 14%;
      height: 2px;
      border-radius: 0 0 2px 2px;
      background: linear-gradient(90deg, transparent, rgba(110,14,26,0.85) 30%, rgba(232,75,58,1) 50%, rgba(110,14,26,0.85) 70%, transparent);
      pointer-events: none;
      z-index: 1;
    }
    .fos-tile:hover {
      box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 20px 44px rgba(110,14,26,0.12), 0 2px 8px rgba(110,14,26,0.06) !important;
      border-color: rgba(110,14,26,0.15) !important;
    }
    .fos-tile:hover::before {
      left: 6%; right: 6%;
      transition: left 0.22s ease, right 0.22s ease;
    }
    /* Page container futuristic-clean: per le card grandi non-KPI (Conto
       economico, Costi extra-food, Tabella riepilogativa, ecc.).
       Aggiungere className="fos-card-glow" al div per ottenere accent strip
       top + hover lift. */
    .fos-card-glow {
      position: relative;
      transition: transform 0.22s cubic-bezier(.32,.72,0,1), box-shadow 0.22s ease, border-color 0.22s ease;
    }
    .fos-card-glow::before {
      content: '';
      position: absolute;
      top: 0; left: 12%; right: 12%;
      height: 2px;
      border-radius: 0 0 2px 2px;
      background: linear-gradient(90deg, transparent, #6E0E1A 30%, #E84B3A 50%, #6E0E1A 70%, transparent);
      background-size: 200% 100%;
      animation: _fos_kpiAccent 7s ease-in-out infinite;
      pointer-events: none;
    }
    .fos-card-glow:hover {
      transform: translateY(-2px);
      box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 18px 40px rgba(110,14,26,0.10) !important;
      border-color: rgba(110,14,26,0.15) !important;
    }
    @media (prefers-reduced-motion: reduce) {
      .fos-kpi-tile, .fos-tile, .fos-card-glow { transition: none; }
      .fos-kpi-tile:hover, .fos-tile:hover, .fos-card-glow:hover { transform: none; }
      .fos-kpi-accent, .fos-kpi-sheen, .fos-sh-bar, .fos-card-glow::before { animation: none !important; }
    }
  `
  document.head.appendChild(s)
}

// KPI card grande premium (usata da Magazzino, Chiusura, Produzione, ecc.)
// Look coerente con la Dashboard home: decoro radiale, chip icona, accento colore.
// Audit 2026-06-25: aggiunto accent strip animato superiore + sheen sweep iniziale
// + hover lift più drammatico con shadow brand. Futuristico ma professionale.
export function KPI({ label, value, sub, color, highlight, icon, onClick }) {
  const isMobile = useIsMobile()
  const accent = color || T.brand
  const chipBg = highlight ? 'rgba(255,255,255,0.14)' : 'rgba(110,14,26,0.10)'
  const chipColor = highlight ? '#fff' : accent
  return (
    <div className={`fos-tile fos-kpi-tile${highlight ? ' fos-kpi-highlight' : ''}`} onClick={onClick} style={{
      position: 'relative', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
      background: highlight ? 'linear-gradient(135deg, #6E0E1A 0%, #4A0612 100%)' : T.bgCard,
      border: `1px solid ${highlight ? '#4A0612' : T.border}`, borderRadius: 18,
      padding: '18px 20px',
      boxShadow: highlight ? '0 14px 34px rgba(110,14,26,0.32), inset 0 1px 0 rgba(255,255,255,0.18)' : '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      {/* Accent strip animato superiore (2px) — gradient brand→corallo→brand
          in loop 6s. Crea "vivo / connesso" senza essere invadente. */}
      <div className="fos-kpi-accent" aria-hidden="true" style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: highlight
          ? 'linear-gradient(90deg, rgba(255,180,140,0.0), rgba(255,180,140,0.85) 50%, rgba(255,180,140,0.0))'
          : `linear-gradient(90deg, transparent, ${accent} 50%, transparent)`,
        backgroundSize: '200% 100%',
        pointerEvents: 'none',
      }}/>
      {/* Sheen sweep iniziale — diagonal light pass una volta sola al mount */}
      <div className="fos-kpi-sheen" aria-hidden="true" style={{
        position: 'absolute', top: -20, bottom: -20, width: 80, pointerEvents: 'none',
        background: highlight
          ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)'
          : 'linear-gradient(90deg, transparent, rgba(110,14,26,0.08), transparent)',
        filter: 'blur(8px)',
      }}/>
      {/* decoro radiale d'angolo */}
      <div style={{ position: 'absolute', top: -28, right: -28, width: 92, height: 92, borderRadius: '50%',
        background: highlight ? 'rgba(255,255,255,0.07)' : `${accent}14`, opacity: 0.6, pointerEvents: 'none' }}/>
      {icon && (
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 11, background: chipBg, color: chipColor, fontSize: 17,
            boxShadow: highlight ? 'inset 0 1px 0 rgba(255,255,255,0.14)' : `0 4px 12px ${accent}28` }}>{icon}</span>
        </div>
      )}
      <div style={{ position: 'relative', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
        color: highlight ? 'rgba(255,255,255,0.76)' : T.textSoft, marginBottom: 6,
        minHeight: 28, lineHeight: 1.25 }}>{label}</div>
      {/* Audit 2026-06-25: fontSize auto-shrink in base alla lunghezza del value.
          Risolve due bug:
          (1) Valori numerici con 2 decimali (es. "611,50 €") troncati con "..."
              nei box stretti del grid 2-col mobile.
          (2) Valori alfanumerici lunghi (es. "Top fornitore: CONSORZIO COOP X")
              che andavano fuori dal box.
          Bucket: short ≤6 char / medium 7-12 char / long >12 char. */}
      {(() => {
        const valStr = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
        const len = valStr.length || 6
        const fs = isMobile
          ? (len <= 6 ? 24 : len <= 12 ? 19 : 14)
          : (len <= 6 ? 30 : len <= 14 ? 24 : 18)
        return (
          <div style={{ position: 'relative', fontSize: fs, fontWeight: 800, color: highlight ? T.textOnDark : color || T.text,
            letterSpacing: '-0.035em', lineHeight: 1.15, minHeight: isMobile ? 28 : 32, whiteSpace: 'nowrap', overflow: 'hidden', ...TNUM }}>
            {value}
          </div>
        )
      })()}
      {sub
        ? <div style={{ position: 'relative', fontSize: 12, color: highlight ? 'rgba(255,255,255,0.7)' : T.textSoft, marginTop: 7, fontWeight: 500, minHeight: 32, lineHeight: 1.35 }}>{sub}</div>
        : <div style={{ minHeight: 32, marginTop: 7 }}/>
      }
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
          padding: '10px 14px', borderRadius: 8,
          width, pointerEvents: 'none',
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          whiteSpace: 'normal',
          textAlign: 'left',
          letterSpacing: 'normal',
          textTransform: 'none',
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

// Section header con barra brand. Audit 2026-06-25: barra ora gradient
// brand→corallo→brand con pulse + glow brand sottile. Propaga automaticamente
// a tutte le view che usano SH (PLView, Eventi, SpreciOmaggi, ecc.).
export function SH({ children, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, marginTop: 32 }}>
      <div className="fos-sh-bar" aria-hidden="true" style={{
        width: 4, height: 20, borderRadius: 3, flexShrink: 0, alignSelf: 'center',
        background: 'linear-gradient(180deg, #6E0E1A 0%, #E84B3A 50%, #6E0E1A 100%)',
        backgroundSize: '100% 200%',
        boxShadow: '0 0 12px rgba(232,75,58,0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
      }}/>
      <div>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.015em' }}>{children}</h2>
        {sub && <div style={{ fontSize: 12, color: T.textSoft, marginTop: 3, letterSpacing: '-0.005em', lineHeight: 1.55 }}>{sub}</div>}
      </div>
    </div>
  )
}
