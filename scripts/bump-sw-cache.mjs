#!/usr/bin/env node
// Auto-bumpa CACHE_VERSION in public/sw.js prima di ogni build.
//
// Perche': se ci dimentichiamo di bumpare manualmente, i client con PWA
// installata (Safari iOS in particolare) continuano a servire dalla cache
// l'HTML/shell vecchio anche dopo deploy con UI nuova. Il design partner
// vedeva il sito 'uguale a prima' fino a quando bumpavamo a mano.
//
// Strategia:
//   1. Legge il git short SHA del HEAD (se disponibile, altrimenti timestamp)
//   2. Riscrive la riga `const CACHE_VERSION = '...'` con l'identificatore
//      univoco al commit di build → ogni deploy = nuova versione SW garantita
//   3. Il SW al primo fetch del nuovo /sw.js trova versione diversa, attiva
//      install→activate, pulisce cache vecchie, clients.claim e reload
//      automatico via controllerchange in src/lib/pwa.js
//
// Idempotente: se ri-eseguito sullo stesso HEAD produce la stessa stringa.

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SW_PATH = join(__dirname, '..', 'public', 'sw.js')

function getVersion() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    return `foodios-${date}-${sha}`
  } catch {
    // Fallback: senza git (es. Vercel preview senza checkout completo).
    // Timestamp ms al secondo → unico ad ogni build.
    return `foodios-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
  }
}

const newVersion = getVersion()
const sw = readFileSync(SW_PATH, 'utf8')
const re = /const CACHE_VERSION = '[^']+';/
if (!re.test(sw)) {
  console.error('[bump-sw-cache] ERRORE: pattern CACHE_VERSION non trovato in', SW_PATH)
  process.exit(1)
}
const updated = sw.replace(re, `const CACHE_VERSION = '${newVersion}';`)
if (updated === sw) {
  console.log(`[bump-sw-cache] CACHE_VERSION già a '${newVersion}', no-op`)
} else {
  writeFileSync(SW_PATH, updated)
  console.log(`[bump-sw-cache] CACHE_VERSION → '${newVersion}'`)
}
