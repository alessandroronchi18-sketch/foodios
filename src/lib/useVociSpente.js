// Le voci del menu spente dal titolare (Impostazioni → Voci del menu).
//
// Si leggono una volta per azienda e si rileggono quando Impostazioni salva:
// senza l'evento il menu cambierebbe solo ricaricando la pagina. Su un errore
// di rete restano tutte accese, che è il menu di sempre.
import { useEffect, useState } from 'react'
import { sload } from './storage'
import { SK_VOCI_SPENTE } from './storageKeys'
import { leggiVociSpente, EVENTO_VOCI_SPENTE } from './menuFoodos'

export default function useVociSpente(orgId) {
  const [spente, setSpente] = useState([])
  useEffect(() => {
    if (!orgId) return undefined
    let vivo = true
    sload(SK_VOCI_SPENTE, orgId, null)
      .then(v => { if (vivo) setSpente(leggiVociSpente(v)) })
      .catch(() => {})
    const suCambio = (e) => setSpente(leggiVociSpente(e.detail))
    window.addEventListener(EVENTO_VOCI_SPENTE, suCambio)
    return () => { vivo = false; window.removeEventListener(EVENTO_VOCI_SPENTE, suCambio) }
  }, [orgId])
  return spente
}
