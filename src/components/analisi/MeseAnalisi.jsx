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
//   • `MeseAnalisi`: ‹ agosto 2026 ›, un controllo solo come la barra del
//     periodo, con dentro, in una riga, l'avviso dello spostamento
//     («settembre ancora senza incassi», accanto alla freccia che ci porta).
//     Prima era una frase a parte col pulsante «Vai a settembre»: al telefono
//     andava a capo su tre righe (IM12), poi su due, sotto la domanda;
//   • `PulsanteTorna`: il pulsante per tornare alla pagina da una sotto-pagina.
import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { color as T, font, radius as R, space, shadow } from '../../lib/theme'
import { testo } from './misure'
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

// Le frecce attaccate al mese, come nella barra del periodo chiusa
// (`BarraPeriodo`): 44 × 44, senza bordo loro, dentro il bordo del controllo.
const freccia = (attiva) => ({
  width: 44, height: 44, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', padding: 0, fontFamily: 'inherit',
  color: attiva ? T.textMid : T.border, cursor: attiva ? 'pointer' : 'default',
})

/**
 * Il mese guardato: ‹ agosto 2026 ›, un controllo solo con un bordo solo,
 * come il periodo nelle altre pagine (BarraPeriodo chiusa), così mese e
 * periodo sembrano la stessa cosa dappertutto. Dopo il mese in corso non si va.
 *
 * Se all'apertura la pagina è saltata indietro (`spostato`, vedi
 * `useMeseAnalisi`), lo dice qui dentro, in una riga: «settembre senza
 * incassi», accanto alla freccia che ci porta. Al telefono la testa del Mese
 * aveva quattro righe prima del contenuto, una era l'avviso su due righe
 * (richiesta del coordinatore, 04/10).
 */
export default function MeseAnalisi({ mese, onCambia, spostato = null }) {
  const ultimo = mese >= meseCorrente()
  const avviso = spostato && spostato.a === mese
  const da = avviso ? nomeMese(spostato.da, { anno: false }) : ''
  return (
    <div role="group" aria-label="Mese guardato" style={{
      display: 'inline-flex', alignItems: 'stretch', maxWidth: '100%',
      boxSizing: 'border-box', border: `1px solid ${T.border}`, borderRadius: R.lg, background: T.bgCard, boxShadow: shadow.xs,
    }}>
      <button type="button" onClick={() => onCambia(mesePrima(mese))} aria-label="Mese prima" style={freccia(true)}><Icon name="chevL" size={16} /></button>
      <span style={{
        display: 'flex', alignItems: 'center', gap: space[2], minWidth: 168, flex: '0 1 auto',
        minHeight: 44, padding: `0 ${space[3]}px`, boxSizing: 'border-box',
        borderStyle: 'solid', borderColor: T.border, borderWidth: '0 1px',
      }}>
        <Icon name="calendar" size={16} color={T.textSoft} />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ ...testo(font.size.md), fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>{nomeMese(mese)}</span>
          {avviso && (
            <span role="status" title={`${maiuscola(da)} non ha ancora gli incassi: ti mostro ${nomeMese(spostato.a, { anno: false })}, l'ultimo mese che li ha.`}
              style={{ ...testo(font.size.sm), color: T.amberDark, whiteSpace: 'nowrap' }}>
              {da} ancora senza incassi
            </span>
          )}
        </span>
      </span>
      <button type="button" onClick={() => onCambia(meseDopo(mese))} disabled={ultimo} aria-label="Mese dopo"
        title={avviso ? `Vai a ${da}` : undefined} style={freccia(!ultimo)}><Icon name="chevR" size={16} /></button>
    </div>
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
