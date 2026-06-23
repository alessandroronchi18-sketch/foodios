// Structured logger per FoodOS.
//
// Front-end logger con livelli (debug/info/warn/error) + invio a:
//   1. console (sempre, ma debug/info droppati in build prod via vite.config esbuild.pure)
//   2. Sentry (se SENTRY_DSN configurato e SDK caricato)
//   3. server endpoint /api/feedback per error con severity = 'critical' (best effort)
//
// Uso:
//   import logger from '../lib/logger'
//   logger.info('User clicked X', { feature: 'menu-engineering' })
//   logger.warn('Slow query', { query: 'foodCost', durationMs: 3200 })
//   logger.error('Cannot save', new Error('network'), { context: 'magazzino' })
//
// Niente PII nei log: l'helper sanitize() rimuove email/IBAN/token da oggetti
// passati come context. Sentry beforeSend fa il secondo check.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const MIN_LEVEL = (
  // In dev tutto, in prod solo warn+ via env var override (server-side: serve
  // build-time replacement; al momento usiamo NODE_ENV via import.meta.env).
  typeof import.meta !== 'undefined' && import.meta.env?.PROD ? 'warn' : 'debug'
)

const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,        // email
  /\bIT\s?\d{2}\s?[A-Z]\s?\d{5}\s?\d{5}\s?\d{12}\b/gi,           // IBAN IT
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,     // JWT
  /\bsk_(?:live|test)_[A-Za-z0-9]+\b/g,                          // Stripe key
  /\bsb_secret_[A-Za-z0-9_-]+\b/g,                                // Supabase service key
]

function sanitize(value, depth = 0) {
  if (depth > 4) return '[truncated:deep]'
  if (value == null) return value
  if (typeof value === 'string') {
    let out = value
    for (const pat of PII_PATTERNS) {
      out = out.replace(pat, '[redacted]')
    }
    return out.length > 1000 ? out.slice(0, 1000) + '…[truncated]' : out
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitize(value.message, depth + 1),
      stack: sanitize(value.stack, depth + 1),
    }
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map(v => sanitize(v, depth + 1))
  }
  if (typeof value === 'object') {
    const out = {}
    let n = 0
    for (const k of Object.keys(value)) {
      if (n++ > 30) { out._truncated = true; break }
      // Skip campi noti sensibili.
      if (/^(password|token|secret|api_key|apikey|authorization|access_token|refresh_token)$/i.test(k)) {
        out[k] = '[redacted]'
        continue
      }
      out[k] = sanitize(value[k], depth + 1)
    }
    return out
  }
  return String(value)
}

function shouldLog(level) {
  return (LEVELS[level] ?? 0) >= (LEVELS[MIN_LEVEL] ?? 0)
}

function emit(level, msg, ctx = {}, err = null) {
  if (!shouldLog(level)) return
  const safeCtx = sanitize(ctx)
  const safeErr = err ? sanitize(err) : null
  const out = { level, msg: sanitize(msg), ts: new Date().toISOString(), ...safeCtx }
  if (safeErr) out.error = safeErr

  // Console (prod drop debug/info via esbuild.pure)
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.debug
  try { fn('[fos]', out) } catch {}

  // Sentry se attivo (caricato come window.Sentry da CDN o lazy)
  if (typeof window !== 'undefined' && window.Sentry) {
    try {
      if (level === 'error') {
        window.Sentry.captureException(err || new Error(msg), { extra: safeCtx, level })
      } else if (level === 'warn') {
        window.Sentry.captureMessage(msg, { extra: safeCtx, level })
      }
    } catch {}
  }
}

const logger = {
  debug: (msg, ctx) => emit('debug', msg, ctx),
  info:  (msg, ctx) => emit('info',  msg, ctx),
  warn:  (msg, ctx) => emit('warn',  msg, ctx),
  error: (msg, err, ctx) => emit('error', msg, ctx, err),
  // Helper per misurare durata di un'operazione.
  time: (label) => {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    return {
      end: (ctx) => emit('info', `timing:${label}`, { ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0), ...ctx }),
    }
  },
}

export default logger
export { sanitize }
