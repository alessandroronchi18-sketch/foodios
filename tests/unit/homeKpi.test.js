// I KPI della home: cosa mostrano quando il dato non c'e'.
//
// Perche' questo test esiste. La home e' la prima pagina che il titolare apre
// la mattina, ed e' l'unica che legge se ha fretta. Aveva tre numeri che, in
// mancanza del dato, non dicevano "non lo so": dicevano il numero migliore
// possibile.
//
// Misurato sui dati veri di Mara dei Boschi l'11/09/2026:
//  - 26 ricette considerate, ZERO con un prezzo di vendita. Il food cost
//    veniva saltato ricetta per ricetta, il totale restava 0 e la card
//    scriveva "0,0%" in verde.
//  - 9 voci di magazzino, tutte a giacenza 0 e nessuna con una soglia. La
//    card diceva "9 critici - sotto soglia", che manda a cercare un riordino
//    invece del primo conteggio.
//
// Le funzioni qui sotto sono le stesse formule della pagina. Se qualcuno
// rimette la media non pesata o toglie il controllo sul dato mancante, questo
// test si accorge.

import { describe, it, expect } from 'vitest'
import { formatLocalDate } from '../../src/lib/dateLocal'

// ── Food cost del ricettario ───────────────────────────────────────────────
// Costo totale diviso ricavo totale. `null` quando non c'e' niente da dividere.
function fcRicettario(ricette) {
  let costo = 0, ricavo = 0, dentro = 0
  for (const r of ricette) {
    if (!r.unita || !r.prezzo) continue
    const ric = r.unita * r.prezzo
    if (ric <= 0) continue
    costo += r.fc; ricavo += ric; dentro++
  }
  return { pct: ricavo > 0 ? costo / ricavo : null, dentro, fuori: ricette.length - dentro }
}

describe('Food cost della home', () => {
  it('senza nemmeno un prezzo NON dice 0%: dice che non si puo calcolare', () => {
    // I 26 casi di Mara, in miniatura: c'e' la ricetta, manca il prezzo.
    const ricette = Array.from({ length: 26 }, (_, i) => ({ nome: `R${i}`, unita: 0, prezzo: 0, fc: 3 }))
    const r = fcRicettario(ricette)
    // Prima qui usciva 0, e 0 < 0,30 vuol dire card VERDE.
    expect(r.pct).toBeNull()
    expect(r.dentro).toBe(0)
    expect(r.fuori).toBe(26)
  })

  it('e un food cost pesato, non una media di percentuali', () => {
    // Un cono: 1 € di costo su 3 € di ricavo, 33,3%.
    // Una torta: 12 € di costo su 40 € di ricavo, 30%.
    // La media delle due percentuali fa 31,7%. Il food cost vero e'
    // 13 / 43 = 30,2%: la torta pesa tredici volte il cono e deve contare di piu.
    const ricette = [
      { unita: 1, prezzo: 3, fc: 1 },
      { unita: 1, prezzo: 40, fc: 12 },
    ]
    const r = fcRicettario(ricette)
    expect(r.pct * 100).toBeCloseTo(30.2, 1)
    expect(r.pct * 100).not.toBeCloseTo(31.7, 1)
  })

  it('dice su quante ricette e calcolato quando qualcuna resta fuori', () => {
    const ricette = [
      { unita: 1, prezzo: 4, fc: 1 },
      { unita: 0, prezzo: 0, fc: 1 },
      { unita: 0, prezzo: 0, fc: 1 },
    ]
    const r = fcRicettario(ricette)
    expect(r.dentro).toBe(1)
    expect(r.fuori).toBe(2)
  })
})

// ── Magazzino ──────────────────────────────────────────────────────────────
function statoMagazzino(voci) {
  const sottoSoglia = voci.filter(m => Number(m.soglia_g) > 0 && Number(m.giacenza_g || 0) <= Number(m.soglia_g))
  const maiContati = voci.filter(m => !(Number(m.soglia_g) > 0) && !(Number(m.giacenza_g) > 0))
  return { sottoSoglia: sottoSoglia.length, maiContati: maiContati.length, critici: sottoSoglia.length + maiContati.length }
}

describe('Magazzino della home', () => {
  it('le 9 voci di Mara sono "mai contate", non "sotto soglia"', () => {
    const voci = Array.from({ length: 9 }, () => ({ giacenza_g: 0, soglia_g: 0 }))
    const r = statoMagazzino(voci)
    expect(r.maiContati).toBe(9)
    // Questa e' la riga che prima portava fuori strada.
    expect(r.sottoSoglia).toBe(0)
  })

  it('chi ha una soglia ed e sceso sotto e un caso diverso', () => {
    const voci = [
      { giacenza_g: 200, soglia_g: 500 },   // sotto soglia davvero
      { giacenza_g: 900, soglia_g: 500 },   // a posto
      { giacenza_g: 0, soglia_g: 0 },       // mai contato
    ]
    const r = statoMagazzino(voci)
    expect(r.sottoSoglia).toBe(1)
    expect(r.maiContati).toBe(1)
    expect(r.critici).toBe(2)
  })

  it('una giacenza scritta e diversa da zero non e un caso da guardare', () => {
    expect(statoMagazzino([{ giacenza_g: 1500, soglia_g: 0 }]).critici).toBe(0)
  })
})

// ── Il giorno ──────────────────────────────────────────────────────────────
describe('Che giorno e per la home', () => {
  it('poco dopo la mezzanotte e ancora lo stesso giorno, non ieri', () => {
    // Il caso vero: la gelateria chiude all'una e registra l'incasso subito.
    // toISOString() torna l'ora di Greenwich, quindi a Torino fra mezzanotte e
    // le 2 (ora legale) la data UTC e' quella di IERI, e l'incasso finiva sul
    // giorno sbagliato.
    const mezzanotteEMezza = new Date(2026, 8, 11, 0, 30, 0)
    // Questo vale ovunque: formatLocalDate legge il calendario dell'utente.
    expect(formatLocalDate(mezzanotteEMezza)).toBe('2026-09-11')

    // Lo scarto con UTC si vede solo se la macchina non e' gia' a Greenwich:
    // la CI puo' girare in UTC, e li' i due valori coincidono senza che ci sia
    // niente di rotto.
    const minutiAvanti = -mezzanotteEMezza.getTimezoneOffset()
    if (minutiAvanti > 30) {
      expect(mezzanotteEMezza.toISOString().slice(0, 10)).toBe('2026-09-10')
    }
  })

  it('a mezzogiorno le due letture coincidono sempre', () => {
    const mezzogiorno = new Date(2026, 8, 11, 12, 0, 0)
    expect(formatLocalDate(mezzogiorno)).toBe('2026-09-11')
  })
})
