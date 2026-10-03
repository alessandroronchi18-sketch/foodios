// ── I testi della nuova Analisi: domanda, titolo-conclusione, frase ─────
//
// ANALISI_DESIGN.md, regole 1 e 5: la pagina si apre con la sua domanda, e
// ogni grafico ha per titolo la conclusione («Su 100 € incassati te ne
// restano 18»), con sotto cosa è disegnato. Le frasi-insight portano sempre
// il numero che le giustifica e, se c'è, il passaggio al dettaglio.
import React from 'react'
import { color as T, font, typo, radius as R } from '../../lib/theme'
import Icon from '../Icon'

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

const ICONA = { meglio: 'trendUp', peggio: 'trendDown', pari: 'minus', info: 'info', azione: 'arrowR' }
const COLORE = { meglio: T.green, peggio: T.red, pari: T.textSoft, info: T.textSoft, azione: T.brand }

/**
 * Una frase con dietro un numero: «Materie prime +2.340 € sull'anno prima,
 * soprattutto DESA (+1.100 €)». Se `onClick` c'è, porta al dettaglio.
 */
export function FraseInsight({ verso = 'info', children, onClick = null, etichettaAzione = 'Vedi' }) {
  const contenuto = (
    <>
      <span style={{ color: COLORE[verso], display: 'inline-flex', marginTop: 2, flexShrink: 0 }} aria-hidden="true"><Icon name={ICONA[verso]} size={15} /></span>
      <span style={{ flex: 1, minWidth: 0, fontSize: font.size.md, color: T.text, lineHeight: 1.5 }}>{children}</span>
      {onClick && <span style={{ color: T.brand, fontWeight: 700, fontSize: font.size.base, whiteSpace: 'nowrap' }}>{etichettaAzione}</span>}
    </>
  )
  // Solo il filo in alto: niente `border` abbreviato insieme a `borderTop`,
  // che React segnala e che al secondo disegno perde il filo.
  const stile = {
    display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', width: '100%', textAlign: 'left',
    background: 'transparent', borderStyle: 'solid', borderColor: T.borderSoft, borderWidth: '1px 0 0 0', font: 'inherit',
  }
  return onClick
    ? <button type="button" onClick={onClick} style={{ ...stile, cursor: 'pointer', minHeight: 44 }}>{contenuto}</button>
    : <div style={stile}>{contenuto}</div>
}
