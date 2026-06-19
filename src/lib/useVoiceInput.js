// useVoiceInput — Web Speech API hook per input vocale rapido.
// Pensato per il dipendente in laboratorio (mani sporche / guanti).
//
// Uso:
//   const { supported, listening, transcript, start, stop, reset } = useVoiceInput({
//     lang: 'it-IT',
//     onResult: (text) => setNomeProdotto(text),
//   })
//   <button onPointerDown={start} onPointerUp={stop}>🎤 Tieni premuto per parlare</button>
//
// Note:
// - Funziona su Chrome/Edge/Safari mobile. Firefox no (gracefully degrada).
// - `onResult` riceve testo "interim" + "final" — distingue con flag isFinal.
// - Press-and-hold pattern: start su pointer down, stop su pointer up.

import { useState, useEffect, useRef, useCallback } from 'react'

function getSR() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export default function useVoiceInput({
  lang = 'it-IT',
  continuous = false,
  interim = true,
  onResult,
  onError,
} = {}) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [lastError, setLastError] = useState(null)
  const recognitionRef = useRef(null)

  useEffect(() => {
    const SR = getSR()
    if (!SR) { setSupported(false); return }
    setSupported(true)
    const rec = new SR()
    rec.lang = lang
    rec.continuous = continuous
    rec.interimResults = interim
    rec.maxAlternatives = 1

    rec.onresult = (event) => {
      let interimText = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        if (res.isFinal) finalText += res[0].transcript
        else interimText += res[0].transcript
      }
      const text = (finalText || interimText).trim()
      setTranscript(text)
      if (onResult) {
        onResult(text, { isFinal: !!finalText })
      }
    }
    rec.onerror = (e) => {
      setLastError(e.error || 'unknown')
      if (onError) onError(e.error || 'unknown')
    }
    rec.onend = () => {
      setListening(false)
    }
    recognitionRef.current = rec

    return () => {
      try { rec.abort() } catch {}
      recognitionRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, continuous, interim])

  const start = useCallback(() => {
    if (!recognitionRef.current) return
    setTranscript('')
    setLastError(null)
    try {
      recognitionRef.current.start()
      setListening(true)
    } catch {
      // Already-started error: silent.
    }
  }, [])

  const stop = useCallback(() => {
    if (!recognitionRef.current) return
    try { recognitionRef.current.stop() } catch {}
  }, [])

  const reset = useCallback(() => {
    setTranscript('')
    setLastError(null)
  }, [])

  return { supported, listening, transcript, lastError, start, stop, reset }
}

// ── Parser numerico: "tre kg" → 3000, "cinque vaschette" → 5 ─────────────────
const PAROLE_NUMERO = {
  zero: 0, uno: 1, un: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5,
  sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12,
  tredici: 13, quattordici: 14, quindici: 15, sedici: 16, diciassette: 17,
  diciotto: 18, diciannove: 19, venti: 20, trenta: 30, quaranta: 40,
  cinquanta: 50, sessanta: 60, settanta: 70, ottanta: 80, novanta: 90,
  cento: 100, mille: 1000,
}

/**
 * Estrae un numero da una frase italiana parlata.
 * Esempi:
 *   "cinque kg" → 5
 *   "tre vaschette" → 3
 *   "duecento grammi" → 200
 *   "uno virgola cinque" → 1.5
 *   "10" → 10
 */
export function parseNumeroParlato(text) {
  if (!text) return null
  const t = text.toLowerCase().trim().replace(/,/g, '.')

  // Match diretto digit (priorità): "3", "10.5", "1,5"
  const m = t.match(/(\d+(?:\.\d+)?)/)
  if (m) return parseFloat(m[1])

  // Match parole
  const tokens = t.split(/\s+/)
  let total = 0
  let foundAny = false
  let virgola = false
  let decimalPart = 0
  let decimalDiv = 10
  for (const tok of tokens) {
    if (tok === 'virgola' || tok === 'punto') { virgola = true; continue }
    if (PAROLE_NUMERO[tok] !== undefined) {
      const n = PAROLE_NUMERO[tok]
      if (virgola) {
        decimalPart += n / decimalDiv
        decimalDiv *= 10
      } else {
        // Composizione semplice: 20 + 3, 200 + 50, ecc.
        if (n === 100 || n === 1000) total = (total || 1) * n
        else total += n
      }
      foundAny = true
    }
  }
  return foundAny ? total + decimalPart : null
}

/**
 * Pulisce trascrizione vocale per inserimento testo:
 * - rimuove punteggiatura finale
 * - capitalizza prima lettera
 */
export function cleanVoiceText(text) {
  if (!text) return ''
  let t = text.trim().replace(/[.,;:!?]+$/, '')
  if (t.length > 0) t = t[0].toUpperCase() + t.slice(1)
  return t
}
