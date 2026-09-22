// ── Quanti pezzi ci sono in una confezione ───────────────────────────────
//
// Il difetto, letto sulle bolle ConoArtic del design partner il 22/09/2026:
// il fornitore del monouso non ha una colonna «pezzi per confezione». Il
// numero lo scrive dentro la descrizione, e poi la bolla conta le confezioni:
//
//     COPPETTA BIO 16/B MARA N.250     CF   4
//
// Sono 1.000 coppette, non 4. Caricando 4 la giacenza del monouso sbaglia di
// 250 volte, e il costo per coppetta con lei: 0,04 € diventano 10 €. Su un
// gelato da 3,50 € non è un dettaglio, è il food cost che non vuol più dire
// niente.
//
// Il motivo per cui non basta prendere il primo numero è tutto qui: nella
// descrizione ce ne sono fino a tre, e quello giusto è il primo in due casi
// su otto. Gli altri sono il modello (16/B, 108, 42BP), la capacità (200cc,
// 300cc), la misura (21/6), il peso (500gr).
//
// Ogni descrizione qui sotto è **copiata da una bolla vera**, non inventata.
import { describe, it, expect } from 'vitest'
import { pezziPerConfezione, pesoConfezioneGDaDescrizione } from '../../src/lib/pezziPerConfezione.js'

describe('Il «N.» di ConoArtic è il conteggio', () => {
  it('COPPETTA BIO 16/B MARA N.250 → 250, non 16', () => {
    // Il 16/B è il modello della coppetta. La bolla conta 4 confezioni: sono
    // mille coppette.
    expect(pezziPerConfezione('COPPETTA BIO 16/B MARA N.250')).toBe(250)
  })

  it('COPPETTA BIO 108 MARA N.250 → 250, non 108', () => {
    // Il caso peggiore: il 108 è un numero tondo, in mezzo alla descrizione,
    // e sembra un conteggio in tutto e per tutto. È il modello.
    expect(pezziPerConfezione('COPPETTA BIO 108 MARA N.250')).toBe(250)
  })

  it('TOVAGLIOLO MARA N. 12.000 → dodicimila, non dodici', () => {
    // Le migliaia all'italiana: se il punto si legge come decimale, un
    // bancale di tovaglioli diventa una dozzina.
    expect(pezziPerConfezione('TOVAGLIOLO MARA N. 12.000')).toBe(12000)
  })

  it('BICCH.BAMBOO 200cc N.50 → 50: il 200cc è la capacità', () => {
    expect(pezziPerConfezione('BICCH.BAMBOO 200cc N.50')).toBe(50)
  })

  it('BICCH.ONDA CIOK/P250cc.N.25 → 25, tutto attaccato senza spazi', () => {
    expect(pezziPerConfezione('BICCH.ONDA CIOK/P250cc.N.25')).toBe(25)
  })

  it('COPPA BIO ESAG/TR. 300cc N.40 → 40', () => {
    expect(pezziPerConfezione('COPPA BIO ESAG/TR. 300cc N.40')).toBe(40)
  })

  it('BICCHIERE 42BP MARA N.100 → 100: il 42BP è il modello', () => {
    expect(pezziPerConfezione('BICCHIERE 42BP MARA N.100')).toBe(100)
  })
})

describe('Il «PZ» vale in tutte e due le direzioni', () => {
  it('ESTORIL GLUT.FREE BOX 288 PZ. → 288', () => {
    expect(pezziPerConfezione('ESTORIL GLUT.FREE BOX 288 PZ.')).toBe(288)
  })

  it('PALETTINA BIO/TRASP 645 pz. → 645, minuscolo', () => {
    expect(pezziPerConfezione('PALETTINA BIO/TRASP 645 pz.')).toBe(645)
  })

  it('CANN.21/6 COMPOST-BIA pz500 → 500: qui il numero viene DOPO', () => {
    // E il 21/6 davanti è la misura del cannello, non un conteggio: la
    // descrizione comincia con un numero che non c'entra niente.
    expect(pezziPerConfezione('CANN.21/6 COMPOST-BIA pz500')).toBe(500)
  })

  it('RE-MXGEL NATURE 500gr.60 PZ. → 60, e il 500gr resta un peso', () => {
    // I due numeri sono attaccati e la sola cosa che li distingue è il
    // marchio: «gr» dietro al primo, «PZ» dietro al secondo.
    expect(pezziPerConfezione('RE-MXGEL NATURE 500gr.60 PZ.')).toBe(60)
    expect(pesoConfezioneGDaDescrizione('RE-MXGEL NATURE 500gr.60 PZ.')).toBe(500)
  })
})

describe('Quando non c’è un conteggio annunciato, si dice «non lo so»', () => {
  it('GIANDUIA SCURA (KG.3) è un peso, non tre pezzi', () => {
    expect(pezziPerConfezione('GIANDUIA SCURA (KG.3)')).toBe(null)
  })

  it('BASE LATTE MARA KG 5X2 è un formato a peso', () => {
    expect(pezziPerConfezione('BASE LATTE MARA KG 5X2')).toBe(null)
  })

  it('PASTA NOCCIOLA PIEMONTE I.G.P. delle LANGHE non ha nessun numero', () => {
    expect(pezziPerConfezione('PASTA NOCCIOLA PIEMONTE I.G.P. delle LANGHE')).toBe(null)
  })

  it('e nemmeno le materie prime delle altre bolle', () => {
    // Righe vere di DESA, Galatea e La Foglia: nessuna dice quanti pezzi.
    for (const d of [
      'PANNA UHT ALBERTI 1lt',
      'LATTE FR.A.Q BAR DESA 1lt',
      'LIMONE FOGLIA COSTI-IT',
      'VARIEGATO TROPICAL 180GR',
      'PASTA PISTACCHIO COLLECTION 300gr',
      'SACCHETTI CARTA 25x35',
      'VASCHETTA 5 LT',
    ]) {
      expect(pezziPerConfezione(d), d).toBe(null)
    }
  })

  it('un numero che non è un conteggio credibile non passa', () => {
    // Zero pezzi non è una confezione, e mezzo tovagliolo non esiste.
    expect(pezziPerConfezione('COPPETTA N.0')).toBe(null)
    expect(pezziPerConfezione('COPPETTA N.999999999')).toBe(null)
  })

  it('su una descrizione vuota o storta non cade', () => {
    for (const v of [null, undefined, '', '   ', 0, 42, {}, [], NaN]) {
      expect(() => pezziPerConfezione(v)).not.toThrow()
      expect(pezziPerConfezione(v)).toBe(null)
    }
  })
})

describe('Il peso della confezione, quando la descrizione lo dice', () => {
  it('GIANDUIA SCURA (KG.3) → 3000 g', () => {
    expect(pesoConfezioneGDaDescrizione('GIANDUIA SCURA (KG.3)')).toBe(3000)
  })

  it('SACCO 25KG → 25000 g', () => {
    expect(pesoConfezioneGDaDescrizione('SACCO 25KG')).toBe(25000)
  })

  it('500gr → 500 g', () => {
    expect(pesoConfezioneGDaDescrizione('RE-MXGEL NATURE 500gr.60 PZ.')).toBe(500)
    expect(pesoConfezioneGDaDescrizione('VARIEGATO TROPICAL 180GR')).toBe(180)
  })

  it('BASE LATTE MARA KG 5X2 → 5000 g: il 2 è quante ce ne sono', () => {
    // Non è una supposizione. Sulla bolla Galatea 001821/2 del 13/05/2026 la
    // riga «POLPA DI MANGO KG.3,1x4» ha quantità 3,1 KG, prezzo 6,000 €/kg e
    // imponibile 18,60 € — cioè 3,1 × 6,00. Il primo numero è il peso di una
    // confezione, il secondo il confezionamento.
    expect(pesoConfezioneGDaDescrizione('BASE LATTE MARA KG 5X2')).toBe(5000)
    expect(pesoConfezioneGDaDescrizione('POLPA DI MANGO KG.3,1x4')).toBe(3100)
  })

  it('e regge la virgola decimale all’italiana', () => {
    expect(pesoConfezioneGDaDescrizione('PANNA KG 1,5')).toBe(1500)
    expect(pesoConfezioneGDaDescrizione('CACAO 250,5 gr')).toBe(250.5)
  })

  it('i centilitri NON sono un peso: sono una capacità', () => {
    // È lo stesso difetto di prima visto dall'altra parte: leggere «200cc»
    // come duecento grammi mette un peso finto su un bicchiere di plastica.
    expect(pesoConfezioneGDaDescrizione('BICCH.BAMBOO 200cc N.50')).toBe(null)
    expect(pesoConfezioneGDaDescrizione('COPPA BIO ESAG/TR. 300cc N.40')).toBe(null)
    expect(pesoConfezioneGDaDescrizione('PANNA UHT ALBERTI 1lt')).toBe(null)
    expect(pesoConfezioneGDaDescrizione('VASCHETTA 5 LT')).toBe(null)
  })

  it('e un conteggio di pezzi non diventa un peso', () => {
    for (const d of [
      'COPPETTA BIO 16/B MARA N.250',
      'ESTORIL GLUT.FREE BOX 288 PZ.',
      'PALETTINA BIO/TRASP 645 pz.',
      'CANN.21/6 COMPOST-BIA pz500',
      'BICCHIERE 42BP MARA N.100',
      'TOVAGLIOLO MARA N. 12.000',
      'PASTA NOCCIOLA PIEMONTE I.G.P. delle LANGHE',
    ]) {
      expect(pesoConfezioneGDaDescrizione(d), d).toBe(null)
    }
  })

  it('una parola che comincia per g non è un’unità di misura', () => {
    // «MIX 500 GELATO» non pesa mezzo chilo, e «GRAMMATURA 5» non pesa
    // cinque grammi: l'unità deve essere una parola intera.
    expect(pesoConfezioneGDaDescrizione('MIX 500 GELATO')).toBe(null)
    expect(pesoConfezioneGDaDescrizione('GRAMMATURA 5')).toBe(null)
    expect(pesoConfezioneGDaDescrizione('COPPA BIO ESAG/TR. 300cc N.40')).toBe(null)
  })

  it('su una descrizione vuota o storta non cade', () => {
    for (const v of [null, undefined, '', '   ', 0, 42, {}, [], NaN]) {
      expect(() => pesoConfezioneGDaDescrizione(v)).not.toThrow()
      expect(pesoConfezioneGDaDescrizione(v)).toBe(null)
    }
  })
})

describe('Il righello di questo file', () => {
  // Tutte le righe di monouso vere, con la risposta giusta accanto.
  const CASI = [
    ['COPPETTA BIO 16/B MARA N.250', 250],
    ['COPPETTA BIO 108 MARA N.250', 250],
    ['TOVAGLIOLO MARA N. 12.000', 12000],
    ['BICCH.BAMBOO 200cc N.50', 50],
    ['BICCH.ONDA CIOK/P250cc.N.25', 25],
    ['ESTORIL GLUT.FREE BOX 288 PZ.', 288],
    ['CANN.21/6 COMPOST-BIA pz500', 500],
    ['PALETTINA BIO/TRASP 645 pz.', 645],
    ['COPPA BIO ESAG/TR. 300cc N.40', 40],
    ['BICCHIERE 42BP MARA N.100', 100],
    ['RE-MXGEL NATURE 500gr.60 PZ.', 60],
  ]

  /** Come leggerebbe la descrizione chi prende il primo numero e va. */
  const primoNumero = (d) => {
    const m = String(d).match(/\d+/)
    return m ? Number(m[0]) : null
  }

  it('«prendi il primo numero» sbaglierebbe 9 righe su 11', () => {
    // È il modo più naturale di scrivere questa funzione, e su queste bolle
    // è sbagliato quasi sempre. Se qualcuno la semplificasse così, qui si
    // vedrebbe subito.
    const sbagliate = CASI.filter(([d, atteso]) => primoNumero(d) !== atteso)
    expect(sbagliate.length).toBe(9)
    for (const [d, atteso] of CASI) {
      expect(pezziPerConfezione(d), d).toBe(atteso)
    }
  })

  it('una funzione che risponde sempre «non lo so» sarebbe bocciata', () => {
    expect(CASI.filter(([d]) => pezziPerConfezione(d) != null).length).toBe(11)
  })

  it('una funzione che risponde sempre un numero sarebbe bocciata', () => {
    for (const d of ['GIANDUIA SCURA (KG.3)', 'BASE LATTE MARA KG 5X2', 'PASTA NOCCIOLA PIEMONTE I.G.P. delle LANGHE']) {
      expect(pezziPerConfezione(d), d).toBe(null)
    }
  })

  it('una funzione che risponde sempre lo stesso numero sarebbe bocciata', () => {
    expect(new Set(CASI.map(([d]) => pezziPerConfezione(d))).size).toBe(10)
  })

  it('pezzi e peso non si confondono fra loro', () => {
    // La riga dove i due numeri sono attaccati: se le due funzioni leggessero
    // lo stesso marchio, risponderebbero lo stesso numero.
    const d = 'RE-MXGEL NATURE 500gr.60 PZ.'
    expect(pezziPerConfezione(d)).toBe(60)
    expect(pesoConfezioneGDaDescrizione(d)).toBe(500)
    expect(pezziPerConfezione(d)).not.toBe(pesoConfezioneGDaDescrizione(d))
  })
})
