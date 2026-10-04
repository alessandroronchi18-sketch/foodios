// ── Il mese guardato: le frecce, il primo mese, l'avviso ────────────────
//
// Audit del design del 04/10/2026 (C9 e CE2). «Il mese» e il Conto economico
// leggono gli stessi numeri, ma avevano ognuno la sua copia delle frecce del
// mese e del loro stile, e si aprivano su due mesi diversi: «Il mese» saltava
// all'ultimo mese con gli incassi e lo diceva, il Conto restava sul mese
// appena chiuso, con incassi e utile «non lo so». Le foto del 03/10 avevano
// dovuto spostarlo indietro a mano.
//
// Qui c'è tutto una volta sola:
//   • `useMeseAnalisi`: il mese guardato, la lettura dei dati e la regola del
//     primo mese (si parte dall'ultimo mese chiuso; se non ha incassi, si va
//     all'ultimo che li ha, e lo si dice);
//   • `MeseAnalisi`: le frecce ‹ agosto 2026 ›;
//   • `AvvisoMeseSpostato`: la frase che dice dello spostamento, col pulsante
//     per tornare al mese chiuso dentro la frase (al telefono l'icona, la
//     frase e il pulsante andavano a capo su tre righe, difetto IM12);
//   • `PulsanteTorna`: il pulsante per tornare alla pagina da una sotto-pagina.
import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { color as T, font, radius as R } from '../../lib/theme'
import Icon from '../Icon'
import { nomeMese, mesePrima } from '../../lib/formatoAnalisi'
import { caricaIlMese } from '../../lib/ilMeseArchivio'
import { todayLocal } from '../../lib/dateLocal'

export const meseCorrente = () => todayLocal().slice(0, 7)
export const meseDopo = (m) => {
  const [y, mm] = m.split('-').map(Number)
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`
}
const maiuscola = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t)

/**
 * La regola del primo mese. Si parte dall'ultimo mese chiuso: il mese in
 * corso ha pochi giorni, e confrontarlo con un mese intero è il difetto dei
 * «cali del -70%». Se quel mese non ha incassi (la cassa non c'è e
 * l'inventario si ferma prima) si mostra l'ultimo mese che li ha: una pagina
 * che si apre su «non lo so» non risponde a niente.
 *
 * @returns {string} il mese da mostrare (`mese` stesso se va bene)
 */
export function primoMeseDaMostrare(dati, mese) {
  if (dati?.attuale?.incassi?.fonte != null) return mese
  const conIncassi = (dati?.andamento || []).filter(m => m && m.mese < mese && m.incassi?.fonte).at(-1)
  return conIncassi ? conIncassi.mese : mese
}

/**
 * Il mese guardato e i suoi numeri, con la regola del primo mese alla prima
 * lettura soltanto: dopo, il mese lo sceglie chi guarda.
 */
export function useMeseAnalisi({ orgId, sedi = [], sedeId = null, versione = 0 }) {
  const [mese, setMese] = useState(() => mesePrima(meseCorrente()))
  const [dati, setDati] = useState(null)
  const [caricando, setCaricando] = useState(true)
  const [errore, setErrore] = useState(null)
  const primoGiro = useRef(true)
  const [spostato, setSpostato] = useState(null)

  useEffect(() => {
    if (!orgId) return undefined
    let vivo = true
    setCaricando(true); setErrore(null)
    caricaIlMese({ supabase, orgId, sedi, mese, sedeId })
      .then(d => {
        if (!vivo) return
        if (primoGiro.current) {
          primoGiro.current = false
          const primo = primoMeseDaMostrare(d, mese)
          if (primo !== mese) { setSpostato({ da: mese, a: primo }); setMese(primo); return }
        }
        setDati(d)
      })
      .catch(e => { if (vivo) setErrore(e?.message || 'lettura non riuscita') })
      .finally(() => { if (vivo) setCaricando(false) })
    return () => { vivo = false }
  }, [orgId, sedeId, mese, sedi, versione])

  return { mese, setMese, dati, caricando, errore, spostato: spostato && spostato.a === mese ? spostato : null }
}

const stileFreccia = {
  width: 36, height: 36, borderRadius: R.md, border: `1px solid ${T.border}`, background: T.bgCard,
  color: T.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

/** Le frecce del mese: ‹ agosto 2026 ›. Dopo il mese in corso non si va. */
export default function MeseAnalisi({ mese, onCambia }) {
  const ultimo = mese >= meseCorrente()
  return (
    <div role="group" aria-label="Mese guardato" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button type="button" onClick={() => onCambia(mesePrima(mese))} aria-label="Mese prima" style={stileFreccia}><Icon name="chevL" size={16} /></button>
      <span style={{ fontSize: font.size.md, fontWeight: 700, color: T.text, minWidth: 128, textAlign: 'center' }}>{nomeMese(mese)}</span>
      <button type="button" onClick={() => onCambia(meseDopo(mese))} disabled={ultimo} aria-label="Mese dopo" style={{ ...stileFreccia, opacity: ultimo ? 0.35 : 1, cursor: ultimo ? 'default' : 'pointer' }}><Icon name="chevR" size={16} /></button>
    </div>
  )
}

/**
 * «Settembre non ha ancora gli incassi: ti mostro agosto, l'ultimo mese che
 * li ha. Vai a settembre». Una frase sola, col pulsante dentro: si mette sotto
 * la domanda della pagina, perché parla del mese.
 */
export function AvvisoMeseSpostato({ spostato, onVai }) {
  if (!spostato) return null
  const da = nomeMese(spostato.da, { anno: false })
  return (
    <span role="status" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 4, color: T.textMid, fontSize: font.size.base, lineHeight: '20px' }}>
      <span aria-hidden="true" style={{ display: 'inline-flex', height: 20, alignItems: 'center', flexShrink: 0 }}><Icon name="info" size={14} /></span>
      <span>
        {maiuscola(da)} non ha ancora gli incassi: ti mostro {nomeMese(spostato.a, { anno: false })}, l&apos;ultimo mese che li ha.{' '}
        {/* Bersaglio di 44 px senza alzare la riga: l'imbottitura la
            restituisce il margine negativo. */}
        <button type="button" onClick={onVai} style={{
          border: 'none', background: 'transparent', color: T.brand, fontWeight: 700, fontSize: font.size.base, lineHeight: '20px',
          cursor: 'pointer', fontFamily: 'inherit', padding: '12px 4px', margin: '-12px -4px',
        }}>
          Vai a {da}
        </button>
      </span>
    </span>
  )
}

/** Il pulsante per tornare alla pagina da una sotto-pagina («Torna ad agosto»). */
export function PulsanteTorna({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      ...stileFreccia, width: 'auto', minHeight: 36, height: 'auto', padding: '0 12px', gap: 6, alignSelf: 'flex-start',
      fontSize: font.size.base, fontWeight: 600, fontFamily: 'inherit',
    }}>
      <Icon name="chevL" size={14} />{children}
    </button>
  )
}
