// Lo storico dei prezzi quando cambia l'anno — e quando cambia l'ora.
//
// Domanda del titolare, 18/09/2026: «controlla bene che non ci siano problemi
// con le date anche quando cambierà l'anno e si tornerà al 01/01, con gli
// storici dei prezzi ecc.».
//
// Il food cost di una produzione vecchia si ricostruisce da `logPrezzi`
// (`getPrezzoStoricoKg` in `src/lib/foodcost.js`): ogni riga dice da che
// giorno vale un prezzo, e il P&L di dicembre deve vedere i prezzi di
// dicembre anche se il 2 gennaio il fornitore ha aumentato tutto.
//
// ── I quattro difetti veri trovati quel giorno ───────────────────────────
//
// 1. **Il confronto era fra ISTANTI, la decorrenza è un GIORNO.** In archivio
//    `decorre_da` è scritto come mezzanotte di GREENWICH del giorno scelto
//    ('2027-01-01T00:00:00.000Z'), che in Italia è l'una di notte. Un prezzo
//    «dal 1° gennaio» non valeva ancora all'una di notte del 1° gennaio.
//
// 2. **Chiedendo il prezzo con un giorno, o con una data a mezzanotte, usciva
//    il prezzo VECCHIO.** `new Date('2027-01-01')` e `new Date(2027, 0, 1)`
//    sono due istanti diversi: il primo è mezzanotte a Greenwich, il secondo
//    mezzanotte a Torino, cioè le 23:00 del 31 dicembre a Greenwich. Chi
//    chiedeva «che prezzo avevo il 1° gennaio» si sentiva rispondere col
//    prezzo del 31 dicembre. Non si vedeva perché l'unico chiamante di oggi
//    (`StoricoProduzioneView.jsx:278`) chiede a mezzogiorno; bastava un
//    chiamante nuovo scritto nel modo ovvio.
//
// 3. **Una riga senza nessuna data valeva dal 1970.** `_entryDecorrenza`
//    risponde `null` quando mancano sia `data` sia `decorre_da`, e
//    `new Date(null)` è il 1° gennaio 1970 — con `getTime()` uguale a 0, che
//    `Number.isFinite` accetta. Il filtro che doveva scartare quella riga la
//    teneva, e quel prezzo diventava il prezzo di tutto il passato.
//
// 4. **Una data all'italiana veniva letta all'americana.** `new Date('07/01/2027')`
//    risponde 7 gennaio, non 1° luglio, in Chrome come in Safari, e senza
//    dire niente: un prezzo spostato di sei mesi in silenzio.
//
// La correzione: si confrontano due stringhe 'AAAA-MM-GG'. Fra due giorni
// scritti così il fuso non c'entra, l'ora legale non c'entra, e il 29
// febbraio non è un caso speciale.
//
// I test girano con TZ=Europe/Rome (`vitest.config.js`), che è il fuso di chi
// usa Foodos: è lì che i difetti 1 e 2 si vedono, perché l'Italia sta a est di
// Greenwich. Su un computer già in UTC non si vedrebbe niente — è lo stesso
// errore di misura costato sei giri di CI il 16/09/2026.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { getPrezzoStoricoKg, calcolaFCStorico, buildIngCosti } from '../../src/lib/foodcost'

// Come le scrive il prodotto: `data` è l'istante del salvataggio,
// `decorre_da` è mezzanotte UTC del giorno scelto nella finestra.
const riga = (decorreDaGiorno, prezzoVecchio, prezzoNuovo, extra = {}) => ({
  id: `lp-${decorreDaGiorno}`,
  data: '2026-12-31T22:59:00.000Z', // 31 dicembre, 23:59 italiane
  decorre_da: `${decorreDaGiorno}T00:00:00.000Z`,
  ingrediente: 'burro', prezzoVecchio, prezzoNuovo, ...extra,
})

// Il modo in cui lo Storico produzione chiede il food cost di una giornata.
const mezzogiorno = g => `${g}T12:00:00`

afterEach(() => { vi.useRealTimers() })

describe('il prezzo che decorre dal 1° gennaio', () => {
  const log = [riga('2027-01-01', 8, 12)]

  it('scritto il 31 dicembre alle 23:59, il 31 dicembre vale ancora il vecchio', () => {
    // È la promessa scritta nella finestra di conferma: «cambiando il prezzo
    // dal 01/01, il 31/12 usa ancora il vecchio».
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2026-12-31'))).toBe(8)
    expect(getPrezzoStoricoKg(log, 'burro', '2026-12-31')).toBe(8)
    expect(getPrezzoStoricoKg(log, 'burro', '2026-12-31T23:59:59')).toBe(8)
  })

  it('DIFETTO 1 — vale dal primo minuto del 1° gennaio, non dalle due di notte', () => {
    // Rosso prima della correzione: alle 00:30 italiane del 1° gennaio, a
    // Greenwich è ancora il 31 dicembre, e il confronto fra istanti diceva
    // «non ancora». La pasticceria che chiude la cassa dopo mezzanotte
    // lavorava sul prezzo vecchio.
    expect(getPrezzoStoricoKg(log, 'burro', '2027-01-01T00:00:00')).toBe(12)
    expect(getPrezzoStoricoKg(log, 'burro', '2027-01-01T00:30:00')).toBe(12)
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2027-01-01'))).toBe(12)
  })

  it('DIFETTO 2 — chiesto con un giorno o con una data a mezzanotte, risponde uguale', () => {
    // Rosso prima della correzione sulla forma `new Date(2027, 0, 1)`:
    // rispondeva 8, cioè il prezzo del 31 dicembre.
    expect(getPrezzoStoricoKg(log, 'burro', '2027-01-01')).toBe(12)
    expect(getPrezzoStoricoKg(log, 'burro', new Date(2027, 0, 1))).toBe(12)
    expect(getPrezzoStoricoKg(log, 'burro', new Date(2027, 0, 1, 0, 30))).toBe(12)
    // E dall'altra parte del confine la risposta non cambia col modo di
    // chiedere: il 31 dicembre è il 31 dicembre.
    expect(getPrezzoStoricoKg(log, 'burro', '2026-12-31')).toBe(8)
    expect(getPrezzoStoricoKg(log, 'burro', new Date(2026, 11, 31))).toBe(8)
    expect(getPrezzoStoricoKg(log, 'burro', new Date(2026, 11, 31, 23, 59))).toBe(8)
  })

  it('INTORNO — senza `when` si intende adesso, e «adesso» è il giorno italiano', () => {
    vi.useFakeTimers()
    // 31 dicembre 2026, 23:59 a Torino.
    vi.setSystemTime(new Date('2026-12-31T22:59:00.000Z'))
    expect(getPrezzoStoricoKg(log, 'burro')).toBe(8)
    // Un minuto e mezzo dopo: è il 1° gennaio a Torino, ancora il 31 a
    // Greenwich. Prima della correzione qui rispondeva 8.
    vi.setSystemTime(new Date('2026-12-31T23:30:00.000Z'))
    expect(getPrezzoStoricoKg(log, 'burro')).toBe(12)
  })

  it('INTORNO — il giorno dopo e il mese dopo restano al prezzo nuovo', () => {
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2027-01-02'))).toBe(12)
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2027-06-30'))).toBe(12)
  })

  it('INTORNO — prima di ogni modifica si legge il prezzo di prima, e se non c\'è si dice', () => {
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2026-01-01'))).toBe(8)
    const senzaPrezzoDiPrima = [riga('2027-01-01', null, 12)]
    expect(getPrezzoStoricoKg(senzaPrezzoDiPrima, 'burro', mezzogiorno('2026-01-01'))).toBeNull()
  })
})

describe('le date che il calendario rende speciali', () => {
  it('l\'ora legale di marzo non sposta la decorrenza', () => {
    // L'Italia passa a +2 l'ultima domenica di marzo: il 29 marzo 2026, il 28
    // marzo 2027.
    const log = [riga('2027-03-28', 8, 12)]
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2027-03-27'))).toBe(8)
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2027-03-28'))).toBe(12)
    expect(getPrezzoStoricoKg(log, 'burro', new Date(2027, 2, 28))).toBe(12)
  })

  it('l\'ora solare di ottobre non sposta la decorrenza', () => {
    // L'ultima domenica di ottobre dura 25 ore: il 25 ottobre 2026.
    const log = [riga('2026-10-25', 8, 12)]
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2026-10-24'))).toBe(8)
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2026-10-25'))).toBe(12)
    expect(getPrezzoStoricoKg(log, 'burro', new Date(2026, 9, 25))).toBe(12)
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2026-10-26'))).toBe(12)
  })

  it('il 29 febbraio del 2028 esiste e non è un caso speciale', () => {
    const log = [riga('2028-02-29', 8, 12)]
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2028-02-28'))).toBe(8)
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2028-02-29'))).toBe(12)
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2028-03-01'))).toBe(12)
  })

  it('tre anni di rincari di fila si leggono ciascuno nel suo anno', () => {
    // Il caso vero di una materia prima che aumenta ogni 1° gennaio: qui si
    // vede se i confini sono tutti al posto giusto, non solo il primo.
    const log = [
      riga('2028-01-01', 12, 15),
      riga('2027-01-01', 8, 12),
      riga('2026-01-01', null, 8),
    ]
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2025-12-31'))).toBeNull()
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2026-01-01'))).toBe(8)
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2026-12-31'))).toBe(8)
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2027-01-01'))).toBe(12)
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2027-12-31'))).toBe(12)
    expect(getPrezzoStoricoKg(log, 'burro', mezzogiorno('2028-01-01'))).toBe(15)
  })
})

describe('le righe di storico mal formate', () => {
  it('DIFETTO 3 — una riga senza nessuna data si scarta, non vale dal 1970', () => {
    // Rosso prima della correzione: rispondeva 99 per qualunque data dal 1970
    // in poi, cioè per tutto il passato del prodotto.
    const senzaData = [{ id: 'x', ingrediente: 'burro', prezzoVecchio: 8, prezzoNuovo: 99 }]
    expect(getPrezzoStoricoKg(senzaData, 'burro', mezzogiorno('2020-01-01'))).toBeNull()
    expect(getPrezzoStoricoKg(senzaData, 'burro', mezzogiorno('2026-09-18'))).toBeNull()
  })

  it('DIFETTO 3 — e non si intrufola davanti alle righe datate', () => {
    // Rosso prima della correzione: la riga senza data risultava la più
    // vecchia di tutte e rispondeva 99 per ogni giorno prima di giugno.
    const mista = [
      riga('2026-06-01', 8, 10),
      { id: 'x', ingrediente: 'burro', prezzoVecchio: null, prezzoNuovo: 99 },
    ]
    expect(getPrezzoStoricoKg(mista, 'burro', mezzogiorno('2026-01-01'))).toBe(8)
    expect(getPrezzoStoricoKg(mista, 'burro', mezzogiorno('2026-07-01'))).toBe(10)
  })

  it('DIFETTO 4 — una data all\'italiana non viene letta all\'americana', () => {
    // Rosso prima della correzione: '07/01/2027' diventava il 7 gennaio, e il
    // prezzo partiva con sei mesi di anticipo. '31/12/2026' invece era
    // Invalid Date e la riga spariva: due comportamenti diversi per due date
    // scritte allo stesso modo.
    const luglio = [{
      id: 'x', data: '07/01/2027', ingrediente: 'burro',
      prezzoVecchio: 8, prezzoNuovo: 12,
    }]
    expect(getPrezzoStoricoKg(luglio, 'burro', mezzogiorno('2027-02-01'))).toBeNull()
    const dicembre = [{
      id: 'y', data: '31/12/2026', ingrediente: 'burro',
      prezzoVecchio: 8, prezzoNuovo: 12,
    }]
    expect(getPrezzoStoricoKg(dicembre, 'burro', mezzogiorno('2027-02-01'))).toBeNull()
  })

  it('INTORNO — un `when` che non è una data non inventa una risposta', () => {
    const log = [riga('2027-01-01', 8, 12)]
    expect(getPrezzoStoricoKg(log, 'burro', 'boh')).toBeNull()
    expect(getPrezzoStoricoKg(log, 'burro', new Date('non una data'))).toBeNull()
  })

  it('INTORNO — `decorre_da` che manca ricade su `data`, come le righe vecchie', () => {
    // Le righe scritte prima che `decorre_da` esistesse (e quelle del seme
    // dimostrativo) hanno solo `data`.
    const soloData = [{
      id: 'x', data: '2026-12-31', ingrediente: 'burro',
      prezzoVecchio: 8, prezzoNuovo: 12,
    }]
    expect(getPrezzoStoricoKg(soloData, 'burro', mezzogiorno('2026-12-30'))).toBe(8)
    expect(getPrezzoStoricoKg(soloData, 'burro', mezzogiorno('2026-12-31'))).toBe(12)
  })
})

describe('due modifiche nello stesso giorno', () => {
  // Capita davvero: si sbaglia a battere il prezzo, si riapre la finestra e lo
  // si corregge. Le due righe hanno lo stesso giorno di decorrenza.
  const due = [
    { ...riga('2027-01-01', 12, 15), id: 'seconda', data: '2027-01-01T16:00:00.000Z' },
    { ...riga('2027-01-01', 8, 12), id: 'prima', data: '2027-01-01T09:00:00.000Z' },
  ]

  it('vince l\'ultima scritta, non la prima', () => {
    // Il log è tenuto dal più recente al più vecchio (`Dashboard.jsx` mette in
    // testa), e l'ordinamento a parità di giorno è stabile: resta quell'ordine.
    expect(getPrezzoStoricoKg(due, 'burro', mezzogiorno('2027-01-01'))).toBe(15)
  })

  it('INTORNO — il giorno prima nessuna delle due è in vigore', () => {
    expect(getPrezzoStoricoKg(due, 'burro', mezzogiorno('2026-12-31'))).toBe(8)
  })
})

describe('il food cost di una produzione a cavallo dell\'anno', () => {
  // Il giro intero, come lo fa lo Storico produzione: stessa ricetta, stessa
  // quantità, due giornate consecutive che stanno in due esercizi diversi.
  const ricetta = { nome: 'SACHER', ingredienti: [{ nome: 'burro', qty1stampo: 1000 }] }
  const ingCosti = buildIngCosti({ burro: { costoKg: 12, costoG: 0.012 } })
  const log = [riga('2027-01-01', 8, 12)]

  it('il 31 dicembre costa coi prezzi del 2026, il 1° gennaio con quelli del 2027', () => {
    const vecchio = calcolaFCStorico(ricetta, ingCosti, { ricette: {} }, log, mezzogiorno('2026-12-31'))
    const nuovo = calcolaFCStorico(ricetta, ingCosti, { ricette: {} }, log, mezzogiorno('2027-01-01'))
    expect(vecchio.tot).toBeCloseTo(8, 3)
    expect(nuovo.tot).toBeCloseTo(12, 3)
  })

  it('INTORNO — un ingrediente senza storico usa il prezzo di adesso, e lo dice quando manca', () => {
    const conCacao = { nome: 'SACHER', ingredienti: [{ nome: 'burro', qty1stampo: 1000 }, { nome: 'cacao', qty1stampo: 1000 }] }
    const costi = buildIngCosti({ burro: { costoKg: 12, costoG: 0.012 }, cacao: { costoKg: 20, costoG: 0.02 } })
    const r = calcolaFCStorico(conCacao, costi, { ricette: {} }, log, mezzogiorno('2026-12-31'))
    expect(r.tot).toBeCloseTo(8 + 20, 3)
    expect(r.mancanti).toEqual([])

    // Per il «manca davvero» serve un nome che il listino medio non conosca:
    // «cacao» ce l'ha (stima 9,50 €/kg), «aceto balsamicp» — il nome storto
    // che nasce battendolo dentro una ricetta — no. Verificato con
    // `buildIngCosti`, che di voci ne mette 413 anche partendo da una sola.
    const conIgnoto = { nome: 'SACHER', ingredienti: [{ nome: 'burro', qty1stampo: 1000 }, { nome: 'aceto balsamicp', qty1stampo: 1000 }] }
    const r2 = calcolaFCStorico(conIgnoto, ingCosti, { ricette: {} }, log, mezzogiorno('2026-12-31'))
    expect(r2.mancanti).toContain('aceto balsamicp')
    // E quello che si sa resta contato: il buco non porta via anche il resto.
    expect(r2.tot).toBeCloseTo(8, 3)
  })
})
