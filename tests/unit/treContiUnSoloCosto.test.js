// ── Le TRE funzioni del food cost dicono lo stesso numero ────────────────
//
// Il prodotto calcola il costo di una ricetta in tre punti diversi:
//
//   `calcolaFC`          — il totale che sta sulla scheda
//   `calcolaFCDettaglio` — la tabella riga per riga, quando la scheda si apre
//   `calcolaFCStorico`   — lo stesso costo ricostruito a una data passata,
//                          usato dal P&L e dallo storico di produzione
//
// Il 18/09/2026 le prime due sono state messe d'accordo: davano numeri diversi
// su **29 ricette su 68** del ricettario vero di Mara dei Boschi, e sul totale
// ballavano 189,94 € contro 160,81 €.
//
// Il 19/09 un audit dei test ha trovato che **la terza era rimasta indietro**,
// con tre differenze — tutte e tre in favore di un costo più basso del vero:
//
//   1. il prezzo al chilo scritto a mano su una base NON vinceva sul calcolo
//      dai suoi ingredienti, come invece fa nelle altre due dal 16/09;
//   2. gli ingredienti senza prezzo DENTRO una base sparivano, perché la
//      ricorsione buttava via `mancanti`: il costo usciva più basso **e** la
//      ricetta dichiarava «nessun ingrediente senza prezzo». Il difetto
//      peggiore dei tre, perché si nasconde da solo;
//   3. il listino medio di mercato faceva ancora il conto, mentre dal 18/09
//      nelle altre due vale come prezzo mancante.
//
// Tre funzioni che calcolano lo stesso numero divergono sempre. Queste
// divergevano già, e nessuno se ne accorgeva perché i tre numeri non
// compaiono mai insieme sullo schermo.
import { describe, it, expect } from 'vitest'
import { calcolaFC, calcolaFCDettaglio, calcolaFCStorico, buildIngCosti } from '../../src/lib/foodcost'

// Il caso vero, ridotto: una base con la ricetta INCOMPLETA (due ingredienti
// su tre senza prezzo) e un prezzo al chilo scritto a mano.
const RICETTARIO = {
  ingredienti_costi: {
    'base bianca': { costoKg: 2.31, costoG: 0.00231 },
    panna: { costoKg: 4.7, costoG: 0.0047 },
  },
  ricette: {
    'BASE BIANCA': {
      nome: 'BASE BIANCA', tipo: 'semilavorato', unita: 0, prezzo: 0,
      ingredienti: [
        { nome: 'panna', qty1stampo: 10000 },
        { nome: 'zucchero di barbabietola', qty1stampo: 20000 },
        { nome: 'base mara', qty1stampo: 19850 },
      ],
    },
    NOCE: {
      nome: 'NOCE', tipo: 'gusto', unita: 1, prezzo: 0,
      ingredienti: [{ nome: 'base bianca', qty1stampo: 1000 }],
    },
  },
}

const ing = buildIngCosti(RICETTARIO.ingredienti_costi)
const QUANDO = '2026-09-19'

describe('I tre conti arrivano allo stesso numero', () => {
  it('su una ricetta che usa una base col prezzo scritto a mano', () => {
    const a = calcolaFC(RICETTARIO.ricette.NOCE, ing, RICETTARIO).tot
    const b = calcolaFCDettaglio(RICETTARIO.ricette.NOCE, ing, RICETTARIO).tot
    const c = calcolaFCStorico(RICETTARIO.ricette.NOCE, ing, RICETTARIO, [], QUANDO).tot
    expect(b).toBeCloseTo(a, 3)
    expect(c).toBeCloseTo(a, 3)
  })

  it('e il numero è quello scritto dal titolare, non la stima al ribasso', () => {
    // 1000 g × 2,31 €/kg. La ricetta della base, con due ingredienti su tre
    // senza prezzo, darebbe 0,94 €/kg: meno della metà.
    const c = calcolaFCStorico(RICETTARIO.ricette.NOCE, ing, RICETTARIO, [], QUANDO).tot
    expect(c).toBeCloseTo(2.31, 2)
  })
})

describe('Gli ingredienti senza prezzo dentro una base non spariscono', () => {
  // Il difetto peggiore dei tre: il costo usciva più basso E la ricetta
  // diceva di non avere ingredienti senza prezzo. Un buco che si nasconde.
  const SENZA_PREZZO_SCRITTO = {
    ingredienti_costi: { panna: { costoKg: 4.7, costoG: 0.0047 } },
    ricette: RICETTARIO.ricette,
  }
  const ing2 = buildIngCosti(SENZA_PREZZO_SCRITTO.ingredienti_costi)

  it('lo storico li elenca, con la base davanti al nome', () => {
    const { mancanti } = calcolaFCStorico(SENZA_PREZZO_SCRITTO.ricette.NOCE, ing2, SENZA_PREZZO_SCRITTO, [], QUANDO)
    expect(mancanti.length).toBeGreaterThan(0)
    // «base bianca › zucchero di barbabietola»: il nome si scrive con la base
    // davanti perché è lì che si va a correggerlo.
    expect(mancanti.join(' ')).toMatch(/base bianca ›/)
  })

  it('e ne elenca esattamente quanti ne elenca il conto della scheda', () => {
    const a = calcolaFC(SENZA_PREZZO_SCRITTO.ricette.NOCE, ing2, SENZA_PREZZO_SCRITTO)
    const c = calcolaFCStorico(SENZA_PREZZO_SCRITTO.ricette.NOCE, ing2, SENZA_PREZZO_SCRITTO, [], QUANDO)
    expect(c.mancanti.length).toBe(a.mancanti.length)
  })
})

describe('Quello che NON deve cambiare nello storico', () => {
  it('un prezzo storico vero vince sul prezzo di oggi: è il suo mestiere', () => {
    // È la ragione per cui questa funzione esiste: ricostruire quanto costava
    // una produzione **allora**, non quanto costerebbe adesso.
    const log = [{
      id: '1', data: '2026-03-01T10:00:00Z', decorre_da: '2026-03-01',
      ingrediente: 'panna', prezzoVecchio: 3.0, prezzoNuovo: 4.7,
    }]
    const ricetta = { nome: 'X', tipo: 'gusto', unita: 1, prezzo: 0,
      ingredienti: [{ nome: 'panna', qty1stampo: 1000 }] }
    const prima = calcolaFCStorico(ricetta, ing, RICETTARIO, log, '2026-02-01').tot
    const dopo = calcolaFCStorico(ricetta, ing, RICETTARIO, log, '2026-04-01').tot
    expect(prima).toBeCloseTo(3.0, 2)
    expect(dopo).toBeCloseTo(4.7, 2)
  })

  it('un ciclo fra due basi si ferma e lo dice, non torna zero in silenzio', () => {
    const ciclico = {
      ingredienti_costi: {},
      ricette: {
        A: { nome: 'A', tipo: 'semilavorato', unita: 0, prezzo: 0, ingredienti: [{ nome: 'b', qty1stampo: 100 }] },
        B: { nome: 'B', tipo: 'semilavorato', unita: 0, prezzo: 0, ingredienti: [{ nome: 'a', qty1stampo: 100 }] },
        TORTA: { nome: 'TORTA', tipo: 'fetta', unita: 8, prezzo: 10, ingredienti: [{ nome: 'a', qty1stampo: 500 }] },
      },
    }
    const { mancanti } = calcolaFCStorico(ciclico.ricette.TORTA, {}, ciclico, [], QUANDO)
    expect(mancanti.join(' ')).toMatch(/ciclo/i)
  })

  it('un ingrediente normale senza prezzo resta «mancante»', () => {
    const ricetta = { nome: 'X', tipo: 'gusto', unita: 1, prezzo: 0,
      ingredienti: [{ nome: 'pasta di noce', qty1stampo: 80 }] }
    const { tot, mancanti } = calcolaFCStorico(ricetta, ing, RICETTARIO, [], QUANDO)
    expect(tot).toBe(0)
    expect(mancanti).toContain('pasta di noce')
  })
})
