// Il food cost di un evento (preventivo per matrimoni, catering, feste).
//
// Il difetto: il costo di ogni riga si leggeva da `ric.foodCost` o `ric.fc`,
// due campi che una ricetta NON HA. In questo progetto il food cost non è un
// dato salvato: si calcola dagli ingredienti e dal listino prezzi
// (src/lib/foodcost.js). Controllato sul database vero del design partner:
// zero ricette su ventisette hanno quei campi, tutte e ventisette hanno gli
// ingredienti.
//
// Conseguenza: il costo usciva sempre ZERO, quindi ogni evento mostrava food
// cost 0% e margine 100%. Un preventivo per un matrimonio da 3.000 €
// risultava tutto guadagno.
//
// Qui si testa il calcolo, non il componente: la formula è quella che decide
// se un evento conviene accettarlo.

import { describe, it, expect } from 'vitest'
import { buildIngCosti, calcolaFC } from '../../src/lib/foodcost.js'

const ic = (m) => { const o = {}; for (const [n, kg] of Object.entries(m)) o[n] = { costoKg: kg, costoG: kg / 1000 }; return o }

const ricettario = {
  ricette: {
    torta: {
      nome: 'TORTA NUZIALE', tipo: 'fetta', resa_g: 2000,
      ingredienti: [{ nome: 'farina', qty1stampo: 1000 }, { nome: 'burro', qty1stampo: 500 }],
    },
    misteriosa: {
      nome: 'DOLCE SENZA PREZZI', tipo: 'fetta', resa_g: 1000,
      ingredienti: [{ nome: 'ingrediente_ignoto', qty1stampo: 800 }],
    },
  },
}
const ingCosti = ic({ farina: 1.2, burro: 9 })

describe('food cost di una ricetta da evento', () => {
  it('si calcola dagli ingredienti, non si legge da un campo che non esiste', () => {
    const ric = ricettario.ricette.torta
    // I due campi da cui il codice leggeva prima.
    expect(ric.foodCost).toBeUndefined()
    expect(ric.fc).toBeUndefined()
    // Il costo vero: 1 kg di farina a 1,20 + 0,5 kg di burro a 9,00 = 5,70 €.
    const info = calcolaFC(ric, ingCosti, ricettario)
    expect(info.tot).toBeCloseTo(5.70, 2)
  })

  it('un margine calcolato col costo vero non è il 100%', () => {
    const info = calcolaFC(ricettario.ricette.torta, ingCosti, ricettario)
    const qty = 3, prezzo = 40
    const ricavo = qty * prezzo          // 120 €
    const costo = qty * info.tot         // 17,10 €
    const margPct = (ricavo - costo) / ricavo * 100
    // Prima, con costo zero, questa riga diceva 100%.
    expect(margPct).toBeGreaterThan(80)
    expect(margPct).toBeLessThan(90)
  })

  it('una ricetta con ingredienti senza prezzo si riconosce', () => {
    // È la differenza fra "costa poco" e "non so quanto costa": una riga
    // scoperta abbassa il costo e alza il margine, e va dichiarata.
    // calcolaFC restituisce { tot, mancanti }: `mancanti` sono i nomi degli
    // ingredienti rimasti senza prezzo.
    const info = calcolaFC(ricettario.ricette.misteriosa, ingCosti, ricettario)
    expect(info.mancanti.length).toBeGreaterThan(0)
    expect(info.mancanti).toContain('ingrediente_ignoto')
  })

  it('ricetta inesistente: nessun costo inventato', () => {
    const info = calcolaFC(undefined, ingCosti, ricettario)
    expect(Number(info?.tot) || 0).toBe(0)
  })
})
