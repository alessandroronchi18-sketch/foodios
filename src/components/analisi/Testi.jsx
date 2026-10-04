// ── I testi della nuova Analisi: domanda, titolo-conclusione, frase ─────
//
// ANALISI_DESIGN.md, regole 1 e 5: la pagina si apre con la sua domanda, e
// ogni grafico ha per titolo la conclusione («Su 100 € incassati te ne
// restano 18»), con sotto cosa è disegnato. Le frasi-insight portano sempre
// il numero che le giustifica e, se c'è, il passaggio al dettaglio.
import React from 'react'
import { color as T, font, typo, radius as R, space } from '../../lib/theme'
import { segnoDi } from '../../lib/formatoAnalisi'
import Icon from '../Icon'
import { testo } from './misure'

/** La domanda della pagina, con a destra i comandi (mese, sede). */
export function IntestazioneAnalisi({ domanda, sotto = '', destra = null, isMobile = false }) {
  return (
    <header style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ ...(isMobile ? typo.h2 : typo.h1), margin: 0, color: T.text }}>{domanda}</h2>
        {sotto && <div style={{ fontSize: font.size.base, color: T.textSoft, marginTop: 4, lineHeight: 1.5 }}>{sotto}</div>}
      </div>
      {destra && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{destra}</div>}
    </header>
  )
}

/** Il titolo di un riquadro o di un grafico: la conclusione, poi cosa c'è disegnato. */
export function TitoloGrafico({ titolo, sottotitolo = '', destra = null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ ...typo.h3, margin: 0, color: T.text }}>{titolo}</h3>
        {sottotitolo && <div style={{ fontSize: font.size.sm, color: T.textSoft, marginTop: 3, lineHeight: 1.45 }}>{sottotitolo}</div>}
      </div>
      {destra}
    </div>
  )
}

/** Il riquadro di base: stesso fondo, bordo e respiro in tutte le pagine. */
export function Riquadro({ children, isMobile = false, stile = null }) {
  return (
    <section style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl, padding: isMobile ? 16 : 20, minWidth: 0, ...stile }}>
      {children}
    </section>
  )
}

// La freccia segue il SEGNO del numero, il colore il giudizio (audit del
// 04/10, C3): prima «Confezioni: +11.542 €» aveva la freccia in giù perché
// per l'utile era un peggioramento, e chi guardava di sfuggita leggeva
// «calo». Se il segno non si sa, niente freccia: un segno che non dice una
// direzione (spunta o avviso).
const COLORE = { meglio: T.green, peggio: T.red, pari: T.textSoft, info: T.textSoft, azione: T.brand }
const ICONA_FISSA = { info: 'info', azione: 'arrowR' }
const ICONA_SENZA_SEGNO = { meglio: 'checkCircle', peggio: 'alertCircle', pari: 'minus' }

/** Il testo semplice dentro dei figli React (stringhe, numeri, elementi). */
function testoDi(nodo) {
  if (nodo == null || typeof nodo === 'boolean') return ''
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo)
  if (Array.isArray(nodo)) return nodo.map(testoDi).join('')
  return testoDi(nodo.props?.children)
}

/** Il segno del primo numero col segno nella frase: «Confezioni: +11.542 €» → +1. */
export function segnoNellaFrase(frase) {
  const m = /(?:^|[\s(:])([+−-])(?=\d)/.exec(String(frase || ''))
  return m ? segnoDi(`${m[1]}1`) : 0
}

/**
 * Una frase con dietro un numero: «Materie prime +2.340 € sull'anno prima,
 * soprattutto DESA (+1.100 €)». Se `onClick` c'è, porta al dettaglio.
 * @param {object} p
 * @param {'meglio'|'peggio'|'pari'|'info'|'azione'} [p.verso]  il giudizio: dà il colore
 * @param {number|string|object} [p.segno]  il verso del numero (1/−1, «+52%», una `variazione`);
 *   se manca si legge dal primo numero col segno nella frase
 */
export function FraseInsight({ verso = 'info', segno = null, children, onClick = null, etichettaAzione = 'Vedi' }) {
  let icona = ICONA_FISSA[verso]
  if (!icona) {
    const s = segno != null ? segnoDi(segno) : segnoNellaFrase(testoDi(children))
    icona = s > 0 ? 'trendUp' : s < 0 ? 'trendDown' : (ICONA_SENZA_SEGNO[verso] || 'info')
  }
  const contenuto = (
    <>
      <span style={{ color: COLORE[verso] || T.textSoft, display: 'inline-flex', alignItems: 'center', height: 20, flexShrink: 0 }} aria-hidden="true"><Icon name={icona} size={16} /></span>
      <span style={{ flex: 1, minWidth: 0, ...testo(font.size.md), color: T.text }}>{children}</span>
      {onClick && <span style={{ color: T.brand, fontWeight: 700, ...testo(font.size.base), whiteSpace: 'nowrap' }}>{etichettaAzione}</span>}
    </>
  )
  // Solo il filo in alto: niente `border` abbreviato insieme a `borderTop`,
  // che React segnala e che al secondo disegno perde il filo.
  const stile = {
    display: 'flex', gap: space[2], alignItems: 'flex-start', padding: `${space[3]}px 0`, width: '100%', textAlign: 'left',
    background: 'transparent', borderStyle: 'solid', borderColor: T.borderSoft, borderWidth: '1px 0 0 0', font: 'inherit',
  }
  return onClick
    ? <button type="button" onClick={onClick} style={{ ...stile, cursor: 'pointer', minHeight: 44 }}>{contenuto}</button>
    : <div style={stile}>{contenuto}</div>
}
