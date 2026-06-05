import { describe, it, expect } from 'vitest'
import { parseNum, mergeInChiusureCassa } from '../../src/lib/importCassa.js'

describe('parseNum — numeri italiani (virgola decimale, punto migliaia)', () => {
  it('virgola = decimale', () => {
    expect(parseNum('1,5')).toBeCloseTo(1.5, 6)
    expect(parseNum('12,00')).toBeCloseTo(12, 6)
    expect(parseNum('0,99')).toBeCloseTo(0.99, 6)
  })
  it('punto + virgola: l ultimo è il decimale (formato IT)', () => {
    expect(parseNum('1.234,56')).toBeCloseTo(1234.56, 6)
    expect(parseNum('100.000,00')).toBeCloseTo(100000, 6)
  })
  it('virgola + punto: l ultimo è il decimale (formato EN)', () => {
    expect(parseNum('1,234.56')).toBeCloseTo(1234.56, 6)
  })
  it('un solo separatore con 3 cifre dopo = migliaia', () => {
    expect(parseNum('1.234')).toBeCloseTo(1234, 6)
    expect(parseNum('100.000')).toBeCloseTo(100000, 6)
    expect(parseNum('2,000')).toBeCloseTo(2000, 6)
  })
  it('separatori ripetuti dello stesso tipo = migliaia', () => {
    expect(parseNum('1,234,567')).toBeCloseTo(1234567, 6)
    expect(parseNum('1.234.567')).toBeCloseTo(1234567, 6)
  })
  it('valuta e spazi vengono ripuliti', () => {
    expect(parseNum('€ 12,50')).toBeCloseTo(12.5, 6)
    expect(parseNum('  3,20 € ')).toBeCloseTo(3.2, 6)
  })
  it('negativi e input non validi', () => {
    expect(parseNum('-5,5')).toBeCloseTo(-5.5, 6)
    expect(parseNum('')).toBe(0)
    expect(parseNum(null)).toBe(0)
    expect(parseNum(undefined)).toBe(0)
    expect(parseNum('abc')).toBe(0)
    expect(parseNum(42)).toBe(42)
    expect(parseNum(NaN)).toBe(0)
  })
})

describe('mergeInChiusureCassa', () => {
  it('aggiunge giorni nuovi senza duplicare quelli esistenti', () => {
    const esistenti = [{ data: '2026-06-01', venduto: [], kpi: {} }]
    const importati = [
      { data: '2026-06-01', incasso: 100 }, // stesso giorno
      { data: '2026-06-02', incasso: 200 }, // nuovo
    ]
    const out = mergeInChiusureCassa(esistenti, importati, 'Test')
    const date = out.map(c => c.data).sort()
    // niente duplicati per la stessa data
    expect(new Set(date).size).toBe(date.length)
    expect(date).toContain('2026-06-02')
  })
})
