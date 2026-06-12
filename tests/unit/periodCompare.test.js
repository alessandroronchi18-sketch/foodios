import { describe, it, expect } from 'vitest'
import {
  buildCurrent, buildCompare, inPeriod, formatPeriod, COMPARE_MODES,
} from '../../src/lib/periodCompare.js'

describe('buildCurrent', () => {
  it('kind=mese: start=primo giorno, end=primo del mese successivo', () => {
    const anchor = new Date(2026, 4, 15) // 15 maggio 2026
    const p = buildCurrent('mese', anchor)
    expect(p.start.getDate()).toBe(1)
    expect(p.start.getMonth()).toBe(4)
    expect(p.end.getMonth()).toBe(5)
    expect(p.end.getDate()).toBe(1)
    expect(p.kind).toBe('mese')
  })

  it('kind=settimana: start=lunedi della settimana, end=lunedi successivo', () => {
    // 15 maggio 2026 = venerdi → lunedi = 11 maggio
    const anchor = new Date(2026, 4, 15)
    const p = buildCurrent('settimana', anchor)
    expect(p.start.getDay()).toBe(1) // lunedi
    const days = (p.end - p.start) / 86400000
    expect(days).toBe(7)
  })

  it('kind=anno: 1 gennaio → 1 gennaio anno successivo', () => {
    const anchor = new Date(2026, 6, 1)
    const p = buildCurrent('anno', anchor)
    expect(p.start.getMonth()).toBe(0)
    expect(p.start.getDate()).toBe(1)
    expect(p.end.getFullYear()).toBe(2027)
  })

  it('kind=trimestre Q2 (apr-giu): start=1 aprile, end=1 luglio', () => {
    const anchor = new Date(2026, 4, 15) // maggio (Q2)
    const p = buildCurrent('trimestre', anchor)
    expect(p.start.getMonth()).toBe(3) // aprile
    expect(p.end.getMonth()).toBe(6)   // luglio
  })

  it('kind=7gg: finestra rolling di 7 giorni che include anchor', () => {
    const anchor = new Date(2026, 4, 15)
    const p = buildCurrent('7gg', anchor)
    const days = (p.end - p.start) / 86400000
    expect(days).toBe(7)
  })

  it('kind invalido ritorna null', () => {
    expect(buildCurrent('bogus', new Date())).toBeNull()
  })
})

describe('buildCompare', () => {
  it('mode=none ritorna null', () => {
    const cur = buildCurrent('mese', new Date(2026, 4, 15))
    expect(buildCompare(cur, 'none')).toBeNull()
  })

  it('mode=prev su mese: shift indietro di 1 mese', () => {
    const cur = buildCurrent('mese', new Date(2026, 4, 15)) // maggio
    const prev = buildCompare(cur, 'prev')
    expect(prev.start.getMonth()).toBe(3) // aprile
    expect(prev.end.getMonth()).toBe(4)
  })

  it('mode=year_prev: shift indietro di 1 anno', () => {
    const cur = buildCurrent('mese', new Date(2026, 4, 15))
    const prev = buildCompare(cur, 'year_prev')
    expect(prev.start.getFullYear()).toBe(2025)
    expect(prev.start.getMonth()).toBe(4)
  })

  it('mode=prev su settimana: 7 giorni indietro', () => {
    const cur = buildCurrent('settimana', new Date(2026, 4, 15))
    const prev = buildCompare(cur, 'prev')
    const days = (cur.start - prev.start) / 86400000
    expect(days).toBe(7)
  })

  it('current=null ritorna null', () => {
    expect(buildCompare(null, 'prev')).toBeNull()
  })
})

describe('inPeriod', () => {
  it('data dentro al periodo → true', () => {
    const cur = buildCurrent('mese', new Date(2026, 4, 15))
    expect(inPeriod(new Date(2026, 4, 10), cur)).toBe(true)
  })
  it('data prima del periodo → false', () => {
    const cur = buildCurrent('mese', new Date(2026, 4, 15))
    expect(inPeriod(new Date(2026, 3, 28), cur)).toBe(false)
  })
  it('data oltre il periodo (end exclusive) → false', () => {
    const cur = buildCurrent('mese', new Date(2026, 4, 15))
    // end = 1 giugno
    expect(inPeriod(new Date(2026, 5, 1), cur)).toBe(false)
  })
  it('accetta stringa ISO', () => {
    const cur = buildCurrent('mese', new Date(2026, 4, 15))
    expect(inPeriod('2026-05-10', cur)).toBe(true)
  })
})

describe('formatPeriod', () => {
  it('mese: "maggio 2026"', () => {
    const s = formatPeriod(new Date(2026, 4, 1), 'mese')
    expect(s.toLowerCase()).toContain('maggio')
    expect(s).toContain('2026')
  })
  it('anno: ritorna stringa anno', () => {
    expect(formatPeriod(new Date(2026, 0, 1), 'anno')).toBe('2026')
  })
})

describe('COMPARE_MODES', () => {
  it('contiene almeno none/prev/year_prev', () => {
    const ids = COMPARE_MODES.map(m => m.id)
    expect(ids).toContain('none')
    expect(ids).toContain('prev')
    expect(ids).toContain('year_prev')
  })
})
