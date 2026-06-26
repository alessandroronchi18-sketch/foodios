// PWA service worker registration + helpers.
// Strategia: registra il SW in produzione e in dev solo se VITE_PWA_DEV=true,
// per evitare cache aggressiva durante lo sviluppo locale.
//
// Notifica all'utente quando un update è pronto (waiting) e permette di
// applicarlo via skipWaiting + reload.

const SW_PATH = '/sw.js'

let _swReg = null
let _updateAvailableCallback = null

export function registerServiceWorker({ onUpdateAvailable } = {}) {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  // Salta in dev locale a meno di override esplicito (cache spesso confonde HMR).
  const isDev = import.meta.env.DEV
  const allowDev = import.meta.env.VITE_PWA_DEV === 'true'
  if (isDev && !allowDev) return

  _updateAvailableCallback = onUpdateAvailable || null

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(SW_PATH, { scope: '/' })
      _swReg = reg

      // Notifica se c'è già un SW in waiting.
      if (reg.waiting) notifyUpdate()

      // Watch per nuovi SW che diventano installati.
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            notifyUpdate()
          }
        })
      })

      // Refresh quando il SW prende controllo (post skipWaiting → reload).
      // Audit 2026-06-25 CRITICO: questo handler era causa di "girava tra pagine
      // a caso" - quando un chunk lazy fallisce (vecchio hash non più sul CDN),
      // l'ErrorBoundary innesca reload, il SW poll detect nuovo SW, controllerchange
      // triggera un secondo reload mentre l'utente sta già navigando → ciclo.
      // Guard: reloadiamo solo se non abbiamo già reloaded negli ultimi 60s,
      // e cancelliamo la cache prima del reload per non servire chunk obsoleti.
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return
        try {
          const k = 'foodios_sw_reload_ts'
          const last = Number(sessionStorage.getItem(k)) || 0
          if (Date.now() - last < 60_000) return // anti-loop hard 60s
          sessionStorage.setItem(k, String(Date.now()))
        } catch { /* sessionStorage non disponibile, procedi */ }
        refreshing = true
        // Pulisci cache runtime prima del reload - il nuovo SW caches ricomincia da zero.
        try {
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' })
          }
        } catch { /* noop */ }
        // Piccolo delay per dare tempo al CLEAR_CACHE di partire.
        setTimeout(() => window.location.reload(), 80)
      })

      // Polling periodico per intercettare nuovi deploy senza dover aspettare
      // che il browser decida di ricontrollare il SW da solo (Safari iOS lo fa
      // al massimo ogni 24h → utenti restavano incollati alla cache vecchia
      // per un giorno intero dopo deploy con UI nuova).
      //
      // Ogni 15 minuti chiediamo al SW di re-fetchare /sw.js dal CDN: se l'hash
      // CACHE_VERSION e' cambiato (auto-bumpato in build via
      // scripts/bump-sw-cache.mjs), il browser scarica il nuovo SW, parte
      // l'evento updatefound + statechange + controllerchange → reload.
      const SW_POLL_MS = 15 * 60 * 1000
      setInterval(() => {
        reg.update().catch(() => { /* silent, riproveremo */ })
      }, SW_POLL_MS)

      // Update anche al rientro in foreground (Safari sospende il setInterval
      // quando la PWA non e' visibile - al ritorno verifichiamo subito).
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {})
        }
      })
    } catch (err) {
      // Fail-soft: la PWA degrada a app web normale.
      console.warn('[pwa] SW registration failed', err?.message)
    }
  })
}

function notifyUpdate() {
  if (_updateAvailableCallback) _updateAvailableCallback(applyUpdate)
}

export function applyUpdate() {
  if (_swReg?.waiting) _swReg.waiting.postMessage({ type: 'SKIP_WAITING' })
}

export function clearServiceWorkerCache() {
  if (!navigator.serviceWorker?.controller) return Promise.resolve()
  return new Promise((resolve) => {
    navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' })
    // No round-trip ack - fail-soft, basta che il messaggio parta.
    setTimeout(resolve, 100)
  })
}

// ── PWA install prompt (capture event + expose API per UI) ──────────────────
let _deferredInstallPrompt = null

export function setupInstallPrompt() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    _deferredInstallPrompt = e
  })
  window.addEventListener('appinstalled', () => {
    _deferredInstallPrompt = null
  })
}

export function canInstallPWA() {
  return !!_deferredInstallPrompt
}

export async function promptPWAInstall() {
  if (!_deferredInstallPrompt) return { outcome: 'unavailable' }
  _deferredInstallPrompt.prompt()
  const choice = await _deferredInstallPrompt.userChoice
  _deferredInstallPrompt = null
  return choice
}

// ── Detection: app installata (display-mode standalone) ─────────────────────
export function isStandalonePWA() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.startsWith('android-app://')
  )
}
