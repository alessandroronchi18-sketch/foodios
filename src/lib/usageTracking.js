// View usage tracking: RPC `track_view_open` su Supabase incrementa il
// contatore giornaliero per (org, user, view, date). Best-effort: errori
// silenziosi (mai bloccare l'UI per un'analytics).
//
// Deduplication: stessa view aperta in rapida successione (es. re-render)
// viene loggata 1 volta sola entro DEDUP_MS. Riduce noise senza perdere segnale.

import { supabase } from './supabase'

const DEDUP_MS = 5_000
const recentlyTracked = new Map()  // viewName → timestamp

export async function trackViewOpen(viewName) {
  if (!viewName || typeof viewName !== 'string') return
  const now = Date.now()
  const last = recentlyTracked.get(viewName)
  if (last && (now - last) < DEDUP_MS) return
  recentlyTracked.set(viewName, now)
  // Cleanup periodico (mantiene Map sotto controllo)
  if (recentlyTracked.size > 100) {
    for (const [k, t] of recentlyTracked) {
      if (now - t > DEDUP_MS * 10) recentlyTracked.delete(k)
    }
  }
  try {
    await supabase.rpc('track_view_open', { p_view_name: viewName })
  } catch {
    // best-effort, mai bloccare UI
  }
}
