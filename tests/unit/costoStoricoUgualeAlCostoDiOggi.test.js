// ── Lo stesso food cost, anche guardando indietro ─────────────────────────
//
// Il difetto, misurato il 19/09/2026 durante l'audit della suite.
//
// Il prodotto ha una TERZA strada per il costo di una ricetta, oltre alle due
// che `dueContiUnSoloCosto.test.js` tiene già insieme: `calcolaFCStorico`.
// Serve allo Storico produzione e al conto economico, e usa il prezzo delle
// materie prime valido **nel giorno della sessione**, così una produzione di
// giugno non viene rivalutata coi prezzi di settembre. L'idea è giusta.
//
// Il problema è che è una copia, e le correzioni fatte a `calcolaFC` non sono
// mai arrivate qui. Con il registro dei prezzi VUOTO — cioè quando non c'è
// nessuno storico e le due funzioni dovrebbero dire esattamente la stessa
// cosa — sono tre i casi in cui divergono. Misurati eseguendo le due funzioni
// sugli stessi dati:
//
//   caso                                    calcolaFC          calcolaFCStorico
//   base con ciclo A→B→A                    0 € + «ciclo»      0 € + NIENTE
//   base con un ingrediente senza prezzo    0 € + «GANACHE ›   0 € + NIENTE
//                                                cioccolato»
//   base con un prezzo solo STIMATO         0 € + «CREMA ›     0,30 €
//                                                latte»
//
// **Perché costa.** Le prime due non sbagliano il numero, sbagliano il
// silenzio: `mancanti` torna vuoto, quindi lo Storico produzione dichiara un
// food cost di 0 € senza dire che non lo sa. Una ricetta che costa zero entra
// nel conto economico con margine pieno. La terza sbaglia proprio il numero:
// la stessa ricetta, lo stesso giorno, costa una cosa nel Ricettario e
// un'altra nello Storico.
//
// Nota per chi legge fra sei mesi: `StoricoProduzioneView.jsx:283` e `:551`
// prendono solo `{tot: fc}` e buttano via `mancanti` comunque, quindi anche
// correggendo la libreria la pagina resta muta finché non si aggiorna anche
// quella. Sono due correzioni, non una.

import { describe, it, expect } from 'vitest'
import { calcolaFC, calcolaFCStorico, buildIngCosti } from '../../src/lib/foodcost.js'

const ic = (m) => {
  const o = {}
  for (const [n, kg] of Object.entries(m)) o[n] = { costoKg: kg, costoG: kg / 1000 }
  return o
}
const OGGI = '2026-09-19T12:00:00'

/** Le due strade, sugli stessi dati e senza nessuno storico prezzi. */
const dueStrade = (ricetta, ingCosti, ricettario) => ({
  oggi: calcolaFC(ricetta, ingCosti, ricettario),
  storico: calcolaFCStorico(ricetta, ingCosti, ricettario, [], OGGI),
})

describe('il righello: senza storico prezzi le due strade sono confrontabili', () => {
  it('su una ricetta normale danno lo stesso numero', () => {
    // Se questa cade, non è un difetto del prodotto: è il banco di prova
    // sbagliato, e le prove qui sotto non vogliono dire niente.
    const r = {
      ricette: { TORTA: { nome: 'TORTA', tipo: 'fetta', unita: 8, prezzo: 30,
        ingredienti: [{ nome: 'farina', qty1stampo: 500 }, { nome: 'burro', qty1stampo: 200 }] } },
      ingredienti_costi: {},
    }
    const ingCosti = buildIngCosti(ic({ farina: 1, burro: 8 }))
    const { oggi, storico } = dueStrade(r.ricette.TORTA, ingCosti, r)
    expect(oggi.tot).toBeCloseTo(2.1, 6)
    expect(storico.tot).toBeCloseTo(oggi.tot, 6)
  })

  it('e anche quando una base ha una ricetta vera, con tutti i prezzi', () => {
    const r = {
      ricette: {
        FROLLA: { nome: 'FROLLA', tipo: 'semilavorato', unita: 1, prezzo: 0, totImpasto1: 1000,
          ingredienti: [{ nome: 'farina', qty1stampo: 600 }, { nome: 'burro', qty1stampo: 400 }] },
        CROSTATA: { nome: 'CROSTATA', tipo: 'fetta', unita: 8, prezzo: 30,
          ingredienti: [{ nome: 'FROLLA', qty1stampo: 500 }] },
      },
      ingredienti_costi: {},
    }
    const ingCosti = buildIngCosti(ic({ farina: 1, burro: 8 }))
    const { oggi, storico } = dueStrade(r.ricette.CROSTATA, ingCosti, r)
    expect(oggi.tot).toBeGreaterThan(0)
    expect(storico.tot).toBeCloseTo(oggi.tot, 6)
    expect(storico.mancanti).toEqual(oggi.mancanti)
  })

  it('il prezzo del giorno della sessione batte quello di oggi', () => {
    // Questa è la ragione per cui `calcolaFCStorico` esiste: va tenuta.
    const r = { ricette: { T: { nome: 'T', tipo: 'fetta', unita: 1, prezzo: 10,
      ingredienti: [{ nome: 'burro', qty1stampo: 1000 }] } }, ingredienti_costi: {} }
    const ingCosti = buildIngCosti(ic({ burro: 10 }))
    const log = [{ ingrediente: 'burro', prezzoNuovo: 4, prezzoVecchio: 3, data: '2026-01-10' }]
    // A giugno il burro valeva 4 €/kg (l'ultima variazione prima di allora).
    expect(calcolaFCStorico(r.ricette.T, ingCosti, r, log, '2026-06-01T12:00:00').tot).toBeCloseTo(4, 6)
    // Oggi ne vale 10.
    expect(calcolaFC(r.ricette.T, ingCosti, r).tot).toBeCloseTo(10, 6)
  })
})

// ── I tre casi in cui divergono ───────────────────────────────────────────
//
// Sono SALTATE perché oggi falliscono: descrivono il comportamento giusto, non
// quello attuale. Il difetto è reale ed è nel prodotto, non qui — l'audit non
// tocca `src/`. Tolto il `.skip`, si vede subito se la correzione è arrivata.
describe.skip('DIFETTO APERTO 19/09/2026 — lo Storico tace dove il Ricettario avvisa', () => {
  it('un ciclo fra basi deve comparire fra i mancanti anche nello Storico', () => {
    const r = {
      ricette: {
        A: { nome: 'A', tipo: 'semilavorato', unita: 1, prezzo: 0, totImpasto1: 1000,
          ingredienti: [{ nome: 'B', qty1stampo: 500 }] },
        B: { nome: 'B', tipo: 'semilavorato', unita: 1, prezzo: 0, totImpasto1: 1000,
          ingredienti: [{ nome: 'A', qty1stampo: 500 }] },
        T: { nome: 'T', tipo: 'fetta', unita: 1, prezzo: 10, ingredienti: [{ nome: 'A', qty1stampo: 100 }] },
      },
      ingredienti_costi: {},
    }
    const { oggi, storico } = dueStrade(r.ricette.T, {}, r)
    expect(oggi.mancanti.some(m => m.toLowerCase().includes('ciclo'))).toBe(true)
    // MISURATO 19/09/2026: storico.mancanti === []
    expect(storico.mancanti).toEqual(oggi.mancanti)
  })

  it('un ingrediente senza prezzo dentro una base deve risalire anche nello Storico', () => {
    const r = {
      ricette: {
        GANACHE: { nome: 'GANACHE', tipo: 'semilavorato', unita: 1, prezzo: 0, totImpasto1: 1000,
          ingredienti: [{ nome: 'cioccolato', qty1stampo: 1000 }] },
        TARTUFO: { nome: 'TARTUFO', tipo: 'fetta', unita: 1, prezzo: 10,
          ingredienti: [{ nome: 'GANACHE', qty1stampo: 300 }] },
      },
      ingredienti_costi: {},
    }
    const { oggi, storico } = dueStrade(r.ricette.TARTUFO, {}, r)
    expect(oggi.mancanti).toContain('GANACHE › cioccolato')
    // MISURATO 19/09/2026: storico.mancanti === [], con tot 0 €.
    expect(storico.mancanti).toEqual(oggi.mancanti)
  })

  it('una stima di mercato dentro una base non deve fare il conto solo da una parte', () => {
    const r = {
      ricette: {
        CREMA: { nome: 'CREMA', tipo: 'semilavorato', unita: 1, prezzo: 0, totImpasto1: 1000,
          ingredienti: [{ nome: 'latte', qty1stampo: 1000 }] },
        BIGNE: { nome: 'BIGNE', tipo: 'fetta', unita: 1, prezzo: 10,
          ingredienti: [{ nome: 'CREMA', qty1stampo: 200 }] },
      },
      ingredienti_costi: {},
    }
    const ingCosti = { latte: { costoKg: 1.5, costoG: 0.0015, isStima: true } }
    const { oggi, storico } = dueStrade(r.ricette.BIGNE, ingCosti, r)
    // MISURATO 19/09/2026: oggi 0 € (+ «CREMA › latte»), storico 0,30 €.
    expect(storico.tot).toBeCloseTo(oggi.tot, 6)
    expect(storico.mancanti).toEqual(oggi.mancanti)
  })
})
