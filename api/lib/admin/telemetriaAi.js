// Telemetria dell'assistente: quanto si usa e quanto costa.
//
// Scorporato da api/admin.js il 15/09/2026. Quel file era arrivato a 3.035
// righe, ed è dove si nascondevano i difetti peggiori trovati nell'audit di
// oggi: sei comandi che non partivano da mesi, un listino prezzi fermo a tre
// listini fa, un editor SQL che scriveva. In un file di quelle dimensioni una
// cosa rotta non si vede.
//
// Questo modulo non dipende da nient'altro dell'admin: legge dodici tabelle e
// somma. Si può leggere per intero senza scorrere niente.

// Aggrega counts da 12 tabelle nuove + stima costi Claude.
//
// Costi Claude (Haiku $0.80/1M token input, Sonnet $3/1M, Opus $15/1M) sono
// STIME basate su mediane d'uso. Per esattezza reale serve l'usage API
// Anthropic — qui ci affidiamo a token_estimate per row del cron.
const COST_PER_FEATURE_USD = {
  daily_brief:   0.0008,   // Haiku ~280 token in + 200 out
  ai_suggestion: 0.0001,   // regola-based, niente AI
  brain_msg:     0.012,    // Sonnet ~3000 token avg
  recipe:        0.080,    // Opus ~4000 token
  ocr_invoice:   0.030,    // Sonnet Vision ~2000 token
  forecast_day:  0.0,      // statistico, niente AI
  documentary:   0.040,    // Opus ~1000 token
  reformulation: 0.060,    // Opus ~2500 token
  recensione:    0.020,    // Sonnet ~1000 token
  competitor:    0.015,    // Sonnet ~700 token
  explain_kpi:   0.018,    // Sonnet ~900 token
}

export async function getAiTelemetry(supabase, days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const today = new Date().toISOString().slice(0, 10)

  // Helper count-only query
  const countSince = async (table, dateCol = 'created_at') => {
    try {
      const { count } = await supabase.from(table)
        .select('id', { count: 'exact', head: true })
        .gte(dateCol, since)
      return count || 0
    } catch { return null }
  }

  // Counts per feature (ultimi N giorni)
  const [
    briefsTot, briefsSent, briefsOpened, briefsSettimanali,
    sugTot, sugAgito, sugRifiut,
    brainConv, brainTodayConv,
    recipeTot, recipeSaved,
    ocrTot, ocrConfidence,
    forecastTot,
    docTot,
    reformTot,
    recensTot,
    competitorTot,
    posScontrini,
    whatsappLinks,
  ] = await Promise.all([
    countSince('daily_briefs'),
    (async () => {
      try {
        const { count } = await supabase.from('daily_briefs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since).not('sent_email_at', 'is', null)
        return count || 0
      } catch { return null }
    })(),
    (async () => {
      try {
        const { count } = await supabase.from('daily_briefs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since).not('opened_at', 'is', null)
        return count || 0
      } catch { return null }
    })(),
    (async () => {
      try {
        const { count } = await supabase.from('daily_briefs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since).eq('tipo', 'settimanale')
        return count || 0
      } catch { return null }
    })(),
    countSince('ai_suggestions'),
    (async () => {
      try {
        const { count } = await supabase.from('ai_suggestions')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since).eq('stato', 'agito')
        return count || 0
      } catch { return null }
    })(),
    (async () => {
      try {
        const { count } = await supabase.from('ai_suggestions')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since).eq('stato', 'rifiutato')
        return count || 0
      } catch { return null }
    })(),
    countSince('brain_conversations', 'ultimo_messaggio_at'),
    (async () => {
      try {
        const { data } = await supabase.from('brain_conversations')
          .select('messages, ultimo_messaggio_at').gte('ultimo_messaggio_at', since)
        let totalMsg = 0
        for (const row of (data || [])) totalMsg += (row.messages || []).length
        return totalMsg
      } catch { return 0 }
    })(),
    countSince('recipe_inventions'),
    (async () => {
      try {
        const { data } = await supabase.from('recipe_inventions')
          .select('salvate_ricettario_ids').gte('created_at', since)
        let s = 0
        for (const r of (data || [])) s += (r.salvate_ricettario_ids || []).length
        return s
      } catch { return 0 }
    })(),
    countSince('extracted_invoices'),
    (async () => {
      try {
        const { data } = await supabase.from('extracted_invoices')
          .select('confidence').gte('created_at', since).not('confidence', 'is', null)
        if (!data || data.length === 0) return null
        const sum = data.reduce((s, r) => s + Number(r.confidence || 0), 0)
        return Math.round((sum / data.length) * 100) / 100
      } catch { return null }
    })(),
    countSince('forecast_giornaliero'),
    countSince('documentary_snapshots'),
    (async () => {
      // reformulation non ha tabella dedicata: salvo niente, count = 0
      return 0
    })(),
    (async () => {
      // recensioni risposte: stateless, count = 0 dal DB
      return 0
    })(),
    countSince('competitor_prices', 'scraped_at'),
    countSince('pos_scontrini', 'received_at'),
    (async () => {
      try {
        const { count } = await supabase.from('whatsapp_links')
          .select('id', { count: 'exact', head: true }).eq('attivo', true)
        return count || 0
      } catch { return null }
    })(),
  ])

  // Stima costo Claude USD ultimi N giorni
  const costUsd =
    (briefsTot || 0)        * COST_PER_FEATURE_USD.daily_brief +
    (brainTodayConv || 0)   * COST_PER_FEATURE_USD.brain_msg +
    (recipeTot || 0)        * COST_PER_FEATURE_USD.recipe +
    (ocrTot || 0)           * COST_PER_FEATURE_USD.ocr_invoice +
    (docTot || 0)           * COST_PER_FEATURE_USD.documentary +
    (forecastTot || 0)      * COST_PER_FEATURE_USD.forecast_day +
    (competitorTot || 0)    * COST_PER_FEATURE_USD.competitor
  const costEur = costUsd * 0.92  // approssimazione cambio USD→EUR

  return {
    periodo_giorni: days,
    since,
    // Daily Brief AI
    daily_brief: {
      tot: briefsTot, sent: briefsSent, opened: briefsOpened,
      open_rate: briefsSent && briefsSent > 0 ? Math.round((briefsOpened / briefsSent) * 100) : null,
      settimanali: briefsSettimanali,
    },
    // AI Suggestions proattive
    ai_suggestions: {
      tot: sugTot, agito: sugAgito, rifiutato: sugRifiut,
      action_rate: sugTot && sugTot > 0 ? Math.round((sugAgito / sugTot) * 100) : null,
    },
    // FoodOS Brain (chat)
    brain: {
      conversazioni: brainConv,
      messaggi_tot: brainTodayConv,
    },
    // Recipe Inventor AI
    recipe_inventor: {
      ricette_generate: recipeTot,
      ricette_salvate: recipeSaved,
      save_rate: recipeTot && recipeTot > 0 ? Math.round((recipeSaved / recipeTot) * 100) : null,
    },
    // OCR fatture
    ocr_fatture: {
      estratte: ocrTot,
      avg_confidence: ocrConfidence,
    },
    // Forecast vendite
    forecast: {
      righe_generate: forecastTot,
    },
    // Documentary AI
    documentary: {
      snapshot_creati: docTot,
    },
    // Competitor pricing
    competitor_pricing: {
      prezzi_tracciati: competitorTot,
    },
    // POS scontrini real-time
    pos_scontrini: {
      ricevuti: posScontrini,
    },
    // WhatsApp Bot
    whatsapp: {
      numeri_attivi: whatsappLinks,
    },
    // Reformulation (stateless, no DB tracking)
    reformulation: {
      richieste: reformTot,
    },
    // Recensioni AI (stateless)
    recensioni: {
      risposte_generate: recensTot,
    },
    // Costi stimati (Claude API)
    costi: {
      usd_estimated: Math.round(costUsd * 100) / 100,
      eur_estimated: Math.round(costEur * 100) / 100,
      detail: 'Stima basata su token medi per feature; non sostituisce Anthropic usage API.',
    },
    generated_at: new Date().toISOString(),
  }
}

