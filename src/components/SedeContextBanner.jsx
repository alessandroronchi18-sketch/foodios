import React from 'react'
import { color as T, typo, radius } from '../lib/theme'
import Icon from './Icon'

/**
 * Banner contestuale che indica con quale sede stiamo operando nella vista corrente.
 * Per le sezioni per-sede (magazzino, cassa, produzione…).
 *
 * Props:
 *  - sedeAttiva: { id, nome, citta } | null
 *  - sedi: array completo (per decidere se mostrare il banner - solo se >1 sede)
 *  - onChange: optional, click per aprire SedeSelector altrove
 *  - scope: 'per-sede' (default) | 'org' (entità a livello azienda, banner muted)
 *  - hint: testo opzionale es. "Magazzino di questa sede"
 */
export default function SedeContextBanner({ sedeAttiva, sedi = [], onChange, scope = 'per-sede', hint }) {
  if (!sedi || sedi.length < 2) return null

  if (scope === 'org') {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '5px 11px', borderRadius: radius.full,
        background: T.bgSubtle, border: `1px solid ${T.border}`, color: T.textMid,
        ...typo.caption, fontWeight: 600,
        marginBottom: 16,
      }}>
        <Icon name="building" size={12} style={{ opacity: 0.75 }} />
        <span>Dato a livello azienda · visibile a tutte le sedi</span>
      </div>
    )
  }

  const nome = sedeAttiva?.nome || '-'
  const citta = sedeAttiva?.citta

  // Era una fascia larga tutta la pagina, su fondo giallo `#FEF3C7` con bordo
  // `#FCD34D` e testo ambra: i colori dell'avviso per un'informazione che non
  // avvisa di niente. Due danni insieme. La pagina sembra avere un problema
  // appena si apre, e chi la usa ogni giorno impara a non guardare più il
  // giallo — così quando serve davvero, per una scadenza o un'anomalia, non lo
  // vede nessuno.
  //
  // C'è anche una ripetizione: la topbar mostra già la sede attiva, due
  // centimetri sopra, nel selettore da cui la si cambia. Quindi qui basta una
  // conferma discreta di CONTESTO — non un annuncio.
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      padding: '5px 11px 5px 9px', borderRadius: radius.full,
      background: T.bgSubtle, border: `1px solid ${T.border}`, color: T.textMid,
      ...typo.caption, fontWeight: 600,
      marginBottom: 16, maxWidth: '100%',
    }}>
      <Icon name="pin" size={12} style={{ flexShrink: 0, opacity: 0.75 }} />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <strong style={{ fontWeight: 700, color: T.text }}>{nome}</strong>
        {citta && citta !== nome && <span> · {citta}</span>}
        {hint && <span style={{ color: T.textSoft }}> · {hint.charAt(0).toLowerCase() + hint.slice(1)}</span>}
      </span>
      {onChange && (
        <button onClick={onChange} style={{
          marginLeft: 2, padding: '0 8px', minHeight: 26, background: T.bgCard,
          border: `1px solid ${T.borderStr}`, borderRadius: radius.full,
          color: T.textMid, ...typo.caption, fontWeight: 700, fontFamily: 'inherit',
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        }}>Cambia</button>
      )}
    </div>
  )
}
