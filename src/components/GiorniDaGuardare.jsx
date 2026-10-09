// «Giorni da guardare»: le giornate in cui due fonti dei soldi non tornano.
//
// Lo scontrino fiscale vince (regola del titolare, 09/10/2026) e il registro è
// il controllo: se le due cifre distano più di 1 €, qui si vedono tutte e due,
// con la differenza e, quando c'è, la nota (es. uno scontrino annullato).
// Con una fonte sola, o con cifre uguali, l'elenco non compare.

import React from 'react'
import { color as T, radius as R } from '../lib/theme'
import { fmt } from '../views/_shared'
import { giorniDaGuardare, NOME_FONTE, normalizzaFonte } from '../lib/confrontoFonti'

const MAX_RIGHE = 8
const giornoIt = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const nome = (f) => NOME_FONTE[normalizzaFonte(f)] || f

export default function GiorniDaGuardare({ chiusure, onVai }) {
  const giorni = giorniDaGuardare(chiusure)
  if (giorni.length === 0) return null
  const visti = giorni.slice(0, MAX_RIGHE)
  return (
    <div data-testid="giorni-da-guardare" style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R['2xl'], padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: T.text, marginBottom: 2 }}>Giorni da guardare</div>
      <div style={{ color: T.textSoft, marginBottom: 10 }}>
        Due fonti con cifre diverse. Conta {nome('foto')}.
      </div>
      {visti.map(g => (
        <button key={`${g.sede_id || ''}${g.data}`} type="button" onClick={() => onVai && onVai(g.data)}
          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderTop: `1px solid ${T.border}`, padding: '8px 0', cursor: onVai ? 'pointer' : 'default', color: T.text }}>
          <span style={{ fontWeight: 600 }}>{giornoIt(g.data)}</span>
          {' · '}{nome(g.vincente.fonte)} {fmt(g.vincente.totale)}
          {' · '}{nome(g.altra.fonte)} {fmt(g.altra.totale)}
          {' · '}<span style={{ color: T.amber, fontWeight: 600 }}>differenza {fmt(Math.abs(g.differenza))}</span>
          {g.nota && <div style={{ color: T.textSoft }}>{g.nota}</div>}
        </button>
      ))}
      {giorni.length > MAX_RIGHE && (
        <div style={{ color: T.textSoft, paddingTop: 8 }}>e altri {giorni.length - MAX_RIGHE} giorni</div>
      )}
    </div>
  )
}
