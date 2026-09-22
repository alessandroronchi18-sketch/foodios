// ── Con cosa ci si va, e chi ci può andare ──────────────────────────────
//
// Il titolare, 23/09/2026, parlando dei giri fra le sedi: «bisogna
// considerare chi ha la patente e chi no, altra informazione da mettere nel
// personale, e poi magari il tipo di trasporto».
//
// Non è un dettaglio. Carlina e Berthollet sono a pochi minuti a piedi, De
// Gasperi è dall'altra parte della città. Proporre a chi è in turno un giro
// che **non può fare** — perché non ha la patente, o perché con lo scooter
// quei venti chili non ci stanno — vuol dire fargli perdere tempo, che è
// esattamente il problema da cui siamo partiti.
import { describe, it, expect } from 'vitest'
import { MEZZI, mezzo, chiPuoAndare, ciSta, mezzoCheBasta } from '../../src/lib/mezziTrasporto.js'

const PERSONE = [
  { id: 'a', nome: 'Anna', patente: true, mezzi: ['piedi', 'bici', 'auto'] },
  { id: 'b', nome: 'Bea', patente: false, mezzi: ['piedi', 'bici'] },
  { id: 'c', nome: 'Carlo', patente: null, mezzi: null },
  { id: 'd', nome: 'Dino', patente: true, mezzi: ['piedi'] },
]

describe('I mezzi', () => {
  it('sono cinque, dal più piccolo al più grande', () => {
    expect(MEZZI.map(m => m.id)).toEqual(['piedi', 'bici', 'scooter', 'auto', 'furgone'])
  })

  it('e portano quantità crescenti', () => {
    const p = MEZZI.map(m => m.porta)
    expect(p).toEqual([...p].sort((a, b) => a - b))
  })

  it('solo i mezzi a motore vogliono la patente', () => {
    expect(mezzo('piedi').patente).toBe(false)
    expect(mezzo('bici').patente).toBe(false)
    expect(mezzo('scooter').patente).toBe(true)
    expect(mezzo('furgone').patente).toBe(true)
  })

  it('e un mezzo inventato non esiste', () => {
    expect(mezzo('elicottero')).toBe(null)
    expect(mezzo('')).toBe(null)
    expect(mezzo(null)).toBe(null)
  })
})

describe('Chi può fare il giro', () => {
  it('in auto: solo chi ha patente e auto', () => {
    const { possono, nonPossono } = chiPuoAndare(PERSONE, 'auto')
    expect(possono.map(p => p.nome)).toEqual(['Anna'])
    expect(nonPossono.find(p => p.nome === 'Bea').perche).toBe('non ha la patente')
    expect(nonPossono.find(p => p.nome === 'Dino').perche).toBe('non ha auto')
  })

  it('a piedi: quasi tutti', () => {
    const { possono } = chiPuoAndare(PERSONE, 'piedi')
    expect(possono.map(p => p.nome)).toEqual(['Anna', 'Bea', 'Dino'])
  })

  it('chi non l\'ha dichiarata si chiede, non si esclude', () => {
    // «Non lo so» non è «no». Trattarlo come un no vorrebbe dire proporre i
    // giri sempre alle stesse due persone, e non accorgersene mai.
    const { daChiedere, nonPossono } = chiPuoAndare(PERSONE, 'auto')
    expect(daChiedere.map(p => p.nome)).toEqual(['Carlo'])
    expect(daChiedere[0].perche).toMatch(/non so se ha la patente/)
    expect(nonPossono.map(p => p.nome)).not.toContain('Carlo')
  })

  it('e chi ha la patente ma non ha detto quali mezzi usa, si chiede lo stesso', () => {
    const { daChiedere } = chiPuoAndare([{ id: 'x', nome: 'Elsa', patente: true, mezzi: null }], 'auto')
    expect(daChiedere[0].perche).toMatch(/non so se può usare auto/)
  })

  it('il motivo c\'è sempre: «non può» da solo è un vicolo cieco', () => {
    const { nonPossono, daChiedere } = chiPuoAndare(PERSONE, 'scooter')
    for (const p of [...nonPossono, ...daChiedere]) {
      expect(p.perche, p.nome).toBeTruthy()
    }
  })

  it('e con un mezzo che non conosciamo non si esclude nessuno', () => {
    expect(chiPuoAndare(PERSONE, 'monopattino').possono).toHaveLength(4)
  })
})

describe('Ci sta, quella roba?', () => {
  it('quattro chili a piedi sì', () => {
    expect(ciSta(4000, 'piedi').ci_sta).toBe(true)
  })

  it('venti chili a piedi no, e lo dice con i numeri', () => {
    const r = ciSta(20000, 'piedi')
    expect(r.ci_sta).toBe(false)
    expect(r.frase).toMatch(/20 kg a piedi non ci stanno/)
    expect(r.frase).toMatch(/circa 5 kg/)
    expect(r.frase).toMatch(/due viaggi/)
  })

  it('e senza sapere quanto pesa non si dice niente', () => {
    expect(ciSta(null, 'auto').ci_sta).toBe(null)
    expect(ciSta(0, 'auto').ci_sta).toBe(null)
  })
})

describe('Il mezzo più piccolo che basta', () => {
  it('quattro chili si portano a piedi', () => {
    // Il più piccolo, non il più comodo: se quattro chili si portano a piedi,
    // il furgone è una macchina accesa per niente — ed è lo spreco da togliere.
    expect(mezzoCheBasta(4000).id).toBe('piedi')
  })

  it('dieci chili vogliono la bici, trenta l\'auto', () => {
    expect(mezzoCheBasta(10000).id).toBe('bici')
    expect(mezzoCheBasta(30000).id).toBe('auto')
  })

  it('e se hai solo quello che hai, si sceglie fra quelli', () => {
    expect(mezzoCheBasta(4000, { disponibili: ['auto', 'furgone'] }).id).toBe('auto')
    expect(mezzoCheBasta(10000, { disponibili: ['piedi'] })).toBe(null)
  })

  it('senza peso non si sceglie niente', () => {
    expect(mezzoCheBasta(null)).toBe(null)
    expect(mezzoCheBasta(0)).toBe(null)
  })
})

describe('Il righello di questo file', () => {
  it('niente cade su dati storti', () => {
    for (const s of [null, undefined, 'ciao', 42, {}, [], [null]]) {
      expect(() => chiPuoAndare(s, s)).not.toThrow()
      expect(() => ciSta(s, s)).not.toThrow()
      expect(() => mezzoCheBasta(s, s)).not.toThrow()
    }
  })

  it('e saprebbe accorgersi se la patente smettesse di contare', () => {
    // Taratura: se `chiPuoAndare` ignorasse la patente, Bea comparirebbe fra
    // chi può andare in auto.
    expect(chiPuoAndare(PERSONE, 'auto').possono.map(p => p.nome)).not.toContain('Bea')
  })
})
