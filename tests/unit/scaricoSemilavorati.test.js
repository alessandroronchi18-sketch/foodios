// Produrre una crostata non scaricava niente dal magazzino.
//
// Il calcolo dello scarico prendeva gli ingredienti della ricetta come sono
// scritti. Ma "CROSTATA MELE" contiene "pasta frolla", che è un semilavorato:
//   - calcolaFC scendeva nella sua ricetta e contava farina e burro nel costo,
//   - il magazzino cercava una voce "pasta frolla", non la trovava, e non
//     scaricava NIENTE.
//
// Nel database del 09/09/2026 nessuno dei 7 semilavorati è tenuto in magazzino.
// Quindi ogni crostata prodotta lasciava il magazzino pieno mentre il food cost
// contava la frolla: le due cose non tornavano più e nessuno lo diceva. Il
// pasticcere si accorge dello scostamento all'inventario, un mese dopo, e non
// ha modo di capire da dove viene.
//
// La distinzione fra i due tipi conta, e viene dal modello di prodotto: le dosi
// di una BASE ('interno') non sono un dato affidabile — il gelataio le tiene per
// sé e scrive solo il costo al kg — quindi su quelle il magazzino non si muove
// e lo si dichiara, invece di scaricare numeri che nessuno ha inteso come dosi.

import { describe, it, expect } from 'vitest'
import { ingredientiDaScaricare } from '../../src/lib/scaricoIngredienti'

const ricettario = {
  ricette: {
    'PASTA FROLLA': {
      nome: 'PASTA FROLLA', tipo: 'semilavorato',
      ingredienti: [
        { nome: 'farina', qty1stampo: 500 },
        { nome: 'burro', qty1stampo: 250 },
        { nome: 'zucchero', qty1stampo: 200 },
      ],
    },
    'BASE BIANCA': {
      nome: 'BASE BIANCA', tipo: 'interno',
      ingredienti: [{ nome: 'latte', qty1stampo: 600 }, { nome: 'panna', qty1stampo: 150 }],
    },
    'CREMA': {
      nome: 'CREMA', tipo: 'semilavorato',
      ingredienti: [{ nome: 'pasta frolla', qty1stampo: 100 }, { nome: 'uova', qty1stampo: 200 }],
    },
    'SEMI VUOTO': { nome: 'SEMI VUOTO', tipo: 'semilavorato', ingredienti: [] },
  },
}

const crostata = { nome: 'CROSTATA MELE', ingredienti: [
  { nome: 'pasta frolla', qty1stampo: 950 },   // = una volta la frolla intera
  { nome: 'mele', qty1stampo: 400 },
]}

describe('scarico con un semilavorato non tenuto in magazzino', () => {
  it('scende nella sua ricetta e scarica farina, burro e zucchero', () => {
    const { ings, nonEspandibili } = ingredientiDaScaricare(crostata, 1, ricettario, new Set(['mela', 'farina', 'burro', 'zucchero']))
    expect(nonEspandibili).toEqual([])
    // La frolla pesa 950 g in tutto: 950 g richiesti = una volta intera.
    expect(ings.farina).toBeCloseTo(500, 3)
    expect(ings.burro).toBeCloseTo(250, 3)
    expect(ings.zucchero).toBeCloseTo(200, 3)
    expect(ings.mela, 'normIng porta i plurali al singolare: mele -> mela').toBe(400)
    // E non scarica una voce "pasta frolla" che in magazzino non esiste.
    expect(ings['pasta frolla']).toBeUndefined()
  })

  it('in proporzione, se ne serve mezza', () => {
    const mezza = { ingredienti: [{ nome: 'pasta frolla', qty1stampo: 475 }] }
    const { ings } = ingredientiDaScaricare(mezza, 1, ricettario, new Set())
    expect(ings.farina).toBeCloseTo(250, 3)
    expect(ings.burro).toBeCloseTo(125, 3)
  })

  it('moltiplica per gli stampi prodotti', () => {
    const { ings } = ingredientiDaScaricare(crostata, 3, ricettario, new Set())
    expect(ings.farina).toBeCloseTo(1500, 3)
    expect(ings.mela).toBe(1200)
  })
})

describe('se il semilavorato È in magazzino, si scarica quello', () => {
  it('non scende: il laboratorio lo produce prima e lo tiene sullo scaffale', () => {
    const { ings } = ingredientiDaScaricare(crostata, 1, ricettario, new Set(['pasta frolla', 'mele']))
    expect(ings['pasta frolla']).toBe(950)
    expect(ings.farina).toBeUndefined()
  })
})

describe('le basi non si espandono: le dosi non sono un dato affidabile', () => {
  const gusto = { ingredienti: [{ nome: 'base bianca', qty1stampo: 900 }, { nome: 'pasta nocciola', qty1stampo: 100 }] }

  it('lo dichiara invece di scaricare numeri che nessuno ha inteso come dosi', () => {
    const { ings, nonEspandibili } = ingredientiDaScaricare(gusto, 1, ricettario, new Set(['pasta nocciola']))
    expect(ings.latte).toBeUndefined()
    expect(ings.panna).toBeUndefined()
    expect(nonEspandibili).toHaveLength(1)
    expect(nonEspandibili[0].nome).toBe('base bianca')
    expect(nonEspandibili[0].motivo).toMatch(/è una base/)
    // Il resto della ricetta si scarica normalmente.
    expect(ings['pasta nocciola']).toBe(100)
  })

  it('ma se la base è in magazzino, si scarica quella', () => {
    const { ings, nonEspandibili } = ingredientiDaScaricare(gusto, 1, ricettario, new Set(['base bianca', 'pasta nocciola']))
    expect(ings['base bianca']).toBe(900)
    expect(nonEspandibili).toEqual([])
  })
})

describe('casi che non devono far esplodere il calcolo', () => {
  it('semilavorato dentro semilavorato', () => {
    const torta = { ingredienti: [{ nome: 'crema', qty1stampo: 300 }] }
    const { ings } = ingredientiDaScaricare(torta, 1, ricettario, new Set())
    // CREMA pesa 300 g (100 frolla + 200 uova) → una volta intera.
    expect(ings.uovo).toBeCloseTo(200, 3)
    // e dentro la frolla: 100 g su 950 → farina in proporzione.
    expect(ings.farina).toBeCloseTo(500 * (100 / 950), 3)
  })

  it('semilavorato senza ingredienti: lo dice', () => {
    const x = { ingredienti: [{ nome: 'semi vuoto', qty1stampo: 100 }] }
    const { ings, nonEspandibili } = ingredientiDaScaricare(x, 1, ricettario, new Set())
    expect(Object.keys(ings)).toEqual([])
    expect(nonEspandibili[0].motivo).toMatch(/non ha ingredienti/)
  })

  it('un semilavorato che si richiama da solo non manda in ricorsione infinita', () => {
    const ciclico = { ricette: { 'A': { nome: 'A', tipo: 'semilavorato', ingredienti: [{ nome: 'a', qty1stampo: 100 }] } } }
    const x = { ingredienti: [{ nome: 'a', qty1stampo: 100 }] }
    const { nonEspandibili } = ingredientiDaScaricare(x, 1, ciclico, new Set())
    expect(nonEspandibili.length).toBeGreaterThan(0)
    expect(nonEspandibili[0].motivo).toMatch(/si richiama da sola|annidata/)
  })

  it('quantità zero non produce scarichi', () => {
    expect(ingredientiDaScaricare(crostata, 0, ricettario, new Set()).ings).toEqual({})
  })

  it('una materia prima nuova si scarica comunque, così la voce nasce', () => {
    const x = { ingredienti: [{ nome: 'ingrediente mai visto', qty1stampo: 50 }] }
    const { ings } = ingredientiDaScaricare(x, 1, ricettario, new Set())
    expect(ings['ingrediente mai visto']).toBe(50)
  })
})
