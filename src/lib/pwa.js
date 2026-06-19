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
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return
        refreshing = true
        window.location.reload()
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
    // No round-trip ack — fail-soft, basta che il messaggio parta.
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
