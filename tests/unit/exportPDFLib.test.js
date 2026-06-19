// exportPDF.js — wrapper jsPDF + autoTable per gli export "ricchi"
// (ricette, P&L, scadenzario, produzione, simulatore prezzi).
// Lo strato è UI-bound (disegna su jsPDF), quindi mockiamo jspdf
// e jspdf-autotable per smoke test: verifichiamo che ogni export
// non crashi, chiami `doc.save(...)` con un filename plausibile e
// invochi `autoTable` il numero atteso di volte.
//
// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mock jsPDF ----------------------------------------------------------
// Copre TUTTE le primitive usate in src/lib/exportPDF.js: header/footer,
// metadata (setProperties), watermark diagonale (saveGraphicsState +
// setGState + GState + restoreGraphicsState) e disegno KPI card.
const docState = { instances: [], saves: [] }

class FakeJsPDF {
  constructor(opts = {}) {
    this.opts = opts
    this._pages = 1
    this.internal = {
      pageSize: { width: opts.orientation === 'landscape' ? 842 : 595, height: opts.orientation === 'landscape' ? 595 : 842 },
      getNumberOfPages: () => this._pages,
    }
    // jspdf-autotable plugin imposta lastAutoTable: lo simuliamo via mock di autoTable.
    this.lastAutoTable = { finalY: 60 }
    docState.instances.push(this)
  }
  // Stato grafico
  setFillColor() { return this }
  setDrawColor() { return this }
  setTextColor() { return this }
  setFont() { return this }
  setFontSize() { return this }
  setLineWidth() { return this }
  // Disegno
  rect() { return this }
  roundedRect() { return this }
  line() { return this }
  text() { return this }
  splitTextToSize(s) { return [String(s)] }
  addImage() { return this }
  // Pagine
  addPage() { this._pages++; return this }
  setPage() { return this }
  // Metadata
  setProperties() { return this }
  // Watermark diagonale (GState DEVE essere usabile con `new`)
  saveGraphicsState() { return this }
  restoreGraphicsState() { return this }
  setGState() { return this }
  // class field bound al costruttore per supportare `new doc.GState({...})`
  GState = class { constructor(o) { Object.assign(this, o || {}) } }
  // Output
  save(name) { this.filename = name; docState.saves.push(name); return this }
  output() { return new Blob() }
}

vi.mock('jspdf', () => ({ default: FakeJsPDF, jsPDF: FakeJsPDF }))

const autoTableSpy = vi.fn((doc) => {
  // Simula l'avanzamento del cursor Y come fa jspdf-autotable.
  doc.lastAutoTable = { finalY: (doc.lastAutoTable?.finalY || 60) + 20 }
})
vi.mock('jspdf-autotable', () => ({ default: autoTableSpy }))

// Import dinamico DOPO i mock.
const mod = await import('../../src/lib/exportPDF.js')

beforeEach(() => {
  docState.instances.length = 0
  docState.saves.length = 0
  autoTableSpy.mockClear()
})

// ─── exportRicettaPDF ────────────────────────────────────────────────────
describe('exportRicettaPDF', () => {
  it('smoke: ricetta minima → save chiamato con filename slug', async () => {
    await mod.exportRicettaPDF(
      { nome: 'Tiramisù', categoria: 'Dolce', porzioni: 8, prezzo: 4.5, ingredienti: [] },
      { tot: 1.2, perc: 26.6 },
      {},
      'Mara dei Boschi',
      'martina@mara.it',
    )
    expect(docState.saves).toHaveLength(1)
    expect(docState.saves[0]).toMatch(/^ricetta-tiramis.+\.pdf$/)
    // info + ingredienti + riepilogo = 3 chiamate autoTable.
    expect(autoTableSpy).toHaveBeenCalledTimes(3)
  })

  it('ingredienti normalizzati: matcha plurale→singolare via costMap', async () => {
    const ingCosti = {
      mandorla: { costoKg: 18, costoG: 0.018 },
      uovo: { costoKg: 6, costoG: 0.006 },
    }
    await mod.exportRicettaPDF(
      {
        nome: 'Frolla',
        categoria: 'Base',
        porzioni: 1,
        prezzo: 0,
        ingredienti: [
          { nome: 'Mandorle', qty1stampo: 1500 },  // → 1.5 kg
          { nome: 'Uova', qty1stampo: 60 },
          { nome: 'Sale', qty1stampo: 0 },          // filtrato (qty 0)
          { nome: '', qty1stampo: 100 },             // filtrato (no nome)
        ],
      },
      null, // foodCost null → calcolato da rows
      ingCosti,
    )
    expect(docState.saves[0]).toMatch(/frolla/)
    // Il filename usa slug nome senza emailUtente.
    expect(autoTableSpy).toHaveBeenCalledTimes(3)
  })

  it('backwards-compat: 3° arg stringa → trattato come nomeAttivita', async () => {
    await mod.exportRicettaPDF(
      { nome: 'Test', ingredienti: [] },
      { tot: 0, perc: 0 },
      'Pasticceria Legacy',  // <-- nomeAttivita come 3° arg
    )
    expect(docState.saves[0]).toMatch(/ricetta-test/)
  })

  it('nessun ingrediente → riga placeholder, non crasha', async () => {
    await mod.exportRicettaPDF(
      { nome: 'Vuota', ingredienti: [] },
      undefined,
      {},
    )
    expect(docState.saves).toHaveLength(1)
  })

  it('ricetta senza nome → filename fallback "export"', async () => {
    await mod.exportRicettaPDF({ ingredienti: [] }, {}, {})
    expect(docState.saves[0]).toBe('ricetta-export.pdf')
  })
})

// ─── exportPLMensile ─────────────────────────────────────────────────────
describe('exportPLMensile', () => {
  it('dati completi → 3 tabelle (ricavi, costi, riepilogo) + filename mese-anno', async () => {
    await mod.exportPLMensile(
      {
        ricavi: [
          { categoria: 'Dolci', quantita: 120, ricavo: 800 },
          { categoria: 'Gelati', quantita: 80, ricavo: 400 },
        ],
        costi: [
          { categoria: 'Latticini', costo: 150, perc: 30 },
          { categoria: 'Frutta', costo: 90, perc: 22.5 },
        ],
      },
      'Maggio', '2026',
      'Mara dei Boschi',
      'martina@mara.it',
    )
    expect(docState.saves[0]).toBe('pl-maggio-2026.pdf')
    expect(autoTableSpy).toHaveBeenCalledTimes(3)
  })

  it('array vuoti → placeholder, no crash', async () => {
    await mod.exportPLMensile({}, undefined, undefined)
    expect(docState.saves[0]).toMatch(/^pl-mensile-\.pdf$/)
    expect(autoTableSpy).toHaveBeenCalledTimes(3)
  })
})

// ─── exportPLCompleto ────────────────────────────────────────────────────
describe('exportPLCompleto', () => {
  it('smoke con rows + insights + topIngredienti', async () => {
    const rows = [
      { nome: 'Cannolo', reg: { unita: 12, prezzo: 2.5, tipo: 'singolo' }, ricavo: 30, fc: 9, margine: 21, margPct: 70, fcPct: 30, fcUnita: 0.75, mrgUnita: 1.75 },
      { nome: 'Babà',    reg: { unita: 8,  prezzo: 3.0, tipo: 'singolo' }, ricavo: 24, fc: 12, margine: 12, margPct: 50, fcPct: 50, fcUnita: 1.5,  mrgUnita: 1.5 },
      { nome: 'Crostata',reg: { unita: 6,  prezzo: 5.0, tipo: 'torta'   }, ricavo: 30, fc: 18, margine: 12, margPct: 40, fcPct: 60, fcUnita: 3.0,  mrgUnita: 2.0 },
    ]
    await mod.exportPLCompleto(
      {
        rows,
        topIngredienti: [
          { nome: 'Burro', costoTot: 1200, perc: 18 },
          { nome: 'Zucchero', costoTot: 800, perc: 12 },
        ],
        fcAvg: 46.7, avgMarg: 53.3,
        totRicavo: 84, totFC: 39, totMargine: 45,
        insights: [
          { tipo: 'critical', testo: 'Babà sotto soglia margine' },
          { tipo: 'warn',     testo: 'FC frutta sopra 35%' },
          { tipo: 'ok',       testo: 'Cannoli ben sopra target' },
        ],
        mese: 'Maggio', anno: '2026',
      },
      'Mara dei Boschi',
      'martina@mara.it',
    )
    expect(docState.saves).toHaveLength(1)
    expect(docState.saves[0]).toMatch(/^pl-completo-\d{4}-\d{2}-\d{2}\.pdf$/)
    // insights + P&L + sensitivity + topIngredienti = 4 tabelle.
    expect(autoTableSpy).toHaveBeenCalledTimes(4)
  })

  it('senza insights e senza topIngredienti → solo 2 tabelle', async () => {
    await mod.exportPLCompleto({
      rows: [{ nome: 'X', reg: { prezzo: 2 }, ricavo: 10, fc: 4, margine: 6, margPct: 60, fcPct: 40 }],
      fcAvg: 40, avgMarg: 60, totRicavo: 10, totFC: 4, totMargine: 6,
    })
    expect(autoTableSpy).toHaveBeenCalledTimes(2)
  })

  it('rows vuoto → label fallback "0 prodotti", non crasha', async () => {
    await mod.exportPLCompleto({})
    expect(docState.saves).toHaveLength(1)
  })

  it('didParseCell color logic: copre i 3 rami fcPct/margPct (verde/giallo/rosso)', async () => {
    const rows = [
      { nome: 'A', reg: { prezzo: 5 }, ricavo: 10, fc: 2,  margine: 8, margPct: 80, fcPct: 20 }, // verde su entrambi
      { nome: 'B', reg: { prezzo: 5 }, ricavo: 10, fc: 3.5,margine: 6.5,margPct: 50, fcPct: 35 }, // giallo
      { nome: 'C', reg: { prezzo: 5 }, ricavo: 10, fc: 5,  margine: 5, margPct: 30, fcPct: 50 }, // rosso
    ]
    await mod.exportPLCompleto({ rows, fcAvg: 35, avgMarg: 53, totRicavo: 30, totFC: 10.5, totMargine: 19.5 })
    // Esercita didParseCell del P&L per prodotto (col 5 fcPct, col 7 margPct).
    const plCall = autoTableSpy.mock.calls.find(([, o]) => Array.isArray(o.body) && o.body.length === 4) // 3 prodotti + riga totale
    expect(plCall).toBeTruthy()
    const opts = plCall[1]
    // Esegui manualmente didParseCell sui 3 rami × 2 colonne.
    const sorted = [...rows].sort((a, b) => (b.margPct || 0) - (a.margPct || 0))
    ;[5, 7].forEach(colIdx => {
      for (let i = 0; i < sorted.length; i++) {
        const data = { section: 'body', row: { index: i }, column: { index: colIdx }, cell: { styles: {} } }
        opts.didParseCell(data)
        expect(data.cell.styles.fontStyle).toBe('bold')
      }
    })
    // Anche la riga "totale" (index fuori) deve essere ignorata senza errori.
    const dataTot = { section: 'body', row: { index: sorted.length }, column: { index: 5 }, cell: { styles: {} } }
    expect(() => opts.didParseCell(dataTot)).not.toThrow()
  })

  it('insights didParseCell colora label per tipo', async () => {
    await mod.exportPLCompleto({
      rows: [],
      insights: [
        { tipo: 'critical', testo: 'a' },
        { tipo: 'warn',     testo: 'b' },
        { tipo: 'ok',       testo: 'c' },
      ],
      fcAvg: 0, avgMarg: 0, totRicavo: 0, totFC: 0, totMargine: 0,
    })
    const insightsCall = autoTableSpy.mock.calls.find(([, o]) => Array.isArray(o.head) && o.head[0]?.[1] === 'Insight')
    expect(insightsCall).toBeTruthy()
    const opts = insightsCall[1]
    // Esercita ramo column.index === 0 sui 3 tipi.
    for (let i = 0; i < 3; i++) {
      const data = { row: { index: i }, column: { index: 0 }, cell: { styles: {} } }
      opts.didParseCell(data)
      expect(data.cell.styles.textColor).toBeTruthy()
    }
    // Column != 0 → nessun colore impostato.
    const data2 = { row: { index: 0 }, column: { index: 1 }, cell: { styles: {} } }
    opts.didParseCell(data2)
    expect(data2.cell.styles.textColor).toBeUndefined()
  })
})

// ─── exportSimulatorePrezzi ──────────────────────────────────────────────
describe('exportSimulatorePrezzi', () => {
  it('smoke con scenRows changed + raccomandazioni', async () => {
    await mod.exportSimulatorePrezzi(
      {
        orizzonteGiorni: 60,
        scenRows: [
          { nome: 'Cannolo', reg: { prezzo: 2.5 }, fc: 0.75, margine: 1.75, margPct: 70, newPrezzo: 3.0, delta: 20, newRicavo: 3.0, newMarg: 2.25, newMargPct: 75, diffMarg: 0.5, proiBase: 1.75, proiScen: 2.25, proiDiff: 30, changed: true },
          { nome: 'Babà',    reg: { prezzo: 3.0 }, fc: 1.5,  margine: 1.5,  margPct: 50, newPrezzo: 2.5, delta: -16.7, newRicavo: 2.5, newMarg: 1.0, newMargPct: 40, diffMarg: -0.5, proiBase: 1.5, proiScen: 1.0, proiDiff: -30, changed: true },
          { nome: 'Crostata', reg: { prezzo: 5 }, fc: 3, margine: 2, margPct: 40, newPrezzo: 5, delta: 0, newRicavo: 5, newMarg: 2, newMargPct: 40, diffMarg: 0, proiBase: 2, proiScen: 2, proiDiff: 0, changed: false },
        ],
        totBaseRicavo: 10.5, totScenRicavo: 10.5, totBaseMarg: 5.25, totScenMarg: 5.25,
        totProiBase: 5.25, totProiScen: 5.25, totProiDiff: 0,
        raccomandazioni: ['Alza il Cannolo del 10%', 'Lascia il Babà'],
      },
      'Mara dei Boschi',
      'martina@mara.it',
    )
    expect(docState.saves[0]).toMatch(/^simulatore-prezzi-\d{4}-\d{2}-\d{2}\.pdf$/)
    // Raccomandazioni + scenario = 2 tabelle.
    expect(autoTableSpy).toHaveBeenCalledTimes(2)
  })

  it('nessun changed → mostra listino corrente intero', async () => {
    await mod.exportSimulatorePrezzi({
      scenRows: [
        { nome: 'A', reg: { prezzo: 2 }, fc: 1, margine: 1, margPct: 50, newPrezzo: 2, delta: 0, newRicavo: 2, newMarg: 1, newMargPct: 50, diffMarg: 0, proiBase: 1, proiScen: 1, proiDiff: 0, changed: false },
      ],
      totBaseRicavo: 2, totScenRicavo: 2, totBaseMarg: 1, totScenMarg: 1, totProiBase: 1, totProiScen: 1, totProiDiff: 0,
    })
    expect(docState.saves).toHaveLength(1)
    expect(autoTableSpy).toHaveBeenCalledTimes(1)
  })

  it('input vuoto → non crasha', async () => {
    await mod.exportSimulatorePrezzi({})
    expect(docState.saves).toHaveLength(1)
  })

  it('didParseCell: colora delta/diffMarg/proiDiff secondo segno', async () => {
    const scenRows = [
      { nome: 'Up',   reg: { prezzo: 2 }, fc: 0.5, margine: 1.5, margPct: 75, newPrezzo: 2.5, delta: 25,  newRicavo: 2.5, newMarg: 2,   newMargPct: 80, diffMarg: 0.5,  proiBase: 1.5, proiScen: 2,   proiDiff: 15,  changed: true },
      { nome: 'Down', reg: { prezzo: 2 }, fc: 0.5, margine: 1.5, margPct: 75, newPrezzo: 1.5, delta: -25, newRicavo: 1.5, newMarg: 1,   newMargPct: 67, diffMarg: -0.5, proiBase: 1.5, proiScen: 1,   proiDiff: -15, changed: true },
    ]
    await mod.exportSimulatorePrezzi({
      scenRows, totBaseRicavo: 4, totScenRicavo: 4, totBaseMarg: 3, totScenMarg: 3, totProiBase: 3, totProiScen: 3, totProiDiff: 0,
    })
    const scenarioCall = autoTableSpy.mock.calls.find(([, o]) => Array.isArray(o.head) && Array.isArray(o.head[0]) && o.head[0][0] === 'Prodotto')
    expect(scenarioCall).toBeTruthy()
    const opts = scenarioCall[1]
    // Esercita didParseCell sui 3 indici colorati × 2 righe.
    for (const colIdx of [3, 6, 7]) {
      for (let i = 0; i < 2; i++) {
        const data = { section: 'body', row: { index: i }, column: { index: colIdx }, cell: { styles: {} } }
        opts.didParseCell(data)
        expect(data.cell.styles.fontStyle).toBe('bold')
      }
    }
    // Riga out-of-range → no throw, no style.
    const dataOut = { section: 'body', row: { index: 99 }, column: { index: 3 }, cell: { styles: {} } }
    expect(() => opts.didParseCell(dataOut)).not.toThrow()
    expect(dataOut.cell.styles.fontStyle).toBeUndefined()
    // Section head → ignorato.
    const dataHead = { section: 'head', row: { index: 0 }, column: { index: 3 }, cell: { styles: {} } }
    expect(() => opts.didParseCell(dataHead)).not.toThrow()
  })
})

// ─── exportProduzione ────────────────────────────────────────────────────
describe('exportProduzione', () => {
  it('smoke: raggruppa per categoria + tabella totale', async () => {
    await mod.exportProduzione(
      [
        { nome: 'Cannolo',  categoria: 'Dolci',  quantita: 24, unita: 'pz', costo: 0.5 },
        { nome: 'Babà',     categoria: 'Dolci',  quantita: 12, unita: 'pz', costo: 0.7 },
        { nome: 'Gelato V', categoria: 'Gelati', quantita: 5,  unita: 'kg', costo: 4.0 },
      ],
      '2026-06-18',
      'Mara dei Boschi',
      'martina@mara.it',
    )
    expect(docState.saves[0]).toMatch(/^produzione-2026-06-18\.pdf$/)
    // 2 categorie + totale = 3 tabelle.
    expect(autoTableSpy).toHaveBeenCalledTimes(3)
  })

  it('item senza categoria → finisce in "Altro"', async () => {
    await mod.exportProduzione([{ nome: 'X', quantita: 1, costo: 1 }], undefined)
    expect(docState.saves[0]).toBe('produzione-export.pdf')
    // 1 categoria + totale = 2 tabelle.
    expect(autoTableSpy).toHaveBeenCalledTimes(2)
  })

  it('dati vuoti / undefined → solo tabella totale, no crash', async () => {
    await mod.exportProduzione(undefined, '2026/06/18')
    expect(docState.saves[0]).toBe('produzione-2026-06-18.pdf')
    expect(autoTableSpy).toHaveBeenCalledTimes(1)
  })
})

// ─── exportScadenzario ───────────────────────────────────────────────────
describe('exportScadenzario', () => {
  it('smoke: raggruppa per fornitore + tabella riepilogo + landscape', async () => {
    await mod.exportScadenzario(
      [
        { fornitore: 'Caffè SRL', numero_fattura: 'F001', data_fattura: '2026-05-01', data_scadenza: '2026-06-01', stato: 'da_pagare', imponibile: 100, imposta: 22, totale: 122 },
        { fornitore: 'Caffè SRL', numero_fattura: 'F002', data_fattura: '2026-05-15', data_scadenza: '2026-06-15', stato: 'pagata',     imponibile: 50,  imposta: 11, totale: 61  },
        { fornitore: 'Latte SPA', numero_fattura: 'L010',                                                          stato: 'in_scadenza', imponibile: 200, imposta: 22, totale: 222 },
        { numero_fattura: 'X', totale: 10 }, // senza fornitore → "Senza fornitore"
      ],
      'Mara dei Boschi',
      'martina@mara.it',
    )
    expect(docState.saves[0]).toBe('scadenzario-fatture.pdf')
    // Landscape detection: width = 842 sul primo doc.
    expect(docState.instances[0].opts.orientation).toBe('landscape')
    // 3 fornitori + riepilogo = 4 tabelle.
    expect(autoTableSpy).toHaveBeenCalledTimes(4)
  })

  it('lista vuota → header "0 fatture" + solo tabella riepilogo', async () => {
    await mod.exportScadenzario([])
    expect(docState.saves[0]).toBe('scadenzario-fatture.pdf')
    expect(autoTableSpy).toHaveBeenCalledTimes(1)
  })
})

// ─── module sanity ───────────────────────────────────────────────────────
describe('exportPDF module', () => {
  it('espone tutte le 6 funzioni come async', () => {
    for (const n of [
      'exportRicettaPDF', 'exportPLMensile', 'exportPLCompleto',
      'exportSimulatorePrezzi', 'exportProduzione', 'exportScadenzario',
    ]) {
      expect(typeof mod[n]).toBe('function')
    }
  })

  it('lazy-load: secondo invoke non re-importa jsPDF (stesso costruttore)', async () => {
    await mod.exportProduzione([], '2026-01-01')
    const first = docState.instances.length
    await mod.exportProduzione([], '2026-01-02')
    expect(docState.instances.length).toBe(first + 1)
    // Tutti istanze della stessa classe.
    expect(docState.instances[0]).toBeInstanceOf(FakeJsPDF)
    expect(docState.instances[docState.instances.length - 1]).toBeInstanceOf(FakeJsPDF)
  })
})
