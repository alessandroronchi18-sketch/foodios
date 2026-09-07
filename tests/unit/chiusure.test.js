// Chiusure di cassa: travaso dal blob jsonb alla tabella chiusure_cassa.
//
// Il vincolo che questi test difendono: il modulo deve restituire ESATTAMENTE
// la forma che i sei consumatori si aspettavano dal blob ({ id, data, kpi,
// venduto, formati }). Se cambia la forma, P&L, Quadratura, Export
// contabilita', Integrazioni e Benchmark si rompono in silenzio.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()
const fromMock = vi.fn()

vi.mock('../../src/lib/supabase', () => ({
  supabase: { from: (...a) => fromMock(...a), rpc: (...a) => rpcMock(...a) },
}))

import {
  caricaChiusure, salvaChiusure, kpiPeriodo,
  foodcostNoto, importaChiusureIncassi,
} from '../../src/lib/chiusure'

const ORG = 'org-1'
const SEDE = 'sede-1'

function chainSelect(rows) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    not: vi.fn(() => chain),
    order: vi.fn(async () => ({ data: rows, error: null })),
    upsert: vi.fn(async () => ({ error: null })),
    delete: vi.fn(() => chain),
    then: (cb) => Promise.resolve({ error: null }).then(cb),
  }
  fromMock.mockReturnValue(chain)
  return chain
}

const RIGA_DB = {
  id: 'uuid-1',
  data: '2026-06-19',
  tot_venduto: '660.00', tot_foodcost: '191.00', tot_margine: '469.00',
  tot_scarti: '17.00', margine_pct: '0.00', scontrino_medio: '0.9220',
  venduto: [{ nome: 'TORTA CAROTE', qta: 2, totale: 8.34, prezzoUnit: 4.17 }],
  formati: [],
  extra: { note: 'giornata di prova' },
  is_demo: true,
  legacy_id: 'demo-ch-2026-06-19',
}

beforeEach(() => { fromMock.mockReset(); rpcMock.mockReset() })

describe('forma dei dati restituita', () => {
  it('ricostruisce la stessa struttura che aveva il blob', async () => {
    chainSelect([RIGA_DB])
    const [c] = await caricaChiusure(ORG, SEDE)

    expect(c.id).toBe('demo-ch-2026-06-19')   // l'id originale, non l'uuid
    expect(c.data).toBe('2026-06-19')
    expect(c.kpi).toMatchObject({
      totV: 660, totFC: 191, totM: 469, totS: 17, totMP: 0, avgST: 0.922,
    })
    expect(c.venduto).toHaveLength(1)
    expect(c.formati).toEqual([])
    expect(c._demo).toBe(true)
  })

  it('i KPI sono numeri, non stringhe: il P&L ci fa la somma', async () => {
    chainSelect([RIGA_DB])
    const [c] = await caricaChiusure(ORG, SEDE)
    expect(typeof c.kpi.totV).toBe('number')
    expect(c.kpi.totV + c.kpi.totFC).toBe(851)
  })

  it('i campi non previsti dallo schema sopravvivono al giro', async () => {
    chainSelect([RIGA_DB])
    const [c] = await caricaChiusure(ORG, SEDE)
    expect(c.note).toBe('giornata di prova')
  })

  it('scontrino medio assente diventa 0, non NaN', async () => {
    chainSelect([{ ...RIGA_DB, scontrino_medio: null }])
    const [c] = await caricaChiusure(ORG, SEDE)
    expect(c.kpi.avgST).toBe(0)
  })
})

describe('filtro per intervallo', () => {
  it('applica gli estremi quando richiesti', async () => {
    const chain = chainSelect([])
    await caricaChiusure(ORG, SEDE, { from: '2026-06-01', to: '2026-06-30' })
    expect(chain.gte).toHaveBeenCalledWith('data', '2026-06-01')
    expect(chain.lte).toHaveBeenCalledWith('data', '2026-06-30')
  })

  it('senza intervallo non filtra: comportamento identico a prima', async () => {
    const chain = chainSelect([])
    await caricaChiusure(ORG, SEDE)
    expect(chain.gte).not.toHaveBeenCalled()
    expect(chain.lte).not.toHaveBeenCalled()
  })

  it('tutteLeSedi non vincola la sede', async () => {
    const chain = chainSelect([])
    await caricaChiusure(ORG, SEDE, { tutteLeSedi: true })
    expect(chain.eq).toHaveBeenCalledWith('organization_id', ORG)
    expect(chain.eq).not.toHaveBeenCalledWith('sede_id', SEDE)
  })
})

describe('salvataggio', () => {
  it('converte i KPI nelle colonne giuste', async () => {
    const chain = chainSelect([])
    await salvaChiusure(ORG, SEDE, [{
      id: 'ch-1', data: '2026-06-19',
      kpi: { totV: 660, totFC: 191, totM: 469, totS: 17, totMP: 0, avgST: 0.92 },
      venduto: [], formati: [],
    }])

    const [righe] = chain.upsert.mock.calls[0]
    expect(righe[0]).toMatchObject({
      organization_id: ORG, sede_id: SEDE, data: '2026-06-19',
      tot_venduto: 660, tot_foodcost: 191, legacy_id: 'ch-1',
    })
  })

  it('mette in extra i campi fuori schema, così non si perdono', async () => {
    const chain = chainSelect([])
    await salvaChiusure(ORG, SEDE, [{
      id: 'ch-1', data: '2026-06-19', kpi: {}, venduto: [], formati: [],
      campoNuovo: 'valore',
    }])
    expect(chain.upsert.mock.calls[0][0][0].extra).toEqual({ campoNuovo: 'valore' })
  })

  it('scarta le voci senza data invece di scrivere righe non collocabili', async () => {
    const chain = chainSelect([])
    await salvaChiusure(ORG, SEDE, [
      { id: 'a', data: '2026-06-19', kpi: {} },
      { id: 'b', kpi: {} },
    ])
    expect(chain.upsert.mock.calls[0][0]).toHaveLength(1)
  })

  it('con elenco vuoto non fa upsert ma cancella comunque il residuo', async () => {
    const chain = chainSelect([])
    await salvaChiusure(ORG, SEDE, [])
    expect(chain.upsert).not.toHaveBeenCalled()
    expect(chain.delete).toHaveBeenCalled()
  })

  it('senza orgId si rifiuta di scrivere', async () => {
    await expect(salvaChiusure(null, SEDE, [])).rejects.toThrow(/orgId/)
  })
})

describe('aggregazione lato database', () => {
  it('somma il periodo senza scaricare le righe', async () => {
    rpcMock.mockResolvedValue({ data: [{ ricavi: '45856.00', foodcost: '12479.82', margine: '1', scarti: '2', giorni: '79' }], error: null })
    const k = await kpiPeriodo(ORG, [SEDE], '2026-01-01', '2026-12-31')
    expect(k.ricavi).toBe(45856)
    expect(k.giorni).toBe(79)
  })

  it('senza estremi non chiama il database', async () => {
    const k = await kpiPeriodo(ORG, null, null, null)
    expect(rpcMock).not.toHaveBeenCalled()
    expect(k.giorni).toBe(0)
  })
})

// ── Il food cost che non sappiamo ───────────────────────────────────────────
//
// Da quando la chiusura col solo totale e' il modo rapido di registrare la
// cassa, molte giornate hanno l'incasso ma non il costo delle materie. Questi
// test difendono la distinzione: chi legge deve poter sapere se il food cost
// e' zero perche' misurato o zero perche' ignoto.

describe('foodcostNoto', () => {
  it('crede al flag scritto al salvataggio', () => {
    expect(foodcostNoto({ foodcost_noto: true, solo_totale: true })).toBe(true)
    expect(foodcostNoto({ foodcost_noto: false })).toBe(false)
  })

  it('una chiusura col solo totale non ha food cost', () => {
    expect(foodcostNoto({ solo_totale: true })).toBe(false)
  })

  it('una chiusura col dettaglio prodotti ce l\'ha', () => {
    // Le chiusure storiche non hanno nessuno dei due campi: sono nate dal
    // dettaglio dello scontrino, quindi il food cost era calcolato.
    expect(foodcostNoto({ data: '2026-06-19', kpi: { totFC: 191 } })).toBe(true)
    expect(foodcostNoto({})).toBe(true)
  })

  it('su input vuoto non esplode', () => {
    expect(foodcostNoto(null)).toBe(true)
    expect(foodcostNoto(undefined)).toBe(true)
  })
})

describe('importaChiusureIncassi', () => {
  const RIGHE = [
    { data: '2026-07-01', totale: 1076.4, pos: 788.1, contanti: 288.3, delivery: 70 },
    { data: '2026-07-02', totale: 900, pos: 700, contanti: 200, delivery: null },
  ]

  it('scrive i canali e marca come non noto il costo delle materie', async () => {
    const c = chainSelect([])                  // nessuna giornata già presente
    const esito = await importaChiusureIncassi(ORG, SEDE, RIGHE)

    expect(esito).toEqual({ nuove: 2, aggiornate: 0 })
    const [righe, opts] = c.upsert.mock.calls[0]
    expect(opts).toEqual({ onConflict: 'organization_id,sede_id,data' })
    expect(righe).toHaveLength(2)
    expect(righe[0]).toMatchObject({
      organization_id: ORG, sede_id: SEDE, data: '2026-07-01',
      tot_venduto: 1076.4, tot_foodcost: 0,
      incasso_pos: 788.1, incasso_contanti: 288.3, incasso_delivery: 70,
    })
    // Il registro non dice quanto e' costata la merce: la giornata resta
    // marcata, altrimenti il P&L la conterebbe come margine pieno.
    expect(righe[0].extra).toMatchObject({ solo_totale: true, foodcost_noto: false, fonte_incassi: 'registro' })
  })

  it('non butta via il dettaglio prodotti di una giornata già chiusa', async () => {
    // Il registro sa quanto e' entrato, non cosa e' stato venduto: se qualcuno
    // aveva inserito lo scontrino, quel lavoro vale più del foglio.
    const c = chainSelect([{
      ...RIGA_DB, data: '2026-07-01',
      tot_venduto: '1000.00', tot_foodcost: '300.00', margine_pct: '70.00',
      extra: { solo_totale: false, foodcost_noto: true },
      is_demo: false, legacy_id: null,
    }])
    const esito = await importaChiusureIncassi(ORG, SEDE, [RIGHE[0]])

    expect(esito).toEqual({ nuove: 0, aggiornate: 1 })
    const riga = c.upsert.mock.calls[0][0][0]
    expect(riga.venduto).toHaveLength(1)               // il dettaglio resta
    expect(riga.tot_foodcost).toBe(300)                // e anche il food cost
    expect(riga.tot_venduto).toBe(1076.4)              // ma i soldi li dà il registro
    expect(riga.tot_margine).toBe(776.4)               // ricalcolato, non ereditato
    expect(riga.extra).toMatchObject({ foodcost_noto: true })
  })

  it('un canale che il foglio non dice non cancella quello che sapevamo', async () => {
    const c = chainSelect([{
      ...RIGA_DB, data: '2026-07-02',
      incasso_delivery: '45.00', extra: {}, is_demo: false, legacy_id: null,
    }])
    await importaChiusureIncassi(ORG, SEDE, [RIGHE[1]])   // delivery: null
    expect(c.upsert.mock.calls[0][0][0].incasso_delivery).toBe(45)
  })

  it('scarta le giornate senza data o senza incasso', async () => {
    const c = chainSelect([])
    const esito = await importaChiusureIncassi(ORG, SEDE, [
      { data: '2026-07-01', totale: 100 },
      { data: null, totale: 100 },
      { data: '2026-07-03', totale: 0 },
    ])
    expect(esito).toEqual({ nuove: 1, aggiornate: 0 })
    expect(c.upsert.mock.calls[0][0]).toHaveLength(1)
  })

  it('senza righe utili non tocca il database', async () => {
    expect(await importaChiusureIncassi(ORG, SEDE, [])).toEqual({ nuove: 0, aggiornate: 0 })
    expect(fromMock).not.toHaveBeenCalled()
    await expect(importaChiusureIncassi(null, SEDE, RIGHE)).rejects.toThrow(/orgId/)
  })

  it('non cancella le giornate fuori dal mese importato', async () => {
    // È la differenza con salvaChiusure, che riceve l'elenco completo e
    // cancella quello che non c'è. Un'importazione parla solo del suo mese.
    const c = chainSelect([])
    await importaChiusureIncassi(ORG, SEDE, RIGHE)
    expect(c.delete).not.toHaveBeenCalled()
  })
})
