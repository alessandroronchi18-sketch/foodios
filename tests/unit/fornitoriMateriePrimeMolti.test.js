// Una materia prima, più fornitori (e viceversa): il modello dei dati.
//
// Richiesta del titolare, 19/09/2026: «una materia prima può avere più
// fornitori e un fornitore può dare più materie prime», e «uno può modificare
// quando vuole i collegamenti tra materie prime e fornitori o viceversa».
//
// Cos'era prima: dentro `ingredienti_costi[nome]` c'era `fornitore`, UNA
// stringa. Chi comprava la panna dal caseificio e, il venerdì, dal cash and
// carry, poteva scriverne uno solo e l'altro se lo teneva in testa.
//
// Cosa protegge questo file. La scelta è stata **affiancare** un array
// `fornitori` al campo `fornitore`, tenendo `fornitore` uguale al primo della
// lista. Sembra una ripetizione e invece è il ponte con tutto il resto del
// prodotto: `fornitoreDiIngrediente`, `raggruppaPerFornitore`,
// `elencoFornitori`, `costiDaOrdine` e la colonna «Fornitore» della pagina
// Materie prime leggono ancora `voce.fornitore`, e devono continuare a vedere
// una risposta vera. I test qui sotto tengono le tre invarianti:
//
//   1. il vecchio campo resta valido e non si perde niente;
//   2. il principale è sempre `fornitori[0]`;
//   3. due nomi che differiscono per maiuscole o spazi sono lo stesso
//      fornitore — «Molino Rossi» e «molino  rossi» non fanno due schede.

import { describe, it, expect } from 'vitest'
import {
  fornitoriDiVoce, conFornitori, collegaFornitore, scollegaFornitore,
  rendiPrincipale, fornitoriDiMateriaPrima, indiceFornitoriMateriePrime,
} from '../../src/lib/fornitoriMateriePrime'
import { elencoFornitori, materiePrimePerFornitore } from '../../src/lib/materiePrimeFornitore'

// Un ricettario come quelli veri: qualcuno col fornitore scritto dalla pagina
// Materie prime (solo il vecchio campo), qualcuno senza niente, e i prezzi che
// mancano su una parte — su 117 materie prime di Mara, 75 non ce l'hanno.
const COSTI = {
  panna:    { costoKg: 4.7, costoG: 0.0047, fornitore: 'Latteria Rossi' },
  burro:    { costoKg: 9.2, costoG: 0.0092, fornitore: 'Latteria Rossi' },
  zucchero: { costoKg: 1.66, costoG: 0.00166 },
  pistacchi: { costoKg: null, costoG: null, fornitore: 'Az. Agricola Bianchi' },
}

describe('chi ha solo il vecchio campo `fornitore` non perde niente', () => {
  it('viene letto come una lista di uno', () => {
    expect(fornitoriDiVoce(COSTI.panna)).toEqual(['Latteria Rossi'])
  })

  it('e non serve nessuna migrazione: la lettura È la migrazione', () => {
    // Nessuno script da lanciare, nessun momento in cui i dati sono a metà.
    const indice = indiceFornitoriMateriePrime(COSTI)
    const rossi = indice.fornitori.find(f => f.nome === 'Latteria Rossi')
    expect(rossi.quante).toBe(2)
    expect(rossi.materiePrime.map(m => m.nome)).toEqual(['burro', 'panna'])
  })

  it('una voce senza nessun fornitore resta senza, non diventa una lista finta', () => {
    expect(fornitoriDiVoce(COSTI.zucchero)).toEqual([])
    expect(fornitoriDiVoce(undefined)).toEqual([])
  })
})

describe('collegare un secondo fornitore', () => {
  it('la materia prima ne ha due, e la voce di partenza non viene toccata', () => {
    const nuovi = collegaFornitore(COSTI, 'panna', 'Cash & Carry Zeta')
    expect(fornitoriDiVoce(nuovi.panna)).toEqual(['Latteria Rossi', 'Cash & Carry Zeta'])
    // Era il difetto classico: scrivere dentro la voce vuol dire scrivere
    // nello state di React, e il salvataggio non scatta mai.
    expect(COSTI.panna.fornitori).toBeUndefined()
    expect(nuovi.panna).not.toBe(COSTI.panna)
  })

  it('e il vecchio campo continua a dire il principale', () => {
    // È quello che legge la colonna «Fornitore» della pagina Materie prime.
    const nuovi = collegaFornitore(COSTI, 'panna', 'Cash & Carry Zeta')
    expect(nuovi.panna.fornitore).toBe('Latteria Rossi')
    expect(nuovi.panna.fornitori[0]).toBe('Latteria Rossi')
  })

  it('il primo fornitore di una materia prima che non ne aveva diventa il principale', () => {
    const nuovi = collegaFornitore(COSTI, 'zucchero', 'Dolcificio Sud')
    expect(nuovi.zucchero.fornitore).toBe('Dolcificio Sud')
    // Con uno solo l'array non si scrive: il dato torna alla forma di prima.
    expect(nuovi.zucchero.fornitori).toBeUndefined()
  })

  it('una materia prima che non c’era viene creata SENZA prezzo, mai a zero', () => {
    const nuovi = collegaFornitore(COSTI, 'Vaniglia Bourbon', 'Aromi Srl')
    const voce = nuovi['vaniglia bourbon']
    expect(voce.fornitore).toBe('Aromi Srl')
    // Zero vorrebbe dire «gratis» e nel food cost sparirebbe senza traccia.
    expect(voce.costoKg).toBeNull()
    expect(voce.costoG).toBeNull()
  })

  it('lo stesso fornitore scritto con altre maiuscole non si aggiunge due volte', () => {
    const nuovi = collegaFornitore(COSTI, 'panna', '  latteria   rossi ')
    expect(fornitoriDiVoce(nuovi.panna)).toEqual(['Latteria Rossi'])
  })

  it('e la grafia già in archivio non viene riscritta: è quella della fattura', () => {
    const nuovi = collegaFornitore(COSTI, 'panna', 'LATTERIA ROSSI')
    expect(nuovi.panna.fornitore).toBe('Latteria Rossi')
  })

  it('un nome di fornitore vuoto non fa niente', () => {
    expect(collegaFornitore(COSTI, 'panna', '   ')).toEqual(COSTI)
  })
})

describe('scollegare', () => {
  it('toglie solo quello scelto', () => {
    const due = collegaFornitore(COSTI, 'panna', 'Cash & Carry Zeta')
    const uno = scollegaFornitore(due, 'panna', 'Latteria Rossi')
    expect(fornitoriDiVoce(uno.panna)).toEqual(['Cash & Carry Zeta'])
    expect(uno.panna.fornitore).toBe('Cash & Carry Zeta')
    expect(uno.panna.fornitori).toBeUndefined()
  })

  it('tolto l’ultimo, la materia prima resta in archivio col suo prezzo', () => {
    // Il prezzo non dipende da chi te la vende: cancellarlo insieme al legame
    // vorrebbe dire buttare via un dato per un'operazione che non c'entra.
    const senza = scollegaFornitore(COSTI, 'panna', 'Latteria Rossi')
    expect(senza.panna.fornitore).toBeUndefined()
    expect(senza.panna.fornitori).toBeUndefined()
    expect(senza.panna.costoKg).toBe(4.7)
  })

  it('scollegare uno che non c’è non cambia niente', () => {
    const uguale = scollegaFornitore(COSTI, 'panna', 'Chi Non C’è')
    expect(fornitoriDiVoce(uguale.panna)).toEqual(['Latteria Rossi'])
  })
})

describe('il principale si sceglie', () => {
  it('metterlo per primo cambia quello che si vede nella pagina Materie prime', () => {
    const due = collegaFornitore(COSTI, 'panna', 'Cash & Carry Zeta')
    const cambiato = rendiPrincipale(due, 'panna', 'cash & carry zeta')
    expect(cambiato.panna.fornitore).toBe('Cash & Carry Zeta')
    expect(cambiato.panna.fornitori).toEqual(['Cash & Carry Zeta', 'Latteria Rossi'])
  })

  it('non collega di straforo uno che non era collegato', () => {
    const uguale = rendiPrincipale(COSTI, 'panna', 'Uno Mai Visto')
    expect(fornitoriDiVoce(uguale.panna)).toEqual(['Latteria Rossi'])
  })
})

describe('convivenza col codice che scrive ancora il vecchio campo', () => {
  it('un ordine che scrive `fornitore` da solo NON cancella gli altri collegamenti', () => {
    // `costiDaOrdine` (lib/fornitoreIngrediente.js) scrive ancora così quando
    // arriva un ordine. Se la lettura guardasse solo l'array, quel fornitore
    // sparirebbe; se guardasse solo il campo, sparirebbero gli altri.
    const due = collegaFornitore(COSTI, 'panna', 'Cash & Carry Zeta')
    const dopoOrdine = { ...due, panna: { ...due.panna, fornitore: 'Grossista Nuovo' } }
    expect(fornitoriDiVoce(dopoOrdine.panna))
      .toEqual(['Grossista Nuovo', 'Latteria Rossi', 'Cash & Carry Zeta'])
  })

  it('e chi ha scritto il vecchio campo diventa il principale', () => {
    const due = collegaFornitore(COSTI, 'panna', 'Cash & Carry Zeta')
    const dopoOrdine = { ...due, panna: { ...due.panna, fornitore: 'Grossista Nuovo' } }
    expect(fornitoriDiVoce(dopoOrdine.panna)[0]).toBe('Grossista Nuovo')
  })

  it('`conFornitori` con la lista vuota riporta la voce alla forma di prima', () => {
    const voce = conFornitori({ costoKg: 1, fornitore: 'X', fornitori: ['X', 'Y'] }, [])
    expect(voce).toEqual({ costoKg: 1 })
  })
})

describe('i due versi della stessa relazione', () => {
  const RICCO = (() => {
    let c = COSTI
    c = collegaFornitore(c, 'panna', 'Cash & Carry Zeta')
    c = collegaFornitore(c, 'zucchero', 'Cash & Carry Zeta')
    c = collegaFornitore(c, 'pistacchi', 'Cash & Carry Zeta')
    return c
  })()

  it('da un fornitore si vedono tutte le sue materie prime', () => {
    const indice = indiceFornitoriMateriePrime(RICCO)
    const zeta = indice.fornitori.find(f => f.nome === 'Cash & Carry Zeta')
    expect(zeta.materiePrime.map(m => m.nome)).toEqual(['panna', 'pistacchi', 'zucchero'])
  })

  it('da una materia prima si vedono tutti i suoi fornitori', () => {
    expect(fornitoriDiMateriaPrima(RICCO, 'PANNA'))
      .toEqual(['Latteria Rossi', 'Cash & Carry Zeta'])
  })

  it('per ogni fornitore si conta quante materie prime non hanno prezzo', () => {
    // È il numero su cui si decide chi chiamare.
    const indice = indiceFornitoriMateriePrime(RICCO)
    const zeta = indice.fornitori.find(f => f.nome === 'Cash & Carry Zeta')
    expect(zeta.quante).toBe(3)
    expect(zeta.senzaPrezzo).toBe(1)   // i pistacchi
  })

  it('le materie prime senza nessun fornitore sono in chiaro: sono il lavoro da fare', () => {
    const indice = indiceFornitoriMateriePrime(COSTI)
    expect(indice.senzaFornitore.materiePrime.map(m => m.nome)).toEqual(['zucchero'])
    expect(indice.totali.senzaFornitore).toBe(1)
    expect(indice.totali.collegate).toBe(3)
  })

  it('una materia prima con due fornitori conta UNA volta fra le collegate, e due fra i legami', () => {
    const indice = indiceFornitoriMateriePrime(RICCO)
    expect(indice.totali.materiePrime).toBe(4)
    expect(indice.totali.collegate).toBe(4)
    expect(indice.totali.legami).toBe(6)
  })

  it('i fornitori sono in ordine alfabetico italiano', () => {
    const indice = indiceFornitoriMateriePrime(RICCO)
    expect(indice.fornitori.map(f => f.nome))
      .toEqual(['Az. Agricola Bianchi', 'Cash & Carry Zeta', 'Latteria Rossi'])
  })
})

describe('due grafie dello stesso nome non fanno due fornitori', () => {
  const STORTO = {
    panna: { costoKg: 4.7, fornitore: 'Molino Rossi' },
    farina: { costoKg: 1.1, fornitore: 'molino  rossi' },
    semola: { costoKg: 1.3, fornitore: 'Molino Rossi' },
  }

  it('l’elenco ne mostra uno solo', () => {
    const indice = indiceFornitoriMateriePrime(STORTO)
    expect(indice.fornitori).toHaveLength(1)
    expect(indice.fornitori[0].quante).toBe(3)
  })

  it('e dice quali grafie ha trovato, invece di nasconderle', () => {
    // Se in archivio ce ne sono due, una delle due non combacia con la fattura.
    const indice = indiceFornitoriMateriePrime(STORTO)
    expect(indice.fornitori[0].nome).toBe('Molino Rossi')      // la più usata
    expect(indice.fornitori[0].varianti).toEqual(['molino rossi', 'Molino Rossi'])
  })
})

describe('le funzioni che c’erano già non sono state riscritte', () => {
  it('l’indice usa `elencoFornitori` per scegliere la grafia e contare', () => {
    // Stesso risultato, per costruzione: se un giorno `elencoFornitori`
    // cambiasse idea su quale grafia proporre, l'indice la seguirebbe.
    const indice = indiceFornitoriMateriePrime(COSTI)
    const atteso = elencoFornitori(COSTI)
    expect(indice.fornitori.map(f => f.nome)).toEqual(atteso.map(f => f.nome))
    expect(indice.fornitori.map(f => f.quante)).toEqual(atteso.map(f => f.quante))
  })

  it('e `materiePrimePerFornitore` per costruire i gruppi', () => {
    const indice = indiceFornitoriMateriePrime(COSTI)
    const atteso = materiePrimePerFornitore(COSTI).filter(g => g.fornitore)
    for (const g of atteso) {
      const mio = indice.fornitori.find(f => f.nome === g.fornitore)
      expect(mio.materiePrime).toEqual(g.materiePrime)
      expect(mio.senzaPrezzo).toBe(g.senzaPrezzo)
    }
  })
})
