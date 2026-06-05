import { describe, it, expect } from 'vitest'
import {
  parseDeliveroo, parseJustEat, parseUberEats,
  parseGenericCSV, applyGenericMapping, mergeInChiusure,
} from '../../src/lib/importDelivery.js'

describe('parseDeliveroo', () => {
  it('aggrega per giorno, somma i totali, ordina per data', () => {
    const csv = [
      'Date,Order ID,Restaurant,Total',
      '2026-01-10,A1,Bar,"12,50"',
      '2026-01-10,A2,Bar,"7,50"',
      '2026-01-09,A3,Bar,10',
    ].join('\n')
    const out = parseDeliveroo(csv)
    expect(out).toEqual([
      { data: '2026-01-09', importo: 10, commissione: 0, netto: 10, ordini: 1, fonte: 'Deliveroo' },
      { data: '2026-01-10', importo: 20, commissione: 0, netto: 20, ordini: 2, fonte: 'Deliveroo' },
    ])
  })

  it('ignora righe con data non parsabile', () => {
    const csv = 'Date,Total\n,5\nNONDATA,9\n2026-02-01,3'
    const out = parseDeliveroo(csv)
    expect(out).toHaveLength(1)
    expect(out[0].data).toBe('2026-02-01')
  })
})

describe('parseJustEat', () => {
  it('calcola netto = importo - commissione, header alternativi', () => {
    const csv = [
      'Order date;Order number;Total order value;Commission',
      '15/01/2026;1;"100,00";"23,00"',
      '15/01/2026;2;"50,00";"11,50"',
    ].join('\n')
    const out = parseJustEat(csv)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ data: '2026-01-15', importo: 150, commissione: 34.5, netto: 115.5, ordini: 2, fonte: 'JustEat' })
  })
})

describe('parseUberEats', () => {
  it('ritorna [] su CSV vuoto', () => {
    expect(parseUberEats('')).toEqual([])
    expect(parseUberEats('Date,Total')).toEqual([])
  })
  it('rileva colonne gross/fee flessibili', () => {
    const csv = 'Order date,Gross sales,Uber fees\n2026-03-01,200,60'
    const out = parseUberEats(csv)
    expect(out[0]).toMatchObject({ data: '2026-03-01', importo: 200, commissione: 60, netto: 140, fonte: 'Uber Eats' })
  })
})

describe('date parsing (via parser pubblici)', () => {
  it('DD/MM/YYYY è interpretato come italiano (giorno prima)', () => {
    const out = parseDeliveroo('Date,Total\n03/02/2026,5')
    expect(out[0].data).toBe('2026-02-03') // 3 febbraio, non 2 marzo
  })

  it('formato US MM/DD/YYYY con giorno>12 NON deve produrre un mese invalido', () => {
    // "12/25/2026" = 25 dicembre. Bug storico: produceva "2026-25-12" (mese 25).
    const out = parseDeliveroo('Date,Total\n12/25/2026,5')
    expect(out[0].data).toBe('2026-12-25')
  })

  it('anno a 2 cifre → 20YY', () => {
    const out = parseDeliveroo('Date,Total\n01/06/26,5')
    expect(out[0].data).toBe('2026-06-01')
  })
})

describe('parseGenericCSV', () => {
  it('ritorna headers, preview (max 5) e righe complete', () => {
    const rows = Array.from({ length: 8 }, (_, i) => `2026-01-0${i + 1},${i}`).join('\n')
    const csv = 'Data,Importo\n' + rows
    const r = parseGenericCSV(csv)
    expect(r.headers).toEqual(['Data', 'Importo'])
    expect(r.preview).toHaveLength(5)
    expect(r.rows).toHaveLength(8)
  })
})

describe('applyGenericMapping', () => {
  it('usa le colonne scelte dall’utente', () => {
    const { rows } = parseGenericCSV('Giorno,Incasso,Fee\n2026-01-01,100,10')
    const out = applyGenericMapping(rows, 'Giorno', 'Incasso', 'Fee', 'POS')
    expect(out[0]).toMatchObject({ data: '2026-01-01', importo: 100, commissione: 10, netto: 90, fonte: 'POS' })
  })
})

describe('mergeInChiusure', () => {
  it('crea una nuova chiusura se la data non esiste', () => {
    const out = mergeInChiusure([], [{ data: '2026-01-01', importo: 100, commissione: 10, netto: 90, ordini: 3 }], 'Glovo')
    expect(out).toHaveLength(1)
    expect(out[0].data).toBe('2026-01-01')
    expect(out[0].delivery[0]).toMatchObject({ fonte: 'Glovo', netto: 90, ordini: 3 })
  })

  it('aggiunge il delivery a una chiusura esistente senza duplicare la fonte', () => {
    const chiusure = [{ data: '2026-01-01', venduto: [], delivery: [{ fonte: 'Glovo', netto: 50 }] }]
    const out = mergeInChiusure(chiusure, [{ data: '2026-01-01', importo: 100, commissione: 10, netto: 90, ordini: 3 }], 'Glovo')
    expect(out).toHaveLength(1)
    const glovo = out[0].delivery.filter(d => d.fonte === 'Glovo')
    expect(glovo).toHaveLength(1)         // non duplica
    expect(glovo[0].netto).toBe(90)        // sostituisce col nuovo
  })

  it('preserva delivery di fonti diverse', () => {
    const chiusure = [{ data: '2026-01-01', delivery: [{ fonte: 'JustEat', netto: 20 }] }]
    const out = mergeInChiusure(chiusure, [{ data: '2026-01-01', importo: 30, commissione: 0, netto: 30, ordini: 1 }], 'Glovo')
    const fonti = out[0].delivery.map(d => d.fonte).sort()
    expect(fonti).toEqual(['Glovo', 'JustEat'])
  })

  it('ordina le chiusure per data discendente', () => {
    const out = mergeInChiusure(
      [{ data: '2026-01-05', delivery: [] }],
      [{ data: '2026-01-10', importo: 1, commissione: 0, netto: 1, ordini: 1 }],
      'X',
    )
    expect(out.map(c => c.data)).toEqual(['2026-01-10', '2026-01-05'])
  })
})
