import { useState, useEffect } from 'react'

// ─── Che dispositivo è ───────────────────────────────────────────────────────
//
// **Un interruttore solo.** Prima `useIsMobile` e `useIsTablet` erano due
// sottoscrizioni separate, ognuna con il suo stato: nel momento in cui il
// browser passa da una soglia all'altra i due possono rispondere in ordine
// diverso, e per un fotogramma il componente crede di essere su due dispositivi
// insieme. Qui c'è una sola risposta, e non si può contraddire.
//
// Le tre soglie sono quelle di sempre: sotto 768 telefono, 768–1023 tablet,
// da 1024 computer.

const TELEFONO_MAX = 767
const TABLET_MAX = 1023

function leggiDispositivo() {
  if (typeof window === 'undefined') return 'computer'
  const w = window.innerWidth
  if (w <= TELEFONO_MAX) return 'telefono'
  if (w <= TABLET_MAX) return 'tablet'
  return 'computer'
}

/**
 * `'telefono' | 'tablet' | 'computer'`.
 *
 * È l'hook da usare quando una misura cambia fra le tre versioni. Insieme a
 * `ui` e `per` in `theme.js`, permette di scrivere la misura **una volta
 * sola**:
 *
 *     const dev = useDevice(), u = per(dev)
 *     <button style={{ minHeight: u(ui.ctrlH) }}>
 *
 * invece di `isMobile ? 44 : isTablet ? 44 : 36`, che è la forma in cui chi
 * cambia un valore fa divergere gli altri due — ed è già successo: il
 * 15/09/2026 il tablet aveva 95 campi di testo sotto i 16px perché la regola
 * anti-zoom era scritta `isMobile ? 16 : 13` e su iPad prendeva il valore del
 * computer.
 */
export function useDevice() {
  const [dev, setDev] = useState(leggiDispositivo)
  useEffect(() => {
    // Una sola sottoscrizione per entrambe le soglie: i due stati non possono
    // arrivare in ordine diverso perché lo stato è uno.
    const mqT = window.matchMedia(`(max-width: ${TELEFONO_MAX}px)`)
    const mqB = window.matchMedia(`(max-width: ${TABLET_MAX}px)`)
    const aggiorna = () => setDev(leggiDispositivo())
    mqT.addEventListener('change', aggiorna)
    mqB.addEventListener('change', aggiorna)
    aggiorna()
    return () => {
      mqT.removeEventListener('change', aggiorna)
      mqB.removeEventListener('change', aggiorna)
    }
  }, [])
  return dev
}

// Hook responsive storico: true sotto `breakpoint` px (default 768 = telefono).
// Resta per i punti non ancora convertiti a `useDevice`.
export default function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])
  return isMobile
}

// true SOLO su tablet/iPad (768–1023px): né telefono né computer.
// Resta per i punti non ancora convertiti a `useDevice`.
export function useIsTablet() {
  const [isTablet, setIsTablet] = useState(
    () => window.innerWidth >= 768 && window.innerWidth <= 1023
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px) and (max-width: 1023px)')
    const handler = (e) => setIsTablet(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isTablet
}
