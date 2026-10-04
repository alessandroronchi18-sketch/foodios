// ── Le misure della nuova Analisi, scritte una volta ───────────────────
//
// ANALISI_DESIGN.md §6 («Il disegno al millimetro», 04/10/2026). L'audit
// misurato al pixel ha trovato quattro imbottiture diverse nella stessa
// pagina (20 · 10/14 · 20/22 · 14/16): il testo cominciava a 135, 137, 141 o
// 143 px dal bordo, e scendendo il margine «ballava». Da qui in poi ogni
// riquadro dell'Analisi prende l'imbottitura da questo file, e le righe di
// testo hanno un'altezza in pixel tondi (niente 21 o 16,2 px), così le
// tessere affiancate finiscono alla stessa altezza.
import { space, font } from '../../lib/theme'

/** Gli spazi: dentro un riquadro, fra i riquadri, fra le sezioni. */
export const SPAZI = {
  dentro:      { computer: space[5], telefono: space[4] },   // 20 · 16
  fraRiquadri: { computer: space[6], telefono: space[4] },   // 24 · 16
  fraSezioni:  { computer: space[10], telefono: space[8] },  // 40 · 32
}

/** L'imbottitura di un riquadro, uguale in orizzontale e in verticale. */
export const imbottitura = (isMobile = false) =>
  (isMobile ? SPAZI.dentro.telefono : SPAZI.dentro.computer)

// L'altezza della riga per ogni misura del testo, in pixel tondi (multipli
// di 4, come la scala degli spazi). Ricerca §4.2.
const RIGA = {
  [font.size.sm]: 16,     // 12
  [font.size.base]: 20,   // 13
  [font.size.md]: 20,     // 14
  15: 20,
  [font.size.lg]: 24,     // 16
  [font.size.xl]: 24,     // 18
  [font.size['2xl']]: 28, // 22
  24: 32,                 // typo.h1
  [font.size['3xl']]: 36, // 28
  32: 40,                 // typo.display, typo.numLg
  [font.size['4xl']]: 44, // 36
  [font.size['5xl']]: 56, // 48
}

/** `{ fontSize, lineHeight }` con la riga in pixel tondi. */
export const testo = (dimensione) => ({
  fontSize: dimensione,
  lineHeight: `${RIGA[dimensione] ?? Math.ceil((dimensione * 1.4) / 4) * 4}px`,
})

/** Il testo che legge solo chi usa un lettore di schermo. */
export const soloLettore = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', margin: -1, padding: 0, border: 0,
}
