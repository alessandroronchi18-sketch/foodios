// Confronto sedi, secondo giro (05/10/2026): tre cose dette dal coordinatore.
//
// 1. Food cost e margine dicevano «non lo so» in tutte le sedi, come se
//    fossero un limite dei dati. Non lo sono: la Produzione li calcola
//    dall'inventario e dalle ricette (`valutaGusti`). Il Confronto leggeva
//    solo la produzione giornaliera, che Mara non compila. Ora usa le stesse
//    funzioni: stesso numero della Produzione con quella sede scelta, margine
//    sui soli gusti con ricetta e costo completo, chili degli altri detti
//    (ad agosto circa il 21% dei chili di Mara non ha la ricetta collegata).
// 2. «Prodotti oggi 0», «Stock vetrina 0 pz», «Trasferimenti in arrivo 0»:
//    per una gelateria a inventario sono tre zeri senza significato. Si
//    mostrano solo se hanno un dato.
// 3. «Carlina: stimato» ad agosto era falso: ha giorni di cassa vera e
//    giorni stimati. La fonte è quella di `incassiDaSedi` (cassa / misto /
//    stima) e la pagina scrive «in parte cassa».
import { describe, it, expect } from 'vitest'
import { foodCostSede, incassiSedePeriodo } from '../../src/lib/confrontoSediCalc'
import { totaliPerGusto, ricettaDelGusto } from '../../src/lib/inventarioProduzione'
import { valutaGusti } from '../../src/lib/produzioneAnalisi'
import { buildIngCosti } from '../../src/lib/foodcost'

const RICETTARIO = {
  ingredienti_costi: { latte: { costoKg: 1, costoG: 0.001 }, nocciola: { costoKg: 20, costoG: 0.02 } },
  ricette: {
    NOCCIOLA: { nome: 'NOCCIOLA', tipo: 'gusto', categoria: 'Gusto', ingredienti: [{ nome: 'latte', qty1stampo: 800 }, { nome: 'nocciola', qty1stampo: 400 }] },
  },
}
// NOCCIOLA: prodotti 6 kg, venduti 7 kg (03-04/08). MENTA: senza ricetta, 3 kg venduti.
const RIGHE = [
  { sede_id: 's1', gusto_nome: 'NOCCIOLA', data: '2026-08-02', produzione_g: 0, rimanenza_g: 2000, scarto_g: 0, spedito_g: 0 },
  { sede_id: 's1', gusto_nome: 'NOCCIOLA', data: '2026-08-03', produzione_g: 6000, rimanenza_g: 3000, scarto_g: 0, spedito_g: 0 },
  { sede_id: 's1', gusto_nome: 'NOCCIOLA', data: '2026-08-04', produzione_g: 0, rimanenza_g: 1000, scarto_g: 0, spedito_g: 0 },
  { sede_id: 's1', gusto_nome: 'MENTA', data: '2026-08-02', produzione_g: 0, rimanenza_g: 4000, scarto_g: 0, spedito_g: 0 },
  { sede_id: 's1', gusto_nome: 'MENTA', data: '2026-08-03', produzione_g: 0, rimanenza_g: 2500, scarto_g: 0, spedito_g: 0 },
  { sede_id: 's1', gusto_nome: 'MENTA', data: '2026-08-04', produzione_g: 0, rimanenza_g: 1000, scarto_g: 0, spedito_g: 0 },
]
const EURO_KG = 30

describe('food cost di una sede = quello della Produzione', () => {
  it('stesso margine di valutaGusti con le stesse dipendenze', () => {
    const v = valutaGusti(totaliPerGusto(RIGHE, { da: '2026-08-03', a: '2026-08-04' }), {
      ricettaDi: (g) => ricettaDelGusto(RICETTARIO, g, null), ricavoKgDi: () => EURO_KG,
      ingCosti: buildIngCosti(RICETTARIO.ingredienti_costi), ricettario: RICETTARIO,
    })
    const f = foodCostSede({ righe: RIGHE, da: '2026-08-03', a: '2026-08-04', ricettario: RICETTARIO, euroKgNetto: EURO_KG })
    expect(f.margine).toBeCloseTo(v.totali.margine, 6)
    expect(f.margPct).toBeCloseTo(v.totali.margPct, 6)
  })

  it('NOCCIOLA: 6 kg prodotti a 7,33 €/kg = 44 € di food cost su 210 € di ricavo (20,95%)', () => {
    const f = foodCostSede({ righe: RIGHE, da: '2026-08-03', a: '2026-08-04', ricettario: RICETTARIO, euroKgNetto: EURO_KG })
    expect(f.fcEuro).toBeCloseTo(44, 1)
    expect(f.ricavoConMargine).toBeCloseTo(210, 1)
    expect(f.fcPct).toBeCloseTo(20.95, 1)
    expect(f.margine).toBeCloseTo(166, 1)
  })

  it('i chili dei gusti senza ricetta restano fuori dal margine e si dicono: 3 su 10 kg', () => {
    const f = foodCostSede({ righe: RIGHE, da: '2026-08-03', a: '2026-08-04', ricettario: RICETTARIO, euroKgNetto: EURO_KG })
    expect(f.kgVenduti).toBeCloseTo(10, 3)
    expect(f.kgFuori).toBeCloseTo(3, 3)
    expect(f.pctFuori).toBeCloseTo(30, 1)
  })

  it('senza ricetta per nessun gusto il margine non c\'è (non è il 100%)', () => {
    const f = foodCostSede({ righe: RIGHE, da: '2026-08-03', a: '2026-08-04', ricettario: { ingredienti_costi: {}, ricette: {} }, euroKgNetto: EURO_KG })
    expect(f.margine).toBeNull()
    expect(f.fcPct).toBeNull()
    expect(f.pctFuori).toBeCloseTo(100, 1)
  })

  it('senza ricettario, senza prezzo al chilo o senza righe: null, non zero', () => {
    expect(foodCostSede({ righe: RIGHE, da: '2026-08-03', a: '2026-08-04', ricettario: null, euroKgNetto: EURO_KG })).toBeNull()
    expect(foodCostSede({ righe: RIGHE, da: '2026-08-03', a: '2026-08-04', ricettario: RICETTARIO, euroKgNetto: null })).toBeNull()
    expect(foodCostSede({ righe: null, da: '2026-08-03', a: '2026-08-04', ricettario: RICETTARIO, euroKgNetto: EURO_KG })).toBeNull()
    expect(foodCostSede({ righe: [], da: '2026-08-03', a: '2026-08-04', ricettario: RICETTARIO, euroKgNetto: EURO_KG })).toBeNull()
  })
})

describe('la fonte degli incassi: cassa, misto, stima', () => {
  const chiusure = [{ data: '2026-08-03', kpi: { totV: 1000 } }]
  it('con cassa e inventario insieme la fonte è «misto», non «stima»', () => {
    const formati = [{ nome: 'Cono', baseQtaG: 100, categoria: 'Gusto', prezzoDefault: 3 }]
    const r = incassiSedePeriodo({ chiusure, righe: RIGHE, formati, da: '2026-08-03', a: '2026-08-04', nome: 'Carlina' })
    expect(r.giorni).toBe(1)
    expect(r.giorniStimati).toBe(1)
    expect(r.fonte).toBe('misto')
  })
  it('solo cassa: «cassa»; senza cassa: «stima»', () => {
    expect(incassiSedePeriodo({ chiusure, da: '2026-08-03', a: '2026-08-03' }).fonte).toBe('cassa')
    const formati = [{ nome: 'Cono', baseQtaG: 100, categoria: 'Gusto', prezzoDefault: 3 }]
    expect(incassiSedePeriodo({ chiusure: [], righe: RIGHE, formati, da: '2026-08-03', a: '2026-08-04' }).fonte).toBe('stima')
  })
})

// ── La pagina ───────────────────────────────────────────────────────────
// @vitest-environment happy-dom è dichiarato dal file jsx dei test di pagina;
// qui la pagina si prova in confrontoSediPagina.test.jsx (righe per metodo e
// etichetta «in parte cassa»).
