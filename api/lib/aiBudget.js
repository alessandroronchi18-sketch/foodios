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

// Tetto giornaliero per azienda, in dollari. Deciso dal titolare il
// 15/09/2026: 5 $, cioè circa 400 richieste al giorno — molto più di un uso
// normale, ma abbastanza da fermare subito un abuso. Se un cliente vero lo
// tocca si vede nel pannello admin e si alza.
//
// Fino a oggi questi numeri non contavano niente: il contatore era scollegato
// (vedi il commento sotto e la migration 20260915e) e il tetto non è mai
// scattato per nessuno.
const DEFAULT_BUDGETS_USD = {
  trial: 5.0,
  base: 5.0,
  pro: 5.0,
  chain: 5.0,
  enterprise: 5.0,
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
  // Sonnet 5 costa meno di Sonnet 4.6 (2 $ invece di 3 $ per milione di token
  // in ingresso, 10 $ invece di 15 $ in uscita): la stima per chiamata scende
  // in proporzione. Lasciarla a 0,012 avrebbe fatto scattare il tetto di spesa
  // con un terzo di chiamate in meno del dovuto.
  if (m.includes('sonnet')) return 0.008
  return 0.015
}

/**
 * Check + increment del budget AI per l'org del chiamante.
 * Ritorna { allowed: true } se sotto cap, { allowed: false, reason, used, cap } altrimenti.
 *
 * NB: usa l'auth.uid() del Bearer token corrente (RPC security definer).
 */
/**
 * Controlla il tetto giornaliero e registra la spesa.
 *
 * ── Perché serve `orgId` ─────────────────────────────────────────────────
 *
 * Prima si chiamavano `ai_usage_today_total()` e `ai_usage_increment()` senza
 * argomenti: erano loro a cercare l'azienda con
 * `select organization_id from profiles where id = auth.uid()`. Ma qui chi
 * chiama è il server con la chiave di servizio, dove `auth.uid()` è **vuoto**.
 * Quindi l'incremento usciva subito senza scrivere e il totale tornava sempre
 * 0: `0 >= tetto` non è mai vero, e il limite non è mai scattato per nessuno.
 *
 * Provato sul database il 15/09/2026: `ai_usage_daily` vuota con 327
 * organizzazioni, e in `rate_limits` sette chiavi `ai:…` che dimostrano che le
 * chiamate c'erano state. Si spendeva, e il contatore restava a zero — compreso
 * quello del pannello admin, che legge la stessa tabella.
 */
export async function checkAndIncrementAiBudget({ supabase, orgId, feature, model, piano = 'trial', adminBypass = false }) {
  if (adminBypass) return { allowed: true, bypass: 'admin' }
  // Senza organizzazione non si può contare niente. Si lascia passare — non è
  // colpa di chi sta chiedendo — ma lo si dice forte, perché è la condizione
  // in cui il tetto non protegge.
  if (!orgId) {
    console.warn('[aiBudget] chiamata senza organizzazione: spesa non conteggiata')
    return { allowed: true, error: 'org_mancante' }
  }

  const cap = Number(process.env[`AI_BUDGET_USD_${piano.toUpperCase()}`])
    || DEFAULT_BUDGETS_USD[piano] || DEFAULT_BUDGETS_USD.trial
  const cost = estimateCostForCall({ feature, model })

  // ── I pacchetti comprati vengono prima del tetto ────────────────────────
  // La migration del 06/07 lo dichiarava già ("se org ha credit_remaining > 0,
  // NON conta sul cap giornaliero") ma quel codice non era mai stato scritto, e
  // la funzione sul database non esisteva. Un cliente che paga per mille
  // chiamate sarebbe stato tagliato fuori lo stesso.
  try {
    const { data: usato } = await supabase.rpc('ai_credit_consuma', { p_org: orgId })
    if (usato === true) {
      // Si registra lo stesso, per vedere il consumo nel pannello, ma a costo
      // zero: quella chiamata è già stata pagata a parte.
      await supabase.rpc('ai_usage_increment_org', {
        p_org: orgId, p_feature: feature || 'generic',
        p_tokens_in: 0, p_tokens_out: 0, p_cost_usd: 0,
      })
      return { allowed: true, daPacchetto: true, charged: 0 }
    }
  } catch (e) {
    console.warn('[aiBudget] pacchetti non leggibili:', e.message?.slice(0, 80))
  }

  let used = 0
  try {
    const { data, error } = await supabase.rpc('ai_usage_today_total_org', { p_org: orgId })
    if (error) throw new Error(error.message)
    used = Number(data) || 0
  } catch (e) {
    // Si lascia passare: meglio una chiamata non conteggiata che un cliente
    // bloccato da un guasto nostro. Ma resta scritto nel log.
    console.warn('[aiBudget] lettura fallita, passo comunque:', e.message?.slice(0, 80))
    return { allowed: true, error: 'budget_read_failed' }
  }

  if (used >= cap) {
    return { allowed: false, reason: 'budget_exceeded', used: Math.round(used * 100) / 100, cap }
  }

  // Si registra PRIMA della chiamata a Claude: due richieste in parallelo
  // devono contare due volte, non una.
  try {
    const { error } = await supabase.rpc('ai_usage_increment_org', {
      p_org: orgId,
      p_feature: feature || 'generic',
      p_tokens_in: 0,
      p_tokens_out: 0,
      p_cost_usd: cost,
    })
    if (error) console.warn('[aiBudget] scrittura fallita:', error.message?.slice(0, 80))
  } catch (e) {
    console.warn('[aiBudget] scrittura fallita:', e.message?.slice(0, 80))
  }
  return { allowed: true, used: Math.round(used * 100) / 100, cap, charged: cost }
}

/**
 * Registra una spesa AI **senza** bloccare nulla.
 *
 * Serve ai lavori notturni (riepilogo del mattino, fotografia del mese): li
 * fa partire il sistema, non il cliente, e fermarli a metà per un tetto di
 * spesa farebbe più danno della spesa stessa. Ma vanno contati, altrimenti
 * il pannello «quanto mi costa questo cliente» dice un numero che è una
 * frazione del vero.
 *
 * Fino al 15/09/2026 `ai_usage_daily` non contava niente di tutto questo:
 * il contatore era chiamato SOLO da api/ai.js, mentre la stessa chiave di
 * Anthropic veniva usata anche dai due lavori notturni, dalla lettura delle
 * fatture e da due passaggi dell'importazione. In produzione: 1.301
 * suggerimenti e 96 riepiloghi generati, e zero righe di consumo.
 *
 * @param {Object} a
 * @param {Object} a.supabase   client con service_role
 * @param {string} a.orgId
 * @param {string} a.feature    nome della funzione (per il pannello)
 * @param {string} [a.model]
 * @param {Object} [a.usage]    { input_tokens, output_tokens } se li conosci
 */
export async function registraSpesaAi({ supabase, orgId, feature, model, usage } = {}) {
  if (!supabase || !orgId) {
    console.warn('[aiBudget] spesa non registrata: manca', !supabase ? 'il client' : "l'organizzazione", '-', feature)
    return { registrato: false }
  }
  const cost = estimateCostForCall({ feature, model })
  try {
    const { error } = await supabase.rpc('ai_usage_increment_org', {
      p_org: orgId,
      p_feature: feature || 'generic',
      p_tokens_in: Number(usage?.input_tokens) || 0,
      p_tokens_out: Number(usage?.output_tokens) || 0,
      p_cost_usd: cost,
    })
    if (error) {
      console.error('[aiBudget] spesa non registrata:', feature, error.message?.slice(0, 120))
      return { registrato: false }
    }
    return { registrato: true, costo: cost }
  } catch (e) {
    console.error('[aiBudget] spesa non registrata:', feature, e?.message?.slice(0, 120))
    return { registrato: false }
  }
}
