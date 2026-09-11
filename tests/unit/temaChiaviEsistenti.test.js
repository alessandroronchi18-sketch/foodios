// Nessun componente deve leggere una chiave del tema che non esiste.
//
// Perché questo test esiste, e non è teoria. Il 10/09/2026, durante un giro di
// correzioni sul layout, 70 punti in cinque file sono stati scritti come
// `typo.size.sm` — ma `size` non sta in `typo`, sta in `font`. In JavaScript
// `typo.size` è undefined, e `undefined.sm` NON è un valore sbagliato: è
// un'eccezione. Ogni riga di quelle, appena renderizzata, faceva cadere il suo
// pezzo di pagina (Scadenzario 48 punti, Ordini AI 11, cashflow 5, conto
// economico 4, inventario 2).
//
// Nessun test lo aveva preso: gli smoke test renderizzano i componenti con
// prop minime, e quei rami non venivano mai raggiunti. Il gate del design
// controllava che le dimensioni NON fossero scritte a mano, e quelle infatti
// non lo erano — erano scritte a mano male.
//
// Questo controllo guarda il codice sorgente, non il rendering: è l'unico modo
// di prendere una riga che non viene mai eseguita in test.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as tema from '../../src/lib/theme'

function tuttiIFile(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) tuttiIFile(p, acc)
    else if (/\.(js|jsx)$/.test(nome)) acc.push(p)
  }
  return acc
}

// Oggetti esportati dal tema che vengono usati come `X.chiave` nei componenti.
const ESPORTATI = ['color', 'radius', 'shadow', 'motion', 'space', 'font', 'typo', 'tnum']

describe('chiavi del tema usate nel codice', () => {
  const file = tuttiIFile('src')

  it('ogni accesso a una chiave del tema esiste davvero', () => {
    const mancanti = []
    for (const p of file) {
      const src = readFileSync(p, 'utf-8')
      // Come è importato il tema in questo file: `color as T` → T = color.
      const imp = /import \{([^}]*)\} from ['"][^'"]*lib\/theme['"]/.exec(src)
      if (!imp) continue
      const alias = {}
      for (const pezzo of imp[1].split(',')) {
        const m = /^\s*([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(pezzo)
        if (!m) continue
        const [, nome, as] = m
        if (ESPORTATI.includes(nome)) alias[as || nome] = nome
      }
      for (const [locale, vero] of Object.entries(alias)) {
        const oggetto = tema[vero]
        if (!oggetto || typeof oggetto !== 'object') continue
        const re = new RegExp(`\\b${locale}\\.([A-Za-z_$][\\w$]*)`, 'g')
        let m
        while ((m = re.exec(src)) !== null) {
          const chiave = m[1]
          if (!(chiave in oggetto)) {
            mancanti.push(`${p}: ${locale}.${chiave} (${vero}.${chiave} non esiste)`)
          }
        }
      }
    }
    // Messaggio esplicito: chi rompe deve capire subito cosa ha rotto.
    expect(mancanti, `Chiavi del tema inesistenti:\n  - ${mancanti.join('\n  - ')}`).toEqual([])
  })

  it('il tema ha davvero le chiavi che diamo per scontate', () => {
    expect(tema.font.size.sm).toBe(12)
    expect(tema.typo.small.fontSize).toBe(12)
    // `typo.size` NON esiste: è `font.size`. Se un giorno lo si aggiunge, il
    // commento sopra va riscritto, non questo controllo tolto.
    expect(tema.typo.size).toBeUndefined()
  })
})
