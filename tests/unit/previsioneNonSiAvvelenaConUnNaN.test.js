// ── La previsione: un dato storto non deve avvelenare tutto il resto ─────
//
// La pagina che dice quanto produrre domani. Il conto si regge su due pezzi:
// la tendenza (smoothing esponenziale sulla serie storica) e la stagionalità
// (quanto si produce di media il lunedì, il martedì, e così via).
//
// ── I due difetti corretti il 21/09/2026 ────────────────────────────────
//
// **1. Un NaN avvelenava la media di un intero giorno della settimana.**
// La somma degli stampi era `s + p.stampi`: su un prodotto senza `stampi` fa
// NaN, e NaN sommato a qualunque cosa resta NaN. Bastava **una** riga storta
// in mesi di dati perché il lunedì — o qualunque altro giorno — diventasse
// NaN per sempre, e con lui la previsione di quel giorno.
//
// Non è un caso di scuola: nell'account dimostrativo ci sono 142 sessioni nel
// formato vecchio, e nel database del design partner una sessione nata da un
// evento non porta tutti i campi.
//
// **2. Il giorno della settimana ricavato da `new Date('2026-09-21')`**, che
// è mezzanotte a Greenwich riletta in ora locale. In Italia torna giusto, a
// ovest no — ed è la quarta volta che questa forma costa cara in questo
// progetto.
import { describe, it, expect } from 'vitest'
import { previsione, calcolaPoiStagionale } from '../../src/components/PrevisioneDomanda.jsx'

const sess = (data, prodotti) => ({ data, prodotti })

describe('La media per giorno della settimana', () => {
  it('con dati puliti fa la media, e basta', () => {
    const m = calcolaPoiStagionale([
      sess('2026-09-21', [{ nome: 'A', stampi: 2 }]),   // lunedì
      sess('2026-09-14', [{ nome: 'A', stampi: 4 }]),   // lunedì
    ])
    expect(m[1]).toBe(3)
  })

  it('un prodotto senza il numero di stampi NON avvelena il giorno', () => {
    // È il difetto: bastava questa riga per far diventare NaN il lunedì.
    const m = calcolaPoiStagionale([
      sess('2026-09-21', [{ nome: 'A', stampi: 2 }]),
      sess('2026-09-14', [{ nome: 'B' }]),             // niente stampi
    ])
    expect(Number.isNaN(m[1]), 'il lunedì è diventato NaN').toBe(false)
    expect(m[1]).toBe(1)                                 // (2 + 0) / 2
  })

  it('e nemmeno uno stampi scritto come testo', () => {
    const m = calcolaPoiStagionale([
      sess('2026-09-21', [{ nome: 'A', stampi: '2' }]),
      sess('2026-09-14', [{ nome: 'B', stampi: 'due' }]),
    ])
    expect(Number.isNaN(m[1])).toBe(false)
  })

  it('una sessione senza prodotti vale zero, non rompe niente', () => {
    const m = calcolaPoiStagionale([
      sess('2026-09-21', [{ nome: 'A', stampi: 6 }]),
      sess('2026-09-14', undefined),
    ])
    expect(m[1]).toBe(3)
  })

  it('una sessione senza data si salta', () => {
    const m = calcolaPoiStagionale([
      sess(null, [{ nome: 'A', stampi: 6 }]),
      sess('2026-09-21', [{ nome: 'A', stampi: 2 }]),
    ])
    expect(m[1]).toBe(2)
  })

  it('e una data illeggibile non finisce in un giorno a caso', () => {
    // `new Date('domani').getDay()` è NaN, e `byDow[NaN]` non esiste: prima
    // la riga spariva in silenzio invece di essere scartata di proposito.
    const m = calcolaPoiStagionale([
      sess('domani', [{ nome: 'A', stampi: 99 }]),
      sess('2026-09-21', [{ nome: 'A', stampi: 2 }]),
    ])
    expect(m[1]).toBe(2)
    expect(m.every(v => !Number.isNaN(v))).toBe(true)
  })
})

describe('Il giorno della settimana è quello giusto', () => {
  it('il 21 settembre 2026 è un lunedì', () => {
    const m = calcolaPoiStagionale([sess('2026-09-21', [{ nome: 'A', stampi: 5 }])])
    expect(m[1]).toBe(5)   // 1 = lunedì
    expect(m[0]).toBe(0)   // domenica vuota
  })

  it('e una data con l\'ora attaccata si legge lo stesso', () => {
    const m = calcolaPoiStagionale([sess('2026-09-21T23:30:00.000Z', [{ nome: 'A', stampi: 5 }])])
    expect(m[1]).toBe(5)
  })

  it('la domenica finisce in domenica', () => {
    const m = calcolaPoiStagionale([sess('2026-09-20', [{ nome: 'A', stampi: 3 }])])
    expect(m[0]).toBe(3)
  })
})

describe('La previsione non inventa un numero quando non ha dati', () => {
  it('senza nessuna rilevazione dice «non lo so», non zero', () => {
    // Zero e «non lo so» non sono la stessa cosa: zero vuol dire «domani non
    // produrrai niente», ed è una previsione, per giunta sbagliata.
    const r = previsione([])
    expect(r.prev).toBe(null)
    expect(r.confidence).toBe(0)
  })

  it('con una rilevazione sola non c\'è una tendenza da stimare', () => {
    const r = previsione([10])
    expect(r.prev).toBe(10)
    expect(r.confidence).toBe(0)
    expect(r.trend).toBe('flat')
  })

  it('con una serie in salita dice che sale', () => {
    const r = previsione([10, 12, 14, 16, 18])
    expect(r.trend).toBe('up')
    expect(r.prev).toBeGreaterThan(18)
  })

  it('con una serie in discesa dice che scende', () => {
    const r = previsione([20, 18, 16, 14, 12])
    expect(r.trend).toBe('down')
  })

  it('con una serie piatta dice che è piatta', () => {
    const r = previsione([10, 10, 10, 10, 10])
    expect(r.trend).toBe('flat')
    expect(r.prev).toBeCloseTo(10, 1)
  })

  it('e non prevede mai una produzione negativa', () => {
    // Una discesa ripida estrapolata tre periodi avanti finirebbe sotto zero:
    // «produci meno tre teglie» non vuol dire niente.
    const r = previsione([50, 30, 10, 2])
    expect(r.prev).toBeGreaterThanOrEqual(0)
  })

  it('su dati ballerini la confidenza è più bassa che su dati regolari', () => {
    const regolare = previsione([10, 10, 10, 10, 10, 10])
    const ballerino = previsione([2, 40, 3, 38, 1, 45])
    expect(ballerino.confidence).toBeLessThan(regolare.confidence)
  })
})

describe('Il righello di questo file', () => {
  it('senza la correzione la media sarebbe davvero NaN', () => {
    // Taratura: si rifà a mano il conto vecchio e si controlla che il difetto
    // ci fosse. Senza questa prova non si saprebbe se le prove qui sopra
    // proteggono qualcosa o girano a vuoto.
    const vecchio = [{ stampi: 2 }, { nome: 'B' }]
      .reduce((s, p) => s + p.stampi, 0)
    expect(Number.isNaN(vecchio)).toBe(true)
  })
})
