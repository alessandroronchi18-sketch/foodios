// Editor SQL del pannello admin: validazione SELECT-only.
//
// Estratto da api/admin.js, dove stava sepolto in mezzo a 3.313 righe. E'
// codice di sicurezza — decide quali query l'admin puo' eseguire sul database
// di produzione — e in un file di quelle dimensioni non era ne' trovabile ne'
// testabile. Qui ha i suoi test in tests/unit/adminSqlEditor.test.js.
//
// Il modello di difesa e' a strati, in ordine:
//   0. Via commenti e testo fra apici, così le parole vietate non si possono
//      nascondere dentro una stringa (e una ricerca di testo che contiene la
//      parola "update" non viene bloccata per sbaglio)
//   1. Solo query che iniziano con SELECT o WITH
//   2. Lista di pattern vietati (DDL, DML, funzioni di sistema, tabelle auth)
//   3. Solo funzioni di lettura: ogni `nome(` dev'essere in elenco
//   4. Whitelist delle tabelle leggibili: ogni FROM/JOIN deve puntare a una
//      tabella permessa oppure a una CTE dichiarata nella query stessa
//   5. LIMIT 500 imposto in coda
//
// Il punto 3 è arrivato il 15/09/2026, e chiude un buco vero: questa query
//
//     select admin_org_cascade_delete('<id-di-un-cliente>')
//
// comincia con SELECT, non contiene nessuna parola vietata e non nomina
// nessuna tabella. Passava tutti i controlli, e cancella un cliente intero.
// Lo stesso vale per qualsiasi altra funzione che scrive. Verificato in
// produzione dentro una transazione annullata: la scrittura avveniva davvero.
//
// La difesa che regge da sola però non è questa, è al livello del database:
// `admin_safe_select` ora esegue la query in una **transazione di sola
// lettura** (migration 20260915h), e il motore rifiuta qualunque scrittura
// comunque sia scritta. Questo file è la seconda serratura.
//
// Conseguenza voluta del punto 3: una funzione di lettura non prevista viene
// rifiutata con il suo nome nel messaggio. È il verso giusto in cui
// sbagliare — basta aggiungerla a SQL_FUNCTIONS_ALLOWED.

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
  // Le parole che scrivono, ovunque compaiano — non solo nella forma
  // "update <tabella> set". `WITH x AS (UPDATE "organizations" SET ...)`
  // passava, perché la vecchia regola pretendeva il nome della tabella nudo
  // fra "update" e "set" e non riconosceva né le virgolette né schema.tabella.
  /\b(insert|update|delete|merge|upsert|truncate|drop|create|alter|grant|revoke|copy|vacuum|analyze|reindex|cluster|refresh|comment|call|do|prepare|execute|declare|fetch|move|close|discard|listen|notify|unlisten|checkpoint|import|reassign|lock)\b/i,
  // Inizio/fine transazione e SET di sessione: non servono a una lettura e
  // aprono la porta a cambiare il comportamento del motore.
  /\b(begin|commit|rollback|savepoint|start\s+transaction|set|reset)\b/i,
  // `SELECT ... INTO nuova_tabella` crea una tabella. `RETURNING` esiste solo
  // insieme a una scrittura.
  /\b(into|returning)\b/i,
  /\bpg_(read_file|catalog|sleep|advisory_lock|stat_file|ls_dir|terminate_backend|cancel_backend|reload_conf|rotate_logfile)\b/i,
  /\b(auth\.)?(users|sessions|refresh_tokens|mfa_factors|mfa_amr_claims)\b/i,
  /;/,  // un solo statement per volta, sempre
  /\bdblink|\bpostgres_fdw|\bcopy\s|\blo_(import|export)\b/i,
]

// Le funzioni che una lettura può usare. Tutto il resto è rifiutato per nome.
// Sono le funzioni standard di aggregazione, testo, data e JSON: quelle che
// servono davvero a interrogare, nessuna delle quali scrive.
export const SQL_FUNCTIONS_ALLOWED = new Set([
  // Parole del linguaggio che possono avere una parentesi dopo e non sono
  // funzioni: `with x as (`, `where id in (`, `order by (`… Senza queste,
  // `with recenti as (select …)` veniva rifiutato come «funzione as()».
  'exists', 'any', 'all', 'in', 'not', 'and', 'or', 'case', 'values', 'cast', 'over', 'filter', 'within',
  'as', 'on', 'using', 'where', 'having', 'by', 'from', 'join', 'select', 'union', 'intersect',
  'except', 'distinct', 'order', 'group', 'limit', 'offset', 'partition', 'rows', 'range',
  'between', 'is', 'when', 'then', 'else', 'end', 'array', 'row', 'interval', 'lateral',
  'asc', 'desc', 'nulls', 'first', 'last', 'with', 'recursive', 'full', 'inner', 'outer',
  'cross', 'natural', 'if', 'at', 'time', 'zone',
  // aggregazione
  'count', 'sum', 'avg', 'min', 'max', 'array_agg', 'string_agg', 'json_agg', 'jsonb_agg',
  'bool_and', 'bool_or', 'stddev', 'variance', 'percentile_cont', 'percentile_disc', 'mode',
  // finestra
  'row_number', 'rank', 'dense_rank', 'ntile', 'lag', 'lead', 'first_value', 'last_value', 'nth_value',
  // numeri
  'abs', 'ceil', 'ceiling', 'floor', 'round', 'trunc', 'sign', 'sqrt', 'power', 'mod', 'div',
  'greatest', 'least', 'random', 'width_bucket',
  // testo
  'length', 'char_length', 'lower', 'upper', 'initcap', 'trim', 'btrim', 'ltrim', 'rtrim',
  'substr', 'substring', 'replace', 'split_part', 'concat', 'concat_ws', 'position', 'strpos',
  'left', 'right', 'lpad', 'rpad', 'repeat', 'reverse', 'md5', 'encode', 'format',
  'regexp_replace', 'regexp_match', 'regexp_matches', 'regexp_split_to_array', 'starts_with',
  'similar', 'like', 'ilike', 'translate', 'ascii', 'chr', 'to_hex',
  // date
  'now', 'current_date', 'current_timestamp', 'localtimestamp', 'age', 'date_trunc', 'date_part',
  'extract', 'to_char', 'to_date', 'to_timestamp', 'to_number', 'make_date', 'make_timestamp',
  'make_interval', 'justify_interval', 'timezone', 'date_bin',
  // json
  'json_build_object', 'jsonb_build_object', 'json_build_array', 'jsonb_build_array',
  'json_array_elements', 'jsonb_array_elements', 'jsonb_array_elements_text',
  'json_extract_path', 'jsonb_extract_path', 'json_extract_path_text', 'jsonb_extract_path_text',
  'jsonb_object_keys', 'json_object_keys', 'jsonb_typeof', 'json_typeof', 'jsonb_path_query',
  'jsonb_array_length', 'json_array_length', 'to_json', 'to_jsonb', 'jsonb_pretty',
  // vario, di sola lettura
  'coalesce', 'nullif', 'unnest', 'generate_series', 'array_length', 'array_position',
  'cardinality', 'array_to_string', 'string_to_array', 'nvl',
])

// Toglie commenti e testo fra apici, sostituendoli con spazi della stessa
// lunghezza (così le posizioni non si spostano). Serve a due cose opposte e
// altrettanto importanti: che un `where messaggio ilike '%update%'` non venga
// scambiato per una scrittura, e che una scrittura non si possa nascondere
// dentro una stringa.
export function spogliaLetterali(sql) {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    if (c === "'" || c === '"') {
      const apice = c
      out += ' '
      i++
      while (i < sql.length) {
        if (sql[i] === apice) {
          // apice raddoppiato = apice letterale dentro la stringa
          if (sql[i + 1] === apice) { out += '  '; i += 2; continue }
          out += ' '; i++; break
        }
        out += sql[i] === '\n' ? '\n' : ' '
        i++
      }
      continue
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') { out += ' '; i++ }
      continue
    }
    if (c === '/' && sql[i + 1] === '*') {
      const fine = sql.indexOf('*/', i + 2)
      const stop = fine === -1 ? sql.length : fine + 2
      for (let k = i; k < stop; k++) out += sql[k] === '\n' ? '\n' : ' '
      i = stop
      continue
    }
    if (c === '$' && /^\$[a-zA-Z_]*\$/.test(sql.slice(i))) {
      // dollar quoting ($$ ... $$): è il modo classico di infilare un corpo
      // di funzione dentro una query. Non serve a nessuna lettura.
      const tag = sql.slice(i).match(/^\$[a-zA-Z_]*\$/)[0]
      const fine = sql.indexOf(tag, i + tag.length)
      const stop = fine === -1 ? sql.length : fine + tag.length
      for (let k = i; k < stop; k++) out += sql[k] === '\n' ? '\n' : ' '
      i = stop
      continue
    }
    out += c
    i++
  }
  return out
}

export function validateSafeSelectSQL(q) {
  if (!q || typeof q !== 'string') return { ok: false, error: 'Query vuota' }
  const trimmed = q.trim().replace(/;$/, '').trim()
  if (!trimmed) return { ok: false, error: 'Query vuota' }
  if (trimmed.length > 4000) return { ok: false, error: 'Query troppo lunga (max 4000 char)' }
  if (!/^select\b/i.test(trimmed) && !/^with\b/i.test(trimmed)) {
    return { ok: false, error: 'Solo SELECT/WITH ammessi' }
  }
  // Da qui in poi si guarda la query SENZA commenti e senza testo fra apici.
  const nudo = spogliaLetterali(trimmed)
  for (const pat of SQL_BLOCKED_KEYWORDS) {
    if (pat.test(nudo)) return { ok: false, error: `Keyword bloccata: ${pat.source}` }
  }
  // Funzioni chiamate: ogni `nome(` dev'essere una funzione di lettura nota.
  // È il controllo che ferma `select admin_org_cascade_delete('...')`, che
  // non nomina nessuna tabella e non contiene nessuna parola vietata.
  const funzRe = /([a-zA-Z_][\w]*)\s*\(/g
  let f
  while ((f = funzRe.exec(nudo)) !== null) {
    const nome = f[1].toLowerCase()
    if (SQL_FUNCTIONS_ALLOWED.has(nome)) continue
    return { ok: false, error: `Funzione non permessa: ${nome}(). Sono ammesse solo funzioni di lettura.` }
  }
  // Tabelle referenziate: ogni FROM/JOIN <nome> deve essere in whitelist.
  const tableRefs = []
  const fromJoinRe = /\b(?:from|join)\s+([a-zA-Z_][\w.]*)/gi
  let m
  while ((m = fromJoinRe.exec(nudo)) !== null) {
    const t = m[1].toLowerCase().replace(/^public\./, '')
    tableRefs.push(t)
  }
  for (const t of tableRefs) {
    // Le CTE non sono in whitelist ma sono dichiarate dentro la query stessa:
    // vanno ammesse se compaiono in un WITH ... AS.
    if (SQL_TABLES_ALLOWED.has(t)) continue
    const ctePattern = new RegExp(`\\bwith\\s+${t}\\b\\s+as`, 'i')
    if (ctePattern.test(nudo)) continue
    // CTE successive alla prima: ", <nome> as ("
    const ctePattern2 = new RegExp(`,\\s*${t}\\b\\s+as`, 'i')
    if (ctePattern2.test(nudo)) continue
    return { ok: false, error: `Tabella non permessa: ${t}` }
  }
  return { ok: true, query: trimmed + ' LIMIT 500' }
}

// `emailAdmin` non era mai stata dichiarata, ma api/admin.js la passava già
// come terzo argomento: il testo delle query eseguite sul database di
// produzione non finiva in nessun registro. In `admin_log` non c'è mai stata
// una riga `sql_query`. Ora ogni query — accettata o rifiutata — lascia una
// traccia con chi l'ha scritta.
export async function runSafeSelectQuery(supabase, q, emailAdmin = null) {
  const v = validateSafeSelectSQL(q)
  const traccia = async (esito, dettaglio) => {
    try {
      await supabase.from('admin_log').insert({
        admin_email: emailAdmin,
        azione: 'sql_query',
        esito,
        dettagli: { query: String(q || '').slice(0, 2000), ...dettaglio },
      })
    } catch { /* il registro che non scrive non deve impedire la lettura */ }
  }
  if (!v.ok) {
    await traccia('rifiutata', { motivo: v.error })
    return { ok: false, error: v.error }
  }
  try {
    const { data, error } = await supabase.rpc('admin_safe_select', { p_query: v.query })
    if (error) {
      if (error.message?.toLowerCase().includes('does not exist') || error.code === 'PGRST202') {
        return { ok: false, error: 'RPC admin_safe_select non installata in DB. Migration da applicare.', need_migration: true }
      }
      return { ok: false, error: error.message }
    }
    await traccia('ok', { righe: (data || []).length })
    return { ok: true, rows: data || [], count: (data || []).length, query: v.query }
  } catch (e) {
    return { ok: false, error: e.message || 'exception' }
  }
}
