// ── Una linea grande come una parola ────────────────────────────────────
//
// La «sparkline» di Tufte, per le righe del conto economico: l'andamento dei
// 12 mesi accanto al numero, senza assi e senza legenda. I mesi senza dato
// restano un buco nella linea, non uno zero che la tira giù.
//
// 04/10/2026 (audit del design, C7 e CE8): la linea era di 1,75 px e il
// punto finale di raggio 3 (la guida dei grafici vuole 2 px e almeno 4), e
// il punto stava sempre sull'ultimo mese, non su quello che la pagina sta
// guardando. Adesso: linea 2 px, punto di raggio 4 con l'anello bianco, sul
// mese scelto (`scelto`); un mese isolato fra due buchi è un punto che si
// vede; a richiesta la banda grigia della normalità dietro la linea
// (ricerca design §3.9).
import React from 'react'
import { color as T } from '../../lib/theme'

const LINEA = 2
const RAGGIO = 4
const ANELLO = 2

/**
 * I segmenti della linea, spezzati dove manca il dato, e la posizione di
 * ogni mese. `banda` ([basso, alto]) entra nella scala, così non esce dal
 * disegno.
 */
export function segmentiAndamentino(valori = [], larghezza = 84, altezza = 22, margine = RAGGIO + ANELLO / 2, banda = null) {
  const numeri = valori.map(v => (v == null || !Number.isFinite(Number(v)) ? null : Number(v)))
  const presenti = numeri.filter(v => v != null)
  if (!presenti.length) return { segmenti: [], ultimo: null, punto: () => null, y: () => null }
  const conBanda = banda && banda.every(x => Number.isFinite(Number(x))) ? banda.map(Number) : []
  const min = Math.min(...presenti, ...conBanda)
  const max = Math.max(...presenti, ...conBanda)
  const span = max - min || 1
  const passo = numeri.length > 1 ? (larghezza - margine * 2) / (numeri.length - 1) : 0
  const y = (v) => altezza - margine - ((v - min) / span) * (altezza - margine * 2)
  const xy = (v, i) => [margine + i * passo, y(v)]
  const segmenti = []
  let corrente = []
  numeri.forEach((v, i) => {
    if (v == null) { if (corrente.length) segmenti.push(corrente); corrente = []; return }
    corrente.push(xy(v, i))
  })
  if (corrente.length) segmenti.push(corrente)
  let ultimo = null
  for (let i = numeri.length - 1; i >= 0; i--) { if (numeri[i] != null) { ultimo = xy(numeri[i], i); break } }
  const punto = (i) => (i != null && numeri[i] != null ? xy(numeri[i], i) : null)
  return { segmenti, ultimo, punto, y }
}

/**
 * @param {object} p
 * @param {(number|null)[]} p.valori  i mesi, dal più vecchio
 * @param {number} [p.scelto]  l'indice del mese che la pagina sta guardando: lì va il punto
 *   (di base l'ultimo mese con un dato). Se quel mese non ha dato, niente punto.
 * @param {[number, number]} [p.banda]  la fascia della normalità (es. la metà centrale dei 12 mesi prima)
 * @param {number} [p.larghezza]  stessa larghezza in tutte le righe di una tabella
 * @param {number} [p.altezza]
 * @param {string} [p.etichetta]  per chi legge lo schermo
 */
export default function Andamentino({ valori = [], scelto = null, banda = null, larghezza = 84, altezza = 22, etichetta = 'Andamento' }) {
  const { segmenti, ultimo, punto, y } = segmentiAndamentino(valori, larghezza, altezza, undefined, banda)
  if (!segmenti.length) return <span style={{ display: 'inline-block', width: larghezza, height: altezza }} aria-hidden="true" />
  const evidenziato = scelto == null ? ultimo : punto(scelto)
  const bandaOk = banda && banda.every(x => Number.isFinite(Number(x)))
  return (
    <svg width={larghezza} height={altezza} viewBox={`0 0 ${larghezza} ${altezza}`} role="img" aria-label={etichetta} style={{ display: 'block', overflow: 'visible' }}>
      {bandaOk && (() => {
        const [a, b] = [y(Math.max(...banda)), y(Math.min(...banda))]
        return <rect x={0} y={a} width={larghezza} height={Math.max(1, b - a)} fill={T.bgMuted} />
      })()}
      {segmenti.map((s, i) => s.length === 1 ? (
        // Un mese isolato fra due buchi: un punto largo il doppio della linea.
        <circle key={i} cx={s[0][0]} cy={s[0][1]} r={LINEA} fill={T.graficoReale} />
      ) : (
        <polyline key={i} points={s.map(p => p.join(',')).join(' ')} fill="none" stroke={T.graficoReale}
          strokeWidth={LINEA} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {evidenziato && <circle cx={evidenziato[0]} cy={evidenziato[1]} r={RAGGIO} fill={T.graficoReale} stroke={T.bgCard} strokeWidth={ANELLO} />}
    </svg>
  )
}
