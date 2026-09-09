// La base che la gelateria usa in mezzo ricettario non era da nessuna parte.
//
// Nel ricettario reale di Mara dei Boschi (09/09/2026) BASE BIANCA è una ricetta
// con 5 ingredienti e 1 kg di batch, usata come ingrediente in 15 altre ricette.
// È la base della gelateria. Ma non ha `tipo: 'semilavorato'` salvato, e
// calcolaFC controlla proprio quel campo (foodcost.js:957) per decidere se
// scendere nella ricetta o cercare il nome nel listino ingredienti.
//
// Non trovando il tipo, il costo arriva dal listino: "base bianca" a 2,310 €/kg,
// mentre la sua ricetta vale 1,622 €/kg. Sono 0,688 €/kg su 375-1.000 g per
// ricetta: dichiarandola base, 15 food cost si spostano da -5,6% a -39,8%.
// E la pagina Semilavorati non offriva alcun modo per accorgersene, perché
// elenca solo chi ha già il tipo giusto: mostrava "1 base interna" e
// "Il più usato: nessun utilizzo".
//
// La parte difficile è NON dare falsi allarmi: nello stesso ricettario il gusto
// ARANCIA usa l'ingrediente "arancia" (il frutto) e il gusto BANANA usa
// "banana". Non sono basi: sono gusti che si chiamano come la loro materia
// prima, e proporre di trasformarli sarebbe un danno.

import { describe, it, expect } from 'vitest'
import { trovaBasiNonDichiarate } from '../../src/lib/basiNonDichiarate'
import { buildIngCosti } from '../../src/lib/foodcost'

// Ricalca la situazione vera: una base usata da molte ricette e due gusti
// omonimi del loro ingrediente principale.
const ricettario = {
  ricette: {
    'BASE BIANCA': {
      nome: 'BASE BIANCA', tipo: undefined,
      ingredienti: [
        { nome: 'latte', qty1stampo: 600 },
        { nome: 'panna', qty1stampo: 150 },
        { nome: 'zucchero', qty1stampo: 150 },
        { nome: 'destrosio', qty1stampo: 50 },
        // La base commerciale in polvere: stesso nome della ricetta.
        { nome: 'Base bianca', qty1stampo: 50 },
      ],
    },
    'NOCCIOLA':      { nome: 'NOCCIOLA',      ingredienti: [{ nome: 'base bianca', qty1stampo: 900 }, { nome: 'pasta nocciola', qty1stampo: 100 }] },
    'GIANDUIA':      { nome: 'GIANDUIA',      ingredienti: [{ nome: 'base bianca', qty1stampo: 850 }, { nome: 'cacao', qty1stampo: 60 }] },
    'FIOR DI PANNA': { nome: 'FIOR DI PANNA', ingredienti: [{ nome: 'base bianca', qty1stampo: 1000 }] },
    // Falso positivo da NON proporre: il gusto omonimo del suo frutto.
    'ARANCIA': { nome: 'ARANCIA', ingredienti: [{ nome: 'arancia', qty1stampo: 300 }, { nome: 'zucchero', qty1stampo: 150 }, { nome: 'acqua', qty1stampo: 550 }] },
    // Un semilavorato già dichiarato: non deve comparire fra i candidati.
    'PASTA FROLLA': { nome: 'PASTA FROLLA', tipo: 'semilavorato', ingredienti: [{ nome: 'farina', qty1stampo: 500 }, { nome: 'burro', qty1stampo: 250 }] },
    'CROSTATA':     { nome: 'CROSTATA',     ingredienti: [{ nome: 'pasta frolla', qty1stampo: 400 }] },
    'TORTA':        { nome: 'TORTA',        ingredienti: [{ nome: 'pasta frolla', qty1stampo: 300 }] },
  },
  ingredienti_costi: {
    latte: { costoKg: 1.4, costoG: 0.0014 },
    panna: { costoKg: 5.5, costoG: 0.0055 },
    zucchero: { costoKg: 0.98, costoG: 0.00098 },
    destrosio: { costoKg: 1.6, costoG: 0.0016 },
    // La riga di listino con cui i gusti stanno pagando la base.
    'base bianca': { costoKg: 2.31, costoG: 0.00231 },
    'pasta nocciola': { costoKg: 32, costoG: 0.032 },
    cacao: { costoKg: 19, costoG: 0.019 },
    arancia: { costoKg: 3.8, costoG: 0.0038 },
    acqua: { costoKg: 0.001, costoG: 0.000001 },
    farina: { costoKg: 0.9, costoG: 0.0009 },
    burro: { costoKg: 7.2, costoG: 0.0072 },
  },
}

const ingCosti = buildIngCosti(ricettario.ingredienti_costi)

describe('trovaBasiNonDichiarate', () => {
  const candidati = trovaBasiNonDichiarate(ricettario, ingCosti)

  it('trova la base che la gelateria usa davvero', () => {
    expect(candidati.map(c => c.nome)).toContain('BASE BIANCA')
    const b = candidati.find(c => c.nome === 'BASE BIANCA')
    expect(b.nUsi).toBe(3) // NOCCIOLA, GIANDUIA, FIOR DI PANNA
    expect(b.usataIn).toEqual(['FIOR DI PANNA', 'GIANDUIA', 'NOCCIOLA'])
    expect(b.nIngredienti).toBe(5)
  })

  it('non propone i gusti che si chiamano come il loro frutto', () => {
    // ARANCIA usa "arancia": una sola ricetta la nomina (se stessa esclusa),
    // quindi non e' una base ed e' giusto lasciarla fuori.
    expect(candidati.map(c => c.nome)).not.toContain('ARANCIA')
  })

  it('non ripropone i semilavorati già dichiarati', () => {
    // PASTA FROLLA e' usata in 2 ricette, ma il tipo lo ha già.
    expect(candidati.map(c => c.nome)).not.toContain('PASTA FROLLA')
  })

  it('mostra quanto la stanno pagando e quanto costerebbe davvero', () => {
    const b = candidati.find(c => c.nome === 'BASE BIANCA')
    // Il listino la mette a 2,31 €/kg.
    expect(b.costoKgDaListino).toBeCloseTo(2.31, 2)
    // La sua ricetta costa meno: latte e zucchero costano poco.
    expect(b.costoKgDaRicetta).toBeGreaterThan(0)
    expect(b.costoKgDaRicetta).toBeLessThan(b.costoKgDaListino)
    // E la differenza è il numero che serve per decidere.
    expect(b.differenzaKg).toBeCloseTo(b.costoKgDaListino - b.costoKgDaRicetta, 3)
  })

  it('segnala che contiene se stessa, perché dopo la promozione conta', () => {
    // BASE BIANCA elenca "Base bianca 50 g" (la base commerciale in polvere).
    // Dichiarandola semilavorato, calcolaFC rileva il ciclo: va detto prima.
    const b = candidati.find(c => c.nome === 'BASE BIANCA')
    expect(b.autoCiclo).toBe(true)
  })

  it('regge un ricettario vuoto o assente', () => {
    for (const x of [null, undefined, {}, { ricette: {} }]) {
      expect(trovaBasiNonDichiarate(x, ingCosti)).toEqual([])
    }
  })

  it('ordina dal più usato: è quello che sposta più food cost', () => {
    const molte = { ...ricettario, ricette: { ...ricettario.ricette,
      'SCIROPPO': { nome: 'SCIROPPO', ingredienti: [{ nome: 'zucchero', qty1stampo: 500 }, { nome: 'acqua', qty1stampo: 500 }] },
      'GRANITA':  { nome: 'GRANITA',  ingredienti: [{ nome: 'sciroppo', qty1stampo: 800 }] },
      'SORBETTO': { nome: 'SORBETTO', ingredienti: [{ nome: 'sciroppo', qty1stampo: 700 }] },
    } }
    const r = trovaBasiNonDichiarate(molte, ingCosti)
    expect(r[0].nome).toBe('BASE BIANCA') // 3 usi
    expect(r.map(c => c.nome)).toContain('SCIROPPO') // 2 usi
    expect(r[0].nUsi).toBeGreaterThanOrEqual(r[r.length - 1].nUsi)
  })
})
