// Il prezzo che ha scritto il titolare vince sul calcolo del programma.
//
// Trovato il 16/09/2026 nell'audit dei dati veri. Un semilavorato può avere
// DUE fonti di costo: la sua ricetta (da cui il programma lo calcola) e un
// prezzo al chilo scritto a mano nel listino. Vinceva sempre il calcolo,
// perché il ramo del semilavorato stava prima del listino.
//
// Misurato sui dati veri di Mara dei Boschi: «BASE BIANCA» ha un prezzo suo
// (2,31 €/kg) e una ricetta i cui ingredienti sono per il 20% del peso senza
// prezzo. Vinceva il calcolo — 1,22 €/kg — e **24 ricette su 58 uscivano con
// un food cost sottostimato dell'88,7%**: agosto chiudeva con food cost 3,6%
// e margine lordo 96,4%, su un'azienda che di margine ne fa la metà. Su quei
// numeri si decidono i prezzi di vendita.
//
// Chi ha ragione non è in dubbio: un prezzo scritto dal titolare è una misura,
// un calcolo su ingredienti metà dei quali non hanno prezzo è una stima al
// ribasso. Ed è anche il modo in cui lavora una gelateria: le quantità di una
// base sono il segreto del laboratorio e il costo al chilo si scrive a mano.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { calcolaFC } from '../../src/lib/foodcost'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// La forma vera dei dati di Mara: una base con ricetta E prezzo dichiarato,
// e dentro la ricetta un ingrediente senza prezzo.
const ricettario = {
  ricette: {
    'base bianca': {
      nome: 'BASE BIANCA', tipo: 'semilavorato',
      ingredienti: [
        { nome: 'latte intero', qty1stampo: 800 },
        { nome: 'zucchero', qty1stampo: 200 },
        { nome: 'neutro', qty1stampo: 250 },   // senza prezzo: vale zero
      ],
    },
    'NOCCIOLA': {
      nome: 'NOCCIOLA', tipo: 'gusto',
      ingredienti: [
        { nome: 'BASE BIANCA', qty1stampo: 1000 },
        { nome: 'pasta nocciola', qty1stampo: 100 },
      ],
    },
  },
}
const conPrezzoDichiarato = {
  'latte intero': { costoKg: 1.35, costoG: 0.00135 },
  'zucchero': { costoKg: 1.1, costoG: 0.0011 },
  'pasta nocciola': { costoKg: 28, costoG: 0.028 },
  // Il prezzo che il titolare ha scritto a mano per la base.
  'base bianca': { costoKg: 2.31, costoG: 0.00231 },
}
const senzaPrezzoDichiarato = { ...conPrezzoDichiarato }
delete senzaPrezzoDichiarato['base bianca']

describe('una base con prezzo scritto a mano', () => {
  it('il food cost usa QUEL prezzo, non il calcolo sulla ricetta', () => {
    const { tot } = calcolaFC(ricettario.ricette.NOCCIOLA, conPrezzoDichiarato, ricettario)
    // 1000 g × 2,31 €/kg = 2,31 € · 100 g × 28 €/kg = 2,80 € → 5,11 €
    expect(tot).toBeCloseTo(5.11, 2)
  })

  it('e senza quel prezzo ricade sul calcolo, come prima', () => {
    const { tot } = calcolaFC(ricettario.ricette.NOCCIOLA, senzaPrezzoDichiarato, ricettario)
    // La base calcolata: (800×0,00135 + 200×0,0011 + 250×0) / 1250 g = 0,00104 €/g
    // 1000 g × 0,00104 = 1,04 € + 2,80 € = 3,84 €
    expect(tot).toBeCloseTo(3.84, 2)
    // È la sottostima: 3,84 invece di 5,11, cioè il 25% in meno su questa
    // ricetta. Sui dati veri erano l'88,7% in meno.
    expect(tot).toBeLessThan(5.11)
  })

  it('e l\'ingrediente senza prezzo DENTRO la base viene dichiarato', () => {
    // Prima la ricorsione restituiva `mancanti` e chi chiamava lo buttava
    // via: la scheda diceva «0 ingredienti senza prezzo» mentre il costo era
    // sottostimato. È l'avviso che avrebbe fatto scoprire il margine al 96,4%.
    const { mancanti } = calcolaFC(ricettario.ricette.NOCCIOLA, senzaPrezzoDichiarato, ricettario)
    expect(mancanti).toContain('BASE BIANCA › neutro')
  })
})

describe('una STIMA di mercato non vince sul calcolo', () => {
  it('fra due stime è meglio quella fatta sugli ingredienti veri', () => {
    // `isStima` è il ripiego del programma sul listino medio HoReCa: non è una
    // misura del titolare, e non deve scavalcare la ricetta che lui ha
    // scritto.
    const conStima = { ...senzaPrezzoDichiarato, 'base bianca': { costoKg: 9, costoG: 0.009, isStima: true } }
    const { tot } = calcolaFC(ricettario.ricette.NOCCIOLA, conStima, ricettario)
    expect(tot).toBeCloseTo(3.84, 2)   // il calcolo, non 9 €/kg
  })
})

describe('quello che non deve cambiare', () => {
  it('un ingrediente normale prende il suo prezzo di listino', () => {
    const r = { nome: 'X', ingredienti: [{ nome: 'pasta nocciola', qty1stampo: 500 }] }
    expect(calcolaFC(r, conPrezzoDichiarato, ricettario).tot).toBeCloseTo(14, 2)
  })

  it('un semilavorato senza prezzo e senza ricetta resta fra i mancanti', () => {
    const r = { nome: 'X', ingredienti: [{ nome: 'misterioso', qty1stampo: 100 }] }
    const { tot, mancanti } = calcolaFC(r, conPrezzoDichiarato, ricettario)
    expect(tot).toBe(0)
    expect(mancanti).toContain('misterioso')
  })

  it('un prezzo dichiarato a zero non conta come dichiarato', () => {
    // Zero non è un prezzo: è un campo lasciato vuoto.
    const conZero = { ...senzaPrezzoDichiarato, 'base bianca': { costoKg: 0, costoG: 0 } }
    const { tot } = calcolaFC(ricettario.ricette.NOCCIOLA, conZero, ricettario)
    expect(tot).toBeCloseTo(3.84, 2)   // ricade sul calcolo, non fa 2,80
  })

  it('la ricorsione a più livelli funziona ancora', () => {
    const tre = {
      ricette: {
        'BASE': { nome: 'BASE', tipo: 'semilavorato', ingredienti: [{ nome: 'zucchero', qty1stampo: 1000 }] },
        'CREMA': { nome: 'CREMA', tipo: 'semilavorato', ingredienti: [{ nome: 'BASE', qty1stampo: 1000 }] },
        'DOLCE': { nome: 'DOLCE', tipo: 'gusto', ingredienti: [{ nome: 'CREMA', qty1stampo: 1000 }] },
      },
    }
    const { tot } = calcolaFC(tre.ricette.DOLCE, { 'zucchero': { costoG: 0.0011 } }, tre)
    expect(tot).toBeCloseTo(1.1, 2)
  })
})

describe('un food cost sottostimato non si presenta come una misura', () => {
  const SRC = readFileSync(join(RADICE, 'src', 'views', 'DashboardHomeView.jsx'), 'utf8')

  it('la Home conta gli ingredienti senza prezzo', () => {
    expect(SRC).toMatch(/const \{ tot: fc, mancanti \} = calcolaFC/)
    expect(SRC).toMatch(/conBuchi\+\+; ingredientiSenzaPrezzo \+= mancanti\.length/)
  })

  it('e lo dice, invece di far sembrare il numero una misura', () => {
    expect(SRC).toMatch(/più basso del vero: \$\{fcInfo\.ingredientiSenzaPrezzo\} ingredienti senza prezzo/)
  })

  it('e il semaforo NON è verde', () => {
    // È la parte peggiore: la percentuale bassa accende il verde, e il verde
    // dice «va tutto bene» su un numero che non è vero.
    expect(SRC).toMatch(/\(fcInfo\.pct == null \|\| fcInfo\.conBuchi > 0\)\s*\n?\s*\? T\.textSoft/)
  })
})
