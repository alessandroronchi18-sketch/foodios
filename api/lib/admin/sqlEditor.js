// Editor SQL del pannello admin: validazione SELECT-only.
//
// Estratto da api/admin.js, dove stava sepolto in mezzo a 3.313 righe. E'
// codice di sicurezza — decide quali query l'admin puo' eseguire sul database
// di produzione — e in un file di quelle dimensioni non era ne' trovabile ne'
// testabile. Qui ha i suoi test in tests/unit/adminSqlEditor.test.js.
//
// Il modello di difesa e' a strati, in ordine:
//   1. Solo query che iniziano con SELECT o WITH
//   2. Lista di pattern vietati (DDL, DML, funzioni di sistema, tabelle auth)
//   3. Whitelist delle tabelle leggibili: ogni FROM/JOIN deve puntare a una
//      tabella permessa oppure a una CTE dichiarata nella query stessa
//   4. LIMIT 500 imposto in coda
//
// Nota: la logica e' stata spostata senza modifiche. Se serve irrigidirla,
// va fatto come intervento a se' stante, con i test davanti.

// Tabelle leggibili dall'admin. Tutto il resto e' bloccato dal parser.
export const SQL_TABLES_ALLOWED = new Set([
  'organizations', 'profiles', 'sedi', 'user_data', 'fatture', 'fornitori',
  'dipendenti', 'turni', 'clienti_b2b', 'vendite_b2b', 'costi_aziendali',
  'feedback', 'error_log', 'audit_log', 'admin_log', 'rate_limits',
  'banners', 'ai_usage_daily', 'integrazioni', 'push_subscriptions',
  'codici_sconto', 'cron_runs', 'email_domain_blocklist',
  'pos_scontrini', 'scadenzario_pagamenti', 'plan_pricing', 'login_attempts',
  'daily_briefs', 'documentary_snapshots',
])

export const SQL_BLOCKED_KEYWORDS = [
  /\binsert\s+into\b/i, /\bupdate\s+\w+\s+set\b/i, /\bdelete\s+from\b/i,
  /\bdrop\s+/i, /\bcreate\s+/i, /\balter\s+/i, /\btruncate\s+/i,
  /\bgrant\s+/i, /\brevoke\s+/i, /\bcopy\s+/i,
  /\bpg_(read_file|catalog|sleep|advisory_lock|stat_file|ls_dir)\b/i,
  /\b(auth\.)?(users|sessions|refresh_tokens|mfa_factors|mfa_amr_claims)\b/i,
  /;\s*\w/,  // separatore di statement seguito da altro
]

export function validateSafeSelectSQL(q) {
  if (!q || typeof q !== 'string') return { ok: false, error: 'Query vuota' }
  const trimmed = q.trim().replace(/;$/, '').trim()
  if (!trimmed) return { ok: false, error: 'Query vuota' }
  if (trimmed.length > 4000) return { ok: false, error: 'Query troppo lunga (max 4000 char)' }
  if (!/^select\b/i.test(trimmed) && !/^with\b/i.test(trimmed)) {
    return { ok: false, error: 'Solo SELECT/WITH ammessi' }
  }
  for (const pat of SQL_BLOCKED_KEYWORDS) {
    if (pat.test(trimmed)) return { ok: false, error: `Keyword bloccata: ${pat.source}` }
  }
  // Tabelle referenziate: ogni FROM/JOIN <nome> deve essere in whitelist.
  const tableRefs = []
  const fromJoinRe = /\b(?:from|join)\s+([a-zA-Z_][\w.]*)/gi
  let m
  while ((m = fromJoinRe.exec(trimmed)) !== null) {
    const t = m[1].toLowerCase().replace(/^public\./, '')
    tableRefs.push(t)
  }
  for (const t of tableRefs) {
    // Le CTE non sono in whitelist ma sono dichiarate dentro la query stessa:
    // vanno ammesse se compaiono in un WITH ... AS.
    if (SQL_TABLES_ALLOWED.has(t)) continue
    const ctePattern = new RegExp(`\\bwith\\s+${t}\\b\\s+as`, 'i')
    if (ctePattern.test(trimmed)) continue
    // CTE successive alla prima: ", <nome> as ("
    const ctePattern2 = new RegExp(`,\\s*${t}\\b\\s+as`, 'i')
    if (ctePattern2.test(trimmed)) continue
    return { ok: false, error: `Tabella non permessa: ${t}` }
  }
  return { ok: true, query: trimmed + ' LIMIT 500' }
}

export async function runSafeSelectQuery(supabase, q) {
  const v = validateSafeSelectSQL(q)
  if (!v.ok) return { ok: false, error: v.error }
  try {
    const { data, error } = await supabase.rpc('admin_safe_select', { p_query: v.query })
    if (error) {
      if (error.message?.toLowerCase().includes('does not exist') || error.code === 'PGRST202') {
        return { ok: false, error: 'RPC admin_safe_select non installata in DB. Migration da applicare.', need_migration: true }
      }
      return { ok: false, error: error.message }
    }
    return { ok: true, rows: data || [], count: (data || []).length, query: v.query }
  } catch (e) {
    return { ok: false, error: e.message || 'exception' }
  }
}
