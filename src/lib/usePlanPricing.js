import { useState, useEffect } from 'react'

// Hook centralizzato per leggere meta dei piani da `/api/pricing`.
//
// Audit 2026-06-24: ora include nome_display + descrizione (oltre al prezzo),
// così l'admin può rinominare/ridescrivere i piani dal pannello e il cambio
// si propaga automaticamente su:
//   - landing (LandingPage.jsx sezione pricing)
//   - pannello abbonamento (AbbonamentoPanel.jsx)
//   - modali di upgrade (UpgradeModal.jsx)
//   - email transazionali (api/lib/emailTemplates.js)
//   - qualunque toast / banner / copy che mostra il nome piano
//
// Cache a livello di modulo: una sola fetch per sessione. La risposta API è
// cached 60s lato CDN Vercel.

const FALLBACK_FULL = {
  base:  { prezzo_mese_cents: 6900,  nome_display: 'Bottega', descrizione: 'Una sede, l\'essenziale.',                       label: 'Bottega' },
  pro:   { prezzo_mese_cents: 14900, nome_display: 'Maestro', descrizione: 'Sostituisce un controller part-time.',           label: 'Maestro' },
  chain: { prezzo_mese_cents: 39900, nome_display: 'Insegna', descrizione: 'Sostituisce 1 controller + IT contractor.',     label: 'Insegna' },
}

let _cache = null
let _inflight = null

export function fmtPrezzo(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  // Numeri ≥1000 con punto migliaia IT (memory feedback-numeri-italiani).
  return Number.isInteger(v) ? v.toLocaleString('it-IT') : v.toFixed(2).replace('.', ',')
}

// Costruisce l'oggetto { base/pro/chain: {prezzo, nome, desc, label} } a partire
// dalla risposta API. Tollerante ai NULL.
function buildMeta(piani) {
  const out = { ...FALLBACK_FULL }
  for (const key of Object.keys(piani || {})) {
    const row = piani[key]
    if (!row) continue
    const fb = FALLBACK_FULL[key] || {}
    out[key] = {
      prezzo_mese_cents: row.prezzo_mese_cents ?? fb.prezzo_mese_cents,
      nome_display:      row.nome_display      || fb.nome_display || row.label,
      descrizione:       row.descrizione       || fb.descrizione  || '',
      label:             row.label             || row.nome_display || fb.label,
    }
  }
  return out
}

// Hook principale. Ritorna:
//   prezzi: { base, pro, chain }              ← € (€69, €149, €399)
//   meta:   { base, pro, chain: {…full row} } ← include nome+descrizione+label
//
// I callsite vecchi (che leggevano `prezzi.pro`) continuano a funzionare.
// I callsite nuovi possono leggere `meta.pro.nome_display` / `meta.pro.descrizione`.
export default function usePlanPricing() {
  const [meta, setMeta] = useState(_cache || FALLBACK_FULL)

  useEffect(() => {
    if (_cache) { setMeta(_cache); return }
    if (!_inflight) {
      _inflight = fetch('/api/pricing')
        .then(r => r.json())
        .then(d => buildMeta(d?.piani))
        .catch(() => FALLBACK_FULL)
    }
    let alive = true
    _inflight.then(out => {
      _cache = out
      // Esponi singleton globale per i moduli non-React (es. planAccess.js
      // requiredPlanLabel) che hanno bisogno del nome piano dinamico senza
      // entrare in import cycle.
      if (typeof window !== 'undefined') window.__foodos_plan_cache = out
      if (alive) setMeta(out)
    })
    return () => { alive = false }
  }, [])

  // Backward compat: prezzi.{base,pro,chain} in euro (numero intero).
  const prezzi = {
    base:  Math.round((meta.base?.prezzo_mese_cents  || 6900)  / 100),
    pro:   Math.round((meta.pro?.prezzo_mese_cents   || 14900) / 100),
    chain: Math.round((meta.chain?.prezzo_mese_cents || 39900) / 100),
  }

  // Backward compat: ritorno SIA i prezzi sia l'oggetto meta.
  // Spread `prezzi` per non rompere usePlanPricing().pro chiamate vecchie,
  // ma aggiungo `meta`/`nome`/`desc` come campi nuovi.
  return {
    ...prezzi,           // prezzi.base, prezzi.pro, prezzi.chain (numeri)
    meta,                // meta.base, meta.pro, meta.chain (oggetti completi)
    nome:  { base: meta.base?.nome_display, pro: meta.pro?.nome_display, chain: meta.chain?.nome_display },
    desc:  { base: meta.base?.descrizione,  pro: meta.pro?.descrizione,  chain: meta.chain?.descrizione },
  }
}

// Helper non-hook per i moduli che non sono componenti React.
// Restituisce il nome del piano (sync, da cache se disponibile; fallback statico).
export function getPlanLabel(plan) {
  // Alias retro-compat: 'enterprise' è uno alias di 'chain' (vedi planAccess).
  const key = plan === 'enterprise' ? 'chain' : plan
  const m = _cache || (typeof window !== 'undefined' && window.__foodos_plan_cache) || FALLBACK_FULL
  return m[key]?.nome_display || m[key]?.label || (FALLBACK_FULL[key]?.nome_display || plan)
}

// Restituisce il prezzo del piano (sync, da cache se disponibile).
export function getPlanPrice(plan) {
  const key = plan === 'enterprise' ? 'chain' : plan
  const m = _cache || (typeof window !== 'undefined' && window.__foodos_plan_cache) || FALLBACK_FULL
  const cents = m[key]?.prezzo_mese_cents
  return cents != null ? Math.round(cents / 100) : null
}
