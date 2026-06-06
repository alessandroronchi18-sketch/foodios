import React, { useState, useEffect, useRef } from 'react'

const BRAND = '#6E0E1A'

// variant: 'sidebar' (scuro, per la sidebar) | 'topbar' (chiaro e compatto, per
// la barra superiore su sfondo chiaro). Le palette evitano testo bianco su chiaro.
export default function SedeSelector({ sedi, sedeAttiva, onSelect, variant = 'sidebar' }) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const ref = useRef(null)
  const top = variant === 'topbar'

  const P = top ? {
    txt: '#1C0A0A', sub: '#6B7280', label: '#9AA1AC',
    bg: '#FFFFFF', bgHover: '#F4EEEA', bgOpen: 'rgba(110,14,26,0.08)',
    border: '#E6E0DC', borderOpen: 'rgba(110,14,26,0.40)',
    iconBg: 'rgba(110,14,26,0.10)', iconBgOpen: BRAND, iconStroke: BRAND, iconStrokeOpen: '#FFF',
    chevron: '#9AA1AC', panelBg: '#FFFFFF', panelBorder: '#E6E0DC',
    panelLabel: '#9AA1AC', itemTxt: '#1C0A0A', itemSub: '#6B7280',
    shadow: '0 12px 32px rgba(15,23,42,0.18)', margin: 0,
  } : {
    txt: 'rgba(255,255,255,0.95)', sub: 'rgba(255,255,255,0.45)', label: 'rgba(255,255,255,0.5)',
    bg: 'rgba(255,255,255,0.04)', bgHover: 'rgba(255,255,255,0.07)', bgOpen: 'rgba(110,14,26,0.18)',
    border: 'rgba(255,255,255,0.08)', borderOpen: 'rgba(110,14,26,0.45)',
    iconBg: 'rgba(110,14,26,0.22)', iconBgOpen: BRAND, iconStroke: '#E5A8A8', iconStrokeOpen: '#FFF',
    chevron: 'rgba(255,255,255,0.6)', panelBg: '#11151E', panelBorder: 'rgba(255,255,255,0.08)',
    panelLabel: 'rgba(255,255,255,0.4)', itemTxt: 'rgba(255,255,255,0.95)', itemSub: 'rgba(255,255,255,0.45)',
    shadow: '0 12px 32px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)', margin: '10px 12px',
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!sedi || sedi.length === 0) return null

  const iconBox = (isOpen) => (
    <span style={{ width: top ? 22 : 28, height: top ? 22 : 28, borderRadius: top ? 7 : 8, background: isOpen ? P.iconBgOpen : P.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 120ms ease' }}>
      <svg width={top ? 12 : 14} height={top ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke={isOpen ? P.iconStrokeOpen : P.iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
      </svg>
    </span>
  )

  // Una sola sede: badge informativo non interattivo
  if (sedi.length === 1) {
    return (
      <div style={{ margin: P.margin, padding: top ? '3px 10px 3px 5px' : '10px 12px', background: P.bg, border: `1px solid ${P.border}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 9 }}>
        {iconBox(false)}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: P.label, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1 }}>Sede</div>
          <div style={{ fontSize: 12.5, color: P.txt, fontWeight: 600, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
            {sedeAttiva?.nome || sedi[0]?.nome || 'Sede'}
          </div>
        </div>
      </div>
    )
  }

  const sedeCorrente = sedeAttiva || sedi[0]

  return (
    <div ref={ref} style={{ position: 'relative', margin: P.margin }}>
      <button
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: top ? 'auto' : '100%', minWidth: top ? 168 : undefined,
          padding: top ? '3px 10px 3px 5px' : '10px 12px',
          background: open ? P.bgOpen : hover ? P.bgHover : P.bg,
          border: `1px solid ${open ? P.borderOpen : P.border}`,
          borderRadius: 10, color: P.txt, fontSize: 12.5, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 9,
          transition: 'background 120ms ease, border-color 120ms ease', textAlign: 'left',
        }}
      >
        {iconBox(open)}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: P.label, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1 }}>Sede attiva</div>
          <div style={{ fontSize: 12.5, color: P.txt, fontWeight: 600, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
            {sedeCorrente?.nome || 'Seleziona sede'}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={P.chevron} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 160ms ease' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: top ? 0 : undefined, left: top ? undefined : 0, minWidth: top ? 220 : undefined,
          width: top ? undefined : '100%', zIndex: 1000,
          background: P.panelBg, border: `1px solid ${P.panelBorder}`, borderRadius: 10, overflow: 'hidden', boxShadow: P.shadow,
          animation: 'sedeSelDrop 140ms cubic-bezier(0.32,0.72,0,1)',
        }}>
          <style>{`@keyframes sedeSelDrop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <div style={{ padding: '8px 12px', fontSize: 9, fontWeight: 700, color: P.panelLabel, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${top ? '#F0EAE6' : 'rgba(255,255,255,0.05)'}` }}>
            Cambia sede · {sedi.length}
          </div>
          {sedi.map(sede => {
            const active = sede.id === sedeCorrente?.id
            return (
              <button
                key={sede.id}
                onClick={() => { onSelect(sede); setOpen(false) }}
                onMouseEnter={e => { e.currentTarget.style.background = active ? (top ? 'rgba(110,14,26,0.14)' : 'rgba(110,14,26,0.28)') : (top ? '#F4EEEA' : 'rgba(255,255,255,0.05)') }}
                onMouseLeave={e => { e.currentTarget.style.background = active ? (top ? 'rgba(110,14,26,0.10)' : 'rgba(110,14,26,0.22)') : 'transparent' }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', textAlign: 'left',
                  background: active ? (top ? 'rgba(110,14,26,0.10)' : 'rgba(110,14,26,0.22)') : 'transparent',
                  border: 'none', borderLeft: active ? `2px solid ${BRAND}` : '2px solid transparent',
                  color: P.itemTxt, fontSize: 12.5, cursor: 'pointer', transition: 'background 100ms ease',
                }}
              >
                <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? BRAND : (top ? '#EDE6E2' : 'rgba(255,255,255,0.08)'), flexShrink: 0 }}>
                  {active && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: active ? 700 : 500, color: P.itemTxt, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sede.nome}</div>
                  {sede.citta && (
                    <div style={{ fontSize: 10.5, color: P.itemSub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sede.citta}</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
