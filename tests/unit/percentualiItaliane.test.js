// Le percentuali si scrivono con la virgola, e in un posto solo.
//
// Il 14/09/2026 erano 124 i formattatori di percentuale riscritti a mano in 30
// file, tutti con `toFixed(1)`, che usa SEMPRE il punto. Nella stessa schermata
// si leggeva "418,30 €" di incasso e "71.0%" di margine; nella stessa email
// "1.477 €" di ricavi e "34.2%" di food cost.
//
// La ragione per cui erano stati riscritti a mano non era pigrizia: gli helper
// stavano in `views/_shared.jsx`, che e' un modulo React, e le funzioni in
// `api/` non potevano importarlo. Ora stanno in `lib/formatIt.js`, che non ha
// JSX, e lo importano tutti e due.
//
// Questo test esiste perche' basta una riga nuova per ricominciare.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { fmt, fmt0, fmtp, fmtp0, fmtpSegno, fmtp0Segno } from '../../src/lib/formatIt.js'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// L'unica eccezione ammessa: dentro il CSS la percentuale e' una misura, non un
// numero da leggere, e il punto ci vuole (`padding: 0 3.5%`). Se ne aggiungi
// una, scrivi qui perche'.
const ECCEZIONI = [
  'src/views/QuadraturaInventarioView.jsx', // padding calcolato in % dentro uno style inline
]

function file(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) { if (n !== 'node_modules') file(p, out) }
    else if (/\.(js|jsx)$/.test(n)) out.push(p)
  }
  return out
}

describe('percentuali in italiano', () => {
  it('nessun formattatore di percentuale scritto a mano', () => {
    const colpevoli = []
    for (const p of [...file(join(RADICE, 'src')), ...file(join(RADICE, 'api'))]) {
      const rel = relative(RADICE, p).replace(/\\/g, '/')
      if (ECCEZIONI.includes(rel)) continue
      const testo = readFileSync(p, 'utf8')
      testo.split('\n').forEach((riga, i) => {
        // `.toFixed(n)` seguito subito da un segno di percentuale, in qualunque
        // forma: `${x.toFixed(1)}%`, {x.toFixed(0)}%, x.toFixed(1) + '%'
        if (/\.toFixed\(\d\)\s*(\}\s*%|%|\+\s*['"`]%['"`])/.test(riga)) {
          colpevoli.push(`${rel}:${i + 1}`)
        }
      })
    }
    expect(colpevoli).toEqual([])
  })

  it('gli helper scrivono i numeri come si scrivono in italiano', () => {
    expect(fmtp(34.25)).toBe('34,3%')
    expect(fmtp(71)).toBe('71,0%')
    expect(fmtp0(33.6)).toBe('34%')
    expect(fmtpSegno(-4)).toBe('-4,0%')
    expect(fmtp0Segno(12.4)).toBe('+12%')
    expect(fmt(1234.5)).toBe('1.234,50 €')
    expect(fmt0(1234.5)).toBe('1.235 €')
  })

  it('un valore mancante non diventa "NaN%" a schermo', () => {
    // Le chiusure importate possono avere kpi parziali: prima di questa guardia
    // si leggeva "NaN%" dentro un box verde.
    expect(fmtp(undefined)).toBe('0,0%')
    expect(fmtp0(null)).toBe('0%')
    expect(fmt(NaN)).toBe('0,00 €')
  })

  it('il simbolo euro sta DOPO la cifra', () => {
    // Regola di prodotto: "1.477 €", mai "€ 1.477".
    expect(fmt0(1477).endsWith('€')).toBe(true)
    expect(fmt(0).startsWith('€')).toBe(false)
  })
})
