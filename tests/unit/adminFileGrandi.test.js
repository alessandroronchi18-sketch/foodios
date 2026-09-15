// I file troppo grandi nascondono i difetti.
//
// Il 15/09/2026, in `api/admin.js` (3.035 righe) e `src/Dashboard.jsx` (3.724)
// erano nascosti i difetti peggiori del progetto:
//
//   • un editor SQL «di sola lettura» che scriveva davvero;
//   • sei comandi su trentasei che non partivano da mesi;
//   • un listino prezzi fermo a tre listini fa;
//   • otto copie a mano dello stesso elenco di menu, già divergenti.
//
// Nessuno di questi era nascosto bene: erano tutti in chiaro. Erano nascosti
// dalla dimensione del file.
//
// Questo test non impone un limite di righe a caso: impedisce che i due file
// tornino a crescere dopo essere stati sfoltiti, e verifica che i moduli
// scorporati siano davvero autonomi.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RADICE = join(import.meta.dirname, '../..')
const righe = (f) => readFileSync(join(RADICE, f), 'utf8').split('\n').length

// I due tetti sono la misura del 15/09/2026 dopo lo sfoltimento, più un po'
// di margine per lavorare. Se un file li supera non è una catastrofe: è il
// momento di scorporare, non di alzare il numero.
const TETTI = {
  'api/admin.js': 2500,
  'src/Dashboard.jsx': 3900,
}

describe('i due file più grandi non ricrescono', () => {
  it.each(Object.entries(TETTI))('%s sta sotto le %d righe', (file, tetto) => {
    const n = righe(file)
    expect(n, `${file} è a ${n} righe: è il momento di scorporare, non di alzare il tetto`).toBeLessThanOrEqual(tetto)
  })

  it('api/admin.js è sceso di almeno cinquecento righe dal 15/09/2026', () => {
    // Era 3.035. Se qualcuno rimettesse dentro i moduli scorporati, questo
    // test lo direbbe.
    expect(righe('api/admin.js')).toBeLessThan(2535)
  })
})

describe('i moduli scorporati sono autonomi', () => {
  const MODULI = readdirSync(join(RADICE, 'api/lib/admin')).filter(f => f.endsWith('.js'))

  it('ce ne sono almeno dieci', () => {
    expect(MODULI.length).toBeGreaterThanOrEqual(10)
  })

  it('nessuno di loro importa da api/admin.js', () => {
    // Sarebbe un giro: il file grande importa il modulo, e il modulo torna
    // indietro a prendersi qualcosa dal file grande.
    for (const m of MODULI) {
      const t = readFileSync(join(RADICE, 'api/lib/admin', m), 'utf8')
      expect(t, `${m} torna indietro a prendere qualcosa da admin.js`).not.toMatch(/from '\.\.\/\.\.\/admin\.js'/)
    }
  })

  it('ognuno esporta qualcosa: nessun modulo scritto e mai usato', () => {
    for (const m of MODULI) {
      const t = readFileSync(join(RADICE, 'api/lib/admin', m), 'utf8')
      expect(t.match(/^export /m), `${m} non esporta niente`).toBeTruthy()
    }
  })

  it('ognuno è usato da qualcuno', () => {
    const admin = readFileSync(join(RADICE, 'api/admin.js'), 'utf8')
    const tuttiIModuli = MODULI.map(m => readFileSync(join(RADICE, 'api/lib/admin', m), 'utf8')).join('\n')
    for (const m of MODULI) {
      const nome = m.replace('.js', '')
      const usato = admin.includes(`admin/${nome}.js`) || tuttiIModuli.includes(`./${nome}.js`)
      expect(usato, `${m} non lo importa nessuno`).toBe(true)
    }
  })

  it('ognuno spiega in cima perché esiste', () => {
    // Un file senza intestazione è un file che il prossimo non sa se può
    // toccare.
    for (const m of MODULI) {
      const prime = readFileSync(join(RADICE, 'api/lib/admin', m), 'utf8').split('\n').slice(0, 3).join('\n')
      expect(prime.trim().startsWith('//'), `${m} non ha un'intestazione`).toBe(true)
    }
  })

  it('nessuno supera le trecento righe', () => {
    for (const m of MODULI) {
      const n = righe(`api/lib/admin/${m}`)
      expect(n, `${m} è a ${n} righe: si sta riformando un file grande`).toBeLessThanOrEqual(300)
    }
  })
})
