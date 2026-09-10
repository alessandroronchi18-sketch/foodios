// Coverage critica per `inventarioProduzione`: la formula del venduto e' la
// logica più sensibile del prodotto (quadratura inventario↔cassa). Errori qui
// = dipendenti che vedono numeri sbagliati ogni giorno.
//
// Audit 2026-07-01 batch 10: bug 17 giu su spedito_g ha mostrato che senza
// test la formula può regredire silenziosamente. Cementiamo i casi.

import { describe, it, expect } from 'vitest'
import {
  calcolaVendutoSettimana,
  totaliVenduti,
  dettaglioVenduto,
  serieVendutoGusto,
  kpiQuadraturaSettimana,
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
      riga('NOCCIOLA', '2026-06-14', { prod: 2000, riman: 0 }),     // domenica: base nota = 0
      riga('NOCCIOLA', '2026-06-15', { prod: 5000, riman: 1500 }),  // lunedi
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
      riga('PISTACCHIO', '2026-06-14', { prod: 0, riman: 0 }),
      riga('PISTACCHIO', '2026-06-15', { prod: 4000, riman: 500, spedito: 1500 }),
    ]
    const matrice = calcolaVendutoSettimana(righe, '2026-06-15')
    // 0 + 4000 - 500 - 0 - 1500 = 2000 (non 3500 senza spedito)
    expect(matrice.PISTACCHIO['2026-06-15'].venduto).toBe(2000)
    expect(matrice.PISTACCHIO['2026-06-15'].spedito).toBe(1500)
  })

  // AGGIORNATO 10/09/2026: questo test bloccava il difetto invece della
  // correzione. Il clamp a 0 gonfiava il venduto mostrato del 12,6% sui dati
  // veri di Mara: 766 celle su 7.012 uscivano negative per 3.042,6 kg, e il
  // totale passava da 24.057,8 kg reali a 27.100,4 kg a schermo. Ora il negativo resta col suo segno e la
  // cella e' marcata `quadra: false`, cosi la pagina può dirlo.
  it('venduto negativo: NON viene azzerato, e la cella e marcata come "non torna"', () => {
    const righe = [
      riga('CIOCCOLATO', '2026-06-14', { prod: 0, riman: 0 }),        // domenica: base nota = 0
      riga('CIOCCOLATO', '2026-06-15', { prod: 1000, riman: 2000 }),  // pesata sbagliata
    ]
    const matrice = calcolaVendutoSettimana(righe, '2026-06-15')
    const c = matrice.CIOCCOLATO['2026-06-15']
    expect(c.venduto).toBe(-1000)
    expect(c.vendutoRaw).toBe(-1000)
    expect(c.quadra).toBe(false)
    expect(c.motivo).toContain('non torna')
  })

  it('la base di partenza e l\'ultimo giorno REGISTRATO, non solo ieri (chiusura settimanale)', () => {
    // Gelateria chiusa il lunedi: domenica restano 3 kg, il martedi si
    // produce 1 kg e resta mezzo chilo. Venduto vero = 3 + 1 - 0,5 = 3,5 kg.
    // Prima il lunedi mancante azzerava la base e il martedi risultava
    // venduto = 1 - 0,5 = 0,5 kg (o negativo, e poi zero).
    const righe = [
      riga('FIORDILATTE', '2026-06-14', { prod: 4000, riman: 3000 }), // domenica
      riga('FIORDILATTE', '2026-06-16', { prod: 1000, riman: 500 }),  // martedi
    ]
    const matrice = calcolaVendutoSettimana(righe, '2026-06-15')
    const mart = matrice.FIORDILATTE['2026-06-16']
    expect(mart.venduto).toBe(3500)
    expect(mart.quadra).toBe(true)
    expect(mart.giorniIndietro).toBe(2)
    expect(mart.motivo).toContain('non registrat')
    // il lunedi resta un giorno non registrato, non uno zero
    expect(matrice.FIORDILATTE['2026-06-15'].venduto).toBeNull()
  })

  it('senza nessuna rimanenza precedente il venduto e null, non prod - riman', () => {
    // Prima riga in assoluto di un gusto: quanto c'era in vetrina prima non
    // lo sa nessuno. Inventare 0 significa spacciare per venduto del gelato
    // che magari era gia' li.
    const righe = [riga('ZABAIONE', '2026-06-15', { prod: 1000, riman: 2500 })]
    const matrice = calcolaVendutoSettimana(righe, '2026-06-15')
    const c = matrice.ZABAIONE['2026-06-15']
    expect(c.venduto).toBeNull()
    expect(c.registrata).toBe(true)
    expect(c.motivo).toContain('rimanenza del giorno prima')
  })

  it('due grafie dello stesso gusto finiscono nella stessa riga (CAFFè / CAFFÈ)', () => {
    // In produzione c'erano 117 righe "CAFFè FLORA" scritte da un import
    // vecchio: la pagina cercava "CAFFÈ FLORA" e non le trovava (156 kg
    // invisibili). Ora la chiave e' normalizzata e le due grafie si sommano.
    const righe = [
      { gusto_nome: 'CAFFè FLORA', data: '2026-06-14', produzione_g: 0, rimanenza_g: 1000, scarto_g: 0, spedito_g: 0 },
      { gusto_nome: 'CAFFÈ FLORA', data: '2026-06-15', produzione_g: 2000, rimanenza_g: 500, scarto_g: 0, spedito_g: 0 },
    ]
    const matrice = calcolaVendutoSettimana(righe, '2026-06-15')
    expect(Object.keys(matrice)).toEqual(['CAFFÈ FLORA'])
    expect(matrice['CAFFÈ FLORA']['2026-06-15'].venduto).toBe(2500)
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

  it('somma ALGEBRICA: il giorno che non torna si porta dietro il suo segno', () => {
    // Il negativo di un giorno e' quasi sempre la produzione scritta il
    // giorno dopo: sommando col segno i due giorni si compensano e il totale
    // della settimana torna quello vero. Azzerandolo si contava due volte.
    const matrice = {
      LIMONE: {
        '2026-06-15': { venduto: -400, quadra: false, registrata: true },
        '2026-06-16': { venduto: 1400, quadra: true, registrata: true },
      },
    }
    expect(totaliVenduti(matrice).LIMONE).toBe(1000)
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

  // AGGIORNATO 10/09/2026. Il test bloccava il comportamento vecchio: dopo un
  // buco nelle registrazioni la rimanenza precedente veniva buttata via.
  // Ma quel gelato non evapora: o e' rimasto in vetrina (gelateria chiusa) o
  // e' stato venduto nei giorni non registrati. In entrambi i casi togliere
  // 1,5 kg dal venduto significa perderli per sempre: e' una delle cause
  // delle celle con venduto negativo trovate nei dati veri di Mara.
  // Ora la rimanenza si riporta avanti fino a GIORNI_RIPORTO_MAX (7 giorni:
  // copre il giorno di chiusura settimanale e una settimana di ferie).
  // Oltre quel limite non e' più un'informazione affidabile e la cella
  // diventa "non calcolabile" invece di inventare uno zero.
  it('buco nelle registrazioni: la rimanenza si riporta avanti, non si perde', () => {
    const righe = [
      riga('CAFFÈ', '2026-06-10', { prod: 3000, riman: 1500 }),
      // gap di 4 giorni (dentro i 7 di riporto)
      riga('CAFFÈ', '2026-06-15', { prod: 2000, riman: 200 }),
    ]
    const sessioni = inventarioASessioni(righe)
    // Per 06-15: 1500 + 2000 - 200 = 3300 → 3,3 kg
    const giorno15 = sessioni.find(s => s.data === '2026-06-15')
    expect(giorno15?.prodotti?.[0]?.vendibile).toBeCloseTo(3.3, 1)
  })

  it('buco oltre i 7 giorni: il venduto non e calcolabile e resta fuori', () => {
    const righe = [
      riga('CAFFÈ', '2026-06-01', { prod: 3000, riman: 1500 }),
      // gap di 14 giorni: la rimanenza di due settimane prima non dice piu
      // niente su cosa c'era in vetrina
      riga('CAFFÈ', '2026-06-15', { prod: 2000, riman: 200 }),
    ]
    const sessioni = inventarioASessioni(righe)
    const giorno15 = sessioni.find(s => s.data === '2026-06-15')
    // la sessione c'e (2 kg prodotti) ma il vendibile non e inventato
    expect(giorno15?.prodotti?.[0]?.stampi).toBeCloseTo(2, 1)
    expect(giorno15?.prodotti?.[0]?.vendibile).toBe(0)
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

// ── Qualita' del dato: dettaglioVenduto ───────────────────────────────────
describe('dettaglioVenduto', () => {
  it('conta i giorni che non tornano e quelli non calcolabili, per gusto', () => {
    const matrice = {
      NOCCIOLA: {
        '2026-06-15': { venduto: 1000, quadra: true, registrata: true },
        '2026-06-16': { venduto: -300, quadra: false, registrata: true },
        '2026-06-17': { venduto: null, quadra: true, registrata: true },
        '2026-06-18': { venduto: null, quadra: true, registrata: false },
      },
    }
    const d = dettaglioVenduto(matrice).NOCCIOLA
    expect(d.celleNonQuadrate).toBe(1)
    expect(d.gNonQuadrati).toBe(-300)
    expect(d.celleNonCalcolabili).toBe(1)   // registrata ma senza base di partenza
    expect(d.giorniRegistrati).toBe(3)      // il 18 non e' registrato
    expect(d.giorniNonQuadrati).toEqual(['2026-06-16'])
  })
})

describe('serieVendutoGusto', () => {
  it('usa la stessa regola della settimanale (riporto e segno)', () => {
    const righe = [
      { gusto_nome: 'MENTA', data: '2026-06-10', produzione_g: 3000, rimanenza_g: 1000 },
      // 11 e 12 chiusi
      { gusto_nome: 'MENTA', data: '2026-06-13', produzione_g: 500, rimanenza_g: 200 },
    ]
    const serie = serieVendutoGusto(righe).MENTA
    expect(serie).toHaveLength(2)
    expect(serie[0].venduto).toBeNull()          // prima riga: base sconosciuta
    expect(serie[1].venduto).toBe(1300)          // 1000 + 500 - 200
    expect(serie[1].giorniIndietro).toBe(3)
  })
})

describe('kpiQuadraturaSettimana — qualita del dato', () => {
  it('dichiara quante celle non tornano invece di quadrare su numeri gonfiati', () => {
    const matrice = {
      A: {
        '2026-06-15': { venduto: 2000, quadra: true, registrata: true },
        '2026-06-16': { venduto: -500, quadra: false, registrata: true },
        '2026-06-17': { venduto: null, quadra: true, registrata: true },
      },
    }
    const kpi = kpiQuadraturaSettimana(matrice, [], 25, [])
    expect(kpi.totVendutoG).toBe(1500)        // algebrico, non 2000
    expect(kpi.celleNonQuadrate).toBe(1)
    expect(kpi.kgNonQuadrati).toBeCloseTo(-0.5, 5)
    expect(kpi.celleNonCalcolabili).toBe(1)
  })
})
