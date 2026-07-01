// useAutoLogoutDipendente — auto-logout dopo inattivita' per sessioni dipendente.
//
// Motivazione: il tablet in laboratorio e' condiviso tra piu' dipendenti. Se
// uno chiude il turno senza fare logout, il successivo potrebbe agire con
// l'account precedente. Timeout di 30 minuti senza attivita' → signOut +
// redirect a login.
//
// Attiva SOLO per ruolo=='dipendente'. Il titolare non viene disconnesso
// automaticamente (lavora da desktop suo, non condiviso).
//
// Attivita' considerate: mousemove, keydown, touchstart, click, scroll.

import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const INACTIVITY_MS = 30 * 60 * 1000   // 30 minuti
const CHECK_INTERVAL_MS = 60 * 1000    // check ogni minuto
const EVENTS = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll']

export function useAutoLogoutDipendente({ ruolo, enabled = true }) {
  const lastActivityRef = useRef(Date.now())

  useEffect(() => {
    if (!enabled) return
    if (ruolo !== 'dipendente') return

    const bump = () => { lastActivityRef.current = Date.now() }
    for (const ev of EVENTS) {
      window.addEventListener(ev, bump, { passive: true })
    }

    const checkId = setInterval(async () => {
      const idleMs = Date.now() - lastActivityRef.current
      if (idleMs >= INACTIVITY_MS) {
        try { await supabase.auth.signOut() } catch { /* fail-open */ }
        // Il signOut triggera onAuthStateChange in useAuth → AuthPage.
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      for (const ev of EVENTS) {
        window.removeEventListener(ev, bump)
      }
      clearInterval(checkId)
    }
  }, [ruolo, enabled])
}
