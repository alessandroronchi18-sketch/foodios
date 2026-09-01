#!/usr/bin/env node
/**
 * FOODOS — Import bulk multi-entity da Excel/CSV.
 *
 * Modalita' founder-assisted: il founder ha SUPABASE_SERVICE_KEY in
 * .env.local, quindi lo script chiama direttamente Supabase (bypass RLS).
 * L'ORG_ID e' passato esplicitamente da riga di comando.
 *
 * Uso:
 *   node scripts/import-any.mjs --file <path.xlsx> --entity <fornitori|dipendenti> --org <uuid> [--dry-run]
 *
 * Esempi:
 *   node scripts/import-any.mjs --file import-data/mara/fornitori.xlsx --entity fornitori --org abc-123
 *   node scripts/import-any.mjs --file import-data/mara/personale.xlsx --entity dipendenti --org abc-123 --dry-run
 *
 * Il flusso:
 *   1. Parsea il file (primo sheet dell'xlsx, o CSV)
 *   2. Chiama Claude via Anthropic API per suggerire il mapping colonne
 *   3. Mostra il mapping proposto e chiede conferma
 *   4. Valida tutte le righe (tipi, required, range)
 *   5. Mostra stats + errori riga-per-riga
 *   6. Chiede conferma insert
 *   7. Insert batch su Supabase (200 righe alla volta)
 *   8. Log completo salvato in import-data/<log-name>.log
 *
 * Env richieste (in .env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   ANTHROPIC_API_KEY
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

import { getEntitySchema, listEntities } from '../src/lib/importSchemas.js'
import { validateRows, findMissingRequired } from '../src/lib/importValidateCore.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const MODEL = 'claude-sonnet-4-6'
const BATCH_SIZE = 200

// ── ANSI colors ──────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', magenta: '\x1b[35m',
}

function ok(msg) { console.log(`${c.green}✓${c.reset} ${msg}`) }
function warn(msg) { console.log(`${c.yellow}⚠${c.reset} ${msg}`) }
function err(msg) { console.log(`${c.red}✗${c.reset} ${msg}`) }
function info(msg) { console.log(`${c.cyan}ℹ${c.reset} ${msg}`) }
function heading(msg) { console.log(`\n${c.bold}${c.magenta}${msg}${c.reset}`) }

// ── Args parsing ─────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const out = { dryRun: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--file') out.file = args[++i]
    else if (a === '--entity') out.entity = args[++i]
    else if (a === '--org') out.orgId = args[++i]
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--help' || a === '-h') out.help = true
  }
  return out
}

function printUsage() {
  console.log(`
${c.bold}FOODOS — Import bulk${c.reset}

Uso:
  node scripts/import-any.mjs --file <path> --entity <name> --org <uuid> [--dry-run]

Argomenti:
  --file <path>     File .xlsx o .csv da importare
  --entity <name>   Entita' target (${listEntities().join(', ')})
  --org <uuid>      UUID dell'organizzazione destinataria
  --dry-run         Non fare insert, solo mostra cosa succederebbe
  --help, -h        Mostra questo help

Env richieste in .env.local:
  SUPABASE_URL
  SUPABASE_SERVICE_KEY
  ANTHROPIC_API_KEY
`)
}

// ── .env.local loader (basic) ─────────────────────────────────────

function loadDotEnvLocal() {
  const p = resolve(REPO_ROOT, '.env.local')
  if (!existsSync(p)) return
  const txt = readFileSync(p, 'utf8')
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i)
    if (!m) continue
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[m[1]]) process.env[m[1]] = val
  }
}

// ── File parsing ─────────────────────────────────────────────────

/**
 * Legge file xlsx/csv, ritorna { headers, rows } dove rows e' array di
 * oggetti con keys = headers.
 * Prende SOLO il primo sheet (per xlsx). Se il file ha più sheet e serve
 * un altro, TODO: aggiungere --sheet flag.
 */
function parseFile(filePath) {
  if (!existsSync(filePath)) throw new Error(`File non trovato: ${filePath}`)
  const buf = readFileSync(filePath)
  const wb = XLSX.read(buf, { type: 'buffer' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('Nessun sheet trovato nel file')
  const ws = wb.Sheets[sheetName]
  // header:1 → prima riga come array di header, successive come array di celle
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false })
  if (raw.length < 2) throw new Error('File senza righe dati (serve almeno header + 1 riga)')
  const headers = raw[0].map((h, i) => (h == null || String(h).trim() === '') ? `_col${i}` : String(h).trim())
  const rows = raw.slice(1).map(r => {
    const obj = {}
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = r[i] ?? null
    return obj
  })
  // Filtra righe completamente vuote
  const filtered = rows.filter(r => Object.values(r).some(v => v != null && String(v).trim() !== ''))
  return { headers, rows: filtered, sheetName }
}

// ── AI mapping ───────────────────────────────────────────────────

function buildSystemPrompt() {
  return `Sei un esperto di data migration per software gestionale della ristorazione italiana.

Riceverai:
- Uno SCHEMA TARGET (JSON) con la lista dei field che il sistema si aspetta per una specifica entita (fornitori, dipendenti, ecc.). Ogni field ha: name, type, required, hint (spiegazione umana), aliases (nomi comuni).
- Un file INPUT del cliente con: headers (nomi delle colonne) + fino a 5 sample rows.

Il tuo compito: MAPPARE ciascuna colonna del file input a un field dello schema target, quando c'e un match sensato.

REGOLE:
1. Un field schema puo essere mappato a UNA colonna input al massimo.
2. Una colonna input puo essere mappata a UN field schema al massimo.
3. Se una colonna input non ha corrispondenza, lasciala unmapped.
4. Se un field required NON ha match, aggiungilo a missing_required.
5. Usa gli aliases come guida forte.
6. Guarda i sample rows per confermare il tipo.
7. Confidence: 1.0 (certezza), 0.8 (probabile), 0.5 (plausibile), <0.5 (skip).

FORMATO OUTPUT (JSON, nessun altro testo):
{
  "mapping": { "<field_target>": "<nome_colonna_input>", ... },
  "confidence": { "<field_target>": 0.95, ... },
  "unmapped_columns": [...],
  "missing_required": [...],
  "notes": "spiegazione breve"
}

Nessun testo prima o dopo il JSON.`
}

async function callAiMapping({ schema, headers, sampleRows }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY mancante in .env.local')

  const fieldsSummary = schema.fields.map(f => ({
    name: f.name, type: f.type, required: !!f.required,
    hint: f.hint, aliases: f.aliases || [],
  }))
  const userPrompt = `SCHEMA TARGET (${schema.label}):
${JSON.stringify({ description: schema.description, fields: fieldsSummary }, null, 2)}

FILE INPUT — headers:
${JSON.stringify(headers)}

FILE INPUT — sample rows:
${JSON.stringify(sampleRows.slice(0, 5), null, 2)}

Restituisci il JSON di mapping.`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })
  if (!resp.ok) throw new Error(`Anthropic HTTP ${resp.status}: ${await resp.text()}`)
  const payload = await resp.json()
  const rawText = payload?.content?.[0]?.text || ''
  if (!rawText) throw new Error('Risposta AI vuota')
  let parsed
  try { parsed = JSON.parse(rawText) }
  catch {
    const m = rawText.match(/\{[\s\S]*\}/)
    if (m) { try { parsed = JSON.parse(m[0]) } catch { /* */ } }
  }
  if (!parsed) throw new Error(`Risposta AI non JSON: ${rawText.slice(0, 200)}`)

  // Sanity check
  const validFields = new Set(schema.fields.map(f => f.name))
  const validCols = new Set(headers)
  const cleanMapping = {}
  const cleanConf = {}
  for (const [f, col] of Object.entries(parsed.mapping || {})) {
    if (!validFields.has(f) || typeof col !== 'string' || !validCols.has(col)) continue
    cleanMapping[f] = col
    const cf = Number(parsed.confidence?.[f])
    cleanConf[f] = Number.isFinite(cf) ? Math.max(0, Math.min(1, cf)) : 0.5
  }
  return {
    mapping: cleanMapping,
    confidence: cleanConf,
    unmapped_columns: Array.isArray(parsed.unmapped_columns) ? parsed.unmapped_columns : [],
    missing_required: Array.isArray(parsed.missing_required) ? parsed.missing_required : [],
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
  }
}

// ── Interactive prompt ────────────────────────────────────────────

async function confirm(rl, question, defaultYes = true) {
  const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] '
  const ans = (await rl.question(question + suffix)).trim().toLowerCase()
  if (ans === '') return defaultYes
  return ans.startsWith('y') || ans === 'si' || ans === 'sì'
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs()
  if (args.help || !args.file || !args.entity || !args.orgId) {
    printUsage()
    process.exit(args.help ? 0 : 1)
  }

  loadDotEnvLocal()

  const schema = getEntitySchema(args.entity)
  if (!schema) {
    err(`Entity "${args.entity}" non supportato. Valide: ${listEntities().join(', ')}`)
    process.exit(1)
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    err('SUPABASE_URL e SUPABASE_SERVICE_KEY richieste in .env.local')
    process.exit(1)
  }

  heading(`FOODOS Import — ${schema.label}`)
  info(`File:      ${args.file}`)
  info(`Entity:    ${args.entity} → tabella "${schema.table}"`)
  info(`Org ID:    ${args.orgId}`)
  info(`Dry run:   ${args.dryRun ? 'SI (nessuna scrittura DB)' : 'NO (insert reale)'}`)

  // 1. Parse file
  heading('Step 1/5 — Parsing file')
  const { headers, rows, sheetName } = parseFile(args.file)
  ok(`Sheet: "${sheetName}" · ${headers.length} colonne · ${rows.length} righe`)
  info(`Colonne: ${headers.join(' · ')}`)

  const rl = createInterface({ input: stdin, output: stdout })

  try {
    // 2. AI mapping
    heading('Step 2/5 — Suggerimento mapping (AI)')
    const map = await callAiMapping({ schema, headers, sampleRows: rows.slice(0, 5) })
    console.log('\nMapping proposto:')
    for (const field of schema.fields) {
      const col = map.mapping[field.name]
      const conf = map.confidence[field.name]
      const req = field.required ? `${c.red}[required]${c.reset}` : `${c.dim}[opz]${c.reset}`
      if (col) {
        const confStr = conf >= 0.8 ? `${c.green}${conf.toFixed(2)}${c.reset}` : conf >= 0.5 ? `${c.yellow}${conf.toFixed(2)}${c.reset}` : `${c.red}${conf.toFixed(2)}${c.reset}`
        console.log(`  ${c.bold}${field.name}${c.reset} ${req} ← "${col}" (conf ${confStr})`)
      } else {
        console.log(`  ${c.bold}${field.name}${c.reset} ${req} ← ${c.dim}(non mappato)${c.reset}`)
      }
    }
    if (map.unmapped_columns.length > 0) {
      warn(`Colonne del file non mappate: ${map.unmapped_columns.join(', ')}`)
    }
    if (map.missing_required.length > 0) {
      err(`Field required senza match: ${map.missing_required.join(', ')} — impossibile procedere.`)
      process.exit(2)
    }
    if (map.notes) console.log(`\n${c.dim}Note AI:${c.reset} ${map.notes}`)

    if (!(await confirm(rl, '\nConfermi il mapping?'))) {
      warn('Mapping non confermato. Uscita.')
      process.exit(0)
    }

    // 3. Validate rows
    heading('Step 3/5 — Validazione righe')
    const missing = findMissingRequired(map.mapping, schema)
    if (missing.length > 0) {
      err(`Field required senza mapping: ${missing.join(', ')}`)
      process.exit(2)
    }
    const { valid_rows, invalid_rows, stats } = validateRows(rows, map.mapping, schema)
    ok(`Totale ${stats.total} · valide ${c.green}${stats.valid}${c.reset} · invalide ${stats.invalid > 0 ? c.red : c.green}${stats.invalid}${c.reset}`)
    if (invalid_rows.length > 0) {
      console.log('\nPrime righe con errori:')
      for (const inv of invalid_rows.slice(0, 10)) {
        console.log(`  ${c.red}riga ${inv.row_index + 2}:${c.reset} ${inv.errors.join(' · ')}`)
      }
      if (invalid_rows.length > 10) console.log(`  ${c.dim}...e altre ${invalid_rows.length - 10} righe con errori${c.reset}`)
    }
    if (valid_rows.length === 0) {
      err('Nessuna riga valida. Uscita.')
      process.exit(3)
    }
    if (!(await confirm(rl, `\nInserire ${valid_rows.length} righe in "${schema.table}" per org ${args.orgId}?`))) {
      warn('Insert non confermato. Uscita.')
      process.exit(0)
    }

    // 4. Insert (o dry-run)
    heading('Step 4/5 — Insert su Supabase')
    if (args.dryRun) {
      ok('DRY RUN: nessun insert eseguito.')
      console.log('\nPrime 3 righe che sarebbero inserite:')
      console.log(JSON.stringify(valid_rows.slice(0, 3).map(r => ({ organization_id: args.orgId, ...r })), null, 2))
    } else {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      const prepared = valid_rows.map(r => ({ organization_id: args.orgId, ...r }))
      let insertedCount = 0
      const failedBatches = []
      for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
        const chunk = prepared.slice(i, i + BATCH_SIZE)
        const { data, error } = await supabase.from(schema.table).insert(chunk).select('id')
        if (error) {
          failedBatches.push({ batch_start: i, batch_size: chunk.length, error: error.message })
          err(`Batch ${i}-${i + chunk.length}: ${error.message}`)
        } else {
          insertedCount += (data?.length || 0)
          process.stdout.write(`${c.dim}  inseriti ${insertedCount}/${prepared.length}...${c.reset}\r`)
        }
      }
      console.log('')
      if (failedBatches.length > 0) {
        err(`Falliti ${failedBatches.length} batch (vedi log).`)
      } else {
        ok(`Inserite ${insertedCount} righe.`)
      }
    }

    // 5. Log
    heading('Step 5/5 — Log')
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const logDir = resolve(REPO_ROOT, 'import-data')
    const logPath = resolve(logDir, `import-${args.entity}-${ts}.log`)
    const logLines = [
      `FOODOS Import log — ${new Date().toISOString()}`,
      `File:     ${args.file}`,
      `Entity:   ${args.entity} → ${schema.table}`,
      `Org:      ${args.orgId}`,
      `Dry run:  ${args.dryRun}`,
      `Sheet:    ${sheetName}`,
      `Totale:   ${stats.total}`,
      `Valide:   ${stats.valid}`,
      `Invalide: ${stats.invalid}`,
      '',
      'Mapping usato:',
      JSON.stringify(map.mapping, null, 2),
      '',
      map.notes ? `Note AI: ${map.notes}` : '',
      '',
      invalid_rows.length > 0 ? 'Righe con errori:' : '',
      ...invalid_rows.map(inv => `  riga ${inv.row_index + 2}: ${inv.errors.join(' · ')} — data: ${JSON.stringify(inv.row_data)}`),
    ]
    try {
      writeFileSync(logPath, logLines.join('\n'))
      ok(`Log salvato: ${logPath}`)
    } catch (e) {
      warn(`Impossibile scrivere log: ${e.message} (crea la cartella import-data/ prima di rilanciare)`)
    }

    heading('Done.')
  } finally {
    rl.close()
  }
}

main().catch(e => {
  err(e?.message || String(e))
  if (e?.stack) console.error(c.dim + e.stack + c.reset)
  process.exit(99)
})
