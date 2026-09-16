// Il periodo che si guarda, e con cosa lo si confronta.
//
// Dall'audit dell'analytics di Shopify (16/09/2026). La cosa che mancava di
// più non era un grafico: era l'impalcatura. Ogni pagina di analisi aveva il
// suo periodo — il P&L «dal/al» senza scorciatoie e senza confronto, lo
// Storico le scorciatoie e il confronto, il Confronto sedi solo
// settimana/mese. Passando da una pagina all'altra si ricominciava da capo, e
// la stessa domanda («com'è andato settembre?») andava riposta tre volte in
// tre modi diversi.
//
// E dentro c'era per la QUINTA volta lo stesso difetto delle date: le
// scorciatoie dello Storico usavano `toISOString().slice(0,10)`, cioè la data
// UTC. Fra mezzanotte e le due, in Italia, «Oggi» selezionava ieri.

import { describe, it, expect } from 'vitest'
import {
  SCORCIATOIE, CONFRONTI, finestraScorciatoia, giorniDelPeriodo,
  finestraConfronto, scorciatoiaDi, nomePeriodo,
} from '../../src/lib/periodoAnalisi'

// Mercoledì 16 settembre 2026, mezzanotte e mezza: l'ora in cui il difetto
// delle date si vede.
const NOTTE = new Date(2026, 8, 16, 0, 30)

describe('le scorciatoie', () => {
  it('«Oggi» è oggi, anche alle 00:30', () => {
    expect(finestraScorciatoia('oggi', NOTTE)).toEqual({ from: '2026-09-16', to: '2026-09-16' })
    // La stessa cosa via UTC darebbe il 15.
    expect(NOTTE.toISOString().slice(0, 10)).toBe('2026-09-15')
  })

  it('«Ieri» è un giorno solo, non due', () => {
    expect(finestraScorciatoia('ieri', NOTTE)).toEqual({ from: '2026-09-15', to: '2026-09-15' })
  })

  it('«7 giorni» ne conta sette, estremi compresi', () => {
    const f = finestraScorciatoia('7gg', NOTTE)
    expect(f).toEqual({ from: '2026-09-10', to: '2026-09-16' })
    expect(giorniDelPeriodo(f.from, f.to)).toBe(7)
  })

  it('«30 giorni» ne conta trenta, non trentuno', () => {
    const f = finestraScorciatoia('30gg', NOTTE)
    expect(giorniDelPeriodo(f.from, f.to)).toBe(30)
  })

  it('«Questa settimana» parte da lunedì', () => {
    // Il 16 settembre 2026 è un mercoledì: la settimana parte dal 14.
    expect(finestraScorciatoia('sett', NOTTE)).toEqual({ from: '2026-09-14', to: '2026-09-16' })
  })

  it('e di domenica la settimana è ancora quella, non quella dopo', () => {
    const domenica = new Date(2026, 8, 20, 10, 0)
    expect(finestraScorciatoia('sett', domenica)).toEqual({ from: '2026-09-14', to: '2026-09-20' })
  })

  it('«Questo mese» parte dal primo e arriva a oggi', () => {
    expect(finestraScorciatoia('meseCorr', NOTTE)).toEqual({ from: '2026-09-01', to: '2026-09-16' })
  })

  it('«Mese scorso» finisce l\'ultimo giorno, qualunque sia', () => {
    expect(finestraScorciatoia('mesePrec', NOTTE)).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    // Febbraio, che è quello che rompe i conti scritti a mano.
    const marzo = new Date(2026, 2, 10)
    expect(finestraScorciatoia('mesePrec', marzo)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('e a gennaio il mese scorso è l\'anno prima', () => {
    const gennaio = new Date(2027, 0, 5)
    expect(finestraScorciatoia('mesePrec', gennaio)).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })

  it('«Quest\'anno» parte dal primo gennaio', () => {
    expect(finestraScorciatoia('annoCorr', NOTTE)).toEqual({ from: '2026-01-01', to: '2026-09-16' })
  })

  it('una scorciatoia che non esiste non inventa un periodo', () => {
    expect(finestraScorciatoia('boh', NOTTE)).toBe(null)
  })
})

describe('quanti giorni copre un periodo', () => {
  it('un giorno solo è un giorno', () => {
    expect(giorniDelPeriodo('2026-09-16', '2026-09-16')).toBe(1)
  })

  it('si contano i giorni di calendario, non le ore', () => {
    // Col cambio dell'ora legale una differenza in millisecondi sbaglia di un
    // giorno: il 25 ottobre 2026 la notte dura 25 ore.
    expect(giorniDelPeriodo('2026-10-24', '2026-10-26')).toBe(3)
    expect(giorniDelPeriodo('2026-03-28', '2026-03-30')).toBe(3)
  })

  it('un anno intero fa 365 giorni', () => {
    expect(giorniDelPeriodo('2026-01-01', '2026-12-31')).toBe(365)
  })
})

describe('il periodo di confronto', () => {
  it('«Periodo prec.» è la stessa quantità di giorni, subito prima', () => {
    const c = finestraConfronto('2026-09-10', '2026-09-16', 'prev')
    expect(c).toEqual({ from: '2026-09-03', to: '2026-09-09' })
    expect(giorniDelPeriodo(c.from, c.to)).toBe(7)
  })

  it('e non si sovrappone nemmeno di un giorno', () => {
    const c = finestraConfronto('2026-09-10', '2026-09-16', 'prev')
    expect(c.to < '2026-09-10').toBe(true)
  })

  it('funziona a cavallo di un mese', () => {
    const c = finestraConfronto('2026-09-01', '2026-09-05', 'prev')
    expect(c).toEqual({ from: '2026-08-27', to: '2026-08-31' })
  })

  it('«Anno prec.» è lo stesso periodo dell\'anno prima', () => {
    expect(finestraConfronto('2026-09-01', '2026-09-16', 'year_prev'))
      .toEqual({ from: '2025-09-01', to: '2025-09-16' })
  })

  it('«Nessuno» vuol dire nessuno: il confronto si può spegnere', () => {
    // Shopify lo prevede, e ha ragione: il primo mese di apertura non ha un
    // mese precedente, e un confronto con il nulla racconta una storia falsa.
    expect(finestraConfronto('2026-09-01', '2026-09-16', 'none')).toBe(null)
    expect(finestraConfronto('2026-09-01', '2026-09-16', null)).toBe(null)
  })

  it('senza un periodo non c\'è confronto', () => {
    expect(finestraConfronto('', '', 'prev')).toBe(null)
  })
})

describe('riconoscere la scorciatoia dalle date', () => {
  it('le date di «Questo mese» accendono «Questo mese»', () => {
    expect(scorciatoiaDi('2026-09-01', '2026-09-16', NOTTE)).toBe('meseCorr')
  })

  it('date scelte a mano non accendono niente', () => {
    expect(scorciatoiaDi('2026-09-03', '2026-09-11', NOTTE)).toBe(null)
  })
})

describe('il periodo detto a parole', () => {
  it('un giorno solo', () => {
    expect(nomePeriodo('2026-09-16', '2026-09-16')).toBe('16 settembre 2026')
  })

  it('dentro lo stesso mese non si ripete il mese', () => {
    expect(nomePeriodo('2026-09-01', '2026-09-16')).toBe('1–16 settembre 2026')
  })

  it('a cavallo di due mesi', () => {
    expect(nomePeriodo('2026-08-20', '2026-09-16')).toBe('20 agosto – 16 settembre 2026')
  })

  it('a cavallo di due anni', () => {
    expect(nomePeriodo('2025-12-20', '2026-01-10')).toBe('20 dicembre 2025 – 10 gennaio 2026')
  })
})

describe('le scelte offerte', () => {
  it('ci sono nove scorciatoie, tutte con un nome in italiano', () => {
    expect(SCORCIATOIE).toHaveLength(9)
    for (const s of SCORCIATOIE) {
      expect(s.label).toBeTruthy()
      expect(s.label).not.toMatch(/^[a-z]+$/)   // non l'identificativo
    }
  })

  it('e tre modi di confrontare, «Nessuno» compreso', () => {
    expect(CONFRONTI.map(c => c.id)).toEqual(['none', 'prev', 'year_prev'])
  })
})
