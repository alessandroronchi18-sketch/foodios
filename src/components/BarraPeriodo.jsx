// La barra del periodo: la stessa in tutte le pagine di analisi.
//
// Prima ogni pagina aveva la sua. Il P&L «dal/al» e basta, lo Storico nove
// scorciatoie più il confronto, il Confronto sedi solo settimana/mese.
// Passando da una pagina all'altra si ricominciava da capo, e la stessa
// domanda — «com'è andato settembre?» — andava riposta tre volte in tre modi.
//
// Il conto sta in `lib/periodoAnalisi.js`; qui c'è solo il disegno.

import React from 'react'
import { color as T, font } from '../lib/theme'
import { SCORCIATOIE, CONFRONTI, finestraScorciatoia, scorciatoiaDi, nomePeriodo, finestraConfronto } from '../lib/periodoAnalisi'

export default function BarraPeriodo({
  from, to, onPeriodo,
  confronto = 'none', onConfronto,
  isMobile = false,
  mostraConfronto = true,
}) {
  const attiva = scorciatoiaDi(from, to)
  const conf = finestraConfronto(from, to, confronto)

  const chip = (attivo) => ({
    padding: isMobile ? '10px 12px' : '8px 12px',
    minHeight: isMobile ? 44 : 36,
    borderRadius: 999,
    border: `1px solid ${attivo ? T.brand : T.border}`,
    background: attivo ? T.brandLight : T.bgCard,
    color: attivo ? T.brand : T.textMid,
    fontSize: font.size.sm, fontWeight: 700, fontFamily: 'inherit',
    cursor: 'pointer', whiteSpace: 'nowrap',
  })

  const campoData = {
    padding: '9px 10px', minHeight: 44, borderRadius: 8,
    border: `1px solid ${T.border}`, background: T.bgCard,
    fontSize: font.size.md, color: T.text, fontFamily: 'inherit',
    boxSizing: 'border-box', minWidth: 0, flex: isMobile ? '1 1 45%' : '0 0 auto',
  }

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12,
      padding: isMobile ? 12 : 14, marginBottom: 16,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SCORCIATOIE.map(s => (
          <button key={s.id} type="button"
            aria-pressed={attiva === s.id}
            onClick={() => { const f = finestraScorciatoia(s.id); if (f) onPeriodo?.(f.from, f.to) }}
            style={chip(attiva === s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: font.size.sm, color: T.textSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dal</span>
        <input type="date" value={from || ''} aria-label="Data di inizio"
          onChange={e => onPeriodo?.(e.target.value, to)} style={campoData} />
        <span style={{ fontSize: font.size.sm, color: T.textSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>al</span>
        <input type="date" value={to || ''} aria-label="Data di fine"
          onChange={e => onPeriodo?.(from, e.target.value)} style={campoData} />
      </div>

      {mostraConfronto && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: font.size.sm, color: T.textSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Confronta con
          </span>
          {CONFRONTI.map(c => (
            <button key={c.id} type="button"
              aria-pressed={confronto === c.id}
              onClick={() => onConfronto?.(c.id)}
              style={chip(confronto === c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* A parole, sotto: «1–16 settembre 2026, contro 16–31 agosto 2026».
          Le due date in cifre dicono già tutto, ma vanno lette; questa riga si
          capisce di sfuggita, ed è quella che evita di guardare un mese
          credendo di guardarne un altro. */}
      {from && to && (
        <div style={{ fontSize: font.size.sm, color: T.textSoft, lineHeight: 1.45 }}>
          Stai guardando <b style={{ color: T.text }}>{nomePeriodo(from, to)}</b>
          {conf ? <> · confronto con <b style={{ color: T.text }}>{nomePeriodo(conf.from, conf.to)}</b></> : null}
        </div>
      )}
    </div>
  )
}
