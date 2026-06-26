// PeriodCompareSelector - pill UI riusabile per "confronta con"
//
// Riceve mode + onChange; mostra 3 chip cliccabili.
// Pensato per stare a fianco del selettore periodo (settimana/mese/anno).

import React from 'react'
import { color as T } from '../lib/theme'
import { COMPARE_MODES } from '../lib/periodCompare'

const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const BORDER = T.border || '#E5E9EF'

export default function PeriodCompareSelector({ mode = 'none', onChange, compact = false }) {
  return (
    <div role="radiogroup" aria-label="Periodo di confronto"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 0,
        flexWrap: 'wrap',
        padding: 3,
        background: '#F1F5F9',
        borderRadius: 999,
        border: `1px solid ${BORDER}`,
      }}>
      {!compact && (
        <span style={{ fontSize: 11, color: SOFT, fontWeight: 700, padding: '0 10px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Confronta
        </span>
      )}
      {COMPARE_MODES.map(m => {
        const isActive = mode === m.id
        return (
          <button key={m.id} onClick={() => onChange?.(m.id)}
            role="radio" aria-checked={isActive}
            style={{
              padding: '7px 14px', borderRadius: 999,
              border: 'none',
              background: isActive ? '#FFF' : 'transparent',
              color: isActive ? TXT : MID,
              fontSize: 12, fontWeight: isActive ? 700 : 600,
              cursor: 'pointer',
              minHeight: 32,
              boxShadow: isActive ? '0 1px 2px rgba(15,23,42,0.06), 0 4px 8px rgba(15,23,42,0.05)' : 'none',
              transition: 'background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}>
            {m.lbl}
          </button>
        )
      })}
    </div>
  )
}
