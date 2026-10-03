// ── Una linea grande come una parola ────────────────────────────────────
//
// La «sparkline» di Tufte, per le righe del conto economico: l'andamento dei
// 12 mesi accanto al numero, senza assi e senza legenda. I mesi senza dato
// restano un buco nella linea, non uno zero che la tira giù.
import React from 'react'
import { color as T } from '../../lib/theme'

/** I segmenti della linea, spezzati dove manca il dato. */
export function segmentiAndamentino(valori = [], larghezza = 84, altezza = 22, margine = 3) {
  const numeri = valori.map(v => (v == null || !Number.isFinite(Number(v)) ? null : Number(v)))
  const presenti = numeri.filter(v => v != null)
  if (!presenti.length) return { segmenti: [], ultimo: null }
  const min = Math.min(...presenti)
  const max = Math.max(...presenti)
  const span = max - min || 1
  const passo = numeri.length > 1 ? (larghezza - margine * 2) / (numeri.length - 1) : 0
  const xy = (v, i) => [margine + i * passo, altezza - margine - ((v - min) / span) * (altezza - margine * 2)]
  const segmenti = []
  let corrente = []
  numeri.forEach((v, i) => {
    if (v == null) { if (corrente.length) segmenti.push(corrente); corrente = []; return }
    corrente.push(xy(v, i))
  })
  if (corrente.length) segmenti.push(corrente)
  let ultimo = null
  for (let i = numeri.length - 1; i >= 0; i--) { if (numeri[i] != null) { ultimo = xy(numeri[i], i); break } }
  return { segmenti, ultimo }
}

/**
 * @param {{ valori: (number|null)[], larghezza?: number, altezza?: number, etichetta?: string }} p
 */
export default function Andamentino({ valori = [], larghezza = 84, altezza = 22, etichetta = 'Andamento' }) {
  const { segmenti, ultimo } = segmentiAndamentino(valori, larghezza, altezza)
  if (!segmenti.length) return <span style={{ display: 'inline-block', width: larghezza, height: altezza }} aria-hidden="true" />
  return (
    <svg width={larghezza} height={altezza} viewBox={`0 0 ${larghezza} ${altezza}`} role="img" aria-label={etichetta} style={{ display: 'block', overflow: 'visible' }}>
      {segmenti.map((s, i) => s.length === 1 ? (
        <circle key={i} cx={s[0][0]} cy={s[0][1]} r={1.5} fill={T.graficoReale} />
      ) : (
        <polyline key={i} points={s.map(p => p.join(',')).join(' ')} fill="none" stroke={T.graficoReale}
          strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {ultimo && <circle cx={ultimo[0]} cy={ultimo[1]} r={3} fill={T.graficoReale} stroke={T.bgCard} strokeWidth={1.5} />}
    </svg>
  )
}
