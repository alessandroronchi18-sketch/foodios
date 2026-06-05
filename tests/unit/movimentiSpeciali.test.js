import { describe, it, expect } from 'vitest'
import {
  nuovoMovimento, filtraPerIntervallo, aggregaGiorno,
  CAUSALI_SPRECO, CAUSALI_OMAGGIO,
} from '../../src/lib/movimentiSpeciali.js'

describe('nuovoMovimento', () => {
  it('default = spreco con causale spreco', () => {
    const m = nuovoMovimento()
    expect(m.tipo).toBe('spreco')
    expect(m.causale).toBe(CAUSALI_SPRECO[0])
    expect(m.unita).toBe('g')
    expect(m.id).toMatch(/^mov-/)
  })
  it('tipo omaggio → causale omaggio', () => {
    expect(nuovoMovimento('omaggio').causale).toBe(CAUSALI_OMAGGIO[0])
  })
})

describe('filtraPerIntervallo', () => {
  const movs = [
    { ts: '2026-01-01T08:00:00.000Z' },
    { ts: '2026-01-15T08:00:00.000Z' },
    { ts: '2026-02-01T08:00:00.000Z' },
  ]
  it('senza estremi ritorna tutto', () => {
    expect(filtraPerIntervallo(movs)).toHaveLength(3)
  })
  it('filtra inclusivo su [da, a]', () => {
    const out = filtraPerIntervallo(movs, '2026-01-01', '2026-01-31')
    expect(out).toHaveLength(2)
  })
  it('solo "da" (estremo superiore aperto)', () => {
    expect(filtraPerIntervallo(movs, '2026-01-15', null)).toHaveLength(2)
  })
  it('scarta ts non parsabili', () => {
    const out = filtraPerIntervallo([{ ts: 'garbage' }, { ts: '2026-01-10T00:00:00Z' }], '2026-01-01', '2026-01-31')
    expect(out).toHaveLength(1)
  })
})

describe('aggregaGiorno', () => {
  const giorno = '2026-01-10'
  const movs = [
    { ts: '2026-01-10T08:00:00', tipo: 'spreco', categoria: 'torte', prodotto: 'Sacher', qta: 200, unita: 'g', fcTot: 1.5 },
    { ts: '2026-01-10T09:00:00', tipo: 'spreco', categoria: 'torte', prodotto: 'Sacher', qta: 100, unita: 'g', fcUnit: 0.01 }, // fcTot = 0.01*100 = 1
    { ts: '2026-01-10T10:00:00', tipo: 'omaggio', categoria: 'brioche', prodotto: 'Cornetto', qta: 3, unita: 'pz', fcTot: 0.9, valoreOmaggio: 4.5 },
    { ts: '2026-01-09T10:00:00', tipo: 'spreco', categoria: 'torte', qta: 999, unita: 'g', fcTot: 99 }, // altro giorno → escluso
  ]
  const { perCategoria, perProdotto, tot } = aggregaGiorno(movs, giorno)

  it('include solo i movimenti del giorno richiesto', () => {
    expect(tot.gSpreco).toBe(300) // 200 + 100, esclude il 999 del 09
  })
  it('grammi e euro spreco aggregati per prodotto', () => {
    expect(perProdotto['Sacher'].gSpreco).toBe(300)
    expect(perProdotto['Sacher'].eurSpreco).toBeCloseTo(2.5) // 1.5 + (0.01*100)
  })
  it('le quantità in pz non finiscono nei grammi ma in nPz', () => {
    expect(tot.gOmaggio).toBe(0)
    expect(tot.nPzOmaggio).toBe(3)
  })
  it('omaggio: food cost in eurOmaggio, ricavo mancato a parte', () => {
    expect(tot.eurOmaggio).toBeCloseTo(0.9)
    expect(tot.eurRicavoMancato).toBeCloseTo(4.5)
    expect(perCategoria['brioche'].eurOmaggio).toBeCloseTo(0.9)
  })
  it('giorno senza movimenti → tutto a zero', () => {
    const r = aggregaGiorno(movs, '2099-01-01')
    expect(r.tot.gSpreco).toBe(0)
    expect(r.tot.eurOmaggio).toBe(0)
    expect(Object.keys(r.perProdotto)).toHaveLength(0)
  })
})
