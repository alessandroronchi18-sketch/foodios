// parseRicettario — parser Excel ricettario per onboarding utenti.
// Mock di loadXLSX (CDN-loader browser-only) per testare in environment node.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stato condiviso del mock: ogni test prepara `mockSheets` (mappa
// nomeSheet → rows). Il mock di loadXLSX restituisce l'API SheetJS minima
// (read + utils.sheet_to_json) costruita su questa struttura.
let mockSheets = {}

vi.mock('../../src/lib/xlsx', () => {
  return {
    loadXLSX: vi.fn(async () => ({
      read: () => ({
        SheetNames: Object.keys(mockSheets),
        Sheets: Object.fromEntries(
          Object.keys(mockSheets).map(n => [n, { __rows: mockSheets[n] }])
        ),
      }),
      utils: {
        sheet_to_json: (ws) => ws.__rows,
      },
    })),
  }
})

import { parseRicettario } from '../../src/lib/parseRicettario'

// File "finto": basta che esponga arrayBuffer() — il contenuto non viene
// guardato perché XLSX.read è mockato.
function fakeFile() {
  return { arrayBuffer: async () => new ArrayBuffer(0) }
}

describe('parseRicettario — sheet ingredienti', () => {
  beforeEach(() => { mockSheets = {} })

  it('legge tabella prezzi da sheet "Ingredienti"', async () => {
    // NB: parseNum considera "X,nnn" con esattamente 3 cifre dopo virgola
    // come separatore migliaia. Per i decimali <1 usiamo number diretti
    // (rappresentano il caso "cella numerica Excel").
    mockSheets = {
      Ingredienti: [
        ['Nome', 'CostoKg', 'CostoG'],
        ['Farina', '1,50', 0.0015],
        ['Zucchero', 2, 0.002],
      ],
    }
    const { ingredienti_costi, ricette } = await parseRicettario(fakeFile())
    // normIng lowercase i nomi
    expect(ingredienti_costi.farina).toEqual({ costoKg: 1.5, costoG: 0.0015 })
    expect(ingredienti_costi.zucchero).toEqual({ costoKg: 2, costoG: 0.002 })
    expect(ricette).toEqual({})
  })

  it('riconosce sheet "ingredient" anche con casing/varianti (ingredienti, INGREDIENT_LIST)', async () => {
    mockSheets = {
      INGREDIENT_LIST: [
        ['Nome', 'Kg', 'G'],
        ['Burro', 5, 0.005],
      ],
    }
    const { ingredienti_costi } = await parseRicettario(fakeFile())
    expect(ingredienti_costi.burro).toEqual({ costoKg: 5, costoG: 0.005 })
  })

  it('salta righe con nome vuoto/non stringa nel sheet ingredienti', async () => {
    mockSheets = {
      Ingredienti: [
        ['Nome', 'Kg', 'G'],
        [null, 1, 0.001],
        ['', 2, 0.002],
        [123, 3, 0.003], // non stringa
        ['Cacao', '4,5', '0,0045'],
      ],
    }
    const { ingredienti_costi } = await parseRicettario(fakeFile())
    expect(Object.keys(ingredienti_costi)).toEqual(['cacao'])
  })
})

describe('parseRicettario — sheet ricetta', () => {
  beforeEach(() => { mockSheets = {} })

  // Helper per costruire un sheet ricetta valido (rispetta layout
  // documentato: row 0 nome+totImpasto, row 1 numStampi, row 2 foodCost,
  // rows 3-6 header, rows 7+ ingredienti).
  function ricettaRows({ nome = 'Tiramisù', numStampi = 4, totImpasto = 1200, foodCost = 8.5, ingredienti = [], note = null } = {}) {
    const rows = [
      ['Ricetta', nome, null, null, null, totImpasto],
      ['Stampi', numStampi],
      ['FoodCost', null, null, null, null, foodCost],
      [], [], [], [],
    ]
    for (const ing of ingredienti) {
      rows.push([ing.nome, ing.qty, ing.costoG, ing.costoStampo])
    }
    if (note) rows.push([note])
    return rows
  }

  it('estrae nome, numStampi, totImpasto, foodCost e ingredienti', async () => {
    mockSheets = {
      Sheet1: ricettaRows({
        nome: 'Tiramisù',
        numStampi: 4,
        totImpasto: 1200,
        foodCost: 8.5,
        ingredienti: [
          { nome: 'Mascarpone', qty: 250, costoG: 0.008, costoStampo: 2 },
          { nome: 'Uova', qty: 4, costoG: '0,30', costoStampo: 1.2 },
        ],
      }),
    }
    const { ricette } = await parseRicettario(fakeFile())
    expect(Object.keys(ricette)).toEqual(['Tiramisù'])
    const r = ricette['Tiramisù']
    expect(r.nome).toBe('Tiramisù')
    expect(r.sheetName).toBe('Sheet1')
    expect(r.numStampi).toBe(4)
    expect(r.totImpasto1).toBe(1200)
    expect(r.foodCost1).toBe(8.5)
    expect(r.ingredienti).toHaveLength(2)
    expect(r.ingredienti[0]).toEqual({
      nome: 'Mascarpone',
      qty1stampo: 250,
      costoPerG: 0.008,
      costo1stampo: 2,
    })
    expect(r.ingredienti[1].costoPerG).toBe(0.30)
  })

  it('parseNum gestisce formato IT "1.234,56" e "12,50"', async () => {
    // NB: parseNum tratta "0,005" come "5 migliaia" (after.length===3); usiamo
    // formati che esercitano i casi gestiti distintamente da parseNum.
    mockSheets = {
      Sheet1: ricettaRows({
        nome: 'X',
        totImpasto: '1.234,56',
        ingredienti: [{ nome: 'A', qty: '1.000', costoG: 0.005, costoStampo: '12,50' }],
      }),
    }
    const { ricette } = await parseRicettario(fakeFile())
    expect(ricette.X.totImpasto1).toBe(1234.56)
    expect(ricette.X.ingredienti[0].qty1stampo).toBe(1000) // "1.000" → 1000 (migliaia)
    expect(ricette.X.ingredienti[0].costoPerG).toBe(0.005)
    expect(ricette.X.ingredienti[0].costo1stampo).toBe(12.5)
  })

  it('numStampi=0 → default 1 (cella svuotata)', async () => {
    mockSheets = { Sheet1: ricettaRows({ nome: 'Y', numStampi: 0 }) }
    const { ricette } = await parseRicettario(fakeFile())
    expect(ricette.Y.numStampi).toBe(1)
  })

  it('numStampi non finito (NaN/undefined) → default 1', async () => {
    mockSheets = { Sheet1: ricettaRows({ nome: 'Y', numStampi: 'pippo' }) }
    const { ricette } = await parseRicettario(fakeFile())
    expect(ricette.Y.numStampi).toBe(1)
  })

  it('fallback nome ricetta: row0[1] vuoto → row0[0] → sheetName', async () => {
    mockSheets = {
      MioSheet: [
        [null, null], // sia [0] che [1] vuoti
        ['Stampi', 2],
        ['FC', null, null, null, null, 5],
        [], [], [], [],
        ['Farina', 100, 0.001, 0.1],
      ],
    }
    const { ricette } = await parseRicettario(fakeFile())
    expect(ricette.MioSheet).toBeDefined()
    expect(ricette.MioSheet.sheetName).toBe('MioSheet')
  })

  it('skippa ricette con nomi placeholder (NaN, undefined, "Nome ricetta")', async () => {
    mockSheets = {
      A: ricettaRows({ nome: 'NaN' }),
      B: ricettaRows({ nome: 'Nome ricetta' }),
      C: ricettaRows({ nome: 'NOME RICETTA' }),
      D: ricettaRows({ nome: 'undefined' }),
      E: ricettaRows({ nome: 'Ricetta' }),
    }
    const { ricette } = await parseRicettario(fakeFile())
    expect(Object.keys(ricette)).toEqual([])
  })

  it('skippa ricette con nome non-stringa o vuoto', async () => {
    mockSheets = {
      A: ricettaRows({ nome: '' }),
      // nome forzato a numero
      B: [[null, 12345, null, null, null, 100], ['Stampi', 1], ['FC', null,null,null,null,1], [],[],[],[]],
    }
    const { ricette } = await parseRicettario(fakeFile())
    expect(Object.keys(ricette)).toEqual([])
  })

  it('stop su riga "Totale" e "Note" dentro la lista ingredienti', async () => {
    mockSheets = {
      Sheet1: [
        ['R', 'TortaMele', null, null, null, 500],
        ['S', 1],
        ['FC', null,null,null,null,3],
        [],[],[],[],
        ['Mele', 200, 0.002, 0.4],
        ['Zucchero', 100, 0.003, 0.3],
        ['Totale impasto', 300, null, 0.7],
        ['Burro', 50, 0.01, 0.5], // post-Totale: NON deve essere incluso
      ],
    }
    const { ricette } = await parseRicettario(fakeFile())
    expect(ricette.TortaMele.ingredienti).toHaveLength(2)
    expect(ricette.TortaMele.ingredienti.map(i => i.nome)).toEqual(['Mele', 'Zucchero'])
  })

  it('salta righe header ripetute ("ingrediente", "Ingredienti")', async () => {
    mockSheets = {
      Sheet1: [
        ['R', 'Pan', null, null, null, 200],
        ['S', 1],
        ['FC', null, null, null, null, 2],
        [], [], [], [],
        ['Ingrediente', null, null, null], // header → skip
        ['Farina', 100, 0.001, 0.1],
        ['ingredienti', null, null, null], // header → skip
        ['Acqua', 50, 0, 0],
      ],
    }
    const { ricette } = await parseRicettario(fakeFile())
    expect(ricette.Pan.ingredienti.map(i => i.nome)).toEqual(['Farina', 'Acqua'])
  })

  it('estrae nota cottura (contiene "°" o "min") dalle ultime 6 righe', async () => {
    mockSheets = {
      Sheet1: [
        ['R', 'Brioche', null, null, null, 800],
        ['S', 2],
        ['FC', null, null, null, null, 4],
        [], [], [], [],
        ['Farina', 500, 0.001, 0.5],
        ['Cottura 180° per 25 min'],
      ],
    }
    const { ricette } = await parseRicettario(fakeFile())
    expect(ricette.Brioche.note).toBe('Cottura 180° per 25 min')
  })

  it('nota vuota se nessuna riga finale contiene "°"/"min"', async () => {
    mockSheets = {
      Sheet1: ricettaRows({ nome: 'NoNote', ingredienti: [{ nome: 'A', qty: 1, costoG: 0, costoStampo: 0 }] }),
    }
    const { ricette } = await parseRicettario(fakeFile())
    expect(ricette.NoNote.note).toBe('')
  })

  it('multi-sheet: aggrega ricette + tabella prezzi', async () => {
    mockSheets = {
      Tiramisu: ricettaRows({ nome: 'Tiramisu', ingredienti: [{ nome: 'Uova', qty: 4, costoG: 0.3, costoStampo: 1.2 }] }),
      Cheesecake: ricettaRows({ nome: 'Cheesecake', ingredienti: [{ nome: 'Philadelphia', qty: 300, costoG: 0.01, costoStampo: 3 }] }),
      Ingredienti: [
        ['Nome', 'Kg', 'G'],
        ['Uova', 4, 0.004], // normIng applica plural→singular: chiave finale = 'uovo'
        ['Philadelphia', 10, 0.01],
      ],
    }
    const { ricette, ingredienti_costi } = await parseRicettario(fakeFile())
    expect(Object.keys(ricette).sort()).toEqual(['Cheesecake', 'Tiramisu'])
    expect(ingredienti_costi.uovo).toEqual({ costoKg: 4, costoG: 0.004 })
    expect(ingredienti_costi.philadelphia).toEqual({ costoKg: 10, costoG: 0.01 })
  })

  it('numero come typeof number passa attraverso (no parseNum)', async () => {
    mockSheets = {
      Sheet1: ricettaRows({
        nome: 'Z',
        totImpasto: 999.5, // number diretto
        ingredienti: [{ nome: 'X', qty: 42, costoG: 0.123, costoStampo: 5 }],
      }),
    }
    const { ricette } = await parseRicettario(fakeFile())
    expect(ricette.Z.totImpasto1).toBe(999.5)
    expect(ricette.Z.ingredienti[0].qty1stampo).toBe(42)
  })

  it('number non finito (Infinity) → 0', async () => {
    mockSheets = {
      Sheet1: ricettaRows({ nome: 'I', totImpasto: Infinity }),
    }
    const { ricette } = await parseRicettario(fakeFile())
    expect(ricette.I.totImpasto1).toBe(0)
  })

  it('null/empty value → 0', async () => {
    mockSheets = {
      Sheet1: [
        ['R', 'Vuoto', null, null, null, null],
        ['S', null],
        ['FC', null, null, null, null, null],
        [], [], [], [],
        ['Farina', null, null, null],
      ],
    }
    const { ricette } = await parseRicettario(fakeFile())
    expect(ricette.Vuoto.totImpasto1).toBe(0)
    expect(ricette.Vuoto.foodCost1).toBe(0)
    expect(ricette.Vuoto.numStampi).toBe(1) // 0 → default 1
    expect(ricette.Vuoto.ingredienti[0]).toEqual({
      nome: 'Farina', qty1stampo: 0, costoPerG: 0, costo1stampo: 0,
    })
  })
})
