// Le chiusure di cassa si leggono da un posto solo.
//
// Difetto trovato il 16/09/2026 dall'agente SOLDI dell'audit, leggendo
// `ConfrontoSedi.jsx:200`: la pagina che confronta i punti vendita chiedeva le
// chiusure a `sload('pasticceria-chiusure-v1', ...)`, cioè al blob jsonb di
// `user_data`. Il conto economico invece le chiede a `caricaChiusure`, cioè
// alla tabella `chiusure_cassa` (migration 20260907b).
//
// Dal 7 settembre `salvaChiusure` scrive SOLO sulla tabella. Il blob non lo
// aggiorna più nessuno: è la fotografia del giorno della migrazione. In
// produzione esiste per UNA sola organizzazione (la demo, 79 giornate) e per
// nessun'altra — Mara dei Boschi non ce l'ha proprio.
//
// Oggi i numeri coincidono solo perché da quel giorno nessuno ha registrato
// una chiusura. Alla prima che viene registrata — ed è esattamente quello che
// la pagina Cassa serve a far fare — undici pagine restano sulla fotografia
// vecchia mentre il conto economico mostra il dato giusto: due incassi diversi
// per la stessa settimana, nella stessa applicazione.
//
// La correzione sta in `src/lib/storage.js`: il dirottamento è nel modulo di
// accesso ai dati, non sugli undici callsite, così nessuno può restare
// indietro. Questi test difendono quel punto unico.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockChain, mockSupabase } from '../helpers/supabaseMock.js'

vi.mock('../../src/lib/supabase', () => ({ supabase: mockSupabase() }))

import { sload, ssave, sloadAllSedi, _resetVersions } from '../../src/lib/storage.js'
import { supabase } from '../../src/lib/supabase'
import { seedDemoDataFull } from '../../src/lib/demoSeedFull'

const SK_CHIUS = 'pasticceria-chiusure-v1'
const ORG = 'org-mara'
const SEDE_A = 'sede-corso-casale'
const SEDE_B = 'sede-san-donato'

// Le due giornate che c'erano il giorno della migrazione: 1.240,00 € in tutto.
const GIORNATE_VECCHIE = [
  { id: 'ch-2026-09-05', data: '2026-09-05', kpi: { totV: 620 } },
  { id: 'ch-2026-09-06', data: '2026-09-06', kpi: { totV: 620 } },
]

// Le stesse righe come stanno nella tabella, più la chiusura registrata oggi.
const RIGHE_TABELLA = [
  { legacy_id: 'ch-2026-09-05', data: '2026-09-05', tot_venduto: '620.00', sede_id: SEDE_A },
  { legacy_id: 'ch-2026-09-06', data: '2026-09-06', tot_venduto: '620.00', sede_id: SEDE_A },
  { legacy_id: null, id: 'uuid-nuova', data: '2026-09-17', tot_venduto: '320.50', sede_id: SEDE_A },
]

/**
 * Prepara il database finto. `user_data` risponde col blob fermo al 7
 * settembre, `chiusure_cassa` con le righe vere. Tiene il conto di quali
 * tabelle sono state interrogate: è la parte che dimostra il dirottamento.
 */
function preparaDb({ blob = GIORNATE_VECCHIE, righe = RIGHE_TABELLA, erroreTabella = null } = {}) {
  const tocco = []
  const chiamate = []
  supabase.from.mockImplementation((tabella) => {
    tocco.push(tabella)
    const valore = tabella === 'chiusure_cassa'
      ? { data: erroreTabella ? null : righe, error: erroreTabella }
      : { data: blob == null ? [] : [{ data_value: blob, updated_at: '2026-09-07T10:00:00Z', version: 3 }], error: null }
    const chain = mockChain(valore)
    chiamate.push({ tabella, chain })
    return chain
  })
  return { tocco, chiamate }
}

const totale = (chiusure) => (chiusure || []).reduce((s, c) => s + (c.kpi?.totV || 0), 0)

beforeEach(() => {
  _resetVersions()
  supabase.from.mockReset()
  supabase.rpc.mockReset()
  supabase.from.mockImplementation(() => mockChain({ data: [], error: null }))
  supabase.rpc.mockResolvedValue({ data: null, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ---------------------------------------------------------------------------
// 1. Riproduce — il codice di prima
// ---------------------------------------------------------------------------

/**
 * La `sload` com'era prima del dirottamento: nessuna eccezione per le
 * chiusure, si andava dritti al blob di `user_data`. Serve a misurare lo
 * scarto, non a essere usata.
 */
async function sloadVecchio(key, orgId, sedeId) {
  const { data } = await supabase
    .from('user_data')
    .select('data_value, updated_at, version')
    .eq('organization_id', orgId)
    .eq('data_key', key)
    .eq('sede_id', sedeId)
    .order('updated_at', { ascending: false })
    .limit(1)
  return data?.[0]?.data_value ?? null
}

describe('riproduce: la lettura vecchia resta alla fotografia del blob', () => {
  it('la pagina multi-sede leggeva 1.240,00 € dove la cassa ne aveva incassati 1.560,50 €', async () => {
    const { tocco } = preparaDb()

    const vecchio = await sloadVecchio(SK_CHIUS, ORG, SEDE_A)
    expect(vecchio).toHaveLength(2)
    expect(totale(vecchio)).toBe(1240)
    // La chiusura di oggi non c'è: il blob non la conosce.
    expect(vecchio.some(c => c.data === '2026-09-17')).toBe(false)
    expect(tocco).toEqual(['user_data'])

    const nuovo = await sload(SK_CHIUS, ORG, SEDE_A)
    expect(nuovo).toHaveLength(3)
    expect(totale(nuovo)).toBe(1560.5)

    // 320,50 € di incasso che una pagina vedeva e l'altra no.
    expect(totale(nuovo) - totale(vecchio)).toBe(320.5)
  })

  it('per un cliente senza blob la lettura vecchia diceva «nessuna chiusura» invece di leggerle', async () => {
    // Mara dei Boschi in produzione non ha nessuna riga `pasticceria-chiusure-v1`:
    // la pagina restava vuota con l'allarme rosso acceso.
    preparaDb({ blob: null })

    const vecchio = await sloadVecchio(SK_CHIUS, ORG, SEDE_A)
    expect(vecchio).toBeNull()

    const nuovo = await sload(SK_CHIUS, ORG, SEDE_A)
    expect(nuovo).toHaveLength(3)
    expect(totale(nuovo)).toBe(1560.5)
  })
})

// ---------------------------------------------------------------------------
// 2. La correzione
// ---------------------------------------------------------------------------

describe('la correzione: sload, ssave e sloadAllSedi passano dalla tabella', () => {
  it('sload delle chiusure interroga chiusure_cassa e non tocca mai user_data', async () => {
    const { tocco } = preparaDb()

    const chiusure = await sload(SK_CHIUS, ORG, SEDE_A)

    expect(tocco).toContain('chiusure_cassa')
    expect(tocco).not.toContain('user_data')
    expect(totale(chiusure)).toBe(1560.5)
  })

  it('restituisce la stessa forma che aveva il blob, così le undici pagine non se ne accorgono', async () => {
    preparaDb()

    const [prima] = await sload(SK_CHIUS, ORG, SEDE_A)

    // { id, data, kpi, venduto, formati }: è il contratto che i consumatori
    // avevano col blob.
    expect(prima.id).toBe('ch-2026-09-05')     // legacy_id, non l'uuid
    expect(prima.data).toBe('2026-09-05')
    expect(prima.kpi.totV).toBe(620)
    expect(Array.isArray(prima.venduto)).toBe(true)
    expect(Array.isArray(prima.formati)).toBe(true)
  })

  it('ssave delle chiusure scrive nella tabella e non nel blob', async () => {
    const { tocco, chiamate } = preparaDb()

    await ssave(SK_CHIUS, [{ id: 'ch-2026-09-17', data: '2026-09-17', kpi: { totV: 320.5 } }], ORG, SEDE_A)

    expect(tocco).not.toContain('user_data')
    const conUpsert = chiamate.find(c => c.tabella === 'chiusure_cassa' && c.chain.upsert.mock.calls.length > 0)
    expect(conUpsert, 'nessun upsert su chiusure_cassa').toBeTruthy()
    const [righe] = conUpsert.chain.upsert.mock.calls[0]
    expect(righe).toHaveLength(1)
    expect(righe[0].organization_id).toBe(ORG)
    expect(righe[0].sede_id).toBe(SEDE_A)
    expect(righe[0].data).toBe('2026-09-17')
    expect(righe[0].tot_venduto).toBe(320.5)
  })

  it('sloadAllSedi delle chiusure raggruppa per sede leggendo la tabella', async () => {
    const { tocco } = preparaDb({
      righe: [
        ...RIGHE_TABELLA,
        { legacy_id: null, id: 'uuid-b', data: '2026-09-17', tot_venduto: '410.00', sede_id: SEDE_B },
      ],
    })

    const perSede = await sloadAllSedi(SK_CHIUS, ORG)

    expect(tocco).toContain('chiusure_cassa')
    expect(tocco).not.toContain('user_data')
    expect(Object.keys(perSede).sort()).toEqual([SEDE_A, SEDE_B].sort())
    expect(totale(perSede[SEDE_A])).toBe(1560.5)
    expect(totale(perSede[SEDE_B])).toBe(410)
  })

  it('la chiusura di una sede non finisce nell’altra', async () => {
    const { chiamate } = preparaDb()

    await ssave(SK_CHIUS, [{ data: '2026-09-17', kpi: { totV: 410 } }], ORG, SEDE_B)

    const conUpsert = chiamate.find(c => c.tabella === 'chiusure_cassa' && c.chain.upsert.mock.calls.length > 0)
    expect(conUpsert.chain.upsert.mock.calls[0][0][0].sede_id).toBe(SEDE_B)
  })
})

// ---------------------------------------------------------------------------
// 3. Quello che c'è intorno
// ---------------------------------------------------------------------------

describe('intorno: il righello, e quello che il dirottamento non deve rompere', () => {
  it('righello — le altre chiavi per-sede continuano a passare da user_data', async () => {
    // Senza questo controllo, un dirottamento che prendesse OGNI chiave
    // farebbe passare i test qui sopra per il motivo sbagliato.
    const { tocco } = preparaDb({ blob: [{ nome: 'FARINA 00', qta: 12 }] })

    const magazzino = await sload('pasticceria-magazzino-v1', ORG, SEDE_A)

    expect(tocco).toEqual(['user_data'])
    expect(tocco).not.toContain('chiusure_cassa')
    expect(magazzino).toEqual([{ nome: 'FARINA 00', qta: 12 }])
  })

  it('righello — anche in scrittura: un’altra chiave finisce ancora in user_data', async () => {
    const { tocco } = preparaDb()

    await ssave('pasticceria-magazzino-v1', [{ nome: 'ZUCCHERO', qta: 8 }], ORG, SEDE_A)

    expect(tocco).toContain('user_data')
    expect(tocco).not.toContain('chiusure_cassa')
  })

  it('se la tabella non risponde dice «non lo so» (null), non «nessuna chiusura» (lista vuota)', async () => {
    // Un array vuoto qui significherebbe «la cassa non è mai stata chiusa», e
    // le pagine a valle ci costruirebbero sopra un incasso di zero euro.
    preparaDb({ erroreTabella: { message: 'connessione interrotta', status: 503 } })

    const chiusure = await sload(SK_CHIUS, ORG, SEDE_A)

    expect(chiusure).toBeNull()
    expect(chiusure).not.toEqual([])
  })

  it('sloadAllSedi lascia fuori le righe senza sede, come faceva il blob per-sede', async () => {
    preparaDb({
      righe: [
        { legacy_id: 'ch-vecchia', data: '2026-01-10', tot_venduto: '900.00', sede_id: null },
        ...RIGHE_TABELLA,
      ],
    })

    const perSede = await sloadAllSedi(SK_CHIUS, ORG)

    // Le righe senza sede sono del periodo in cui l'organizzazione aveva un
    // punto vendita solo: nel confronto fra sedi non appartengono a nessuno.
    expect(Object.keys(perSede)).toEqual([SEDE_A])
    expect(totale(perSede[SEDE_A])).toBe(1560.5)
  })

  it('senza organizzazione non inventa dati: sload null, sloadAllSedi vuoto', async () => {
    const { tocco } = preparaDb()

    expect(await sload(SK_CHIUS, null, SEDE_A)).toBeNull()
    expect(await sloadAllSedi(SK_CHIUS, null)).toEqual({})
    expect(tocco).toHaveLength(0)
  })

  it('ssave senza organizzazione fallisce invece di scrivere a caso', async () => {
    preparaDb()
    await expect(ssave(SK_CHIUS, GIORNATE_VECCHIE, null, SEDE_A)).rejects.toThrow(/orgId mancante/)
  })

  it('dopo il salvataggio pulisce solo le giornate sparite dall’elenco, non tutta la sede', async () => {
    const { chiamate } = preparaDb()

    await ssave(SK_CHIUS, [{ data: '2026-09-17', kpi: { totV: 320.5 } }], ORG, SEDE_A)

    const conDelete = chiamate.find(c => c.tabella === 'chiusure_cassa' && c.chain.delete.mock.calls.length > 0)
    expect(conDelete, 'nessuna pulizia delle giornate eliminate').toBeTruthy()
    // La cancellazione esclude le date ancora presenti nell'elenco.
    const not = conDelete.chain.not.mock.calls[0]
    expect(not[0]).toBe('data')
    expect(not[2]).toContain('2026-09-17')
  })
})


// ---------------------------------------------------------------------------
// 4. Stessa famiglia: il seme della demo
// ---------------------------------------------------------------------------
//
// Trovato il 17/09/2026 tirando lo stesso filo. `demoSeedFull.js` non passa da
// `ssave`: ha un `userDataUpsert` suo, perché gira anche dentro la funzione
// Vercel dell'amministrazione, dove il client Supabase arriva da fuori. Il
// dirottamento di `storage.js` non lo vede, e le 77 giornate della demo
// finivano nel blob `pasticceria-chiusure-v1`, che non legge più nessuno.
//
// Una demo appena creata nasceva senza un euro di incasso in nessuna delle
// pagine che lo mostrano — ed è la prima cosa che guarda chi sta valutando se
// comprare il prodotto.

/** Client finto che registra le scritture invece di farle. */
function clientFinto(registro) {
  const chain = (tabella) => {
    const c = {}
    for (const m of ['select', 'eq', 'is', 'in', 'or', 'not', 'gte', 'lte', 'lt', 'gt', 'order', 'limit', 'maybeSingle', 'single', 'delete', 'ilike', 'neq']) c[m] = () => c
    c.insert = (v) => { registro.push({ tabella, op: 'insert', v }); return c }
    c.update = (v) => { registro.push({ tabella, op: 'update', v }); return c }
    c.upsert = (v) => { registro.push({ tabella, op: 'upsert', v }); return c }
    c.then = (r) => Promise.resolve({ data: [], error: null }).then(r)
    return c
  }
  return { from: (tabella) => chain(tabella), rpc: async () => ({ data: null, error: null }) }
}

async function semina() {
  const registro = []
  const esito = await seedDemoDataFull({ orgId: ORG, sedeId: SEDE_A, supabase: clientFinto(registro) })
  return { registro, esito }
}

describe('stessa famiglia: il seme della demo scriveva le chiusure nel blob', () => {
  it('riproduce: scritte nel blob, il prodotto le cerca nella tabella e non trova niente', async () => {
    const { esito } = await semina()
    expect(esito.counts.chiusure).toBe(77)

    // Il blob pieno delle 77 giornate, la tabella vuota: è la situazione che
    // il seme vecchio lasciava dietro di sé.
    preparaDb({ blob: Array.from({ length: 77 }, (_, i) => ({ data: `2026-0${(i % 9) + 1}-01`, kpi: { totV: 500 } })), righe: [] })

    const viste = await sload(SK_CHIUS, ORG, SEDE_A)
    expect(viste).toEqual([])
    expect(totale(viste)).toBe(0)
  })

  it('la correzione: le 77 giornate vanno in chiusure_cassa, marcate come demo', async () => {
    const { registro } = await semina()

    const suUserData = registro.filter(x => x.tabella === 'user_data')
      .flatMap(x => (Array.isArray(x.v) ? x.v : [x.v]))
      .filter(r => r?.data_key === SK_CHIUS)
    expect(suUserData, 'le chiusure sono ancora nel blob').toHaveLength(0)

    const upsert = registro.find(x => x.tabella === 'chiusure_cassa' && x.op === 'upsert')
    expect(upsert, 'nessuna chiusura scritta nella tabella').toBeTruthy()
    expect(upsert.v).toHaveLength(77)
    expect(upsert.v.every(r => r.is_demo === true)).toBe(true)
    expect(upsert.v.every(r => r.organization_id === ORG && r.sede_id === SEDE_A)).toBe(true)
  })

  it('intorno: i numeri della giornata arrivano interi nella riga, non solo il totale', async () => {
    const { registro } = await semina()
    const righe = registro.find(x => x.tabella === 'chiusure_cassa' && x.op === 'upsert').v
    const r = righe[0]

    expect(r.data).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r.tot_venduto).toBeGreaterThan(0)
    expect(r.tot_foodcost).toBeGreaterThan(0)
    expect(r.tot_margine).toBe(r.tot_venduto - r.tot_foodcost)
    // Il sell-through è una percentuale 0-100, non una frazione.
    expect(r.scontrino_medio).toBeGreaterThan(50)
    expect(r.scontrino_medio).toBeLessThanOrEqual(100)
    expect(Array.isArray(r.venduto) && r.venduto.length > 0).toBe(true)
    // `legacy_id` tiene l'identificativo che la demo usava nel blob: chi ha
    // già una demo seminata prima non si ritrova le giornate doppie.
    expect(r.legacy_id).toMatch(/^demo-ch-/)
  })

  it('intorno: il totale della demo è lo stesso che il prodotto rilegge dalla tabella', async () => {
    const { registro } = await semina()
    const righe = registro.find(x => x.tabella === 'chiusure_cassa' && x.op === 'upsert').v
    const sommaScritta = righe.reduce((s, r) => s + r.tot_venduto, 0)

    preparaDb({ righe: righe.map(r => ({ ...r, sede_id: SEDE_A })) })
    const rilette = await sload(SK_CHIUS, ORG, SEDE_A)

    expect(rilette).toHaveLength(77)
    expect(totale(rilette)).toBeCloseTo(sommaScritta, 2)
  })
})
