// trasferimenti — RPC wrappers + helpers (audit 2026-06-17 LOW + 2026-07-01 MED).

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase', () => {
  const fromMock = vi.fn(() => mkChain())
  const rpcMock = vi.fn(async () => ({ data: { ok: true }, error: null }))
  return { supabase: { from: fromMock, rpc: rpcMock } }
})

function mkChain(returnValue = { data: [], error: null }) {
  const chain = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    or: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(async () => returnValue),
    then: (cb) => Promise.resolve(returnValue).then(cb),
  }
  return chain
}

import {
  loadTrasferimenti, getTrasferimento, creaTrasferimento,
  inviaTrasferimento, riceviTrasferimento, annullaTrasferimento,
  STATO_LABEL, TIPO_LABEL, isStatoModificabile,
} from '../../src/lib/trasferimenti'
import { supabase } from '../../src/lib/supabase'

describe('helpers constants', () => {
  it('STATO_LABEL include stati comuni', () => {
    expect(STATO_LABEL.bozza.label).toBe('Bozza')
    expect(STATO_LABEL.inviato.label).toBe('In viaggio')
    expect(STATO_LABEL.ricevuto.label).toBe('Ricevuto')
    expect(STATO_LABEL.completato).toBeDefined() // legacy alias
    expect(STATO_LABEL.annullato.label).toBe('Annullato')
  })

  it('TIPO_LABEL include 3 tipi', () => {
    expect(TIPO_LABEL.prodotto).toBe('Prodotto finito')
    expect(TIPO_LABEL.materia_prima).toBe('Materia prima')
    expect(TIPO_LABEL.semilavorato).toBe('Semilavorato')
  })

  it('isStatoModificabile: bozza/inviato true, altri false', () => {
    expect(isStatoModificabile('bozza')).toBe(true)
    expect(isStatoModificabile('inviato')).toBe(true)
    expect(isStatoModificabile('ricevuto')).toBe(false)
    expect(isStatoModificabile('annullato')).toBe(false)
    expect(isStatoModificabile('completato')).toBe(false)
  })
})

describe('loadTrasferimenti', () => {
  beforeEach(() => { supabase.from.mockClear() })

  it('senza orgId → []', async () => {
    expect(await loadTrasferimenti(null)).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('limit default 200', async () => {
    await loadTrasferimenti('org')
    const chain = supabase.from.mock.results[0].value
    expect(chain.limit).toHaveBeenCalledWith(200)
  })

  it('scope=in filtra sede_a', async () => {
    await loadTrasferimenti('org', { scope: 'in', sedeAttivaId: 'sed-A' })
    const chain = supabase.from.mock.results[0].value
    expect(chain.eq).toHaveBeenCalledWith('sede_a', 'sed-A')
  })

  it('scope=out filtra sede_da', async () => {
    await loadTrasferimenti('org', { scope: 'out', sedeAttivaId: 'sed-A' })
    const chain = supabase.from.mock.results[0].value
    expect(chain.eq).toHaveBeenCalledWith('sede_da', 'sed-A')
  })

  it('scope=attiva → .or(sede_da OR sede_a)', async () => {
    await loadTrasferimenti('org', { scope: 'attiva', sedeAttivaId: 'sed-A' })
    const chain = supabase.from.mock.results[0].value
    expect(chain.or).toHaveBeenCalled()
  })

  it('error → []', async () => {
    supabase.from.mockImplementationOnce(() => mkChain({ data: null, error: { message: 'x' } }))
    expect(await loadTrasferimenti('org')).toEqual([])
  })
})

describe('creaTrasferimento — validazione input', () => {
  beforeEach(() => { supabase.from.mockClear() })

  it('parametri mancanti → throw', async () => {
    await expect(creaTrasferimento({ orgId: null, sedeDa: 'A', sedeA: 'B', prodotto: 'X', quantita: 5 }))
      .rejects.toThrow(/incompleti/)
    await expect(creaTrasferimento({ orgId: 'o', sedeDa: null, sedeA: 'B', prodotto: 'X', quantita: 5 }))
      .rejects.toThrow(/incompleti/)
    await expect(creaTrasferimento({ orgId: 'o', sedeDa: 'A', sedeA: 'B', prodotto: null, quantita: 5 }))
      .rejects.toThrow(/incompleti/)
  })

  it('quantita NaN o <=0 → throw (audit 2026-07-01 MED)', async () => {
    await expect(creaTrasferimento({ orgId: 'o', sedeDa: 'A', sedeA: 'B', prodotto: 'X', quantita: NaN }))
      .rejects.toThrow(/incompleti/)
    await expect(creaTrasferimento({ orgId: 'o', sedeDa: 'A', sedeA: 'B', prodotto: 'X', quantita: 0 }))
      .rejects.toThrow(/incompleti/)
    await expect(creaTrasferimento({ orgId: 'o', sedeDa: 'A', sedeA: 'B', prodotto: 'X', quantita: -1 }))
      .rejects.toThrow(/incompleti/)
  })

  it('sede stessa origine+destinazione → throw', async () => {
    await expect(creaTrasferimento({ orgId: 'o', sedeDa: 'A', sedeA: 'A', prodotto: 'X', quantita: 5 }))
      .rejects.toThrow(/diverse/)
  })

  it('valoreUnit negativo → throw', async () => {
    await expect(creaTrasferimento({
      orgId: 'o', sedeDa: 'A', sedeA: 'B', prodotto: 'X', quantita: 5, valoreUnit: -1,
    })).rejects.toThrow(/valore_unit/)
  })

  it('prodotto >200 char → throw', async () => {
    const longName = 'X'.repeat(201)
    await expect(creaTrasferimento({
      orgId: 'o', sedeDa: 'A', sedeA: 'B', prodotto: longName, quantita: 5,
    })).rejects.toThrow(/troppo lungo/)
  })

  it('note >500 char → trunca silenziosamente', async () => {
    supabase.from.mockImplementationOnce(() => mkChain({ data: { id: 't1' }, error: null }))
    const longNote = 'N'.repeat(800)
    await creaTrasferimento({
      orgId: 'o', sedeDa: 'A', sedeA: 'B', prodotto: 'X', quantita: 5, note: longNote,
    })
    const chain = supabase.from.mock.results[0].value
    const insertedPayload = chain.insert.mock.calls[0][0]
    expect(insertedPayload.note.length).toBe(500)
  })

  it('default stato=bozza, default unita=pz', async () => {
    supabase.from.mockImplementationOnce(() => mkChain({ data: { id: 't1' }, error: null }))
    await creaTrasferimento({ orgId: 'o', sedeDa: 'A', sedeA: 'B', prodotto: 'X', quantita: 5 })
    const chain = supabase.from.mock.results[0].value
    const payload = chain.insert.mock.calls[0][0]
    expect(payload.stato).toBe('bozza')
    expect(payload.unita).toBe('pz')
  })

  it('autoInvia=true → chiama trasferimento_invia RPC dopo insert', async () => {
    supabase.from.mockImplementationOnce(() => mkChain({ data: { id: 't1' }, error: null }))
    supabase.rpc.mockResolvedValueOnce({ data: { ok: true, id: 't1' }, error: null })
    await creaTrasferimento({
      orgId: 'o', sedeDa: 'A', sedeA: 'B', prodotto: 'X', quantita: 5, autoInvia: true,
    })
    expect(supabase.rpc).toHaveBeenCalledWith('trasferimento_invia', { p_id: 't1' })
  })
})

describe('transizioni stato RPC', () => {
  beforeEach(() => { supabase.rpc.mockClear() })

  it('inviaTrasferimento → RPC trasferimento_invia', async () => {
    await inviaTrasferimento('t1')
    expect(supabase.rpc).toHaveBeenCalledWith('trasferimento_invia', { p_id: 't1' })
  })

  it('riceviTrasferimento default args', async () => {
    await riceviTrasferimento('t1')
    expect(supabase.rpc).toHaveBeenCalledWith('trasferimento_ricevi', {
      p_id: 't1', p_quantita_ricevuta: null, p_scarto_note: null,
    })
  })

  it('riceviTrasferimento con scarto', async () => {
    await riceviTrasferimento('t1', { quantitaRicevuta: 4, scartoNote: '1 vaschetta caduta' })
    expect(supabase.rpc).toHaveBeenCalledWith('trasferimento_ricevi', expect.objectContaining({
      p_quantita_ricevuta: 4, p_scarto_note: '1 vaschetta caduta',
    }))
  })

  it('annullaTrasferimento → RPC trasferimento_annulla', async () => {
    await annullaTrasferimento('t1')
    expect(supabase.rpc).toHaveBeenCalledWith('trasferimento_annulla', { p_id: 't1' })
  })

  it('RPC error → throw', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc fail' } })
    await expect(inviaTrasferimento('t1')).rejects.toThrow()
  })
})

describe('getTrasferimento', () => {
  it('chiama .single() + throw su error', async () => {
    supabase.from.mockImplementationOnce(() => mkChain({ data: null, error: { message: 'not found' } }))
    await expect(getTrasferimento('t1')).rejects.toThrow()
  })
})
