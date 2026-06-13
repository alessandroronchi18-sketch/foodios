// AI budget enforcement: hard-cap per-org del costo Claude giornaliero.
// Audit reliability 2026-06-14 PM. Cooperante con view_usage_daily +
// admin AI Telemetry (vedi getAiTelemetry in admin.js).
//
// Default soft-cap per piano (USD/giorno):
//   trial/base: $1.00
//   pro:        $3.00
//   chain:      $10.00
// Override via env AI_BUDGET_USD_<PIANO> (es. AI_BUDGET_USD_BASE=2.5).
// Admin (email match) bypassa sempre il cap.

const DEFAULT_BUDGETS_USD = {
  trial: 1.0,
  base: 1.0,
  pro: 3.0,
  chain: 10.0,
  enterprise: 10.0,
}

// Costo stimato medio per feature (USD per call). Allineato con
// COST_PER_FEATURE_USD in api/admin.js.
const COST_PER_FEATURE_USD = {
  ai_proxy:      0.012,   // Sonnet ~3k tokens avg
  ai_proxy_haiku:0.0008,
  ai_proxy_opus: 0.080,
  ocr_invoice:   0.030,
  daily_brief:   0.0008,
  brain_msg:     0.012,
  recipe:        0.080,
  documentary:   0.040,
  reformulation: 0.060,
  recensione:    0.020,
  competitor:    0.015,
  explain_kpi:   0.018,
}

export function estimateCostForCall({ feature, model }) {
  // Match per feature, oppure per modello
  if (feature && COST_PER_FEATURE_USD[feature] != null) return COST_PER_FEATURE_USD[feature]
  const m = (model || '').toLowerCase()
  if (m.includes('opus')) return 0.080
  if (m.includes('haiku')) return 0.001
  if (m.includes('sonnet')) return 0.012
  return 0.015
}

/**
 * Check + increment del budget AI per l'org del chiamante.
 * Ritorna { allowed: true } se sotto cap, { allowed: false, reason, used, cap } altrimenti.
 *
 * NB: usa l'auth.uid() del Bearer token corrente (RPC security definer).
 */
export async function checkAndIncrementAiBudget({ supabase, feature, model, piano = 'trial', adminBypass = false }) {
  if (adminBypass) return { allowed: true, bypass: 'admin' }
  const cap = Number(process.env[`AI_BUDGET_USD_${piano.toUpperCase()}`])
    || DEFAULT_BUDGETS_USD[piano] || DEFAULT_BUDGETS_USD.trial
  // Leggi totale corrente
  let used = 0
  try {
    const { data } = await supabase.rpc('ai_usage_today_total')
    used = Number(data) || 0
  } catch (e) {
    // Fail-open su read error (la tabella potrebbe non esistere ancora se
    // la migration non e' stata eseguita). Logga ma non bloccare.
    console.warn('[aiBudget] read failed, allowing:', e.message?.slice(0, 80))
    return { allowed: true, error: 'budget_read_failed' }
  }
  if (used >= cap) {
    return { allowed: false, reason: 'budget_exceeded', used: Math.round(used * 100) / 100, cap }
  }
  // Increment ottimistico (UPSERT atomico). Lo facciamo PRIMA della chiamata
  // Claude per evitare race su chiamate parallele.
  const cost = estimateCostForCall({ feature, model })
  try {
    await supabase.rpc('ai_usage_increment', {
      p_feature: feature || 'generic',
      p_tokens_in: 0,
      p_tokens_out: 0,
      p_cost_usd: cost,
    })
  } catch (e) {
    console.warn('[aiBudget] increment failed:', e.message?.slice(0, 80))
  }
  return { allowed: true, used: Math.round(used * 100) / 100, cap, charged: cost }
}
