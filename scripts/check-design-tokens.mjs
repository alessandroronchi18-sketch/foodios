#!/usr/bin/env node
// Controllo a cricchetto sui token di design.
//
// Il problema. src/lib/theme.js definisce una scala di token (colori, spazi,
// tipografia, raggi) e viene usata oltre 2.600 volte. Accanto pero' convivono
// valori scritti a mano: al 2026-09-07 erano 275 colori esadecimali distinti,
// 28 dimensioni di testo diverse (da 7px a 84px) e 24 raggi. Il colore del
// marchio #6E0E1A da solo compariva 183 volte a mano: cambiarlo significa 183
// modifiche invece di una.
//
// Perche' a cricchetto e non a soglia zero. Sistemare le 275 deviazioni
// esistenti e' lavoro che non produce nulla per il cliente, e bloccare la
// pre-push finche' non e' fatto fermerebbe lo sviluppo. Questo controllo
// registra quante ne esistono oggi, file per file, e fallisce solo se il
// numero CRESCE. Il passato si sistema quando si passa di li'; il presente
// smette di peggiorare.
//
// Aggiornare la fotografia dopo aver ripulito un file:
//   node scripts/check-design-tokens.mjs --aggiorna
//
// Il file di riferimento e' scripts/design-tokens-baseline.json, versionato.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BASELINE = join(__dirname, 'design-tokens-baseline.json')
const AGGIORNA = process.argv.includes('--aggiorna')

// I file che DEFINISCONO i token possono ovviamente contenere valori grezzi.
const ESENTI = new Set([
  'src/lib/theme.js',
  'src/lib/uiKit.js',
  'src/lib/icons.jsx',
  'src/styles/global.css',
])

const REGOLE = [
  {
    id: 'colore-a-mano',
    re: /#[0-9a-fA-F]{6}\b/g,
    spiega: 'colore esadecimale scritto a mano invece di un token di color in theme.js',
  },
  {
    id: 'testo-a-mano',
    re: /fontSize:\s*'?\d+/g,
    spiega: 'dimensione del testo scritta a mano invece di typo/getTypo in theme.js',
  },
]

function raccogliFile(dir, out = []) {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) raccogliFile(p, out)
    else if (['.jsx', '.js'].includes(extname(nome))) out.push(p)
  }
  return out
}

const conteggi = {}
for (const file of raccogliFile(join(ROOT, 'src'))) {
  const rel = relative(ROOT, file)
  if (ESENTI.has(rel)) continue
  const testo = readFileSync(file, 'utf8')
  for (const regola of REGOLE) {
    const n = (testo.match(regola.re) || []).length
    if (n > 0) {
      conteggi[rel] = conteggi[rel] || {}
      conteggi[rel][regola.id] = n
    }
  }
}

if (AGGIORNA) {
  writeFileSync(BASELINE, JSON.stringify(conteggi, null, 2) + '\n')
  const tot = Object.values(conteggi).reduce((s, r) => s + Object.values(r).reduce((a, b) => a + b, 0), 0)
  console.log(`[design] fotografia aggiornata: ${tot} occorrenze in ${Object.keys(conteggi).length} file.`)
  process.exit(0)
}

if (!existsSync(BASELINE)) {
  console.error('[design] manca scripts/design-tokens-baseline.json. Crealo con: node scripts/check-design-tokens.mjs --aggiorna')
  process.exit(1)
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'))
const peggiorati = []

for (const [file, regole] of Object.entries(conteggi)) {
  for (const [id, n] of Object.entries(regole)) {
    const prima = base[file]?.[id] ?? 0
    if (n > prima) peggiorati.push({ file, id, prima, ora: n })
  }
}

if (peggiorati.length === 0) {
  const tot = Object.values(conteggi).reduce((s, r) => s + Object.values(r).reduce((a, b) => a + b, 0), 0)
  console.log(`[design] OK — nessuna nuova deviazione dai token (${tot} preesistenti, invariate o in calo).`)
  process.exit(0)
}

console.error(`\n[design] ${peggiorati.length} file hanno NUOVE deviazioni dai token:\n`)
for (const p of peggiorati) {
  const regola = REGOLE.find(r => r.id === p.id)
  console.error(`  ${p.file}`)
  console.error(`    ${p.id}: erano ${p.prima}, ora ${p.ora}  (+${p.ora - p.prima})`)
  console.error(`    ${regola.spiega}\n`)
}
console.error('Usa i token di src/lib/theme.js: color.* per i colori, typo/getTypo per il testo.')
console.error('Se la crescita e\' voluta e motivata: node scripts/check-design-tokens.mjs --aggiorna\n')
process.exit(1)
