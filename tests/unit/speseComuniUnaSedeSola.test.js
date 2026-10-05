// Le spese comuni a due sedi, guardando il Mese di una sede sola.
//
// Trovato il 05/10/2026, controllando le pagine dopo aver caricato le
// fatture d'acquisto riscaricate da Fattura SMART (regola «controlla sempre
// che tutto giri e torni»). Le fatture dell'account Marama sono di Berthollet
// E De Gasperi insieme (`sedi_condivise`), e si dividono sui chili prodotti
// (scelta del titolare, 17/09). Ad agosto il Mese di Berthollet mostrava
// 22.520 € di spese comuni, e il Mese di De Gasperi anche: 22.520 €. Ognuna le
// contava per intero, e la somma delle sedi (73.017 €) superava le spese di
// tutta l'azienda (50.497 €).
//
// Perché: con una sede scelta, `caricaIlMese` leggeva l'inventario solo di
// quella sede. Per la divisione De Gasperi aveva quindi zero chili, e la
// regola «in proporzione ai chili» dava il 100 % a chi si stava guardando. A
// settembre non si vedeva perché l'inventario non c'era per nessuna delle
// due, e la divisione andava in parti uguali.
//
// Il Conto economico era giusto: leggeva i chili di tutte le sedi
// (`produzionePerSedeMese`). Ora il Mese usa la stessa funzione.

import { describe, it, expect, vi } from 'vitest'

let FATTURE = []
let RIGHE = []
let PRODUZIONE_ROTTA = false

vi.mock('../../src/lib/supabase', () => {
  const h = { get(_t, p) { if (p === 'then') return (r) => r({ data: [], error: null }); return () => new Proxy({}, h) } }
  return { supabase: { from: () => new Proxy({}, h), rpc: async () => ({ data: null, error: null }) } }
})
vi.mock('../../src/lib/storage', () => ({ sload: async () => [], ssave: async () => {} }))
vi.mock('../../src/lib/chiusure', () => ({ caricaChiusure: async () => [] }))
vi.mock('../../src/lib/costiAziendali', async (orig) => ({ ...(await orig()), caricaCostiAziendali: async () => [] }))
vi.mock('../../src/lib/venditeB2B', async (orig) => ({ ...(await orig()), venditeB2BPeriodo: async () => [] }))
vi.mock('../../src/lib/contoEconomicoArchivio', async (orig) => ({
  ...(await orig()),
  leggiFatturePeriodo: async () => ({ fatture: FATTURE }),
  leggiCategorieFornitori: async () => ({ fornitori: [], categoriePerFornitore: {} }),
}))
// L'inventario della pagina: solo le righe delle sedi chieste, come quello vero.
vi.mock('../../src/lib/inventarioProduzione', async (orig) => ({
  ...(await orig()),
  fetchAllInventarioProduzione: async (_o, { sedeIds }) => RIGHE.filter(r => [].concat(sedeIds).includes(r.sede_id)),
}))

const { caricaIlMese } = await import('../../src/lib/ilMeseArchivio.js')

// Il client che legge `inventario_produzione` per i chili di tutte le sedi
// (`produzionePerSedeMese`, la funzione vera). Restituisce TUTTE le righe:
// è proprio quello che serve alla divisione.
const supabaseFinto = {
  from: (tabella) => {
    const h = {
      get(_t, p) {
        if (p === 'then') {
          return (ok, ko) => (PRODUZIONE_ROTTA && tabella === 'inventario_produzione'
            ? Promise.resolve({ data: null, error: { message: 'rete giù' } })
            : Promise.resolve({ data: tabella === 'inventario_produzione' ? RIGHE : [], error: null })).then(ok, ko)
        }
        return () => new Proxy({}, h)
      },
    }
    return new Proxy({}, h)
  },
}

const SEDI = [
  { id: 'C', nome: 'Carlina', attiva: true },
  { id: 'B', nome: 'Berthollet', attiva: true },
  { id: 'D', nome: 'De Gasperi', attiva: true },
]
const comune = (totale, data = '2026-08-12') => ({ id: 'f' + totale, fornitore: 'RBS SRL', numero_rif: String(totale), data_fattura: data, totale, imponibile: totale, imposta: 0, sede_id: null, sedi_condivise: ['B', 'D'] })
const sua = (sede, totale, data = '2026-08-12') => ({ id: 's' + sede + totale, fornitore: 'DESA SRL', numero_rif: 'S' + totale, data_fattura: data, totale, imponibile: totale, imposta: 0, sede_id: sede })
const prodotto = (sede, kg, data = '2026-08-10') => ({ sede_id: sede, gusto_nome: 'NOCCIOLA', data, produzione_g: kg * 1000, rimanenza_g: 0, scarto_g: 0, spedito_g: 0, ricevuto_g: 0 })

const speseDi = async (sedeId, mese = '2026-08') => {
  const d = await caricaIlMese({ supabase: supabaseFinto, orgId: 'o1', sedi: SEDI, mese, sedeId })
  return { importo: d.attuale.costi.totaleCostiEDaClassificare, ripartizione: d.attuale.costi.ripartizione, errori: d.errori }
}
const imposta = ({ fatture, righe, rotta = false }) => { FATTURE = fatture; RIGHE = righe; PRODUZIONE_ROTTA = rotta }

describe('una spesa comune guardando una sede sola', () => {
  it('il difetto: ognuna delle due sedi la contava per intero (ora 60/40 sui chili)', async () => {
    imposta({ fatture: [comune(1000)], righe: [prodotto('B', 60), prodotto('D', 40)] })
    const b = await speseDi('B')
    const d = await speseDi('D')
    expect(b.importo).toBeCloseTo(600, 6)
    expect(d.importo).toBeCloseTo(400, 6)
    expect(b.ripartizione.criterio).toMatch(/chili/)
  })

  it('le sedi sommate fanno tutta l\'azienda, nemmeno un euro in più', async () => {
    imposta({ fatture: [comune(1000), sua('C', 500)], righe: [prodotto('C', 200), prodotto('B', 60), prodotto('D', 40)] })
    const tutta = await speseDi(null)
    const somma = (await speseDi('C')).importo + (await speseDi('B')).importo + (await speseDi('D')).importo
    expect(tutta.importo).toBeCloseTo(1500, 6)
    expect(somma).toBeCloseTo(tutta.importo, 6)
  })

  it('i chili di una sede che non c\'entra non spostano la divisione', async () => {
    // Carlina produce tantissimo, ma la fattura è di Berthollet e De Gasperi.
    imposta({ fatture: [comune(1000)], righe: [prodotto('C', 5000), prodotto('B', 30), prodotto('D', 70)] })
    expect((await speseDi('B')).importo).toBeCloseTo(300, 6)
    expect((await speseDi('D')).importo).toBeCloseTo(700, 6)
    expect((await speseDi('C')).importo).toBe(0)
  })

  it('i chili del mese della fattura, non quelli di un altro mese', async () => {
    imposta({ fatture: [comune(1000)], righe: [prodotto('B', 90, '2026-07-10'), prodotto('B', 50), prodotto('D', 50)] })
    expect((await speseDi('B')).importo).toBeCloseTo(500, 6)
  })

  it('nessuna produzione nel mese: parti uguali, e si dice che è una stima', async () => {
    imposta({ fatture: [comune(1000, '2026-09-12')], righe: [prodotto('B', 60), prodotto('D', 40)] })
    const b = await speseDi('B', '2026-09')
    expect(b.importo).toBeCloseTo(500, 6)
    expect(b.ripartizione.certa).toBe(false)
  })

  it('se la produzione non si legge: parti uguali e l\'errore detto, mai il 100 % a chi guardi', async () => {
    imposta({ fatture: [comune(1000)], righe: [prodotto('B', 60), prodotto('D', 40)], rotta: true })
    const b = await speseDi('B')
    expect(b.importo).toBeCloseTo(500, 6)
    expect(b.errori.map(e => e.nome).join(' ')).toMatch(/produzione/)
  })

  it('la fattura di una sede sola resta tutta sua', async () => {
    imposta({ fatture: [sua('C', 800)], righe: [prodotto('C', 10), prodotto('B', 60)] })
    expect((await speseDi('C')).importo).toBeCloseTo(800, 6)
    expect((await speseDi('B')).importo).toBe(0)
  })
})
