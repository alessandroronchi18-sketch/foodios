// Le istruzioni al lettore automatico dello scontrino.
//
// La prima riga dice all'AI con che tipo di attività ha a che fare. Quella
// riga si costruiva incollando lo slug del database dentro «una ___ italiana»,
// e per cinque dei dieci tipi selezionabili in registrazione veniva fuori una
// frase che non sta in piedi: «una panificio italiana», «una ristorante
// italiana», «una pasta_fresca italiana», «una altro italiana». Qui si
// verifica che nessuno dei dieci — più i casi vuoti — produca più una frase
// sgrammaticata o uno slug a vista.

import { describe, it, expect } from 'vitest'
import { promptScontrino, categorieLette, nomeAttivita } from '../../src/lib/promptScontrino'

// Gli stessi slug che AuthPage.jsx offre in registrazione.
const TIPI = [
  'pasticceria', 'gelateria', 'cioccolateria', 'panificio', 'pizzeria',
  'pasta_fresca', 'gastronomia', 'bar', 'ristorante', 'altro',
]

describe('promptScontrino — come si chiama l\'attività', () => {
  it('ogni tipo ha un nome in italiano con l\'articolo giusto', () => {
    for (const t of TIPI) {
      const n = nomeAttivita(t)
      expect(n, t).toMatch(/^(un|una|un') /)
    }
  })

  it('nessuno slug tecnico finisce a vista nella frase', () => {
    for (const t of TIPI) {
      const frase = promptScontrino(t).split('\n')[0]
      expect(frase, t).not.toMatch(/_/)          // pasta_fresca
      expect(frase, t).not.toMatch(/\baltro\b/)  // "una altro italiana"
    }
  })

  it('nessuna concordanza sbagliata: mai «una» davanti a un maschile', () => {
    // I tre casi che rompevano: panificio, ristorante, bar.
    expect(nomeAttivita('panificio')).toBe('un panificio')
    expect(nomeAttivita('ristorante')).toBe('un ristorante')
    expect(nomeAttivita('bar')).toBe('un bar')
    // E i femminili restano femminili.
    expect(nomeAttivita('pasticceria')).toBe('una pasticceria')
    expect(nomeAttivita('gelateria')).toBe('una gelateria')
  })

  it('senza tipo, o con un tipo mai visto, dice «un locale alimentare»', () => {
    for (const t of ['', null, undefined, 'macelleria', 'FOO']) {
      expect(nomeAttivita(t)).toBe('un locale alimentare')
    }
  })

  it('il tipo si riconosce anche scritto storto (maiuscole, spazi)', () => {
    expect(nomeAttivita('  GELATERIA ')).toBe('una gelateria')
    expect(categorieLette('Bar')).toBe(categorieLette('bar'))
  })
})

describe('promptScontrino — le categorie da cercare', () => {
  it('ogni tipo ha categorie sue, non il generico', () => {
    const generico = categorieLette('macelleria')
    for (const t of TIPI.filter(t => t !== 'altro')) {
      expect(categorieLette(t), t).not.toBe(generico)
      expect(categorieLette(t).length, t).toBeGreaterThan(10)
    }
  })

  it('la gelateria cerca il gelato (era escluso a priori, ed è il design partner)', () => {
    expect(categorieLette('gelateria')).toMatch(/gelato/)
    expect(promptScontrino('gelateria')).toMatch(/gelato/)
  })

  it('le categorie del tipo finiscono davvero dentro le istruzioni', () => {
    for (const t of TIPI) {
      expect(promptScontrino(t), t).toContain(categorieLette(t))
    }
  })
})

describe('promptScontrino — le istruzioni', () => {
  it('chiede il JSON e solo quello', () => {
    const p = promptScontrino('pasticceria')
    expect(p).toMatch(/Rispondi SOLO con JSON valido/)
    expect(p).toMatch(/senza markdown/)
  })

  it('chiede la data in formato ISO', () => {
    expect(promptScontrino('bar')).toMatch(/YYYY-MM-DD/)
  })

  it('vieta di inventare i prezzi illeggibili e prevede la lista «incerti»', () => {
    const p = promptScontrino('bar')
    expect(p).toMatch(/NON inventarlo/)
    expect(p).toMatch(/"incerti"/)
  })

  it('esclude le righe che non sono prodotti', () => {
    const p = promptScontrino('gelateria')
    for (const parola of ['sconto', 'totale generale', 'resto', 'contante', 'dati fiscali']) {
      expect(p.toLowerCase(), parola).toContain(parola)
    }
  })

  it('non presume un layout di scontrino particolare', () => {
    // Il difetto originale: le istruzioni citavano una sezione «> N PASTICCERIA»
    // di una cassa specifica, e su un'altra cassa non estraeva niente.
    for (const t of TIPI) {
      expect(promptScontrino(t), t).not.toMatch(/>\s*N\s+PASTICCERIA/)
    }
    expect(promptScontrino('bar')).toMatch(/non devi\s+assumere un layout particolare/)
  })

  it('è lo stesso testo a parità di tipo (nessun contenuto casuale)', () => {
    expect(promptScontrino('gelateria')).toBe(promptScontrino('gelateria'))
  })
})
