import React, { useState, useEffect, useRef } from 'react'

const BRAND = '#8B1A1A'

export default function SedeSelector({ sedi, sedeAttiva, onSelect }) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!sedi || sedi.length === 0) return null

  // Una sola sede: badge informativo non interattivo
  if (sedi.length === 1) {
    return (
      <div style={{
        margin: '10px 12px',
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'rgba(139,26,26,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E5A8A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1 }}>Sede</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', fontWeight: 600, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sedeAttiva?.nome || sedi[0]?.nome || 'Sede'}
          </div>
        </div>
      </div>
    )
  }

  const sedeCorrente = sedeAttiva || sedi[0]

  return (
    <div ref={ref} style={{ position: 'relative', margin: '10px 12px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: open
            ? 'rgba(139,26,26,0.18)'
            : hover ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${open ? 'rgba(139,26,26,0.45)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 10,
          color: 'rgba(255,255,255,0.92)',
          fontSize: 12.5,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          transition: 'background 120ms ease, border-color 120ms ease',
          textAlign: 'left',
        }}
      >
        <span style={{
          width: 28, height: 28, borderRadius: 8,
          background: open ? BRAND : 'rgba(139,26,26,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          transition: 'background 120ms ease',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={open ? '#FFF' : '#E5A8A8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1 }}>Sede attiva</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.95)', fontWeight: 600, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sedeCorrente?.nome || 'Seleziona sede'}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 160ms ease' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          right: 0,
          zIndex: 1000,
          background: '#11151E',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)',
          animation: 'sedeSelDrop 140ms cubic-bezier(0.32,0.72,0,1)',
        }}>
          <style>{`@keyframes sedeSelDrop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <div style={{
            padding: '8px 12px',
            fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            Cambia sede · {sedi.length}
          </div>
          {sedi.map(sede => {
            const active = sede.id === sedeCorrente?.id
            return (
              <button
                key={sede.id}
                onClick={() => { onSelect(sede); setOpen(false) }}
                onMouseEnter={e => { e.currentTarget.style.background = active ? 'rgba(139,26,26,0.28)' : 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { e.currentTarget.style.background = active ? 'rgba(139,26,26,0.22)' : 'transparent' }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '10px 12px',
                  textAlign: 'left',
                  background: active ? 'rgba(139,26,26,0.22)' : 'transparent',
                  border: 'none',
                  borderLeft: active ? `2px solid ${BRAND}` : '2px solid transparent',
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 12.5,
                  cursor: 'pointer',
                  transition: 'background 100ms ease',
                }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? BRAND : 'rgba(255,255,255,0.08)',
                  flexShrink: 0,
                }}>
                  {active && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: active ? 700 : 500, color: 'rgba(255,255,255,0.95)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sede.nome}
                  </div>
                  {sede.citta && (
                    <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sede.citta}
                    </div>
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
