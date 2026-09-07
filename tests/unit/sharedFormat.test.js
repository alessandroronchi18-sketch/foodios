import { describe, it, expect } from 'vitest'

// Helper di formattazione condivisi tra le view (src/views/_shared.jsx).
// _shared.jsx importa React + theme ma NON esegue JSX a import-time, quindi è
// importabile in ambiente 'node'. Qui testiamo SOLO le funzioni pure di
// formattazione numerica (separatore migliaia IT, arrotondamenti, guard NaN).
import { fmt, fmt0, fmtp, margColor } from '../../src/views/_shared.jsx'
import { color as T } from '../../src/lib/theme.js'

// In it-IT il separatore migliaia è '.' e il decimale è ','. Forziamo
// useGrouping:'always' per essere consistenti con fmt/fmt0 (vedi _shared.jsx
// che usa Intl.NumberFormat per garantire il separatore su tutti i runtime).
const SEP = (1234.5).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })

describe('fmt (€ con 2 decimali, separatore migliaia IT)', () => {
  it('formatta un numero con 2 decimali', () => {
    expect(fmt(1234.5)).toBe(`${SEP} €`)
  })
  it('zero → 0,00 €', () => {
    expect(fmt(0)).toBe('0,00 €')
  })
  it('arrotonda al secondo decimale', () => {
    expect(fmt(1.005)).toMatch(/^1,0[01] €$/) // floating point: 1,00 o 1,01
    expect(fmt(2.567)).toBe('2,57 €')
  })
  it('guard NaN/undefined/null/stringa non numerica → € 0,00', () => {
    expect(fmt(NaN)).toBe('0,00 €')
    expect(fmt(undefined)).toBe('0,00 €')
    expect(fmt(null)).toBe('0,00 €')
    expect(fmt('abc')).toBe('0,00 €')
  })
  it('accetta stringhe numeriche', () => {
    expect(fmt('1234.5')).toBe(`${SEP} €`)
  })
  it('gestisce i negativi', () => {
    expect(fmt(-5)).toBe('-5,00 €')
  })
})

describe('fmt0 (€ arrotondato all\'unità)', () => {
  // Nota: il raggruppamento migliaia di toLocaleString('it-IT') senza opzioni
  // dipende dal build ICU dell\'ambiente (Node/jsdom può non raggrupparlo, il
  // browser sì). Per non rendere il test fragile confrontiamo con lo stesso
  // metodo usato dalla funzione, verificando arrotondamento e guard — non il
  // separatore esatto.
  const expectInt = n => `${Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' })} €`

  it('arrotonda all\'intero più vicino', () => {
    expect(fmt0(1234.4)).toBe(expectInt(1234))
    expect(fmt0(1234.6)).toBe(expectInt(1235))
  })
  it('niente decimali in output', () => {
    expect(fmt0(99.99)).not.toMatch(/,/)
    expect(fmt0(99.99)).toBe('100 €')
  })
  it('guard NaN → € 0', () => {
    expect(fmt0(NaN)).toBe('0 €')
    expect(fmt0(undefined)).toBe('0 €')
    expect(fmt0('x')).toBe('0 €')
  })
  it('numeri grandi: stesso output di Math.round + toLocaleString IT', () => {
    expect(fmt0(1000000)).toBe(expectInt(1000000))
  })
})

describe('fmtp (percentuale, 1 decimale)', () => {
  it('formatta con un decimale e simbolo %', () => {
    expect(fmtp(33.33)).toBe('33.3%')
    expect(fmtp(50)).toBe('50.0%')
  })
  it('guard NaN → 0.0%', () => {
    expect(fmtp(NaN)).toBe('0.0%')
    expect(fmtp(undefined)).toBe('0.0%')
    expect(fmtp(null)).toBe('0.0%')
  })
})

describe('margColor (soglie colore margine)', () => {
  it('≥60 → verde', () => {
    expect(margColor(60)).toBe(T.green)
    expect(margColor(75)).toBe(T.green)
  })
  it('40–59.99 → ambra', () => {
    expect(margColor(40)).toBe(T.amber)
    expect(margColor(59.9)).toBe(T.amber)
  })
  it('<40 → brand (rosso)', () => {
    expect(margColor(39.9)).toBe(T.brand)
    expect(margColor(0)).toBe(T.brand)
  })
})
