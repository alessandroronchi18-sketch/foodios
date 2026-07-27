#!/usr/bin/env node
// Rigenera src/lib/comuniItaliani.js dalla lista ISTAT ufficiale
// (via matteocontrini/comuni-json, MIT). Da rilanciare quando ISTAT
// pubblica variazioni territoriali (fusioni/istituzioni di comuni).
//
// Uso: node scripts/fetch-comuni-istat.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = 'https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json'
const OUT = path.resolve(fileURLToPath(import.meta.url), '../../src/lib/comuniItaliani.js')

const res = await fetch(SRC)
if (!res.ok) { console.error('Fetch fallito:', res.status); process.exit(1) }
const data = await res.json()

// Conta omonimi: solo per i duplicati aggiungiamo la sigla provincia
const count = new Map()
for (const c of data) count.set(c.nome, (count.get(c.nome) || 0) + 1)

const nomi = data
  .map(c => count.get(c.nome) > 1 ? `${c.nome} (${c.sigla})` : c.nome)
  .sort((a, b) => a.localeCompare(b, 'it'))

// Serializza array con quoting sicuro (JSON gestisce apostrofi via \")
const lines = []
lines.push('// Comuni italiani ISTAT (rigenerato via scripts/fetch-comuni-istat.mjs).')
lines.push('// Fonte: https://github.com/matteocontrini/comuni-json (dati ISTAT).')
lines.push(`// ${nomi.length} comuni, ordinati alfabeticamente.`)
lines.push('// Omonimi disambiguati con (SG) sigla provincia.')
lines.push('')
lines.push('const COMUNI_ITALIANI = [')
// batch 6 per riga per leggibilità
for (let i = 0; i < nomi.length; i += 6) {
  const batch = nomi.slice(i, i + 6).map(n => JSON.stringify(n)).join(',')
  lines.push(`  ${batch},`)
}
lines.push(']')
lines.push('')
lines.push('export default COMUNI_ITALIANI')
lines.push('')

fs.writeFileSync(OUT, lines.join('\n'), 'utf8')
console.log(`Scritti ${nomi.length} comuni in ${path.relative(process.cwd(), OUT)}`)
