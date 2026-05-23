import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initErrorReporting, reportError } from './lib/errorReporting'

// Inizializza il reporter (no-op se VITE_ERROR_REPORTING_ENABLED non è settato)
initErrorReporting()

// In sviluppo: mostra l'errore in pagina (debug rapido).
// In produzione: solo report a Sentry/audit, niente body dump che leakerebbe stack utente.
if (import.meta.env.DEV) {
  window.onerror = (msg, src, line, col, err) => {
    document.body.innerHTML = `<pre style="color:red;padding:20px;font-family:monospace;font-size:13px;white-space:pre-wrap">${msg}\n${src}:${line}\n${err?.stack || ''}</pre>`
  }
  window.addEventListener('unhandledrejection', e => {
    document.body.innerHTML = `<pre style="color:red;padding:20px;font-family:monospace;font-size:13px;white-space:pre-wrap">Unhandled Promise Rejection:\n${e.reason?.stack || e.reason}</pre>`
  })
} else {
  // In produzione, errori non gestiti vanno a Sentry (se attivo) + audit_log,
  // senza distruggere la UI. Lasciamo che il rendering React continui.
  window.onerror = (msg, src, line, col, err) => {
    try { reportError(err || new Error(String(msg)), { source: 'window.onerror', src, line, col }) } catch {}
    return false
  }
  window.addEventListener('unhandledrejection', e => {
    try { reportError(e.reason instanceof Error ? e.reason : new Error(String(e.reason)), { source: 'unhandledrejection' }) } catch {}
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
