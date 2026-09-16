// ── «FOOD COST MEDIO 4,8%» ─────────────────────────────────────────────
//
// Difetto vero, 16/09/2026, aprendo il Ricettario dentro l'account del
// titolare di Mara dei Boschi. La tessera in alto diceva:
//
//     FOOD COST MEDIO     4,8%
//     media non pesata sulle ricette
//
// In verde. Per una gelateria è un numero impossibile — il food cost normale
// sta fra il 25 e il 35 per cento — e in quel momento nell'archivio c'erano
// 58 ricette, 99 ingredienti distinti e soltanto 5 con un prezzo. Il costo
// calcolato di quasi ogni ricetta era una briciola: non era basso, mancava.
//
// Metà del controllo c'era già: le ricette senza prezzo di vendita venivano
// escluse, perché una percentuale su un ricavo che non esiste non si può
// fare. Mancava l'altra metà, cioè escludere quelle di cui non si conosce il
// COSTO. Bastava un ingrediente prezzato su dodici perché la ricetta passasse
// il controllo `costo > 0` ed entrasse nella media.
//
// Lo stesso giorno lo stesso difetto è uscito nella tabella della sensibilità
// del P&L: «MANGO JERRY SPICY +51.654% FC tollerabile». È una famiglia, non
// un caso isolato — ed è il motivo per cui questo test copre anche il
// principio, non solo il sintomo: dove si divide per un costo, quel costo
// deve essere COMPLETO, non soltanto diverso da zero.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mediaFoodCost } from '../../src/lib/mediaFoodCost.js'

const leggi = (...p) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8')

// Una ricetta come quelle vere di Mara: si vende (il ricavo arriva dai
// formati) ma quasi nessun ingrediente ha un prezzo.
const comeQuelleDiMara = (n) => Array.from({ length: n }, (_, i) => ({
  nome: `GUSTO ${i}`, ricavo: 24, costo: 1.15, mancanti: ['zucchero barbabietola', 'neutro'],
}))

describe('il difetto: costi incompleti facevano una media falsa', () => {
  it('senza il controllo uscirebbe una percentuale bassissima', () => {
    // Il conto di prima: 1,15 / 24 = 4,8%. È esattamente il numero che si
    // leggeva a schermo.
    const vecchioConto = 1.15 / 24 * 100
    expect(vecchioConto).toBeCloseTo(4.8, 1)
  })

  it('ora quelle ricette non entrano nella media', () => {
    const r = mediaFoodCost(comeQuelleDiMara(55))
    expect(r.media).toBeNull()
    expect(r.su).toBe(0)
    expect(r.costoIncompleto).toBe(55)
  })

  it('e «non lo so» resta «non lo so», non diventa zero', () => {
    // Un food cost sconosciuto non è gratis. `media` è null, non 0.
    expect(mediaFoodCost(comeQuelleDiMara(3)).media).not.toBe(0)
    expect(mediaFoodCost(comeQuelleDiMara(3)).media).toBeNull()
  })
})

describe('i due motivi di esclusione restano distinti', () => {
  const voci = [
    { ricavo: 24, costo: 7.2,  mancanti: [] },            // completa
    { ricavo: 24, costo: 1.15, mancanti: ['neutro'] },     // costo incompleto
    { ricavo: 0,  costo: 7.2,  mancanti: [] },             // senza prezzo di vendita
    { ricavo: 0,  costo: 0,    mancanti: ['acqua'] },      // tutti e due
  ]

  it('si contano separatamente, perché si risolvono in due posti diversi', () => {
    const r = mediaFoodCost(voci)
    expect(r.su).toBe(1)
    expect(r.costoIncompleto).toBe(1)
    expect(r.senzaPrezzoVendita).toBe(2)   // chi non ha ricavo esce subito
  })

  it('la media si fa solo sulla ricetta che sa rispondere', () => {
    expect(mediaFoodCost(voci).media).toBeCloseTo(7.2 / 24, 6)
  })

  it('i conti tornano: contate + escluse = tutte', () => {
    const r = mediaFoodCost(voci)
    expect(r.su + r.costoIncompleto + r.senzaPrezzoVendita).toBe(voci.length)
  })
})

describe('quello che c\'è intorno', () => {
  it('più ricette complete danno la media fra le loro percentuali', () => {
    const r = mediaFoodCost([
      { ricavo: 100, costo: 20, mancanti: [] },
      { ricavo: 100, costo: 40, mancanti: [] },
    ])
    expect(r.media).toBeCloseTo(0.30, 6)
    expect(r.su).toBe(2)
  })

  it('un elenco vuoto o storto non fa esplodere niente', () => {
    expect(mediaFoodCost([]).media).toBeNull()
    expect(mediaFoodCost(undefined).su).toBe(0)
    expect(mediaFoodCost([null]).senzaPrezzoVendita).toBe(1)
  })

  it('un food cost sopra il 100% si vede: è un prodotto in perdita', () => {
    expect(mediaFoodCost([{ ricavo: 10, costo: 13, mancanti: [] }]).media).toBeCloseTo(1.3, 6)
  })
})

describe('la regola sta in un posto solo e il Ricettario la usa', () => {
  const RIC = leggi('src', 'views', 'RicettarioView.jsx')

  it('il Ricettario chiama la funzione', () => {
    expect(RIC).toContain('mediaFoodCost(')
    expect(RIC).toContain("from '../lib/mediaFoodCost'")
  })

  it('non rifà il conto a mano saltando il controllo sui costi', () => {
    expect(RIC).not.toMatch(/tot \+= fc \/ ricavo; cnt\+\+/)
  })

  it('e dice a chi legge quante ricette sono rimaste fuori e perché', () => {
    expect(RIC).toContain('ingredienti senza prezzo')
    expect(RIC).toContain('senza prezzo di vendita')
  })
})
