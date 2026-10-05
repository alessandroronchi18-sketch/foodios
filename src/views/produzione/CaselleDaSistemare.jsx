// ── Le caselle dell'inventario da sistemare, col giorno giusto ────────────
//
// Nei dati di Mara 550 caselle negative su 575 (maggio-agosto) vengono da
// una rimanenza lasciata a 0 nel giorno in cui si era prodotto: quel giorno
// il venduto esce troppo alto, il giorno dopo negativo. La casella da
// correggere è quella del giorno PRIMA (vedi tests/unit/rimanenzaAZero…).
// Il dato non si corregge da qui: si dice quale casella aprire.
// Spostato qui dalla pagina il 04/10/2026, con gli stessi testi.
import React, { useState } from 'react'
import { color as T, font, radius as R } from '../../lib/theme'
import { conGiorno } from '../../lib/produzioneAnalisi'
import Icon from '../../components/Icon'
import { kg, intero } from './numeri'

export default function CaselleDaSistemare({ riassunto, caselle, nomeSede, onApri = null }) {
  const [tutte, setTutte] = useState(false)
  if (!riassunto || riassunto.n === 0) return null
  const visibili = tutte ? caselle : caselle.slice(0, 5)
  return (
    <div data-caselle style={{
      background: T.fondoAvviso, border: `1px solid ${T.bordoAvviso}`, borderRadius: R.xl,
      padding: '12px 14px', fontSize: font.size.sm, color: T.amberDark,
      lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start',
    }}>
      <span style={{ display: 'inline-flex', marginTop: 2, flexShrink: 0 }} aria-hidden="true"><Icon name="alert" size={14} /></span>
      <span style={{ minWidth: 0 }}>
        <b>{riassunto.n === 1 ? 'Una casella da sistemare' : `${intero(riassunto.n)} caselle da sistemare`}</b>
        {riassunto.nRimanenza > 0 && riassunto.nAltre > 0
          ? `: ${intero(riassunto.nRimanenza)} con la rimanenza a 0 e ${intero(riassunto.nAltre)} che non tornano per altri motivi.`
          : ':'}
        {riassunto.nRimanenza > 0 && (
          <>
            {' '}Rimanenza rimasta a 0 nel giorno in cui si era prodotto, e il giorno dopo il venduto
            risulta negativo. È lo stesso gelato, contato nel giorno sbagliato.
            {riassunto.kgFuori < 0
              ? ` Il venduto del periodo è più basso del vero di ${kg(-riassunto.kgFuori)} kg, perché il giorno da sistemare è prima del periodo.`
              : ' Il venduto del periodo è giusto; quello dei singoli giorni no.'}
          </>
        )}
        {riassunto.nAltre > 0 && (
          <>
            {' '}{riassunto.nRimanenza > 0 ? `Le ${intero(riassunto.nAltre)} che non tornano` : 'Non tornano'} ({kg(-riassunto.kgAltre)} kg): la rimanenza scritta è più alta di quanto c&apos;era a disposizione.
          </>
        )}
        <span style={{ display: 'block', marginTop: 4 }}>
          Da sistemare: {visibili.map(c => {
            const sede = nomeSede(c.sedeId)
            return `${c.gusto}${sede ? ` a ${sede}` : ''} ${conGiorno('il', c.giornoDaSistemare)}`
          }).join(', ')}
          {!tutte && caselle.length > 5 ? ` e altre ${intero(caselle.length - 5)}` : ''}.
        </span>
        <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 2 }}>
          {caselle.length > 5 && (
            <button type="button" onClick={() => setTutte(v => !v)} style={stileLink}>
              {tutte ? 'Mostra le prime 5' : 'Vedi tutte'}
            </button>
          )}
          {onApri && <button type="button" onClick={onApri} style={stileLink}>Apri l&apos;inventario</button>}
        </span>
      </span>
    </div>
  )
}

const stileLink = {
  border: 'none', background: 'transparent', color: T.brand, fontWeight: 700, fontSize: font.size.sm,
  cursor: 'pointer', fontFamily: 'inherit', padding: '10px 0', margin: '-6px 0', minHeight: 40,
}
