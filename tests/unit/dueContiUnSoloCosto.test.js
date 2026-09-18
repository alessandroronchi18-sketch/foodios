// ── Lo stesso food cost, da qualunque parte lo si guardi ──────────────────
//
// Il difetto, trovato il 18/09/2026 facendo girare il codice sul ricettario
// vero di Mara dei Boschi (68 ricette).
//
// Il prodotto calcola il costo di una ricetta con DUE funzioni: `calcolaFC`,
// che dà il totale mostrato sulla scheda, e `calcolaFCDettaglio`, che disegna
// la tabella riga per riga quando la scheda si apre. Davano numeri diversi:
//
//     NOCE       scheda 2,310 €   ·   tabella sotto 1,224 €
//     ZENZERO    scheda 3,110 €   ·   tabella sotto 2,024 €
//     FIOR DI PANNA  2,780 €      ·   1,694 €
//
//     29 ricette su 68. Sul totale del ricettario: 189,94 € contro 160,81 €,
//     cioè il 18% di scarto.
//
// **Perché.** Il 16/09 era stata presa una decisione, e scritta per esteso nel
// codice: quando un semilavorato ha SIA una ricetta SIA un prezzo al chilo
// scritto a mano dal titolare, vince il prezzo scritto a mano. Il motivo è
// solido — un prezzo scritto da chi produce è una misura, un calcolo su
// ingredienti metà dei quali non hanno prezzo è una stima al ribasso; sui dati
// veri quella stima sbagliava dell'88,7%.
//
// Quella decisione era stata applicata a `calcolaFC` **e non** all'altra
// funzione. Mezza correzione: la scheda diceva il numero giusto, la tabella
// aperta sotto continuava a dire quello vecchio. E non se ne accorgeva nessuno
// perché le due cifre non compaiono mai nello stesso punto dello schermo.
//
// Questo file tiene insieme le due strade: qualunque cosa si cambi, devono
// arrivare allo stesso numero.
import { describe, it, expect } from 'vitest'
import { calcolaFC, calcolaFCDettaglio, costoRigaIngrediente, buildIngCosti } from '../../src/lib/foodcost'

// Il caso vero, ridotto all'osso: una base che ha una ricetta INCOMPLETA
// (metà degli ingredienti senza prezzo) e un prezzo scritto a mano.
const RICETTARIO = {
  ingredienti_costi: {
    'base bianca': { costoKg: 2.31, costoG: 0.00231 },
    panna: { costoKg: 4.7, costoG: 0.0047 },
  },
  ricette: {
    'BASE BIANCA': {
      nome: 'BASE BIANCA', tipo: 'semilavorato', unita: 0, prezzo: 0,
      ingredienti: [
        { nome: 'panna', qty1stampo: 10000 },
        // Senza prezzo: è questo che rende la ricetta una stima al ribasso.
        { nome: 'zucchero di barbabietola', qty1stampo: 20000 },
        { nome: 'base mara', qty1stampo: 19850 },
      ],
    },
    NOCE: {
      nome: 'NOCE', tipo: 'gusto', unita: 1, prezzo: 0,
      ingredienti: [{ nome: 'base bianca', qty1stampo: 1000 }],
    },
  },
}

const ing = buildIngCosti(RICETTARIO.ingredienti_costi)

describe('Le due funzioni del food cost dicono lo stesso numero', () => {
  it('su una ricetta che usa una base col prezzo scritto a mano', () => {
    const a = calcolaFC(RICETTARIO.ricette.NOCE, ing, RICETTARIO).tot
    const b = calcolaFCDettaglio(RICETTARIO.ricette.NOCE, ing, RICETTARIO).tot
    expect(b).toBeCloseTo(a, 3)
  })

  it('e il numero è quello scritto dal titolare, non la stima al ribasso', () => {
    // 1000 g × 2,31 €/kg = 2,31 €. La ricetta della base, con due ingredienti
    // su tre senza prezzo, darebbe 0,94 €/kg: meno della metà.
    const b = calcolaFCDettaglio(RICETTARIO.ricette.NOCE, ing, RICETTARIO).tot
    expect(b).toBeCloseTo(2.31, 2)
  })

  it('la riga singola dice la stessa cosa del totale', () => {
    const r = costoRigaIngrediente({ nome: 'base bianca', qty1stampo: 1000 }, ing, RICETTARIO)
    expect(r.costo).toBeCloseTo(2.31, 2)
    expect(r.mancante).toBe(false)
  })
})

describe('Quello che NON deve cambiare', () => {
  it('senza un prezzo scritto a mano vince la ricetta della base', () => {
    // È il caso normale: la base la calcola il programma. Togliendo la voce
    // dal listino si torna al conto sugli ingredienti.
    const senza = { ...RICETTARIO, ingredienti_costi: { panna: { costoKg: 4.7, costoG: 0.0047 } } }
    const ing2 = buildIngCosti(senza.ingredienti_costi)
    const r = costoRigaIngrediente({ nome: 'base bianca', qty1stampo: 1000 }, ing2, senza)
    expect(r.isSemilavorato).toBe(true)
    // 10.000 g di panna a 0,0047 €/g = 47 € su 49.850 g = 0,943 €/kg
    expect(r.costo).toBeCloseTo(0.943, 2)
  })

  it('una STIMA di mercato non vince sulla ricetta: fra due stime meglio la tua', () => {
    const conStima = {
      ...RICETTARIO,
      ingredienti_costi: { panna: { costoKg: 4.7, costoG: 0.0047 } },
    }
    const ing3 = { ...buildIngCosti(conStima.ingredienti_costi),
      'base bianca': { costoKg: 9, costoG: 0.009, isStima: true } }
    const r = costoRigaIngrediente({ nome: 'base bianca', qty1stampo: 1000 }, ing3, conStima)
    expect(r.isSemilavorato).toBe(true)
    expect(r.costo).toBeCloseTo(0.943, 2)
  })

  it('un prezzo scritto a ZERO non è un prezzo: non deve vincere', () => {
    // Zero vuol dire «gratis», ed è la bugia che questo prodotto insegue da
    // sempre. Se qualcuno salva 0, la ricetta della base deve tornare a
    // valere.
    const conZero = {
      ...RICETTARIO,
      ingredienti_costi: { panna: { costoKg: 4.7, costoG: 0.0047 }, 'base bianca': { costoKg: 0, costoG: 0 } },
    }
    const ing4 = buildIngCosti(conZero.ingredienti_costi)
    const r = costoRigaIngrediente({ nome: 'base bianca', qty1stampo: 1000 }, ing4, conZero)
    expect(r.isSemilavorato).toBe(true)
  })

  it('un ingrediente normale senza prezzo resta «mancante»', () => {
    const r = costoRigaIngrediente({ nome: 'pasta di noce', qty1stampo: 80 }, ing, RICETTARIO)
    expect(r.mancante).toBe(true)
    expect(r.costo).toBe(0)
  })

  it('un ingrediente normale col prezzo si calcola come sempre', () => {
    const r = costoRigaIngrediente({ nome: 'panna', qty1stampo: 500 }, ing, RICETTARIO)
    expect(r.costo).toBeCloseTo(2.35, 2)
    expect(r.isSemilavorato).toBe(false)
  })
})
