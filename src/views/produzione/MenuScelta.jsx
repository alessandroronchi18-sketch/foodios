// ── Un pulsante che apre le scelte ────────────────────────────────────────
//
// Indicazione del titolare, 04/10/2026: «appena atterro sulla pagina non
// devo vedere tutto questo ammasso di cose». Le opzioni secondarie (come si
// raggruppa il grafico, come si ordina la tabella sul telefono) stanno dietro
// UN pulsante che dice la scelta attuale, e si aprono con un tocco. Prima
// erano righe di pulsanti sempre aperte sopra ogni grafico.
import React, { useEffect, useRef, useState } from 'react'
import { color as T, font, radius as R, shadow } from '../../lib/theme'
import Icon from '../../components/Icon'

/**
 * @param {{ etichetta: string, valore: string, scelte: { id: string, label: string }[],
 *   onScegli: (id: string) => void, prefisso?: string }} p
 */
export default function MenuScelta({ etichetta, valore, scelte, onScegli, prefisso = '' }) {
  const [aperto, setAperto] = useState(false)
  const radice = useRef(null)
  const attuale = scelte.find(s => s.id === valore)

  // Si chiude toccando fuori o con Esc, come ogni menu.
  useEffect(() => {
    if (!aperto) return undefined
    const fuori = (e) => { if (radice.current && !radice.current.contains(e.target)) setAperto(false) }
    const esc = (e) => { if (e.key === 'Escape') setAperto(false) }
    document.addEventListener('mousedown', fuori)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuori); document.removeEventListener('keydown', esc) }
  }, [aperto])

  return (
    <div ref={radice} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" aria-haspopup="true" aria-expanded={aperto} aria-label={`${etichetta}: ${attuale?.label || ''}`}
        onClick={() => setAperto(v => !v)}
        style={{
          minHeight: 40, padding: '6px 10px', borderRadius: R.lg, cursor: 'pointer', fontFamily: 'inherit',
          border: `1px solid ${T.border}`, background: T.bgCard, color: T.textMid,
          fontSize: font.size.sm, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        }}>
        {prefisso}{attuale?.label?.toLowerCase() || ''}
        <Icon name={aperto ? 'chevUp' : 'chevDown'} size={12} />
      </button>
      {aperto && (
        <div role="group" aria-label={etichetta} style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 5, minWidth: 160,
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: 4,
          boxShadow: shadow.lg, display: 'flex', flexDirection: 'column',
        }}>
          {scelte.map(s => (
            <button key={s.id} type="button" aria-pressed={s.id === valore}
              onClick={() => { onScegli(s.id); setAperto(false) }}
              style={{
                minHeight: 44, padding: '8px 12px', borderRadius: R.md, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: font.size.md, textAlign: 'left',
                fontWeight: s.id === valore ? 700 : 500,
                background: s.id === valore ? T.bgSubtle : 'transparent', color: s.id === valore ? T.text : T.textMid,
              }}>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
