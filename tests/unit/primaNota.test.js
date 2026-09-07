// Prima nota di cassa: le uscite di giornata.
//
// Il vincolo che questi test difendono e' la distinzione fra spesa documentata
// e non documentata. Il campo `documento` viene dalla notazione con cui il
// design partner tiene il registro da anni — (F), (no F), (?) — e non e' una
// nota di colore: davanti al commercialista le tre categorie pesano in modo
// diverso. Se un valore sconosciuto passasse per 'fattura', il totale delle
// spese documentate direbbe il falso.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()
const fromMock = vi.fn()

vi.mock('../../src/lib/supabase', () => ({
  supabase: { from: (...a) => fromMock(...a), rpc: (...a) => rpcMock(...a) },
}))

import {
  DOCUMENTI, etichettaDocumento,
  caricaMovimenti, aggiungiMovimento, eliminaMovimento,
  aggiungiMovimentiInBlocco, totaliPeriodo, eliminaMovimentiPeriodo,
} from '../../src/lib/primaNota'

const ORG = 'org-1'
const SEDE = 'sede-1'

/**
 * Catena finta di Supabase. Registra le chiamate cosi' i test possono
 * verificare non solo il risultato ma anche COSA e' stato chiesto al database:
 * su una tabella filtrata per organizzazione, sbagliare un `eq` significa
 * mostrare le spese di un altro cliente.
 */
function chain(risultato = { data: [], error: null }) {
  const c = {
    chiamate: [],
    payload: null,
  }
  const reg = (nome) => vi.fn((...a) => { c.chiamate.push([nome, ...a]); return c })
  Object.assign(c, {
    select: reg('select'),
    eq: reg('eq'),
    is: reg('is'),
    gte: reg('gte'),
    lte: reg('lte'),
    delete: reg('delete'),
    insert: vi.fn((p) => { c.chiamate.push(['insert', p]); c.payload = p; return c }),
    order: vi.fn(async (...a) => { c.chiamate.push(['order', ...a]); return risultato }),
    single: vi.fn(async () => risultato),
    then: (cb) => Promise.resolve(risultato).then(cb),
  })
  fromMock.mockReturnValue(c)
  return c
}

beforeEach(() => { fromMock.mockReset(); rpcMock.mockReset() })

describe('notazione del documento', () => {
  it('copre i tre casi del registro reale, e nessun altro', () => {
    expect(DOCUMENTI.map(d => d.valore)).toEqual(['fattura', 'senza', 'incerto'])
  })

  it('un valore sconosciuto non diventa "con fattura"', () => {
    // Il default prudente e' "da verificare": dichiarare una fattura che
    // nessuno ha visto e' l'unico errore che costa qualcosa.
    expect(etichettaDocumento('boh')).toBe('Da verificare')
    expect(etichettaDocumento(undefined)).toBe('Da verificare')
    expect(etichettaDocumento('fattura')).toBe('Con fattura')
    expect(etichettaDocumento('senza')).toBe('Senza fattura')
  })
})

describe('caricaMovimenti', () => {
  it('legge le uscite della sede nel periodo, con importo numerico', async () => {
    const c = chain({
      data: [{ id: 'm1', data: '2026-07-03', importo: '10.00', descrizione: 'limoni', documento: 'senza' }],
      error: null,
    })
    const out = await caricaMovimenti(ORG, SEDE, { from: '2026-07-01', to: '2026-07-31' })

    expect(out).toHaveLength(1)
    expect(out[0].importo).toBe(10)          // numero, non la stringa di Postgres
    expect(fromMock).toHaveBeenCalledWith('movimenti_cassa')
    expect(c.chiamate).toEqual(expect.arrayContaining([
      ['eq', 'organization_id', ORG],
      ['eq', 'sede_id', SEDE],
      ['gte', 'data', '2026-07-01'],
      ['lte', 'data', '2026-07-31'],
    ]))
  })

  it('senza sede cerca le righe aziendali, non tutte le sedi', async () => {
    const c = chain()
    await caricaMovimenti(ORG, null)
    expect(c.chiamate).toEqual(expect.arrayContaining([['is', 'sede_id', null]]))
  })

  it('senza organizzazione non interroga il database', async () => {
    expect(await caricaMovimenti(null, SEDE)).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('un errore del database non passa per lista vuota', async () => {
    chain({ data: null, error: { message: 'permesso negato' } })
    await expect(caricaMovimenti(ORG, SEDE)).rejects.toThrow('permesso negato')
  })
})

describe('aggiungiMovimento', () => {
  it('salva la spesa con la sua sede e il suo documento', async () => {
    const c = chain({
      data: { id: 'm1', data: '2026-07-03', importo: '11.56', descrizione: 'carrefour', documento: 'fattura' },
      error: null,
    })
    const out = await aggiungiMovimento(ORG, SEDE, {
      data: '2026-07-03', importo: '11.56', descrizione: '  carrefour  ', documento: 'fattura',
    })

    expect(c.payload).toMatchObject({
      organization_id: ORG, sede_id: SEDE, data: '2026-07-03',
      importo: 11.56, descrizione: 'carrefour', documento: 'fattura',
    })
    expect(out.importo).toBe(11.56)
  })

  it('un documento non previsto ricade su "da verificare"', async () => {
    const c = chain({ data: { importo: '5' }, error: null })
    await aggiungiMovimento(ORG, SEDE, { data: '2026-07-03', importo: 5, descrizione: 'x', documento: 'inventato' })
    expect(c.payload.documento).toBe('incerto')
  })

  it('rifiuta importo nullo o negativo', async () => {
    await expect(aggiungiMovimento(ORG, SEDE, { importo: 0, descrizione: 'x' }))
      .rejects.toThrow(/maggiore di zero/)
    await expect(aggiungiMovimento(ORG, SEDE, { importo: -3, descrizione: 'x' }))
      .rejects.toThrow(/maggiore di zero/)
  })

  it('rifiuta una spesa senza descrizione', async () => {
    // Una riga da 18 euro senza descrizione, fra sei mesi, e' un buco.
    await expect(aggiungiMovimento(ORG, SEDE, { importo: 18, descrizione: '   ' }))
      .rejects.toThrow(/descrizione/)
  })

  it('senza organizzazione non scrive nulla', async () => {
    await expect(aggiungiMovimento(null, SEDE, { importo: 5, descrizione: 'x' })).rejects.toThrow(/orgId/)
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('eliminaMovimento', () => {
  it('cancella per id e propaga l\'errore', async () => {
    const c = chain({ error: null })
    await eliminaMovimento('m1')
    expect(c.chiamate).toEqual(expect.arrayContaining([['delete'], ['eq', 'id', 'm1']]))

    chain({ error: { message: 'riga non trovata' } })
    await expect(eliminaMovimento('m2')).rejects.toThrow('riga non trovata')
  })
})

describe('aggiungiMovimentiInBlocco', () => {
  it('scarta le righe senza data o senza importo utile', async () => {
    const c = chain({ error: null })
    const n = await aggiungiMovimentiInBlocco(ORG, [
      { data: '2026-07-03', importo: 10, descrizione: 'limoni' },
      { data: null, importo: 10, descrizione: 'senza data' },
      { data: '2026-07-04', importo: 0, descrizione: 'importo zero' },
    ])
    expect(n).toBe(1)
    expect(c.payload).toHaveLength(1)
    expect(c.payload[0].descrizione).toBe('limoni')
  })

  it('spezza in blocchi da 200 invece di una richiesta sola', async () => {
    const c = chain({ error: null })
    const righe = Array.from({ length: 450 }, (_, i) => ({
      data: '2026-07-03', importo: 1, descrizione: `spesa ${i}`,
    }))
    const n = await aggiungiMovimentiInBlocco(ORG, righe)

    expect(n).toBe(450)
    const inserimenti = c.chiamate.filter(([nome]) => nome === 'insert')
    expect(inserimenti.map(([, p]) => p.length)).toEqual([200, 200, 50])
  })

  it('annota in chiaro quando l\'importo e\' stato ripartito o e\' un residuo', async () => {
    // Chi rilegge la prima nota fra due mesi deve sapere quali cifre vengono
    // dal registro e quali sono state ricostruite dall'importazione.
    const c = chain({ error: null })
    await aggiungiMovimentiInBlocco(ORG, [
      { data: '2026-07-03', importo: 5, descrizione: 'stimata', importoStimato: true },
      { data: '2026-07-03', importo: 7, descrizione: 'residuo', importoResiduo: true },
      { data: '2026-07-03', importo: 9, descrizione: 'esatta' },
    ])
    const [stimata, residuo, esatta] = c.payload
    expect(stimata.note).toMatch(/ripartito automaticamente/)
    expect(residuo.note).toMatch(/[Dd]ifferenza/)
    expect(esatta.note).toBeNull()
  })

  it('senza righe non chiama il database', async () => {
    expect(await aggiungiMovimentiInBlocco(ORG, [])).toBe(0)
    expect(await aggiungiMovimentiInBlocco(null, [{ data: '2026-07-03', importo: 1 }])).toBe(0)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('un errore su un blocco non viene ingoiato', async () => {
    chain({ error: { message: 'vincolo violato' } })
    await expect(aggiungiMovimentiInBlocco(ORG, [{ data: '2026-07-03', importo: 1, descrizione: 'x' }]))
      .rejects.toThrow('vincolo violato')
  })
})

describe('totaliPeriodo', () => {
  it('tiene separate documentate, non documentate e da verificare', async () => {
    rpcMock.mockResolvedValue({
      data: [{ totale: '128.50', con_fattura: '90.00', senza_fattura: '30.00', da_verificare: '8.50', numero_movimenti: 7 }],
      error: null,
    })
    const t = await totaliPeriodo(ORG, [SEDE], '2026-07-01', '2026-07-31')

    expect(t).toEqual({ totale: 128.5, conFattura: 90, senzaFattura: 30, daVerificare: 8.5, numero: 7 })
    expect(rpcMock).toHaveBeenCalledWith('movimenti_cassa_periodo', {
      p_org_id: ORG, p_sede_ids: [SEDE], p_data_from: '2026-07-01', p_data_to: '2026-07-31',
    })
  })

  it('accetta una sede singola e la manda comunque come elenco', async () => {
    rpcMock.mockResolvedValue({ data: [{}], error: null })
    await totaliPeriodo(ORG, SEDE, '2026-07-01', '2026-07-31')
    expect(rpcMock.mock.calls[0][1].p_sede_ids).toEqual([SEDE])
  })

  it('"tutte le sedi" resta null, non un elenco vuoto', async () => {
    // Un array vuoto significherebbe "nessuna sede" e tornerebbe zero.
    rpcMock.mockResolvedValue({ data: [{}], error: null })
    await totaliPeriodo(ORG, null, '2026-07-01', '2026-07-31')
    expect(rpcMock.mock.calls[0][1].p_sede_ids).toBeNull()
  })

  it('senza periodo o in caso di errore torna tutto a zero', async () => {
    const zero = { totale: 0, conFattura: 0, senzaFattura: 0, daVerificare: 0, numero: 0 }
    expect(await totaliPeriodo(ORG, null, null, '2026-07-31')).toEqual(zero)
    expect(rpcMock).not.toHaveBeenCalled()

    rpcMock.mockResolvedValue({ data: null, error: { message: 'rpc assente' } })
    expect(await totaliPeriodo(ORG, null, '2026-07-01', '2026-07-31')).toEqual(zero)
  })
})

describe('eliminaMovimentiPeriodo', () => {
  it('svuota solo il periodo e solo la sede indicata', async () => {
    // Serve prima di reimportare un registro: senza, il secondo caricamento
    // dello stesso mese raddoppia ogni spesa.
    const c = chain({ count: 12, error: null })
    const n = await eliminaMovimentiPeriodo(ORG, SEDE, '2026-07-01', '2026-07-31')

    expect(n).toBe(12)
    expect(c.chiamate).toEqual(expect.arrayContaining([
      ['delete', { count: 'exact' }],
      ['eq', 'organization_id', ORG],
      ['eq', 'sede_id', SEDE],
      ['gte', 'data', '2026-07-01'],
      ['lte', 'data', '2026-07-31'],
    ]))
  })

  it('senza periodo non cancella niente', async () => {
    expect(await eliminaMovimentiPeriodo(ORG, SEDE, null, '2026-07-31')).toBe(0)
    expect(await eliminaMovimentiPeriodo(ORG, SEDE, '2026-07-01', null)).toBe(0)
    expect(await eliminaMovimentiPeriodo(null, SEDE, '2026-07-01', '2026-07-31')).toBe(0)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('un errore non passa per "cancellati zero"', async () => {
    chain({ count: null, error: { message: 'permesso negato' } })
    await expect(eliminaMovimentiPeriodo(ORG, SEDE, '2026-07-01', '2026-07-31'))
      .rejects.toThrow('permesso negato')
  })
})
