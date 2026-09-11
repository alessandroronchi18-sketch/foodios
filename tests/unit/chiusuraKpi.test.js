// Totali della chiusura di cassa.
//
// Sono i numeri che finiscono nel conto economico: ricavo, food cost, margine.
// Finché stavano dentro ChiusuraView.jsx, in mezzo a 1.400 righe di interfaccia,
// non avevano un solo test.

import { describe, it, expect } from 'vitest'
import { calcolaKpiChiusura, colorePerSellThrough } from '../../src/lib/chiusuraKpi'

const PALETTE = { green: 'verde', amber: 'ambra', red: 'rosso' }

describe('somma delle tre sorgenti', () => {
  it('mette insieme righe riconosciute e formati generici', () => {
    const k = calcolaKpiChiusura(
      [{ rv: 100, fcV: 30, spreco: 0, st: 90 }],
      [{ rv: 50, fcV: 20 }],
      {})
    expect(k.totV).toBe(150)
    expect(k.totFC).toBe(50)
    expect(k.totM).toBe(100)
  })

  it('sprechi e omaggi entrano nel food cost ma non nei ricavi', () => {
    const k = calcolaKpiChiusura(
      [{ rv: 100, fcV: 30, spreco: 0, st: 90 }],
      [],
      { eurSpreco: 10, eurOmaggio: 5 })
    expect(k.totV).toBe(100)          // il ricavo non cambia
    expect(k.totFC).toBe(45)          // 30 + 10 + 5
    expect(k.totM).toBe(55)
  })

  it('ignorare sprechi e omaggi gonfierebbe il margine: verifichiamo la differenza', () => {
    const senza = calcolaKpiChiusura([{ rv: 100, fcV: 30, spreco: 0, st: 90 }], [], {})
    const con   = calcolaKpiChiusura([{ rv: 100, fcV: 30, spreco: 0, st: 90 }], [], { eurSpreco: 20 })
    expect(senza.totM).toBeGreaterThan(con.totM)
  })
})

describe('percentuale di margine', () => {
  it('è margine su ricavo, in percentuale', () => {
    const k = calcolaKpiChiusura([{ rv: 200, fcV: 50, spreco: 0, st: null }], [], {})
    expect(k.totMP).toBeCloseTo(75, 5)
  })

  it('con ricavo zero non produce una divisione per zero', () => {
    const k = calcolaKpiChiusura([], [], {})
    expect(k.totMP).toBe(0)
    expect(Number.isFinite(k.totMP)).toBe(true)
  })

  it('un margine negativo resta negativo, non viene nascosto', () => {
    const k = calcolaKpiChiusura([{ rv: 50, fcV: 80, spreco: 0, st: null }], [], {})
    expect(k.totM).toBe(-30)
    expect(k.totMP).toBeLessThan(0)
  })
})

describe('sell-through medio', () => {
  it('media solo le righe che ce l\'hanno', () => {
    const k = calcolaKpiChiusura([
      { rv: 10, fcV: 1, spreco: 0, st: 80 },
      { rv: 10, fcV: 1, spreco: 0, st: 100 },
    ], [], {})
    expect(k.avgST).toBe(90)
  })

  it('un prodotto venduto ma mai prodotto non abbassa la media', () => {
    // st null = non c'è produzione con cui confrontarlo. Contarlo come zero
    // farebbe crollare la media senza che sia successo nulla di male.
    const k = calcolaKpiChiusura([
      { rv: 10, fcV: 1, spreco: 0, st: 80 },
      { rv: 10, fcV: 1, spreco: 0, st: null },
    ], [], {})
    expect(k.avgST).toBe(80)
  })

  it('senza righe da confrontare il sell-through è NULL, non zero', () => {
    // Prima tornava 0, e un mese senza confronto fra prodotto e venduto
    // mostrava "Sell-through 0,0%" con la tessera ROSSA: sembrava che non si
    // fosse venduto niente, mentre voleva dire che non c'era niente da
    // confrontare. È il difetto ricorrente "dato mancante → zero → verdetto".
    const k = calcolaKpiChiusura([{ rv: 10, fcV: 1, spreco: 0, st: null }], [], {})
    expect(k.avgST).toBeNull()
  })

  it('pesa sui PEZZI quando ci sono, non sulle percentuali', () => {
    // Riga da 2 pezzi prodotti smaltita al 50%, riga da 500 pezzi al 100%.
    // La media non pesata darebbe 75%. Il sell-through vero è
    // (1 + 500) / (2 + 500) = 99,8%.
    const k = calcolaKpiChiusura([
      { rv: 10, fcV: 1, spreco: 0, st: 50,  unitaP: 2,   unitaV: 1 },
      { rv: 10, fcV: 1, spreco: 0, st: 100, unitaP: 500, unitaV: 500 },
    ], [], {})
    expect(k.avgST).toBeCloseTo(99.8, 1)
    expect(k.pezziProdotti).toBe(502)
    expect(k.pezziVenduti).toBe(501)
  })

  it('senza il dettaglio dei pezzi ricade sulla media (chiusure vecchie)', () => {
    const k = calcolaKpiChiusura([
      { rv: 10, fcV: 1, spreco: 0, st: 80 },
      { rv: 10, fcV: 1, spreco: 0, st: 100 },
    ], [], {})
    expect(k.avgST).toBe(90)
  })
})

describe('robustezza sugli ingressi', () => {
  it('regge liste assenti', () => {
    const k = calcolaKpiChiusura(undefined, undefined, undefined)
    expect(k.totV).toBe(0)
    expect(k.totFC).toBe(0)
  })

  it('valori non numerici valgono zero invece di produrre NaN', () => {
    const k = calcolaKpiChiusura([{ rv: 'abc', fcV: null, spreco: undefined, st: 50 }], [], {})
    expect(Number.isFinite(k.totV)).toBe(true)
    expect(k.totV).toBe(0)
  })
})

describe('semaforo sul sell-through', () => {
  it.each([[95, 'verde'], [85, 'verde'], [70, 'ambra'], [65, 'ambra'], [40, 'rosso'], [0, 'rosso']])(
    'sell-through %i → %s', (st, atteso) => {
      expect(colorePerSellThrough(st, PALETTE)).toBe(atteso)
    })
})
