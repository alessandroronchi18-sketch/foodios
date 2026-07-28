import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  componentiNormalizzati, costoComponentiUnita, matchFormato,
  fcStimatoFormato, avgFCperGCategoria, riconciliaFormati,
  avgPrezzoPerKgCategoria, FORMATI_GELATERIA_DEFAULT,
} from '../../src/lib/formatiVendita.js'
import { buildIngCosti } from '../../src/lib/foodcost.js'

const ic = (m) => { const o = {}; for (const [n, kg] of Object.entries(m)) o[n] = { costoKg: kg, costoG: kg / 1000 }; return o }

describe('componentiNormalizzati', () => {
  it('normalizza array di componenti', () => {
    const c = componentiNormalizzati({ componenti: [{ nome: 'Cono', qta: 1, costo: 0.06 }] })
    expect(c).toEqual([{ nome: 'Cono', qta: 1, costo: 0.06 }])
  })
  it('converte il legacy costoContenitore in un componente', () => {
    expect(componentiNormalizzati({ costoContenitore: 0.2 })).toEqual([{ nome: 'Contenitore', qta: 1, costo: 0.2 }])
  })
  it('vuoto se niente componenti né legacy', () => {
    expect(componentiNormalizzati({})).toEqual([])
  })
})

describe('costoComponentiUnita', () => {
  it('somma qta*costo', () => {
    expect(costoComponentiUnita({ componenti: [{ nome: 'a', qta: 2, costo: 0.1 }, { nome: 'b', qta: 1, costo: 0.05 }] }))
      .toBeCloseTo(0.25, 6)
  })
})

describe('matchFormato', () => {
  const formati = [
    { id: 'f1', nome: 'Vaschetta 500', alias: ['vasch 500'] },
    { id: 'f2', nome: 'Cono' },
  ]
  it('match per nome (case/spazi-insensitive)', () => {
    expect(matchFormato('VASCHETTA 500', formati)?.id).toBe('f1')
  })
  it('match per alias', () => {
    expect(matchFormato('Vasch 500', formati)?.id).toBe('f1')
  })
  it('niente match -> null', () => {
    expect(matchFormato('Tiramisù', formati)).toBeNull()
  })
})

describe('fcStimatoFormato', () => {
  it('= componenti + baseQtaG * FC_medio/g', () => {
    const f = { baseQtaG: 100, componenti: [{ nome: 'box', qta: 1, costo: 0.2 }] }
    expect(fcStimatoFormato(f, 0.01)).toBeCloseTo(0.2 + 100 * 0.01, 6) // 1.2
  })
})

describe('avgFCperGCategoria — match categoria case-insensitive', () => {
  it('una ricetta "gelato" rientra nella categoria "Gelato"', () => {
    const ingCosti = buildIngCosti(ic({ latte_y: 1.0 })) // 0.001 €/g
    const ricettario = { ricette: {
      FIORDILATTE: { nome: 'FIORDILATTE', categoria: 'gelato', tipo: 'fetta', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'latte_y', qty1stampo: 1000 }] }, // fc 1.0, peso 1000 -> 0.001/g
    } }
    const avg = avgFCperGCategoria('Gelato', ricettario, ingCosti)
    expect(avg).toBeCloseTo(0.001, 6)
  })
})

describe('avgPrezzoPerKgCategoria — ricavo flat gusti gelateria', () => {
  const F = (id, nome, categoria, baseQtaG, prezzoDefault) => ({ id, nome, categoria, baseQtaG, prezzoDefault })

  it('media semplice sui formati della categoria esatta', () => {
    // Cono €2.50/80g = 31.25 €/kg · Vaschetta €10/500g = 20 €/kg → media 25.625
    const formati = [
      F('c', 'Cono', 'Gusto', 80, 2.5),
      F('v', 'Vaschetta', 'Gusto', 500, 10),
    ]
    expect(avgPrezzoPerKgCategoria('gusto', formati)).toBeCloseTo(25.625, 3)
  })
  it('match case-insensitive sulla categoria', () => {
    const formati = [F('c', 'Cono', 'CREMA', 100, 3)]
    expect(avgPrezzoPerKgCategoria('crema', formati)).toBeCloseTo(30, 3)
    expect(avgPrezzoPerKgCategoria('Crema', formati)).toBeCloseTo(30, 3)
  })
  it('categoria non trovata → fallback su formati "gusto/gelato/gelati/yogurt"', () => {
    const formati = [
      F('c', 'Cono', 'Gusto', 80, 2.5),      // 31.25 €/kg — usato per fallback
      F('t', 'Torta 8 fette', 'Torta', 300, 12), // 40 €/kg — NON incluso
    ]
    // "Frutta" non ha match → fallback su Gusto (non su tutti)
    expect(avgPrezzoPerKgCategoria('frutta', formati)).toBeCloseTo(31.25, 3)
  })
  it('categoria non trovata + nessun generic gelateria → fallback su TUTTI i formati validi', () => {
    const formati = [F('t', 'Torta', 'Torta', 300, 12)] // 40 €/kg
    expect(avgPrezzoPerKgCategoria('inesistente', formati)).toBeCloseTo(40, 3)
  })
  it('formati con baseQtaG=0 o prezzo=0 sono esclusi', () => {
    const formati = [
      F('a', 'a', 'Gusto', 0, 2.5),   // baseQtaG=0 → escluso
      F('b', 'b', 'Gusto', 100, 0),   // prezzo=0 → escluso
      F('c', 'c', 'Gusto', 100, 3),   // ok: 30 €/kg
    ]
    expect(avgPrezzoPerKgCategoria('gusto', formati)).toBeCloseTo(30, 3)
  })
  it('array vuoto o nessun formato valido → null', () => {
    expect(avgPrezzoPerKgCategoria('gusto', [])).toBeNull()
    expect(avgPrezzoPerKgCategoria('gusto', null)).toBeNull()
    expect(avgPrezzoPerKgCategoria('gusto', undefined)).toBeNull()
    expect(avgPrezzoPerKgCategoria('gusto', [F('x', 'x', 'y', 0, 0)])).toBeNull()
  })
  it('categoria vuota/null → considera tutti i validi (nessuna preferenza)', () => {
    const formati = [F('c', 'Cono', 'Gusto', 100, 2)] // 20 €/kg
    expect(avgPrezzoPerKgCategoria('', formati)).toBeCloseTo(20, 3)
    expect(avgPrezzoPerKgCategoria(null, formati)).toBeCloseTo(20, 3)
  })
})

describe('FORMATI_GELATERIA_DEFAULT — struttura seed', () => {
  it('esporta 3 formati validi con struttura completa', () => {
    expect(FORMATI_GELATERIA_DEFAULT).toHaveLength(3)
    for (const f of FORMATI_GELATERIA_DEFAULT) {
      expect(f.nome).toBeTruthy()
      expect(f.categoria).toBe('Gusto')
      expect(typeof f.baseQtaG).toBe('number')
      expect(f.baseQtaG).toBeGreaterThan(0)
      expect(typeof f.prezzoDefault).toBe('number')
      expect(f.prezzoDefault).toBeGreaterThan(0)
      expect(Array.isArray(f.componenti)).toBe(true)
      expect(Array.isArray(f.alias)).toBe(true)
    }
  })
  it('include Cono, Coppetta, Vaschetta', () => {
    const nomi = FORMATI_GELATERIA_DEFAULT.map(f => f.nome.toLowerCase())
    expect(nomi.some(n => n.includes('cono'))).toBe(true)
    expect(nomi.some(n => n.includes('coppetta'))).toBe(true)
    expect(nomi.some(n => n.includes('vaschetta'))).toBe(true)
  })
})

describe('seedFormatiGelateriaSeMancano — idempotenza', () => {
  // Mock di storage.js: sload/ssave in-memory per non toccare Supabase.
  beforeEach(() => {
    vi.resetModules()
  })

  it('crea 3 formati se l\'org non ne ha', async () => {
    const store = new Map()
    const fakeSload = vi.fn(async () => store.get('formati') || null)
    const fakeSsave = vi.fn(async (key, val) => { store.set('formati', val); return true })
    vi.doMock('../../src/lib/storage.js', () => ({ sload: fakeSload, ssave: fakeSsave }))
    const { seedFormatiGelateriaSeMancano } = await import('../../src/lib/formatiVendita.js')
    const res = await seedFormatiGelateriaSeMancano('org-1')
    expect(res.seeded).toBe(3)
    expect(res.giaPresenti).toBe(0)
    expect(fakeSsave).toHaveBeenCalledOnce()
    expect(store.get('formati')).toHaveLength(3)
    // ID unici
    const ids = store.get('formati').map(f => f.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('non tocca nulla se l\'org ha già almeno un formato', async () => {
    const store = new Map()
    store.set('formati', [{ id: 'fmt-x', nome: 'Custom', prezzoDefault: 5, baseQtaG: 100, componenti: [] }])
    const fakeSload = vi.fn(async () => store.get('formati') || null)
    const fakeSsave = vi.fn(async (key, val) => { store.set('formati', val); return true })
    vi.doMock('../../src/lib/storage.js', () => ({ sload: fakeSload, ssave: fakeSsave }))
    const { seedFormatiGelateriaSeMancano } = await import('../../src/lib/formatiVendita.js')
    const res = await seedFormatiGelateriaSeMancano('org-1')
    expect(res.seeded).toBe(0)
    expect(res.giaPresenti).toBe(1)
    expect(fakeSsave).not.toHaveBeenCalled()
    expect(store.get('formati')).toHaveLength(1) // invariato
  })

  it('senza orgId non fa niente', async () => {
    const fakeSload = vi.fn()
    const fakeSsave = vi.fn()
    vi.doMock('../../src/lib/storage.js', () => ({ sload: fakeSload, ssave: fakeSsave }))
    const { seedFormatiGelateriaSeMancano } = await import('../../src/lib/formatiVendita.js')
    const res = await seedFormatiGelateriaSeMancano(null)
    expect(res.seeded).toBe(0)
    expect(fakeSload).not.toHaveBeenCalled()
    expect(fakeSsave).not.toHaveBeenCalled()
  })
})

describe('riconciliaFormati — FIX: categoria case-insensitive (grammi prodotti non persi)', () => {
  it('formato "Gelato" + ricetta "gelato" riconciliano i grammi prodotti', () => {
    const ingCosti = buildIngCosti(ic({ latte_y: 1.0 }))
    const formati = [{ id: 'f1', nome: 'Vaschetta 500', categoria: 'Gelato', baseQtaG: 500,
      componenti: [{ nome: 'vaschetta', qta: 1, costo: 0.2 }] }]
    const ricettario = { ricette: {
      FIORDILATTE: { nome: 'FIORDILATTE', categoria: 'gelato', tipo: 'fetta', unita: 1, prezzo: 0,
        ingredienti: [{ nome: 'latte_y', qty1stampo: 1000 }] },
    } }
    const sessione = { prodotti: [{ nome: 'FIORDILATTE', stampi: 2 }] } // 2 * 1000g = 2000g prodotti
    const venduto = [{ nome: 'Vaschetta 500', qta: 4, totale: 20 }]     // 4 * 500g = 2000g venduti

    const { righe, categorie } = riconciliaFormati(venduto, formati, sessione, ricettario, ingCosti)

    expect(righe).toHaveLength(1)
    const cat = categorie.find(c => c.categoria === 'Gelato')
    expect(cat).toBeTruthy()
    expect(cat.gVenduti).toBeCloseTo(2000, 3)
    // col bug case-sensitive gProdotti restava 0 e st diventava null
    expect(cat.gProdotti).toBeCloseTo(2000, 3)
    expect(cat.st).toBeCloseTo(100, 1) // sell-through 100%
  })
})
