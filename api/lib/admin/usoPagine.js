// Quali pagine i clienti aprono davvero.
//
// Scorporato da api/admin.js il 15/09/2026. È il modulo che ha reso possibile
// la riorganizzazione del menu dello stesso giorno: 3.718 aperture in tre
// mesi hanno detto che la sezione "AI" — tredici voci — veniva aperta
// trentacinque volte in tutto, meno di "Scadenzario" da sola.

// ─── Usage Analytics: quali view i clienti usano di più (audit 2026-06-14) ─
// Aggregato da view_usage_daily (vedi migration 20260614_view_usage_daily.sql).
// Restituisce per la finestra temporale richiesta:
//   - top view per open_count totale + utenti unici + org uniche
//   - bottom view (le meno usate): segnalano possibili candidati alla
//     deprecazione o necessità di onboarding mirato
//   - utenti attivi per giorno (DAU)
//   - retention per view (org che la riusano in 7gg)
export async function getUsageStats(supabase, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

  // 1) Aggregato per view: open_count totale + DAU/MAU + org uniche
  let perView = []
  try {
    const { data } = await supabase
      .from('view_usage_daily')
      .select('view_name, open_count, user_id, organization_id, date')
      .gte('date', since)
      .limit(50000)
    const byView = {}
    for (const r of (data || [])) {
      const v = r.view_name
      if (!byView[v]) byView[v] = { view: v, opens: 0, users: new Set(), orgs: new Set(), dates: new Set() }
      byView[v].opens += (r.open_count || 0)
      byView[v].users.add(r.user_id)
      byView[v].orgs.add(r.organization_id)
      byView[v].dates.add(r.date)
    }
    perView = Object.values(byView).map(v => ({
      view: v.view,
      opens: v.opens,
      utenti_unici: v.users.size,
      org_uniche: v.orgs.size,
      giorni_attivi: v.dates.size,
    })).sort((a, b) => b.opens - a.opens)
  } catch (e) {
    perView = []
  }

  // 2) DAU per gli ultimi giorni
  let dauDaily = []
  try {
    const { data } = await supabase
      .from('view_usage_daily')
      .select('date, user_id')
      .gte('date', since)
      .limit(50000)
    const byDate = {}
    for (const r of (data || [])) {
      if (!byDate[r.date]) byDate[r.date] = new Set()
      byDate[r.date].add(r.user_id)
    }
    dauDaily = Object.entries(byDate)
      .map(([date, users]) => ({ date, dau: users.size }))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch { /* skip */ }

  return {
    periodo_giorni: days,
    since,
    top_view: perView.slice(0, 15),
    bottom_view: perView.slice().reverse().slice(0, 10),  // le 10 meno usate
    totale_view_tracciate: perView.length,
    dau_daily: dauDaily,
    generated_at: new Date().toISOString(),
  }
}

