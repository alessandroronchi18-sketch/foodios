// ── Il prezzo del materiale sta in un posto solo ────────────────────────
//
// ── Il difetto, misurato il 22/09/2026 ──────────────────────────────────
//
// Il 18/09/2026 è nato l'elenco dei materiali di confezionamento, e la
// schermata prometteva: «scrivili qui una volta sola … il prezzo si corregge
// in un posto solo».
//
// Non era vero. `FormatiVendita.jsx` chiamava `costoDiMateriale(v)` **solo
// nel momento in cui sceglievi il materiale**, e copiava quel numero dentro
// il formato. Da lì restava fermo per sempre: correggere la cialda
// nell'elenco non toccava nessuno dei formati già composti. La promessa
// valeva solo per i formati composti dopo la correzione — cioè quasi nessuno.
//
// Sui dati veri del design partner, letti in produzione il 22/09/2026, tutti
// e 8 i formati portavano:
//
//     Cialda 0,001 €   Fazzoletto 0,001 €   Cucchiaino 0,001 €
//     Coppetta 0,002 €   Sacchetto 0,10 €
//
// cioè un Cono Grande venduto 5,50 € con **due millesimi di euro** di
// materiali. Il riferimento vero è scritto nel prodotto stesso
// (`FormatiVendita.jsx`, in cima): cialda 0,06 €, fazzoletto 0,01 €. Erano
// fuori di trenta volte, ed erano numeri di prova rimasti lì.
//
// ── Cosa prova questo file ──────────────────────────────────────────────
//
// Che il numero venga preso dall'elenco e non dalla copia congelata; che una
// copia congelata non venga mai buttata via quando l'elenco non sa il prezzo
// (zero non è «non lo so»); e che un materiale possa seguire le bolle senza
// che nessuno riscriva niente.
import { describe, it, expect } from 'vitest'
import {
  componentiNormalizzati, componentiConOrigine, costoComponentiUnita,
  costoDelMateriale, materialiRisolti, chiaveMateriale,
} from '../../src/lib/formatiVendita.js'
import { buildIngCosti } from '../../src/lib/foodcost.js'

// Il Cono Grande di Mara, così com'era in produzione il 22/09/2026.
const CONO_GRANDE = {
  nome: 'Cono Grande', categoria: 'Gusto', baseQtaG: 180, prezzoDefault: 5.5,
  componenti: [
    { nome: 'Cialda', qta: 1, costo: 0.001 },
    { nome: 'Fazzoletto', qta: 1, costo: 0.001 },
  ],
}

const ELENCO_GIUSTO = [
  { nome: 'Cialda', costo: 0.06 },
  { nome: 'Fazzoletto', costo: 0.01 },
]

describe('Il formato legge il prezzo dall\'elenco, non la sua copia', () => {
  it('correggere l\'elenco corregge il formato già composto', () => {
    // È il difetto: prima, questo formato restava a 0,002 € per sempre.
    expect(costoComponentiUnita(CONO_GRANDE, ELENCO_GIUSTO)).toBeCloseTo(0.07, 6)
  })

  it('e senza l\'elenco si comporta esattamente come prima', () => {
    // Retrocompatibilità: tutti i callsite che non passano l'elenco devono
    // vedere il numero che vedevano ieri, non uno nuovo.
    expect(costoComponentiUnita(CONO_GRANDE)).toBeCloseTo(0.002, 6)
    expect(componentiNormalizzati(CONO_GRANDE)).toEqual([
      { nome: 'Cialda', qta: 1, costo: 0.001 },
      { nome: 'Fazzoletto', qta: 1, costo: 0.001 },
    ])
  })

  it('e dice di quanto era indietro la copia congelata', () => {
    // Senza questo, la correzione arriva in silenzio e nessuno sa che per
    // mesi il cono è costato due millesimi.
    const c = componentiConOrigine(CONO_GRANDE, ELENCO_GIUSTO)
    expect(c[0].diverso).toBe(true)
    expect(c[0].costoScritto).toBeCloseTo(0.001, 6)
    expect(c[0].costo).toBeCloseTo(0.06, 6)
  })

  it('e non lo dice quando i due numeri coincidono', () => {
    const c = componentiConOrigine(CONO_GRANDE, [{ nome: 'Cialda', costo: 0.001 }, { nome: 'Fazzoletto', costo: 0.001 }])
    expect(c.every(x => x.diverso === false)).toBe(true)
  })

  it('la quantità continua a moltiplicare', () => {
    const doppio = { componenti: [{ nome: 'Cialda', qta: 3, costo: 0.001 }] }
    expect(costoComponentiUnita(doppio, ELENCO_GIUSTO)).toBeCloseTo(0.18, 6)
  })
})

describe('Un materiale senza prezzo non vale zero', () => {
  it('se l\'elenco non sa il prezzo, il numero vecchio resta', () => {
    // Toglierlo farebbe costare **zero** la cialda, e un cono senza materiali
    // sembra più redditizio di quello che è. È l'errore di famiglia di questo
    // prodotto: un buco trattato come uno zero.
    const c = componentiConOrigine(CONO_GRANDE, [{ nome: 'Cialda', costo: null }, { nome: 'Fazzoletto', costo: 0.01 }])
    expect(c[0].costo).toBeCloseTo(0.001, 6)
    expect(c[0].senzaPrezzo).toBe(true)
    expect(c[0].daListino).toBe(false)
  })

  it('vale anche per la casella lasciata vuota', () => {
    const c = componentiConOrigine(CONO_GRANDE, [{ nome: 'Cialda', costo: '' }])
    expect(c[0].senzaPrezzo).toBe(true)
    expect(c[0].costo).toBeCloseTo(0.001, 6)
  })

  it('ma zero scritto apposta è un prezzo: l\'omaggio del fornitore', () => {
    const c = componentiConOrigine(CONO_GRANDE, [{ nome: 'Cialda', costo: 0 }])
    expect(c[0].daListino).toBe(true)
    expect(c[0].senzaPrezzo).toBe(false)
    expect(c[0].costo).toBe(0)
  })

  it('un materiale che nell\'elenco non c\'è si dichiara, e tiene il suo numero', () => {
    const c = componentiConOrigine(CONO_GRANDE, [{ nome: 'Fazzoletto', costo: 0.01 }])
    expect(c[0].fuoriElenco).toBe(true)
    expect(c[0].costo).toBeCloseTo(0.001, 6)
    expect(c[1].fuoriElenco).toBe(false)
  })
})

describe('Lo stesso materiale scritto in due modi è lo stesso materiale', () => {
  it('maiuscole, spazi davanti e dietro, spazi doppi in mezzo', () => {
    expect(chiaveMateriale('  Cono   Cialda  ')).toBe('cono cialda')
    const f = { componenti: [{ nome: ' CONO  CIALDA ', qta: 1, costo: 0.001 }] }
    expect(costoComponentiUnita(f, [{ nome: 'Cono Cialda', costo: 0.06 }])).toBeCloseTo(0.06, 6)
  })

  it('ma «coppettp» resta una cosa diversa da «coppetta»', () => {
    // L'errore di battitura è proprio il motivo per cui l'elenco esiste: non
    // va fatto sparire di nascosto, va fatto vedere.
    const f = { componenti: [{ nome: 'Coppettp', qta: 1, costo: 0.002 }] }
    expect(componentiConOrigine(f, [{ nome: 'Coppetta', costo: 0.04 }])[0].fuoriElenco).toBe(true)
  })
})

describe('Il materiale che segue le bolle da solo', () => {
  // Una cialda pesa 5 g. Se le cialde stanno fra le materie prime a 12 €/kg,
  // una costa 0,06 € — e quando arriva la bolla nuova il prezzo si sposta da
  // solo, senza che nessuno riapra gli otto formati.
  const ic = buildIngCosti({ 'cialde cono': { costoKg: 12, costoG: 0.012 } })

  it('il prezzo di uno esce dal prezzo al chilo e dal peso di uno', () => {
    const r = costoDelMateriale({ nome: 'Cialda', legatoA: 'cialde cono', pesoG: 5 }, ic)
    expect(r.costo).toBeCloseTo(0.06, 6)
    expect(r.origine).toBe('magazzino')
    expect(r.problema).toBe(null)
  })

  it('e arriva fino dentro al formato', () => {
    const mat = materialiRisolti([{ nome: 'Cialda', legatoA: 'cialde cono', pesoG: 5 }], ic)
    expect(costoComponentiUnita(CONO_GRANDE, mat)).toBeCloseTo(0.061, 6)
  })

  it('il legame vince sul prezzo scritto a mano', () => {
    // Se uno ha scritto 0,02 a mano e poi ha collegato il materiale al
    // magazzino, comanda la bolla: è la scelta dichiarata più di recente.
    const r = costoDelMateriale({ nome: 'Cialda', costo: 0.02, legatoA: 'cialde cono', pesoG: 5 }, ic)
    expect(r.costo).toBeCloseTo(0.06, 6)
  })

  it('se la materia prima collegata non ha prezzo, lo dice invece di inventare', () => {
    const r = costoDelMateriale({ nome: 'Cialda', legatoA: 'cialde che non esistono', pesoG: 5 }, ic)
    expect(r.costo).toBe(null)
    expect(r.problema).toMatch(/non ha un prezzo/)
  })

  it('e allora il formato tiene il suo numero vecchio, non zero', () => {
    const mat = materialiRisolti([{ nome: 'Cialda', legatoA: 'introvabile', pesoG: 5 }], ic)
    const c = componentiConOrigine(CONO_GRANDE, mat)
    expect(c[0].costo).toBeCloseTo(0.001, 6)
    expect(c[0].senzaPrezzo).toBe(true)
  })

  it('senza il peso di uno il legame non parte: si torna al prezzo a mano', () => {
    // Un peso mancante moltiplicato per un prezzo al chilo farebbe zero, e
    // zero è il numero più pericoloso di questo file.
    const r = costoDelMateriale({ nome: 'Cialda', costo: 0.05, legatoA: 'cialde cono', pesoG: 0 }, ic)
    expect(r.origine).toBe('mano')
    expect(r.costo).toBeCloseTo(0.05, 6)
  })

  it('e un peso negativo nemmeno', () => {
    const r = costoDelMateriale({ nome: 'Cialda', costo: 0.05, legatoA: 'cialde cono', pesoG: -5 }, ic)
    expect(r.origine).toBe('mano')
    expect(r.costo).toBeCloseTo(0.05, 6)
  })

  it('un prezzo solo stimato si vede che è stimato', () => {
    // `buildIngCosti` riempie i buchi con le stime HORECA: un food cost
    // costruito su una stima non è un food cost dichiarato.
    const r = costoDelMateriale({ nome: 'Zucchero', legatoA: 'zucchero', pesoG: 1000 }, buildIngCosti({}))
    expect(r.stima).toBe(true)
  })
})

describe('Quello che c\'era prima continua a funzionare', () => {
  it('il vecchio costoContenitore diventa un componente, anche con l\'elenco', () => {
    expect(componentiNormalizzati({ costoContenitore: 0.2 }, ELENCO_GIUSTO))
      .toEqual([{ nome: 'Contenitore', qta: 1, costo: 0.2 }])
  })

  it('e se il contenitore è nell\'elenco, l\'elenco comanda anche lì', () => {
    expect(costoComponentiUnita({ costoContenitore: 0.2 }, [{ nome: 'Contenitore', costo: 0.35 }]))
      .toBeCloseTo(0.35, 6)
  })

  it('un formato senza componenti resta vuoto', () => {
    expect(componentiNormalizzati({}, ELENCO_GIUSTO)).toEqual([])
    expect(costoComponentiUnita({}, ELENCO_GIUSTO)).toBe(0)
  })

  it('un elenco scritto storto non fa cadere niente', () => {
    for (const storto of [null, undefined, 'ciao', 42, [null], [{ }], [{ nome: '' }]]) {
      expect(() => costoComponentiUnita(CONO_GRANDE, storto)).not.toThrow()
    }
    expect(costoComponentiUnita(CONO_GRANDE, [null])).toBeCloseTo(0.002, 6)
  })
})

describe('Il righello di questo file', () => {
  it('saprebbe accorgersi se il collegamento sparisse', () => {
    // Taratura: se `componentiConOrigine` tornasse a ignorare l'elenco,
    // questi due numeri sarebbero uguali e mezzo file diventerebbe inutile.
    const senza = costoComponentiUnita(CONO_GRANDE)
    const con = costoComponentiUnita(CONO_GRANDE, ELENCO_GIUSTO)
    expect(senza).not.toBeCloseTo(con, 6)
  })

  it('e guarda davvero i dati veri del design partner', () => {
    // Gli otto formati di Mara, il 22/09/2026: coni a 0,002 € e coppette a
    // 0,004 €. Se un giorno questi numeri saranno quelli veri, questa prova
    // resta comunque un promemoria di dove si era partiti.
    expect(costoComponentiUnita(CONO_GRANDE)).toBeLessThan(0.01)
  })
})
