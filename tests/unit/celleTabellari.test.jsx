// @vitest-environment happy-dom
//
// Le colonne di numeri devono restare incolonnate.
//
// Senza cifre tabellari "1.111" e "8.888" occupano larghezze diverse, e una
// colonna di importi balla da una riga all'altra. Il 14/09/2026 erano 65 le
// celle senza — e nella stessa tabella capitava che i ricavi fossero
// incolonnati e le percentuali no, perché le cifre tabellari si mettevano solo
// a mano, cella per cella.

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { TD, TNUM } from '../../src/views/_shared.jsx'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('la cella condivisa', () => {
  it('ha sempre le cifre tabellari, non solo quando glielo si chiede', () => {
    // Prima le metteva solo con la proprietà `mono`: nella stessa tabella
    // alcune colonne erano incolonnate e altre no.
    const { container } = render(<table><tbody><tr><TD right>1.234,56 €</TD></tr></tbody></table>)
    const td = container.querySelector('td')
    expect(td.style.fontVariantNumeric).toBe('tabular-nums')
  })

  it('le cifre tabellari non fanno danno al testo', () => {
    const { container } = render(<table><tbody><tr><TD>Crostata di frutta</TD></tr></tbody></table>)
    expect(container.textContent).toBe('Crostata di frutta')
  })

  it('TNUM dice la stessa cosa in entrambi i modi', () => {
    expect(TNUM.fontVariantNumeric).toBe('tabular-nums')
    expect(TNUM.fontFeatureSettings).toContain('tnum')
  })
})

function file(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) { if (n !== 'node_modules') file(p, out) }
    else if (/\.jsx$/.test(n)) out.push(p)
  }
  return out
}

describe('le celle scritte a mano nelle viste', () => {
  // ── Prova di controllo sul righello (audit 16/09/2026) ────────────────
  // Un censimento che dice «nessun colpevole» va bene solo se ha davvero
  // guardato dentro il progetto. Se il cammino sbaglia, l'elenco di partenza
  // è vuoto, il censimento resta verde e non protegge più niente: è successo
  // con `views-render-smoke`, lo stesso giorno.
  it('il setaccio guarda davvero dentro il progetto', () => {
    expect(file(join(RADICE, 'src')).length).toBeGreaterThan(100)
  })

  it('quelle che contengono numeri hanno le cifre tabellari', () => {
    const colpevoli = []
    for (const p of file(join(RADICE, 'src'))) {
      const s = readFileSync(p, 'utf8')
      // Il taglio del tag va fatto contando le graffe: dentro lo stile ci
      // sono confronti come `r.rv > 0`, e fermarsi al primo `>` taglierebbe
      // l'attributo a metà facendo gridare al lupo.
      let i = 0
      for (;;) {
        const apre = s.indexOf('<td', i)
        if (apre === -1) break
        let j = apre + 3, prof = 0, autochiuso = false
        while (j < s.length) {
          const c = s[j]
          if (c === '{') prof++
          else if (c === '}') prof--
          else if (c === '>' && prof === 0) { autochiuso = s[j - 1] === '/'; break }
          j++
        }
        const attr = s.slice(apre + 3, j)
        const fine = s.indexOf('</td>', j)
        const corpo = autochiuso || fine === -1 ? '' : s.slice(j + 1, fine)
        i = j + 1
        const numerica = /toLocaleString|fmt0?\(|fmtp0?\(|fmtG\(|fmtGauto\(|fmtEur|\bfmt\(|\bpct\(|eur0?\(/.test(corpo)
        if (!numerica) continue
        if (/TNUM|tnum|tabular|mono/i.test(attr)) continue
        // Lo stile può arrivare da una variabile o da una funzione condivisa
        // (`style={cellNum}`, `style={td()}`): allora si guarda là dentro.
        const rif = attr.match(/style=\{([A-Za-z_$][\w$]*)(\(\))?\}/)
        if (rif) {
          const nome = rif[1]
          const def = new RegExp(`(const|let|var|function)\\s+${nome}\\b[\\s\\S]{0,400}`).exec(s)
          if (def && /TNUM|tabular/.test(def[0])) continue
        }
        colpevoli.push(`${relative(RADICE, p)}:${s.slice(0, apre).split('\n').length}`)
      }
    }
    expect(colpevoli).toEqual([])
  })
})
