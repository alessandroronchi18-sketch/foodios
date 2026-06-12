// PeriodCompareSelector — pill UI riusabile per "confronta con"
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
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {!compact && (
        <span style={{ fontSize: 11, color: SOFT, fontWeight: 600, marginRight: 2 }}>
          Confronta:
        </span>
      )}
      {COMPARE_MODES.map(m => (
        <button key={m.id} onClick={() => onChange?.(m.id)}
          style={{
            padding: '5px 12px', borderRadius: 999,
            border: `1px solid ${mode === m.id ? TXT : BORDER}`,
            background: mode === m.id ? TXT : 'transparent',
            color: mode === m.id ? '#FFF' : MID,
            fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
          }}>
          {m.lbl}
        </button>
      ))}
    </div>
  )
}
