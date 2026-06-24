import { useState, useEffect } from 'react'

// Prezzi piani (in EURO) letti da /api/pricing, con fallback ai default correnti.
// Audit 2026-06-24: rebrand 3-tier Bottega/Maestro/Insegna (€69/€149/€399).
// `pro` e `chain` mantenuti come alias retro-compat per i callsite vecchi.
const FALLBACK = { base: 69, pro: 149, chain: 399 }
let _cache = null
let _inflight = null

export function fmtPrezzo(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  // Numeri ≥1000 con punto migliaia IT (memory feedback-numeri-italiani).
  return Number.isInteger(v) ? v.toLocaleString('it-IT') : v.toFixed(2).replace('.', ',')
}

export default function usePlanPricing() {
  const [prezzi, setPrezzi] = useState(_cache || FALLBACK)

  useEffect(() => {
    if (_cache) { setPrezzi(_cache); return }
    if (!_inflight) {
      _inflight = fetch('/api/pricing')
        .then(r => r.json())
        .then(d => {
          const p = d?.piani || {}
          return {
            base:  p.base?.prezzo_mese_cents  != null ? p.base.prezzo_mese_cents / 100  : FALLBACK.base,
            pro:   p.pro?.prezzo_mese_cents   != null ? p.pro.prezzo_mese_cents / 100   : FALLBACK.pro,
            chain: p.chain?.prezzo_mese_cents != null ? p.chain.prezzo_mese_cents / 100 : FALLBACK.chain,
          }
        })
        .catch(() => FALLBACK)
    }
    let alive = true
    _inflight.then(out => { _cache = out; if (alive) setPrezzi(out) })
    return () => { alive = false }
  }, [])

  return prezzi
}
