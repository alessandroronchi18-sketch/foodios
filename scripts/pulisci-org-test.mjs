#!/usr/bin/env node
// Rete di sicurezza: cancella dal database le aziende lasciate dai test
// automatici. Serve perché i test e2e girano anche in CI, dove un run
// interrotto a metà (timeout, crash del browser) non arriva alla pulizia.
//
// Storia: il 10/09/2026 nel database di produzione c'erano 1.639 aziende
// finte accumulate dai test, con 1.230 profili e 2.230 righe di dati. La
// pulizia dei test c'era e veniva chiamata, ma FALLIVA: un trigger del
// registro modifiche scriveva una riga che referenziava l'azienda in corso di
// cancellazione, il vincolo la rifiutava, e l'errore veniva ingoiato. Sistemati
// i trigger (migration 20260910_audit_delete_org.sql) la cancellazione
// funziona; questo script è il controllo periodico che non si riaccumuli.
//
// Uso:
//   node scripts/pulisci-org-test.mjs            # mostra cosa cancellerebbe
//   node scripts/pulisci-org-test.mjs --conferma  # cancella davvero
//
// Funziona con SUPABASE_SERVICE_KEY (in CI) oppure con le credenziali Postgres
// dirette PGHOST/PGUSER/PGPASSWORD/PGDATABASE (dal portatile:
//   set -a; source ~/.config/foodos/supabase.env; set +a
// ). Sono due strade verso lo stesso database.

import { execFileSync } from 'node:child_process'

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE = process.env.SUPABASE_SERVICE_KEY || ''
const VIA_PSQL = !SERVICE && !!(process.env.PGHOST && process.env.PGPASSWORD)
if (!SERVICE && !VIA_PSQL) {
  console.error('Servono SUPABASE_SERVICE_KEY, oppure le variabili PGHOST/PGUSER/PGPASSWORD/PGDATABASE.')
  process.exit(2)
}

const PSQL = process.env.PSQL_BIN || '/usr/local/opt/libpq/bin/psql'
function sql(query) {
  return execFileSync(PSQL, ['-X', '-q', '-A', '-t', '-F', '\t', '-c', query], { encoding: 'utf-8' })
    .split('\n').filter(Boolean).map(r => r.split('\t'))
}

const conferma = process.argv.includes('--conferma')

// Nomi generati SOLO dai test. Volutamente stretti: un cliente vero non si
// chiama così, e un falso positivo qui cancellerebbe dati di un cliente.
//   'E2E %'               → createEphemeralOrg (tests/helpers/db.js)
//   'FoodOS E2E Test Co'  → 02-signup.spec.js (registrazione dalla UI)
//   'Test %', '% E2E %'   → varianti storiche
const PATTERN = ['E2E %', 'FoodOS E2E Test Co', 'Test E2E%', '%foodos-e2e%']

// Un'azienda creata da meno di 2 ore può appartenere a un test in corso.
const ORE_GRAZIA = 2

const svc = SERVICE ? (await import('@supabase/supabase-js')).createClient(URL, SERVICE, { auth: { persistSession: false } }) : null

const limite = new Date(Date.now() - ORE_GRAZIA * 3600 * 1000).toISOString()
const trovate = new Map()

if (VIA_PSQL) {
  const cond = PATTERN.map(p => `nome ilike '${p.replace(/'/g, "''")}'`).join(' or ')
  for (const [id, nome, created] of sql(
    `select id, nome, created_at from organizations where (${cond}) and created_at < '${limite}' order by created_at`
  )) trovate.set(id, { id, nome, created_at: created })
} else {
  for (const p of PATTERN) {
    const { data, error } = await svc
      .from('organizations')
      .select('id, nome, created_at')
      .ilike('nome', p)
      .lt('created_at', limite)
    if (error) { console.error(`Lettura "${p}": ${error.message}`); process.exit(1) }
    for (const o of data || []) trovate.set(o.id, o)
  }
}

const lista = [...trovate.values()].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))

if (!lista.length) {
  console.log('Nessuna azienda di test da cancellare. Database pulito.')
  process.exit(0)
}

console.log(`Aziende di test trovate: ${lista.length}`)
for (const o of lista.slice(0, 20)) console.log(`  ${o.created_at?.slice(0, 10)}  ${o.nome}`)
if (lista.length > 20) console.log(`  ... e altre ${lista.length - 20}`)

if (!conferma) {
  console.log('\nProva a vuoto. Per cancellarle davvero: node scripts/pulisci-org-test.mjs --conferma')
  process.exit(0)
}

let fatte = 0
const falliti = []
for (const o of lista) {
  if (VIA_PSQL) {
    try { sql(`delete from organizations where id = '${o.id}'`); fatte++ }
    catch (e) { falliti.push(`${o.nome}: ${(e?.message || e).toString().slice(0, 120)}`) }
  } else {
    const { error } = await svc.from('organizations').delete().eq('id', o.id)
    if (error) falliti.push(`${o.nome}: ${error.message}`)
    else fatte++
  }
}

console.log(`\nCancellate: ${fatte}/${lista.length}`)
if (falliti.length) {
  console.log('NON cancellate:')
  for (const f of falliti.slice(0, 10)) console.log('  - ' + f)
  process.exit(1)
}
