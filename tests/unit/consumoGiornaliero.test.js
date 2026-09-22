// ── Quanto se ne consuma al giorno ──────────────────────────────────────
//
// È il numero che decide **quanto ordinare**: sbagliarlo vuol dire o restare
// senza, o riempire la cantina di merce che scade.
//
// Stava dentro `OrdiniAiView.jsx`, ed era l'ultimo pezzo del conto del
// riordino ancora chiuso in una vista. Il 22/09/2026 le due formule di
// «quanto riordino» sono state unificate perché per la stessa farina una
// diceva 18 kg e l'altra 28: portare anche questo in libreria evita che la
// terza pagina che ne ha bisogno se ne scriva una copia sua.
//
// Il difetto storico che il codice porta con sé, e che questi test tengono:
// il confronto era `new Date(c.data)` — mezzanotte UTC contro l'istante di
// adesso — e la chiusura di **oggi** non entrava nel consumo medio prima
// delle 02:00.
import { describe, it, expect } from 'vitest'
import { consumoGiornaliero, giornateContate, GIORNI_FINESTRA } from '../../src/lib/consumoGiornaliero.js'
import { todayLocal, giorniFaLocal } from '../../src/lib/dateLocal.js'

const RICETTARIO = {
  ricette: {
    FIORDILATTE: {
      nome: 'FIORDILATTE',
      ingredienti: [
        { nome: 'latte', qty1stampo: 600 },
        { nome: 'zucchero', qty1stampo: 200 },
      ],
    },
    PISTACCHIO: {
      nome: 'PISTACCHIO',
      ingredienti: [{ nome: 'pasta di pistacchio', qty1stampo: 150 }],
    },
  },
}

const chiusura = (giorno, righe) => ({ data: giorno, venduto: righe })

describe('Il consumo esce dalle vendite passate per il ricettario', () => {
  it('un prodotto venduto una volta consuma i grammi della sua ricetta', () => {
    // 600 g di latte in trenta giorni fanno 20 g al giorno.
    const c = consumoGiornaliero(
      [chiusura(todayLocal(), [{ nome: 'FIORDILATTE', unitaV: 1 }])],
      RICETTARIO,
    )
    expect(c.latte).toBeCloseTo(600 / GIORNI_FINESTRA, 6)
    expect(c.zucchero).toBeCloseTo(200 / GIORNI_FINESTRA, 6)
  })

  it('le quantità si moltiplicano, e due giorni si sommano', () => {
    const c = consumoGiornaliero([
      chiusura(todayLocal(), [{ nome: 'FIORDILATTE', unitaV: 3 }]),
      chiusura(giorniFaLocal(1), [{ nome: 'FIORDILATTE', unitaV: 2 }]),
    ], RICETTARIO)
    expect(c.latte).toBeCloseTo((600 * 5) / GIORNI_FINESTRA, 6)
  })

  it('la chiusura di OGGI entra nel conto', () => {
    // È il difetto storico: `new Date(c.data)` era mezzanotte UTC contro
    // l'istante di adesso, e la giornata di oggi restava fuori fino alle 02:00.
    const c = consumoGiornaliero([chiusura(todayLocal(), [{ nome: 'PISTACCHIO', unitaV: 4 }])], RICETTARIO)
    expect(c['pasta di pistacchio']).toBeGreaterThan(0)
  })

  it('e una chiusura più vecchia della finestra resta fuori', () => {
    const c = consumoGiornaliero([chiusura(giorniFaLocal(90), [{ nome: 'FIORDILATTE', unitaV: 10 }])], RICETTARIO)
    expect(c.latte).toBeUndefined()
  })

  it('una data nel futuro non entra', () => {
    const domani = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    const c = consumoGiornaliero([chiusura(domani, [{ nome: 'FIORDILATTE', unitaV: 10 }])], RICETTARIO)
    expect(c.latte).toBeUndefined()
  })
})

describe('Le forme diverse in cui le chiusure tengono le righe', () => {
  it('«venduto», «confronto», «prodotti» e «righe» funzionano tutte', () => {
    for (const campo of ['venduto', 'confronto', 'prodotti', 'righe']) {
      const c = consumoGiornaliero([{ data: todayLocal(), [campo]: [{ nome: 'FIORDILATTE', unitaV: 1 }] }], RICETTARIO)
      expect(c.latte, campo).toBeCloseTo(600 / GIORNI_FINESTRA, 6)
    }
  })

  it('e i nomi delle quantità: unitaV, venduto, qta, pezzi', () => {
    for (const campo of ['unitaV', 'venduto', 'qta', 'pezzi']) {
      const c = consumoGiornaliero([chiusura(todayLocal(), [{ nome: 'FIORDILATTE', [campo]: 2 }])], RICETTARIO)
      expect(c.latte, campo).toBeCloseTo(1200 / GIORNI_FINESTRA, 6)
    }
  })

  it('il nome si riconosce anche se scritto in un altro modo', () => {
    const c = consumoGiornaliero([chiusura(todayLocal(), [{ prodotto: '  fiordilatte  ', unitaV: 1 }])], RICETTARIO)
    expect(c.latte).toBeCloseTo(600 / GIORNI_FINESTRA, 6)
  })

  it('un prodotto che non è nel ricettario non consuma niente, e non fa cadere il conto', () => {
    const c = consumoGiornaliero([chiusura(todayLocal(), [
      { nome: 'PRODOTTO CHE NON ESISTE', unitaV: 5 },
      { nome: 'FIORDILATTE', unitaV: 1 },
    ])], RICETTARIO)
    expect(c.latte).toBeCloseTo(600 / GIORNI_FINESTRA, 6)
  })
})

describe('Su quante giornate è costruito', () => {
  it('conta le giornate registrate, non le righe', () => {
    const g = giornateContate([
      chiusura(todayLocal(), []),
      chiusura(todayLocal(), []),   // stessa data: è una giornata sola
      chiusura(giorniFaLocal(2), []),
    ])
    expect(g).toBe(2)
  })

  it('e quelle fuori finestra non contano', () => {
    expect(giornateContate([chiusura(giorniFaLocal(90), [])])).toBe(0)
  })
})

describe('Il righello di questo file', () => {
  it('senza chiusure il consumo è vuoto, non zero per ogni ingrediente', () => {
    // «Non lo so» e «se ne consuma zero» sono due cose diverse: la prima
    // ferma il conto del riordino, la seconda gli fa dire «non serve niente».
    expect(consumoGiornaliero([], RICETTARIO)).toEqual({})
    expect(consumoGiornaliero(null, null)).toEqual({})
  })

  it('e niente cade su dati storti', () => {
    for (const s of [null, undefined, 'ciao', 42, {}, [null], [{ data: 'boh' }]]) {
      expect(() => consumoGiornaliero(s, RICETTARIO)).not.toThrow()
      expect(() => giornateContate(s)).not.toThrow()
    }
  })

  it('una quantità a zero o negativa non entra', () => {
    const c = consumoGiornaliero([chiusura(todayLocal(), [
      { nome: 'FIORDILATTE', unitaV: 0 },
      { nome: 'PISTACCHIO', unitaV: -3 },
    ])], RICETTARIO)
    expect(c).toEqual({})
  })
})
