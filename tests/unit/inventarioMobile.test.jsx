// @vitest-environment happy-dom
//
// L'inventario settimanale su telefono non deve scorrere di lato.
//
// Trovato il 14/09/2026 fotografando le pagine a 420px: sforava di 124px. I due
// campi PROD e RIMAN stanno in una griglia a due colonne, e senza `minWidth: 0`
// una colonna si allarga fino al contenuto più lungo invece di stare dentro la
// sua metà. È il difetto classico delle griglie CSS: non si vede leggendo il
// codice, si vede solo guardando la pagina alla larghezza giusta.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = readFileSync(join(RADICE, 'src', 'views', 'InventarioSettimanaleView.jsx'), 'utf8')

describe('inventario settimanale su telefono', () => {
  it('il campo grande non si allarga oltre la sua colonna', () => {
    const campo = SRC.slice(SRC.indexOf('function BigField'), SRC.indexOf('function BigField') + 3000)
    expect(campo).toMatch(/minWidth: 0/)
  })

  it('la griglia dei due campi dichiara colonne che possono restringersi', () => {
    // `1fr` da solo non scende sotto il contenuto: ci vuole `minmax(0,1fr)`.
    expect(SRC).toMatch(/gridTemplateColumns: 'minmax\(0,1fr\) minmax\(0,1fr\)'/)
  })

  it('le tabelle larghe scorrono da sole, senza trascinarsi la pagina', () => {
    // La tabella dell'inventario è larga per forza (7 giorni × 2 colonne): deve
    // stare dentro un contenitore che scorre, non far scorrere tutto.
    const conScroll = (SRC.match(/overflowX: 'auto'/g) || []).length
    expect(conScroll).toBeGreaterThan(0)
  })
})
