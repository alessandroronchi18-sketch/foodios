// ── Un numero, il suo confronto, e che cosa vuol dire ───────────────────
//
// ANALISI_DESIGN.md, regole 2 e 4: un numero non sta mai da solo, e una
// stima porta la parola «stimato» dentro la tessera. Se il numero non si
// può dare, la tessera dice perché invece di scrivere zero.
import React from 'react'
import { color as T, font, typo, radius as R } from '../../lib/theme'
import Icon from '../Icon'

const COLORE_VERSO = { meglio: T.green, peggio: T.red, pari: T.textSoft }
const ICONA_VERSO = { meglio: 'trendUp', peggio: 'trendDown', pari: 'minus' }

/**
 * @param {object} p
 * @param {string} p.etichetta
 * @param {string|null} p.valore  già formattato; `null` = non disponibile
 * @param {boolean} [p.stimato]
 * @param {string} [p.motivoMancante]  cosa scrivere se `valore` è null
 * @param {{ verso: 'meglio'|'peggio'|'pari', testoDelta: string }|null} [p.variazione]
 * @param {string} [p.rispettoA]  «sull'anno prima»
 * @param {string} [p.valoreConfronto]  «13.400 €»
 * @param {string} [p.contesto]  riga sotto, grigia
 * @param {boolean} [p.grande]  il numero principale della pagina
 */
export default function NumeroConConfronto({
  etichetta, valore, stimato = false, motivoMancante = 'non lo so ancora',
  variazione = null, rispettoA = '', valoreConfronto = '', contesto = '', grande = false, isMobile = false,
}) {
  const manca = valore == null
  const dimNumero = grande ? (isMobile ? font.size['3xl'] : font.size['4xl']) : font.size['2xl']
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl,
      padding: grande ? (isMobile ? '16px 16px' : '20px 22px') : '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
    }}>
      <div style={{ ...typo.overline, color: T.textSoft, minHeight: 16 }}>{etichetta}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: manca ? font.size.lg : dimNumero, fontWeight: manca ? 600 : 800,
          color: manca ? T.textSoft : T.text, letterSpacing: '-0.02em', lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {manca ? motivoMancante : valore}
        </span>
        {!manca && stimato && (
          <span style={{ fontSize: font.size.sm, fontWeight: 700, color: T.amberDark, background: T.amberLight, borderRadius: R.full, padding: '2px 8px' }}>
            stimato
          </span>
        )}
      </div>
      {!manca && variazione && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: font.size.base, color: T.textMid, minHeight: 20, flexWrap: 'wrap' }}>
          <span style={{ color: COLORE_VERSO[variazione.verso], display: 'inline-flex' }} aria-hidden="true">
            <Icon name={ICONA_VERSO[variazione.verso]} size={14} />
          </span>
          <b style={{ color: COLORE_VERSO[variazione.verso], fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{variazione.testoDelta}</b>
          {rispettoA && <span>{rispettoA}</span>}
          {valoreConfronto && <span style={{ color: T.textSoft }}>({valoreConfronto})</span>}
          {variazione.verso !== 'pari' && (
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{variazione.verso}</span>
          )}
        </div>
      )}
      {contesto && <div style={{ fontSize: font.size.sm, color: T.textSoft, lineHeight: 1.45 }}>{contesto}</div>}
    </div>
  )
}
