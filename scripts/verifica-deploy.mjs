#!/usr/bin/env node
// Controlla che quello che hai pushato sia DAVVERO in produzione.
//
// Perché esiste (14/09/2026): due push sono passati dal gate pre-push con il
// build rotto, su Vercel il deploy è fallito in quattro secondi, e la
// produzione è rimasta ferma tre commit indietro senza nessun segnale. Il push
// dice "ok", il deploy muore in silenzio, e l'unico modo di accorgersene è che
// il sito non cambia.
//
// Come funziona: il prebuild scrive dentro `public/sw.js` il commit corrente
// (`CACHE_VERSION = 'foodos-<data>-<sha>'`). Qui si legge quel valore dalla
// produzione e lo si confronta con il commit locale. Se dopo qualche minuto
// non combacia, il deploy non è andato.
//
//   node scripts/verifica-deploy.mjs            # aspetta fino a 5 minuti
//   npm run push                                # push + questa verifica

import { execSync } from 'node:child_process'

const URL_PROD = process.env.URL_PROD || 'https://foodos-rose.vercel.app'
const ATTESA_MAX_MS = Number(process.env.ATTESA_MAX_MS || 5 * 60 * 1000)

const sha = execSync('git rev-parse --short HEAD').toString().trim()
console.log(`[deploy] commit locale: ${sha}`)
console.log(`[deploy] aspetto che ${URL_PROD} lo serva (max ${Math.round(ATTESA_MAX_MS / 60000)} min)…`)

const inizio = Date.now()
let ultimo = null
while (Date.now() - inizio < ATTESA_MAX_MS) {
  try {
    const r = await fetch(`${URL_PROD}/sw.js?t=${Date.now()}`, { cache: 'no-store' })
    const testo = await r.text()
    const m = testo.match(/CACHE_VERSION\s*=\s*'([^']+)'/)
    ultimo = m ? m[1] : null
    if (ultimo && ultimo.includes(sha)) {
      const sec = Math.round((Date.now() - inizio) / 1000)
      console.log(`[deploy] OK — in produzione c'è ${ultimo} (dopo ${sec}s)`)
      process.exit(0)
    }
  } catch (e) {
    console.log(`[deploy] la produzione non risponde: ${e.message}`)
  }
  await new Promise(r => setTimeout(r, 10000))
}

console.error('')
console.error(`[deploy] ✖ IL DEPLOY NON È ANDATO. In produzione c'è ancora ${ultimo || '(nessuna risposta)'}, il commit locale è ${sha}.`)
console.error('')
console.error('  Cosa guardare, in ordine:')
console.error('    npx vercel ls                       # lo stato degli ultimi deploy')
console.error('    npx vercel inspect --logs <url>     # perché quello in errore è fallito')
console.error('')
console.error('  Il sospetto numero uno è il prebuild: grammatica italiana o cricchetto')
console.error('  sui token di design. In locale: npm run build (non `npx vite build`,')
console.error('  che salta il prebuild).')
process.exit(1)
