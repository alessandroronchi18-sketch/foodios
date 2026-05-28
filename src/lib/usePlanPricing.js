import { useState, useEffect } from 'react'

// Prezzi piani (in EURO) letti da /api/pricing, con fallback ai default correnti.
// Cache a livello di modulo: la fetch parte una sola volta per sessione.
const FALLBACK = { pro: 89, chain: 149 }
let _cache = null
let _inflight = null

export function fmtPrezzo(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  // Senza decimali se intero (€89), altrimenti 2 decimali (€89,50).
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')
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
