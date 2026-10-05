// Gli incassi del Mese: la cassa dove c'è, la stima dall'inventario dove manca.
//
// Il difetto, 05/10/2026. Caricate in Foodos 40 chiusure di cassa vere di
// Carlina, trascritte dalle foto (18 giorni d'agosto, 22 di settembre). Il
// Mese sceglieva la cassa appena ce n'era un giorno (`incassiDelMese`), anche
// per tutta l'azienda: gli incassi d'agosto scendevano da 124.553 € (stima
// dall'inventario delle tre sedi) a 28.490 € (una sede, 18 giorni), contro le
// spese di tre sedi per un mese intero. La pagina mostrava una perdita di
// circa 22.000 € che non esisteva. Le chiusure sono state tolte subito e
// ricaricate dopo questa correzione.
//
// E due difetti trovati intorno, nello stesso giro:
// - `caricaChiusure(…, { tutteLeSedi: true })` non leggeva la sede: chi
//   divideva per sede (`c.sede_id`) non scartava mai niente, e nella vista di
//   una sede entravano le chiusure di tutte;
// - a ogni mese passavano le vendite all'ingrosso di tutti i 13 mesi letti, e
//   la stima del mese ne toglieva troppe.
//
// Le regole: in ogni sede i giorni con la cassa valgono la cassa, gli altri la
// stima sui tratti di giorni consecutivi (le rimanenze a 0 si compensano sul
// tratto); i giorni senza nessuno dei due restano scoperti, e con giorni
// scoperti l'utile non si dà.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const FORMATI = [{ id: 'f1', nome: 'Coppetta', categoria: 'Gelato', baseQtaG: 100, prezzoDefault: 3, componenti: [] }] // 30 €/kg
let RIGHE = []
let CHIUSURE = []
let VENDITE = []

vi.mock('../../src/lib/supabase', () => {
  const h = { get(_t, p) { if (p === 'then') return (r) => r({ data: [], error: null }); return () => new Proxy({}, h) } }
  return { supabase: { from: () => new Proxy({}, h), rpc: async () => ({ data: null, error: null }) } }
})
vi.mock('../../src/lib/storage', () => ({ sload: async () => FORMATI, ssave: async () => {} }))
vi.mock('../../src/lib/chiusure', () => ({ caricaChiusure: async () => CHIUSURE }))
vi.mock('../../src/lib/costiAziendali', async (orig) => ({ ...(await orig()), caricaCostiAziendali: async () => [] }))
vi.mock('../../src/lib/contoEconomicoArchivio', async (orig) => ({
  ...(await orig()),
  leggiFatturePeriodo: async () => ({ fatture: [] }),
  leggiCategorieFornitori: async () => ({ fornitori: [], categoriePerFornitore: {} }),
}))
vi.mock('../../src/lib/venditeB2B', async (orig) => ({ ...(await orig()), venditeB2BPeriodo: async () => VENDITE }))
vi.mock('../../src/lib/inventarioProduzione', async (orig) => ({
  ...(await orig()),
  fetchAllInventarioProduzione: async (_o, { sedeIds, dataFrom, dataTo }) =>
    RIGHE.filter(r => [].concat(sedeIds).includes(r.sede_id) && (!dataFrom || r.data >= dataFrom) && (!dataTo || r.data <= dataTo)),
}))

const { caricaIlMese, incassiSedeDelMese } = await import('../../src/lib/ilMeseArchivio.js')
const { incassiDaSedi, contoDelMese, motivoSenzaUtile, incassiDelMese } = await import('../../src/lib/ilMese.js')
const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const supabaseFinto = { from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) }
const SEDI = [{ id: 'A', nome: 'Carlina', attiva: true }, { id: 'B', nome: 'Berthollet', attiva: true }]
const riga = (sede, data, produzione_g, rimanenza_g) => ({ sede_id: sede, gusto_nome: 'NOCCIOLA', data, produzione_g, rimanenza_g, scarto_g: 0, spedito_g: 0, ricevuto_g: 0 })
const giorno = (n) => `2026-08-${String(n).padStart(2, '0')}`
// Ogni giorno si producono i chili e la vetrina resta uguale: il venduto del
// giorno è la produzione. A: 5 kg = 150 € al giorno; B: 2 kg = 60 €.
function inventario({ fino = 31 } = {}) {
  const out = [riga('A', '2026-07-31', 0, 1000), riga('B', '2026-07-31', 0, 400)]
  for (let g = 1; g <= fino; g++) { out.push(riga('A', giorno(g), 5000, 1000)); out.push(riga('B', giorno(g), 2000, 400)) }
  return out
}
const chiusura = (sede, data, totV) => ({ id: `ch-${data}`, data, sede_id: sede, kpi: { totV } })

beforeEach(() => { RIGHE = inventario(); CHIUSURE = []; VENDITE = [] })

describe('incassiSedeDelMese: una sede, cassa e stima', () => {
  const daA = () => RIGHE.filter(r => r.sede_id === 'A')

  it('senza cassa è tutta stima: 31 giorni × 150 €', () => {
    const p = incassiSedeDelMese({ chiusure: [], righe: daA(), formati: FORMATI, da: giorno(1), a: giorno(31) })
    expect(p.cassa).toEqual({ totV: 0, giorni: 0 })
    expect(p.stima.giorni).toBe(31)
    expect(p.stima.ricavi).toBeCloseTo(4650, 2)
    expect(p.scoperti).toBe(0)
  })

  it('con 3 giorni di cassa: la cassa per quelli, la stima sugli altri 28', () => {
    const ch = [10, 11, 12].map(g => chiusura('A', giorno(g), 200))
    const p = incassiSedeDelMese({ chiusure: ch, righe: daA(), formati: FORMATI, da: giorno(1), a: giorno(31) })
    expect(p.cassa).toEqual({ totV: 600, giorni: 3 })
    expect(p.stima.giorni).toBe(28)
    expect(p.stima.ricavi).toBeCloseTo(28 * 150, 2)
    expect(p.scoperti).toBe(0)
  })

  it('con la cassa tutti i giorni la stima non c\'è', () => {
    const ch = Array.from({ length: 31 }, (_, i) => chiusura('A', giorno(i + 1), 100))
    const p = incassiSedeDelMese({ chiusure: ch, righe: daA(), formati: FORMATI, da: giorno(1), a: giorno(31) })
    expect(p.cassa).toEqual({ totV: 3100, giorni: 31 })
    expect(p.stima.ricavi).toBeNull()
    expect(p.scoperti).toBe(0)
  })

  it('l\'inventario che finisce il 20: i giorni dopo senza cassa sono scoperti', () => {
    RIGHE = inventario({ fino: 20 })
    const ch = [25, 26].map(g => chiusura('A', giorno(g), 200))
    const p = incassiSedeDelMese({ chiusure: ch, righe: daA(), formati: FORMATI, da: giorno(1), a: giorno(31) })
    expect(p.stima.giorni).toBe(20)
    expect(p.cassa.giorni).toBe(2)
    expect(p.scoperti).toBe(9) // 21-24 e 27-31
  })

  it('senza inventario letto, ogni giorno senza cassa è scoperto', () => {
    const p = incassiSedeDelMese({ chiusure: [chiusura('A', giorno(5), 200)], righe: null, formati: FORMATI, da: giorno(1), a: giorno(31) })
    expect(p.scoperti).toBe(30)
    expect(p.stima.ricavi).toBeNull()
  })

  it('le chiusure fuori dal tratto o a zero non contano', () => {
    const ch = [chiusura('A', '2026-07-31', 999), chiusura('A', giorno(3), 0), chiusura('A', giorno(4), 200)]
    const p = incassiSedeDelMese({ chiusure: ch, righe: daA(), formati: FORMATI, da: giorno(1), a: giorno(31) })
    expect(p.cassa).toEqual({ totV: 200, giorni: 1 })
  })

  it('le vendite all\'ingrosso si tolgono solo dal tratto in cui cadono', () => {
    // Una vendita all'ingrosso a luglio non deve toccare la stima d'agosto:
    // prima a ogni mese arrivavano le vendite di tutti i 13 mesi letti.
    const luglio = [{ data: '2026-07-15', sede_id: 'A', stato: 'confermata', righe: [{ prodotto: 'NOCCIOLA', qta: 10, unita: 'kg', prezzo: 20 }], totale: 200 }]
    const senza = incassiSedeDelMese({ chiusure: [], righe: daA(), formati: FORMATI, da: giorno(1), a: giorno(31), venditeB2B: [] })
    const con = incassiSedeDelMese({ chiusure: [], righe: daA(), formati: FORMATI, da: giorno(1), a: giorno(31), venditeB2B: luglio })
    expect(con.stima.ricavi).toBeCloseTo(senza.stima.ricavi, 2)
  })
})

describe('incassiDaSedi: le sedi insieme', () => {
  const parte = (nome, cassa, stima, giorniStima, scoperti = 0) => ({ nome, cassa: { totV: cassa, giorni: cassa ? 18 : 0 }, stima: { ricavi: stima, giorni: giorniStima }, scoperti })

  it('riproduce il 05/10: la cassa di una sede non cancella la stima delle altre', () => {
    // Agosto con i numeri veri: Carlina 18 giorni di cassa (31.339,41 €) e 13
    // stimati; Berthollet e De Gasperi solo stima. Prima: solo i 31.339,41.
    const i = incassiDaSedi([parte('Carlina', 31339.41, 15000, 13), parte('Berthollet', 0, 35000, 31), parte('De Gasperi', 0, 40000, 31)])
    expect(i.lordo).toBeCloseTo(121339.41, 2)
    expect(i.fonte).toBe('misto')
    expect(i.completo).toBe(true)
    expect(i.testo).toMatch(/Carlina: 18 giorni dalla cassa, 13 stimati dall'inventario/)
    expect(i.testo).toMatch(/Berthollet: stimati dall'inventario/)
    // E il vecchio calcolo, per memoria, dava solo la cassa.
    expect(incassiDelMese({ cassa: { totV: 31339.41, giorni: 18 }, stima: { ricavi: 121339.41 }, giorniDelMese: 31 }).lordo).toBeCloseTo(31339.41, 2)
  })

  it('solo cassa → «cassa»; solo stima → «stima»; niente → null', () => {
    expect(incassiDaSedi([{ cassa: { totV: 500, giorni: 31 }, stima: { ricavi: null, giorni: 0 }, scoperti: 0 }]).fonte).toBe('cassa')
    expect(incassiDaSedi([{ cassa: { totV: 0, giorni: 0 }, stima: { ricavi: 500, giorni: 31 }, scoperti: 0 }]).fonte).toBe('stima')
    const niente = incassiDaSedi([{ cassa: { totV: 0, giorni: 0 }, stima: { ricavi: null, giorni: 0 }, scoperti: 31, motivo: 'nessun dato di inventario nel periodo' }])
    expect(niente.valore).toBeNull()
    expect(niente.testo).toMatch(/nessun dato di inventario/)
  })

  it('con giorni scoperti è parziale e lo dice', () => {
    const i = incassiDaSedi([{ nome: 'Carlina', cassa: { totV: 44848.6, giorni: 22 }, stima: { ricavi: null, giorni: 0 }, scoperti: 8 }])
    expect(i.parziale).toBe(true)
    expect(i.completo).toBe(false)
    expect(i.testo).toMatch(/22 giorni dalla cassa, 8 giorni senza dati/)
  })

  it('il valore è senza IVA (10%)', () => {
    expect(incassiDaSedi([{ cassa: { totV: 1100, giorni: 1 }, stima: { ricavi: null, giorni: 0 }, scoperti: 0 }]).valore).toBeCloseTo(1000, 2)
  })
})

describe('contoDelMese: con giorni scoperti l\'utile non si dà', () => {
  const costi = { perCategoria: [{ id: 'materie-prime', importo: 500, fornitori: [] }], investimenti: { importo: 0 }, daClassificare: { importo: 0, nFornitori: 0, nFatture: 0 }, copertura: {} }
  const personale = { valore: 200, stato: 'ok' }

  it('incassi completi: utile e «prima del personale»', () => {
    const c = contoDelMese({ incassi: { valore: 1000, fonte: 'misto', completo: true }, costi, personale })
    expect(c.utile).toBe(300)
    expect(c.primaDelPersonale).toBe(500)
    expect(c.stimato).toBe(true) // misto vuol dire in parte stimato
  })

  it('incassi a cui mancano dei giorni: né utile né «prima del personale», e il perché', () => {
    const c = contoDelMese({ incassi: { valore: 1000, fonte: 'cassa', completo: false }, costi, personale })
    expect(c.utile).toBeNull()
    expect(c.primaDelPersonale).toBeNull()
    expect(c.ricavi).toBe(1000) // si mostrano, non si sottraggono
    expect(motivoSenzaUtile(c, { personale, costi })).toMatch(/incassi di alcuni giorni/)
  })

  it('il conto di prima (senza «completo») resta com\'era', () => {
    const c = contoDelMese({ incassi: { valore: 1000, fonte: 'stima' }, costi, personale })
    expect(c.utile).toBe(300)
  })
})

describe('caricaIlMese: il percorso intero', () => {
  it('3 giorni di cassa a Carlina: l\'azienda somma cassa, stima di Carlina e stima di Berthollet', async () => {
    CHIUSURE = [10, 11, 12].map(g => chiusura('A', giorno(g), 200))
    const d = await caricaIlMese({ supabase: supabaseFinto, orgId: 'o1', sedi: SEDI, mese: '2026-08', sedeId: null })
    // A: 600 + 28 × 150 = 4.800; B: 31 × 60 = 1.860.
    expect(d.attuale.incassi.lordo).toBeCloseTo(6660, 2)
    expect(d.attuale.incassi.fonte).toBe('misto')
    expect(d.attuale.incassi.completo).toBe(true)
  })

  it('la vista di Berthollet non prende le chiusure di Carlina', async () => {
    CHIUSURE = [10, 11, 12].map(g => chiusura('A', giorno(g), 200))
    const d = await caricaIlMese({ supabase: supabaseFinto, orgId: 'o1', sedi: SEDI, mese: '2026-08', sedeId: 'B' })
    expect(d.attuale.incassi.lordo).toBeCloseTo(1860, 2)
    expect(d.attuale.incassi.fonte).toBe('stima')
  })

  it('la vista di Carlina: cassa e stima solo sue', async () => {
    CHIUSURE = [10, 11, 12].map(g => chiusura('A', giorno(g), 200))
    const d = await caricaIlMese({ supabase: supabaseFinto, orgId: 'o1', sedi: SEDI, mese: '2026-08', sedeId: 'A' })
    expect(d.attuale.incassi.lordo).toBeCloseTo(4800, 2)
  })

  it('settembre senza inventario: la cassa di Carlina c\'è, ma Berthollet è scoperta e l\'utile non si dà', async () => {
    CHIUSURE = [1, 2, 3].map(g => chiusura('A', `2026-09-0${g}`, 200))
    const d = await caricaIlMese({ supabase: supabaseFinto, orgId: 'o1', sedi: SEDI, mese: '2026-09', sedeId: null })
    expect(d.attuale.incassi.completo).toBe(false)
    expect(d.attuale.conto.utile).toBeNull()
    expect(d.attuale.conto.primaDelPersonale).toBeNull()
  })
})

describe('le chiusure di tutte le sedi portano la sede', () => {
  it('caricaChiusure con tutteLeSedi legge sede_id e lo attacca', () => {
    const s = readFileSync(join(RADICE, 'src', 'lib', 'chiusure.js'), 'utf8')
    expect(s).toMatch(/select\(tutteLeSedi \? `sede_id, \$\{COLONNE\}` : COLONNE\)/)
    expect(s).toMatch(/sede_id: r\.sede_id \?\? null/)
  })
})

describe('il Mese si apre sull\'ultimo mese COMPLETO', () => {
  it('un mese con incassi a cui mancano dei giorni non è il primo da mostrare', async () => {
    const { primoMeseDaMostrare } = await import('../../src/components/analisi/MeseAnalisi.jsx')
    const dati = {
      attuale: { incassi: { fonte: 'cassa', completo: false } },
      andamento: [
        { mese: '2026-07', incassi: { fonte: 'stima', completo: true } },
        { mese: '2026-08', incassi: { fonte: 'misto', completo: true } },
        { mese: '2026-09', incassi: { fonte: 'cassa', completo: false } },
      ],
    }
    expect(primoMeseDaMostrare(dati, '2026-09')).toBe('2026-08')
    // Senza «completo» (dati di prima) vale come prima: basta la fonte.
    expect(primoMeseDaMostrare({ attuale: { incassi: { fonte: 'stima' } } }, '2026-09')).toBe('2026-09')
  })
})
