// ── La settimana, in una riga ─────────────────────────────────────────────
//
// Prima era una barra a tutta larghezza con «SETTIMANA», tre pulsanti
// (Prec. · Oggi · Succ.) e due di esportazione: al telefono, cinque righe
// di comandi prima del primo numero. Il titolare, 04/10/2026: «appena
// atterro non devo vedere tutto questo ammasso di cose». Adesso: ‹ la
// settimana › e, solo se non è quella di oggi, «Questa settimana». CSV e PDF
// stanno in fondo alla pagina, dove servono (al commercialista).
import React from 'react'
import { color as T, font, radius as R } from '../../lib/theme'
import Icon from '../../components/Icon'

export default function NavigatoreSettimana({ etichetta, onPrima, onDopo, onOggi = null }) {
  const freccia = {
    width: 44, height: 44, borderRadius: R.lg, border: `1px solid ${T.border}`, background: T.bgCard,
    color: T.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: 0, flexShrink: 0,
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" onClick={onPrima} aria-label="Settimana precedente" title="Settimana precedente" style={freccia}>
        <Icon name="chevR" size={16} style={{ transform: 'rotate(180deg)' }} />
      </button>
      <span style={{ fontSize: font.size.md, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', minWidth: 0, padding: '0 4px' }}>
        {etichetta}
      </span>
      <button type="button" onClick={onDopo} aria-label="Settimana successiva" title="Settimana successiva" style={freccia}>
        <Icon name="chevR" size={16} />
      </button>
      {onOggi && (
        <button type="button" onClick={onOggi} aria-label="Settimana corrente"
          style={{ border: 'none', background: 'transparent', color: T.brand, fontWeight: 700, fontSize: font.size.base, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44, padding: '0 6px' }}>
          Questa settimana
        </button>
      )}
    </div>
  )
}
