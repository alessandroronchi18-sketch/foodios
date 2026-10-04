// ── Una quota contro il suo obiettivo ───────────────────────────────────
//
// ANALISI_DESIGN.md, regola 7 e §6: niente semafori e niente tachimetri. Il
// «bullet graph» di Stephen Few, con le sue misure (ricerca design §3.4):
//   • la barra del valore spessa un terzo del binario, piena e scura;
//   • l'obiettivo è un trattino perpendicolare; l'anno prima un punto, così
//     i due segni non si confondono;
//   • tre fasce di grigio, un colore solo, PIÙ SCURO = PEGGIO: per un costo
//     la fascia scura sta a destra, per un margine a sinistra;
//   • se l'obiettivo è a fine mese, un secondo tratto chiaro dice dove si
//     arriva al ritmo di oggi («a fine mese, a questo ritmo»).
// Lo stato si scrive a parole, mai col colore solo.
//
// 04/10/2026 (audit del design, C6 e IM6): le due fasce «bene» e «da
// guardare» non si vedevano. Il binario era `bgMuted` #EEF1F6 e la fascia
// «da guardare» `borderSoft` #EEF1F6, LO STESSO colore; l'altra fascia stava
// a 1,03:1. E senza dato si disegnava comunque il binario vuoto: 158 px al
// computer e 345 al telefono di binari grigi nel Mese. Adesso le fasce sono
// tre grigi a 1,25:1 e 1,27:1 l'uno dall'altro, e senza dato c'è una riga di
// testo, non una barra.
import React from 'react'
import { color as T, font, radius as R, space } from '../../lib/theme'
import { quota, punti } from '../../lib/formatoAnalisi'
import { testo, transizione } from './misure'

// Le fasce, dalla più chiara alla più scura (contrasto fra vicine 1,25 e
// 1,27; la barra sulla più scura 5:1, il trattino dell'obiettivo 4,4:1).
const FASCIA = { chiara: T.bgMuted, media: T.borderStr, scura: T.graficoConfronto }
const ALTO = 24                 // il binario
const SPESSORE = ALTO / 3       // la barra: un terzo (Few)

/**
 * @param {object} p
 * @param {string} p.etichetta  «Food cost»
 * @param {number|null} p.valore  in %
 * @param {number} p.obiettivo  in %
 * @param {number} [p.attenzione]  il confine fra «da guardare» e «troppo» (di base ±20% dell'obiettivo)
 * @param {number} [p.massimo]  fondo scala: barre impilate usano lo stesso
 * @param {boolean} [p.piuEMeglio=false]  per i costi `false`
 * @param {number|null} [p.annoPrima]  la stessa quota un anno prima, in %
 * @param {string} [p.etichettaAnnoPrima]  «agosto 2025»
 * @param {number|null} [p.proiezione]  dove si arriva a fine periodo al ritmo di oggi, in %
 * @param {string} [p.etichettaProiezione]  «a fine mese, a questo ritmo»
 * @param {string} [p.motivoMancante]
 * @param {string} [p.nota]  riga sotto (es. «obiettivo indicativo di settore»)
 */
export default function BarraObiettivo({
  etichetta, valore, obiettivo, attenzione = null, massimo = null, piuEMeglio = false,
  annoPrima = null, etichettaAnnoPrima = 'anno prima', proiezione = null, etichettaProiezione = 'a fine mese, a questo ritmo',
  motivoMancante = 'non lo so ancora', nota = '',
}) {
  const finito = (x) => x != null && Number.isFinite(Number(x))
  const manca = !finito(valore)

  // Senza dato: una riga di testo, niente binario vuoto.
  if (manca) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', columnGap: space[3], minWidth: 0 }}>
        <span style={{ ...testo(font.size.base), minWidth: 0 }}>
          <b style={{ fontWeight: 600, color: T.text }}>{etichetta}</b>
          <span style={{ color: T.textSoft }}>: {motivoMancante}</span>
        </span>
        <span style={{ ...testo(font.size.sm), color: T.textSoft, whiteSpace: 'nowrap' }}>obiettivo {quota(obiettivo)}</span>
      </div>
    )
  }

  const v = Number(valore)
  const ap = finito(annoPrima) ? Number(annoPrima) : null
  const pr = finito(proiezione) ? Number(proiezione) : null
  const att = attenzione ?? (piuEMeglio ? obiettivo * 0.8 : obiettivo * 1.2)
  const max = massimo ?? Math.max(att * 1.35, v * 1.1, obiettivo * 1.5, (ap ?? 0) * 1.1, (pr ?? 0) * 1.1)
  const pos = (x) => Math.max(0, Math.min(100, (x / max) * 100))
  const delta = v - obiettivo
  const bene = piuEMeglio ? v >= obiettivo : v <= obiettivo
  const stato = Math.abs(delta) < 0.5 ? 'in linea con l\'obiettivo'
    : `${punti(Math.abs(delta))?.replace(/^\+/, '')} ${delta > 0 ? 'sopra' : 'sotto'} l'obiettivo`

  // Le tre fasce, da sinistra: per un costo chiara · media · scura; per un
  // margine il contrario. Più scuro = peggio.
  const [a, b] = piuEMeglio ? [att, obiettivo] : [obiettivo, att]
  const fasce = piuEMeglio
    ? [[0, a, FASCIA.scura], [a, b, FASCIA.media], [b, max, FASCIA.chiara]]
    : [[0, a, FASCIA.chiara], [a, b, FASCIA.media], [b, max, FASCIA.scura]]

  const descrizione = [
    `${etichetta}: ${quota(v)}, obiettivo ${quota(obiettivo)}`,
    ap != null ? `${etichettaAnnoPrima} ${quota(ap)}` : null,
    pr != null ? `${etichettaProiezione} ${quota(pr)}` : null,
  ].filter(Boolean).join(', ')
  const muovi = transizione('width', 'left')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: space[3] }}>
        <span style={{ ...testo(font.size.base), fontWeight: 600, color: T.text }}>{etichetta}</span>
        <span style={{ ...testo(font.size.xl), fontWeight: 700, color: T.text }}>{quota(v)}</span>
      </div>

      <div role="img" aria-label={descrizione} style={{ position: 'relative', height: ALTO, borderRadius: R.xs, overflow: 'hidden' }}>
        {fasce.map(([da, a2, colore], i) => (
          <span key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos(da)}%`, width: `${Math.max(0, pos(a2) - pos(da))}%`, background: colore }} />
        ))}
        {/* Dove si arriva a fine mese: lo stesso colore, chiaro (è una stima). */}
        {pr != null && pr > v && (
          <span style={{ position: 'absolute', top: SPESSORE, height: SPESSORE, left: 0, width: `${pos(pr)}%`, background: T.graficoReale, opacity: 0.35, borderRadius: `0 ${R.xs}px ${R.xs}px 0`, transition: muovi }} />
        )}
        <span style={{ position: 'absolute', top: SPESSORE, height: SPESSORE, left: 0, width: `${pos(v)}%`, background: T.graficoReale, borderRadius: `0 ${R.xs}px ${R.xs}px 0`, transition: muovi }} />
        {/* L'obiettivo: un trattino perpendicolare, alto quasi tutto il binario. */}
        <span aria-hidden="true" style={{ position: 'absolute', top: 3, bottom: 3, left: `${pos(obiettivo)}%`, width: 2, marginLeft: -1, background: T.graficoObiettivo, transition: muovi }} />
        {/* L'anno prima: un punto con l'anello bianco, che si vede anche sulla barra. */}
        {ap != null && (
          <span aria-hidden="true" style={{ position: 'absolute', top: ALTO / 2 - 5, left: `${pos(ap)}%`, width: 10, height: 10, marginLeft: -5, borderRadius: R.full, background: T.textSoft, boxShadow: `0 0 0 2px ${T.bgCard}`, transition: muovi }} />
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: space[3], ...testo(font.size.sm) }}>
        <span style={{ color: bene ? T.graficoMeglio : T.graficoPeggio, fontWeight: 600 }}>{stato}</span>
        <span style={{ color: T.textSoft, display: 'inline-flex', alignItems: 'center', columnGap: space[3], flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[1], whiteSpace: 'nowrap' }}>
            <span aria-hidden="true" style={{ width: 2, height: 12, background: T.graficoObiettivo }} />obiettivo {quota(obiettivo)}
          </span>
          {ap != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[1], whiteSpace: 'nowrap' }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: R.full, background: T.textSoft }} />{etichettaAnnoPrima} {quota(ap)}
            </span>
          )}
        </span>
      </div>
      {pr != null && (
        <div style={{ ...testo(font.size.sm), color: T.textSoft }}>
          {etichettaProiezione}: <b style={{ color: T.text, fontWeight: 600 }}>{quota(pr)}</b>
        </div>
      )}
      {nota && <div style={{ ...testo(font.size.sm), color: T.textSoft }}>{nota}</div>}
    </div>
  )
}
