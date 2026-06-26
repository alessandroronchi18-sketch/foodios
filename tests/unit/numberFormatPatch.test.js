/**
 * Test del patch globale a Number.prototype.toLocaleString('it-IT').
 * Garantisce che:
 *  - L'install è idempotente (doppio import non rompe)
 *  - Aggiunge useGrouping:'always' su locale it-IT senza opzioni
 *  - Rispetta useGrouping esplicito (false/true) dell'utente
 *  - Locale diverso da it/it-IT non viene toccato
 *  - Mai throw (anche se runtime non supporta)
 */
import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(async () => {
  // Pulisci eventuale patch da test precedenti
  try { delete Number.prototype._foodios_locale_patched } catch {}
  await import('../../src/lib/numberFormatPatch.js')
})

describe('numberFormatPatch — Number.prototype.toLocaleString', () => {
  it('non rompe nulla a startup (require senza throw)', () => {
    // Già importato in beforeAll; se avesse thrown, il test sarebbe abortito.
    expect(Number.prototype.toLocaleString).toBeTypeOf('function')
  })

  it('è idempotente: doppio import non riassegna il prototype', async () => {
    const before = Number.prototype.toLocaleString
    await import('../../src/lib/numberFormatPatch.js')
    const after = Number.prototype.toLocaleString
    expect(after).toBe(before)
  })

  it('marca sentinel _foodios_locale_patched', () => {
    expect(Number.prototype._foodios_locale_patched).toBe(true)
  })

  it('aggiunge separatore migliaia su locale it-IT senza opzioni', () => {
    // 4715 con useGrouping default → in Node con ICU full è "4.715"; ma
    // su browser senza ICU full potrebbe essere "4715". Il patch forza
    // useGrouping:'always' → SEMPRE "4.715".
    const s = (4715).toLocaleString('it-IT')
    expect(s).toBe('4.715')
  })

  it('separatore migliaia su numeri grandi', () => {
    expect((1234567).toLocaleString('it-IT')).toBe('1.234.567')
  })

  it('numeri sotto 1000 invariati (nessun separatore necessario)', () => {
    expect((42).toLocaleString('it-IT')).toBe('42')
    expect((999).toLocaleString('it-IT')).toBe('999')
  })

  it('rispetta useGrouping:false esplicito dell\'utente', () => {
    expect((1234).toLocaleString('it-IT', { useGrouping: false })).toBe('1234')
  })

  it('locale diverso da it-IT non viene toccato', () => {
    // en-US usa virgola come separatore migliaia
    const s = (1234).toLocaleString('en-US')
    expect(s).toBe('1,234')
  })

  it('non aggiunge throw rispetto al native (con argomenti tipici)', () => {
    expect(() => (123).toLocaleString()).not.toThrow()
    expect(() => (123).toLocaleString(undefined)).not.toThrow()
    expect(() => (123).toLocaleString('it-IT')).not.toThrow()
    expect(() => (123).toLocaleString('it-IT', undefined)).not.toThrow()
    expect(() => (NaN).toLocaleString('it-IT')).not.toThrow()
  })

  it('preserva opzioni di formattazione esistenti (currency, decimals)', () => {
    const s = (1234.5).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    // 1.234,50 — separatore migliaia + 2 decimali
    expect(s).toBe('1.234,50')
  })
})
