// ── Il riepilogo che si legge prima di riscrivere il ricettario ──────────
//
// È la domanda più pericolosa del prodotto: dietro c'è la riscrittura di
// tutto il ricettario, e il testo di quella domanda è l'unica cosa che sta
// fra un import buono e uno che cancella mesi di lavoro.
//
// Fino al 21/09/2026 quei conti stavano dentro `Dashboard.jsx`, in mezzo al
// gestore dell'import: venti righe che nessuna prova poteva raggiungere senza
// montare tutto il telaio. Il file era anche arrivato a 3.935 righe, sopra il
// tetto di 3.900 che una prova tiene fermo — e quel tetto dice, testualmente,
// «è il momento di scorporare, non di alzare il tetto».
//
// Le frasi sono quelle di prima parola per parola: lo spostamento non doveva
// cambiare niente di quello che si legge, e queste prove lo mettono per
// iscritto.
import { describe, it, expect } from 'vitest'
import { riepilogoImport, FUORI_SCALA_G } from '../../src/lib/riepilogoImportRicette'

const ric = (p = {}) => ({ nome: 'X', tipo: 'fetta', unita: 8, prezzo: 3, ingredienti: [], ...p })
const file = (nome, ricette, extra = {}) => ({ nome, result: { ricette, ...extra } })

describe('Quante ricette, e da quanti file', () => {
  it('un file solo si dice «un file», non «1 file»', () => {
    const base = { ricette: { TORTA: ric({ nome: 'TORTA' }) } }
    const { righe } = riepilogoImport([file('a.xlsx', { TORTA: {} })], base, null, false)
    expect(righe[0]).toBe('1 ricette lette da un file.')
  })

  it('due file si contano', () => {
    const base = { ricette: { A: ric({ nome: 'A' }), B: ric({ nome: 'B' }) } }
    const { righe } = riepilogoImport(
      [file('a.xlsx', { A: {} }), file('b.xlsx', { B: {} })], base, null, false)
    expect(righe[0]).toBe('2 ricette lette da 2 file.')
  })
})

describe('Quello che l\'import sta per sovrascrivere', () => {
  it('lo dice, e fa i nomi', () => {
    // È la riga che evita il disastro: senza, uno preme «salva» e scopre dopo
    // di aver perso la sua versione della torta.
    const base = { ricette: { TORTA: ric({ nome: 'TORTA' }) } }
    const adesso = { ricette: { TORTA: ric({ nome: 'TORTA', prezzo: 9 }) } }
    const { righe } = riepilogoImport([file('a.xlsx', { TORTA: {} })], base, adesso, false)
    expect(righe.join('\n')).toMatch(/1 sostituiscono ricette che hai già: TORTA/)
  })

  it('e con più di sei non le elenca tutte', () => {
    const nomi = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    const ricette = Object.fromEntries(nomi.map(n => [n, ric({ nome: n })]))
    const { righe } = riepilogoImport([file('a.xlsx', ricette)], { ricette }, { ricette }, false)
    const riga = righe.find(r => r.includes('sostituiscono'))
    expect(riga).toMatch(/A, B, C, D, E, F…/)
  })

  it('se non c\'è ancora niente, non parla di sostituzioni', () => {
    const base = { ricette: { TORTA: ric({ nome: 'TORTA' }) } }
    const { righe } = riepilogoImport([file('a.xlsx', { TORTA: {} })], base, null, false)
    expect(righe.join('\n')).not.toMatch(/sostituiscono/)
  })
})

describe('I buchi che l\'import lascia', () => {
  it('le ricette senza prezzo si contano, e si dice cosa comporta', () => {
    // Un prezzo che manca non è zero: ricavo e margine restano vuoti, e chi
    // guarda il P&L deve sapere perché.
    const base = { ricette: { A: ric({ nome: 'A', prezzo: 0 }), B: ric({ nome: 'B', prezzo: 4 }) } }
    const { righe, senzaPrezzo } = riepilogoImport([file('a.xlsx', { A: {}, B: {} })], base, null, false)
    expect(senzaPrezzo).toBe(1)
    expect(righe.join('\n')).toMatch(/1 senza prezzo di vendita/)
    expect(righe.join('\n')).toMatch(/ricavo e il margine resteranno vuoti/)
  })

  it('e quelle senza pezzi per stampo', () => {
    const base = { ricette: { A: ric({ nome: 'A', unita: null }) } }
    const { righe } = riepilogoImport([file('a.xlsx', { A: {} })], base, null, false)
    expect(righe.join('\n')).toMatch(/1 senza il numero di pezzi per stampo/)
  })

  it('una ricetta senza tipo diventa un gusto se l\'azienda lavora a inventario', () => {
    const base = { ricette: { A: ric({ nome: 'A', tipo: null }) } }
    const { righe } = riepilogoImport([file('a.xlsx', { A: {} })], base, null, true)
    expect(righe.join('\n')).toMatch(/le tratto come gusti di gelato/)
  })

  it('e una torta a fette se lavora a stampi', () => {
    const base = { ricette: { A: ric({ nome: 'A', tipo: null }) } }
    const { righe } = riepilogoImport([file('a.xlsx', { A: {} })], base, null, false)
    expect(righe.join('\n')).toMatch(/le tratto come torte a fette/)
  })
})

describe('Le quantità fuori scala', () => {
  it('oltre venti chili di un solo ingrediente è quasi sempre un errore di unità', () => {
    const base = { ricette: { A: ric({ nome: 'A', ingredienti: [{ nome: 'farina', qty1stampo: 25000 }] }) } }
    const { righe } = riepilogoImport([file('a.xlsx', { A: {} })], base, null, false)
    expect(righe.join('\n')).toMatch(/quantità fuori scala/)
    expect(righe.join('\n')).toMatch(/A/)
    expect(righe.join('\n')).toMatch(/punto di troppo/)
  })

  it('esattamente ventimila grammi non è ancora fuori scala', () => {
    // Il confine si prova, se no nessuno sa da che parte sta.
    const base = { ricette: { A: ric({ nome: 'A', ingredienti: [{ nome: 'farina', qty1stampo: FUORI_SCALA_G }] }) } }
    const { righe } = riepilogoImport([file('a.xlsx', { A: {} })], base, null, false)
    expect(righe.join('\n')).not.toMatch(/fuori scala/)
  })
})

describe('Da dove arriva la lettura', () => {
  it('quando ha letto con l\'AI lo dichiara', () => {
    const base = { ricette: { A: ric({ nome: 'A' }) } }
    const { righe } = riepilogoImport([file('a.pdf', { A: {} }, { source: 'ai' })], base, null, false)
    expect(righe.join('\n')).toMatch(/Letto con l'AI \(controlla che sia giusto\): a\.pdf/)
  })

  it('e quando il file era troppo lungo avvisa che può mancare qualcosa', () => {
    const base = { ricette: { A: ric({ nome: 'A' }) } }
    const { righe } = riepilogoImport([file('lungo.xlsx', { A: {} }, { truncated: true })], base, null, false)
    expect(righe.join('\n')).toMatch(/File lungo, alcune ricette potrebbero mancare: lungo\.xlsx/)
  })
})

describe('Quello che non deve succedere', () => {
  it('niente undefined o NaN nel testo, nemmeno con dati storti', () => {
    const { righe } = riepilogoImport(
      [file('a.xlsx', { A: {} }), null],
      { ricette: { A: null } }, null, false)
    const t = righe.join('\n')
    expect(t).not.toMatch(/undefined/)
    expect(t).not.toMatch(/NaN/)
  })

  it('e con niente da leggere resta una riga sola, non un errore', () => {
    const { righe } = riepilogoImport([], { ricette: {} }, null, false)
    expect(righe).toHaveLength(1)
    expect(righe[0]).toMatch(/^0 ricette lette/)
  })

  it('nemmeno se `letti` non è un elenco', () => {
    expect(() => riepilogoImport(null, null, null, false)).not.toThrow()
  })
})
