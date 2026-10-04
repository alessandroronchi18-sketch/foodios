// ── Che giorno vendo di più? ──────────────────────────────────────────────
//
// «Come vanno i lunedì» è la domanda che un gelatiere si fa davvero: quanto
// preparo per il martedì, chi metto in turno la domenica, conviene aprire il
// lunedì. La pagina di prima non la poteva dire. Il conto è
// `perGiornoDellaSettimana` (lib/produzioneQuadro): il venduto medio di ogni
// giorno, sui soli giorni registrati — un giorno mai registrato è «non lo
// so», non zero.
//
// Sette righe, una barra per riga, tutte nel colore del dato: il giorno
// migliore lo dice il titolo, non un colore diverso (ANALISI_DESIGN.md §3).
import React from 'react'
import { color as T, font, tnum } from '../../lib/theme'
import { TitoloGrafico, Riquadro } from '../../components/analisi'
import { kgTessera, intero } from './numeri'

const ARTICOLO = { Domenica: 'la domenica' }
const conArticolo = (nome) => ARTICOLO[nome] || `il ${nome.toLowerCase()}`
// Una media su un giorno solo non è una media: per il titolo servono almeno
// due giornate dello stesso giorno della settimana.
const MINIMO_GIORNI = 2

/** «Il martedì vendi di più (272 kg al giorno), il giovedì di meno (97 kg)». */
export function titoloGiorni(giorni = []) {
  const buoni = giorni.filter(g => g.mediaG != null && g.nGiorni >= MINIMO_GIORNI)
  if (buoni.length < 2) return 'Il venduto di ogni giorno della settimana'
  const max = buoni.reduce((x, y) => (y.mediaG > x.mediaG ? y : x))
  const min = buoni.reduce((x, y) => (y.mediaG < x.mediaG ? y : x))
  const t = `${conArticolo(max.nome)} vendi di più (${kgTessera(max.mediaG / 1000)} al giorno), ${conArticolo(min.nome)} di meno (${kgTessera(min.mediaG / 1000)})`
  return t[0].toUpperCase() + t.slice(1)
}

export default function GiornoSettimana({ giorni = [], caselleDaSistemare = 0, isMobile, stile = null }) {
  const max = Math.max(1, ...giorni.map(g => g.mediaG || 0))
  return (
    <Riquadro isMobile={isMobile} stile={stile}>
      <TitoloGrafico titolo={titoloGiorni(giorni)}
        sottotitolo={`Venduto medio di ogni giorno della settimana, sui giorni registrati.${caselleDaSistemare > 0 ? ' Con le caselle da sistemare qualche chilo finisce nel giorno dopo: contano le differenze grandi.' : ''}`} />
      <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {giorni.map(g => (
          <div key={g.giorno} role="listitem"
            aria-label={`${g.nome}: ${g.mediaG == null ? 'nessun giorno registrato' : `${kgTessera(g.mediaG / 1000)} al giorno, su ${g.nGiorni === 1 ? 'un giorno' : `${intero(g.nGiorni)} giorni`}`}`}
            style={{ display: 'grid', gridTemplateColumns: `${isMobile ? 34 : 40}px minmax(0, 1fr) auto`, gap: 10, alignItems: 'center', minHeight: 24 }}>
            <span style={{ fontSize: font.size.base, color: T.textMid, fontWeight: 600 }}>{g.nome.slice(0, 3).toLowerCase()}</span>
            <div style={{ height: 12, background: T.graficoGriglia, borderRadius: 4, overflow: 'hidden' }} aria-hidden="true">
              {g.mediaG != null && g.mediaG > 0 && (
                <div style={{ width: `${Math.min(100, (g.mediaG / max) * 100)}%`, height: '100%', background: T.graficoReale, borderRadius: '0 4px 4px 0' }} />
              )}
            </div>
            <span style={{ ...tnum, fontSize: font.size.base, textAlign: 'right', whiteSpace: 'nowrap', minWidth: isMobile ? 64 : 130 }}>
              {g.mediaG == null
                // «nessun giorno», non «non registrato»: nella stessa pagina
                // «non registrato» è lo scarto mai scritto, e le due cose si
                // confondevano.
                ? <span style={{ color: T.textSoft }}>nessun giorno</span>
                : <>
                  <b style={{ color: T.text }}>{kgTessera(g.mediaG / 1000)}</b>
                  {!isMobile && <span style={{ color: T.textSoft }}> · {g.nGiorni === 1 ? '1 giorno' : `${intero(g.nGiorni)} giorni`}</span>}
                </>}
            </span>
          </div>
        ))}
      </div>
    </Riquadro>
  )
}
