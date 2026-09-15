// La suite deve girare in parallelo.
//
// Fino al 15/09/2026 c'era `threads: { singleThread: true }`, messo per evitare
// una corsa sulla cartella temporanea del calcolo della COPERTURA su macOS. Ma
// la copertura si calcola solo con `npm run test:coverage`: nella suite normale
// quel vincolo non serviva, e teneva 2.531 test in fila su un core solo mentre
// gli altri tre stavano fermi. Tre minuti a ogni rilascio.
//
// In più la sintassi era quella di Vitest 1.x — dalla 2 in poi si scrive sotto
// `poolOptions` — quindi quella riga non faceva nemmeno quello che diceva.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CFG = readFileSync(join(RADICE, 'vitest.config.js'), 'utf8')
const PKG = JSON.parse(readFileSync(join(RADICE, 'package.json'), 'utf8'))

describe('la configurazione dei test', () => {
  it('non forza più il thread singolo nella suite normale', () => {
    // Solo le righe vive: il commento nel file mostra apposta la forma vecchia.
    const vive = CFG.split('\n').filter(r => !r.trim().startsWith('//')).join('\n')
    expect(vive).not.toMatch(/threads: \{ singleThread: true \}/)
    expect(CFG).toMatch(/singleThread: !!process\.env\.VITEST_COVERAGE/)
  })

  it('usa la forma di configurazione che Vitest legge davvero', () => {
    // `threads: {...}` al primo livello è la sintassi vecchia e viene ignorata.
    expect(CFG).toMatch(/poolOptions:\s*\{\s*\n\s*threads:/)
  })

  it('e il vincolo resta acceso dove serviva: nel calcolo della copertura', () => {
    expect(PKG.scripts['test:coverage']).toMatch(/VITEST_COVERAGE=1/)
  })
})
