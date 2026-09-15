// Quello che il fondatore deve poter vedere sulla sicurezza: chi ha provato
// a entrare, da dove, e cosa è stato fatto sul pannello.
//
// Scorporato da api/admin.js il 15/09/2026.

// ─── Security: login attempts + anomalie + audit log filtrato ───────────
export async function getSecuritySnapshot(supabase, hours = 24) {
  const since = new Date(Date.now() - hours * 3600000).toISOString()

  // Login attempts: success vs failed
  let loginStats = null
  try {
    const { data } = await supabase.from('login_attempts')
      .select('success, email, ip, created_at')
      .gte('created_at', since)
    const total = data?.length || 0
    const ok = (data || []).filter(r => r.success === true).length
    const failed = total - ok
    // Top email failure (potenziali brute-force)
    const failByEmail = {}
    for (const r of (data || [])) {
      if (r.success === false && r.email) failByEmail[r.email] = (failByEmail[r.email] || 0) + 1
    }
    const topFailEmails = Object.entries(failByEmail)
      .filter(([, n]) => n >= 3)  // soglia brute-force suspect
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([email, count]) => ({ email, fail_count: count }))
    loginStats = { total, ok, failed, top_fail_emails: topFailEmails }
  } catch (e) {
    loginStats = { error: e.message?.slice(0, 80) }
  }

  // Anomalie rilevate (da audit_log con operation='anomaly_detected').
  // Audit 2026-06-17 HIGH: prima si selezionavano colonne inesistenti
  // (details/ip) — la tab Security era un placebo che ritornava sempre [].
  // Ora usiamo i nomi reali (new_data/client_ip) con fallback per schema legacy.
  let anomalie = []
  try {
    const { data, error } = await supabase.from('audit_log')
      .select('id, user_id, operation, new_data, created_at, client_ip')
      .eq('operation', 'anomaly_detected')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      // Fallback per schema dove le colonne hanno nomi diversi (old)
      const { data: legacy } = await supabase.from('audit_log')
        .select('id, user_id, operation, created_at')
        .eq('operation', 'anomaly_detected')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50)
      anomalie = (legacy || []).map(r => ({ ...r, new_data: null, client_ip: null }))
    } else {
      anomalie = data || []
    }
  } catch (e) {
    anomalie = []
  }

  // Azioni admin recenti (chi ha fatto cosa)
  let adminLog = []
  try {
    const { data } = await supabase.from('admin_log')
      .select('admin_email, azione, org_id, ip, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100)
    adminLog = data || []
  } catch {}

  return {
    periodo_ore: hours,
    since,
    login: loginStats,
    anomalie,
    admin_log: adminLog,
    generated_at: new Date().toISOString(),
  }
}

