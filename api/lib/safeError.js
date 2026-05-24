// Helper per gestire errori senza leak di info al client.
// In produzione → ritorna messaggio generico, logga il dettaglio a Sentry.
// In sviluppo → ritorna il messaggio reale per debug rapido.
//
// I PostgreSQL error messages contengono spesso column/constraint/table names
// utili a un attaccante per mappare lo schema. Non vanno mai esposti.

const IS_PROD = (process.env.VERCEL_ENV === 'production') || (process.env.NODE_ENV === 'production')

// Mapping di error code → messaggio user-friendly safe da mostrare
const SAFE_PATTERNS = [
  { test: e => e?.code === '23505', message: 'Risorsa già esistente' },
  { test: e => e?.code === '23503', message: 'Riferimento non valido' },
  { test: e => e?.code === '23502', message: 'Dato obbligatorio mancante' },
  { test: e => e?.code === '42P01', message: 'Servizio non disponibile' },
  { test: e => e?.code === '42501', message: 'Permessi insufficienti' },
  { test: e => e?.code === 'PGRST116', message: 'Risorsa non trovata' },
  { test: e => e?.status === 401, message: 'Non autorizzato' },
  { test: e => e?.status === 403, message: 'Accesso negato' },
  { test: e => e?.status === 404, message: 'Risorsa non trovata' },
]

/**
 * Inoltra l'errore al monitoring se disponibile.
 * Sentry SDK è solo client-side (browser); lato server Edge facciamo console.error
 * con contesto strutturato che Vercel inoltra a Sentry tramite l'integration "Vercel Sentry"
 * o agli Vercel Logs.
 */
function captureForMonitoring(error, context = {}) {
  // Stringify safe: niente cicli, no funzioni
  let serialized = null
  try {
    serialized = JSON.stringify({
      message: error?.message,
      code: error?.code,
      status: error?.status,
      hint: error?.hint,
      stack: error?.stack?.slice(0, 1500),
      ...context,
    })
  } catch { serialized = String(error) }
  // Edge runtime: console.error finisce in Vercel Logs e (se Sentry-Vercel installato) su Sentry
  console.error('[safeError]', serialized)
}

/**
 * Restituisce un messaggio SAFE da mostrare al client.
 * In sviluppo lascia passare il messaggio reale (utile per debug rapido).
 * In produzione cerca pattern noti, altrimenti generico.
 */
export function publicErrorMessage(error) {
  if (!IS_PROD) {
    // In dev/preview, includi codice + message per agevolare debug
    if (error?.code && error?.message) return `[${error.code}] ${error.message}`
    return error?.message || 'Errore'
  }
  for (const p of SAFE_PATTERNS) {
    if (p.test(error)) return p.message
  }
  return 'Errore interno'
}

/**
 * Costruisce un body { error } pronto da serializzare.
 * Logga l'errore reale al monitoring, ritorna solo il messaggio safe.
 *
 * USAGE:
 *   try { ... } catch (e) {
 *     const { body, status } = safeError(e, { endpoint: 'admin', op: 'approva', orgId })
 *     return new Response(JSON.stringify(body), { status, headers: ... })
 *   }
 */
export function safeError(error, context = {}, fallbackStatus = 500) {
  captureForMonitoring(error, context)
  const status = error?.status || error?.statusCode || fallbackStatus
  return {
    body: { error: publicErrorMessage(error) },
    status: typeof status === 'number' && status >= 400 && status < 600 ? status : 500,
  }
}

// Variante shortcut: ritorna direttamente una Response
export function safeErrorResponse(error, context = {}, fallbackStatus = 500, corsHeaders = {}) {
  const { body, status } = safeError(error, context, fallbackStatus)
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
