// ── La pagina dell'Analisi: larghezza e ritmo verticale, in un posto solo ──
//
// Audit del design del 04/10/2026 (C10, e PR1): ogni vista decideva da sé
// larghezza e spazi. Previsioni era larga 1040 px e le sorelle 1200, così
// passando da una all'altra titolo e riquadri saltavano di 80 px; fra un
// blocco e l'altro c'erano 10, 12, 14, 16 o 18 px, a seconda di chi aveva
// scritto il margine.
//
// ANALISI_DESIGN §6: «lo spazio fra i blocchi lo possiede il contenitore della
// pagina, non i pezzi». Qui:
//   • larghezza massima 1200 px, centrata, per tutte le pagine;
//   • 24 px fra un riquadro e l'altro al computer, 16 al telefono;
//   • 40 px fra una sezione e l'altra al computer, 32 al telefono
//     (`SezioneAnalisi`).
// I margini verticali dei figli diretti si azzerano: un pezzo comune che
// porta ancora il suo `marginBottom` (l'intestazione, la copertura) non può
// sommarlo allo spazio della pagina.
import React from 'react'
import { space } from '../../lib/theme'

/** Le misure del ritmo, per chi deve disegnare una griglia dentro la pagina. */
export const RITMO = {
  larghezza: 1200,
  riquadri: { telefono: space[4], computer: space[6] },
  sezioni: { telefono: space[8], computer: space[10] },
}

/** Lo spazio fra due riquadri affiancati o impilati: 24 al computer, 16 al telefono. */
export const spazioRiquadri = (isMobile) => (isMobile ? RITMO.riquadri.telefono : RITMO.riquadri.computer)
const spazioSezioni = (isMobile) => (isMobile ? RITMO.sezioni.telefono : RITMO.sezioni.computer)

export const CLASSE_PAGINA = 'fos-pagina-analisi'
// Un `style` in linea vince su un foglio di stile: per questo `!important`.
export const REGOLA_PAGINA = `.${CLASSE_PAGINA}>*{margin-top:0!important;margin-bottom:0!important}`

/**
 * @param {object} p
 * @param {React.ReactNode} p.children  i blocchi della pagina, dall'alto
 * @param {boolean} [p.isMobile]
 * @param {boolean} [p.attenuata]  mentre rilegge: il contenuto vecchio resta, sbiadito
 */
export default function PaginaAnalisi({ children, isMobile = false, attenuata = false }) {
  return (
    <div className={CLASSE_PAGINA} style={{
      maxWidth: RITMO.larghezza, width: '100%', margin: '0 auto', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: spazioRiquadri(isMobile),
      opacity: attenuata ? 0.6 : 1, transition: 'opacity 120ms',
    }}>
      <style>{REGOLA_PAGINA}</style>
      {children}
    </div>
  )
}

/**
 * Un gruppo di riquadri che parlano della stessa cosa. Dalla sezione prima
 * la separano 40 px (32 al telefono): i 24 dello spazio della pagina più
 * 16 qui sopra.
 */
export function SezioneAnalisi({ children, isMobile = false, etichetta }) {
  return (
    <section aria-label={etichetta} style={{
      display: 'flex', flexDirection: 'column', gap: spazioRiquadri(isMobile),
      paddingTop: spazioSezioni(isMobile) - spazioRiquadri(isMobile), minWidth: 0,
    }}>
      {children}
    </section>
  )
}
