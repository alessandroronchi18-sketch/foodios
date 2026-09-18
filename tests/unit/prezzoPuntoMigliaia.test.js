// «1.250» sono milleduecentocinquanta, non un euro e venticinque.
//
// ── Il cambio di comportamento, e perché ─────────────────────────────────
//
// Regola del titolare, 18/09/2026, parole sue: **«di base comunque il punto
// sono le migliaia, la virgola i decimali»**. È la convenzione italiana, e da
// quel giorno vale anche quando la virgola non c'è.
//
// Fino ad allora `leggiPrezzoKg` (`src/lib/formatIt.js`) trattava il punto
// SEMPRE come decimale, quindi:
//
//     PRIMA   leggiPrezzoKg('1.250')  ->  1.25
//     ADESSO  leggiPrezzoKg('1.250')  ->  1250
//
// Sono mille volte uno dall'altro, ed è un cambio su una funzione che ha già
// dei chiamanti: la pagina Materie prime, la finestra del prezzo in Nuovo
// gusto e l'importazione dei listini. Chi legge questo file fra sei mesi deve
// sapere che il numero è cambiato apposta, e da che parte.
//
// Perché la regola italiana vince: nel listino vero di Mara la bacca di
// vaniglia sta a 380 €/kg e lo zafferano a migliaia — i prezzi a quattro cifre
// esistono — e chi scrive «1.250» in Italia intende milleduecentocinquanta.
//
// ── Le due forme che restano decimali, e non per indulgenza ──────────────
//
// 1. **Il punto seguito da un numero di cifre diverso da tre**: «1.25»,
//    «12.5», «1.2500», «0.8825». Le migliaia italiane vogliono gruppi da tre
//    cifre esatte, quindi lì il punto è un decimale battuto all'inglese, da
//    chi copia da un gestionale: di letture sensate ce n'è una sola. Conta
//    davvero, perché in archivio i prezzi hanno quattro decimali.
//
// 2. **Il gruppo di testa che comincia per zero**: «0.950». «Zeromila
//    novecentocinquanta» non si scrive. Quello è il prezzo della farina al
//    chilo, novantacinque centesimi, e leggerlo 950 €/kg sarebbe l'errore più
//    caro di tutti — su una materia prima che sta in quasi ogni ricetta.
//    Questo caso è esplicitamente citato in `src/lib/materiePrimeImport.js`
//    come quello da non sbagliare sui listini veri.
//
// ── Il caso che resta incerto, e a cui si chiede ─────────────────────────
//
// Punto solo, niente virgola, esattamente tre cifre dopo, niente zero di
// testa: «1.250», «12.500». Lì `leggiPrezzoKg` applica la regola italiana e
// risponde 1250, e `letturaPrezzoKg` dice anche che il dubbio c'è, con le due
// letture, così la finestra può proporle a parole invece di indovinare.
//
// Il dubbio è stretto apposta: una domanda che arriva sempre è una domanda a
// cui si risponde senza leggerla.

import { describe, it, expect } from 'vitest'
import { letturaPrezzoKg, leggiPrezzoKg } from '../../src/lib/formatIt'

describe('IL CAMBIO — il punto senza virgola sono le migliaia', () => {
  it('«1.250» adesso vale 1250, non 1,25', () => {
    // Rosso sul codice di prima, che rispondeva 1.25.
    expect(leggiPrezzoKg('1.250')).toBe(1250)
  })

  it('«12.500» vale 12500', () => {
    expect(leggiPrezzoKg('12.500')).toBe(12500)
  })

  it('«1.250.000» vale 1250000, e prima non si leggeva affatto', () => {
    // Prima la forma con due punti non passava il controllo e rispondeva
    // `null`: la pagina diceva «scrivi un prezzo» su un numero scritto bene.
    expect(leggiPrezzoKg('1.250.000')).toBe(1250000)
  })

  it('la virgola continua a essere i decimali', () => {
    expect(leggiPrezzoKg('1,25')).toBe(1.25)
    expect(leggiPrezzoKg('1.250,50')).toBe(1250.5)
    expect(leggiPrezzoKg('12,50')).toBe(12.5)
  })
})

describe('le due forme che restano decimali', () => {
  it('un numero di cifre diverso da tre dopo il punto è un decimale', () => {
    expect(leggiPrezzoKg('1.25')).toBe(1.25)
    expect(leggiPrezzoKg('12.5')).toBe(12.5)
    expect(leggiPrezzoKg('1.2500')).toBe(1.25)
  })

  it('i quattro decimali dell\'archivio non diventano migliaia', () => {
    // I prezzi salvati hanno quattro decimali (`parseFloat(v.toFixed(4))`):
    // riscrivere 0,8825 col punto non deve dare ottomilaottocentoventicinque.
    expect(leggiPrezzoKg('0.8825')).toBe(0.8825)
    expect(leggiPrezzoKg('12.3456')).toBe(12.3456)
  })

  it('lo zero di testa dice che è un decimale: «0.950» è la farina, non 950 €/kg', () => {
    expect(leggiPrezzoKg('0.950')).toBe(0.95)
    expect(leggiPrezzoKg('0.250')).toBe(0.25)
    expect(letturaPrezzoKg('0.950').ambiguo).toBe(false)
  })
})

describe('il caso davvero incerto: un punto, tre cifre, niente zero davanti', () => {
  it('«1.250» si legge 1250 e lo dice, proponendo anche 1,25', () => {
    expect(letturaPrezzoKg('1.250')).toEqual({
      valore: 1250, ambiguo: true, comeDecimale: 1.25, comeMigliaia: 1250,
    })
  })

  it('«12.500» allo stesso modo', () => {
    expect(letturaPrezzoKg('12.500')).toEqual({
      valore: 12500, ambiguo: true, comeDecimale: 12.5, comeMigliaia: 12500,
    })
  })

  it('«123.456» allo stesso modo', () => {
    expect(letturaPrezzoKg('123.456')).toEqual({
      valore: 123456, ambiguo: true, comeDecimale: 123.456, comeMigliaia: 123456,
    })
  })

  it('quando il dubbio c\'è, `valore` è la lettura italiana', () => {
    const l = letturaPrezzoKg('1.250')
    expect(l.valore).toBe(l.comeMigliaia)
    expect(l.valore).toBe(leggiPrezzoKg('1.250'))
  })
})

describe('i casi che non hanno niente di dubbio', () => {
  const senzaDubbio = (testo, valore) => {
    expect(letturaPrezzoKg(testo)).toEqual({
      valore, ambiguo: false, comeDecimale: null, comeMigliaia: null,
    })
  }

  it('due o quattro cifre dopo il punto: decimale, nessuna domanda', () => {
    senzaDubbio('1.25', 1.25)
    senzaDubbio('1.2500', 1.25)
    senzaDubbio('12.5', 12.5)
  })

  it('più punti: migliaia, nessuna domanda', () => {
    senzaDubbio('1.250.000', 1250000)
    senzaDubbio('12.500.000', 12500000)
  })

  it('con la virgola decide la virgola, nessuna domanda', () => {
    senzaDubbio('1,250', 1.25)
    senzaDubbio('1.250,50', 1250.5)
    senzaDubbio('12,50', 12.5)
  })

  it('senza punti non c\'è niente da chiedere', () => {
    senzaDubbio('380', 380)
    senzaDubbio('0', 0)
    senzaDubbio('1250', 1250)
  })

  it('quello che non è un prezzo resta «non lo so», e non si chiede', () => {
    for (const storto of ['abc', '12,5o', '1.2.3', '-5', '.250', '12..50', '1.25.7']) {
      senzaDubbio(storto, null)
    }
  })
})

describe('gli spazi e il simbolo dell\'euro', () => {
  it('«12,50 €» e «€ 12,50» si leggono, perché è così che il prezzo sta a schermo', () => {
    // In tutto il prodotto il simbolo va DOPO la cifra: «1.477 €». Chi
    // ricopia un prezzo da una schermata se lo porta dietro.
    expect(letturaPrezzoKg('12,50 €').valore).toBe(12.5)
    expect(letturaPrezzoKg('€ 12,50').valore).toBe(12.5)
    expect(letturaPrezzoKg('  380  ').valore).toBe(380)
  })

  it('il dubbio si riconosce anche col simbolo attaccato', () => {
    const l = letturaPrezzoKg('1.250 €')
    expect(l.valore).toBe(1250)
    expect(l.ambiguo).toBe(true)
    expect(l.comeDecimale).toBe(1.25)
    expect(l.comeMigliaia).toBe(1250)
  })

  it('uno spazio in mezzo NON diventa un separatore di migliaia', () => {
    // «1 250» potrebbe essere milleduecentocinquanta, ma anche due numeri
    // battuti male. Qui non si indovina: non è un prezzo.
    expect(letturaPrezzoKg('1 250').valore).toBeNull()
    expect(letturaPrezzoKg('1 250').ambiguo).toBe(false)
  })

  it('la stringa vuota e il nulla non sono un prezzo e non sono un dubbio', () => {
    for (const niente of ['', '   ', '€', null, undefined]) {
      expect(letturaPrezzoKg(niente)).toEqual({
        valore: null, ambiguo: false, comeDecimale: null, comeMigliaia: null,
      })
    }
  })
})

describe('LA RETE — quello che NON deve essere cambiato', () => {
  // Il cambio riguarda il punto senza virgola e basta. Tutto il resto del
  // comportamento di `leggiPrezzoKg` è quello di prima, compreso il difetto
  // di «12,5o» che con `parseFloat` diventava 12,50 in silenzio.
  const attesi = [
    ['12,50', 12.5],
    ['12.50', 12.5],
    ['1.234,50', 1234.5],
    ['1,250', 1.25],
    ['380', 380],
    ['0', 0],
    ['0,8825', 0.8825],
    ['  9,50  ', 9.5],
    ['12,5o', null],
    ['12 50', null],
    ['abc', null],
    ['', null],
    ['   ', null],
    [null, null],
    [undefined, null],
    ['-3', null],
    ['-5', null],
    ['12,50 €', null],
    ['€ 12,50', null],
    ['1 250', null],
  ]
  for (const [testo, atteso] of attesi) {
    it(`leggiPrezzoKg(${JSON.stringify(testo)}) === ${JSON.stringify(atteso)}`, () => {
      expect(leggiPrezzoKg(testo)).toBe(atteso)
    })
  }
})
