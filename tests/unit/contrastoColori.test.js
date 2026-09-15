// I colori si devono leggere.
//
// Il punteggio di accessibilità del progetto era fermo a 60 con la nota «WCAG
// mai validato per davvero», e il motivo era preciso: i test di accessibilità
// girano in happy-dom, che **non disegna niente**. axe salta il controllo del
// contrasto, e nessuno se n'era accorto.
//
// Misurato in Chromium vero il 15/09/2026 (`scripts/audit-contrasto.mjs`):
// **467 scritte** sotto la soglia di leggibilità su 32 pagine. E non era il
// colore in sé, era il fondo: #64748B fa 4.6 su bianco puro, ma le pagine di
// Foodos sono panna, e lì scendeva a 4.31.
//
// Non è un cavillo da spuntare. Chi usa Foodos ha spesso sessant'anni, lavora
// sotto i neon di un laboratorio e guarda il telefono con le mani infarinate.
//
// Questi test non rendono niente: calcolano il rapporto di contrasto sui
// token, che è la cosa che si può verificare senza un browser. La misura
// completa sulle pagine vere resta `scripts/audit-contrasto.mjs`.

import { describe, it, expect } from 'vitest'
import { color as T } from '../../src/lib/theme'

// Il calcolo standard (WCAG 2.1): luminanza relativa, poi rapporto.
function luminanza(hex) {
  const c = hex.replace('#', '')
  const v = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255)
    .map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
}
function rapporto(a, b) {
  const [alto, basso] = [luminanza(a), luminanza(b)].sort((x, y) => y - x)
  return (alto + 0.05) / (basso + 0.05)
}

// I fondi veri dell'applicazione, misurati sulle pagine rese. Non c'è bianco
// puro da nessuna parte: è esattamente il motivo per cui la verifica fatta
// su bianco diceva che andava tutto bene.
const FONDI = {
  pagina:   '#FAF7F2',
  tessera:  '#FDFAF7',
  tabella:  '#F8F4F2',
  riquadro: '#F1F4F8',
  bianco:   '#FFFFFF',
}
const SOGLIA = 4.5   // WCAG AA per il testo normale

describe('il calcolo del contrasto', () => {
  it('nero su bianco fa 21, bianco su bianco fa 1', () => {
    expect(rapporto('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
    expect(rapporto('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 2)
  })

  it('è simmetrico', () => {
    expect(rapporto('#5A6B80', '#FAF7F2')).toBeCloseTo(rapporto('#FAF7F2', '#5A6B80'), 6)
  })
})

describe('i colori del testo si leggono su tutti i fondi dell\'app', () => {
  const testi = [
    ['text',     T.text],
    ['textMid',  T.textMid],
    ['textSoft', T.textSoft],
  ]

  it.each(testi)('%s sta sopra 4.5 su ogni fondo', (nome, colore) => {
    for (const [dove, fondo] of Object.entries(FONDI)) {
      const r = rapporto(colore, fondo)
      expect(r, `${nome} (${colore}) su ${dove} (${fondo}): ${r.toFixed(2)}`).toBeGreaterThanOrEqual(SOGLIA)
    }
  })

  it('textSoft non torna a #64748B: su panna faceva 4.31', () => {
    // La regressione esatta: il valore era stato scelto misurandolo su bianco
    // puro, dove fa 4.6. Ma bianco puro nell'app non c'è.
    expect(T.textSoft).not.toBe('#64748B')
    expect(rapporto('#64748B', FONDI.riquadro)).toBeLessThan(SOGLIA)
  })

  it('textFaint resta sotto soglia, ed è voluto: è solo per i metadati', () => {
    // Non è un difetto: è la dichiarazione che quel colore NON va usato per
    // il testo che conta. Se un giorno passasse la soglia, tanto meglio; se
    // qualcuno lo usa per una scritta importante, è quello il difetto.
    expect(rapporto(T.textFaint, FONDI.bianco)).toBeLessThan(SOGLIA)
  })
})

describe('i colori che dicono qualcosa si leggono', () => {
  // Verde, ambra e rosso non sono decorazione: sono «il margine è buono»,
  // «questa fattura scade», «questa giacenza è sotto zero». Sono le scritte
  // che si leggono di sfuggita, di corsa, in laboratorio.
  const semantici = [
    ['green',    T.green,     [FONDI.bianco, FONDI.pagina, FONDI.tessera, T.greenLight]],
    ['amber',    T.amber,     [FONDI.bianco, FONDI.pagina, FONDI.tessera, T.amberLight]],
    ['amberDark', T.amberDark, [T.amberLight, FONDI.bianco, FONDI.pagina]],
    ['redDark',  T.redDark,   [T.redLight, FONDI.bianco, FONDI.pagina]],
    ['brand',    T.brand,     [FONDI.bianco, FONDI.pagina, FONDI.tessera]],
  ]

  it.each(semantici)('%s si legge sui suoi fondi', (nome, colore, fondi) => {
    for (const f of fondi) {
      const r = rapporto(colore, f)
      expect(r, `${nome} (${colore}) su ${f}: ${r.toFixed(2)}`).toBeGreaterThanOrEqual(SOGLIA)
    }
  })

  it('il rosso segnale resta #DC2626: è una scelta del titolare, non un caso', () => {
    // Il 14/09/2026 il titolare ha deciso i due rossi: il bordeaux è delle
    // azioni, questo è degli allarmi. Non si cambia per far passare un test.
    expect(T.red).toBe('#DC2626')
  })

  it('e per il testo sopra il rosso chiaro c\'è una variante scura', () => {
    // #DC2626 su #FEF2F2 fa 4.41: appena sotto. «Un ingrediente è finito» e
    // «~ 3,00 kg» nel magazzino erano fra le scritte meno leggibili di tutto
    // il programma, ed è la pagina dove si guarda di corsa.
    expect(rapporto(T.red, T.redLight)).toBeLessThan(SOGLIA)
    expect(rapporto(T.redDark, T.redLight)).toBeGreaterThanOrEqual(SOGLIA)
  })

  it('le varianti scure sono più scure, non solo diverse', () => {
    expect(luminanza(T.redDark)).toBeLessThan(luminanza(T.red))
    expect(luminanza(T.amberDark)).toBeLessThan(luminanza(T.amber))
  })

  it('e restano lo stesso colore: la tinta non cambia', () => {
    // Una variante scura che vira di tinta non è una variante, è un altro
    // colore: il verde deve restare verde e il rosso rosso.
    const tinta = (hex) => {
      const c = hex.replace('#', '')
      const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16))
      const max = Math.max(r, g, b)
      return max === r ? 'rosso' : max === g ? 'verde' : 'blu'
    }
    expect(tinta(T.redDark)).toBe(tinta(T.red))
    expect(tinta(T.amberDark)).toBe(tinta(T.amber))
  })
})

describe('il testo bianco sui fondi scuri', () => {
  it('si legge sul bordeaux delle azioni e sulla barra laterale', () => {
    for (const fondo of [T.brand, T.bgSide, T.bgSideRaised]) {
      expect(rapporto('#FFFFFF', fondo), fondo).toBeGreaterThanOrEqual(SOGLIA)
    }
  })

  it('e sul verde e sul rosso pieni, dove si scrivono le percentuali', () => {
    // Le barre del conto economico: la percentuale bianca sopra la barra
    // colorata. Con il verde schiarito all'86% faceva 4.40; a piena
    // intensità fa 5.86.
    expect(rapporto('#FFFFFF', T.green)).toBeGreaterThanOrEqual(SOGLIA)
    expect(rapporto('#FFFFFF', T.red)).toBeGreaterThanOrEqual(SOGLIA)
  })
})

describe('l\'attrezzo che misura le pagine vere', () => {
  it('esiste, e gira in un browser vero', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const s = readFileSync(join(import.meta.dirname, '../../scripts/audit-contrasto.mjs'), 'utf8')
    expect(s).toMatch(/from 'playwright'/)
    expect(s).toMatch(/color-contrast/)
    // E sa dire quando NON sa misurare, invece di inventare un difetto.
    expect(s).toMatch(/nonMisurabile/)
    expect(s).toMatch(/non sono violazioni/)
  })
})
