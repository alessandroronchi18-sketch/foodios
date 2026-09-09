// "pasta nocciola" non contiene glutine.
//
// La mappa degli allergeni ha la chiave generica 'pasta' → glutine, che serve
// per "pasta fresca" e "pasta sfoglia". Ma il match è per sottostringa, e
// "pasta" sta anche dentro "pasta nocciola", "pasta pistacchio", "pasta
// mandorla", "pasta di anacardi", "pasta gianduiotto", "pasta caramello".
//
// Nel database reale del 09/09/2026 sono SEI ingredienti su sette contenenti la
// parola "pasta": su tutti e sei usciva un glutine che non c'è.
//
// Non è un difetto innocuo. Un falso positivo su un allergene porta il gelataio
// a dichiarare il glutine per prudenza, e a perdere i clienti celiaci su un
// gusto che potrebbero mangiare tranquillamente. E toglie credibilità a tutte
// le altre crocette: se una è sbagliata, chi si fida delle altre?
//
// La correzione non può essere togliere 'pasta': "pasta fresca" il glutine ce
// l'ha. Servono le chiavi specifiche, che essendo più lunghe vincono il match e
// coprono la stessa porzione di stringa.

import { describe, it, expect } from 'vitest'
import { detectAllergeniFromIngredienti, analizzaAllergeni } from '../../src/lib/allergeni'

const certi = (nome) => detectAllergeniFromIngredienti([{ nome }])

describe('paste di frutta secca — niente glutine inventato', () => {
  // Gli ingredienti veri del ricettario di Mara.
  const paste = {
    'pasta nocciola': 'fruttasc',
    'pasta mandorla': 'fruttasc',
    'pasta pistacchio': 'fruttasc',
    'pasta di anacardi': 'fruttasc',
    'pasta gianduiotto': 'fruttasc',
  }

  for (const [nome, atteso] of Object.entries(paste)) {
    it(`"${nome}" non porta glutine, e porta ${atteso}`, () => {
      const out = certi(nome)
      expect(out, `"${nome}" non contiene glutine`).not.toContain('glutine')
      expect(out).toContain(atteso)
    })
  }

  it('"pasta caramello" non porta glutine', () => {
    expect(certi('pasta caramello')).not.toContain('glutine')
  })
})

describe('le paste che il glutine ce l hanno davvero non lo perdono', () => {
  const conGlutine = ['pasta fresca', 'pasta sfoglia', 'pasta frolla', 'pasta brisée', 'pasta']
  for (const nome of conGlutine) {
    it(`"${nome}" continua a portare glutine`, () => {
      expect(certi(nome)).toContain('glutine')
    })
  }

  it('pasta frolla porta anche uova e latte, come prima', () => {
    const out = certi('pasta frolla')
    expect(out).toContain('glutine')
    expect(out).toContain('uova')
    expect(out).toContain('latte')
  })
})

describe('latte e soia di caramello e gianduiotto: probabili, non certi', () => {
  it('il latte del caramello va chiesto, non dichiarato', () => {
    const a = analizzaAllergeni([{ nome: 'pasta caramello', qty1stampo: 100 }])
    expect(a.certi).not.toContain('latte')
    expect(a.daVerificare).toContain('latte')
  })

  it('il gianduiotto: nocciole certe, latte e soia da verificare', () => {
    const a = analizzaAllergeni([{ nome: 'pasta gianduiotto', qty1stampo: 100 }])
    expect(a.certi).toContain('fruttasc')
    expect(a.certi).not.toContain('glutine')
    expect(a.daVerificare).toContain('latte')
    expect(a.daVerificare).toContain('soia')
  })

  it('un ingrediente con un allergene certo non lo ripete fra i dubbi', () => {
    // Se il latte è già certo, non deve comparire anche fra quelli da chiedere.
    const a = analizzaAllergeni([{ nome: 'latte intero', qty1stampo: 500 }, { nome: 'pasta caramello', qty1stampo: 50 }])
    expect(a.certi).toContain('latte')
    expect(a.daVerificare).not.toContain('latte')
  })
})
