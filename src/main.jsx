import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.jsx'

// ─── Sentry — SDK ufficiale ────────────────────────────────────────────────
// DSN nel client è OK: è pubblico per design (rate-limited lato Sentry).
// Per limitare la quota, attiva l'allowList del dominio nel pannello Sentry → Settings → Security.
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_RELEASE || 'foodios@local',
  tracesSampleRate: 0.1,
  enabled: import.meta.env.PROD && !!import.meta.env.VITE_SENTRY_DSN,
  // Riduci rumore: ignora errori di estensioni browser e script di terze parti
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Network request failed',
    'NetworkError',
    'Load failed',
    /chrome-extension:\/\//,
    /moz-extension:\/\//,
  ],
})

// In sviluppo: errore visibile in pagina per debug rapido.
// In produzione: Sentry intercetta automaticamente window.error e unhandledrejection,
// il rendering React non viene distrutto.
if (import.meta.env.DEV) {
  window.onerror = (msg, src, line, col, err) => {
    document.body.innerHTML = `<pre style="color:red;padding:20px;font-family:monospace;font-size:13px;white-space:pre-wrap">${msg}\n${src}:${line}\n${err?.stack || ''}</pre>`
  }
  window.addEventListener('unhandledrejection', e => {
    document.body.innerHTML = `<pre style="color:red;padding:20px;font-family:monospace;font-size:13px;white-space:pre-wrap">Unhandled Promise Rejection:\n${e.reason?.stack || e.reason}</pre>`
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
