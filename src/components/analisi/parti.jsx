// ── Le parti che tessere e numero principale hanno in comune ───────────
//
// Scritte una volta, così il numero grande della pagina e le tessere
// piccole dicono le cose allo stesso modo (audit del 04/10, C2; ricerca
// design §4.7-4.8):
//   • la cifra con le cifre proporzionali (le tabellari servono solo in
//     colonna: «121» grande con le tabellari sembra slegato) e l'unità «€»
//     più piccola, grigia, sulla stessa linea di base;
//   • «stimato» in parole accanto al numero, non una pillola colorata che
//     gli fa concorrenza;
//   • la riga del confronto: la freccia segue il SEGNO del numero, il colore
//     segue il giudizio, e il giudizio è anche scritto («· peggio»). Prima
//     era il contrario: «↘ +52%» per una spesa salita del 52%, e chi guardava
//     di sfuggita leggeva «calo».
import React from 'react'
import { color as T, font, space, radius as R } from '../../lib/theme'
import { segnoDi } from '../../lib/formatoAnalisi'
import Icon from '../Icon'
import { testo } from './misure'

/** L'unità, al 60-70% del numero, presa dalla scala del tema (sotto i 16 px
 *  l'euro accanto a un numero da 22 si stacca e sembra una nota). */
const UNITA_PER = {
  [font.size['5xl']]: font.size['3xl'],  // 48 → 28
  [font.size['4xl']]: font.size['2xl'],  // 36 → 22
  [font.size['3xl']]: font.size.xl,      // 28 → 18
  [font.size['2xl']]: font.size.lg,      // 22 → 16
}

/** «124.553 €» → { cifra: '124.553', unita: ' €' }. Solo l'euro finale. */
export function separaUnita(valore, unita = '') {
  const s = String(valore ?? '')
  if (unita) return { cifra: s, unita: ` ${unita}` }
  const m = /^(.*\d)(\s€)$/.exec(s)
  return m ? { cifra: m[1], unita: m[2] } : { cifra: s, unita: '' }
}

/** Il numero grande con la sua unità piccola. */
export function Cifra({ valore, unita = '', dimensione, colore = T.text, peso = 700 }) {
  const { cifra, unita: u } = separaUnita(valore, unita)
  return (
    <span style={{
      ...testo(dimensione), fontWeight: peso, color: colore, letterSpacing: '-0.02em',
      fontVariantNumeric: 'proportional-nums', whiteSpace: 'nowrap',
    }}>
      {cifra}
      {u && <span style={{ fontSize: UNITA_PER[dimensione] || '0.6em', fontWeight: 600, color: T.textSoft, letterSpacing: 0 }}>{u}</span>}
    </span>
  )
}

/** «stimato», in parole, accanto al numero. */
export function ParolaStimato({ dimensione = font.size.md }) {
  return <span style={{ ...testo(dimensione), fontStyle: 'italic', fontWeight: 500, color: T.textSoft }}>stimato</span>
}

const COLORE_GIUDIZIO = { meglio: T.green, peggio: T.red, pari: T.textSoft }
const ICONA_SEGNO = { 1: 'trendUp', [-1]: 'trendDown', 0: 'minus' }

/** La freccia: direzione dal segno, colore dal giudizio. */
export function Freccia({ segno = 0, verso = 'pari', dimensione = 16 }) {
  return (
    <span style={{ color: COLORE_GIUDIZIO[verso] || T.textSoft, display: 'inline-flex', flexShrink: 0 }} aria-hidden="true">
      <Icon name={ICONA_SEGNO[Math.sign(segno)] || 'minus'} size={dimensione} />
    </span>
  )
}

/**
 * La riga del confronto, sempre alta una riga: con il confronto dice
 * «↗ +52% su agosto 2025 (33.200 €)»; senza, lo dice («nessun confronto»),
 * così le tessere affiancate restano incolonnate. `senzaConfronto === null`
 * lascia la riga vuota (ma della stessa altezza).
 */
export function RigaConfronto({ variazione = null, rispettoA = '', valoreConfronto = '', senzaConfronto = '', dimensione = font.size.base }) {
  const stile = { display: 'flex', alignItems: 'center', columnGap: space[1], flexWrap: 'wrap', minHeight: 20, color: T.textMid, ...testo(dimensione) }
  if (!variazione) {
    return <div style={stile}>{senzaConfronto === null ? null : <span style={{ color: T.textSoft }}>{senzaConfronto || 'nessun confronto'}</span>}</div>
  }
  const verso = variazione.verso || 'pari'
  return (
    <div style={stile}>
      <Freccia segno={segnoDi(variazione)} verso={verso} />
      <b style={{ color: COLORE_GIUDIZIO[verso] || T.textMid, fontWeight: 700 }}>{variazione.testoDelta}</b>
      {rispettoA && <span>{rispettoA}</span>}
      {valoreConfronto && <span style={{ color: T.textSoft }}>({valoreConfronto})</span>}
      {/* Il giudizio a parole, visibile, come nella tabella del conto («· peggio»):
          non col colore solo (regola 7). Prima era un testo nascosto a 1 px per
          chi legge lo schermo, e il righello delle foto lo vedeva «tagliato». Il
          puntino è disegnato, non scritto: il testo resta «… 2025peggio». */}
      {verso !== 'pari' && (
        <span style={{ display: 'inline-flex', alignItems: 'center', columnGap: space[1], color: COLORE_GIUDIZIO[verso], fontWeight: 600 }}>
          <span aria-hidden="true" style={{ width: 3, height: 3, borderRadius: R.full, background: T.textSoft }} />
          {verso}
        </span>
      )}
    </div>
  )
}

/** La riga che dice perché il numero manca, in ambra, con il passaggio per sistemarlo (anche solo il passaggio). */
export function RigaMotivo({ motivo, azione = null, dimensione = font.size.base }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', columnGap: space[1], minHeight: 20, color: T.amberDark, ...testo(dimensione) }}>
      {motivo && <span style={{ display: 'inline-flex', height: 20, alignItems: 'center', flexShrink: 0, color: T.amber }} aria-hidden="true"><Icon name="alertCircle" size={14} /></span>}
      <span style={{ minWidth: 0 }}>
        {motivo}
        {azione && (
          <>
            {motivo ? ' ' : null}
            <button type="button" onClick={azione.onClick} style={{
              border: 'none', background: 'transparent', color: T.brand, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              whiteSpace: 'nowrap', padding: `${space[3]}px ${space[1]}px`, margin: `-${space[3]}px 0`, minHeight: 44, ...testo(dimensione),
            }}>{azione.etichetta}</button>
          </>
        )}
      </span>
    </div>
  )
}
