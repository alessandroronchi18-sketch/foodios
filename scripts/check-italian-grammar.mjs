#!/usr/bin/env node
// Test grammatica italiana: cerca pattern di errori comuni nel codebase.
// Fa fail con exit code 1 se ne trova → blocca la pre-push (lint+test+build).
//
// Pattern controllati (regex con word-boundary):
//   piu' → più, perche' → perché, cosi' → così, gia' → già, pero' → però
//
// Skip:
//   - node_modules, dist, .git, public, coverage
//   - File generati / dataset
//
// L'utente ha richiesto questo check perche' ricorrono "piu'" e simili in copy
// visibili dal cliente (e quando vede "piu'" pensa "professionale".

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const PATTERNS = [
  { re: /\bpiu'(?!\w)/g,    fix: 'più',   nome: "piu' senza accento" },
  { re: /\bPiu'(?!\w)/g,    fix: 'Più',   nome: "Piu' senza accento" },
  { re: /\bPIU'(?!\w)/g,    fix: 'PIÙ',   nome: "PIU' senza accento" },
  { re: /\bperche'(?!\w)/g, fix: 'perché', nome: "perche' senza accento" },
  { re: /\bPerche'(?!\w)/g, fix: 'Perché', nome: "Perche' senza accento" },
  { re: /\bcosi'(?!\w)/g,   fix: 'così',  nome: "cosi' senza accento" },
  { re: /\bCosi'(?!\w)/g,   fix: 'Così',  nome: "Cosi' senza accento" },
  { re: /\bgia'(?!\w)/g,    fix: 'già',   nome: "gia' senza accento" },
  { re: /\bGia'(?!\w)/g,    fix: 'Già',   nome: "Gia' senza accento" },
  { re: /\bpero'(?!\w)/g,   fix: 'però',  nome: "pero' senza accento" },
  { re: /\bPero'(?!\w)/g,   fix: 'Però',  nome: "Pero' senza accento" },
]

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'public', '.next', '.vercel', 'playwright-report'])
const VALID_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.md'])

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full))
    else if (VALID_EXT.has(extname(entry))) out.push(full)
  }
  return out
}

const files = walk(join(ROOT, 'src')).concat(walk(join(ROOT, 'api')))
const violations = []

for (const f of files) {
  let content
  try { content = readFileSync(f, 'utf8') } catch { continue }
  for (const { re, fix, nome } of PATTERNS) {
    let m
    re.lastIndex = 0
    while ((m = re.exec(content)) !== null) {
      const before = content.lastIndexOf('\n', m.index) + 1
      const after = content.indexOf('\n', m.index)
      const line = content.substring(before, after === -1 ? undefined : after).trim()
      const lineNum = content.substring(0, m.index).split('\n').length
      violations.push({ file: f.replace(ROOT + '/', ''), line: lineNum, match: m[0], fix, nome, source: line.slice(0, 100) })
    }
  }
}

if (violations.length === 0) {
  console.log('[grammar] OK — nessun errore grammaticale italiano trovato.')
  process.exit(0)
}

console.error(`\n[grammar] ❌ ${violations.length} errori grammaticali trovati:\n`)
for (const v of violations.slice(0, 50)) {
  console.error(`  ${v.file}:${v.line}  "${v.match}" → "${v.fix}"  (${v.nome})`)
  console.error(`    > ${v.source}\n`)
}
if (violations.length > 50) {
  console.error(`  ... e altri ${violations.length - 50}`)
}
console.error('\nCorreggi con: python3 /tmp/fix-italian-grammar.py $(find src api -type f \\( -name "*.jsx" -o -name "*.js" \\))')
process.exit(1)
