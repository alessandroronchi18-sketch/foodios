import { describe, it, expect, beforeEach } from 'vitest'
import {
  calcolaFC, calcolaFCStorico, calcolaFCDettaglio, buildIngCosti, getPrezzoStoricoKg, normIng,
} from '../../src/lib/foodcost.js'
import { setResaIngrediente, getStoreRese } from '../../src/lib/rese.js'

// helper: costruisce ingredienti_costi grezzo {nome: {costoKg, costoG}}
const ic = (m) => {
  const o = {}
  for (const [n, kg] of Object.entries(m)) o[n] = { costoKg: kg, costoG: kg / 1000 }
  return o
}
const ricetta = (nome, ingredienti, extra = {}) =>
  ({ nome, tipo: 'fetta', unita: 1, prezzo: 0, ingredienti, ...extra })

beforeEach(() => {
  // azzera le rese tra i test (store mutabile a livello modulo)
  for (const k of Object.keys(getStoreRese())) setResaIngrediente(k, 1.0)
})

describe('buildIngCosti', () => {
  it('mappa plurale->singolare (uova->uovo) e rende il lookup raggiungibile', () => {
    const built = buildIngCosti({ uova: { costoKg: 3, costoG: 0.003 } })
    expect(built[normIng('uova')]).toBeTruthy()
    expect(built['uovo'].costoG).toBeCloseTo(0.003, 6)
  })
  it('accetta costoG=0 come valore valido (ingrediente gratis: omaggio/orto/scarto)', () => {
    const built = buildIngCosti({ ing_zero_xyz: { costoKg: 0, costoG: 0 } })
    expect(built['ing_zero_xyz']).toBeTruthy()
    expect(built['ing_zero_xyz'].costoG).toBe(0)
    expect(built['ing_zero_xyz'].isStima).toBe(false)
  })
  it('ignora costoG NaN/undefined ma non sostituisce con HORECA se l\'utente ha scritto 0', () => {
    const built = buildIngCosti({
      ing_bad: { costoKg: 'x', costoG: NaN },
      ing_und: { costoKg: undefined },
    })
    expect(built['ing_bad']).toBeUndefined()
    expect(built['ing_und']).toBeUndefined()
  })
  it('un costoG=0 utente vince sul HORECA stimato (non viene gonfiato)', () => {
    // burro ha entry HORECA: se utente dice "il mio burro costa 0" → cost reale 0
    const built = buildIngCosti({ burro: { costoKg: 0, costoG: 0 } })
    expect(built['burro'].costoG).toBe(0)
    expect(built['burro'].isStima).toBe(false)
  })
})

describe('calcolaFC — base', () => {
  it('somma qty1stampo * costoG', () => {
    const ingCosti = buildIngCosti(ic({ ing_a: 1.0, ing_b: 2.0 })) // 0.001, 0.002 €/g
    const r = ricetta('R1', [
      { nome: 'ing_a', qty1stampo: 100 },
      { nome: 'ing_b', qty1stampo: 50 },
    ])
    const { tot, mancanti } = calcolaFC(r, ingCosti, { ricette: {} })
    expect(mancanti).toEqual([])
    expect(tot).toBeCloseTo(100 * 0.001 + 50 * 0.002, 3) // 0.2
  })

  it('ingrediente assente finisce in mancanti', () => {
    const ingCosti = buildIngCosti(ic({ ing_a: 1.0 }))
    const r = ricetta('R', [
      { nome: 'ing_a', qty1stampo: 100 },
      { nome: 'ingrediente_inesistente_q', qty1stampo: 10 },
    ])
    const { mancanti } = calcolaFC(r, ingCosti, { ricette: {} })
    expect(mancanti).toContain('ingrediente_inesistente_q')
  })
})

describe('calcolaFCDettaglio — breakdown', () => {
  it('la somma delle righe coincide col totale di calcolaFC, ordinate per costo', () => {
    const ingCosti = buildIngCosti(ic({ ing_a: 1.0, ing_b: 4.0 })) // 0.001, 0.004 €/g
    const r = ricetta('R', [
      { nome: 'ing_a', qty1stampo: 100 }, // 0.1
      { nome: 'ing_b', qty1stampo: 50 },  // 0.2
    ])
    const { tot } = calcolaFC(r, ingCosti, { ricette: {} })
    const dett = calcolaFCDettaglio(r, ingCosti, { ricette: {} })
    expect(dett.tot).toBeCloseTo(tot, 3)
    const somma = dett.righe.reduce((s, x) => s + x.costo, 0)
    expect(somma).toBeCloseTo(tot, 3)
    expect(dett.righe[0].nome).toBe('ing_b') // il più caro in cima
  })

  it('segnala gli ingredienti senza prezzo come mancante', () => {
    const ingCosti = buildIngCosti(ic({ ing_a: 1.0 }))
    const r = ricetta('R', [
      { nome: 'ing_a', qty1stampo: 100 },
      { nome: 'ingrediente_inesistente_z', qty1stampo: 10 },
    ])
    const dett = calcolaFCDettaglio(r, ingCosti, { ricette: {} })
    expect(dett.righe.some(x => x.mancante)).toBe(true)
  })
})

describe('calcolaFC — resa', () => {
  it('applica la resa di una foglia (costo / resa)', () => {
    const ingCosti = buildIngCosti(ic({ foglia_x: 10.0 })) // 0.01 €/g
    setResaIngrediente(normIng('foglia_x'), 0.5)
    const r = ricetta('R', [{ nome: 'foglia_x', qty1stampo: 100 }])
    const { tot } = calcolaFC(r, ingCosti, { ricette: {} })
    expect(tot).toBeCloseTo(100 * (0.01 / 0.5), 3) // 2.0
  })

  it('FIX: la resa del semilavorato SOSTITUISCE quelle delle foglie (calo una volta sola)', () => {
    const ingCosti = buildIngCosti(ic({ latte_x: 10.0 })) // 0.01 €/g
    const ricettario = { ricette: {
      'SEMI X': { nome: 'SEMI X', tipo: 'semilavorato', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'latte_x', qty1stampo: 100 }] },
      'TORTA X': { nome: 'TORTA X', tipo: 'fetta', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'semi x', qty1stampo: 50 }] },
    } }
    setResaIngrediente(normIng('latte_x'), 0.8) // resa foglia
    setResaIngrediente(normIng('semi x'), 0.5)  // resa semilavorato
    const { tot } = calcolaFC(ricettario.ricette['TORTA X'], ingCosti, ricettario)
    // CORRETTO (sostituzione): semiTot lordo=1.0, costoG=0.01, /0.5 => 0.02/g * 50 = 1.0
    // BUG (doppio calo) avrebbe dato 1.25
    expect(tot).toBeCloseTo(1.0, 3)
  })
})

describe('calcolaFC — semilavorati ed edge case', () => {
  it('risolve il costo di un semilavorato annidato', () => {
    const ingCosti = buildIngCosti(ic({ base_x: 4.0 })) // 0.004 €/g
    const ricettario = { ricette: {
      'CREMA': { nome: 'CREMA', tipo: 'semilavorato', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'base_x', qty1stampo: 200 }] }, // semiTot 0.8, peso 200 -> 0.004/g
      'DOLCE': { nome: 'DOLCE', tipo: 'fetta', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'crema', qty1stampo: 100 }] },  // 100 * 0.004 = 0.4
    } }
    const { tot, mancanti } = calcolaFC(ricettario.ricette['DOLCE'], ingCosti, ricettario)
    expect(mancanti).toEqual([])
    expect(tot).toBeCloseTo(0.4, 3)
  })

  it('semilavorato senza peso totale -> mancanti (non costo 0 silenzioso)', () => {
    const ingCosti = buildIngCosti(ic({ base_x: 4.0 }))
    const ricettario = { ricette: {
      'VUOTO': { nome: 'VUOTO', tipo: 'semilavorato', unita: 1, prezzo: 0, ingredienti: [] },
      'DOLCE': { nome: 'DOLCE', tipo: 'fetta', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'vuoto', qty1stampo: 100 }] },
    } }
    const { mancanti } = calcolaFC(ricettario.ricette['DOLCE'], ingCosti, ricettario)
    expect(mancanti.some(m => m.includes('VUOTO') || m.toLowerCase().includes('vuoto'))).toBe(true)
  })

  it('ciclo tra semilavorati: gestito senza loop infinito, ritorna risultato finito', () => {
    const ingCosti = buildIngCosti(ic({ base_x: 4.0 }))
    const ricettario = { ricette: {
      'A': { nome: 'A', tipo: 'semilavorato', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'b', qty1stampo: 50 }] },
      'B': { nome: 'B', tipo: 'semilavorato', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'a', qty1stampo: 50 }] },
    } }
    // 19/09/2026, audit della suite. Qui c'erano due sole asserzioni:
    // `Number.isFinite(res.tot)` e `Array.isArray(res.mancanti)`. Passavano
    // anche se il ciclo avesse prodotto `tot: 0` **senza dire niente**, che è
    // il caso peggiore: una ricetta che risulta gratis, margine al 100%, e
    // nessun avviso. Quello che davvero salva la situazione è il marker in
    // `mancanti` — e il marker non era provato da nessuno.
    const res = calcolaFC(ricettario.ricette['A'], ingCosti, ricettario)
    expect(Number.isFinite(res.tot), 'la ricorsione non deve andare all\'infinito').toBe(true)
    // Il costo non si può sapere: deve valere zero E dirlo.
    expect(res.tot).toBe(0)
    expect(res.mancanti.some(m => m.toLowerCase().includes('ciclo')),
      `un ciclo fra basi deve comparire fra i mancanti, invece: ${JSON.stringify(res.mancanti)}`).toBe(true)
  })

  // ── Quello che c'è intorno al ciclo: la profondità e i mancanti che risalgono ──
  //
  // 19/09/2026. La ricorsione sui semilavorati ha tre uscite (ciclo, oltre il
  // terzo livello, ingrediente senza prezzo) e due erano scoperte. Sono la
  // stessa famiglia: in tutte e tre il costo non si può sapere, e in tutte e
  // tre il danno non è il numero sbagliato — è il **silenzio**. Una ricetta
  // che costa 0 senza avvisi entra nel P&L come margine pieno.

  it('oltre il terzo livello di base dentro base, lo dice invece di tacere', () => {
    // Catena S1→S2→S3→S4→S5, con lo zucchero (2 €/kg) solo in fondo.
    const r = { ricette: {}, ingredienti_costi: {} }
    for (let i = 1; i <= 5; i++) {
      r.ricette['S' + i] = { nome: 'S' + i, tipo: 'semilavorato', unita: 1, prezzo: 0, totImpasto1: 1000,
        ingredienti: i === 5 ? [{ nome: 'zucchero', qty1stampo: 1000 }] : [{ nome: 'S' + (i + 1), qty1stampo: 1000 }] }
    }
    r.ricette.TOP = { nome: 'TOP', tipo: 'fetta', unita: 1, prezzo: 10, ingredienti: [{ nome: 'S1', qty1stampo: 1000 }] }
    const ingCosti = buildIngCosti(ic({ zucchero: 2 }))
    const res = calcolaFC(r.ricette.TOP, ingCosti, r)
    expect(res.tot).toBe(0)
    expect(res.mancanti.some(m => m.includes('annidato')),
      `la catena troppo profonda deve comparire fra i mancanti, invece: ${JSON.stringify(res.mancanti)}`).toBe(true)
  })

  it('e fino al terzo livello il conto arriva in fondo davvero', () => {
    // Il contrario del test di sopra: tre livelli devono funzionare, se no il
    // limite avrebbe mangiato anche i casi buoni. S3 = 1 kg di zucchero a 2 €.
    const r = { ricette: {}, ingredienti_costi: {} }
    for (let i = 1; i <= 3; i++) {
      r.ricette['S' + i] = { nome: 'S' + i, tipo: 'semilavorato', unita: 1, prezzo: 0, totImpasto1: 1000,
        ingredienti: i === 3 ? [{ nome: 'zucchero', qty1stampo: 1000 }] : [{ nome: 'S' + (i + 1), qty1stampo: 1000 }] }
    }
    const ingCosti = buildIngCosti(ic({ zucchero: 2 }))
    expect(calcolaFC(r.ricette.S1, ingCosti, r).tot).toBeCloseTo(2, 6)
    expect(calcolaFC(r.ricette.S1, ingCosti, r).mancanti).toEqual([])
  })

  it('un ingrediente senza prezzo dentro una base risale col nome della base davanti', () => {
    // Il difetto raccontato a foodcost.js:1167 — la ricorsione restituiva
    // `mancanti` e chi chiamava li buttava via: la scheda diceva «0
    // ingredienti senza prezzo» su un costo sottostimato, e l'avviso che fa
    // scoprire il margine al 96,4% non compariva mai.
    const r = {
      ricette: {
        GANACHE: { nome: 'GANACHE', tipo: 'semilavorato', unita: 1, prezzo: 0, totImpasto1: 1000,
          ingredienti: [{ nome: 'cioccolato', qty1stampo: 1000 }] },
        TARTUFO: { nome: 'TARTUFO', tipo: 'fetta', unita: 1, prezzo: 10,
          ingredienti: [{ nome: 'GANACHE', qty1stampo: 300 }] },
      },
      ingredienti_costi: {},
    }
    const res = calcolaFC(r.ricette.TARTUFO, {}, r)
    expect(res.tot).toBe(0)
    // Il nome si scrive «base › ingrediente», perché è lì che si va a correggerlo.
    expect(res.mancanti).toContain('GANACHE › cioccolato')
  })
})

describe('getPrezzoStoricoKg', () => {
  it('FIX: prezzo storico 0 = costo reale (non "sconosciuto")', () => {
    const log = [{ ingrediente: 'burro', prezzoNuovo: 0, prezzoVecchio: 5, data: '2020-01-01' }]
    expect(getPrezzoStoricoKg(log, 'burro', '2021-01-01')).toBe(0)
  })

  it('ritorna il prezzo attivo alla data; null se log vuoto', () => {
    const log = [
      { ingrediente: 'farina', prezzoNuovo: 2, prezzoVecchio: 1, data: '2026-01-01' },
    ]
    expect(getPrezzoStoricoKg(log, 'farina', '2026-06-01')).toBe(2) // dopo la modifica
    expect(getPrezzoStoricoKg(log, 'farina', '2025-06-01')).toBe(1) // prima -> prezzoVecchio
    expect(getPrezzoStoricoKg([], 'farina', '2026-06-01')).toBeNull()
  })
})

describe('calcolaFCStorico', () => {
  it('usa il prezzo storico quando disponibile, altrimenti il corrente', () => {
    const ingCosti = buildIngCosti(ic({ farina: 2.0 })) // corrente 0.002 €/g
    const log = [{ ingrediente: 'farina', prezzoNuovo: 1000, prezzoVecchio: 500, data: '2020-01-01' }]
    const r = ricetta('PANE', [{ nome: 'farina', qty1stampo: 100 }])
    // storico: prezzo 1000 €/kg => 1.0 €/g => 100g = 100
    const { tot } = calcolaFCStorico(r, ingCosti, { ricette: {} }, log, '2021-01-01')
    expect(tot).toBeCloseTo(100 * (1000 / 1000), 1)
  })

  it('FIX: prezzo storico 0 produce food cost 0 per quell\'ingrediente', () => {
    const ingCosti = buildIngCosti(ic({ omaggio: 9.0 })) // corrente alto
    const log = [{ ingrediente: 'omaggio', prezzoNuovo: 0, prezzoVecchio: 9, data: '2020-01-01' }]
    const r = ricetta('R', [{ nome: 'omaggio', qty1stampo: 100 }])
    const { tot } = calcolaFCStorico(r, ingCosti, { ricette: {} }, log, '2021-01-01')
    expect(tot).toBeCloseTo(0, 6) // usa 0, non il prezzo corrente
  })
})

// ── Arrivate da foodcostHelpers.test.js il 19/09/2026 ─────────────────────
// Quel file era un doppione di `foodcostUtils.test.js` (sette `describe` su
// otto con le stesse identiche asserzioni sulle stesse funzioni pure). Queste
// due prove erano l'unica cosa sua, e stanno bene qui.
describe('calcolaFCDettaglio — semilavorato sub-tree', () => {
  it('riconosce un ingrediente che è un semilavorato del ricettario e ricorre nel dettaglio', async () => {
    const { calcolaFCDettaglio, buildIngCosti } = await import('../../src/lib/foodcost.js')
    // Semilavorato CREMA: farina 100g (1€/kg) + zucchero 200g (1€/kg) = 0.3€ totale, peso 300g
    // Costo unitario semi = 0.3/300 = 0.001 €/g
    const ricettario = {
      ricette: {
        'CREMA TEST': {
          nome: 'CREMA TEST', tipo: 'semilavorato', unita: 0, prezzo: 0,
          ingredienti: [
            { nome: 'farina', qty1stampo: 100 },
            { nome: 'zucchero', qty1stampo: 200 },
          ],
        },
      },
    }
    const ingCosti = buildIngCosti({
      farina: { costoKg: 1, costoG: 0.001 },
      zucchero: { costoKg: 1, costoG: 0.001 },
    })
    // Ricetta che usa CREMA come ingrediente (250g)
    const ricetta = {
      nome: 'TORTA', tipo: 'fetta', unita: 1, prezzo: 0,
      ingredienti: [
        { nome: 'CREMA TEST', qty1stampo: 250 },
        { nome: 'farina', qty1stampo: 50 },
      ],
    }
    const { tot, righe } = calcolaFCDettaglio(ricetta, ingCosti, ricettario)
    expect(righe.length).toBe(2)
    const semiRow = righe.find(r => r.isSemilavorato)
    expect(semiRow, 'deve esistere una riga isSemilavorato:true').toBeTruthy()
    expect(semiRow.nome).toBe('CREMA TEST')
    // costo atteso semilavorato: 250 * (0.3/300) = 0.25 €
    expect(semiRow.costo).toBeCloseTo(0.25, 3)
    // costo atteso farina: 50 * 0.001 = 0.05 €
    expect(righe.find(r => r.nome === 'farina').costo).toBeCloseTo(0.05, 3)
    // totale: 0.30 (ordinato: semi prima per costo desc)
    expect(tot).toBeCloseTo(0.30, 3)
    expect(righe[0].nome).toBe('CREMA TEST')  // sort desc per costo
  })

  // Aggiornato 2026-09-09: il vecchio nome era "viene saltato silenziosamente" e
  // il test fissava proprio il difetto. Un semilavorato senza ingredienti che
  // sparisce dal dettaglio e' il caso peggiore: la riga non c'e', il totale non
  // la conta, e chi guarda non ha modo di sapere che manca un pezzo di costo.
  // Ora la riga c'e', vale 0 ed e' marcata mancante con il motivo scritto.
  it('semilavorato senza peso resta nel dettaglio, marcato e con il motivo', async () => {
    const { calcolaFCDettaglio, buildIngCosti } = await import('../../src/lib/foodcost.js')
    const ricettario = {
      ricette: {
        'SEMI VUOTO': {
          nome: 'SEMI VUOTO', tipo: 'semilavorato',
          ingredienti: [{ nome: 'farina', qty1stampo: 0 }],  // peso totale=0 → skip
        },
      },
    }
    const ingCosti = buildIngCosti({ farina: { costoKg: 1, costoG: 0.001 } })
    const ricetta = {
      nome: 'X', ingredienti: [{ nome: 'SEMI VUOTO', qty1stampo: 100 }],
    }
    const { tot, righe } = calcolaFCDettaglio(ricetta, ingCosti, ricettario)
    expect(righe.length).toBe(1)
    const r = righe[0]
    expect(r.nome).toBe('SEMI VUOTO')
    expect(r.costo).toBe(0)
    expect(r.mancante).toBe(true)
    expect(r.isSemilavorato).toBe(true)
    // Il motivo e' scritto in italiano perché finisce a schermo.
    expect(r.motivo).toMatch(/semilavorato senza ingredienti/)
    // Il totale resta 0: quel costo non e' noto, non lo inventiamo.
    expect(tot).toBe(0)
  })
})
