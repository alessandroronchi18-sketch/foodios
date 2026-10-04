// ── Niente caratteri invisibili nel codice ────────────────────────────────
//
// 03/10/2026 (fase 1 della Produzione, 4a0b030): lo strumento di scrittura
// aveva messo nella regex degli accenti di nomiGusti i caratteri veri
// U+0300…U+036F invece di `\u0300-\u036f`. La regex funziona uguale, ma a
// occhio è `/[-]/`: chi la legge non sa cosa fa, chi la ricopia la rompe.
//
// 04/10/2026: la stessa scrittura stava in altri otto file
// (contoEconomico.js due volte, destinazioneSede, riconciliazioneBanca,
// allergeni, righeBolla, prezziDaFatture, righeDiTotale, sepa) e due CSV
// cominciavano con un BOM vero dentro le virgolette (AdminPage,
// ExportContabilita). Riscritti tutti con l'escape. Questa prova li tiene
// fuori: segni diacritici combinanti, spazi e giunzioni di larghezza zero,
// BOM, trattino morbido.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// L'espressione si costruisce dai codici: scritta con le sequenze di escape,
// lo strumento che ha generato questo file le aveva già trasformate nei
// caratteri veri (la stessa trappola del 03/10).
const INTERVALLI = [[0x0300, 0x036f], [0x200b, 0x200f], [0x2028, 0x2029], [0x2060, 0x2060], [0xfeff, 0xfeff], [0x00ad, 0x00ad]]
const INVISIBILI = new RegExp(`[${INTERVALLI.map(([a, b]) => (a === b ? String.fromCodePoint(a) : `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`)).join('')}]`)
const ACCENTI = new RegExp(`[${String.fromCodePoint(0x0300)}-${String.fromCodePoint(0x036f)}]`, 'g')
const RADICI = ['src', 'api']

function* file(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) yield* file(p)
    else if (/\.(jsx?|mjs)$/.test(n)) yield p
  }
}

describe('Il codice non contiene caratteri che non si vedono', () => {
  it('nessuno, in nessun file di src/ e api/', () => {
    const trovati = []
    for (const r of RADICI) {
      for (const p of file(join(process.cwd(), r))) {
        readFileSync(p, 'utf8').split('\n').forEach((riga, i) => {
          const m = INVISIBILI.exec(riga)
          if (m) trovati.push(`${p.replace(process.cwd() + '/', '')}:${i + 1} U+${m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
        })
      }
    }
    expect(trovati, 'scrivi il carattere con l\'escape (\\u0300, \\ufeff), non il carattere vero').toEqual([])
  })
  it('l\'intervallo degli accenti toglie davvero gli accenti', () => {
    expect('perché città'.normalize('NFD').replace(ACCENTI, '')).toBe('perche citta')
  })
})
