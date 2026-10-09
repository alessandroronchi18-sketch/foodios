// Dati senza food cost: il margine non si inventa (09/10/2026).
// Il difetto: un incasso del registro ha food cost 0, quindi il margine usciva
// «100%» (Calendario) e l'utile del P&L era gonfiato di tutto l'incasso.
import { describe, it, expect, vi } from 'vitest'
vi.mock('../../src/lib/supabase', () => ({ supabase: { from: () => ({}) } }))
import { margineLordoDelPeriodo } from '../../src/lib/margineNoto'
import { foodcostNoto } from '../../src/lib/chiusure'

describe('margineLordoDelPeriodo', () => {
  it('tutto dal registro: margine non noto, non 100%', () => {
    const r = margineLordoDelPeriodo({ ricavi: 117671, foodcost: 0, ricaviConFc: 0, giorni: 56, giorniSenzaFc: 56 })
    expect(r).toEqual({ margine: null, noto: false, stimato: false })
  })
  it('tutti i giorni col costo: il conto di sempre', () => {
    expect(margineLordoDelPeriodo({ ricavi: 1000, foodcost: 300, ricaviConFc: 1000, giorni: 5, giorniSenzaFc: 0 }))
      .toEqual({ margine: 700, noto: true, stimato: false })
  })
  it('meta\' dei giorni col costo: stima con la stessa percentuale, dichiarata', () => {
    // 1000 € con costo 300 (30%) + 1000 € senza costo: margine 700 + 700
    const r = margineLordoDelPeriodo({ ricavi: 2000, foodcost: 300, ricaviConFc: 1000, giorni: 10, giorniSenzaFc: 5 })
    expect(r).toEqual({ margine: 1400, noto: true, stimato: true })
  })
  it('periodo vuoto: zero, niente da dire', () => {
    expect(margineLordoDelPeriodo({ ricavi: 0, foodcost: 0, ricaviConFc: 0, giorni: 0, giorniSenzaFc: 0 }).margine).toBe(0)
  })
})

describe('il Calendario sa se il costo c\'e\'', () => {
  it('una giornata del registro non ha food cost noto', () => {
    expect(foodcostNoto({ fonte_incassi: 'registro', solo_totale: true, foodcost_noto: false, kpi: { totV: 1000, totFC: 0, totMP: 100 } })).toBe(false)
  })
})
