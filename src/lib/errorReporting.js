// Error reporting "Sentry-style" senza dipendere dal SDK Sentry installato.
//
// PERCHÉ NON USARE @sentry/react DIRETTAMENTE:
//   1) Aggiungerebbe ~80KB al bundle anche per chi non l'ha attivato
//   2) Richiede npm install che cambia il lockfile
//   3) Su CSP rigorosa, l'init script va whitelisted con cura
//
// COSA FA QUESTO MODULO:
//   - Cattura errori non gestiti (window.error, unhandledrejection)
//   - Cattura errori React via ErrorBoundary (vedi src/components/ErrorBoundary.jsx)
//   - Li bufferizza e li manda a /api/error-report
//   - L'endpoint server inoltra al Sentry envelope se SENTRY_DSN è configurato
//
// COME ATTIVARE SENTRY VERO:
//   1) Crea un progetto su sentry.io → copia il DSN (formato: https://KEY@oXXX.ingest.sentry.io/PROJ)
//   2) Aggiungi su Vercel env vars:
//        SENTRY_DSN=https://KEY@oXXX.ingest.sentry.io/PROJ
//        VITE_ERROR_REPORTING_ENABLED=1
//   3) Re-deploy
//
// Per upgrade a Sentry pieno (replay, tracing): npm install @sentry/react e sostituisci
// le funzioni `report*` qui sotto con `Sentry.captureException` ecc.

const ENABLED = String(import.meta.env.VITE_ERROR_REPORTING_ENABLED || '') === '1'
const ENVIRONMENT = import.meta.env.MODE || 'production'
const RELEASE = import.meta.env.VITE_RELEASE || 'foodios@local'

const BUFFER_SIZE = 20
let buffer = []
let userContext = null

function nowIso() { return new Date().toISOString() }

function safeStringify(obj, max = 4000) {
  try {
    const s = JSON.stringify(obj, (k, v) => {
      if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack?.slice(0, 1000) }
      return v
    })
    return s.length > max ? s.slice(0, max) + '…[truncated]' : s
  } catch { return String(obj).slice(0, max) }
}

function buildPayload(level, error, extra = {}) {
  const e = error instanceof Error ? error : new Error(String(error))
  return {
    ts: nowIso(),
    level,
    environment: ENVIRONMENT,
    release: RELEASE,
    user: userContext ? { id: userContext.id, email_hash: userContext.emailHash } : null,
    error: {
      name: e.name,
      message: e.message?.slice(0, 500),
      stack: e.stack?.slice(0, 2000),
    },
    extra: safeStringify(extra),
    url: typeof window !== 'undefined' ? window.location.pathname : null,
    ua: typeof navigator !== 'undefined' ? (navigator.userAgent || '').slice(0, 200) : null,
  }
}

async function flush(payload) {
  if (!ENABLED) return
  // Best-effort, fail-soft: l'errore di reporting non deve causare a sua volta errori.
  try {
    await fetch('/api/error-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Niente Authorization: l'endpoint accetta payload anonimi (è un endpoint receiver,
      // non un endpoint che restituisce dati). Rate limit per IP applicato server-side.
      body: JSON.stringify(payload),
      keepalive: true,
    })
  } catch { /* il reporter è giù → niente fallback */ }
}

export function setErrorReportingUser(user) {
  if (!user) { userContext = null; return }
  // Non inviamo l'email completa lato server: hashiamo client-side per privacy.
  hashString(user.email || '').then(emailHash => {
    userContext = { id: user.id?.slice(0, 16), emailHash }
  }).catch(() => {
    userContext = { id: user.id?.slice(0, 16), emailHash: null }
  })
}

async function hashString(s) {
  if (!s || !crypto?.subtle) return null
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

export function reportError(err, extra = {}) {
  const payload = buildPayload('error', err, extra)
  // buffer per debug locale
  buffer = [payload, ...buffer].slice(0, BUFFER_SIZE)
  if (import.meta.env.DEV) console.error('[errorReporting]', payload)
  return flush(payload)
}

export function reportWarning(msg, extra = {}) {
  const payload = buildPayload('warning', new Error(msg), extra)
  buffer = [payload, ...buffer].slice(0, BUFFER_SIZE)
  return flush(payload)
}

export function getRecentErrors() { return [...buffer] }

// ── Bootstrap globale ────────────────────────────────────────────────────────
// Chiamato una volta da main.jsx. Non blocca il render.
export function initErrorReporting() {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (ev) => {
    if (!ev || !ev.error) return
    reportError(ev.error, { source: 'window.error', filename: ev.filename, lineno: ev.lineno, colno: ev.colno })
  })

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev?.reason
    if (!reason) return
    reportError(
      reason instanceof Error ? reason : new Error(String(reason)),
      { source: 'unhandledrejection' },
    )
  })

  if (ENABLED && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info('[errorReporting] attivo —', { release: RELEASE, environment: ENVIRONMENT })
  }
}
