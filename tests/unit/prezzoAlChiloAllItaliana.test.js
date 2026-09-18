// ── Il prezzo al chilo si scrive all'italiana ─────────────────────────────
//
// `prezzoKgIT` è nata il 18/09/2026 per correggere un difetto vero: i
// messaggi del cambio prezzo scrivevano «€1234.50/kg» — il simbolo davanti
// alla cifra e il punto decimale all'inglese, cioè due regole del progetto
// rotte nella stessa riga.
//
// Un audit dello stesso giorno ha però trovato che la funzione non aveva
// nessun test, da nessuna parte. È il caso più economico da chiudere: una
// funzione pura, quattro righe, usata in ogni messaggio che riguarda i prezzi.
import { describe, it, expect } from 'vitest'
import { prezzoKgIT } from '../../src/Dashboard.jsx'

describe('Il simbolo € sta DOPO la cifra', () => {
  it('un prezzo normale', () => {
    expect(prezzoKgIT(8.5)).toBe('8,50 €/kg')
  })

  it('e non scrive mai l’euro davanti', () => {
    for (const v of [0.5, 8.5, 1234.5, 99999]) {
      expect(prezzoKgIT(v), `${v} scrive l'euro davanti`).not.toMatch(/^€/)
    }
  })
})

describe('Le migliaia hanno il punto, i decimali la virgola', () => {
  it('mille e più', () => {
    expect(prezzoKgIT(1234.5)).toBe('1.234,50 €/kg')
  })

  it('sempre due decimali, anche quando sono zero', () => {
    expect(prezzoKgIT(3)).toBe('3,00 €/kg')
  })

  it('arrotonda al centesimo', () => {
    expect(prezzoKgIT(1.005)).toMatch(/^1,0[01] €\/kg$/)
  })
})

describe('Quello che non è un numero non diventa zero', () => {
  it('zero è un prezzo e si scrive', () => {
    // Zero dichiarato esiste: l'omaggio del fornitore, la materia prima
    // dell'orto. È diverso da «non lo so».
    expect(prezzoKgIT(0)).toBe('0,00 €/kg')
  })

  it('null e undefined non si spacciano per zero euro', () => {
    for (const v of [null, undefined, NaN, '']) {
      const out = prezzoKgIT(v)
      expect(out, `${String(v)} è diventato un prezzo`).not.toMatch(/^0,00 €/)
    }
  })
})
