import { describe, it, expect } from 'vitest'
import {
  detectAllergeniFromIngredienti, mergeAllergeni, ALLERGENI, ALLERGENI_MAPPING,
} from '../../src/lib/allergeni.js'

describe('detectAllergeniFromIngredienti', () => {
  it('rileva allergeni base (it/en, plurali)', () => {
    expect(detectAllergeniFromIngredienti(['Farina 00', 'Burro', 'Uova']).sort())
      .toEqual(['glutine', 'latte', 'uova'].sort())
    expect(detectAllergeniFromIngredienti(['butter', 'eggs', 'flour']).sort())
      .toEqual(['glutine', 'latte', 'uova'].sort())
  })

  it('accetta sia oggetti {nome} sia stringhe', () => {
    expect(detectAllergeniFromIngredienti([{ nome: 'Latte intero' }])).toEqual(['latte'])
  })

  it('è case-insensitive e ignora accenti/punteggiatura', () => {
    expect(detectAllergeniFromIngredienti(['CRÈME FRAÎCHE'])).toEqual(['latte'])
  })

  it('match più lungo vince: "farina di mandorle" → fruttasc, NON glutine', () => {
    expect(detectAllergeniFromIngredienti(['Farina di mandorle'])).toEqual(['fruttasc'])
  })

  it('prodotti composti aggiungono più allergeni', () => {
    expect(detectAllergeniFromIngredienti(['Pasta frolla']).sort())
      .toEqual(['glutine', 'latte', 'uova'].sort())
  })

  it('dedup tra ingredienti diversi che condividono allergene', () => {
    expect(detectAllergeniFromIngredienti(['Latte', 'Panna', 'Burro'])).toEqual(['latte'])
  })

  it('input non-array o vuoto → []', () => {
    expect(detectAllergeniFromIngredienti(null)).toEqual([])
    expect(detectAllergeniFromIngredienti([])).toEqual([])
    expect(detectAllergeniFromIngredienti([{ nome: '' }, 'xyz123'])).toEqual([])
  })

  it('solo id validi (subset di ALLERGENI)', () => {
    const validi = new Set(ALLERGENI.map(a => a.id))
    for (const id of detectAllergeniFromIngredienti(['Farina', 'Gamberi', 'Soia', 'Sesamo'])) {
      expect(validi.has(id)).toBe(true)
    }
  })

  it('le farine naturalmente senza glutine NON devono dichiarare glutine', () => {
    // Bug: la chiave generica "farina" matchava "farina di riso/mais/cocco" → falso glutine.
    expect(detectAllergeniFromIngredienti(['Farina di riso'])).toEqual([])
    expect(detectAllergeniFromIngredienti(['Farina di mais'])).toEqual([])
    expect(detectAllergeniFromIngredienti(['Farina di cocco'])).toEqual([])
    expect(detectAllergeniFromIngredienti(['Farina di ceci'])).toEqual([])
  })
})

describe('mergeAllergeni', () => {
  it('unione univoca di rilevati + manuali', () => {
    expect(mergeAllergeni(['glutine'], ['latte', 'glutine']).sort()).toEqual(['glutine', 'latte'])
  })
  it('gestisce input nulli', () => {
    expect(mergeAllergeni(null, null)).toEqual([])
    expect(mergeAllergeni(['uova'], null)).toEqual(['uova'])
  })
})

describe('ALLERGENI_MAPPING integrità', () => {
  it('tutti i valori puntano a id allergeni validi', () => {
    const validi = new Set(ALLERGENI.map(a => a.id))
    for (const [k, ids] of Object.entries(ALLERGENI_MAPPING)) {
      for (const id of ids) expect(validi.has(id), `${k} → ${id}`).toBe(true)
    }
  })
})

describe('confine di parola — un allergene non si dichiara per caso', () => {
  it('"zucchero semolato" non contiene glutine', () => {
    // Il confronto era una sottostringa qualsiasi: "semolato" contiene
    // "semola", quindi lo zucchero risultava con glutine. Su un documento che
    // si consegna al cliente, un allergene dichiarato dove non c'è è una
    // scheda falsa quanto uno mancante.
    expect(detectAllergeniFromIngredienti(['zucchero semolato'])).toEqual([])
  })

  it('la semola vera il glutine ce l\'ha', () => {
    expect(detectAllergeniFromIngredienti(['semola di grano duro'])).toContain('glutine')
  })

  it('le chiavi composte continuano a funzionare', () => {
    expect(detectAllergeniFromIngredienti(['farina di mandorle tostate'])).toContain('fruttasc')
    expect(detectAllergeniFromIngredienti(['farina di mandorle'])).not.toContain('glutine')
  })

  it('"buttermilk" resta latte: è una parola sola, non "butter" + "milk"', () => {
    // Verificato sui 140 nomi di ingrediente veri del database: passando al
    // confine di parola questo era l'unico che si perdeva. Un allergene perso
    // è l'errore che manda qualcuno in ospedale.
    expect(detectAllergeniFromIngredienti(['buttermilk'])).toContain('latte')
    expect(detectAllergeniFromIngredienti(['latticello'])).toContain('latte')
  })
})
