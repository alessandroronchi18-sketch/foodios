// ── I negozi uno accanto all'altro ────────────────────────────────────────
//
// Mara ha tre sedi. La pagina di prima, in «Tutte le sedi», sommava tutto e
// non diceva mai quanto pesasse ognuna, né se una avesse smesso di
// registrare prima delle altre. Il conto è `sediAffiancate`
// (lib/produzioneQuadro, il motore sede per sede: le spedizioni fra sedi non
// si contano due volte). Stessa scala per tutte, stesso colore: la sede che
// vende di più la dice il titolo.
//
// Se una sede ha meno giorni registrati, il confronto giusto è il venduto per
// giorno registrato, e la sede lo dice («registrato fino al 15/08»).
import React from 'react'
import { color as T, font, tnum } from '../../lib/theme'
import { quota } from '../../lib/formatoAnalisi'
import { conGiorno } from '../../lib/produzioneAnalisi'
import { TitoloGrafico, Riquadro } from '../../components/analisi'
import { kgTessera, intero } from './numeri'

/** «Carlina vende di più: 5.069 kg, il 43% del totale». */
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

export default function SediAffiancate({ sedi = [], isMobile, stile = null }) {
  if (sedi.length < 2) return null
  const max = Math.max(1, ...sedi.map(s => Math.max(s.vendutoG, s.prodottoG)))
  const tot = sedi.reduce((s, x) => s + x.vendutoG, 0)
  const ultimoDiTutte = sedi.map(s => s.ultimo).filter(Boolean).sort().pop()
  return (
    <Riquadro isMobile={isMobile} stile={stile}>
      <TitoloGrafico titolo={titoloSedi(sedi)}
        sottotitolo="Stesso conto, negozio per negozio, sulla stessa scala. Barra scura: venduto. Barra chiara: prodotto." />
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(sedi.length, 4)}, minmax(0, 1fr))`, gap: isMobile ? 16 : 22 }}>
        {sedi.map(s => {
          const fermo = s.ultimo && ultimoDiTutte && s.ultimo < ultimoDiTutte
          return (
            <div key={s.sedeId || s.nome} style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: font.size.md, fontWeight: 800, color: T.text }}>{s.nome}</span>
                <span style={{ ...tnum, fontSize: font.size.sm, color: T.textSoft }}>{tot > 0 ? `${quota((s.vendutoG / tot) * 100)} del venduto` : ''}</span>
              </div>
              <Barra etichetta="Venduto" valore={s.vendutoG} max={max} colore={T.graficoReale} forte />
              <Barra etichetta="Prodotto" valore={s.prodottoG} max={max} colore={T.graficoConfronto} />
              <Riga voce="Al giorno registrato" valore={s.giorni > 0 ? kgTessera(s.vendutoG / s.giorni / 1000) : 'non lo so'} />
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

function Barra({ etichetta, valore, max, colore, forte = false }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.size.sm, color: T.textSoft, marginBottom: 2 }}>
        <span>{etichetta}</span>
        <span style={{ ...tnum, color: forte ? T.text : T.textMid, fontWeight: forte ? 700 : 500 }}>{kgTessera(valore / 1000)}</span>
      </div>
      <div style={{ height: 10, background: T.graficoGriglia, borderRadius: 4, overflow: 'hidden' }} aria-hidden="true">
        <div style={{ width: `${Math.max(0, Math.min(100, (valore / max) * 100))}%`, height: '100%', background: colore, borderRadius: '0 4px 4px 0' }} />
      </div>
    </div>
  )
}

function Riga({ voce, valore, nota = null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '4px 0', fontSize: font.size.base, borderTop: `1px solid ${T.borderSoft}` }}>
      <span style={{ color: T.textSoft }}>{voce}</span>
      <span style={{ ...tnum, color: T.text, textAlign: 'right' }}>
        {valore}
        {nota && <span style={{ display: 'block', fontSize: font.size.sm, color: T.amberDark }}>{nota}</span>}
      </span>
    </div>
  )
}
