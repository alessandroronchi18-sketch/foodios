// @vitest-environment happy-dom
//
// ── «Torna il conto?» con le prime chiusure vere (05/10/2026) ───────────────
//
// Fino al 04/10 Mara non aveva nessuna chiusura registrata. Il 05/10 Carlina
// ne ha 40 (agosto 18 giorni, 31.339,41 €; settembre 22 giorni, 44.848,60 €,
// IVA compresa); Berthollet e De Gasperi zero.
//
// DIFETTO: in «Tutte le sedi», 24-30/08, la pagina diceva «-19.007 € · il
// conto non torna (-62,1%)» e «Il conto torna in 0 settimane su 4». Sommava
// l'inventario delle TRE sedi (30.619 €) e lo confrontava con la cassa di UNA
// (11.612 €). Carlina da sola: 517,9 kg, 13.884 € lordi, contro una cassa di
// 11.612 € senza IVA: torna. In più la pagina scriveva «la cassa arriva già
// sommata e non si separa per sede», non vero da quando le chiusure portano
// la sede. E davanti a uno scarto grande offriva un elenco di ipotesi
// (omaggi, errori di scontrino) senza guardare i giorni.
//
// Qui: la differenza si calcola solo sulle sedi che hanno la cassa, e lo si
// dice; giorno per giorno; le rimanenze a 0 si dicono per quello che sono.
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'

const giorno = (iso, n) => { const t = new Date(`${iso}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
// Carlina: lunedì 24 si fanno 5 kg e ne restano 2 (venduti 4 kg); martedì 25
// niente produzione, resta 0: venduti 2 kg. Berthollet: 1,5 kg lunedì, nessuna cassa.
const RIGHE = {
  A: [
    { gusto_nome: 'NOCCIOLA', data: '2026-08-23', produzione_g: 0, rimanenza_g: 1000, scarto_g: 0, spedito_g: 0 },
    { gusto_nome: 'NOCCIOLA', data: '2026-08-24', produzione_g: 5000, rimanenza_g: 2000, scarto_g: 0, spedito_g: 0 },
    { gusto_nome: 'NOCCIOLA', data: '2026-08-25', produzione_g: 0, rimanenza_g: 0, scarto_g: 0, spedito_g: 0 },
  ],
  B: [
    { gusto_nome: 'NOCCIOLA', data: '2026-08-23', produzione_g: 0, rimanenza_g: 500, scarto_g: 0, spedito_g: 0 },
    { gusto_nome: 'NOCCIOLA', data: '2026-08-24', produzione_g: 2500, rimanenza_g: 1000, scarto_g: 0, spedito_g: 0 },
    { gusto_nome: 'NOCCIOLA', data: '2026-08-25', produzione_g: 0, rimanenza_g: 1000, scarto_g: 0, spedito_g: 0 },
  ],
}
vi.mock('../../src/lib/inventarioProduzione', async () => {
  const vero = await vi.importActual('../../src/lib/inventarioProduzione')
  return { ...vero, caricaSettimana: vi.fn(async (_o, sede, lun) => (RIGHE[sede] || []).filter(r => r.data >= giorno(lun, -7) && r.data < giorno(lun, 7))) }
})
vi.mock('../../src/lib/supabase', () => {
  const query = (t) => { const q = new Proxy({}, { get(_x, p) { if (p === 'then') return (ok) => ok({ data: t === 'inventario_produzione' ? [{ data: '2026-08-25' }] : [], error: null }); return () => q } }); return q }
  return { supabase: { from: (t) => query(t), rpc: () => Promise.resolve({ data: null, error: null }) } }
})
vi.mock('../../src/lib/storage', () => ({
  // 100 g a 3,30 € = 33 €/kg
  sload: async () => [{ id: 'f1', nome: 'Coppetta', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3.3, componenti: [] }],
  ssave: async () => {}, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { kpiQuadraturaSedi, giorniDelConfronto, spiegaConfronto } = await import('../../src/lib/quadraturaCassa')
const { calcolaVendutoSettimana, kpiQuadraturaSettimana, matriceDiPiuSedi } = await import('../../src/lib/inventarioProduzione')
const { testoCassaSede } = await import('../../src/views/quadratura/SediSettimana')
const { vociCoperturaQuadratura } = await import('../../src/views/quadratura/copertura')
const { default: QuadraturaInventarioView } = await import('../../src/views/QuadraturaInventarioView')

const LUN = '2026-08-24'
const mA = () => calcolaVendutoSettimana(RIGHE.A, LUN)
const mB = () => calcolaVendutoSettimana(RIGHE.B, LUN)
const MATRICI = () => [{ sedeId: 'A', matrice: mA() }, { sedeId: 'B', matrice: mB() }]
// Carlina incassa 4 kg x 33 € = 132 € lunedì, 2 kg = 66 € martedì.
const CH = [
  { data: '2026-08-24', sede_id: 'A', kpi: { totV: 132 } },
  { data: '2026-08-25', sede_id: 'A', kpi: { totV: 66 } },
]
const nome = (id) => ({ A: 'Carlina', B: 'Berthollet' }[id] || '')

describe('il difetto: tre sedi di inventario contro la cassa di una', () => {
  it('prima (kpiQuadraturaSettimana sulla matrice di tutte) la differenza era enorme', () => {
    const vecchio = kpiQuadraturaSettimana(matriceDiPiuSedi(MATRICI()), CH, 33, [])
    expect(vecchio.driftPct).toBeLessThan(-15)
  })
  it('adesso il confronto è solo su Carlina e torna', () => {
    const k = kpiQuadraturaSedi({ matrici: MATRICI(), chiusure: CH, euroKg: 33 })
    expect(k.sediConCassa).toEqual(['A'])
    expect(k.sediSenzaCassa).toEqual(['B'])
    expect(k.cassaConfrontata).toBeCloseTo(198, 6)
    expect(k.attesoConfrontato).toBeCloseTo(198, 6)
    expect(k.driftEur).toBeCloseTo(0, 6)
    expect(k.giorniConfrontati).toBe(2)
    // Il venduto resta di tutte le sedi: A 6 kg, B 2 kg = 8 kg.
    expect(k.totVendutoKg).toBeCloseTo(8, 6)
    expect(k.cassaEffettiva).toBeCloseTo(198, 6)
  })
})

describe('intorno', () => {
  it('una sede sola: identica al conto di prima', () => {
    const solo = kpiQuadraturaSedi({ matrici: [{ sedeId: 'A', matrice: mA() }], chiusure: CH.map(c => ({ ...c, sede_id: undefined })), euroKg: 33 })
    const vecchio = kpiQuadraturaSettimana(mA(), CH, 33, [])
    expect(solo.driftEur).toBe(vecchio.driftEur)
    expect(solo.sediSenzaCassa).toEqual([])
  })
  it('nessuna sede ha la cassa: non si può dire, niente differenza', () => {
    const k = kpiQuadraturaSedi({ matrici: MATRICI(), chiusure: [], euroKg: 33 })
    expect(k.driftEur).toBeNull()
    expect(k.cassaRegistrata).toBe(false)
    expect(k.sediSenzaCassa).toEqual(['A', 'B'])
  })
  it('tutte le sedi hanno la cassa: come prima', () => {
    const ch = [...CH, { data: '2026-08-24', sede_id: 'B', kpi: { totV: 66 } }]
    const k = kpiQuadraturaSedi({ matrici: MATRICI(), chiusure: ch, euroKg: 33 })
    expect(k.sediSenzaCassa).toEqual([])
    expect(k.giorniConfrontati).toBe(2)
  })
  it('una chiusura senza inventario nello stesso giorno resta fuori dal confronto', () => {
    const ch = [...CH, { data: '2026-08-28', sede_id: 'A', kpi: { totV: 500 } }]
    const k = kpiQuadraturaSedi({ matrici: MATRICI(), chiusure: ch, euroKg: 33 })
    expect(k.cassaConfrontata).toBeCloseTo(198, 6)
    expect(k.cassaEffettiva).toBeCloseTo(698, 6)
  })
})

describe('giorno per giorno', () => {
  it('solo le sedi con la cassa, un giorno per riga', () => {
    const g = giorniDelConfronto({ matrici: MATRICI(), chiusure: CH, euroKg: 33 })
    expect(g.map(x => x.data)).toEqual(['2026-08-24', '2026-08-25'])
    expect(g[0].atteso).toBeCloseTo(132, 6)
    expect(g[0].driftEur).toBeCloseTo(0, 6)
  })
  it('un giorno con la cassa ma senza inventario non è confrontato', () => {
    const g = giorniDelConfronto({ matrici: MATRICI(), chiusure: [...CH, { data: '2026-08-28', sede_id: 'A', kpi: { totV: 500 } }], euroKg: 33 })
    expect(g.find(x => x.data === '2026-08-28').confrontato).toBe(false)
  })
  it('una rimanenza a 0 si dice per quello che è, senza parlare di furti', () => {
    const giorni = [
      { data: '2026-08-24', confrontato: true, cassa: 100, atteso: 200, driftEur: -100, driftPct: -50, rimanenzaZero: 1, riparteDaZero: 0 },
      { data: '2026-08-25', confrontato: true, cassa: 200, atteso: 100, driftEur: 100, driftPct: 100, rimanenzaZero: 0, riparteDaZero: 1 },
      { data: '2026-08-26', confrontato: true, cassa: 50, atteso: 100, driftEur: -50, driftPct: -50, rimanenzaZero: 0, riparteDaZero: 0 },
    ]
    const t = spiegaConfronto(giorni).map(x => x.testo).join(' ')
    expect(t).toMatch(/rimanenza lasciata a 0/)
    expect(t).toMatch(/24\/08, 25\/08/)
    expect(t).toMatch(/26\/08 ha una differenza oltre il 15%/)
    expect(t).not.toMatch(/furt|ammanc|rub/i)
  })
  it('senza differenze grandi e senza rimanenze a 0 non inventa spiegazioni', () => {
    expect(spiegaConfronto([{ data: '2026-08-24', confrontato: true, cassa: 100, atteso: 101, driftEur: -1, driftPct: -1, rimanenzaZero: 0, riparteDaZero: 0 }])).toEqual([])
  })
})

describe('le frasi', () => {
  it('la copertura dice per quali sedi c\'è la cassa e chi non ce l\'ha', () => {
    const k = kpiQuadraturaSedi({ matrici: MATRICI(), chiusure: CH, euroKg: 33 })
    const v = vociCoperturaQuadratura({ giorni: { n: 3 }, kpi: k, euroKg: 33, nomeSede: nome }).find(x => x.id === 'cassa')
    expect(v.testo).toMatch(/solo per Carlina/)
    expect(v.testo).toMatch(/Berthollet non ha le chiusure/)
  })
  it('la riga della sede senza cassa e di quella con la cassa', () => {
    expect(testoCassaSede(kpiQuadraturaSettimana(mB(), [], 33, []))).toMatch(/cassa non registrata/)
    expect(testoCassaSede(kpiQuadraturaSettimana(mA(), CH, 33, []))).toMatch(/cassa .* contro .* stimati in 2 giorni/)
  })
})

describe('la pagina «Tutte le sedi» con la cassa di Carlina', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-08-26T10:00:00')) })
  afterEach(() => { cleanup(); vi.useRealTimers() })
  it('non dice «non torna» per l\'inventario di tre sedi contro la cassa di una', async () => {
    render(<QuadraturaInventarioView orgId="o1" sedeId={null}
      sedi={[{ id: 'A', nome: 'Carlina', attiva: true, is_sede_produzione: true }, { id: 'B', nome: 'Berthollet', attiva: true, is_sede_produzione: true }]}
      sedeAttiva={{ _all: true, nome: 'Tutte le sedi' }} chiusure={CH} metodoProduzione="inventario" onNavigate={() => {}} />)
    await waitFor(() => expect(document.body.textContent).toMatch(/Il confronto è fatto solo su Carlina/), { timeout: 5000 })
    const t = document.body.textContent
    expect(t).toMatch(/Berthollet non ha le chiusure registrate/)
    expect(t).not.toMatch(/il conto non torna/i)
    expect(t).not.toMatch(/non si separa per sede/)
    expect(t).not.toMatch(/Cosa controllare/)
    expect(document.querySelector('[data-confronto-giorni]')).not.toBeNull()
    expect(document.querySelector('[data-cassa-sede="B"]').textContent).toMatch(/non registrata/)
  })
})
