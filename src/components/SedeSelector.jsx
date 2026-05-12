import React, { useState } from 'react'

export default function SedeSelector({ sedi, sedeAttiva, onSelect }) {
  const [open, setOpen] = useState(false)

  if (!sedi || sedi.length <= 1) return null

  return (
    <div style={{ position: 'relative', margin: '8px 10px' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '6px 10px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          color: 'rgba(255,255,255,0.7)',
          fontSize: 11,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>📍 {sedeAttiva?.nome || 'Seleziona sede'}</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 1000,
          background: '#2A0F0F',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          overflow: 'hidden',
          marginTop: 2,
        }}>
          {sedi.map(sede => (
            <button
              key={sede.id}
              onClick={() => { onSelect(sede); setOpen(false) }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                background: sede.id === sedeAttiva?.id ? 'rgba(192,57,43,0.2)' : 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.8)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {sede.id === sedeAttiva?.id ? '✓ ' : ''}{sede.nome}
              {sede.citta && <span style={{ opacity: 0.5 }}> · {sede.citta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
