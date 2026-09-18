// Una materia prima senza prezzo non costa zero: non si sa quanto costa.
//
// Il difetto, 18/09/2026. Creando una materia prima nuova la strada più
// comoda sarebbe scriverla in archivio con `costoKg: 0`. Sarebbe sbagliato, e
// in modo silenzioso: `buildIngCosti` accetta lo zero come prezzo dichiarato
// (è legittimo — l'omaggio del fornitore, la materia prima dell'orto, lo
// scarto recuperato), e da lì in poi `costoRigaIngrediente` risponde
// «costo 0, mancante: false». Cioè: quella riga nel food cost non costa
// niente, e nessuna schermata ha più modo di accorgersene.
//
// È la stessa famiglia del numero che ha fatto nascere questa pagina: sui
// dati veri di Mara dei Boschi 94 materie prime su 99 erano senza prezzo, e
// il food cost medio usciva al 4,8% invece del 25-35% vero.
//
// Come riprodurlo: creare una materia prima con `{ costoKg: 0, costoG: 0 }` e
// usarla in una ricetta. Il dettaglio del food cost la conta a zero senza
// nessun segnale, invece di dire «prezzo mancante».
//
// Qui si prova la regola dai due lati: `null` vuol dire «non lo so» e la riga
// si dichiara mancante; `0` vuol dire «gratis» e resta un dato. E che chi
// scrive (il Dashboard) usi davvero `null`.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildIngCosti, costoRigaIngrediente } from '../../src/lib/foodcost'
import {
  materiePrimeDaRicettario, contaMateriePrime, chiaviGiaUsate, verificaNuovaMateriaPrima,
  leggiPrezzoKg,
} from '../../src/views/MateriePrimeView.jsx'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DASH = readFileSync(join(RADICE, 'src', 'Dashboard.jsx'), 'utf8')

// «colorante blu» non sta nel listino medio HoReCa: è il caso puro di una
// materia prima di cui il programma non sa niente.
const riga = (costi) => costoRigaIngrediente(
  { nome: 'colorante blu', qty1stampo: 100 }, buildIngCosti(costi), { ricette: {} },
)

describe('il prezzo che non si sa si scrive `null`, non `0`', () => {
  it('con `null` la riga si dichiara mancante', () => {
    const r = riga({ 'colorante blu': { costoKg: null, costoG: null } })
    expect(r.mancante).toBe(true)
    expect(r.motivo).toBe('prezzo mancante')
    expect(r.costo).toBe(0)
  })

  it('con `0` invece è un prezzo dichiarato: gratis, e il food cost ci crede', () => {
    // Questa è la prova del difetto: se la creazione scrivesse zero, la riga
    // non risulterebbe mancante e nessuno avviserebbe più nessuno.
    const r = riga({ 'colorante blu': { costoKg: 0, costoG: 0 } })
    expect(r.mancante).toBe(false)
    expect(r.costo).toBe(0)
  })

  it('la materia prima appena creata risulta «senza prezzo», non «gratis»', () => {
    // Il difetto era dentro la pagina stessa: `Number(null)` fa 0 e
    // `Number.isFinite(0)` è vero, quindi `costoKg: null` — che vuol dire
    // «non lo so» — veniva letto come prezzo dichiarato a zero. La materia
    // prima appena creata sarebbe comparsa con l'etichetta «gratis» e NON
    // sarebbe entrata nel conto dei «senza prezzo», che è il numero per cui
    // questa pagina è stata chiesta.
    const righe = materiePrimeDaRicettario({
      ricette: {},
      ingredienti_costi: { 'colorante blu': { costoKg: null, costoG: null } },
    })
    expect(righe[0].statoPrezzo).toBe('mancante')
    expect(contaMateriePrime(righe).senzaPrezzo).toBe(1)
  })

  it('uno zero scritto davvero resta un dato, e si chiama «gratis»', () => {
    // L'altra metà della regola: lo zero dichiarato è legittimo — l'omaggio
    // del fornitore, la materia prima dell'orto — e non va confuso col buco.
    const righe = materiePrimeDaRicettario({
      ricette: {},
      ingredienti_costi: { 'colorante blu': { costoKg: 0, costoG: 0 } },
    })
    expect(righe[0].statoPrezzo).toBe('tuo')
    expect(contaMateriePrime(righe).senzaPrezzo).toBe(0)
  })

  it('una voce che ha solo `costoG` ha comunque un prezzo', () => {
    // I dati di prova e i ricettari importati da file vecchi scrivono solo il
    // costo al grammo. `buildIngCosti` guarda proprio quello: se qui si
    // guardasse solo `costoKg`, la pagina direbbe «prezzo mancante» per una
    // materia prima che nel food cost un prezzo ce l'ha.
    const righe = materiePrimeDaRicettario({
      ricette: {},
      ingredienti_costi: { 'colorante blu': { costoG: 0.0125, isStima: false } },
    })
    expect(righe[0].statoPrezzo).toBe('tuo')
    expect(righe[0].prezzoKg).toBeCloseTo(12.5, 6)
  })

  it('e con un prezzo vero il costo si calcola', () => {
    const r = riga({ 'colorante blu': { costoKg: 12.5, costoG: 0.0125 } })
    expect(r.mancante).toBe(false)
    expect(r.costo).toBeCloseTo(1.25, 3)
  })

  it('chi crea la materia prima scrive `null`, in tutti i posti che lo fanno', () => {
    // 18/09, secondo giro. La seconda riga di questa prova cercava una frase
    // dentro un COMMENTO: bastava riformularlo per farla cadere, e soprattutto
    // restava verde se qualcuno cambiava il codice lasciando il commento
    // com'era. E' il difetto ricorrente di questo progetto — un test che
    // guarda il racconto invece del fatto.
    //
    // E c'era di peggio: i posti che scrivono quel dato sono DUE — il
    // Dashboard, quando si crea dalla pagina Materie prime, e «Nuovo gusto»,
    // col pulsante «Il prezzo lo metto dopo» — e questa prova ne guardava uno
    // solo. Cambiando null in 0 nell'altro, restava tutto verde.
    const fs = require('node:fs')
    const NUOVA = fs.readFileSync('src/views/NuovaRicettaView.jsx', 'utf8')
    expect(DASH, 'il Dashboard non scrive piu null').toContain('{ costoKg: null, costoG: null }')
    expect(NUOVA, 'Nuovo gusto non scrive piu null').toContain('{ costoKg: null, costoG: null }')
  })
})

describe('il conto delle materie prime senza prezzo è onesto', () => {
  const ricettario = {
    ricette: {
      // Un semilavorato: il suo costo esce dalla sua ricetta, non da un prezzo
      // d'acquisto. Non è una materia prima e non deve gonfiare il conto.
      'crema pasticcera': { nome: 'CREMA PASTICCERA', tipo: 'semilavorato',
        ingredienti: [{ nome: 'latte', qty1stampo: 500 }] },
      torta: { nome: 'TORTA', tipo: 'torta', ingredienti: [
        { nome: 'crema pasticcera', qty1stampo: 200 },
        { nome: 'burro', qty1stampo: 100 },          // nel listino di mercato
        { nome: 'colorante blu', qty1stampo: 5 },    // nessun prezzo da nessuna parte
        { nome: 'zucchero', qty1stampo: 80 },        // prezzo tuo
      ] },
    },
    ingredienti_costi: { zucchero: { costoKg: 1.4, costoG: 0.0014 } },
  }
  const righe = materiePrimeDaRicettario(ricettario)
  const conti = contaMateriePrime(righe)

  it('i semilavorati non sono materie prime', () => {
    expect(righe.map(r => r.key)).not.toContain('crema pasticcera')
    // Gli ingredienti DENTRO il semilavorato invece lo sono: il latte si compra.
    expect(righe.map(r => r.key)).toContain('latte')
  })

  it('distingue il prezzo tuo, la stima di mercato e il buco', () => {
    const stato = Object.fromEntries(righe.map(r => [r.key, r.statoPrezzo]))
    expect(stato.zucchero).toBe('tuo')
    expect(stato.burro).toBe('stima')
    expect(stato['colorante blu']).toBe('mancante')
  })

  it('conta solo i buchi veri fra i «senza prezzo»', () => {
    expect(conti.senzaPrezzo).toBe(1)
    expect(conti.stimate).toBe(2)      // burro e latte, dal listino di mercato
    expect(conti.conPrezzoTuo).toBe(1) // zucchero
    expect(conti.tot).toBe(righe.length)
    expect(conti.senzaPrezzo + conti.stimate + conti.conPrezzoTuo).toBe(conti.tot)
  })

  it('dice in quante ricette entra ognuna', () => {
    const burro = righe.find(r => r.key === 'burro')
    expect(burro.ricette).toEqual(['TORTA'])
    const latte = righe.find(r => r.key === 'latte')
    expect(latte.ricette).toEqual(['CREMA PASTICCERA'])
  })

  it('le intestazioni dei file importati non diventano materie prime', () => {
    // Nei ricettari importati da Excel arrivano righe come «n/d» o
    // «ingrediente»: il calcolo del food cost le salta già, e se le saltasse
    // solo lui qui comparirebbe una materia prima che si chiama «nan».
    const sporco = materiePrimeDaRicettario({
      ricette: { r: { nome: 'X', ingredienti: [
        { nome: 'n/d', qty1stampo: 1 }, { nome: 'ingrediente', qty1stampo: 1 },
        { nome: 'nan', qty1stampo: 1 }, { nome: 'burro', qty1stampo: 1 },
      ] } },
      ingredienti_costi: {},
    })
    expect(sporco.map(r => r.key)).toEqual(['burro'])
  })

  it('una materia prima con un prezzo ma senza ricette resta nell\'elenco', () => {
    // Sparire sarebbe il modo per non ritrovarla più e ricrearla domani.
    const solo = materiePrimeDaRicettario({ ricette: {}, ingredienti_costi: { 'colorante blu': { costoKg: 12.5, costoG: 0.0125 } } })
    expect(solo.map(r => r.key)).toEqual(['colorante blu'])
    expect(solo[0].ricette).toEqual([])
  })

  it('senza ricettario non esplode', () => {
    expect(materiePrimeDaRicettario(null)).toEqual([])
    expect(contaMateriePrime([])).toEqual({ tot: 0, senzaPrezzo: 0, stimate: 0, conPrezzoTuo: 0 })
  })
})

describe('due materie prime con lo stesso nome non si possono creare', () => {
  const ricettario = {
    ricette: { r: { nome: 'TORTA', ingredienti: [{ nome: 'Burro', qty1stampo: 100 }] } },
    ingredienti_costi: { panna: { costoKg: 5, costoG: 0.005 } },
  }
  const usate = chiaviGiaUsate(ricettario)

  it('«PANNA» esiste già, anche se in archivio sta scritto «panna»', () => {
    const esito = verificaNuovaMateriaPrima('PANNA', '', usate)
    expect(esito.ok).toBe(false)
    expect(esito.campo).toBe('nome')
  })

  it('«panna » con lo spazio è la stessa panna', () => {
    expect(verificaNuovaMateriaPrima('panna ', '', usate).ok).toBe(false)
  })

  it('e «panna  fresca» con due spazi in mezzo diventa «panna fresca»', () => {
    // Gli spazi doppi sono la causa numero uno dei doppioni che sembrano
    // uguali: si vedono solo selezionando il testo.
    const esito = verificaNuovaMateriaPrima('panna  fresca', '', usate)
    expect(esito.ok).toBe(true)
    expect(esito.nome).toBe('panna fresca')
    expect(esito.chiave).toBe('panna fresca')
  })

  it('vale anche per un ingrediente che esiste solo dentro una ricetta', () => {
    // È il caso vero: gli ingredienti nascono scrivendoli dentro una ricetta,
    // e quasi nessuno ha una voce fra i prezzi.
    expect(verificaNuovaMateriaPrima('burro', '', usate).ok).toBe(false)
  })

  it('un nome nuovo passa, normalizzato', () => {
    const esito = verificaNuovaMateriaPrima('  Aceto  Balsamico ', '', usate)
    expect(esito).toMatchObject({ ok: true, nome: 'Aceto Balsamico', chiave: 'aceto balsamico', prezzoKg: null })
  })
})

describe('il prezzo della materia prima nuova', () => {
  const vuoto = new Set()

  it('vuoto vuol dire «non lo so», ed è permesso', () => {
    expect(verificaNuovaMateriaPrima('colorante blu', '', vuoto)).toMatchObject({ ok: true, prezzoKg: null })
    expect(verificaNuovaMateriaPrima('colorante blu', '   ', vuoto)).toMatchObject({ ok: true, prezzoKg: null })
  })

  it('zero no: zero vuol dire «gratis»', () => {
    const esito = verificaNuovaMateriaPrima('colorante blu', '0', vuoto)
    expect(esito.ok).toBe(false)
    expect(esito.errore).toMatch(/Zero vuol dire/)
  })

  it('si scrive con la virgola, come in Italia', () => {
    expect(verificaNuovaMateriaPrima('colorante blu', '12,50', vuoto).prezzoKg).toBe(12.5)
    expect(verificaNuovaMateriaPrima('colorante blu', '12.50', vuoto).prezzoKg).toBe(12.5)
  })

  it('«12,5o» viene fermato, non letto come 12,50', () => {
    // Trovato dai test il 18/09/2026, ed è il caso che capita davvero: la o
    // al posto dello zero, sulla tastiera del telefono. `parseFloat` legge
    // quanto può e butta via il resto, quindi «12,5o» diventava 12,5 e si
    // salvava in silenzio. Su «abc» l'errore si vedeva, su «12,5o» no.
    const esito = verificaNuovaMateriaPrima('colorante blu', '12,5o', vuoto)
    expect(esito.ok).toBe(false)
    expect(esito.campo).toBe('prezzo')
  })

  it('e chi legge il prezzo lo fa per intero, o non lo legge', () => {
    // La stessa lettura la usa anche la modifica di un prezzo esistente:
    // erano due strade e lo stesso difetto.
    expect(leggiPrezzoKg('12,5o')).toBe(null)
    expect(leggiPrezzoKg('12 50')).toBe(null)
    expect(leggiPrezzoKg('abc')).toBe(null)
    expect(leggiPrezzoKg('')).toBe(null)
    expect(leggiPrezzoKg('-3')).toBe(null)
    expect(leggiPrezzoKg('12,50')).toBe(12.5)
    expect(leggiPrezzoKg('12.50')).toBe(12.5)
    expect(leggiPrezzoKg('0,8825')).toBe(0.8825)
    // Il punto delle migliaia con la virgola dei decimali: come si scrive qui.
    expect(leggiPrezzoKg('1.234,50')).toBe(1234.5)
  })

  it('un prezzo assurdo si ferma prima di entrare nel food cost', () => {
    // Di solito è il prezzo della confezione scritto al posto di quello del
    // chilo: 2.400 € al chilo di farina non esistono, un bancale sì.
    expect(verificaNuovaMateriaPrima('colorante blu', '2400', vuoto).ok).toBe(false)
  })

  it('un nome vuoto o di una lettera sola non passa', () => {
    expect(verificaNuovaMateriaPrima('', '', vuoto).ok).toBe(false)
    expect(verificaNuovaMateriaPrima('   ', '', vuoto).ok).toBe(false)
    expect(verificaNuovaMateriaPrima('b', '', vuoto).ok).toBe(false)
  })

  it('e nemmeno le parole che il programma usa per le intestazioni dei file', () => {
    expect(verificaNuovaMateriaPrima('n/d', '', vuoto).ok).toBe(false)
    expect(verificaNuovaMateriaPrima('ingrediente', '', vuoto).ok).toBe(false)
  })
})
