// ── Un periodo senza giorni registrati non è una tabella di zeri ──────────
//
// Con «30 giorni» su Carlina, a ottobre, la pagina di prima mostrava 22 gusti
// a 0,0 kg e −100% su tutto: le righe arrivano con i sette giorni prima del
// periodo (la giacenza di partenza) e il controllo guardava quelle. Qui si
// dice dove finiscono i dati e si porta lì con un tocco.
import React from 'react'
import { color as T, font, radius as R } from '../../lib/theme'
import { conGiorno } from '../../lib/produzioneAnalisi'
import { formatLocalDate } from '../../lib/dateLocal'
import { Riquadro } from '../../components/analisi'

export default function PeriodoVuoto({ dateFrom, dateTo, ultimo = null, onPeriodo = null, onInventario = null, isMobile }) {
  return (
    <Riquadro isMobile={isMobile} stile={{ textAlign: 'center', marginBottom: 20 }}>
      <div style={{ fontSize: font.size.lg, fontWeight: 700, color: T.text, marginBottom: 6 }}>
        {dateFrom && dateTo
          ? `Nessun giorno registrato ${conGiorno('dal', dateFrom, { lunga: true })} ${conGiorno('al', dateTo, { lunga: true })}.`
          : 'Nessun giorno registrato nel periodo scelto.'}
      </div>
      {ultimo && (
        <div style={{ fontSize: font.size.md, color: T.textMid }}>L&apos;ultimo giorno registrato è {conGiorno('il', ultimo, { lunga: true })}.</div>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
        {ultimo && onPeriodo && (
          <button type="button" style={pulsante(true)} onClick={() => {
            const [y, m, d] = ultimo.split('-').map(Number)
            onPeriodo(formatLocalDate(new Date(y, m - 3, d)), ultimo)
          }}>
            Guarda i due mesi fino {conGiorno('al', ultimo)}
          </button>
        )}
        {onInventario && <button type="button" style={pulsante(false)} onClick={onInventario}>Registra l&apos;inventario</button>}
      </div>
    </Riquadro>
  )
}

const pulsante = (principale) => ({
  minHeight: 44, padding: '10px 18px', borderRadius: R.lg, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: font.size.md, fontWeight: 700,
  border: `1px solid ${principale ? T.brand : T.border}`,
  background: principale ? T.brand : T.bgCard, color: principale ? T.white : T.brand,
})
