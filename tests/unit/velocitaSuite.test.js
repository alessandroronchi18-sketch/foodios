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
// Solo le righe vive: i commenti del file spiegano il difetto e contengono per
// forza le forme vecchie.
const VIVE = CFG.split('\n').filter(r => !r.trim().startsWith('//')).join('\n')
const PKG = JSON.parse(readFileSync(join(RADICE, 'package.json'), 'utf8'))

describe('la configurazione dei test', () => {
  it('non forza più il thread singolo nella suite normale', () => {
    expect(VIVE).not.toMatch(/singleThread/)
  })

  it('usa la forma di configurazione che Vitest legge davvero', () => {
    // Due sintassi vecchie in fila: `threads: { singleThread }` era di
    // Vitest 1, `poolOptions` è stato rimosso nella 4. Tutte e due danno un
    // avviso e vengono IGNORATE — cioè la riga sembra decidere qualcosa e non
    // decide niente, che è lo stesso problema che doveva risolvere.
    expect(VIVE).not.toMatch(/poolOptions/)
    expect(VIVE).toMatch(/fileParallelism: !process\.env\.VITEST_COVERAGE/)
  })

  it('e il vincolo resta acceso dove serviva: nel calcolo della copertura', () => {
    expect(PKG.scripts['test:coverage']).toMatch(/VITEST_COVERAGE=1/)
  })
})
