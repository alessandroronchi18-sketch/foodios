import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.jsx'
import { ToastProvider, GlobalToastBridge } from './components/Toast.jsx'
import { ConfirmProvider } from './components/ConfirmModal.jsx'
import { registerServiceWorker, setupInstallPrompt } from './lib/pwa'

// ─── Sentry — SDK ufficiale con scrubber ───────────────────────────────────
// DSN nel client è pubblico per design (rate-limited lato Sentry).
// Per limitare la quota, attiva l'allowList del dominio nel pannello Sentry → Settings → Security.

// Pattern di chiavi sensibili da scrubbare (case-insensitive)
const SENSITIVE_KEY_RX = /^(password|passwd|pwd|token|access_token|refresh_token|api[_-]?key|secret|authorization|cookie|session|jwt|bearer|x[_-]?internal[_-]?secret|x[_-]?zucchetti[_-]?secret|cron[_-]?secret|service[_-]?key|anthropic|resend)/i
const SENSITIVE_VALUE_RX = /(eyJ[\w-]{20,}|sk-ant-\w{20,}|sk-\w{20,}|re_\w{10,}|Bearer\s+[\w-]+)/g

// Scrub ricorsivo di un oggetto: nasconde valori di chiavi sensibili e maschera token in stringhe.
function scrubObject(obj, depth = 0) {
  if (depth > 8 || obj == null) return obj
  if (typeof obj === 'string') return obj.replace(SENSITIVE_VALUE_RX, '[REDACTED]')
  if (Array.isArray(obj)) return obj.map(v => scrubObject(v, depth + 1))
  if (typeof obj !== 'object') return obj
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_RX.test(k)) out[k] = '[REDACTED]'
    else out[k] = scrubObject(v, depth + 1)
  }
  return out
}

// Rimuovi parametri sensibili da URL e query string
function scrubUrl(url) {
  if (typeof url !== 'string') return url
  try {
    const u = new URL(url)
    for (const param of [...u.searchParams.keys()]) {
      if (SENSITIVE_KEY_RX.test(param)) u.searchParams.set(param, '[REDACTED]')
    }
    return u.toString()
  } catch {
    return url.replace(SENSITIVE_VALUE_RX, '[REDACTED]')
  }
}

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_RELEASE || 'foodios@local',
  tracesSampleRate: 0.1,
  enabled: import.meta.env.PROD && !!import.meta.env.VITE_SENTRY_DSN,
  sendDefaultPii: false,
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Network request failed',
    'NetworkError',
    'Load failed',
    /chrome-extension:\/\//,
    /moz-extension:\/\//,
  ],
  // ── Scrubber: rimuovi token/password/api_key da URL, breadcrumbs, request data ──
  beforeSend(event) {
    try {
      if (event.request) {
        if (event.request.url) event.request.url = scrubUrl(event.request.url)
        if (event.request.query_string) event.request.query_string = scrubUrl('?' + event.request.query_string).slice(1)
        if (event.request.headers) event.request.headers = scrubObject(event.request.headers)
        if (event.request.cookies) event.request.cookies = '[REDACTED]'
        if (event.request.data) event.request.data = scrubObject(event.request.data)
      }
      if (event.extra) event.extra = scrubObject(event.extra)
      if (event.contexts) event.contexts = scrubObject(event.contexts)
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.value) ex.value = ex.value.replace(SENSITIVE_VALUE_RX, '[REDACTED]')
        }
      }
    } catch { /* fail-soft */ }
    return event
  },
  beforeBreadcrumb(breadcrumb) {
    try {
      if (breadcrumb.data?.url) breadcrumb.data.url = scrubUrl(breadcrumb.data.url)
      if (breadcrumb.message) breadcrumb.message = breadcrumb.message.replace(SENSITIVE_VALUE_RX, '[REDACTED]')
      if (breadcrumb.data) breadcrumb.data = scrubObject(breadcrumb.data)
    } catch {}
    return breadcrumb
  },
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

// Fallback mostrato se un errore di rendering React fa crashare l'albero.
// Senza ErrorBoundary l'utente vedrebbe una pagina bianca; qui mostriamo un
// messaggio chiaro e l'errore è già segnalato a Sentry da ErrorBoundary.
function AppErrorFallback({ resetError }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', padding: 24, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 440, textAlign: 'center', background: '#fff', border: '1px solid #E8E0DC', borderRadius: 16, padding: '36px 28px', boxShadow: '0 4px 20px rgba(15,23,42,0.08)' }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: '#9C887F' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        </div>
        <h1 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 800, color: '#1C0A0A' }}>Qualcosa è andato storto</h1>
        <p style={{ margin: '0 0 22px', fontSize: 14, color: '#6B4C44', lineHeight: 1.6 }}>
          Si è verificato un errore imprevisto. È stato segnalato automaticamente: riprova ricaricando la pagina.
        </p>
        <button onClick={() => { try { resetError() } catch {} window.location.reload() }}
          style={{ padding: '12px 26px', background: '#6E0E1A', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
          Ricarica
        </button>
      </div>
    </div>
  )
}

// PWA: registra service worker + cattura beforeinstallprompt.
// Su update disponibile, mostra prompt nativo (toast non ancora montato a init).
setupInstallPrompt()
registerServiceWorker({
  onUpdateAvailable: (apply) => {
    // Lasciamo che l'utente accetti via toast tramite window.__foodos_toast
    // (popolato da GlobalToastBridge dopo render). Fallback: applica al prossimo reload.
    if (window.__foodos_toast) {
      window.__foodos_toast.info('Nuova versione disponibile — ricarica per aggiornare', {
        action: { label: 'Aggiorna', onClick: () => apply() },
      })
    }
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <GlobalToastBridge />
      <ConfirmProvider>
        <Sentry.ErrorBoundary fallback={(props) => <AppErrorFallback {...props} />}>
          <App />
        </Sentry.ErrorBoundary>
      </ConfirmProvider>
    </ToastProvider>
  </React.StrictMode>
)
