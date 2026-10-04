// ── Il calendario da muro dei giorni registrati (il disegno) ──────────────
//
// Si apre dalla riga «da dove vengono i numeri» («Vedi i giorni»). Sette
// colonne da lunedì a domenica, un blocco per mese; al telefono le caselle
// sono di 40 px e stanno in 420 px con gli spazi. Vedi calendario.js.
import React from 'react'
import { color as T, font, radius as R, tnum } from '../../lib/theme'
import { nomeMese, dataBreve } from '../../lib/formatoAnalisi'
import { TitoloGrafico, Riquadro } from '../../components/analisi'
import { calendarioGiorni, titoloCalendario } from './calendario'

const INTESTA = ['lu', 'ma', 'me', 'gi', 've', 'sa', 'do']
const PAROLA = { registrato: 'registrato', parziale: 'registrato solo in qualche sede', vuoto: 'niente registrato' }

export default function CalendarioGiorni({ righe, da, a, sedi = [], isMobile, stile = null }) {
  const { mesi, conteggio } = calendarioGiorni(righe, { da, a, sedi })
  const piuSedi = sedi.length > 1
  const lato = isMobile ? 40 : 32
  const casella = (stato) => ({
    width: lato, height: lato, boxSizing: 'border-box', borderRadius: R.sm,
    display: 'flex', alignItems: 'center', justifyContent: 'center', ...tnum,
    fontSize: font.size.sm, fontWeight: 600,
    ...(stato === 'registrato' ? { background: T.graficoReale, color: T.white }
      // Contorno ambra pieno e fondo chiaro: sulle righe il numero del
      // giorno non si leggeva (foto del 04/10).
      : stato === 'parziale' ? { background: T.amberLight, color: T.amberDark, border: `2px solid ${T.amber}` }
        : { border: `1.5px dashed ${T.textSoft}`, color: T.textSoft }),
  })
  return (
    <Riquadro isMobile={isMobile} stile={stile}>
      <TitoloGrafico titolo={titoloCalendario(conteggio, { piuSedi })}
        sottotitolo={`Pieno: registrato${piuSedi ? ' in tutte le sedi. Bordo ambra: solo in qualche sede' : ''}. Tratteggiato: niente registrato, per una chiusura o una dimenticanza.`} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 16 : 24 }}>
        {mesi.map(m => (
          <div key={m.chiave} style={{ minWidth: 0 }}>
            <div style={{ fontSize: font.size.md, fontWeight: 700, color: T.text, lineHeight: '20px', marginBottom: 6 }}>
              {nomeMese(m.chiave, { anno: false })[0].toUpperCase() + nomeMese(m.chiave, { anno: false }).slice(1)}
            </div>
            <div role="grid" aria-label={`Giorni registrati di ${nomeMese(m.chiave)}`}
              style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${lato}px)`, gap: 4 }}>
              {INTESTA.map(g => (
                <div key={g} role="columnheader" style={{ fontSize: font.size.sm, color: T.textSoft, textAlign: 'center', lineHeight: '16px' }}>{g}</div>
              ))}
              {m.settimane.flat().map((c, i) => (c ? (
                <div key={c.data} role="gridcell" style={casella(c.stato)}
                  aria-label={`${dataBreve(c.data)}: ${PAROLA[c.stato]}${c.stato === 'parziale' ? ` (${c.sediRegistrate} su ${sedi.length})` : ''}`}
                  title={`${dataBreve(c.data)}: ${PAROLA[c.stato]}`}>
                  {Number(c.data.slice(8, 10))}
                </div>
              ) : <div key={`v${i}`} aria-hidden="true" />))}
            </div>
          </div>
        ))}
      </div>
    </Riquadro>
  )
}
