// Allergeni: "non lo so" non deve somigliare a "non contiene".
//
// Il difetto, misurato sui dati veri il 09/09/2026.
// `detectAllergeniFromIngredienti` restituisce un elenco piatto, e un elenco
// vuoto vuol dire due cose opposte: "riconosciuto e privo" oppure "non
// riconosciuto". La scheda mostrava una casella vuota identica nei due casi.
//
// Non è un dettaglio estetico: la scheda allergeni è prevista dal Regolamento
// UE 1169/2011, si stampa e si consegna al cliente. Sui 123 nomi di ingrediente
// realmente presenti nel database di produzione, 81 non producevano nessun
// allergene — e cinque prodotti da gelateria costruiti con quei nomi davano una
// riga COMPLETAMENTE VUOTA. Nella mappa dei 275 pattern la parola "cioccolato"
// non c'era: mancavano anche "cacao", "fondente", "copertura", "massa".

import { describe, it, expect } from 'vitest'
import { analizzaAllergeni, detectAllergeniFromIngredienti, ALLERGENI } from '../../src/lib/allergeni'

const ing = (...nomi) => nomi.map(n => ({ nome: n }))
const ids = new Set(ALLERGENI.map(a => a.id))

describe('i tre stati', () => {
  it('distingue "privo" da "non riconosciuto"', () => {
    // Acqua e zucchero: riconosciuti e privi. Nessun dubbio da sollevare.
    const sicuro = analizzaAllergeni(ing('acqua', 'zucchero', 'limone'))
    expect(sicuro.certi).toEqual([])
    expect(sicuro.daVerificare).toEqual([])
    expect(sicuro.nonRiconosciuti).toEqual([])

    // Un codice di prodotto che il programma non può conoscere.
    const ignoto = analizzaAllergeni(ing('massa 58', 'preparato x-42'))
    expect(ignoto.nonRiconosciuti).toContain('massa 58')
  })

  it('un allergene certo non compare anche fra i dubbi', () => {
    // Il burro dà latte con certezza; il cioccolato lo darebbe come probabile.
    // Vedere "Latte" due volte, una come certo e una come dubbio, è confusione.
    const r = analizzaAllergeni(ing('burro', 'cioccolato fondente'))
    expect(r.certi).toContain('latte')
    expect(r.daVerificare).not.toContain('latte')
  })

  it('restituisce solo id di allergeni previsti dal regolamento', () => {
    const r = analizzaAllergeni(ing('cioccolato', 'farina 00', 'nocciole', 'base bianca'))
    for (const a of [...r.certi, ...r.daVerificare]) expect(ids.has(a)).toBe(true)
  })

  it('su input sporco non esplode', () => {
    for (const v of [null, undefined, [], 'stringa', [null], [{}], [{ nome: '' }]]) {
      const r = analizzaAllergeni(v)
      expect(Array.isArray(r.certi)).toBe(true)
      expect(Array.isArray(r.daVerificare)).toBe(true)
      expect(Array.isArray(r.nonRiconosciuti)).toBe(true)
    }
  })
})

describe('i cinque prodotti da gelateria che davano la riga vuota', () => {
  // Nomi presi uno per uno dai 123 realmente presenti in produzione.
  const CASI = [
    ['base bianca', 'cioccolato fondente', 'zucchero'],
    ['cioccolato callebaut', 'acqua', 'zucchero', 'neutro'],
    ['copertura fondente', 'massa 58'],
    ['gocce di cioccolato', 'zucchero'],
    ['base agrimontana cioccolato', 'acqua'],
  ]

  it('prima non segnalavano NIENTE: è il difetto', () => {
    for (const c of CASI) {
      expect(detectAllergeniFromIngredienti(ing(...c))).toEqual([])
    }
  })

  it('ora segnalano almeno un allergene da verificare', () => {
    for (const c of CASI) {
      const r = analizzaAllergeni(ing(...c))
      const totale = r.certi.length + r.daVerificare.length + r.nonRiconosciuti.length
      expect(totale).toBeGreaterThan(0)
    }
  })

  it('la base del gelato porta il latte, il cioccolato porta la soia', () => {
    const gelato = analizzaAllergeni(ing('base bianca', 'cioccolato fondente', 'zucchero'))
    expect(gelato.daVerificare).toContain('latte')   // latte in polvere nella base
    expect(gelato.daVerificare).toContain('soia')    // lecitina nel cioccolato
  })
})

describe('quello che NON va segnalato', () => {
  it('cocco e semi di papavero non sono fra i 14 allergeni UE', () => {
    // Segnalarli sarebbe un falso positivo: chi legge impara a non fidarsi.
    for (const n of ['cocco', 'cocco rape', 'semi di papavero']) {
      const r = analizzaAllergeni(ing(n))
      expect(r.certi).toEqual([])
      expect(r.daVerificare).toEqual([])
      expect(r.nonRiconosciuti).toEqual([])
    }
  })

  it('le castagne restano segnalate come frutta a guscio (comportamento storico)', () => {
    // DOMANDA APERTA per il titolare, non un difetto che decido io.
    // L'allegato II del Reg. UE 1169/2011 elenca come "frutta a guscio" solo
    // mandorle, nocciole, noci, anacardi, pecan, noci del Brasile, pistacchi e
    // macadamia: la castagna NON c'è. Segnalarla è quindi un falso positivo
    // sul piano legale.
    // Ma ridurre un allergene dichiarato va nella direzione pericolosa, e
    // qualche allergico alla frutta a guscio reagisce anche alla castagna.
    // Questo test FOTOGRAFA il comportamento attuale perche' non cambi per
    // sbaglio: se il titolare decide di toglierlo, si cambia qui.
    // E rispondono allo stesso modo: prima "castagne" dava frutta a guscio e
    // "marroni" non dava niente, cioè la stessa cosa in due modi diversi.
    expect(analizzaAllergeni(ing('castagne')).certi).toContain('fruttasc')
    expect(analizzaAllergeni(ing('marroni')).certi).toContain('fruttasc')
    expect(analizzaAllergeni(ing('crema di marroni')).certi).toContain('fruttasc')
  })

  it('la frutta fresca non solleva dubbi', () => {
    const r = analizzaAllergeni(ing('mela', 'banana', 'fragole', 'mirtilli', 'carote'))
    expect(r.certi).toEqual([])
    expect(r.daVerificare).toEqual([])
    expect(r.nonRiconosciuti).toEqual([])
  })
})

describe('compatibilità con quello che c\'era', () => {
  it('gli allergeni certi restano gli stessi di prima', () => {
    // La funzione storica è ancora usata altrove: non deve cambiare risposta.
    const casi = [
      ['farina 00', 'burro', 'uova'],
      ['PASTA FROLLA', 'mela', 'zucchero', 'limone'],
      ['nocciole', 'zucchero'],
      ['latte', 'panna'],
    ]
    for (const c of casi) {
      const vecchio = [...detectAllergeniFromIngredienti(ing(...c))].sort()
      const nuovo = [...analizzaAllergeni(ing(...c)).certi].sort()
      expect(nuovo).toEqual(vecchio)
    }
  })
})
