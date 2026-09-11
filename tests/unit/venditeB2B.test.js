import { describe, it, expect, vi } from 'vitest'
// supabase.js crea il client a top-level con env Vite assenti nei test → mock.
vi.mock('../../src/lib/supabase.js', () => ({ supabase: {} }))
import { pulisciRighe, calcolaTotaleRighe } from '../../src/lib/venditeB2B.js'

describe('pulisciRighe', () => {
  it('UPPERCASE prodotto, numeri IT, totale per riga', () => {
    const out = pulisciRighe([{ prodotto: 'focaccia', qta: '10', prezzo: '1,50' }])
    expect(out).toEqual([{ prodotto: 'FOCACCIA', qta: 10, prezzo: 1.5, totale: 15 }])
  })
  it('arrotonda il totale a 2 decimali', () => {
    expect(pulisciRighe([{ prodotto: 'x', qta: '3', prezzo: '0.333' }])[0].totale).toBe(1)
  })
  it('scarta righe senza prodotto o con qta<=0', () => {
    const out = pulisciRighe([
      { prodotto: '', qta: 5, prezzo: 1 },
      { prodotto: 'PANE', qta: 0, prezzo: 2 },
      { prodotto: '  pane  ', qta: '2', prezzo: '3' },
    ])
    expect(out).toEqual([{ prodotto: 'PANE', qta: 2, prezzo: 3, totale: 6 }])
  })
  it('qta/prezzo non numerici → 0 (riga scartata se qta 0)', () => {
    expect(pulisciRighe([{ prodotto: 'X', qta: 'abc', prezzo: 'def' }])).toEqual([])
  })
  it('input vuoto/nullo → []', () => {
    expect(pulisciRighe(null)).toEqual([])
    expect(pulisciRighe([])).toEqual([])
  })
  it('gestisce sia virgola sia punto come decimale', () => {
    expect(pulisciRighe([{ prodotto: 'A', qta: '1', prezzo: '2.50' }])[0].prezzo).toBe(2.5)
    expect(pulisciRighe([{ prodotto: 'B', qta: '1', prezzo: '2,50' }])[0].prezzo).toBe(2.5)
  })
})

describe('calcolaTotaleRighe', () => {
  it('somma i totali di riga', () => {
    expect(calcolaTotaleRighe([{ totale: 15 }, { totale: 6 }])).toBe(21)
  })
  it('se manca totale lo deriva da qta*prezzo', () => {
    expect(calcolaTotaleRighe([{ qta: 10, prezzo: 1.5 }])).toBe(15)
  })
  it('arrotonda a 2 decimali', () => {
    expect(calcolaTotaleRighe([{ totale: 0.1 }, { totale: 0.2 }])).toBe(0.3)
  })
  it('vuoto → 0', () => {
    expect(calcolaTotaleRighe([])).toBe(0)
    expect(calcolaTotaleRighe(null)).toBe(0)
  })
  it('coerente con pulisciRighe', () => {
    const righe = pulisciRighe([{ prodotto: 'A', qta: '12', prezzo: '0,80' }, { prodotto: 'B', qta: '5', prezzo: '2' }])
    expect(calcolaTotaleRighe(righe)).toBe(19.6)
  })
})

// Vendite B2B: il margine e la sede.
//
// Perche' questo test esiste. La pagina mostrava il selettore delle sedi in
// cima ma caricava tutte le vendite dell'azienda e non si ricaricava al
// cambio sede: cambiare sede non cambiava niente. Per Mara, che ha tre sedi,
// il "fatturato del mese" della sede di Torino centro era quello di tutte e
// tre.
//
// E il margine. Il costo di un pezzo si ricava dal ricettario dividendo il
// food cost per le unita' per stampo. Quando le unita' mancano il codice
// scriveva zero: margine = ricavo - 0 = 100%. Sul ricettario di Mara solo 2
// ricette su 27 hanno le unita' scritte, quindi 25 prodotti su 27 avrebbero
// mostrato "margine 100%". E' lo stesso difetto gia' corretto sugli Eventi.

// ── Il margine di una vendita ─────────────────────────────────────────────
// Stessa regola della pagina: il margine si mostra solo se il costo di TUTTE
// le righe e' noto.
function margineVendita(righe, fcUnit, totale) {
  let costo = 0, senzaCosto = 0
  for (const r of righe) {
    const u = fcUnit[(r.prodotto || '').toUpperCase().trim()]
    if (u == null) { senzaCosto++; continue }
    costo += u * (Number(r.qta) || 0)
  }
  const noto = righe.length > 0 && senzaCosto === 0 && totale > 0
  return {
    margine: noto ? totale - costo : null,
    margPct: noto ? (totale - costo) / totale * 100 : null,
    righeSenzaCosto: senzaCosto,
  }
}

describe('Margine di una vendita B2B', () => {
  it('un prodotto senza costo NON produce margine 100%', () => {
    // Il caso normale su Mara: la ricetta c'e', le unita' per stampo no.
    const r = margineVendita([{ prodotto: 'TORTA NOCCIOLA', qta: 10 }], {}, 200)
    expect(r.margine).toBeNull()
    expect(r.margPct).toBeNull()
    expect(r.righeSenzaCosto).toBe(1)
  })

  it('basta una riga senza costo per non poter dire il margine', () => {
    // Con due righe su tre note, sommare solo quelle darebbe un margine piu'
    // alto del vero: meglio non dirlo che dirlo sbagliato.
    const fc = { 'CONO': 0.4, 'COPPETTA': 0.5 }
    const r = margineVendita([
      { prodotto: 'CONO', qta: 100 },
      { prodotto: 'COPPETTA', qta: 100 },
      { prodotto: 'TORTA', qta: 2 },
    ], fc, 500)
    expect(r.margine).toBeNull()
    expect(r.righeSenzaCosto).toBe(1)
  })

  it('con tutti i costi noti il margine si calcola', () => {
    const fc = { 'CONO': 0.4, 'COPPETTA': 0.5 }
    const r = margineVendita([
      { prodotto: 'CONO', qta: 100 },      // 40 €
      { prodotto: 'COPPETTA', qta: 100 },  // 50 €
    ], fc, 300)
    expect(r.margine).toBe(210)
    expect(r.margPct).toBeCloseTo(70, 5)
    expect(r.righeSenzaCosto).toBe(0)
  })

  it('una vendita a totale zero non vale margine 0%', () => {
    const r = margineVendita([{ prodotto: 'CONO', qta: 1 }], { 'CONO': 0.4 }, 0)
    expect(r.margPct).toBeNull()
  })

  it('una vendita senza righe non vale margine pieno', () => {
    expect(margineVendita([], {}, 100).margine).toBeNull()
  })
})

// ── La mappa dei costi ────────────────────────────────────────────────────
// Stessa regola della pagina: chi non ha le unita', o ha ingredienti senza
// prezzo, resta FUORI dalla mappa invece di entrarci a zero.
function costruisciFcUnit(ricette) {
  const m = {}
  for (const r of ricette) {
    if (!(r.unita > 0)) continue
    if ((r.mancanti || []).length > 0) continue
    if (!(r.fc > 0)) continue
    m[r.nome.toUpperCase().trim()] = r.fc / r.unita
  }
  return m
}

describe('Mappa dei costi per pezzo', () => {
  it('una ricetta senza unita per stampo resta fuori, non entra a zero', () => {
    const m = costruisciFcUnit([{ nome: 'Torta', unita: 0, fc: 12, mancanti: [] }])
    expect(m['TORTA']).toBeUndefined()
  })

  it('una ricetta con ingredienti senza prezzo resta fuori', () => {
    const m = costruisciFcUnit([{ nome: 'Cono', unita: 10, fc: 4, mancanti: ['nocciole'] }])
    expect(m['CONO']).toBeUndefined()
  })

  it('una ricetta completa entra col costo per pezzo', () => {
    const m = costruisciFcUnit([{ nome: 'Cono', unita: 10, fc: 4, mancanti: [] }])
    expect(m['CONO']).toBe(0.4)
  })
})
