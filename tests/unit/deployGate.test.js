// Il controllo prima del push deve poter dire di no.
//
// Il 14/09/2026 due push sono passati dal gate con il build rotto: su Vercel il
// deploy è fallito in quattro secondi, due volte, e la produzione è rimasta
// ferma tre commit indietro senza nessun segnale. Il push diceva "ok", il
// deploy moriva in silenzio, e l'unico modo di accorgersene era che il sito non
// cambiava.
//
// Il motivo era una riga:
//
//     if ! npm run build --silent 2>&1 | tail -5; then
//
// In una pipeline conta l'uscita dell'ULTIMO comando, e `tail` riesce sempre.
// Il controllo esisteva dal 7 set e non aveva mai bloccato niente.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MODELLO = join(RADICE, 'scripts', 'install-hooks.sh')
const INSTALLATO = join(RADICE, '.git', 'hooks', 'pre-push')

describe('il gate prima del push', () => {
  it('fa contare l\'esito del build, non quello di `tail`', () => {
    const s = readFileSync(MODELLO, 'utf8')
    const buildLine = s.indexOf('npm run build --silent')
    expect(buildLine).toBeGreaterThan(-1)
    // `pipefail` deve venire PRIMA della riga del build.
    const pipefail = s.indexOf('set -o pipefail')
    expect(pipefail).toBeGreaterThan(-1)
    expect(pipefail).toBeLessThan(buildLine)
  })

  it('controlla lint, test e build, in quest\'ordine', () => {
    const s = readFileSync(MODELLO, 'utf8')
    expect(s.indexOf('eslint')).toBeLessThan(s.indexOf('npm test'))
    expect(s.indexOf('npm test')).toBeLessThan(s.indexOf('npm run build'))
  })

  it('il hook installato su questa macchina è aggiornato', () => {
    if (!existsSync(INSTALLATO)) return // su CI il hook non c'è: non è un errore
    expect(readFileSync(INSTALLATO, 'utf8')).toContain('set -o pipefail')
  })
})

describe('dopo il push si verifica che il deploy sia andato', () => {
  it('`npm run push` fa il push E poi la verifica', () => {
    const pkg = JSON.parse(readFileSync(join(RADICE, 'package.json'), 'utf8'))
    expect(pkg.scripts.push).toContain('git push')
    expect(pkg.scripts.push).toContain('verifica-deploy')
  })

  it('la verifica confronta il commit locale con quello servito dal sito', () => {
    const s = readFileSync(join(RADICE, 'scripts', 'verifica-deploy.mjs'), 'utf8')
    expect(s).toContain('git rev-parse --short HEAD')
    expect(s).toMatch(/CACHE_VERSION/)
    // E se non arriva, deve uscire male: altrimenti non serve a niente.
    expect(s).toContain('process.exit(1)')
    // Dicendo cosa guardare.
    expect(s).toContain('vercel inspect --logs')
  })

  it('il numero di versione servito dal sito lo scrive il prebuild', () => {
    const pkg = JSON.parse(readFileSync(join(RADICE, 'package.json'), 'utf8'))
    expect(pkg.scripts.prebuild).toContain('bump-sw-cache')
    const bump = readFileSync(join(RADICE, 'scripts', 'bump-sw-cache.mjs'), 'utf8')
    expect(bump).toMatch(/CACHE_VERSION/)
  })
})
