// safeFetch — wrapper di fetch con timeout obbligatorio (AbortController).
// Audit 2026-06-14 PM: trovati 6+ punti dove fetch a provider esterni
// (Anthropic, Twilio, Open-Meteo, Resend, Fatture in Cloud, Stripe) non
// avevano timeout → un hang del provider blocca Edge Function per 30s
// (timeout Vercel) → cascading failure su cron-giornaliero seriale.
//
// Uso:
//   const r = await safeFetch(url, opts, 15000)
//   if (!r.ok) throw new Error(`HTTP ${r.status}`)
//
// Errore di timeout: throws `Error('timeout dopo Xms su <url>')`.
// Errore di rete: rilancia l'AbortError o l'errore originale di fetch.

export const DEFAULT_TIMEOUT_MS = 15_000

export async function safeFetch(url, opts = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...opts, signal: opts.signal || controller.signal })
  } catch (e) {
    if (e?.name === 'AbortError' && controller.signal.aborted) {
      const host = (() => { try { return new URL(url).host } catch { return url.slice(0, 60) } })()
      throw new Error(`timeout dopo ${timeoutMs}ms su ${host}`)
    }
    throw e
  } finally {
    clearTimeout(t)
  }
}

// Variante per provider AI/LLM con timeout più lungo (Claude Sonnet/Opus
// possono prendere 20-25s su payload complessi).
export async function safeFetchLLM(url, opts = {}, timeoutMs = 25_000) {
  return safeFetch(url, opts, timeoutMs)
}
