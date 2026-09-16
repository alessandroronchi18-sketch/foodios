#!/usr/bin/env node
/**
 * Le migrazioni scritte sono davvero nel database?
 *
 * ── Il difetto che ha fatto nascere questo controllo ──────────────────
 *
 * 16/09/2026. Entrando in produzione con l'account del titolare, la prima
 * schermata era la procedura di benvenuto — quella del primo accesso — a
 * un'attività che usa Foodos da mesi.
 *
 * Il motivo: `src/App.jsx` decide se mostrarla leggendo
 * `organizations.onboarding_completato_at`. Quella colonna nel database non
 * c'era. La migrazione che la crea era stata scritta il 09/07/2026 — due mesi
 * prima — e non era mai stata applicata. La scrittura del flag era dentro un
 * `try/catch` silenzioso, quindi falliva ogni volta senza dire niente, e
 * l'unica cosa che teneva nascosta la procedura era il localStorage del
 * browser: cambiavi dispositivo, o aprivi una finestra privata, e ricompariva.
 *
 * Il commento di quella migrazione descriveva esattamente questo problema e
 * diceva di volerlo risolvere. Non l'ha risolto perché nessuno l'ha applicata.
 *
 * ── Perché non se n'era accorto nessuno ──────────────────────────────
 *
 * Il controllo che esisteva (`.github/workflows/migration-check.yml`) scatta
 * `on: pull_request`. Qui si pubblica spingendo dritto su `main`: quel
 * workflow non è mai partito una volta. Una rete di sicurezza appesa a una
 * porta che nessuno apre.
 *
 * E non esiste `supabase_migrations.schema_migrations`: non c'è alcun registro
 * di cosa sia stato applicato. Le migrazioni si lanciano a mano nell'editor
 * SQL, e una saltata non lascia traccia da nessuna parte.
 *
 * ── Cosa fa questo script ────────────────────────────────────────────
 *
 * Legge le migrazioni, tira fuori tabelle/colonne/funzioni promesse, e
 * confronta con lo schema vero. Poi divide in due:
 *
 *   ROSSO  — manca nel database ED è usato dal codice in src/ o api/.
 *            Qualcosa è rotto in produzione adesso: esce con errore.
 *   GIALLO — manca nel database ma nessuno lo usa. Sono funzioni mai
 *            costruite (il PIN dei dipendenti, i crediti AI): si segnalano
 *            e basta.
 *
 * La divisione è il punto. Un controllo che si lamenta anche di ciò che non
 * serve viene ignorato dopo tre volte, e allora non protegge più niente —
 * è successo davvero con le soglie di copertura in `vitest.config.js`.
 *
 * Senza credenziali del database (CI, macchina nuova) non fallisce: dice che
 * non ha potuto controllare ed esce pulito.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRAZIONI = join(RADICE, 'supabase', 'migrations')

// ── Dove sta psql e come si entra ─────────────────────────────────────
const PSQL = ['/usr/local/opt/libpq/bin/psql', '/opt/homebrew/opt/libpq/bin/psql', 'psql']
  .find(p => { try { execFileSync(p, ['--version'], { stdio: 'ignore' }); return true } catch { return false } })

const ENV_DB = join(homedir(), '.config', 'foodos', 'supabase.env')

function urlDatabase() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL
  if (!existsSync(ENV_DB)) return null
  const righe = readFileSync(ENV_DB, 'utf8').split('\n')
  const v = {}
  for (const r of righe) {
    const m = r.match(/^([A-Z_]+)=(.*)$/)
    if (m) v[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  if (v.SUPABASE_DB_URL) return v.SUPABASE_DB_URL
  if (v.PGHOST && v.PGUSER && v.PGPASSWORD) {
    const porta = v.PGPORT || '5432'
    const db = v.PGDATABASE || 'postgres'
    return `postgresql://${encodeURIComponent(v.PGUSER)}:${encodeURIComponent(v.PGPASSWORD)}@${v.PGHOST}:${porta}/${db}`
  }
  return null
}

function interroga(url, sql) {
  return execFileSync(PSQL, [url, '-tA', '-c', sql], { encoding: 'utf8', timeout: 60000 })
    .split('\n').map(s => s.trim()).filter(Boolean)
}

// ── Cosa promettono le migrazioni ─────────────────────────────────────
function senzaCommenti(sql) {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Cosa promette UN file di migrazione. Esportata perche' e' la parte che puo'
 * sbagliare in silenzio: se la lettura non riconosce una forma di SQL, un
 * oggetto mancante non viene mai segnalato e il controllo sembra verde.
 */
export function oggettiPromessi(sqlGrezzo) {
  const sql = senzaCommenti(String(sqlGrezzo || '')).toLowerCase()
  const colonne = [], tabelle = [], funzioni = []
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([\w"]+)/g)) {
    colonne.push(`${m[1].replace('public.', '').replace(/"/g, '')}.${m[2].replace(/"/g, '')}`)
  }
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)/g)) {
    tabelle.push(m[1].replace('public.', '').replace(/"/g, ''))
  }
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(/g)) {
    funzioni.push(m[1].replace('public.', '').replace(/"/g, ''))
  }
  return { colonne, tabelle, funzioni }
}

function promesse() {
  const colonne = new Map(), tabelle = new Map(), funzioni = new Map()
  for (const f of readdirSync(MIGRAZIONI).filter(n => n.endsWith('.sql')).sort()) {
    const o = oggettiPromessi(readFileSync(join(MIGRAZIONI, f), 'utf8'))
    for (const c of o.colonne)  if (!colonne.has(c))  colonne.set(c, f)
    for (const t of o.tabelle)  if (!tabelle.has(t))  tabelle.set(t, f)
    for (const n of o.funzioni) if (!funzioni.has(n)) funzioni.set(n, f)
  }
  return { colonne, tabelle, funzioni }
}

// ── Il codice del prodotto lo usa? ────────────────────────────────────
function testoDelProdotto() {
  const pezzi = []
  const giro = (dir) => {
    for (const voce of readdirSync(dir, { withFileTypes: true })) {
      if (voce.name === 'node_modules' || voce.name.startsWith('.')) continue
      const p = join(dir, voce.name)
      if (voce.isDirectory()) giro(p)
      else if (/\.(js|jsx|mjs|ts|tsx)$/.test(voce.name)) pezzi.push(readFileSync(p, 'utf8'))
    }
  }
  for (const d of ['src', 'api']) { const p = join(RADICE, d); if (existsSync(p)) giro(p) }
  return pezzi.join('\n')
}

// ── Esecuzione ────────────────────────────────────────────────────────
//
// Tutto il lavoro sta dentro una funzione: importando questo file da un test
// non deve succedere niente — niente connessioni, niente `process.exit`.
function principale() {
  const url = PSQL ? urlDatabase() : null
  if (!url) {
    console.log('• migrazioni: controllo saltato (nessuna credenziale database disponibile qui).')
    return 0
  }

  const { colonne, tabelle, funzioni } = promesse()

  let dbColonne, dbTabelle, dbFunzioni
  try {
    dbColonne  = new Set(interroga(url, "select table_name||'.'||column_name from information_schema.columns where table_schema='public'"))
    dbTabelle  = new Set(interroga(url, "select table_name from information_schema.tables where table_schema='public'"))
    dbFunzioni = new Set(interroga(url, "select distinct proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"))
  } catch {
    console.log('• migrazioni: controllo saltato (database non raggiungibile da qui).')
    return 0
  }

  const codice = testoDelProdotto()
  const usato = (nome) => codice.includes(nome)

  const rosso = [], giallo = []
  for (const [nome, file] of tabelle) {
    if (!dbTabelle.has(nome)) (usato(nome) ? rosso : giallo).push([`tabella ${nome}`, file])
  }
  for (const [nome, file] of colonne) {
    const [t, c] = nome.split('.')
    // Se manca la tabella intera il problema e' gia' segnalato sopra.
    if (dbTabelle.has(t) && !dbColonne.has(nome)) (usato(c) ? rosso : giallo).push([`colonna ${nome}`, file])
  }
  for (const [nome, file] of funzioni) {
    if (!dbFunzioni.has(nome)) (usato(nome) ? rosso : giallo).push([`funzione ${nome}`, file])
  }

  const quante = readdirSync(MIGRAZIONI).filter(n => n.endsWith('.sql')).length
  if (!rosso.length && !giallo.length) {
    console.log(`• migrazioni: le ${quante} migrazioni corrispondono allo schema del database.`)
    return 0
  }

  if (giallo.length) {
    const uno = giallo.length === 1
    console.log(`• migrazioni: ${giallo.length} ogget${uno ? 'to promesso' : 'ti promessi'} ma non applicat${uno ? 'o' : 'i'} — nessuno li usa, nessun danno:`)
    for (const [che, file] of giallo) console.log(`    ${che}  (${file})`)
  }

  if (rosso.length) {
    console.error('')
    console.error('✗ MIGRAZIONI NON APPLICATE, E IL PROGRAMMA LE USA:')
    console.error('')
    for (const [che, file] of rosso) console.error(`    ${che}\n      la crea: supabase/migrations/${file}`)
    console.error('')
    console.error('  Qualcosa e\' rotto in produzione adesso. Applica quei file')
    console.error('  nell\'editor SQL di Supabase, poi rilancia.')
    console.error('')
    return 1
  }
  return 0
}

// Lanciato da riga di comando? Allora lavora. Importato? Solo gli export.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(principale())
}
