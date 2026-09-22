// ── La merce entrata senza sapere quanto costa ──────────────────────────
//
// Metà delle bolle vere del design partner sono DDT puri: Vecchio Enrico e
// ConoArtic mandano le quantità e i prezzi arrivano con la fattura settimane
// dopo. Decisione del titolare, 22/09/2026: la merce entra lo stesso. Giusto
// — 85 kg di pasta nocciola sono arrivati davvero.
//
// Ma se quella fattura non arriva mai, in magazzino resta roba di cui nessuno
// sa il costo, e il food cost di tutto quello che la usa si regge su un
// prezzo vecchio. Alla domanda «dopo quanti giorni ti avviso?»: **45**.
//
// E alla domanda sulla granella di nocciola — che sulle bolle c'è sempre ma
// in nessuna fattura — il titolare ha risposto «non considerarla». Capita:
// c'è merce che il fornitore dà dentro e non fattura mai a parte. Senza
// poterla escludere, l'avviso diventerebbe un cartello fisso che nessuno
// guarda più, e allora non avviserebbe più di niente.
import { describe, it, expect } from 'vitest'
import {
  preparaScrittureBolla, merceSenzaPrezzo, saldaMerceSenzaPrezzo,
  avvisoMerceSenzaPrezzo, GIORNI_SENZA_PREZZO,
} from '../../src/lib/bolle.js'

const OGGI = '2026-09-23T10:00:00.000Z'
const giorniFa = (n) => new Date(Date.parse(OGGI) - n * 86400000).toISOString()

const rigaLog = (nome, giorni, extra = {}) => ({
  id: `r-${nome}-${giorni}`, data: giorniFa(giorni), ingrediente: nome,
  quantita_g: 50000, note: 'bolla Vecchio Enrico n. 20/26',
  bolla: 've|2026|2026-06-05', ...extra,
})

describe('Il segno si mette quando il documento non ha prezzi', () => {
  const stato = () => ({ magazzino: {}, logRif: [], ingredientiCosti: {}, logPrezzi: [] })
  const DOC = { fornitore: 'Vecchio Enrico', numero: '20/26', identita: 've|2026|2026-06-05' }

  it('una riga senza prezzo sul documento resta segnata', () => {
    const out = preparaScrittureBolla(
      [{ chiave: 'pasta nocciola', nome: 'Pasta nocciola', grammi: 50000, prezzoNonSulDocumento: true, azione: 'nessuna' }],
      DOC, stato(),
    )
    expect(out.logRif[0].senzaPrezzo).toBe(true)
  })

  it('una riga normale no', () => {
    const out = preparaScrittureBolla(
      [{ chiave: 'panna', nome: 'Panna', grammi: 4000, azione: 'applica', prezzoKg: 5 }],
      DOC, stato(),
    )
    expect(out.logRif[0].senzaPrezzo).toBeUndefined()
  })
})

describe('Dopo quarantacinque giorni si avvisa', () => {
  it('quarantasei giorni sì, quarantaquattro no', () => {
    expect(GIORNI_SENZA_PREZZO).toBe(45)
    const log = [rigaLog('pasta nocciola', 46, { senzaPrezzo: true }), rigaLog('pistacchio', 44, { senzaPrezzo: true })]
    const fuori = merceSenzaPrezzo(log, { oggi: OGGI })
    expect(fuori.map(r => r.nome)).toEqual(['pasta nocciola'])
  })

  it('la più vecchia viene per prima', () => {
    const log = [
      rigaLog('pistacchio', 60, { senzaPrezzo: true }),
      rigaLog('pasta nocciola', 90, { senzaPrezzo: true }),
    ]
    expect(merceSenzaPrezzo(log, { oggi: OGGI })[0].nome).toBe('pasta nocciola')
    expect(merceSenzaPrezzo(log, { oggi: OGGI })[0].giorni).toBe(90)
  })

  it('e una riga che il segno non ce l\'ha non entra mai', () => {
    expect(merceSenzaPrezzo([rigaLog('panna', 200)], { oggi: OGGI })).toEqual([])
  })

  it('la frase dice il nome e da quanto', () => {
    const f = avvisoMerceSenzaPrezzo(merceSenzaPrezzo([rigaLog('pasta nocciola', 60, { senzaPrezzo: true })], { oggi: OGGI }))
    expect(f).toMatch(/pasta nocciola/)
    expect(f).toMatch(/60 giorni/)
    expect(f).toMatch(/costo è ancora quello di prima/)
  })

  it('e con più di una lo dice al plurale, nominando la più vecchia', () => {
    const f = avvisoMerceSenzaPrezzo(merceSenzaPrezzo([
      rigaLog('pasta nocciola', 90, { senzaPrezzo: true }),
      rigaLog('pistacchio', 60, { senzaPrezzo: true }),
    ], { oggi: OGGI }))
    expect(f).toMatch(/2 materie prime/)
    expect(f).toMatch(/pasta nocciola/)
  })

  it('senza niente da dire, non si dice niente', () => {
    expect(avvisoMerceSenzaPrezzo([])).toBe(null)
    expect(avvisoMerceSenzaPrezzo(null)).toBe(null)
  })
})

describe('La granella non si considera', () => {
  it('una materia prima esclusa non compare mai', () => {
    // Decisione del titolare: «non considerarla». Sulle bolle c'è sempre, in
    // nessuna fattura — il fornitore la dà dentro.
    const log = [
      rigaLog('granella di nocciola', 90, { senzaPrezzo: true }),
      rigaLog('pasta nocciola', 90, { senzaPrezzo: true }),
    ]
    const fuori = merceSenzaPrezzo(log, { oggi: OGGI, escluse: ['granella di nocciola'] })
    expect(fuori.map(r => r.nome)).toEqual(['pasta nocciola'])
  })

  it('e il nome si riconosce anche scritto in un altro modo', () => {
    const log = [rigaLog('GRANELLA DI NOCCIOLA', 90, { senzaPrezzo: true })]
    expect(merceSenzaPrezzo(log, { oggi: OGGI, escluse: ['granella di nocciola'] })).toEqual([])
  })
})

describe('Quando la fattura arriva, il segno si toglie', () => {
  const log = [
    rigaLog('pasta nocciola', 90, { senzaPrezzo: true }),
    rigaLog('pistacchio', 90, { senzaPrezzo: true, bolla: 'altra|bolla|2026-01-01' }),
  ]

  it('solo alle righe di quella bolla', () => {
    const dopo = saldaMerceSenzaPrezzo(log, {
      bollaRiferita: 've|2026|2026-06-05',
      documento: { fornitore: 'Vecchio Enrico', numero: '28' },
    })
    expect(dopo[0].senzaPrezzo).toBeUndefined()
    expect(dopo[1].senzaPrezzo).toBe(true)
  })

  it('e resta scritto chi l\'ha saldata: un registro si corregge, non si altera', () => {
    const dopo = saldaMerceSenzaPrezzo(log, {
      bollaRiferita: 've|2026|2026-06-05',
      documento: { fornitore: 'Vecchio Enrico', numero: '28' },
    })
    expect(dopo[0].saldata).toBe('fattura Vecchio Enrico n. 28')
    expect(dopo[0].saldataIl).toBeTruthy()
    // La riga non è stata cancellata né riscritta: la quantità è quella.
    expect(dopo[0].quantita_g).toBe(50000)
  })

  it('e dopo il saldo non compare più fra gli avvisi', () => {
    const dopo = saldaMerceSenzaPrezzo(log, { bollaRiferita: 've|2026|2026-06-05', documento: {} })
    expect(merceSenzaPrezzo(dopo, { oggi: OGGI }).map(r => r.nome)).toEqual(['pistacchio'])
  })

  it('senza il riferimento non si tocca niente', () => {
    expect(saldaMerceSenzaPrezzo(log, {})).toBe(log)
  })
})

describe('Il righello di questo file', () => {
  it('niente cade su dati storti', () => {
    for (const s of [null, undefined, 'ciao', 42, {}, [null], [{ data: 'boh', senzaPrezzo: true }]]) {
      expect(() => merceSenzaPrezzo(s, {})).not.toThrow()
      expect(() => saldaMerceSenzaPrezzo(s, {})).not.toThrow()
      expect(() => avvisoMerceSenzaPrezzo(s)).not.toThrow()
    }
  })

  it('e una riga senza data non entra: non si sa da quanto', () => {
    expect(merceSenzaPrezzo([{ ingrediente: 'x', senzaPrezzo: true }], { oggi: OGGI })).toEqual([])
  })
})
