// ── Una base con il prezzo scritto a mano resta raggiungibile ─────────────
//
// Il difetto, trovato il 18/09/2026 durante l'audit sui dati veri di Mara dei
// Boschi.
//
// La pagina «Materie prime», nata lo stesso giorno, escludeva tutti i
// semilavorati. In linea di principio è giusto — il costo di una base esce
// dalla sua ricetta, e chiedere anche un prezzo sarebbe chiedere due volte la
// stessa cosa. Ma c'è un caso in cui non vale, ed è proprio quello di Mara.
//
// Quando una base ha ANCHE un prezzo al chilo scritto a mano, quel prezzo
// **vince** sul calcolo: è una decisione del 16/09, e il motivo è che un
// prezzo scritto da chi produce è una misura, mentre un calcolo su
// ingredienti metà dei quali non hanno prezzo è una stima al ribasso.
//
// Sui dati veri «base bianca» ha 2,31 €/kg scritti a mano, ed è quello che il
// programma addebita a **29 ricette su 68**. Escludendola dall'elenco, quel
// numero non si poteva più né vedere né cambiare da nessuna parte del
// prodotto: il campo «Costo al kg della base» in Nuovo gusto compare solo per
// il tipo `interno`, e questa è `semilavorato`.
//
// Un numero che muove i conti di 29 ricette e che nessuno può toccare è
// peggio di un numero sbagliato.
import { describe, it, expect } from 'vitest'
import { materiePrimeDaRicettario } from '../../src/views/MateriePrimeView.jsx'

const RICETTARIO = {
  ingredienti_costi: {
    'base bianca': { costoKg: 2.31, costoG: 0.00231 },
    panna: { costoKg: 4.7, costoG: 0.0047 },
  },
  ricette: {
    // Una base col prezzo scritto a mano: deve restare in elenco.
    'BASE BIANCA': {
      nome: 'BASE BIANCA', tipo: 'semilavorato', unita: 0, prezzo: 0,
      ingredienti: [{ nome: 'panna', qty1stampo: 10000 }],
    },
    // Una base SENZA prezzo scritto: il suo costo esce dalla ricetta, e in
    // questo elenco non ci deve stare.
    'CREMA PASTICCERA': {
      nome: 'CREMA PASTICCERA', tipo: 'semilavorato', unita: 0, prezzo: 0,
      ingredienti: [{ nome: 'panna', qty1stampo: 500 }],
    },
    NOCE: {
      nome: 'NOCE', tipo: 'gusto', unita: 1, prezzo: 0,
      ingredienti: [
        { nome: 'base bianca', qty1stampo: 1000 },
        { nome: 'crema pasticcera', qty1stampo: 100 },
        { nome: 'panna', qty1stampo: 50 },
      ],
    },
  },
}

const righe = materiePrimeDaRicettario(RICETTARIO)
const chiavi = righe.map(r => r.key)

describe('Chi resta in elenco e chi no', () => {
  it('la base col prezzo scritto a mano c’è', () => {
    expect(chiavi).toContain('base bianca')
  })

  it('e porta il prezzo che il programma usa davvero', () => {
    const r = righe.find(x => x.key === 'base bianca')
    expect(r.prezzoKg).toBeCloseTo(2.31, 2)
    expect(r.statoPrezzo).toBe('tuo')
  })

  it('è segnata come base, non spacciata per una materia prima qualsiasi', () => {
    expect(righe.find(x => x.key === 'base bianca').eBase).toBe(true)
  })

  it('la base SENZA prezzo scritto resta fuori: il suo costo esce dalla ricetta', () => {
    expect(chiavi).not.toContain('crema pasticcera')
  })

  it('le materie prime vere continuano a comparire', () => {
    expect(chiavi).toContain('panna')
    expect(righe.find(x => x.key === 'panna').eBase).toBe(false)
  })
})

describe('Il conto in cima alla pagina non si sfalsa', () => {
  it('la base con prezzo conta fra quelle col prezzo tuo', () => {
    const conPrezzoTuo = righe.filter(r => r.statoPrezzo === 'tuo').map(r => r.key)
    expect(conPrezzoTuo).toContain('base bianca')
    expect(conPrezzoTuo).toContain('panna')
  })

  it('e le basi senza prezzo non gonfiano il conto dei «senza prezzo»', () => {
    // Era il difetto trovato costruendo la pagina: i semilavorati finivano
    // fra le materie prime come «prezzo da impostare», e falsavano proprio il
    // numero su cui si decide se fidarsi del food cost.
    const senzaPrezzo = righe.filter(r => r.statoPrezzo === 'mancante').map(r => r.key)
    expect(senzaPrezzo).not.toContain('crema pasticcera')
  })
})

describe('Lo zero non fa vincere una base', () => {
  // Trovato il 18/09 da un audit: `foodcost.js` fa vincere il prezzo scritto
  // a mano solo se è maggiore di zero, questa pagina invece accettava anche
  // lo zero. La pagina prometteva «è questo che il programma addebita» e con
  // lo zero era falso — una base da 3,20 €/kg messa a 0 veniva comunque
  // calcolata dalla sua ricetta.
  const conZero = {
    ingredienti_costi: {
      'base bianca': { costoKg: 0, costoG: 0 },
      panna: { costoKg: 4.7, costoG: 0.0047 },
    },
    ricette: RICETTARIO.ricette,
  }

  it('una base dichiarata a zero non compare fra le materie prime', () => {
    const k = materiePrimeDaRicettario(conZero).map(r => r.key)
    expect(k).not.toContain('base bianca')
  })

  it('ma per una materia prima vera zero resta un prezzo', () => {
    // L'omaggio del fornitore, la roba dell'orto: è un dato, non un buco.
    const r = materiePrimeDaRicettario({
      ingredienti_costi: { panna: { costoKg: 0, costoG: 0 } },
      ricette: { X: { nome: 'X', tipo: 'gusto', unita: 1, prezzo: 0, ingredienti: [{ nome: 'panna', qty1stampo: 100 }] } },
    }).find(x => x.key === 'panna')
    expect(r).toBeTruthy()
    expect(r.statoPrezzo).toBe('tuo')
    expect(r.prezzoKg).toBe(0)
  })
})
