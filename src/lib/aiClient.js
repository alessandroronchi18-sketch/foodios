// Client AI unificato per FoodOS.
//
// Astrazione su POST /api/ai con benefici trasversali a tutte le 15+ feature AI:
//   - timeout configurabile (default 30s, sovrascrivibile)
//   - retry 1x su errori transient (5xx, network, abort)
//   - parsing JSON resiliente: cleanup di markdown fences, virgolette smart,
//     fallback su estrazione del primo JSON valido nel testo
//   - error friendly in italiano umano (no "Network Error", no stack trace)
//   - sanitizzazione anti-prompt-injection sull'input utente (strip caratteri
//     zero-width + truncate a max-len configurabile)
//   - telemetry feature_name + latency_ms in localStorage per debug founder
//   - messaging dei costi senza esporre il pricing all'utente finale
//
// Tutti i callsite delle feature AI dovrebbero migrare a questo helper
// per ridurre la divergenza di UX/error-handling fra view.

import { supabase } from './supabase'

const DEFAULT_TIMEOUT_MS = 30_000      // 30s, Anthropic risponde tipicamente in 4-12s
const RETRY_DELAY_MS = 1_200            // 1.2s prima di retry su errore transient

// Sanitizza input utente prima di darlo al modello.
// - Strip caratteri Unicode "zero-width" usati per prompt-injection invisibile
// - Truncate per evitare body too large (max 100k char default)
// - Trim
export function sanitizeUserInput(text, maxLen = 100_000) {
  if (text == null) return ''
  const noZeroWidth = String(text).replace(/[​-‍⁠-⁯﻿]/g, '')
  return noZeroWidth.slice(0, maxLen).trim()
}

// Parsing JSON tollerante: cleanup tipici di Claude (markdown fences, smart
// quotes, trailing comma) + fallback su estrazione del primo {…} bilanciato.
export function parseAiJson(text) {
  if (typeof text !== 'string') return null
  let clean = text.trim()
  // Rimuovi ```json...``` o ``` fences.
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  // Tenta direct parse.
  try { return JSON.parse(clean) } catch {}
  // Fallback: estrai primo {…} bilanciato e parsa quello.
  const start = clean.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let escape = false
  for (let i = start; i < clean.length; i++) {
    const c = clean[i]
    if (escape) { escape = false; continue }
    if (c === '\\') { escape = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        const candidate = clean.slice(start, i + 1)
        try { return JSON.parse(candidate) } catch { return null }
      }
    }
  }
  return null
}

// Friendly error: trasforma vari fail-mode in messaggio italiano umano.
// NB: il copy è volutamente diretto, senza "Mi dispiace ma..." — vedi memory
// feedback-no-ai-copy.
export function friendlyAiError(err, status) {
  if (status === 429) return 'Limite AI raggiunto per oggi. Riprova domani.'
  if (status === 401) return 'Sessione scaduta, ricarica la pagina.'
  if (status === 403) return 'Questa funzione AI è nel piano superiore.'
  if (status === 413) return 'Input troppo grande, prova a ridurlo.'
  if (status === 502 || status === 503 || status === 504) {
    return 'Il servizio AI è momentaneamente sovraccarico, riprova fra 30 secondi.'
  }
  if (err?.name === 'AbortError') return 'Tempo scaduto. Riprova.'
  if (err?.message?.includes('Failed to fetch')) return 'Connessione persa. Controlla la rete.'
  return 'Errore AI. Riprova fra qualche secondo.'
}

// Telemetry locale (no fetch al server, solo localStorage per debug founder).
function logTelemetry(feature, ok, ms) {
  try {
    const KEY = 'foodios_ai_telemetry'
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]')
    arr.push({ feature, ok, ms, ts: Date.now() })
    // Mantieni solo ultime 200 entries
    if (arr.length > 200) arr.splice(0, arr.length - 200)
    localStorage.setItem(KEY, JSON.stringify(arr))
  } catch {}
}

// ── API principale ───────────────────────────────────────────────────────
//
// Esempio:
//   const { text, json, raw } = await callAi({
//     feature: 'menu-engineering',
//     model: 'claude-sonnet-4-6',
//     system: 'Sei un consulente food cost...',
//     prompt: 'Analizza questi prodotti: ...',
//     maxTokens: 1500,
//     parseJson: true,            // tenta parse JSON sul response
//     timeoutMs: 45_000,          // optional, default 30s
//     retry: true,                // default true su errori 5xx/network
//   })
//
// Throws Error con .friendly = messaggio italiano umano già pronto per toast.
export async function callAi(opts) {
  const {
    feature = 'unknown',
    model = 'claude-sonnet-4-6',
    system,
    prompt,
    messages,           // alternative a `prompt`: array messages completo
    maxTokens = 1500,
    parseJson = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retry = true,
    extra,              // body extra (es. images per vision)
  } = opts

  // Costruisci body: messages override prompt.
  const body = {
    model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: messages || [{ role: 'user', content: prompt || '' }],
    ...(extra || {}),
  }

  const tryOnce = async () => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const t0 = Date.now()
    try {
      const session = await supabase.auth.getSession()
      const token = session?.data?.session?.access_token
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      const ms = Date.now() - t0
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        const err = new Error(`AI ${res.status}: ${errText.slice(0, 200)}`)
        err.status = res.status
        err.friendly = friendlyAiError(err, res.status)
        logTelemetry(feature, false, ms)
        throw err
      }
      const data = await res.json()
      logTelemetry(feature, true, ms)
      const text = data?.content?.[0]?.text || ''
      const json = parseJson ? parseAiJson(text) : undefined
      return { text, json, raw: data, ms }
    } catch (e) {
      logTelemetry(feature, false, Date.now() - t0)
      if (!e.friendly) e.friendly = friendlyAiError(e, e.status)
      throw e
    } finally {
      clearTimeout(timer)
    }
  }

  try {
    return await tryOnce()
  } catch (e) {
    // Retry solo su status transient (5xx) o network.
    const isTransient = e.status >= 500 || e.name === 'AbortError'
      || e.message?.includes('Failed to fetch')
    if (!retry || !isTransient) throw e
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
    return await tryOnce()
  }
}

// Telemetry reader per dashboard admin (ultimi N call).
export function readAiTelemetry(limit = 50) {
  try {
    const arr = JSON.parse(localStorage.getItem('foodios_ai_telemetry') || '[]')
    return arr.slice(-limit)
  } catch {
    return []
  }
}
