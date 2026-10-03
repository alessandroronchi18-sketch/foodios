// ── Da dove vengono i numeri, e cosa manca ──────────────────────────────
//
// ANALISI_DESIGN.md, regola 3: la copertura dei dati sta in cima, prima del
// numero. Le critiche dei clienti ai software concorrenti (ricerca del
// 03/10/2026) sono quasi tutte qui: report costruiti su dati incompleti senza
// dirlo. Una riga sola, una voce per fonte, e dove manca qualcosa il pulsante
// per sistemarlo.
import React from 'react'
import { color as T, font, radius as R } from '../../lib/theme'
import Icon from '../Icon'

const ASPETTO = {
  ok:       { icona: 'checkCircle', colore: T.green, parola: '' },
  stima:    { icona: 'info',        colore: T.amber, parola: 'stima' },
  parziale: { icona: 'alertCircle', colore: T.amber, parola: 'in parte' },
  manca:    { icona: 'alertCircle', colore: T.amber, parola: 'manca' },
}

/**
 * @param {{ titolo?: string, voci: { id: string, stato: 'ok'|'stima'|'parziale'|'manca',
 *   testo: string, dettaglio?: string, azione?: { etichetta: string, onClick: () => void } }[] }} p
 */
export default function CoperturaDati({ titolo = 'Da dove vengono i numeri', voci = [] }) {
  if (!voci.length) return null
  return (
    <section aria-label={titolo} style={{
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl,
      padding: '10px 14px', marginBottom: 18,
    }}>
      <div style={{ fontSize: font.size.sm, fontWeight: 700, color: T.textSoft, marginBottom: 6 }}>{titolo}</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
        {voci.map(v => {
          const a = ASPETTO[v.stato] || ASPETTO.manca
          return (
            <li key={v.id} title={v.dettaglio || undefined}
              style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 6px', fontSize: font.size.base, color: T.textMid, lineHeight: 1.45, minHeight: 28 }}>
              <span style={{ color: a.colore, display: 'inline-flex', flexShrink: 0 }} aria-hidden="true"><Icon name={a.icona} size={14} /></span>
              <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                {a.parola && <b style={{ color: T.amberDark, fontWeight: 700 }}>{a.parola[0].toUpperCase() + a.parola.slice(1)}: </b>}
                {v.testo}
              </span>
              {v.azione && (
                <button type="button" onClick={v.azione.onClick}
                  style={{ border: 'none', background: 'transparent', color: T.brand, fontWeight: 700, fontSize: font.size.base, cursor: 'pointer', padding: '4px 2px', fontFamily: 'inherit', minHeight: 28 }}>
                  {v.azione.etichetta}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
