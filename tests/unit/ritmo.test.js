// Il ritmo del negozio: i calcoli che rendono utile un numero di giornata.
//
// Il vincolo che questi test difendono e' la prudenza dei giudizi. Dire "oggi
// sei andato sotto" quando la differenza rientra nella variazione normale fra
// due giovedi', o dedurre "il sabato vale il doppio" da un solo sabato in
// archivio, insegna a non fidarsi del confronto — e un confronto di cui non ti
// fidi e' peggio di nessun confronto.

import { describe, it, expect } from 'vitest'
import {
  isoWeekday, mediana, perGiornoSettimana, estremiSettimana,
  confrontoConSolito, scalaCalore, frasiDelMese,
} from '../../src/lib/ritmo'

/** Chiusura minima, nella forma che usano le viste. */
const ch = (data, totV) => ({ data, kpi: { totV } })

describe('mediana', () => {
  it('non si fa trascinare dal giorno eccezionale', () => {
    // Tre sabati normali e uno di Ferragosto: la media direbbe 1.150, che non
    // succede quasi mai. La mediana dice 800, che e' il sabato vero.
    expect(mediana([700, 800, 800, 2300])).toBe(800)
    expect(mediana([700, 800, 900])).toBe(800)
  })

  it('con numero pari di valori sta in mezzo', () => {
    expect(mediana([100, 200, 300, 400])).toBe(250)
  })

  it('su elenco vuoto o sporco non esplode', () => {
    expect(mediana([])).toBe(0)
    expect(mediana(null)).toBe(0)
    expect(mediana([NaN, undefined, 100])).toBe(100)
  })
})

describe('isoWeekday', () => {
  it('la domenica e\' 7, non 0', () => {
    expect(isoWeekday('2026-09-07')).toBe(1)   // lunedì
    expect(isoWeekday('2026-09-12')).toBe(6)   // sabato
    expect(isoWeekday('2026-09-13')).toBe(7)   // domenica
  })
})

describe('perGiornoSettimana', () => {
  it('mette ogni giornata nel suo giorno della settimana', () => {
    const voci = perGiornoSettimana([
      ch('2026-09-07', 300), ch('2026-09-14', 400),   // due lunedì
      ch('2026-09-12', 900),                          // un sabato
    ])
    expect(voci).toHaveLength(7)
    expect(voci[0]).toMatchObject({ sigla: 'lun', tipico: 350, giorni: 2 })
    expect(voci[5]).toMatchObject({ sigla: 'sab', tipico: 900, giorni: 1 })
    expect(voci[6]).toMatchObject({ sigla: 'dom', tipico: 0, giorni: 0 })
  })

  it('le giornate a zero non contano come giornate lavorate', () => {
    // Una chiusura salvata a zero e' un giorno di chiusura o un errore, non un
    // giorno che ha incassato zero: abbasserebbe il tipico di quel giorno.
    const voci = perGiornoSettimana([ch('2026-09-07', 0), ch('2026-09-14', 400)])
    expect(voci[0]).toMatchObject({ tipico: 400, giorni: 1 })
  })

  it('rispetta l\'intervallo richiesto', () => {
    const voci = perGiornoSettimana(
      [ch('2026-08-31', 100), ch('2026-09-07', 300)],
      { from: '2026-09-01', to: '2026-09-30' },
    )
    expect(voci[0]).toMatchObject({ tipico: 300, giorni: 1 })
  })
})

describe('estremiSettimana', () => {
  it('trova il giorno forte e quello debole', () => {
    const e = estremiSettimana([
      ch('2026-09-01', 300), ch('2026-09-08', 300),    // martedì
      ch('2026-09-05', 900), ch('2026-09-12', 900),    // sabato
    ])
    expect(e.migliore.sigla).toBe('sab')
    expect(e.peggiore.sigla).toBe('mar')
    expect(e.rapporto).toBe(3)
  })

  it('con un solo sabato in archivio non dichiara niente', () => {
    // "Il sabato vale il triplo" dedotto da un sabato e' una coincidenza.
    const e = estremiSettimana([ch('2026-09-05', 900), ch('2026-09-01', 300), ch('2026-09-08', 300)])
    expect(e).toBeNull()
  })

  it('senza dati non esplode', () => {
    expect(estremiSettimana([])).toBeNull()
    expect(estremiSettimana(null)).toBeNull()
  })
})

describe('confrontoConSolito', () => {
  // Quattro giovedì da 400 e uno da 600: il quinto e' andato bene.
  const giovedi = [
    ch('2026-08-06', 400), ch('2026-08-13', 400),
    ch('2026-08-20', 400), ch('2026-08-27', 400),
  ]

  it('giudica un giorno sui giorni uguali che lo precedono', () => {
    const c = confrontoConSolito([...giovedi, ch('2026-09-03', 600)], '2026-09-03')
    expect(c.tipico).toBe(400)
    expect(c.scostamento).toBe(200)
    expect(c.pct).toBe(50)
    expect(c.verso).toBe('sopra')
    expect(c.nome).toBe('giovedì')
    expect(c.riferimenti).toBe(4)
  })

  it('una differenza piccola resta "in linea"', () => {
    // Fra due giovedì il 5% di scarto e' rumore. Chiamarlo "meglio" ogni
    // giorno svuoterebbe di senso la parola.
    const c = confrontoConSolito([...giovedi, ch('2026-09-03', 420)], '2026-09-03')
    expect(c.pct).toBe(5)
    expect(c.verso).toBe('in linea')
  })

  it('non guarda il futuro: i giovedì successivi non contano', () => {
    const c = confrontoConSolito([
      ch('2026-09-03', 400), ch('2026-09-10', 5000), ch('2026-09-17', 5000), ch('2026-09-24', 5000),
    ], '2026-09-03')
    expect(c).toBeNull()   // prima del 3 settembre non c'e' nessun giovedì
  })

  it('sotto tre riferimenti non si pronuncia', () => {
    const c = confrontoConSolito([ch('2026-08-27', 400), ch('2026-09-03', 600)], '2026-09-03')
    expect(c).toBeNull()
  })

  it('non pesca i giorni della settimana sbagliati', () => {
    // Sabati in archivio, si chiede di un giovedì: nessun riferimento valido.
    const c = confrontoConSolito([
      ch('2026-08-08', 900), ch('2026-08-15', 900), ch('2026-08-22', 900),
      ch('2026-09-03', 400),
    ], '2026-09-03')
    expect(c).toBeNull()
  })

  it('guarda indietro solo la finestra chiesta', () => {
    const vecchi = [ch('2025-01-02', 400), ch('2025-01-09', 400), ch('2025-01-16', 400)]
    expect(confrontoConSolito([...vecchi, ch('2026-09-03', 600)], '2026-09-03')).toBeNull()
  })

  it('senza data o senza dati torna null', () => {
    expect(confrontoConSolito([], '2026-09-03')).toBeNull()
    expect(confrontoConSolito(giovedi, null)).toBeNull()
  })
})

describe('scalaCalore', () => {
  it('una giornata eccezionale non schiaccia tutte le altre', () => {
    // Col massimo come riferimento, 300 su 10.000 darebbe 0,03: tutte le
    // giornate normali diventerebbero della stessa tinta pallida.
    const s = scalaCalore([200, 300, 400, 500, 10000])
    expect(s(400)).toBeGreaterThan(0.5)
    expect(s(10000)).toBe(1)
  })

  it('il peso sta sempre fra 0 e 1', () => {
    const s = scalaCalore([100, 200, 300])
    for (const v of [0, -5, 50, 100, 300, 99999]) {
      expect(s(v)).toBeGreaterThanOrEqual(0)
      expect(s(v)).toBeLessThanOrEqual(1)
    }
  })

  it('zero e valori non validi pesano zero', () => {
    const s = scalaCalore([100, 200])
    expect(s(0)).toBe(0)
    expect(s(null)).toBe(0)
    expect(s('ciao')).toBe(0)
  })

  it('senza dati la mappa resta neutra invece di rompersi', () => {
    expect(scalaCalore([])(500)).toBe(0)
    expect(scalaCalore(null)(500)).toBe(0)
  })
})

describe('frasiDelMese', () => {
  it('somma il mese e trova la giornata migliore', () => {
    const f = frasiDelMese([
      ch('2026-09-01', 300), ch('2026-09-05', 900), ch('2026-09-08', 400),
    ], { from: '2026-09-01', to: '2026-09-30', giorniAperti: 6 })

    expect(f.totale).toBe(1600)
    expect(f.giorni).toBe(3)
    expect(Math.round(f.media)).toBe(533)
    expect(f.giornoMigliore).toEqual({ data: '2026-09-05', incasso: 900 })
    expect(f.daRegistrare).toBe(3)
  })

  it('mese vuoto: zero e nessuna giornata migliore, non un errore', () => {
    const f = frasiDelMese([], { from: '2026-09-01', to: '2026-09-30', giorniAperti: 0 })
    expect(f).toMatchObject({ totale: 0, giorni: 0, media: 0, giornoMigliore: null, daRegistrare: 0 })
  })

  it('i giorni da registrare non vanno mai sotto zero', () => {
    // Puo' succedere: giorni aperti calcolati sul mese, chiusure importate che
    // includono un giorno segnato come chiuso.
    const f = frasiDelMese([ch('2026-09-01', 300), ch('2026-09-02', 300)], { giorniAperti: 1 })
    expect(f.daRegistrare).toBe(0)
  })
})
