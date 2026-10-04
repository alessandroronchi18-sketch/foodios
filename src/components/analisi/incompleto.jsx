// ── «Non lo so ancora», disegnato dentro il grafico ────────────────────
//
// ANALISI_DESIGN §6 e ricerca design §2.2 (scelta 6, come Stripe): oltre al
// colore ambra, il dato incompleto è una ZONA tratteggiata dentro il grafico,
// con la scritta. Il lettore distingue «non è successo niente» da «non lo so
// ancora» senza leggere le note. Un motivo solo per tutta l'Analisi:
//   • `stileIncompleto` per le barre fatte con l'HTML (la cascata);
//   • `<MotivoIncompleto id>` + `<ZonaIncompleta>` per i grafici in SVG (i
//     dodici mesi, l'incasso giorno per giorno).
// Il tratteggio è a 45°, come vuole la guida dei grafici (mai orizzontale o
// verticale, che si confondono con griglia e barre).
import React from 'react'
import { color as T, font, radius as R } from '../../lib/theme'

// L'ambra al 35% per le righe del tratteggio: sul fondo bianco si vede, ma non
// grida come un allarme (l'ambra è «incompleto», il rosso «peggio»).
const RIGA = `${T.amber}59`

/** Lo stile di una barra HTML che dice «incompleto»: contorno tratteggiato e righe a 45°. */
export const stileIncompleto = {
  backgroundColor: T.amberLight,
  backgroundImage: `repeating-linear-gradient(135deg, ${RIGA} 0 2px, transparent 2px 6px)`,
  borderStyle: 'dashed', borderWidth: 1, borderColor: T.amber, borderRadius: R.xs, boxSizing: 'border-box',
}

/** Il motivo per i grafici SVG: va dentro <defs>, poi `fill="url(#id)"`. */
export function MotivoIncompleto({ id = 'fos-incompleto' }) {
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill={T.amberLight} />
      <line x1="0" y1="0" x2="0" y2="6" stroke={T.amber} strokeWidth="2" strokeOpacity="0.35" />
    </pattern>
  )
}

/**
 * Una zona incompleta dentro un grafico SVG, con la scritta in alto a
 * sinistra («dal 1/09 nessuna registrazione»). Il motivo `idMotivo` deve
 * stare nei <defs> dello stesso SVG.
 */
export function ZonaIncompleta({ x, y, larghezza, altezza, scritta = '', idMotivo = 'fos-incompleto' }) {
  if (!(larghezza > 0) || !(altezza > 0)) return null
  return (
    <g>
      <rect x={x} y={y} width={larghezza} height={altezza} fill={`url(#${idMotivo})`} stroke={T.amber} strokeDasharray="3 3" strokeWidth="1" />
      {scritta && (
        <text x={x + 6} y={y + 16} fill={T.amberDark} fontSize={font.size.sm} fontWeight="600">{scritta}</text>
      )}
    </g>
  )
}
