// PWA service worker registration + helpers.
// Strategia: registra il SW in produzione e in dev solo se VITE_PWA_DEV=true,
// per evitare cache aggressiva durante lo sviluppo locale.
//
// Notifica all'utente quando un update è pronto (waiting) e permette di
// applicarlo via skipWaiting + reload.

const SW_PATH = '/sw.js'

// Un aggiornamento non si applica da solo mentre l'utente sta lavorando.
//
// Prima bastava tornare sulla finestra per far scattare il controllo, trovare
// un deploy nuovo e ricaricare la pagina all'istante. Chi passava da Chrome a
// un'altra applicazione e tornava indietro si ritrovava buttato fuori da dove
// era: sembrava un logout. Nei giorni con più pubblicazioni succedeva a ogni
// cambio di finestra.
//
// Ora l'aggiornamento si applica da solo SOLO se la scheda è rimasta nascosta
// abbastanza a lungo da far pensare che nessuno la stia usando. Sotto quella
// soglia l'aggiornamento resta in attesa e viene proposto, non imposto.
const AUTO_UPDATE_DOPO_MS = 30 * 60 * 1000   // 30 minuti in secondo piano
// Non ha senso interrogare il CDN a ogni cambio di finestra: chi lavora
// alternando due programmi lo farebbe decine di volte al minuto.
const MIN_TRA_CONTROLLI_MS = 10 * 60 * 1000

let _swReg = null
let _updateAvailableCallback = null
let _nascostaDa = null          // quando la scheda è passata in secondo piano
let _ultimoControllo = 0
// Al primissimo avvio l'applicazione non ha ancora nulla da perdere: se arriva
// un aggiornamento in quel momento, applicarlo subito è la cosa giusta.
let _autoUpdateConsentito = true

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

      // Passato il primo minuto diamo per scontato che l'utente stia lavorando:
      // da qui in poi un aggiornamento non si applica più da solo, viene
      // proposto con l'avviso "Nuova versione disponibile · Aggiorna".
      setTimeout(() => { _autoUpdateConsentito = false }, 60_000)

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
        // Se l'utente sta lavorando, un ricaricamento improvviso lo butta fuori
        // da dove era: la pagina torna all'inizio e sembra un logout. In quel
        // caso l'aggiornamento resta pronto e viene solo proposto; si applica
        // al prossimo avvio dell'app o quando l'utente accetta.
        if (!_autoUpdateConsentito) { notifyUpdate(); return }
        try {
          const k = 'foodos_sw_reload_ts'
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

      // Controllo al rientro in primo piano (Safari sospende il setInterval
      // quando la PWA non è visibile), ma con due freni.
      //
      // 1. Non più di un controllo ogni 10 minuti: chi lavora alternando due
      //    programmi cambia finestra decine di volte, e interrogare il CDN a
      //    ogni passaggio è inutile.
      // 2. L'aggiornamento si applica da solo solo se la scheda è rimasta
      //    nascosta a lungo. Se sei appena andato su un'altra finestra e sei
      //    tornato, l'aggiornamento resta in attesa e non ti sposta da dove sei.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          _nascostaDa = Date.now()
          return
        }
        const nascostaPer = _nascostaDa ? Date.now() - _nascostaDa : 0
        _nascostaDa = null
        _autoUpdateConsentito = nascostaPer >= AUTO_UPDATE_DOPO_MS

        if (Date.now() - _ultimoControllo < MIN_TRA_CONTROLLI_MS) return
        _ultimoControllo = Date.now()
        reg.update().catch(() => {})
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
