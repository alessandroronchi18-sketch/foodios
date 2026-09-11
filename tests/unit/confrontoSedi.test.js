// Confronto sedi: i numeri del gruppo e la differenza fra "zero" e "non lo so".
//
// La pagina confronta le sedi su ricavi, food cost e margine. Tutti e tre
// arrivano dalle chiusure di cassa. Il design partner lavora col metodo
// inventario e NON compila le chiusure: nel suo database ce ne sono zero (le
// 79 che sembravano sue erano della Gelateria Demo). Con zero chiusure la
// pagina calcolava ricavi = 0, e da lì:
//
//   margine lordo = 0 - food cost  → negativo
//   margine netto = margine lordo - costi azienda  → più negativo
//   allarme rosso "Margine netto negativo" su TUTTE E TRE le sedi, sempre
//   punteggio 50 fisso per ognuna → la pagina incoronava una "sede critica"
//     ordinando tre 50 identici, cioè per ordine di elenco
//
// E il food cost in percentuale era la MEDIA delle percentuali giornaliere:
// una giornata da 50 € al 50% pesava come una da 3.000 € al 25%.
//
// Qui si testano le due funzioni pure estratte per poterle controllare.

import { describe, it, expect } from 'vitest'
import { foodCostPesato, vocePerGruppo } from '../../src/lib/confrontoSediCalc'

describe('foodCostPesato', () => {
  it('pesa sui ricavi, non fa la media delle percentuali', () => {
    // Giorno 1: 50 € di incasso, 25 € di food cost (50%).
    // Giorno 2: 3.000 € di incasso, 750 € di food cost (25%).
    // La media delle percentuali darebbe 37,5%. Il food cost vero del periodo
    // è 775 / 3.050 = 25,4%.
    const r = foodCostPesato([
      { ricavoTot: 50, fcTot: 25 },
      { ricavoTot: 3000, fcTot: 750 },
    ])
    expect(r.pct).toBeCloseTo(25.41, 1)
    expect(r.fcEuro).toBe(775)
    expect(r.ricavi).toBe(3050)
  })

  it('senza incasso non inventa una percentuale', () => {
    // Il food cost in percentuale ha un senso solo se c'è un ricavo sotto.
    const r = foodCostPesato([{ ricavoTot: 0, fcTot: 2.417 }])
    expect(r.pct).toBeNull()
    expect(r.fcEuro).toBeCloseTo(2.417, 3)
  })

  it('lista vuota', () => {
    expect(foodCostPesato([]).pct).toBeNull()
    expect(foodCostPesato(null).pct).toBeNull()
  })
})

describe('vocePerGruppo — food cost del gruppo', () => {
  it('pesa le sedi sui loro ricavi', () => {
    // Sede piccola al 50%, sede grande al 25%: il gruppo non sta a 37,5%.
    const g = vocePerGruppo([
      { ricaviCur: 500, foodCostPct: 50 },
      { ricaviCur: 5000, foodCostPct: 25 },
    ])
    expect(g.foodCostMedio).toBeCloseTo(27.27, 1)
  })

  it('salta le sedi senza incasso invece di contarle come zero', () => {
    const g = vocePerGruppo([
      { ricaviCur: 1000, foodCostPct: 30 },
      { ricaviCur: null, foodCostPct: null },
    ])
    expect(g.foodCostMedio).toBeCloseTo(30, 3)
    expect(g.sediConData).toBe(1)
  })

  it('nessuna sede con incasso: niente percentuale e niente verdetto', () => {
    const g = vocePerGruppo([
      { ricaviCur: null, foodCostPct: null },
      { ricaviCur: null, foodCostPct: null },
      { ricaviCur: null, foodCostPct: null },
    ])
    expect(g.foodCostMedio).toBeNull()
    expect(g.sediConData).toBe(0)
    expect(g.ricCur).toBe(0)
  })
})
