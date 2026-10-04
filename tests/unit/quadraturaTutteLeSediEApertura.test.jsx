// @vitest-environment happy-dom
//
// ── La Quadratura in «Tutte le sedi» e la settimana di apertura ───────────
//
// Due difetti trovati dall'audit della Quadratura del 03/10/2026 sui dati di
// Mara dei Boschi.
//
// 1. In «Tutte le sedi» `sedeId` è null, e il caricamento usciva subito
//    (`if (!orgId || !sedeId) return`). I formati non venivano letti, l'euro
//    al chilo restava nullo e la pagina mostrava SOLO «Imposta i formati di
//    vendita» — con otto formati già impostati. Il «Dettaglio per sede» e la
//    linea delle 4 settimane stavano in rami che non si vedevano mai.
//
// 2. Si apriva sempre sulla settimana di oggi. A ottobre, per Mara (ultimo
//    giorno registrato il 31/08), una settimana vuota con «0,0 kg · 0 € ·
//    0 € · scostamento 0 €»: zero meno zero fa zero, ma la risposta vera era
//    «non lo so». L'ultima settimana con i dati era cinque clic indietro, e
//    la pagina non lo diceva.
//
// 04/10/2026: la regola è diventata «l'ultima settimana INTERA con i dati»
// (decisione del titolare; prove in quadraturaPagina, «La settimana di
// apertura»). Il finto database qui sotto risponde sempre ULTIMO, qualunque
// `finoA` gli si chieda: per questa pagina la settimana intera prima del
// 25/08 risulta senza dati, e le prove di questo file guardano il caso di
// riserva (resta la settimana dell'ultimo giorno), che vale ancora.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, screen, fireEvent } from '@testing-library/react'

const giorno = (iso, n) => { const t = new Date(`${iso}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
// Sede A: domenica 1 kg rimasto, lunedì 5 kg fatti e 2 rimasti (venduti 4).
// Sede B: domenica 0,5 kg, lunedì 3 kg fatti e 1,5 rimasti (venduti 2);
// martedì la rimanenza sale a 2,5 kg senza produzione: -1 kg, non torna.
const RIGHE = {
  A: [
    { gusto_nome: 'NOCCIOLA', data: '2026-08-23', produzione_g: 0, rimanenza_g: 1000, scarto_g: 0, spedito_g: 0 },
    { gusto_nome: 'NOCCIOLA', data: '2026-08-24', produzione_g: 5000, rimanenza_g: 2000, scarto_g: 0, spedito_g: 0 },
  ],
  B: [
    { gusto_nome: 'NOCCIOLA', data: '2026-08-23', produzione_g: 0, rimanenza_g: 500, scarto_g: 0, spedito_g: 0 },
    { gusto_nome: 'NOCCIOLA', data: '2026-08-24', produzione_g: 3000, rimanenza_g: 1500, scarto_g: 0, spedito_g: 0 },
    { gusto_nome: 'NOCCIOLA', data: '2026-08-25', produzione_g: 0, rimanenza_g: 2500, scarto_g: 0, spedito_g: 0 },
  ],
}
let ULTIMO = '2026-08-25'
const accetta = vi.fn(async () => ({}))
vi.mock('../../src/lib/inventarioProduzione', async () => {
  const vero = await vi.importActual('../../src/lib/inventarioProduzione')
  return {
    ...vero,
    caricaSettimana: vi.fn(async (_org, sede, lun) =>
      (RIGHE[sede] || []).filter(r => r.data >= giorno(lun, -7) && r.data < giorno(lun, 7))),
    accettaScostamento: (...a) => accetta(...a),
  }
})
vi.mock('../../src/lib/supabase', () => {
  const query = (tabella) => {
    const q = new Proxy({}, { get(_t, p) {
      if (p === 'then') {
        return (resolve) => resolve({
          data: tabella === 'inventario_produzione' && ULTIMO ? [{ data: ULTIMO }] : [],
          error: null,
        })
      }
      return () => q
    } })
    return q
  }
  return { supabase: { from: (t) => query(t), rpc: () => Promise.resolve({ data: null, error: null }) } }
})
vi.mock('../../src/lib/storage', () => ({
  sload: async () => [{ id: 'f1', nome: 'Coppetta', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3, componenti: [] }],
  ssave: async () => {}, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { matriceDiPiuSedi, matricePerGusto, calcolaVendutoSettimana, kpiQuadraturaSettimana } =
  await import('../../src/lib/inventarioProduzione')
const { default: QuadraturaInventarioView } = await import('../../src/views/QuadraturaInventarioView')

const LUN = '2026-08-24'
const SEDI = [
  { id: 'A', nome: 'Carlina', attiva: true, is_sede_produzione: true },
  { id: 'B', nome: 'Berthollet', attiva: true, is_sede_produzione: true },
]
const testo = () => document.body.textContent || ''

describe('Più sedi nei conti della settimana', () => {
  const mA = () => calcolaVendutoSettimana(RIGHE.A, LUN)
  const mB = () => calcolaVendutoSettimana(RIGHE.B, LUN)
  it('con una sede sola la tabella resta quella', () => {
    const m = mA()
    expect(matriceDiPiuSedi([{ sedeId: 'A', matrice: m }])).toBe(m)
  })
  it('con due sedi ogni casella si conta una volta e il venduto si somma', () => {
    const k = kpiQuadraturaSettimana(matriceDiPiuSedi([{ sedeId: 'A', matrice: mA() }, { sedeId: 'B', matrice: mB() }]), [], 30, [])
    expect(k.totVendutoKg).toBeCloseTo(4 + 2 - 1, 6)
    expect(k.celleNonQuadrate).toBe(1)
  })
  it('per gusto si sommano le celle già calcolate', () => {
    const g = matricePerGusto([{ sedeId: 'A', matrice: mA() }, { sedeId: 'B', matrice: mB() }])
    expect(g.NOCCIOLA['2026-08-24'].venduto).toBe(6000)
    expect(g.NOCCIOLA['2026-08-24'].prod).toBe(8000)
    // giorno non registrato da nessuno: resta «non lo so»
    expect(g.NOCCIOLA['2026-08-27'].venduto).toBeNull()
  })
})

describe('«Tutte le sedi»', () => {
  beforeEach(() => { ULTIMO = '2026-08-25'; accetta.mockClear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-08-26T10:00:00')) })
  afterEach(() => { cleanup(); vi.useRealTimers() })
  const apri = () => render(<QuadraturaInventarioView orgId="org-1" sedeId={null} sedi={SEDI}
    sedeAttiva={{ _all: true, nome: 'Tutte le sedi' }} chiusure={[]} metodoProduzione="inventario" onNavigate={() => {}} />)

  it('non chiede i formati che ci sono già: mostra la settimana di tutte le sedi', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/Incasso stimato/), { timeout: 5000 })
    expect(testo()).not.toMatch(/Imposta i formati di vendita/)
    expect(testo()).toMatch(/5,0 kg/)
  })

  it('il dettaglio per sede si vede, con le due sedi', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/Dettaglio per sede/), { timeout: 5000 })
    expect(testo()).toMatch(/Carlina/)
    expect(testo()).toMatch(/Berthollet/)
  })

  it('la casella che non torna dice di quale sede è, e si accetta su quella sede', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/NOCCIOLA · Berthollet/), { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: /è giusta così/i }))
    await waitFor(() => expect(accetta).toHaveBeenCalled(), { timeout: 5000 })
    expect(accetta.mock.calls[0].slice(0, 4)).toEqual(['org-1', 'B', 'NOCCIOLA', '2026-08-25'])
  })
})

describe('La settimana di apertura', () => {
  beforeEach(() => { ULTIMO = '2026-08-25'; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-03T10:00:00')) })
  afterEach(() => { cleanup(); vi.useRealTimers() })
  const apri = () => render(<QuadraturaInventarioView orgId="org-1" sedeId="A" sedi={SEDI}
    sedeAttiva={SEDI[0]} chiusure={[]} metodoProduzione="inventario" onNavigate={() => {}} />)

  it('si apre sull\'ultima settimana con i dati, e lo dice', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/Dopo il 25\/08\/2026 non c'è niente di registrato/), { timeout: 5000 })
    expect(testo()).toMatch(/24 ago - 30 ago 2026/)
    expect(testo()).toMatch(/4,0 kg/)
  })

  it('una settimana vuota dice «nessun giorno registrato», non zeri', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/24 ago - 30 ago 2026/), { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: 'Settimana corrente' }))
    await waitFor(() => expect(testo()).toMatch(/Nessun giorno registrato in questa settimana/), { timeout: 5000 })
    expect(testo()).toMatch(/L'ultimo giorno registrato è il 25\/08\/2026/)
    expect(testo()).not.toMatch(/0,0 kg/)
    fireEvent.click(screen.getByRole('button', { name: 'Vai a quella settimana' }))
    await waitFor(() => expect(testo()).toMatch(/4,0 kg/), { timeout: 5000 })
  })

  it('con i dati di questa settimana resta su questa settimana', async () => {
    ULTIMO = '2026-10-02'
    apri()
    await waitFor(() => expect(testo()).toMatch(/28 set - 04 ott 2026/), { timeout: 5000 })
    expect(testo()).not.toMatch(/ti mostro l'ultima settimana/)
  })
})
