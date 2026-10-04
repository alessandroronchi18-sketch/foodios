// ── Che giorno vendo di più? ──────────────────────────────────────────────
//
// «Come vanno i lunedì» è la domanda che un gelatiere si fa davvero: quanto
// preparo per il martedì, chi metto in turno la domenica, conviene aprire il
// lunedì. La pagina di prima non la poteva dire. Il conto è
// `perGiornoDellaSettimana` (lib/produzioneQuadro): il venduto medio di ogni
// giorno, sui soli giorni registrati — un giorno mai registrato è «nessun
// giorno», non zero.
//
// Sette righe, una barra per riga, nel colore del dato: il giorno migliore lo
// dice il titolo, non un colore diverso (ANALISI_DESIGN.md §3). In ambra i
// giorni FALSATI dalle rimanenze lasciate a 0 (`giorniFalsati`): sui dati di
// Mara il titolo diceva «il martedì vendi di più», ed era la compilazione
// del foglio, non le vendite. Un giorno falsato non entra nella conclusione.
import React from 'react'
import { color as T, font, tnum } from '../../lib/theme'
import { TitoloGrafico, Riquadro } from '../../components/analisi'
import { kgTessera, intero, elenco } from './numeri'

const conArticolo = (nome) => (nome === 'Domenica' ? 'la domenica' : `il ${nome.toLowerCase()}`)
const maiuscola = (t) => t[0].toUpperCase() + t.slice(1)
// Una media su un giorno solo non è una media: per il titolo servono almeno
// due giornate dello stesso giorno della settimana.
const MINIMO_GIORNI = 2

/**
 * La conclusione: il titolo (dieci parole al massimo), il dettaglio, e il
 * giorno di cui parla il titolo, l'unico disegnato scuro.
 * «Il sabato vendi di più: 215 kg al giorno».
 */
export function conclusioneGiorni(giorni = []) {
  const falsati = giorni.filter(g => g.falsato)
  // Ogni casella una volta sola: i chili persi da un giorno sono quelli
  // presi dal giorno prima.
  const kgFuori = kgTessera(giorni.reduce((s, g) => s + (g.persiKg || 0), 0))
  const nomi = elenco(falsati.map(g => g.nome.toLowerCase()))
  // Con tre giorni o più falsati il confronto fra quelli rimasti non dice
  // niente di utile: la conclusione è che il foglio va sistemato.
  if (falsati.length >= 3) {
    return {
      titolo: `${falsati.length} giorni su 7 non si possono confrontare`,
      dettaglio: `${maiuscola(nomi)}: la rimanenza lasciata a 0 fa contare almeno ${kgFuori} il giorno prima del vero.`,
      forte: null,
    }
  }
  const nota = falsati.length
    ? ` ${maiuscola(nomi)} ${falsati.length === 1 ? 'è falsato' : 'sono falsati'} dalla rimanenza lasciata a 0 (in tutto almeno ${kgFuori} contati il giorno prima del vero): ${falsati.length === 1 ? 'resta' : 'restano'} fuori dal confronto.`
    : ''
  const buoni = giorni.filter(g => !g.falsato && g.mediaG != null && g.nGiorni >= MINIMO_GIORNI)
  if (buoni.length < 2) return { titolo: 'Il venduto di ogni giorno della settimana', dettaglio: nota.trim(), forte: null }
  const max = buoni.reduce((x, y) => (y.mediaG > x.mediaG ? y : x))
  const min = buoni.reduce((x, y) => (y.mediaG < x.mediaG ? y : x))
  return {
    titolo: maiuscola(`${conArticolo(max.nome)} vendi di più: ${kgTessera(max.mediaG / 1000)} al giorno`),
    dettaglio: `Il giorno più basso è ${conArticolo(min.nome)}: ${kgTessera(min.mediaG / 1000)}.${nota}`,
    forte: max.giorno,
  }
}

export const titoloGiorni = (giorni) => conclusioneGiorni(giorni).titolo

/** Il sottotitolo: il dettaglio della conclusione, poi cosa è disegnato. */
export function sottotitoloGiorni(giorni = []) {
  const { dettaglio } = conclusioneGiorni(giorni)
  const falsati = giorni.some(g => g.falsato)
  return `${dettaglio ? `${dettaglio} ` : ''}Venduto medio di ogni giorno della settimana, sui giorni registrati.${falsati ? ' A righe ambra i giorni falsati.' : ''}`
}

export default function GiornoSettimana({ giorni = [], isMobile, stile = null }) {
  const max = Math.max(1, ...giorni.map(g => g.mediaG || 0))
  const { titolo, forte } = conclusioneGiorni(giorni)
  // Il giorno del titolo scuro, gli altri chiari, i falsati a righe ambra.
  const fondo = (g) => (g.falsato ? `repeating-linear-gradient(45deg, ${T.amber} 0 2px, ${T.amberLight} 2px 6px)`
    : g.giorno === forte ? T.graficoReale : T.graficoConfronto)
  return (
    <Riquadro isMobile={isMobile} stile={stile}>
      <TitoloGrafico titolo={titolo} sottotitolo={sottotitoloGiorni(giorni)} />
      <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {giorni.map(g => (
          <div key={g.giorno} role="listitem"
            aria-label={`${g.nome}: ${g.mediaG == null ? 'nessun giorno registrato' : `${kgTessera(g.mediaG / 1000)} al giorno, su ${g.nGiorni === 1 ? 'un giorno' : `${intero(g.nGiorni)} giorni`}`}${g.falsato ? `, falsato: almeno ${kgTessera(g.spostatiKg)} contati nel giorno sbagliato` : ''}`}
            title={g.falsato ? `Almeno ${kgTessera(g.spostatiKg)} contati nel giorno sbagliato per la rimanenza lasciata a 0` : undefined}
            style={{ display: 'grid', gridTemplateColumns: `${isMobile ? 34 : 40}px minmax(0, 1fr) auto`, gap: 10, alignItems: 'center', minHeight: 24 }}>
            <span style={{ fontSize: font.size.base, color: T.textMid, fontWeight: 600 }}>{g.nome.slice(0, 3).toLowerCase()}</span>
            <div style={{ height: 12, background: T.graficoGriglia, borderRadius: 4, overflow: 'hidden' }} aria-hidden="true">
              {g.mediaG != null && g.mediaG > 0 && (
                <div style={{ width: `${Math.min(100, (g.mediaG / max) * 100)}%`, height: '100%', background: fondo(g), borderRadius: '0 4px 4px 0' }} />
              )}
            </div>
            <span style={{ ...tnum, fontSize: font.size.base, textAlign: 'right', whiteSpace: 'nowrap', minWidth: isMobile ? 64 : 130 }}>
              {g.mediaG == null
                // «nessun giorno», non «non registrato»: nella stessa pagina
                // «non registrato» è lo scarto mai scritto.
                ? <span style={{ color: T.textSoft }}>nessun giorno</span>
                : <>
                  <b style={{ color: g.falsato ? T.amberDark : T.text }}>{kgTessera(g.mediaG / 1000)}</b>
                  {!isMobile && <span style={{ color: T.textSoft }}> · {g.falsato ? 'falsato' : g.nGiorni === 1 ? '1 giorno' : `${intero(g.nGiorni)} giorni`}</span>}
                </>}
            </span>
          </div>
        ))}
      </div>
    </Riquadro>
  )
}
