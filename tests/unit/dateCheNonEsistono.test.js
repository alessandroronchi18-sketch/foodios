// ── Le date che sul calendario non esistono ───────────────────────────────
//
// `coerceDate` controllava la FORMA e mai il calendario: «31/02/2026» usciva
// come "2026-02-31". Febbraio non ha 31 giorni.
//
// Il danno non era nell'anteprima — era dopo. La riga risultava buona, la
// schermata diceva «pronte da caricare», l'utente dava l'ok, e il database
// rifiutava quella riga a meta' caricamento: meta' file dentro, meta' fuori,
// e nessun modo di sapere quale riga avesse fermato tutto. Adesso la riga
// viene bocciata prima, col suo numero e il suo valore sotto gli occhi.
import { describe, it, expect } from 'vitest'
import { coerceDate } from '../../src/lib/importValidateCore'

describe('Una data impossibile viene bocciata, non convertita', () => {
  it('il 31 febbraio non esiste, in nessuno dei tre modi di scriverlo', () => {
    expect(coerceDate('31/02/2026')).toBe(null)   // GG/MM/AAAA
    expect(coerceDate('31/2/26')).toBe(null)      // anno a due cifre
    expect(coerceDate('2026-02-31')).toBe(null)   // gia' in ISO
  })

  it('e nemmeno il mese 13 o il giorno 45', () => {
    expect(coerceDate('01/13/2026')).toBe(null)
    expect(coerceDate('45/01/2026')).toBe(null)
    expect(coerceDate('00/01/2026')).toBe(null)
    expect(coerceDate('2026-00-10')).toBe(null)
  })

  it('il 30 aprile si, il 31 aprile no: aprile ha trenta giorni', () => {
    expect(coerceDate('30/04/2026')).toBe('2026-04-30')
    expect(coerceDate('31/04/2026')).toBe(null)
  })
})

describe('Il 29 febbraio: dipende dall\'anno, e va distinto', () => {
  it('2024 e 2028 sono bisestili: la data esiste', () => {
    expect(coerceDate('29/02/2024')).toBe('2024-02-29')
    expect(coerceDate('29/02/2028')).toBe('2028-02-29')
  })

  it('2026 non lo e\': la stessa data non esiste', () => {
    expect(coerceDate('29/02/2026')).toBe(null)
  })

  it('2100 non e\' bisestile anche se divisibile per quattro', () => {
    // La regola vera e' «divisibile per 4, ma non per 100, salvo che per 400».
    // Contando i giorni del mese a mano questa sfugge quasi sempre.
    expect(coerceDate('29/02/2100')).toBe(null)
    expect(coerceDate('29/02/2000')).toBe('2000-02-29')
  })
})

describe('Quello che deve continuare a passare', () => {
  it('le date normali, nei formati che arrivano dai fogli dei clienti', () => {
    expect(coerceDate('01/05/2026')).toBe('2026-05-01')
    expect(coerceDate('1/5/2026')).toBe('2026-05-01')
    expect(coerceDate('1-5-2026')).toBe('2026-05-01')
    expect(coerceDate('2026-05-01')).toBe('2026-05-01')
    expect(coerceDate('31/12/2026')).toBe('2026-12-31')
  })

  it('il numero seriale di Excel e l\'oggetto Date restano intatti', () => {
    // 46143 = 1 maggio 2026. Il giorno non deve scivolare indietro col fuso:
    // e' il difetto del 09/09, e questi due rami non li ho toccati.
    expect(coerceDate(46143)).toBe('2026-05-01')
    expect(coerceDate(new Date(2026, 4, 1))).toBe('2026-05-01')
  })

  it('vuoto e spazzatura restano vuoti', () => {
    expect(coerceDate('')).toBe(null)
    expect(coerceDate(null)).toBe(null)
    expect(coerceDate('domani')).toBe(null)
  })
})
