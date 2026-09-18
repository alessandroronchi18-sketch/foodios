// Il fornitore attaccato a ogni materia prima, e la lettura al contrario.
//
// ═══ Perché esistono questi test ════════════════════════════════════════
//
// Richiesta del titolare, 18/09/2026: «ogni materia prima deve avere anche il
// nome del fornitore associato [...] così nella pagina fornitori poi
// inseriremo una pagina con tutti i fornitori e direttamente si possono vedere
// le materie prime collegate».
//
// Le quattro cose che possono andare storte, e che qui si tengono ferme:
//
//  1. **Il nome storpiato.** Il nome del fornitore dev'essere quello della
//     fattura. Se il codice lo mette in maiuscolo «per pulizia», o gli toglie
//     la punteggiatura, il giorno che si aggancerà la fatturazione passiva non
//     combacerà niente. Si tolgono solo gli spazi in eccesso.
//  2. **Il fornitore sdoppiato.** «Molino Rossi» e «molino  rossi» sono la
//     stessa persona: se l'elenco ne mostra due, la pagina Fornitori mostra
//     due schede e le materie prime finiscono divise a metà.
//  3. **Lo zero al posto del non-so.** Assegnare un fornitore a una materia
//     prima che non c'era ancora la crea: se nascesse con `costoKg: 0` il food
//     cost la leggerebbe come «gratis» e sparirebbe dal conto senza lasciare
//     traccia. Deve nascere con `null`.
//  4. **La mutazione di nascosto.** Queste funzioni ricevono lo state di
//     React. Se scrivono dentro l'oggetto che hanno ricevuto invece di
//     copiarlo, il confronto prima/dopo non scatta mai e il salvataggio non
//     parte: la schermata mostra il fornitore, il database non ce l'ha.
//
// `normIng` viene importato QUI apposta, anche se la libreria non lo importa:
// serve a provare che iniettarlo funziona davvero sul caso singolare/plurale
// («uova» deve trovare «uovo»), che è l'unico che la normalizzazione locale
// non sa gestire da sola.

import { describe, it, expect } from 'vitest'
import { normIng } from '../../src/lib/foodcost'
import {
  assegnaFornitore,
  assegnaFornitoreNelRicettario,
  chiaveFornitore,
  elencoFornitori,
  materiePrimePerFornitore,
  normalizzaNomeFornitore,
  prezzoKgDiVoce,
  rimuoviFornitore,
  rimuoviFornitoreNelRicettario,
  stessoFornitore,
  trovaChiaveMateriaPrima,
} from '../../src/lib/materiePrimeFornitore'

const OPZ = { normalizzaNome: normIng }

function costiDiProva() {
  return {
    burro: { costoKg: 9.2, costoG: 0.0092, fornitore: 'Latteria Rossi' },
    farina: { costoKg: 0.95, costoG: 0.00095, fornitore: 'Molino Bianchi S.r.l.' },
    panna: { costoKg: 3.4, costoG: 0.0034, fornitore: 'latteria  rossi' },
    pistacchio: { costoKg: null, costoG: null, fornitore: 'Latteria Rossi' },
    zucchero: { costoKg: 1.1, costoG: 0.0011 },
    uovo: { costoKg: null, costoG: null },
  }
}

describe('il nome del fornitore è quello della fattura', () => {
  it('toglie solo gli spazi in eccesso, non tocca maiuscole e punteggiatura', () => {
    expect(normalizzaNomeFornitore('  Molino   Bianchi S.r.l. ')).toBe('Molino Bianchi S.r.l.')
    expect(normalizzaNomeFornitore('CAFFÈ VERGNANO SpA')).toBe('CAFFÈ VERGNANO SpA')
  })

  it('il nome vuoto o non scritto diventa stringa vuota, mai "null"', () => {
    expect(normalizzaNomeFornitore(null)).toBe('')
    expect(normalizzaNomeFornitore(undefined)).toBe('')
    expect(normalizzaNomeFornitore('   ')).toBe('')
  })

  it('per capire se sono lo stesso fornitore, maiuscole e spazi non contano', () => {
    expect(stessoFornitore('Molino Bianchi', 'molino  bianchi')).toBe(true)
    expect(stessoFornitore('MOLINO BIANCHI', ' Molino Bianchi ')).toBe(true)
    expect(stessoFornitore('Molino Bianchi', 'Molino Rossi')).toBe(false)
  })

  it('due nomi vuoti NON sono lo stesso fornitore', () => {
    // Altrimenti tutte le materie prime senza fornitore risulterebbero
    // fornite dalla stessa persona.
    expect(stessoFornitore('', '')).toBe(false)
    expect(stessoFornitore(null, undefined)).toBe(false)
  })

  it('la chiave di confronto è minuscola e senza spazi doppi', () => {
    expect(chiaveFornitore(' Molino   Bianchi ')).toBe('molino bianchi')
  })
})

describe('assegnare il fornitore', () => {
  it("non tocca la mappa di partenza né la voce che c'è dentro", () => {
    const prima = costiDiProva()
    const copia = JSON.parse(JSON.stringify(prima))
    const dopo = assegnaFornitore(prima, 'zucchero', 'Zuccherificio Verdi', OPZ)
    expect(prima).toEqual(copia)
    expect(dopo).not.toBe(prima)
    expect(dopo.zucchero).not.toBe(prima.zucchero)
    expect(dopo.zucchero.fornitore).toBe('Zuccherificio Verdi')
  })

  it('lascia intatto il prezzo di quella materia prima', () => {
    const dopo = assegnaFornitore(costiDiProva(), 'zucchero', 'Zuccherificio Verdi', OPZ)
    expect(dopo.zucchero.costoKg).toBe(1.1)
    expect(dopo.zucchero.costoG).toBe(0.0011)
  })

  it('non tocca le altre materie prime', () => {
    const prima = costiDiProva()
    const dopo = assegnaFornitore(prima, 'zucchero', 'Zuccherificio Verdi', OPZ)
    expect(dopo.burro).toEqual(prima.burro)
    expect(Object.keys(dopo).sort()).toEqual(Object.keys(prima).sort())
  })

  it('scrive il nome come in fattura, senza metterlo in maiuscolo', () => {
    const dopo = assegnaFornitore({}, 'burro', '  Latteria   Rossi S.r.l. ', OPZ)
    expect(dopo.burro.fornitore).toBe('Latteria Rossi S.r.l.')
  })

  it('su una materia prima già in elenco scritta diversamente NON crea il doppione', () => {
    const dopo = assegnaFornitore({ panna: { costoKg: 3.4, costoG: 0.0034 } }, ' PANNA ', 'Latteria Rossi')
    expect(Object.keys(dopo)).toEqual(['panna'])
    expect(dopo.panna.fornitore).toBe('Latteria Rossi')
  })

  it('con normIng iniettato, «uova» trova «uovo» invece di crearne una seconda', () => {
    const dopo = assegnaFornitore(costiDiProva(), 'uova', 'Az. Agricola Verdi', OPZ)
    expect(Object.keys(dopo)).not.toContain('uova')
    expect(dopo.uovo.fornitore).toBe('Az. Agricola Verdi')
  })

  it('una materia prima nuova nasce SENZA prezzo: null, mai zero', () => {
    const dopo = assegnaFornitore({}, 'Vaniglia Bourbon', 'Spezie Gialli', OPZ)
    const voce = dopo[normIng('Vaniglia Bourbon')]
    expect(voce.costoKg).toBeNull()
    expect(voce.costoG).toBeNull()
    expect(voce.costoKg).not.toBe(0)
    expect(voce.nome).toBe('Vaniglia Bourbon')
  })

  it('il fornitore vuoto equivale a toglierlo', () => {
    const dopo = assegnaFornitore(costiDiProva(), 'burro', '   ', OPZ)
    expect(dopo.burro.fornitore).toBeUndefined()
    expect(dopo.burro.costoKg).toBe(9.2)
  })

  it('senza il nome della materia prima non succede niente e non si rompe', () => {
    const prima = costiDiProva()
    expect(assegnaFornitore(prima, '', 'Molino Bianchi', OPZ)).toEqual(prima)
    expect(assegnaFornitore(prima, null, 'Molino Bianchi', OPZ)).toEqual(prima)
  })

  it('funziona anche se il ricettario non ha ancora nessuna materia prima', () => {
    const dopo = assegnaFornitore(null, 'burro', 'Latteria Rossi', OPZ)
    expect(dopo.burro.fornitore).toBe('Latteria Rossi')
  })
})

describe('togliere il fornitore', () => {
  it('toglie solo il fornitore e lascia il prezzo e la sua data', () => {
    const prima = { burro: { costoKg: 9.2, costoG: 0.0092, fornitore: 'Latteria Rossi', prezzoAggiornatoAl: '2026-09-10', prezzoDa: 'ordine-12' } }
    const dopo = rimuoviFornitore(prima, 'burro', OPZ)
    expect(dopo.burro.fornitore).toBeUndefined()
    expect(dopo.burro.costoKg).toBe(9.2)
    expect(dopo.burro.prezzoAggiornatoAl).toBe('2026-09-10')
    expect(dopo.burro.prezzoDa).toBe('ordine-12')
  })

  it('non muta la mappa di partenza', () => {
    const prima = costiDiProva()
    const copia = JSON.parse(JSON.stringify(prima))
    rimuoviFornitore(prima, 'burro', OPZ)
    expect(prima).toEqual(copia)
  })

  it('su una materia prima che non esiste non crea niente', () => {
    const dopo = rimuoviFornitore(costiDiProva(), 'tartufo bianco', OPZ)
    expect(dopo.tartufo).toBeUndefined()
    expect(Object.keys(dopo).sort()).toEqual(Object.keys(costiDiProva()).sort())
  })
})

describe('le versioni che lavorano sul ricettario intero', () => {
  it('assegnano il fornitore e lasciano le ricette dove sono', () => {
    const ric = { ricette: { Tiramisu: { ingredienti: [] } }, ingredienti_costi: costiDiProva(), altro: 'x' }
    const dopo = assegnaFornitoreNelRicettario(ric, 'zucchero', 'Zuccherificio Verdi', OPZ)
    expect(dopo).not.toBe(ric)
    expect(dopo.ricette).toBe(ric.ricette)
    expect(dopo.altro).toBe('x')
    expect(dopo.ingredienti_costi.zucchero.fornitore).toBe('Zuccherificio Verdi')
    expect(ric.ingredienti_costi.zucchero.fornitore).toBeUndefined()
  })

  it('tolgono il fornitore senza perdere il resto del ricettario', () => {
    const ric = { ricette: { Tiramisu: {} }, ingredienti_costi: costiDiProva() }
    const dopo = rimuoviFornitoreNelRicettario(ric, 'burro', OPZ)
    expect(dopo.ingredienti_costi.burro.fornitore).toBeUndefined()
    expect(dopo.ricette).toEqual({ Tiramisu: {} })
  })

  it('reggono un ricettario che non esiste ancora', () => {
    const dopo = assegnaFornitoreNelRicettario(null, 'burro', 'Latteria Rossi', OPZ)
    expect(dopo.ricette).toEqual({})
    expect(dopo.ingredienti_costi.burro.fornitore).toBe('Latteria Rossi')
  })
})

describe("l'elenco dei fornitori già usati", () => {
  it('li elenca una volta sola anche se scritti con maiuscole e spazi diversi', () => {
    const elenco = elencoFornitori(costiDiProva())
    expect(elenco.map(f => f.nome)).toEqual(['Latteria Rossi', 'Molino Bianchi S.r.l.'])
  })

  it('conta su quante materie prime compare ciascuno', () => {
    const elenco = elencoFornitori(costiDiProva())
    expect(elenco.find(f => f.nome === 'Latteria Rossi').quante).toBe(3)
    expect(elenco.find(f => f.nome === 'Molino Bianchi S.r.l.').quante).toBe(1)
  })

  it('dichiara le grafie diverse invece di nasconderle', () => {
    const elenco = elencoFornitori(costiDiProva())
    // L'ordine fra le varianti non conta (in italiano la minuscola viene prima
    // della maiuscola): conta che ci siano tutte e due.
    const varianti = elenco.find(f => f.nome === 'Latteria Rossi').varianti
    expect(varianti.slice().sort()).toEqual(['Latteria Rossi', 'latteria rossi'])
  })

  it('propone la grafia usata più spesso', () => {
    const costi = {
      a: { fornitore: 'molino bianchi' },
      b: { fornitore: 'Molino Bianchi' },
      c: { fornitore: 'Molino Bianchi' },
    }
    expect(elencoFornitori(costi)[0].nome).toBe('Molino Bianchi')
  })

  it('è in ordine alfabetico italiano', () => {
    const costi = { a: { fornitore: 'Zeta' }, b: { fornitore: 'Àlfa' }, c: { fornitore: 'Mike' } }
    expect(elencoFornitori(costi).map(f => f.nome)).toEqual(['Àlfa', 'Mike', 'Zeta'])
  })

  it('su un ricettario vuoto non esplode e non inventa fornitori', () => {
    expect(elencoFornitori(null)).toEqual([])
    expect(elencoFornitori({ burro: { costoKg: 9 } })).toEqual([])
  })
})

describe('la pagina Fornitori: un fornitore, tutto quello che gli compriamo', () => {
  it('raggruppa le materie prime sotto il fornitore, unendo le grafie diverse', () => {
    const gruppi = materiePrimePerFornitore(costiDiProva())
    const rossi = gruppi.find(g => g.fornitore === 'Latteria Rossi')
    expect(rossi.quante).toBe(3)
    expect(rossi.materiePrime.map(m => m.nome)).toEqual(['burro', 'panna', 'pistacchio'])
  })

  it('dice quante di quelle materie prime non hanno prezzo', () => {
    const rossi = materiePrimePerFornitore(costiDiProva()).find(g => g.fornitore === 'Latteria Rossi')
    expect(rossi.senzaPrezzo).toBe(1)
    expect(rossi.materiePrime.find(m => m.nome === 'pistacchio').senzaPrezzo).toBe(true)
    expect(rossi.materiePrime.find(m => m.nome === 'burro').senzaPrezzo).toBe(false)
  })

  it('le materie prime senza fornitore stanno in un gruppo dichiarato, in fondo', () => {
    const gruppi = materiePrimePerFornitore(costiDiProva())
    const ultimo = gruppi[gruppi.length - 1]
    expect(ultimo.fornitore).toBeNull()
    expect(ultimo.materiePrime.map(m => m.nome)).toEqual(['uovo', 'zucchero'])
    expect(ultimo.senzaPrezzo).toBe(1)
  })

  it('non perde nessuna materia prima per strada', () => {
    const costi = costiDiProva()
    const gruppi = materiePrimePerFornitore(costi)
    const totale = gruppi.reduce((s, g) => s + g.quante, 0)
    expect(totale).toBe(Object.keys(costi).length)
  })

  it("mostra il nome scritto quando la voce ce l'ha, altrimenti la chiave", () => {
    const gruppi = materiePrimePerFornitore({
      'aceto balsamico': { nome: 'Aceto Balsamico di Modena IGP', costoKg: 12, fornitore: 'Acetaia Neri' },
    })
    expect(gruppi[0].materiePrime[0].nome).toBe('Aceto Balsamico di Modena IGP')
    expect(gruppi[0].materiePrime[0].chiave).toBe('aceto balsamico')
  })

  it('su un ricettario vuoto ritorna un elenco vuoto, non un gruppo fantasma', () => {
    expect(materiePrimePerFornitore(null)).toEqual([])
    expect(materiePrimePerFornitore({})).toEqual([])
  })
})

describe('leggere il prezzo di una voce senza scambiare il non-so per gratis', () => {
  it('«non lo so» resta null e non diventa zero', () => {
    expect(prezzoKgDiVoce({ costoKg: null, costoG: null })).toBeNull()
    expect(prezzoKgDiVoce({})).toBeNull()
    expect(prezzoKgDiVoce(undefined)).toBeNull()
  })

  it('legge il prezzo anche dalle voci vecchie che hanno solo costoG', () => {
    expect(prezzoKgDiVoce({ costoG: 0.0092 })).toBeCloseTo(9.2, 6)
  })

  it('un prezzo scritto come stringa non vale come prezzo', () => {
    // `Number.isFinite('9.2')` e falso: la voce va sistemata, non indovinata.
    expect(prezzoKgDiVoce({ costoKg: '9.2' })).toBeNull()
  })
})

describe("trovare la materia prima che c'è già", () => {
  it('trova la corrispondenza esatta', () => {
    expect(trovaChiaveMateriaPrima(costiDiProva(), 'burro', OPZ)).toBe('burro')
  })

  it('trova anche con maiuscole e spazi diversi', () => {
    expect(trovaChiaveMateriaPrima(costiDiProva(), '  BURRO ', OPZ)).toBe('burro')
  })

  it('ritorna null quando la materia prima è davvero nuova', () => {
    expect(trovaChiaveMateriaPrima(costiDiProva(), 'tartufo bianco', OPZ)).toBeNull()
  })
})
