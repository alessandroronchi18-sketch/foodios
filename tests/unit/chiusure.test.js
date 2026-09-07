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

import { caricaChiusure, salvaChiusure, kpiPeriodo } from '../../src/lib/chiusure'

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
  tot_scarti: '17.00', tot_materie: '0.00', scontrino_medio: '0.9220',
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
    expect(c.kpi).toEqual({
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
