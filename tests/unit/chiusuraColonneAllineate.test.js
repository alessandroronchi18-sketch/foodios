// ── Una colonna che si scrive e non si rilegge mai ────────────────────────
//
// Il difetto, 16/09/2026, raccontato in cima a `src/lib/chiusuraRiga.js`:
// `scontrino_medio_eur` esisteva nel database, `chiusuraARiga` la scriveva, ma
// mancava dalla stringa `COLONNE`. PostgREST non restituisce una colonna che
// non gli è stata chiesta, quindi `rigaAChiusura` leggeva `undefined`,
// `undefined == null` è vero e `scontrinoMedio` usciva **sempre** `null`. Chi
// compilava lo scontrino medio nella chiusura rapida lo vedeva sparire al
// ricaricamento della pagina. Un dato dei soldi, salvato e mai riletto.
//
// La correzione è stata aggiungere la colonna alla stringa. Quello che non è
// stato aggiunto è la cosa che impedisce al difetto di tornare: le due liste
// — quello che si scrive e quello che si chiede — sono scritte a mano a
// quaranta righe di distanza, e niente le tiene allineate. La prossima colonna
// aggiunta ripete lo stesso difetto, e si scopre allo stesso modo: un utente
// che dice «l'ho scritto e non c'è più».
//
// 19/09/2026, audit della suite: `chiusuraRiga.js` era l'unico modulo di
// `src/lib` sulla strada dei soldi che nessun test importava.

import { describe, it, expect } from 'vitest'
import { COLONNE, chiusuraARiga, rigaAChiusura } from '../../src/lib/chiusuraRiga.js'

const colonneChieste = () => COLONNE.split(',').map(s => s.trim()).filter(Boolean)

// Le colonne che `chiusuraARiga` produce ma che non si rileggono di proposito:
// sono l'indirizzo della riga, non il suo contenuto.
const NON_SI_RILEGGONO = ['organization_id', 'sede_id']

const chiusura = {
  id: 'c-1',
  data: '2026-09-19',
  kpi: {
    totV: 1250.5, totFC: 300.25, totM: 950.25, totS: 12, totMP: 76,
    avgST: 88, scontrinoMedio: 14.7,
    pos: 800, contanti: 400.5, delivery: 50,
  },
  venduto: [{ nome: 'SACHER', qta: 3 }],
  formati: [{ nome: 'cono', qta: 10 }],
  notaLibera: 'campo futuro, deve finire in extra',
}

describe('chiusura di cassa — quello che si scrive si rilegge', () => {
  it('ogni colonna scritta viene anche chiesta al database', () => {
    const riga = chiusuraARiga(chiusura, 'org-1', 'sede-1')
    const chieste = colonneChieste()
    const dimenticate = Object.keys(riga)
      .filter(k => !NON_SI_RILEGGONO.includes(k))
      .filter(k => !chieste.includes(k))
    expect(dimenticate,
      `queste colonne si scrivono e non si rileggono mai: ${dimenticate.join(', ')}`).toEqual([])
  })

  it('e ogni colonna chiesta esiste davvero fra quelle scritte', () => {
    // Il contrario: chiedere una colonna che nessuno scrive fa fallire tutta
    // la SELECT con un errore di PostgREST, non solo quel campo.
    const riga = chiusuraARiga(chiusura, 'org-1', 'sede-1')
    const scritte = new Set([...Object.keys(riga), 'id'])
    const inventate = colonneChieste().filter(c => !scritte.has(c))
    expect(inventate,
      `colonne chieste che nessuno scrive: ${inventate.join(', ')}`).toEqual([])
  })

  it('il giro completo non perde nessun numero dei soldi', () => {
    // La prova vera: scrivo, rileggo chiedendo SOLO le colonne di `COLONNE`
    // (come fa PostgREST) e ritrovo gli stessi numeri.
    const riga = chiusuraARiga(chiusura, 'org-1', 'sede-1')
    const comeTornaDalDb = {}
    for (const c of colonneChieste()) comeTornaDalDb[c] = riga[c]
    const tornata = rigaAChiusura(comeTornaDalDb)
    expect(tornata.kpi.totV).toBe(1250.5)
    expect(tornata.kpi.totFC).toBe(300.25)
    expect(tornata.kpi.totM).toBe(950.25)
    expect(tornata.kpi.totMP).toBe(76)
    expect(tornata.kpi.avgST).toBe(88)
    // È esattamente il campo che spariva.
    expect(tornata.kpi.scontrinoMedio, 'lo scontrino medio in euro si è perso').toBe(14.7)
    expect(tornata.kpi.pos).toBe(800)
    expect(tornata.kpi.contanti).toBe(400.5)
    expect(tornata.kpi.delivery).toBe(50)
  })

  it('«non rilevato» resta «non rilevato», non diventa zero', () => {
    // Zero incassi in contanti e «non l'ho scritto» sono due cose diverse: la
    // prima è un dato, la seconda è un buco. Confonderle fa dire al conto
    // economico che la giornata è andata a zero.
    const senzaCanali = { ...chiusura, kpi: { ...chiusura.kpi, pos: null, contanti: null, delivery: null, avgST: null, scontrinoMedio: null } }
    const riga = chiusuraARiga(senzaCanali, 'org-1', 'sede-1')
    const comeTornaDalDb = {}
    for (const c of colonneChieste()) comeTornaDalDb[c] = riga[c]
    const tornata = rigaAChiusura(comeTornaDalDb)
    for (const campo of ['pos', 'contanti', 'delivery', 'avgST', 'scontrinoMedio']) {
      expect(tornata.kpi[campo], `${campo}: «non rilevato» è diventato un numero`).toBeNull()
    }
  })

  it('un campo nuovo che lo schema non conosce finisce in extra e torna indietro', () => {
    const riga = chiusuraARiga(chiusura, 'org-1', 'sede-1')
    expect(riga.extra.notaLibera).toBe('campo futuro, deve finire in extra')
    const comeTornaDalDb = {}
    for (const c of colonneChieste()) comeTornaDalDb[c] = riga[c]
    expect(rigaAChiusura(comeTornaDalDb).notaLibera).toBe('campo futuro, deve finire in extra')
  })
})
