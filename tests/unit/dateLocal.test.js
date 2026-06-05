import { describe, it, expect } from 'vitest'
import { todayLocal, formatLocalDate, startOfWeekLocal } from '../../src/lib/dateLocal.js'

const ISO = /^\d{4}-\d{2}-\d{2}$/

describe('formatLocalDate', () => {
  it('formatta una Date in YYYY-MM-DD locale (zero-padded)', () => {
    // Costruita con componenti locali per evitare ambiguità di timezone.
    const d = new Date(2026, 0, 5) // 5 gennaio 2026, ora locale
    expect(formatLocalDate(d)).toBe('2026-01-05')
  })
  it('zero-pad mese e giorno a una cifra', () => {
    expect(formatLocalDate(new Date(2026, 8, 9))).toBe('2026-09-09')
  })
  it('accetta una stringa parsabile', () => {
    expect(formatLocalDate('2026-12-31T10:00:00')).toBe('2026-12-31')
  })
  it('input nullo o data invalida → stringa vuota', () => {
    expect(formatLocalDate(null)).toBe('')
    expect(formatLocalDate(undefined)).toBe('')
    expect(formatLocalDate('non-una-data')).toBe('')
  })
  it('NON usa UTC: una mezzanotte locale resta lo stesso giorno', () => {
    const d = new Date(2026, 2, 1, 0, 30) // 1 marzo 00:30 locale
    expect(formatLocalDate(d)).toBe('2026-03-01')
  })
})

describe('todayLocal', () => {
  it('ritorna formato ISO date', () => {
    expect(todayLocal()).toMatch(ISO)
  })
  it('coincide con la data locale corrente', () => {
    const now = new Date()
    expect(todayLocal()).toBe(formatLocalDate(now))
  })
})

describe('startOfWeekLocal', () => {
  it('ritorna formato ISO date', () => {
    expect(startOfWeekLocal()).toMatch(ISO)
  })
  it('è sempre un lunedì (ISO 8601)', () => {
    const [y, m, d] = startOfWeekLocal().split('-').map(Number)
    const monday = new Date(y, m - 1, d)
    expect(monday.getDay()).toBe(1) // 1 = lunedì
  })
  it('non è nel futuro e cade negli ultimi 7 giorni', () => {
    const [y, m, d] = startOfWeekLocal().split('-').map(Number)
    const monday = new Date(y, m - 1, d).getTime()
    const today = new Date().setHours(0, 0, 0, 0)
    expect(monday).toBeLessThanOrEqual(today)
    expect(today - monday).toBeLessThan(7 * 24 * 3600 * 1000)
  })
})
