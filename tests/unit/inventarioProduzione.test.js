// Coverage critica per `inventarioProduzione`: la formula del venduto e' la
// logica più sensibile del prodotto (quadratura inventario↔cassa). Errori qui
// = dipendenti che vedono numeri sbagliati ogni giorno.
//
// Audit 2026-07-01 batch 10: bug 17 giu su spedito_g ha mostrato che senza
// test la formula puo' regredire silenziosamente. Cementiamo i casi.

import { describe, it, expect } from 'vitest'
import {
  calcolaVendutoSettimana,
  totaliVenduti,
  scaloMagazzinoPerGusto,
  inventarioASessioni,
  ricettaDelGusto,
} from '../../src/lib/inventarioProduzione'

// Helper: riga inventario singola.
const riga = (gusto, data, p = {}) => ({
  gusto_nome: gusto, data,
  produzione_g: p.prod || 0,
  rimanenza_g: p.riman || 0,
  scarto_g: p.scarto || 0,
  spedito_g: p.spedito || 0,
})

describe('calcolaVendutoSettimana', () => {
  it('formula base: venduto = riman_prev + prod - riman - scarto - spedito', () => {
    const righe = [
      riga('NOCCIOLA', '2026-06-15', { prod: 5000, riman: 1500 }),  // lunedi: prev=0
      riga('NOCCIOLA', '2026-06-16', { prod: 3000, riman: 800 }),   // martedi: prev=1500
    ]
    const matrice = calcolaVendutoSettimana(righe, '2026-06-15')
    // Lunedi: 0 + 5000 - 1500 - 0 - 0 = 3500
    expect(matrice.NOCCIOLA['2026-06-15'].venduto).toBe(3500)
    // Martedi: 1500 + 3000 - 800 - 0 - 0 = 3700
    expect(matrice.NOCCIOLA['2026-06-16'].venduto).toBe(3700)
  })

  it('sottrae spedito_g (audit 17 giu — kg trasferiti != venduti retail)', () => {
    const righe = [
      riga('PISTACCHIO', '2026-06-15', { prod: 4000, riman: 500, spedito: 1500 }),
    ]
    const matrice = calcolaVendutoSettimana(righe, '2026-06-15')
    // 0 + 4000 - 500 - 0 - 1500 = 2000 (non 3500 senza spedito)
    expect(matrice.PISTACCHIO['2026-06-15'].venduto).toBe(2000)
    expect(matrice.PISTACCHIO['2026-06-15'].spedito).toBe(1500)
  })

  it('clamp venduto >= 0 ma espone vendutoRaw signed', () => {
    const righe = [
      riga('CIOCCOLATO', '2026-06-15', { prod: 1000, riman: 2000 }), // dipendente errore
    ]
    const matrice = calcolaVendutoSettimana(righe, '2026-06-15')
    expect(matrice.CIOCCOLATO['2026-06-15'].venduto).toBe(0)         // clamped
    expect(matrice.CIOCCOLATO['2026-06-15'].vendutoRaw).toBe(-1000)  // signed
  })

  it('giorni senza dati → venduto null (non 0, distinguishable)', () => {
    const righe = [
      riga('FIORDILATTE', '2026-06-15', { prod: 2000, riman: 500 }),
      // martedi assente
    ]
    const matrice = calcolaVendutoSettimana(righe, '2026-06-15')
    expect(matrice.FIORDILATTE['2026-06-16'].venduto).toBeNull()
  })

  it('input invalido (non-array, null) → ritorna oggetto vuoto', () => {
    expect(calcolaVendutoSettimana(null, '2026-06-15')).toEqual({})
    expect(calcolaVendutoSettimana(undefined, '2026-06-15')).toEqual({})
  })
})

describe('totaliVenduti', () => {
  it('somma il venduto sui 7 giorni per gusto', () => {
    const matrice = {
      LIMONE: {
        '2026-06-15': { venduto: 1000 },
        '2026-06-16': { venduto: 800 },
        '2026-06-17': { venduto: 600 },
      },
    }
    expect(totaliVenduti(matrice).LIMONE).toBe(2400)
  })

  it('null venduto -> 0', () => {
    const matrice = { CACAO: { '2026-06-15': { venduto: null } } }
    expect(totaliVenduti(matrice).CACAO).toBe(0)
  })
})

describe('scaloMagazzinoPerGusto', () => {
  const ricetta = {
    nome: 'NOCCIOLA',
    ingredienti: [
      { nome: 'zucchero', qty1stampo: 200 },
      { nome: 'pasta nocciola', qty1stampo: 100 },
      { nome: 'panna', qty1stampo: 500 },
    ],
  }
  const mag = {
    zucchero: { nome: 'zucchero', giacenza_g: 10000, soglia_g: 2000 },
    'pasta nocciola': { nome: 'pasta nocciola', giacenza_g: 5000, soglia_g: 1000 },
    panna: { nome: 'panna', giacenza_g: 8000, soglia_g: 2000 },
  }

  it('scala proporzionalmente al fattore = delta/pesoImpasto', () => {
    // pesoImpasto = 800g. delta = 1600g → fattore 2.
    // zucchero -400, pasta nocciola -200, panna -1000.
    const { nuovoMagazzino, ingredientiScalati } = scaloMagazzinoPerGusto(mag, ricetta, 1600)
    expect(nuovoMagazzino.zucchero.giacenza_g).toBe(9600)
    expect(nuovoMagazzino['pasta nocciola'].giacenza_g).toBe(4800)
    expect(nuovoMagazzino.panna.giacenza_g).toBe(7000)
    expect(ingredientiScalati).toHaveLength(3)
  })

  it('delta negativo (correzione al ribasso) → magazzino sale', () => {
    const { nuovoMagazzino } = scaloMagazzinoPerGusto(mag, ricetta, -800)
    expect(nuovoMagazzino.zucchero.giacenza_g).toBe(10200)
    expect(nuovoMagazzino.panna.giacenza_g).toBe(8500)
  })

  it('ammette giacenza negativa (no clamp, audit decision)', () => {
    const magLow = { ...mag, zucchero: { ...mag.zucchero, giacenza_g: 100 } }
    const { nuovoMagazzino } = scaloMagazzinoPerGusto(magLow, ricetta, 1600)
    expect(nuovoMagazzino.zucchero.giacenza_g).toBe(-300) // negativo, tracciabile
  })

  it('delta=0 o ricetta missing → no-op', () => {
    expect(scaloMagazzinoPerGusto(mag, ricetta, 0).ingredientiScalati).toEqual([])
    expect(scaloMagazzinoPerGusto(mag, null, 100).ingredientiScalati).toEqual([])
  })

  it('skip deltaIng non-finito (audit LOW 2026-07-01)', () => {
    const ricBadPeso = { nome: 'X', ingredienti: [{ nome: 'a', qty1stampo: 0 }] }
    // pesoImpasto = 0 → guard interno ritorna ingredientiScalati: []
    const { ingredientiScalati } = scaloMagazzinoPerGusto(mag, ricBadPeso, 100)
    expect(ingredientiScalati).toEqual([])
  })
})

describe('inventarioASessioni', () => {
  it('calcola venduto includendo spedito (audit 17 giu)', () => {
    const righe = [
      // 3 giorni consecutivi su FRAGOLA con spedizioni
      riga('FRAGOLA', '2026-06-15', { prod: 5000, riman: 1000 }),
      riga('FRAGOLA', '2026-06-16', { prod: 4000, riman: 500, spedito: 1500 }),
      riga('FRAGOLA', '2026-06-17', { prod: 0, riman: 200 }),
    ]
    const sessioni = inventarioASessioni(righe)
    expect(sessioni.length).toBeGreaterThan(0)
    // Giorno 2: 1000 + 4000 - 500 - 0 - 1500 = 3000 venduto, 3kg
    const giorno2 = sessioni.find(s => s.data === '2026-06-16')
    expect(giorno2?.prodotti?.[0]?.vendibile).toBeCloseTo(3, 1)
  })

  it('gap > 1 giorno → reset rimanPrev (no eredita stock)', () => {
    const righe = [
      riga('CAFFÈ', '2026-06-10', { prod: 3000, riman: 1500 }),
      // gap di 4 giorni
      riga('CAFFÈ', '2026-06-15', { prod: 2000, riman: 200 }),
    ]
    const sessioni = inventarioASessioni(righe)
    // Per 06-15: prev resetta a 0 → venduto = 0 + 2000 - 200 = 1800
    const giorno15 = sessioni.find(s => s.data === '2026-06-15')
    expect(giorno15?.prodotti?.[0]?.vendibile).toBeCloseTo(1.8, 1)
  })

  it('input vuoto / non-array → []', () => {
    expect(inventarioASessioni([])).toEqual([])
    expect(inventarioASessioni(null)).toEqual([])
  })
})

describe('ricettaDelGusto', () => {
  const ricettario = {
    ricette: {
      NOCCIOLA: { nome: 'NOCCIOLA', ingredienti: [] },
      'fior di latte': { nome: 'fior di latte', ingredienti: [] },
    },
  }

  it('match case-insensitive', () => {
    expect(ricettaDelGusto(ricettario, 'NOCCIOLA')?.nome).toBe('NOCCIOLA')
    expect(ricettaDelGusto(ricettario, 'nocciola')?.nome).toBe('NOCCIOLA')
    expect(ricettaDelGusto(ricettario, 'FIOR DI LATTE')?.nome).toBe('fior di latte')
  })

  it('non trovato → null', () => {
    expect(ricettaDelGusto(ricettario, 'INESISTENTE')).toBeFalsy()
  })

  it('ricettario null → null senza crash', () => {
    expect(ricettaDelGusto(null, 'NOCCIOLA')).toBeFalsy()
    expect(ricettaDelGusto({}, 'NOCCIOLA')).toBeFalsy()
  })
})
