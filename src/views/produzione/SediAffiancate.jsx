// ── Le sedi, in pannelli uguali ───────────────────────────────────────────
//
// Mara ha tre sedi. La pagina di prima, in «Tutte le sedi», sommava tutto e
// non diceva mai quanto pesasse ognuna, né se una avesse smesso di
// registrare prima delle altre. Il conto è `sediAffiancate` (il motore sede
// per sede: le spedizioni fra sedi non si contano due volte).
//
// Il disegno segue la ricerca del 04/10 (scelta 10, Datawrapper): un
// pannello per sede, tutti uguali e con la stessa scala, il nome dentro il
// pannello; in ognuno la linea della sede in ardesia e le altre sedi in
// grigio dietro. Ordine: dalla sede che vende di più (lo dice il titolo).
// Sotto ogni linea i numeri che servono per confrontarle davvero: il venduto
// per giorno registrato (se una sede ha registrato meno giorni, il totale la
// fa sembrare più piccola), la vetrina, i giorni.
import React from 'react'
import { color as T, font, tnum } from '../../lib/theme'
import { quota } from '../../lib/formatoAnalisi'
import { conGiorno, dataBreve } from '../../lib/produzioneAnalisi'
import { TitoloGrafico, Riquadro } from '../../components/analisi'
import { kgTessera, intero } from './numeri'

/** «Carlina vende di più: 5.069 kg, il 43% del totale» (dieci parole al massimo). */
export function titoloSedi(sedi = []) {
  const tot = sedi.reduce((s, x) => s + x.vendutoG, 0)
  if (sedi.length < 2 || tot <= 0) return 'Le sedi una accanto all\'altra'
  const giorniDiversi = new Set(sedi.map(s => s.giorni)).size > 1
  if (giorniDiversi) {
    // Con giorni diversi il totale premia chi ha registrato di più: si
    // confronta il venduto di un giorno registrato.
    const perGiorno = sedi.filter(s => s.giorni > 0).map(s => ({ ...s, media: s.vendutoG / s.giorni }))
    const top = perGiorno.reduce((x, y) => (y.media > x.media ? y : x))
    return `${top.nome} vende di più: ${kgTessera(top.media / 1000)} per giorno registrato`
  }
  const top = sedi.reduce((x, y) => (y.vendutoG > x.vendutoG ? y : x))
  return `${top.nome} vende di più: ${kgTessera(top.vendutoG / 1000)}, il ${quota((top.vendutoG / tot) * 100)} del totale`
}

const LARGO = 300
const ALTO = 120

/** I punti della linea di una serie, spezzata dove manca il dato. */
export function trattiSerie(serie = [], max = 1) {
  const passo = serie.length > 1 ? LARGO / (serie.length - 1) : 0
  const y = (v) => ALTO - (v / (max || 1)) * (ALTO - 6) - 3
  const tratti = []
  let corrente = []
  serie.forEach((v, i) => {
    if (v == null) { if (corrente.length) tratti.push(corrente); corrente = []; return }
    corrente.push([serie.length > 1 ? i * passo : LARGO / 2, y(v)])
  })
  if (corrente.length) tratti.push(corrente)
  return tratti
}

export default function SediAffiancate({ sedi = [], pannelli = null, isMobile, stile = null }) {
  if (sedi.length < 2) return null
  const tot = sedi.reduce((s, x) => s + x.vendutoG, 0)
  const ultimoDiTutte = sedi.map(s => s.ultimo).filter(Boolean).sort().pop()
  const settimane = pannelli?.settimane || []
  const serieDi = new Map((pannelli?.sedi || []).map(s => [s.sedeId, s.serie]))
  return (
    <Riquadro isMobile={isMobile} stile={stile}>
      <TitoloGrafico titolo={titoloSedi(sedi)}
        sottotitolo="Il venduto delle settimane intere, sede per sede, sulla stessa scala. In grigio, dietro, le altre sedi." />
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(sedi.length, 3)}, minmax(0, 1fr))`, gap: isMobile ? 16 : 24 }}>
        {sedi.map(s => {
          const fermo = s.ultimo && ultimoDiTutte && s.ultimo < ultimoDiTutte
          const mia = serieDi.get(s.sedeId) || []
          return (
            <div key={s.sedeId || s.nome} style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: font.size.md, fontWeight: 800, color: T.text }}>{s.nome}</span>
                <span style={{ ...tnum, fontSize: font.size.md, fontWeight: 700, color: T.text }}>{kgTessera(s.vendutoG / 1000)}</span>
              </div>
              <div style={{ ...tnum, fontSize: font.size.sm, color: T.textSoft, textAlign: 'right', lineHeight: '16px' }}>
                {tot > 0 ? `${quota((s.vendutoG / tot) * 100)} del venduto` : ''}
              </div>
              {settimane.length > 0 && (
                <svg viewBox={`0 0 ${LARGO} ${ALTO}`} preserveAspectRatio="none" role="img"
                  aria-label={`${s.nome}: venduto per settimana`} style={{ display: 'block', width: '100%', height: 120, margin: '8px 0 4px', overflow: 'visible' }}>
                  <line x1="0" x2={LARGO} y1={ALTO - 3} y2={ALTO - 3} stroke={T.graficoGriglia} vectorEffect="non-scaling-stroke" />
                  {(pannelli?.sedi || []).filter(x => x.sedeId !== s.sedeId).map(x => trattiSerie(x.serie, pannelli.max).map((t, i) => (
                    <polyline key={`${x.sedeId}-${i}`} points={t.map(p => p.join(',')).join(' ')} fill="none"
                      stroke={T.graficoConfronto} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                  )))}
                  {trattiSerie(mia, pannelli.max).map((t, i) => (t.length === 1
                    ? <circle key={i} cx={t[0][0]} cy={t[0][1]} r="3" fill={T.graficoReale} />
                    : <polyline key={i} points={t.map(p => p.join(',')).join(' ')} fill="none"
                      stroke={T.graficoReale} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />))}
                </svg>
              )}
              {settimane.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.size.sm, color: T.textSoft, lineHeight: '16px', marginBottom: 8 }}>
                  <span>{dataBreve(settimane[0].dal)}</span><span>{dataBreve(settimane[settimane.length - 1].dal)}</span>
                </div>
              )}
              <Riga voce="Al giorno registrato" valore={s.giorni > 0 ? kgTessera(s.vendutoG / s.giorni / 1000) : 'non lo so'} />
              <Riga voce="Prodotto" valore={kgTessera(s.prodottoG / 1000)} />
              <Riga voce="Vetrina, inizio e fine" valore={`${kgTessera(s.inizioG / 1000)} → ${kgTessera(s.fineG / 1000)}`} />
              <Riga voce="Giorni registrati" valore={intero(s.giorni)}
                nota={fermo ? `registrato fino ${conGiorno('al', s.ultimo)}` : null} />
            </div>
          )
        })}
      </div>
    </Riquadro>
  )
}

function Riga({ voce, valore, nota = null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '4px 0', fontSize: font.size.base, lineHeight: '20px', borderTop: `1px solid ${T.borderSoft}` }}>
      <span style={{ color: T.textSoft }}>{voce}</span>
      <span style={{ ...tnum, color: T.text, textAlign: 'right' }}>
        {valore}
        {nota && <span style={{ display: 'block', fontSize: font.size.sm, color: T.amberDark }}>{nota}</span>}
      </span>
    </div>
  )
}
