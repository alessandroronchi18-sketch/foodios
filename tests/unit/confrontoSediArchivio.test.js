// Il Confronto sedi sui dati di Mara: periodo scelto, incassi, spese comuni.
//
// Trovato il 05/10/2026 rileggendo la pagina sui dati veri (vedi anche
// confrontoSediIncassiComuni.test.js per i conti):
//   1. la lettura delle fatture non chiedeva `sedi_condivise`: le 40 fatture
//      da pagare di Berthollet e De Gasperi insieme (niente `sede_id`)
//      sparivano dalla pagina, e quando si leggevano si dividevano a metà;
//   2. con zero giornate di produzione registrate il food cost valeva zero e
//      il margine «ricavi meno zero» era il 100 % dei ricavi: Mara non
//      compila la produzione giornaliera, e la pagina le avrebbe mostrato un
//      margine netto uguale all'incasso. Un dato che manca non è zero;
//   3. il confronto con un periodo a cui mancano dei giorni direbbe un calo
//      che non c'è: Carlina ha una chiusura ad agosto e 22 a settembre.
import { describe, it, expect, vi } from 'vitest'

const BERT = 'sede-bert', DEGA = 'sede-dega', CARL = 'sede-carl'
let SELEZIONI = []
let FATTURE = []
let RIGHE_PROD = []
let CHIUSURE = []

const SETT = [['01', 1592.2], ['02', 1861.7], ['03', 1830.7], ['04', 2393.3], ['05', 2647.75], ['06', 3070.03], ['07', 1595.75],
  ['08', 1802.4], ['09', 1043.3], ['10', 1566.0], ['11', 2432.2], ['12', 3565.9], ['13', 2797.0], ['14', 1659.05], ['15', 1599.1],
  ['18', 1913.9], ['20', 3034.0], ['21', 1351.7], ['22', 1548.6], ['27', 3153.98], ['29', 1253.9], ['30', 1136.14]]

vi.mock('../../src/lib/storage', () => ({ sload: async () => null, ssave: async () => {} }))
vi.mock('../../src/lib/chiusure', () => ({ caricaChiusure: async () => CHIUSURE }))
vi.mock('../../src/lib/costiAziendali', async (orig) => ({ ...(await orig()), caricaCostiAziendali: async () => [] }))
vi.mock('../../src/lib/venditeB2B', async (orig) => ({ ...(await orig()), venditeB2BPeriodo: async () => [] }))
vi.mock('../../src/lib/inventarioProduzione', async (orig) => ({ ...(await orig()), fetchAllInventarioProduzione: async () => [] }))

const { caricaConfrontoSedi } = await import('../../src/lib/confrontoSediArchivio.js')

const supabase = {
  from: (tabella) => {
    const q = new Proxy({}, {
      get(_t, p) {
        if (p === 'select') return (cols) => { SELEZIONI.push([tabella, cols]); return q }
        if (p === 'then') {
          const data = tabella === 'fatture' ? FATTURE : tabella === 'inventario_produzione' ? RIGHE_PROD : []
          return (ok, ko) => Promise.resolve({ data, error: null }).then(ok, ko)
        }
        return () => q
      },
    })
    return q
  },
}

const sedi = [{ id: CARL, nome: 'Carlina' }, { id: BERT, nome: 'Berthollet' }, { id: DEGA, nome: 'De Gasperi' }]
const giro = async (extra = {}) => {
  SELEZIONI = []
  return caricaConfrontoSedi({ supabase, orgId: 'o', sedi, da: '2026-09-01', a: '2026-09-30',
    confronto: { from: '2026-08-02', to: '2026-08-31' }, oggi: '2026-10-05', ...extra })
}

describe('Confronto sedi: i dati', () => {
  CHIUSURE = [
    { sede_id: CARL, data: '2026-08-06', kpi: { totV: 1605.7 } },
    ...SETT.map(([g, t]) => ({ sede_id: CARL, data: `2026-09-${g}`, kpi: { totV: t } })),
  ]
  FATTURE = [
    { id: 'f1', sede_id: null, sedi_condivise: [BERT, DEGA], stato: 'da_pagare', totale: 1000, importo_pagato: 0, data_fattura: '2026-08-10', data_scadenza: null },
    { id: 'f2', sede_id: CARL, sedi_condivise: null, stato: 'da_pagare', totale: 500, importo_pagato: 0, data_fattura: '2026-08-11', data_scadenza: null },
  ]
  RIGHE_PROD = [
    { sede_id: BERT, data: '2026-08-15', produzione_g: 30000 },
    { sede_id: DEGA, data: '2026-08-16', produzione_g: 10000 },
  ]

  it('chiede la colonna sedi_condivise delle fatture (senza, le spese comuni sparivano)', async () => {
    await giro()
    const lettura = SELEZIONI.find(([t]) => t === 'fatture')
    expect(lettura[1]).toMatch(/sedi_condivise/)
  })

  it('divide le spese comuni sui chili del mese della fattura: 750 € e 250 €, non 500 e 500', async () => {
    const { kpiMap } = await giro()
    expect(kpiMap[BERT].fattureComuni).toBeCloseTo(750)
    expect(kpiMap[DEGA].fattureComuni).toBeCloseTo(250)
    expect(kpiMap[BERT].fattureComuniStimate).toBe(false)
    expect(kpiMap[CARL].fattureImporto).toBe(500)
    // Nessuna fattura persa: le sedi sommano quello che si deve.
    const somma = sedi.reduce((t, s) => t + kpiMap[s.id].fattureImporto, 0)
    expect(somma).toBeCloseTo(1500)
  })

  it('senza produzione nel mese della fattura divide a metà e lo dichiara', async () => {
    const prima = RIGHE_PROD; RIGHE_PROD = []
    const { kpiMap } = await giro()
    RIGHE_PROD = prima
    expect(kpiMap[BERT].fattureComuni).toBeCloseTo(500)
    expect(kpiMap[BERT].fattureComuniStimate).toBe(true)
  })

  it('Carlina a settembre: 22 giorni di cassa, 8 senza dati, importo senza IVA come nel Mese', async () => {
    const { kpiMap } = await giro()
    const k = kpiMap[CARL]
    expect(k.incasso.giorni).toBe(22)
    expect(k.incasso.scoperti).toBe(8)
    expect(k.ricaviCur).toBeCloseTo(40771.45, 1)
    expect(kpiMap[BERT].ricaviCur).toBeNull()
  })

  it('il confronto con agosto (1 giorno di cassa) non si fa: direbbe un calo che non c\'è', async () => {
    const { kpiMap } = await giro()
    expect(kpiMap[CARL].confrontabile).toBe(false)
    expect(kpiMap[CARL].ricaviPrev).toBeNull()
  })

  it('senza produzione giornaliera il margine non c\'è (non è il 100 % dei ricavi)', async () => {
    const { kpiMap } = await giro()
    expect(kpiMap[CARL].giornateConDato).toBe(0)
    expect(kpiMap[CARL].foodCostPct).toBeNull()
    expect(kpiMap[CARL].margineNettoCur).toBeNull()
  })

  it('l\'andamento è di 8 settimane e dove nessuno ha dati dice null', async () => {
    const { andamento } = await giro()
    expect(andamento).toHaveLength(8)
    expect(andamento[7].lunIso).toBe('2026-09-28')
    expect(andamento.some(w => w.ricavi == null)).toBe(true)
  })

  it('senza confronto scelto non calcola il periodo prima', async () => {
    const { kpiMap } = await giro({ confronto: null })
    expect(kpiMap[CARL].incassoPrima).toBeNull()
    expect(kpiMap[CARL].confrontabile).toBe(false)
  })
})
