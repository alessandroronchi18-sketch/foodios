// La funzione che decide QUANTO PRODURRE domani.
//
// Due difetti trovati l'11/09/2026, tutti e due sul numero mostrato in pagina:
//
// 1. L'orizzonte. La funzione guarda avanti `periodi` mesi, e il valore di
//    default è TRE. I due punti che la usavano la chiamavano senza argomento e
//    poi mostravano il risultato come "la previsione del mese prossimo",
//    costruendoci sopra il suggerimento di produzione giornaliero. Con una
//    tendenza in crescita il numero usciva gonfiato di due mesi di crescita;
//    in calo, sgonfiato. (Il backtest dell'accuratezza passava già 1: era solo
//    la strada mostrata a schermo a non farlo.)
//
// 2. Il valore inventato. Con meno di due rilevazioni tornava comunque un
//    numero, con una "confidenza" del 30%: un valore senza fondamento con
//    l'aria di una previsione.

import { describe, it, expect } from 'vitest'
import { previsione } from '../../src/components/PrevisioneDomanda.jsx'

describe('previsione — orizzonte', () => {
  it('un mese avanti non è tre mesi avanti', () => {
    // Serie che cresce di 10 al mese: 100, 110, 120, 130.
    const serie = [100, 110, 120, 130]
    const unMese = previsione(serie, 1).prev
    const treMesi = previsione(serie, 3).prev
    expect(treMesi).toBeGreaterThan(unMese)
    // La differenza è due mesi di crescita: non un dettaglio, un quinto del
    // numero.
    expect(treMesi - unMese).toBeGreaterThan(15)
  })

  it('su una serie piatta l orizzonte non cambia nulla', () => {
    const serie = [50, 50, 50, 50, 50]
    expect(previsione(serie, 1).prev).toBeCloseTo(previsione(serie, 3).prev, 0)
  })

  it('segue la tendenza in discesa', () => {
    const giu = previsione([200, 180, 160, 140], 1)
    expect(giu.prev).toBeLessThan(140)
    expect(giu.trend).toBe('down')
  })

  it('non prevede mai quantità negative', () => {
    // Un crollo ripido porterebbe la retta sotto zero: non si producono
    // meno di zero stampi.
    expect(previsione([100, 60, 20, 5], 3).prev).toBeGreaterThanOrEqual(0)
  })
})

describe('previsione — quando non c è abbastanza storico', () => {
  it('serie vuota: nessun numero, nessuna confidenza', () => {
    const r = previsione([], 1)
    expect(r.prev).toBeNull()
    expect(r.confidence).toBe(0)
  })

  it('serie nulla o non passata', () => {
    expect(previsione(null, 1).prev).toBeNull()
    expect(previsione(undefined, 1).prev).toBeNull()
  })

  it('una sola rilevazione: ripete quel valore, ma senza fingere confidenza', () => {
    // Prima tornava confidence 0.3, che a schermo diventava una pallina
    // colorata come se ci fosse una previsione vera dietro.
    const r = previsione([42], 1)
    expect(r.prev).toBe(42)
    expect(r.confidence).toBe(0)
  })
})

describe('previsione — confidenza', () => {
  it('una serie regolare si fida più di una ballerina', () => {
    const regolare = previsione([100, 101, 99, 100, 101], 1)
    const ballerina = previsione([10, 200, 5, 180, 20], 1)
    expect(regolare.confidence).toBeGreaterThan(ballerina.confidence)
  })

  it('con poche rilevazioni la confidenza resta bassa', () => {
    const poche = previsione([100, 105], 1)
    const tante = previsione([100, 102, 98, 101, 99, 103, 100], 1)
    expect(poche.confidence).toBeLessThan(tante.confidence)
  })

  it('la confidenza sta sempre fra 0 e 1', () => {
    for (const serie of [[1, 1000, 1, 1000], [5, 5, 5], [0, 0, 0, 0]]) {
      const c = previsione(serie, 1).confidence
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })
})
