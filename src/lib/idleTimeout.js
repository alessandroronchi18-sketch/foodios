// Auto-logout dopo N ore di inattività.
// Traccia eventi di attività (mouse, keyboard, touch, scroll, visibility)
// e resetta il timer ogni volta. Quando il timer scatta, chiama onTimeout (di solito signOut).
//
// Non blocca chi sta lavorando attivamente — solo chi lascia la finestra aperta
// e va via. È una misura di igiene per dispositivi condivisi (cassa banco,
// computer del laboratorio).

// visibilitychange si dispatcha su `document`, non su `window`. Sui browser
// moderni bubble fino a window, ma non e' garantito (Safari/iOS edge cases).
// Lo registriamo separatamente su document; tutti gli altri restano su window.
const WIN_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'wheel']
const DOC_EVENTS = ['visibilitychange']
const LS_KEY = 'foodios_last_activity_ts'
// Persistiamo l'ultimo timestamp in localStorage così:
//  - se l'utente apre più tab, l'attività in una tiene viva l'altra
//  - se ricarica la pagina, ricomincia da dove eravamo (non da capo)
const CHECK_INTERVAL_MS = 60_000

export function startIdleTimeout({ timeoutMs, onTimeout, onWarning, warningBeforeMs = 5 * 60_000 } = {}) {
  if (!timeoutMs || timeoutMs < 60_000) return () => {}

  let warned = false
  const now = () => Date.now()

  function touch() {
    try { localStorage.setItem(LS_KEY, String(now())) } catch {}
    warned = false
  }

  function lastActivity() {
    try { return Number(localStorage.getItem(LS_KEY) || now()) } catch { return now() }
  }

  // Marca attività iniziale così il timer non scatta subito su una sessione appena rifrescata
  touch()

  const handler = () => {
    // visibilitychange: aggiorniamo solo quando la pagina diventa visibile
    if (document.visibilityState === 'hidden') return
    touch()
  }
  for (const ev of WIN_EVENTS) window.addEventListener(ev, handler, { passive: true })
  for (const ev of DOC_EVENTS) document.addEventListener(ev, handler, { passive: true })

  const check = setInterval(() => {
    const idle = now() - lastActivity()
    if (idle >= timeoutMs) {
      cleanup()
      try { onTimeout?.() } catch (e) { console.error('idleTimeout onTimeout fallito:', e) }
      return
    }
    if (!warned && idle >= timeoutMs - warningBeforeMs && onWarning) {
      warned = true
      try { onWarning(timeoutMs - idle) } catch {}
    }
  }, CHECK_INTERVAL_MS)

  function cleanup() {
    clearInterval(check)
    for (const ev of WIN_EVENTS) { try { window.removeEventListener(ev, handler) } catch {} }
    for (const ev of DOC_EVENTS) { try { document.removeEventListener(ev, handler) } catch {} }
  }
  return cleanup
}

export function clearIdleTimestamp() {
  try { localStorage.removeItem(LS_KEY) } catch {}
}
