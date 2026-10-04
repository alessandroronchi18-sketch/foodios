// @vitest-environment happy-dom
//
// ── Lo Storico inventava cali del -70% con un mese non registrato ─────────
//
// Trovato dall'audit dello Storico del 03/10/2026 sui dati di Mara dei Boschi.
//
// All'apertura la pagina guardava gli ultimi due mesi (03/08-03/10) e li
// confrontava coi due mesi prima. Ma l'ultimo giorno registrato era il 31/08:
// 29 giorni scritti contro 62. A schermo «Prodotto 4.150,6 kg -71,6%, Venduto
// -70,8%, Ricavo -70,5%»: un dato che manca diventava un crollo delle
// vendite. La pagina non diceva mai «dopo il 31/08 non c'è niente».
//
// Della stessa famiglia:
//   - «30 giorni» su Carlina (04/09-03/10) mostrava 22 gusti a 0,0 kg e -100%
//     su tutto, perché il controllo «periodo vuoto» guardava anche le righe
//     dei sette giorni prima, che servono solo come giacenza di partenza;
//   - la freccia del margine girava il segno se il margine di prima era
//     negativo (si divideva per un numero negativo);
//   - due righe di settembre (ABIS a zero il 07/09, ABIS con 1 grammo
//     spedito il 15/09: la prova di un pulsante) bastavano a far credere
//     che settembre fosse registrato.
//
// La regola nuova (ANALISI_DESIGN.md, punto 2): si confronta il tratto con i
// dati con un tratto lungo uguale che abbia (quasi) le stesse giornate
// registrate; se no il confronto non si fa e la pagina dice perché. Con i
// dati veri: la partenza diventa 01/07-31/08 contro 30/04-30/06, 183 giornate
// contro 183, venduto -13,1% (non -70,8%).
//
// 04/10/2026, pagina Produzione rifatta (fase 2): le tessere scrivono il
// confronto come le altre pagine della nuova Analisi («−13% sul periodo
// prima», col segno meno tipografico) e la riga «Confronto con…» sta nella
// copertura dei dati, con la maiuscola. Le prove cercano i testi nuovi; la
// regola che proteggono è la stessa: niente cali a doppia cifra inventati.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, screen } from '@testing-library/react'

// ── Un database finto che rispetta le date chieste ─────────────────────────
// Un mock che risponde sempre le stesse righe qualunque date si chiedano non
// può provare un difetto che sta proprio nelle date.
let RIGHE_DB = []
function esegui(f) {
  let r = RIGHE_DB.filter(x => (!f.gte || x.data >= f.gte) && (!f.lte || x.data <= f.lte) && (!f.lt || x.data < f.lt))
  if (f.or) r = r.filter(x => x.produzione_g > 0 || x.rimanenza_g > 0 || x.scarto_g > 0)
  r = [...r].sort((a, b) => (f.desc ? b.data.localeCompare(a.data) : a.data.localeCompare(b.data)))
  if (f.limit) r = r.slice(0, f.limit)
  r = r.slice(f.da, f.a + 1)
  return { data: r, error: null }
}
function query() {
  const f = { gte: null, lte: null, lt: null, desc: false, limit: null, da: 0, a: Infinity, or: null }
  const q = new Proxy({}, { get(_t, p) {
    if (p === 'then') return (resolve) => resolve(esegui(f))
    if (p === 'gte') return (k, v) => { if (k === 'data') f.gte = v; return q }
    if (p === 'lte') return (k, v) => { if (k === 'data') f.lte = v; return q }
    if (p === 'lt') return (k, v) => { if (k === 'data') f.lt = v; return q }
    if (p === 'order') return (_k, o) => { f.desc = o?.ascending === false; return q }
    if (p === 'limit') return (n) => { f.limit = n; return q }
    if (p === 'range') return (a, b) => { f.da = a; f.a = b; return q }
    if (p === 'or') return (s) => { f.or = s; return q }
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => q
  } })
  return q
}
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: () => query(),
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  },
}))
vi.mock('../../src/lib/storage', () => ({
  sload: async (k) => (k === 'pasticceria-formati-vendita-v1'
    ? [{ id: 'f1', nome: 'Coppetta', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3, componenti: [] }]
    : null),
  ssave: async () => {}, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const {
  rigaHaDati, giorniRegistrati, confrontoPossibile, variazionePct, dataBreve, dataLunga,
} = await import('../../src/lib/produzioneAnalisi.js')
const { default: StoricoProduzioneView } = await import('../../src/views/StoricoProduzioneView.jsx')

const riga = (data, extra = {}) => ({
  sede_id: 's1', gusto_nome: 'NOCCIOLA', data, produzione_g: 5000, rimanenza_g: 1000,
  scarto_g: 0, spedito_g: 0, ricevuto_g: 0, ...extra,
})
/** Una riga al giorno dal `da` all'`a` compresi. */
function giorni(da, a, extra) {
  const out = []
  const t = new Date(`${da}T12:00:00Z`)
  const fine = new Date(`${a}T12:00:00Z`)
  while (t <= fine) { out.push(riga(t.toISOString().slice(0, 10), extra)); t.setUTCDate(t.getUTCDate() + 1) }
  return out
}

describe('Quando un giorno conta come registrato', () => {
  it('una riga tutta a zero non è una giornata registrata', () => {
    expect(rigaHaDati(riga('2026-09-07', { produzione_g: 0, rimanenza_g: 0 }))).toBe(false)
  })
  it('nemmeno una riga con 1 grammo spedito e nient\'altro (la prova di Mara del 15/09)', () => {
    expect(rigaHaDati(riga('2026-09-15', { produzione_g: 0, rimanenza_g: 0, spedito_g: 1 }))).toBe(false)
  })
  it('una rimanenza non scritta (null) da sola non conta', () => {
    expect(rigaHaDati(riga('2026-08-01', { produzione_g: 0, rimanenza_g: null }))).toBe(false)
  })
  it('un prodotto, una rimanenza o uno scarto sì', () => {
    expect(rigaHaDati(riga('2026-08-01', { rimanenza_g: 0 }))).toBe(true)
    expect(rigaHaDati(riga('2026-08-01', { produzione_g: 0 }))).toBe(true)
    expect(rigaHaDati(riga('2026-08-01', { produzione_g: 0, rimanenza_g: 0, scarto_g: 300 }))).toBe(true)
  })
})

describe('I giorni registrati di un periodo', () => {
  const righe = [
    ...giorni('2026-07-25', '2026-08-31'),
    riga('2026-09-07', { produzione_g: 0, rimanenza_g: 0 }),
    riga('2026-09-15', { produzione_g: 0, rimanenza_g: 0, spedito_g: 1 }),
  ]
  it('contano solo i giorni dentro il periodo, non i sette prima', () => {
    const g = giorniRegistrati(righe, { da: '2026-08-03', a: '2026-10-03' })
    expect(g.n).toBe(29)
    expect(g.primo).toBe('2026-08-03')
    expect(g.ultimo).toBe('2026-08-31')
  })
  it('un periodo con le sole righe vuote di settembre è vuoto', () => {
    const g = giorniRegistrati(righe, { da: '2026-09-04', a: '2026-10-03' })
    expect(g.n).toBe(0)
    expect(g.primo).toBeNull()
  })
  it('con più sedi conta le giornate di negozio', () => {
    const due = [...giorni('2026-08-01', '2026-08-10'), ...giorni('2026-08-01', '2026-08-05').map(r => ({ ...r, sede_id: 's2' }))]
    const g = giorniRegistrati(due, { da: '2026-08-01', a: '2026-08-10' })
    expect(g.n).toBe(10)
    expect(g.sedeGiorni).toBe(15)
    expect(g.perSede.s2.ultimo).toBe('2026-08-05')
  })
})

describe('Quando due periodi si possono confrontare', () => {
  it('29 giorni contro 62 no, e dice che sembrerebbe un calo', () => {
    const c = confrontoPossibile({ sedeGiorni: 29 }, { sedeGiorni: 62 })
    expect(c.ok).toBe(false)
    expect(c.motivo).toMatch(/62 giornate registrate, questo 29/)
    expect(c.motivo).toMatch(/calo/)
  })
  it('e al contrario sembrerebbe una crescita', () => {
    expect(confrontoPossibile({ sedeGiorni: 62 }, { sedeGiorni: 29 }).motivo).toMatch(/crescita/)
  })
  it('84 contro 87 sì (dentro il 10%)', () => {
    expect(confrontoPossibile({ sedeGiorni: 84 }, { sedeGiorni: 87 }).ok).toBe(true)
  })
  it('esattamente al 10% sì, appena oltre no', () => {
    expect(confrontoPossibile({ sedeGiorni: 90 }, { sedeGiorni: 100 }).ok).toBe(true)
    expect(confrontoPossibile({ sedeGiorni: 89 }, { sedeGiorni: 100 }).ok).toBe(false)
  })
  it('un periodo di confronto vuoto non si confronta', () => {
    const c = confrontoPossibile({ sedeGiorni: 30 }, { sedeGiorni: 0 })
    expect(c.ok).toBe(false)
    expect(c.motivo).toMatch(/periodo di confronto/)
  })
  it('un periodo vuoto nemmeno', () => {
    expect(confrontoPossibile({ sedeGiorni: 0 }, { sedeGiorni: 30 }).ok).toBe(false)
  })
})

describe('La variazione ha il segno giusto', () => {
  it('da -100 a -50 è un miglioramento', () => {
    expect(variazionePct(-50, -100)).toBeCloseTo(50, 6)
  })
  it('da 100 a 50 è un calo', () => {
    expect(variazionePct(50, 100)).toBeCloseTo(-50, 6)
  })
  it('da zero o da un valore che non si sa non c\'è variazione', () => {
    expect(variazionePct(50, 0)).toBeNull()
    expect(variazionePct(50, null)).toBeNull()
    expect(variazionePct(null, 10)).toBeNull()
  })
})

describe('Le date in italiano', () => {
  it('si scrivono giorno/mese, e una data storta resta vuota', () => {
    expect(dataBreve('2026-08-31')).toBe('31/08')
    expect(dataLunga('2026-08-31')).toBe('31/08/2026')
    expect(dataBreve(undefined)).toBe('')
    expect(dataLunga('ieri')).toBe('')
  })
})

// ── La pagina vera ─────────────────────────────────────────────────────────
// Dati dal 01/05 al 31/08, ogni giorno uguale (5 kg prodotti, 1 kg lasciato in
// vetrina: 5 kg venduti). Oggi è il 03/10. Prima la pagina apriva su
// 03/08-03/10 contro 02/06-02/08: 29 giorni contro 62, «↓ 53%».
const props = {
  ricettario: { ricette: {}, ingredienti_costi: {} },
  giornaliero: [], chiusure: [], logPrezzi: [],
  orgId: 'org-1', sedeId: 's1',
  sedi: [{ id: 's1', nome: 'Centro', attiva: true, is_sede_produzione: true }],
  metodoProduzione: 'inventario',
  onNavigate: () => {},
}
const testo = () => document.body.textContent || ''
// Dal 04/10/2026 la barra del periodo è un pulsante che si apre: le date e le
// scorciatoie stanno dentro, e le date scritte a mano si confermano con
// «Applica» (prima la pagina ricaricava a ogni cifra).
const apriPeriodo = () => {
  const p = screen.getByRole('button', { name: /^Periodo:/ })
  if (p.getAttribute('aria-expanded') !== 'true') fireEvent.click(p)
}
const scriviDate = (da, a) => {
  apriPeriodo()
  fireEvent.change(screen.getByLabelText('Data di inizio'), { target: { value: da } })
  fireEvent.change(screen.getByLabelText('Data di fine'), { target: { value: a } })
  fireEvent.click(screen.getByRole('button', { name: 'Applica' }))
}

describe('Lo Storico a inventario si apre sui giorni registrati', () => {
  beforeEach(() => {
    RIGHE_DB = [
      ...giorni('2026-05-01', '2026-08-31'),
      riga('2026-09-07', { produzione_g: 0, rimanenza_g: 0 }),
      riga('2026-09-15', { produzione_g: 0, rimanenza_g: 0, spedito_g: 1 }),
    ]
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-03T10:00:00'))
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('apre sui due mesi fino all\'ultimo giorno registrato, e lo dice', async () => {
    render(<StoricoProduzioneView {...props} />)
    await waitFor(() => expect(testo()).toMatch(/62 giorni registrati, dall'01\/07 al 31\/08/), { timeout: 5000 })
    expect(testo()).toMatch(/ti mostro i due mesi fino all'ultimo giorno registrato/)
    // Le date sono nella barra: si vede che periodo si sta guardando.
    expect(screen.getByRole('button', { name: /^Periodo:/ }).textContent).toMatch(/1 luglio – 31 agosto 2026/)
    apriPeriodo()
    expect(screen.getByLabelText('Data di inizio').value).toBe('2026-07-01')
    expect(screen.getByLabelText('Data di fine').value).toBe('2026-08-31')
  })

  it('non inventa un crollo: niente frecce in giù a doppia cifra', async () => {
    // Una sessione qualunque, perché la pagina di prima senza sessioni né
    // cassa non arrivava nemmeno alla sezione: così questa prova guarda il
    // confronto, e sul codice di prima trova il suo «↓ 53,2%».
    render(<StoricoProduzioneView {...props} giornaliero={[{ data: '2026-08-01', prodotti: [] }]} />)
    await waitFor(() => expect(testo()).toMatch(/sul periodo prima/), { timeout: 5000 })
    expect(testo()).not.toMatch(/↓\s*[1-9]\d,\d%/)
    expect(testo()).not.toMatch(/[−-][1-9]\d%/)
    // E il confronto è quello giusto: due mesi pieni contro due mesi pieni.
    expect(testo()).toMatch(/Confronto con 30\/04–30\/06/)
  })

  it('un periodo con i dati fermi a metà si confronta solo sul tratto registrato', async () => {
    render(<StoricoProduzioneView {...props} />)
    await waitFor(() => expect(testo()).toMatch(/giorni registrati/), { timeout: 5000 })
    scriviDate('2026-08-03', '2026-10-03')
    await waitFor(() => expect(testo()).toMatch(/29 giorni registrati, dal 03\/08 al 31\/08/), { timeout: 5000 })
    expect(testo()).toMatch(/dopo il 31\/08 non c'è niente di registrato/)
    // Il confronto è col tratto lungo uguale prima del 03/08.
    await waitFor(() => expect(testo()).toMatch(/Confronto con 05\/07–02\/08/), { timeout: 5000 })
    expect(testo()).not.toMatch(/↓\s*[1-9]\d,\d%/)
    expect(testo()).not.toMatch(/[−-][1-9]\d%/)
  })

  it('«30 giorni» senza niente registrato dice dove finiscono i dati, non -100%', async () => {
    render(<StoricoProduzioneView {...props} />)
    await waitFor(() => expect(testo()).toMatch(/giorni registrati/), { timeout: 5000 })
    apriPeriodo()
    fireEvent.click(screen.getByRole('button', { name: '30 giorni' }))
    await waitFor(() => expect(testo()).toMatch(/Nessun giorno registrato dal 03\/09\/2026 al 02\/10\/2026|Nessun giorno registrato dal 04\/09\/2026 al 03\/10\/2026/), { timeout: 5000 })
    expect(testo()).toMatch(/L'ultimo giorno registrato è il 31\/08\/2026/)
    expect(testo()).not.toMatch(/100,0%/)
    expect(screen.getByRole('button', { name: /Guarda i due mesi fino al 31\/08/ })).toBeTruthy()
  })

  it('senza giorni registrati nel periodo di confronto non mostra frecce e dice perché', async () => {
    render(<StoricoProduzioneView {...props} />)
    await waitFor(() => expect(testo()).toMatch(/giorni registrati/), { timeout: 5000 })
    scriviDate('2026-05-01', '2026-05-31')
    await waitFor(() => expect(testo()).toMatch(/31 giorni registrati, dall'01\/05 al 31\/05/), { timeout: 5000 })
    // Il pulsante lo dice in due parole; il perché sta dentro.
    await waitFor(() => expect(screen.getByRole('button', { name: /^Periodo:/ }).textContent).toMatch(/senza confronto/), { timeout: 5000 })
    apriPeriodo()
    expect(screen.getByRole('dialog').textContent).toMatch(/Nessun confronto: nel periodo di confronto non c'è nessun giorno registrato/)
    expect(testo()).not.toMatch(/[↑↓]\s*\d/)
    // Il formato nuovo delle tessere: nessuna variazione e nessun «sul periodo prima».
    expect(testo()).not.toMatch(/[+−]\d+%/)
    expect(testo()).not.toMatch(/sul periodo prima/)
  })

  it('un periodo di confronto registrato a metà non si usa: niente «+128%»', async () => {
    // 15/05-15/06: 32 giorni registrati. Il periodo prima (13/04-14/05) ne ha
    // 14, perché i dati partono il 01/05. Confrontati, il prodotto farebbe
    // più che raddoppiare.
    render(<StoricoProduzioneView {...props} />)
    await waitFor(() => expect(testo()).toMatch(/giorni registrati/), { timeout: 5000 })
    scriviDate('2026-05-15', '2026-06-15')
    await waitFor(() => expect(testo()).toMatch(/32 giorni registrati, dal 15\/05 al 15\/06/), { timeout: 5000 })
    // Il pulsante lo dice in due parole; il perché sta dentro.
    await waitFor(() => expect(screen.getByRole('button', { name: /^Periodo:/ }).textContent).toMatch(/senza confronto/), { timeout: 5000 })
    apriPeriodo()
    expect(screen.getByRole('dialog').textContent).toMatch(/Nessun confronto: il periodo di confronto ha 14 giornate registrate, questo 32/)
    expect(testo()).not.toMatch(/[↑↓]\s*\d/)
    // Il formato nuovo delle tessere: nessuna variazione e nessun «sul periodo prima».
    expect(testo()).not.toMatch(/[+−]\d+%/)
    expect(testo()).not.toMatch(/sul periodo prima/)
  })

  it('una gelateria a inventario senza sessioni né cassa non vede «Nessun dato storico»', async () => {
    render(<StoricoProduzioneView {...props} />)
    await waitFor(() => expect(testo()).toMatch(/giorni registrati/), { timeout: 5000 })
    expect(testo()).not.toMatch(/Nessun dato storico/)
  })
})
