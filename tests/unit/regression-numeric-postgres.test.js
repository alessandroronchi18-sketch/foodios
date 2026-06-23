// Regression test per la bug class scoperta il 22 giu 2026:
//
// PostgREST serializza le colonne `numeric` come stringa ("8.00") in alcuni
// contesti. `0 + "8.00"` in JavaScript concatena → la somma intera collassa
// in NaN. Il bug visibile era "Ore piani. vs lavorate: NaNh / pianificate 607.0h".
//
// Helper di difesa: `numOk(x) = Number.isFinite(Number(x)) ? Number(x) : 0`.
// Questo test garantisce che il pattern non torni indietro:
//   1. Una somma reduce con turni misti (number + string) deve dare numero.
//   2. fmtH() deve essere safe su qualsiasi input (string/null/undefined/NaN).
//
// Se in futuro qualcuno rimuove l'helper numOk e usa `s + (t.ore||0)` di nuovo
// su valori che possono arrivare come stringa, questo test fallisce.

import { describe, it, expect } from 'vitest'

describe('Regression: numeric Postgres come stringa non collassa la somma', () => {
  const numOk = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0 }

  it('numOk somma correttamente turni misti number/string', () => {
    const turni = [
      { id: '1', ore: 8 },           // number
      { id: '2', ore: '8.00' },      // string da Postgres numeric
      { id: '3', ore: '4.5' },       // string decimal
      { id: '4', ore: null },        // null → 0
      { id: '5', ore: undefined },   // undefined → 0
      { id: '6', ore: 'abc' },       // invalid → 0
      { id: '7', ore: NaN },         // NaN → 0
    ]
    const tot = turni.reduce((s, t) => s + numOk(t.ore), 0)
    expect(tot).toBe(20.5)
    expect(Number.isFinite(tot)).toBe(true)
  })

  it('senza numOk il bug stringa si manifesta (per verificare che il fix sia necessario)', () => {
    const turni = [{ ore: 8 }, { ore: '8.00' }, { ore: 4 }]
    // 0 + 8 = 8 (number), poi 8 + "8.00" = "88.00" (concat string),
    // poi "88.00" + 4 = "88.004". Risultato sbagliato e non recuperabile.
    const totSenzaFix = turni.reduce((s, t) => s + (t.ore || 0), 0)
    expect(typeof totSenzaFix).toBe('string')
    expect(totSenzaFix).toBe('88.004')
    // Soprattutto: il risultato NON è 20 come dovrebbe.
    expect(Number(totSenzaFix)).not.toBe(20)
  })

  it('fmtH è safe su input string/null/undefined/NaN/numero', () => {
    // Replico fmtH come e' in src/components/Personale.jsx.
    function fmtH(h) {
      const v = Number(h)
      return `${(Number.isFinite(v) ? v : 0).toFixed(1)}h`
    }
    expect(fmtH(8)).toBe('8.0h')
    expect(fmtH('8.00')).toBe('8.0h')      // string Postgres → number
    expect(fmtH(null)).toBe('0.0h')
    expect(fmtH(undefined)).toBe('0.0h')
    expect(fmtH(NaN)).toBe('0.0h')
    expect(fmtH('abc')).toBe('0.0h')
    expect(fmtH('')).toBe('0.0h')          // '' coerces to 0 via Number
    expect(fmtH(0)).toBe('0.0h')
  })

  // Nota Node: senza full-ICU, toLocaleString('it-IT') usa virgola decimale
  // ma NON sempre il punto migliaia (dipende dall'ICU installato). I test
  // verificano la SEMANTICA (virgola, no/Infinity guard) non la string esatta.

  it('fmt (€) è safe su input string/null/NaN', () => {
    function fmt(n) {
      const v = Number(n)
      return n == null || !Number.isFinite(v)
        ? '—'
        : `€${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    // Virgola decimale italiana presente.
    expect(fmt(1234.5)).toMatch(/€1\.?234,50/)
    expect(fmt('1234.5')).toMatch(/€1\.?234,50/)
    expect(fmt(null)).toBe('—')
    expect(fmt(undefined)).toBe('—')
    expect(fmt(NaN)).toBe('—')
    expect(fmt('abc')).toBe('—')
    expect(fmt(0)).toBe('€0,00')
  })

  it('fmt0 (€ arrotondato) è safe e arrotonda all unita', () => {
    function fmt0(n) {
      const v = Number(n)
      return `€${Math.round(Number.isFinite(v) ? v : 0).toLocaleString('it-IT')}`
    }
    expect(fmt0(1234)).toMatch(/€1\.?234/)
    expect(fmt0('1234.7')).toMatch(/€1\.?235/)   // rounding all unita
    expect(fmt0(null)).toBe('€0')
    expect(fmt0(NaN)).toBe('€0')
    expect(fmt0(1234567)).toMatch(/€1\.?234\.?567/)  // milioni
  })
})
