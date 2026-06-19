// importDelivery — copre Glovo (XLSX), UberEats edge, applyGenericMapping
// con fonte custom, mergeInChiusure replace-by-fonte, header detection
// flessibile. Estende importDelivery.test.js esistente.

import { describe, it, expect, vi } from 'vitest'

// Mock loadXLSX (window non disponibile in node; il modulo ha fallback fetch).
// Strategia: mock di window.XLSX prima dell'import.
global.window = global.window || {}
global.window.XLSX = {
  read: vi.fn(() => ({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } })),
  utils: {
    sheet_to_json: vi.fn(() => [
      { 'Data ordine': '15/06/2026', 'Totale': '50.00', 'Commissione Glovo': '5.00' },
      { 'Data ordine': '16/06/2026', 'Totale': '30.00', 'Commissione Glovo': '3.00' },
    ]),
  },
}

import {
  parseDeliveroo, parseJustEat, parseUberEats, parseGlovo,
  parseGenericCSV, applyGenericMapping, mergeInChiusure,
} from '../../src/lib/importDelivery'

describe('parseGlovo (XLSX)', () => {
  it('legge wb e applica aggregazione, fonte=Glovo', async () => {
    const fakeFile = { arrayBuffer: async () => new ArrayBuffer(0) }
    const r = await parseGlovo(fakeFile)
    expect(r).toBeInstanceOf(Array)
    expect(r.length).toBe(2)
    expect(r[0].fonte).toBe('Glovo')
  })

  it('column detection fallback (header diverso)', async () => {
    global.window.XLSX.utils.sheet_to_json.mockReturnValueOnce([
      { 'Order Date': '15/06/2026', 'Total': '40' },
    ])
    const r = await parseGlovo({ arrayBuffer: async () => new ArrayBuffer(0) })
    expect(r.length).toBe(1)
  })

  it('file vuoto → []', async () => {
    global.window.XLSX.utils.sheet_to_json.mockReturnValueOnce([])
    const r = await parseGlovo({ arrayBuffer: async () => new ArrayBuffer(0) })
    expect(r).toEqual([])
  })
})

describe('mergeInChiusure — branch extra', () => {
  it('crea chiusura nuova con kpi.totV=netto se data assente', () => {
    const out = mergeInChiusure([], [
      { data: '2026-06-15', importo: 100, commissione: 10, netto: 90, ordini: 5 },
    ], 'Deliveroo')
    expect(out).toHaveLength(1)
    expect(out[0].kpi.totV).toBe(90)
    expect(out[0].delivery[0].fonte).toBe('Deliveroo')
  })

  it('replace delivery con stessa fonte (no duplicati)', () => {
    const ch = [{
      data: '2026-06-15',
      delivery: [{ fonte: 'Deliveroo', importo: 100, netto: 90 }],
    }]
    const out = mergeInChiusure(ch, [
      { data: '2026-06-15', importo: 200, commissione: 20, netto: 180 },
    ], 'Deliveroo')
    // La nuova versione SOSTITUISCE quella precedente per stessa fonte
    expect(out[0].delivery.filter(d => d.fonte === 'Deliveroo')).toHaveLength(1)
    expect(out[0].delivery.find(d => d.fonte === 'Deliveroo').netto).toBe(180)
  })

  it('preserva delivery di ALTRE fonti', () => {
    const ch = [{
      data: '2026-06-15',
      delivery: [{ fonte: 'Glovo', netto: 50 }],
    }]
    const out = mergeInChiusure(ch, [
      { data: '2026-06-15', netto: 70 },
    ], 'Deliveroo')
    expect(out[0].delivery).toHaveLength(2)
    expect(out[0].delivery.map(d => d.fonte).sort()).toEqual(['Deliveroo', 'Glovo'])
  })

  it('ordina chiusure desc per data', () => {
    const out = mergeInChiusure([], [
      { data: '2026-06-10', netto: 10 },
      { data: '2026-06-20', netto: 20 },
      { data: '2026-06-15', netto: 15 },
    ], 'F')
    expect(out.map(c => c.data)).toEqual(['2026-06-20', '2026-06-15', '2026-06-10'])
  })
})

describe('applyGenericMapping', () => {
  it('fonte custom propagata', () => {
    const out = applyGenericMapping(
      [{ d: '15/06/2026', i: '50' }],
      'd', 'i', null, 'Custom Fonte',
    )
    expect(out[0].fonte).toBe('Custom Fonte')
  })

  it('senza commCol, commissione=0', () => {
    const out = applyGenericMapping(
      [{ d: '15/06/2026', i: '100' }],
      'd', 'i', null, 'X',
    )
    expect(out[0].commissione).toBe(0)
    expect(out[0].netto).toBe(100)
  })
})

describe('parseGenericCSV preview', () => {
  it('preview limitata a 5 righe anche se input più grande', () => {
    const csv = 'data,importo\n' +
      Array.from({ length: 20 }, (_, i) => `15/06/2026,${i}`).join('\n')
    const r = parseGenericCSV(csv)
    expect(r.preview).toHaveLength(5)
    expect(r.rows).toHaveLength(20)
    expect(r.headers).toEqual(['data', 'importo'])
  })
})

describe('parseUberEats branch flex header', () => {
  it('CSV con header standard non crash', () => {
    const csv = 'Date,Gross,Fee\n15/06/2026,100,10\n'
    const r = parseUberEats(csv)
    expect(Array.isArray(r)).toBe(true)
  })

  it('CSV solo header → []', () => {
    expect(parseUberEats('Date,Total\n')).toEqual([])
  })
})

describe('parseDeliveroo edge', () => {
  it('CSV con header ma 0 righe data → []', () => {
    expect(parseDeliveroo('Date,Total\n')).toEqual([])
  })
})

describe('parseJustEat edge', () => {
  it('senza header noti → no aggregazione', () => {
    const r = parseJustEat('FooHeader,Bar\n15/06/2026,100\n')
    // Senza una colonna data riconoscibile, aggrega cade a fallback "default"
    // → ritorna comunque qualcosa di sensato (array vuoto o "Invalid")
    expect(Array.isArray(r)).toBe(true)
  })
})
