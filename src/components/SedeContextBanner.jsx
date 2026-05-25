import React from 'react'
import { color as T } from '../lib/theme'

/**
 * Banner contestuale che indica con quale sede stiamo operando nella vista corrente.
 * Per le sezioni per-sede (magazzino, cassa, produzione…).
 *
 * Props:
 *  - sedeAttiva: { id, nome, citta } | null
 *  - sedi: array completo (per decidere se mostrare il banner — solo se >1 sede)
 *  - onChange: optional, click per aprire SedeSelector altrove
 *  - scope: 'per-sede' (default) | 'org' (entità a livello azienda, banner muted)
 *  - hint: testo opzionale es. "Magazzino di questa sede"
 */
export default function SedeContextBanner({ sedeAttiva, sedi = [], onChange, scope = 'per-sede', hint }) {
  if (!sedi || sedi.length < 2) return null

  if (scope === 'org') {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', borderRadius: 999,
        background: T.bgSubtle || '#F1F5F9',
        border: `1px solid ${T.border || '#E2E8F0'}`,
        color: T.textMid || '#475569',
        fontSize: 11, fontWeight: 600,
        marginBottom: 16,
      }}>
        <span>🏢</span>
        <span>Dato a livello azienda · visibile a tutte le sedi</span>
      </div>
    )
  }

  const nome = sedeAttiva?.nome || '—'
  const citta = sedeAttiva?.citta

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderRadius: 10,
      background: '#FEF3C7',
      border: '1px solid #FCD34D',
      color: '#92400E',
      fontSize: 12, fontWeight: 600,
      marginBottom: 16,
    }}>
      <span style={{ fontSize: 16 }}>📍</span>
      <div style={{ flex: 1, lineHeight: 1.35 }}>
        <div>
          Sede attiva: <strong style={{ fontWeight: 800 }}>{nome}</strong>
          {citta && <span style={{ fontWeight: 500, opacity: 0.75 }}> · {citta}</span>}
        </div>
        {hint && <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.85, marginTop: 2 }}>{hint}</div>}
      </div>
      {onChange && (
        <button onClick={onChange} style={{
          padding: '4px 10px', background: 'rgba(255,255,255,0.6)',
          border: '1px solid #FCD34D', borderRadius: 8,
          color: '#92400E', fontSize: 11, fontWeight: 700, cursor: 'pointer',
        }}>Cambia sede</button>
      )}
    </div>
  )
}
