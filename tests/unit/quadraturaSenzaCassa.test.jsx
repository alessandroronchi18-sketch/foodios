// @vitest-environment happy-dom
//
// ── La Quadratura dava -100% e suggeriva furti a chi non registra la cassa ──
//
// Trovato dall'audit della Quadratura del 03/10/2026 sui dati di Mara dei
// Boschi, che non ha NESSUNA chiusura di cassa registrata.
//
// `kpiQuadraturaSettimana` sommava le chiusure della settimana: zero chiusure,
// cassa 0 €. Lo scostamento diventava «0 meno l'atteso», cioè -100%, e la
// pagina mostrava la tessera rossa «attenzione» e il riquadro «Cosa
// controllare: porzioni più grandi… omaggi… furti interni». Ogni settimana.
// Carlina 24-30/08: -15.273 €; De Gasperi -9.650 €; Berthollet -8.758 €.
// Una cassa non scritta veniva trattata come un incasso di zero euro, e invece
// di dire «senza cassa questo conto non si può fare» la pagina indicava un
// furto. (Il test che c'era, «senza nessuna chiusura non presenta un ammanco»,
// cercava la parola «ammanco», che la pagina non ha mai scritto: passava
// anche col difetto.)
//
// Della stessa famiglia: con la cassa scritta un giorno su due, l'incasso di
// un giorno si confrontava col gelato di due, e usciva un -60% che non c'è.
// Adesso il confronto si fa solo sui giorni che hanno cassa e inventario.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'

const LUN = '2026-09-07'
// Domenica restano 400 g; lunedì si fanno 1.000 g e ne restano 600 (venduti
// 800); martedì 300 g e ne restano 200 (venduti 700). Settimana: 1,5 kg.
const RIGHE = [
  { gusto_nome: 'NOCCIOLA', data: '2026-09-06', produzione_g: 1000, rimanenza_g: 400, scarto_g: 0, spedito_g: 0 },
  { gusto_nome: 'NOCCIOLA', data: '2026-09-07', produzione_g: 1000, rimanenza_g: 600, scarto_g: 0, spedito_g: 0 },
  { gusto_nome: 'NOCCIOLA', data: '2026-09-08', produzione_g: 300, rimanenza_g: 200, scarto_g: 0, spedito_g: 0 },
]

vi.mock('../../src/lib/inventarioProduzione', async () => {
  const vero = await vi.importActual('../../src/lib/inventarioProduzione')
  return { ...vero, caricaSettimana: vi.fn(async () => RIGHE) }
})
vi.mock('../../src/lib/supabase', () => {
  const RESULT = { data: [], error: null }
  const handler = {
    get(_t, prop) {
      if (prop === 'then') return (resolve) => resolve(RESULT)
      if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve({ data: null, error: null })
      return () => new Proxy({}, handler)
    },
  }
  return {
    supabase: {
      from: () => new Proxy({}, handler),
      rpc: () => Promise.resolve({ data: null, error: null }),
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    },
  }
})
// 120 g a 4 € = 33,33 €/kg. La settimana vale 50 € stimati.
vi.mock('../../src/lib/storage', () => ({
  ssave: () => Promise.resolve(),
  sload: () => Promise.resolve([
    { id: 'f1', nome: 'Coppetta media', categoria: 'Gelato', baseQtaG: 120, prezzoDefault: 4, componenti: [] },
  ]),
  ssaveBatch: () => Promise.resolve(),
  sloadAllSedi: () => Promise.resolve({}),
}))

const { kpiQuadraturaSettimana, calcolaVendutoSettimana } = await import('../../src/lib/inventarioProduzione')
const { default: QuadraturaInventarioView } = await import('../../src/views/QuadraturaInventarioView')

const EURO_KG = 4 / 0.12
const matrice = () => calcolaVendutoSettimana(RIGHE, LUN)

describe('Il conto della Quadratura senza cassa', () => {
  it('senza chiusure la cassa non è zero: non si sa', () => {
    const k = kpiQuadraturaSettimana(matrice(), [], EURO_KG, [])
    expect(k.cassaRegistrata).toBe(false)
    expect(k.cassaEffettiva).toBeNull()
    expect(k.driftEur).toBeNull()
    expect(k.driftPct).toBeNull()
    expect(k.motivoConfronto).toMatch(/nessuna chiusura di cassa/)
  })

  it('l\'incasso stimato dall\'inventario resta: 1,5 kg × 33,33 €/kg = 50 €', () => {
    const k = kpiQuadraturaSettimana(matrice(), [], EURO_KG, [])
    expect(k.totVendutoKg).toBeCloseTo(1.5, 6)
    expect(k.ricavoAtteso).toBeCloseTo(50, 6)
  })

  it('anche null al posto dell\'elenco vuol dire «cassa non registrata»', () => {
    expect(kpiQuadraturaSettimana(matrice(), null, EURO_KG, []).cassaEffettiva).toBeNull()
  })

  it('con la cassa di un giorno su due si confronta solo quel giorno', () => {
    // Martedì: 700 g venduti = 23,33 € stimati, 20 € in cassa → -3,33 €.
    const k = kpiQuadraturaSettimana(matrice(), [{ data: '2026-09-08', totale: 20 }], EURO_KG, [])
    expect(k.giorniInventario).toBe(2)
    expect(k.giorniCassa).toBe(1)
    expect(k.giorniConfrontati).toBe(1)
    expect(k.attesoConfrontato).toBeCloseTo(0.7 * EURO_KG, 6)
    expect(k.cassaConfrontata).toBe(20)
    expect(k.driftEur).toBeCloseTo(20 - 0.7 * EURO_KG, 6)
    expect(k.driftPct).toBeCloseTo(((20 - 0.7 * EURO_KG) / (0.7 * EURO_KG)) * 100, 6)
    // Il difetto: 20 € contro i 50 € di tutta la settimana, -60%.
    expect(k.driftPct).toBeGreaterThan(-20)
  })

  it('con la cassa di tutti i giorni si confronta tutta la settimana', () => {
    const k = kpiQuadraturaSettimana(matrice(), [
      { data: '2026-09-07', totale: 30 }, { data: '2026-09-08', totale: 25 },
    ], EURO_KG, [])
    expect(k.giorniConfrontati).toBe(2)
    expect(k.driftEur).toBeCloseTo(55 - 50, 6)
  })

  it('la data di una chiusura può portare l\'ora: conta il giorno', () => {
    const k = kpiQuadraturaSettimana(matrice(), [{ data: '2026-09-08T21:30:00', totale: 20 }], EURO_KG, [])
    expect(k.giorniConfrontati).toBe(1)
  })

  it('una chiusura senza data vale per tutta la settimana, come prima', () => {
    const k = kpiQuadraturaSettimana(matrice(), [{ kpi: { totV: 60 } }], EURO_KG, [])
    expect(k.driftEur).toBeCloseTo(60 - 50, 6)
  })

  it('una cassa solo in giorni senza inventario non fa un confronto', () => {
    const k = kpiQuadraturaSettimana(matrice(), [{ data: '2026-09-11', totale: 80 }], EURO_KG, [])
    expect(k.cassaRegistrata).toBe(true)
    expect(k.cassaEffettiva).toBe(80)
    expect(k.driftEur).toBeNull()
    expect(k.motivoConfronto).toMatch(/non hanno l'inventario/)
  })

  it('l\'ingrosso di un giorno senza cassa non si toglie dal confronto', () => {
    // 0,5 kg consegnati lunedì (giorno senza cassa): il confronto di martedì
    // resta 0,7 kg al banco.
    const b2b = [{ data: '2026-09-07', righe: [{ qta: 0.5 }], totale: 10 }]
    const k = kpiQuadraturaSettimana(matrice(), [{ data: '2026-09-08', totale: 20 }], EURO_KG, b2b)
    expect(k.attesoConfrontato).toBeCloseTo(0.7 * EURO_KG, 6)
    // e la stima della settimana li toglie (1,5 - 0,5 kg al banco)
    expect(k.ricavoAtteso).toBeCloseTo(1.0 * EURO_KG, 6)
  })

  it('senza formati non c\'è confronto, e il motivo lo dice', () => {
    const k = kpiQuadraturaSettimana(matrice(), [{ data: '2026-09-08', totale: 20 }], null, [])
    expect(k.driftEur).toBeNull()
    expect(k.motivoConfronto).toMatch(/formati/)
  })
})

const props = (extra = {}) => ({
  orgId: 'org-1', sedeId: 'sede-1',
  sedi: [{ id: 'sede-1', nome: 'Centro', attiva: true, is_sede_produzione: true }],
  sedeAttiva: { id: 'sede-1', nome: 'Centro' },
  chiusure: [], metodoProduzione: 'inventario', onNavigate: () => {},
  ...extra,
})
const testo = () => document.body.textContent || ''
// «€/kg medio» c'era anche nella pagina di prima: così le prove sotto, sul
// codice di prima, cadono sulle loro asserzioni e non sull'attesa.
const pronta = () => waitFor(() => expect(testo()).toMatch(/€\/kg medio/), { timeout: 5000 })

describe('La pagina senza cassa', () => {
  beforeEach(() => { vi.setSystemTime(new Date(`${LUN}T10:00:00`)) })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('non scrive -100%, non dice «attenzione», non parla di furti', async () => {
    render(<QuadraturaInventarioView {...props()} />)
    await pronta()
    expect(testo()).not.toMatch(/-\s?100,0%/)
    expect(testo()).not.toMatch(/attenzione/i)
    expect(testo()).not.toMatch(/furt/i)
    expect(testo()).not.toMatch(/Cosa controllare/)
  })

  it('dice che la cassa non è registrata e che il confronto non si può fare', async () => {
    render(<QuadraturaInventarioView {...props()} />)
    await pronta()
    expect(testo()).toMatch(/non registrata/)
    expect(testo()).toMatch(/Senza la cassa il confronto non si può fare/)
    // e quello che si può dire: chili usciti e incasso stimato
    expect(testo()).toMatch(/1,5 kg di gelato, circa 50\s?€/)
  })

  it('porta alla Cassa per registrare l\'incasso', async () => {
    const onNavigate = vi.fn()
    render(<QuadraturaInventarioView {...props({ onNavigate })} />)
    await pronta()
    fireEvent.click(screen.getByRole('button', { name: 'Vai alla Cassa' }))
    expect(onNavigate).toHaveBeenCalledWith('chiusura')
  })

  it('con la cassa di un giorno su due dice che confronta solo quello', async () => {
    render(<QuadraturaInventarioView {...props({ chiusure: [{ data: '2026-09-08', totale: 20 }] })} />)
    await pronta()
    expect(testo()).toMatch(/La cassa c'è per 1 giorno su 2/)
    expect(testo()).not.toMatch(/-\s?60,0%/)
    expect(testo()).not.toMatch(/Senza la cassa/)
  })

  it('con la cassa vera e un ammanco grosso la diagnosi c\'è, ma senza furti', async () => {
    render(<QuadraturaInventarioView {...props({ chiusure: [
      { data: '2026-09-07', totale: 10 }, { data: '2026-09-08', totale: 10 },
    ] })} />)
    await pronta()
    expect(testo()).toMatch(/Cosa controllare/)
    expect(testo()).not.toMatch(/furt/i)
    expect(testo()).toMatch(/Rimanenze scritte male/)
  })
})
