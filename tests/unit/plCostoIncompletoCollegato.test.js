// ── La correzione c'era, ma non era collegata ──────────────────────────
//
// Difetto vero, 16/09/2026, trovato ricontrollando una correzione fatta la
// mattina dello stesso giorno. `righeSensibilita` (in `plSensibilita.js`) era
// stata scritta apposta per tenere fuori dalla tabella della sensibilità i
// prodotti col food cost incompleto, e il suo test passava. Ma nel P&L la
// riga «MANGO JERRY SPICY +51.654,1% FC tollerabile» era ancora a schermo.
//
// Il motivo: `PLView.jsx` costruisce le righe con
//
//     const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
//
// e il secondo valore che `calcolaFC` restituisce — `mancanti`, l'elenco
// degli ingredienti senza prezzo — veniva buttato via sulla riga stessa.
// Nessuna riga aveva quindi il campo `fcParziale`, il filtro `!r.fcParziale`
// su `undefined` è sempre vero, e passavano tutte.
//
// Misurato sui dati veri di Mara dei Boschi (58 ricette):
//     prima:  45 prodotti «validi», 0 col costo incompleto
//     dopo:    4 prodotti «validi», 41 col costo incompleto
//
// Lo stesso campo mancante rompeva la card FOOD COST della stessa pagina:
// sommava il costo di 48 prodotti di cui 44 con il prezzo di un ingrediente
// mancante, e il rapporto usciva 4,6% — per una gelateria, dove il food cost
// normale sta fra il 25 e il 35 per cento. Sui 4 prodotti di cui si conosce
// tutto è 8,5%.
//
// La lezione che questo file protegge: una regola scritta in un modulo non
// serve a niente finché il dato su cui lavora non le arriva. Il test del
// modulo può passare mentre la pagina continua a mentire.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { righeSensibilita } from '../../src/lib/plSensibilita.js'
import { totaliSuCostiNoti } from '../../src/lib/totaliSuCostiNoti.js'
import { calcolaFC } from '../../src/lib/foodcost.js'

const PL = readFileSync(new URL('../../src/views/PLView.jsx', import.meta.url), 'utf8')

// Le righe come le costruisce il P&L, con i numeri veri di Mara.
const MANGO = { nome: 'MANGO JERRY SPICY', ricavo: 517.54, fc: 1.0, margine: 516.54, margPct: 99.8, senzaPrezzo: false, fcParziale: true }
const FICO = { nome: 'FOGLIA DI FICO', ricavo: 33.04, fc: 2.72, margine: 30.32, margPct: 91.8, senzaPrezzo: false, fcParziale: false }
const PANNA = { nome: 'FIOR DI PANNA', ricavo: 33.04, fc: 2.72, margine: 30.32, margPct: 91.8, senzaPrezzo: false, fcParziale: false }
const BASE = { nome: 'BASE BIANCA', ricavo: 0, fc: 30, margine: -30, margPct: 0, senzaPrezzo: true, fcParziale: false }

describe('il difetto: senza `mancanti` le righe non sanno di essere incomplete', () => {
  it('calcolaFC dice quali ingredienti non hanno prezzo, e non è il totale', () => {
    // Il righello prima della misura: se `calcolaFC` non restituisse
    // `mancanti`, tutto il resto di questo file non proverebbe niente.
    const ricetta = { nome: 'MANGO JERRY SPICY', ingredienti: [
      { nome: 'mango', qty1stampo: 500 },
      { nome: 'ingredienteinventatochenessunoprezza', qty1stampo: 300 },
    ] }
    const out = calcolaFC(ricetta, { mango: { costoKg: 4 } }, { ricette: {} })
    expect(out).toHaveProperty('mancanti')
    expect(out.mancanti.length).toBeGreaterThan(0)
  })

  it('una riga senza il campo `fcParziale` passa il filtro: era questo il buco', () => {
    // Com'era prima: `const { tot: fc } = calcolaFC(...)` scartava `mancanti`,
    // quindi `r.fcParziale` era `undefined` e `!undefined` è `true`.
    const comePrima = { ...MANGO }
    delete comePrima.fcParziale
    expect(righeSensibilita([comePrima]).validi).toHaveLength(1)
    expect(righeSensibilita([comePrima]).costoIncompleto).toBe(0)
    // Con il campo, la stessa riga resta fuori.
    expect(righeSensibilita([MANGO]).validi).toHaveLength(0)
    expect(righeSensibilita([MANGO]).costoIncompleto).toBe(1)
  })

  it('e il P&L ora tiene `mancanti` invece di buttarlo via', () => {
    expect(PL).toContain('const { tot: fc, mancanti } = calcolaFC(ric, ingCosti, ricettario)')
    expect(PL).toContain('fcParziale: (mancanti || []).length > 0')
    // Se qualcuno rimette la destrutturazione monca, questo test lo ferma.
    expect(PL).not.toContain('const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)')
  })
})

describe('la correzione: i totali si fanno solo sui costi che si conoscono', () => {
  it('il prodotto col costo incompleto non entra in nessuna somma', () => {
    const t = totaliSuCostiNoti([MANGO, FICO, PANNA])
    expect(t.righe.map(r => r.nome)).toEqual(['FOGLIA DI FICO', 'FIOR DI PANNA'])
    expect(t.totRicavo).toBeCloseTo(66.08, 2)
    expect(t.totFC).toBeCloseTo(5.44, 2)
    expect(t.totMargine).toBeCloseTo(60.64, 2)
  })

  it('il FC ratio smette di dire 1,0% e dice 8,2%', () => {
    // Con MANGO dentro: (1,0 + 2,72 + 2,72) / (517,54 + 33,04 + 33,04) = 1,1%.
    const conIncompleti = [MANGO, FICO, PANNA]
    const vecchioRatio = conIncompleti.reduce((s, r) => s + r.fc, 0) / conIncompleti.reduce((s, r) => s + r.ricavo, 0) * 100
    expect(vecchioRatio).toBeLessThan(2)
    // Senza: 5,44 / 66,08 = 8,2%.
    expect(totaliSuCostiNoti(conIncompleti).fcAvg).toBeCloseTo(8.2, 1)
  })

  it('ricavo, food cost e margine restano lo stesso conto: R − FC = M', () => {
    // Se il ricavo comprendesse anche i prodotti dal costo incompleto, il
    // conto economico si contraddirebbe da solo.
    const t = totaliSuCostiNoti([MANGO, FICO, PANNA, BASE])
    expect(t.totRicavo - t.totFC).toBeCloseTo(t.totMargine, 6)
  })

  it('chi resta fuori si conta, diviso per motivo, e i motivi non si sovrappongono', () => {
    const righe = [MANGO, FICO, PANNA, BASE]
    const t = totaliSuCostiNoti(righe)
    expect(t.nCostoIncompleto).toBe(1)   // MANGO
    expect(t.nSenzaPrezzo).toBe(1)       // BASE BIANCA
    expect(t.nSenzaPrezzo + t.nCostoIncompleto).toBe(t.nEsclusi)
    expect(t.righe.length + t.nEsclusi).toBe(righe.length)
  })

  it('e dice quanto vale quello che resta fuori, invece di nasconderlo', () => {
    const t = totaliSuCostiNoti([MANGO, FICO, PANNA, BASE])
    // Il food cost dei prodotti senza prezzo esiste, anche se non entra nei
    // rapporti: 30 € di materie prime di BASE BIANCA.
    expect(t.fcSenzaPrezzo).toBeCloseTo(30, 2)
    // Il ricavo dei prodotti dal costo incompleto invece si conosce: sono
    // 517,54 € di fatturato teorico su cui non sappiamo dire il margine.
    expect(t.ricavoCostoIncompleto).toBeCloseTo(517.54, 2)
  })
})

describe("quello che c'è intorno", () => {
  it('senza righe non esplode e non inventa un ratio', () => {
    expect(totaliSuCostiNoti([]).fcAvg).toBe(0)
    expect(totaliSuCostiNoti([]).totRicavo).toBe(0)
    expect(totaliSuCostiNoti(undefined).righe).toEqual([])
    expect(totaliSuCostiNoti([null]).nEsclusi).toBe(1)
  })

  it('un prodotto in perdita resta nei totali: è proprio quello da vedere', () => {
    const perdita = { nome: 'IN PERDITA', ricavo: 30, fc: 50, margine: -20, margPct: -66.7, senzaPrezzo: false, fcParziale: false }
    const t = totaliSuCostiNoti([perdita])
    expect(t.righe).toHaveLength(1)
    expect(t.fcAvg).toBeCloseTo(166.7, 1)
  })

  it('il margine medio è la media dei margini di prodotto, non il margine del totale', () => {
    // Due grandezze diverse che la pagina mostra affiancate: se una riga
    // grande domina il totale, i due numeri divergono ed è giusto così.
    const a = { nome: 'A', ricavo: 1000, fc: 900, margine: 100, margPct: 10, senzaPrezzo: false, fcParziale: false }
    const b = { nome: 'B', ricavo: 10, fc: 1, margine: 9, margPct: 90, senzaPrezzo: false, fcParziale: false }
    const t = totaliSuCostiNoti([a, b])
    expect(t.avgMarg).toBeCloseTo(50, 1)                          // media dei due margini
    expect(t.totMargine / t.totRicavo * 100).toBeCloseTo(10.8, 1) // margine del totale
  })

  it('il miglior prodotto e il peggiore si scelgono fra quelli col costo noto', () => {
    // Prima potevano essere prodotti di cui non si sa quanto costano: il
    // «miglior margine» era sempre uno di quelli col food cost a briciole.
    expect(PL).toContain('const best = righeComplete[0]')
    expect(PL).toContain('const worst = righeComplete[righeComplete.length - 1]')
  })
})

describe('la regola sta in un posto solo', () => {
  it('il P&L usa il modulo, non risomma a mano le righe', () => {
    expect(PL).toContain('totaliSuCostiNoti(rows)')
    expect(PL).toContain("from '../lib/totaliSuCostiNoti'")
    // Le vecchie somme su `righeConPrezzo` non devono tornare.
    expect(PL).not.toContain('righeConPrezzo')
  })

  it('e dice a chi legge su quanti prodotti si regge il conto', () => {
    expect(PL).toContain('nCostoIncompleto')
    expect(PL).toContain('prezzo di almeno un ingrediente mancante')
  })
})
