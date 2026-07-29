// useAutoLogoutDipendente — timeout inattivita' per l'identita' dipendente
// dentro un account laboratorio.
//
// Motivazione: il tablet in laboratorio è condiviso tra più dipendenti. Se
// Marco fa il turno del mattino e va via senza cambiare identita', al pomeriggio
// Anna arriva e le operazioni verrebbero loggate a nome di Marco.
//
// Semantica (nuova, cambiata 2026-07-28): dopo 30 minuti di inattivita' il
// tablet NON fa signOut Supabase — resta loggato l'account laboratorio (email
// + password condivisa). Chiama solo `deseleziona()` sul Context, tornando
// alla schermata "Chi sei?". Chi arriva dopo mette solo il proprio codice
// personale (4 cifre), senza dover rifare login con la password del laboratorio.
//
// Attiva SOLO se: enabled=true (passato solo per account laboratorio).
// Attivita' considerate: mousemove, keydown, touchstart, click, scroll.

import { useEffect, useRef } from 'react'

const INACTIVITY_MS = 30 * 60 * 1000   // 30 minuti
const CHECK_INTERVAL_MS = 60 * 1000    // check ogni minuto
const EVENTS = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll']

export function useAutoLogoutDipendente({ enabled, onTimeout }) {
  const lastActivityRef = useRef(Date.now())

  useEffect(() => {
    if (!enabled) return

    const bump = () => { lastActivityRef.current = Date.now() }
    for (const ev of EVENTS) {
      window.addEventListener(ev, bump, { passive: true })
    }

    const checkId = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current
      if (idleMs >= INACTIVITY_MS) {
        try { onTimeout?.() } catch { /* noop */ }
        // Reset per evitare chiamate ripetute finche' l'utente non riparte
        lastActivityRef.current = Date.now()
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      for (const ev of EVENTS) {
        window.removeEventListener(ev, bump)
      }
      clearInterval(checkId)
    }
  }, [enabled, onTimeout])
}
