// ── Il riquadro che chiede conferma sta sopra tutto ───────────────────────
//
// Trovato il 19/09/2026 mentre si toglievano le finestre di Safari dai flussi
// dei clienti: `ConfirmModal` si disegnava a `z.modal + 10`, cioè 210, e nel
// prodotto ci sono trentadue contenitori più in alto — quindici a 9999, uno a
// 10001. Due dei quattro punti che si stavano correggendo erano proprio
// dentro quelle finestre.
//
// L'effetto non è cosmetico. La domanda compariva **dietro** alla finestra
// che l'aveva chiesta: chi premeva «Elimina» vedeva il pulsante spegnersi e
// non succedere niente, perché il programma stava aspettando una risposta a
// una domanda che nessuno poteva vedere.
//
// Questo è un cricchetto: chiunque aggiunga domani un contenitore più in alto
// trova questo test rosso, e non se ne accorge tre mesi dopo da un cliente.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { z } from '../../src/lib/theme'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function tuttiIFile(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) tuttiIFile(p, out)
    else if (/\.jsx?$/.test(n)) out.push(p)
  }
  return out
}

describe('il riquadro che chiede conferma', () => {
  it('il righello: trova davvero gli zIndex scritti nel prodotto', () => {
    // Se la ricerca non trova niente, il test resta verde senza aver
    // guardato. È il modo in cui i controlli statici mentono.
    const file = tuttiIFile(join(RADICE, 'src'))
    expect(file.length).toBeGreaterThan(80)
    const trovati = file.flatMap(f =>
      (readFileSync(f, 'utf8').match(/zIndex:\s*\d+/g) || []))
    expect(trovati.length).toBeGreaterThan(20)
  })

  it('sta più in alto di qualunque contenitore del prodotto', () => {
    const sopra = []
    for (const f of tuttiIFile(join(RADICE, 'src'))) {
      const rel = relative(RADICE, f)
      if (rel.endsWith('ConfirmModal.jsx') || rel.endsWith('theme.js')) continue
      for (const m of (readFileSync(f, 'utf8').match(/zIndex:\s*(\d+)/g) || [])) {
        const v = Number(m.replace(/\D/g, ''))
        if (v >= z.conferma) sopra.push(`${rel}: ${v}`)
      }
    }
    expect(sopra, 'questi contenitori coprirebbero la domanda').toEqual([])
  })

  it('e il componente usa quel livello, non uno suo', () => {
    const src = readFileSync(join(RADICE, 'src/components/ConfirmModal.jsx'), 'utf8')
    expect(src).toMatch(/zIndex:\s*Z\?\.conferma/)
  })
})
