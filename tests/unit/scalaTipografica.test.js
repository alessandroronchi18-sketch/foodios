// Una scala tipografica sola, per tutto il tool.
//
// Il 14/09/2026 le misure di carattere scritte a mano nel codice erano 2.924,
// su 27 valori diversi: 12, 12.5, 13, 13.5, 14, 14.5, 15, 16, 17, 18, 19, 20…
// Mezzo pixel di differenza non si vede su una riga; si vede quando due
// riquadri affiancati hanno etichette da 12 e da 12,5 e le parole non partono
// dalla stessa altezza. È il motivo per cui una pagina sembra "storta" senza
// che si riesca a dire perché.
//
// La scala di riferimento è quella di `lib/theme.js`.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// I gradini ammessi a schermo. Sotto i 12 non si scende: è la soglia di
// leggibilità che questo progetto si è dato.
const SCALA = new Set([12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32])

// Fuori dal conto, con motivo:
const ESENTI = [
  'src/lib/exportPDF.js',   // punti tipografici di jsPDF, non pixel a schermo
  'src/components/Haccp.jsx', // idem: stili delle tabelle PDF
  'src/pages/TvDashboard.jsx', // schermo da muro: la scala è un'altra
  'src/pages/LandingPage.jsx', // pagina di presentazione: scala editoriale
]

function file(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) { if (n !== 'node_modules') file(p, out) }
    else if (/\.(js|jsx)$/.test(n)) out.push(p)
  }
  return out
}

describe('scala tipografica', () => {
  it('nessuna misura di carattere fuori scala', () => {
    const fuori = []
    for (const p of file(join(RADICE, 'src'))) {
      const rel = relative(RADICE, p).replace(/\\/g, '/')
      if (ESENTI.includes(rel)) continue
      readFileSync(p, 'utf8').split('\n').forEach((riga, i) => {
        for (const m of riga.matchAll(/fontSize: *([0-9]+(?:\.[0-9]+)?)/g)) {
          const v = Number(m[1])
          if (!SCALA.has(v)) fuori.push(`${rel}:${i + 1} → ${v}px`)
        }
      })
    }
    expect(fuori).toEqual([])
  })

  it('la scala del tema e quella ammessa qui dicono la stessa cosa', async () => {
    const { typo } = await import('../../src/lib/theme.js')
    for (const [nome, preset] of Object.entries(typo)) {
      if (typeof preset?.fontSize === 'number') {
        expect(SCALA.has(preset.fontSize), `typo.${nome} = ${preset.fontSize}px`).toBe(true)
      }
    }
  })
})
