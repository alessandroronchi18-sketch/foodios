// I nomi dei gusti collegati alle ricette (vedi nomiGusti.js), letti e
// scritti come ogni dato dell'azienda: prima si salva, poi si aggiorna lo
// stato. Se il salvataggio non va, la pagina resta com'era e lo dice.
import { useCallback, useEffect, useRef, useState } from 'react'
import { sload, ssave } from './storage'
import { SK_NOMI_GUSTI } from './storageKeys'
import { leggiNomiGusti, collegaNome } from './nomiGusti'

export function useNomiGusti(orgId) {
  // null finché non è stata letta: «non lo so ancora» non è «nessun nome».
  const [mappa, setMappa] = useState(null)
  // L'ultima mappa salvata, per due collegamenti fatti uno dopo l'altro
  // prima che la pagina si ridisegni: il secondo non deve cancellare il primo.
  const ultima = useRef(null)

  useEffect(() => {
    if (!orgId) return undefined
    let alive = true
    sload(SK_NOMI_GUSTI, orgId, null)
      .then((v) => { if (alive) { const m = leggiNomiGusti(v); ultima.current = m; setMappa(m) } })
      .catch(() => { if (alive) { const m = leggiNomiGusti(null); ultima.current = m; setMappa(m) } })
    return () => { alive = false }
  }, [orgId])

  /** Collega (o scollega, con `ricetta` null) un nome. Lancia se non salva. */
  const collega = useCallback(async (nome, ricetta, { utente = null } = {}) => {
    const nuova = collegaNome(ultima.current, nome, ricetta, { utente })
    await ssave(SK_NOMI_GUSTI, nuova, orgId, null)
    ultima.current = nuova
    setMappa(nuova)
    return nuova
  }, [orgId])

  return { mappa, collega }
}
