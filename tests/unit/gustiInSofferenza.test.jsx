// @vitest-environment happy-dom
//
// ── «Gusti in sofferenza» misurava un'altra cosa ──────────────────────────
//
// Trovato dall'audit della Quadratura del 03/10/2026. `classificaGusti`
// divideva il residuo medio di UN giorno per la produzione di TUTTA la
// settimana, mentre la pagina scriveva «residuo medio ≥ 50% della produzione
// giornaliera». Uscivano i gusti fatti di rado, non quelli che restano
// invenduti: De Gasperi 17-23/08, MANGO al 149% (12,0 kg di residuo su 8,0 kg
// prodotti nella settimana), LIMONE al 100%. E un gusto rimasto in vetrina
// senza essere rifatto non poteva comparire mai: si divideva per zero
// produzione e si scartava.
//
// La misura adesso è quella del banco: per quanti giorni di vendita basta
// quello che resta in vetrina (rimanenza media / venduto medio di un giorno),
// in sofferenza da 3 giorni in su. Sui dati veri: MANGO a De Gasperi 7,7
// giorni (12,0 kg in vetrina, ne vende 1,6 al giorno) resta in sofferenza;
// LIMONE 2,3 giorni no.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'

vi.mock('../../src/lib/supabase', () => {
  const q = new Proxy({}, { get(_t, p) {
    if (p === 'then') return (resolve) => resolve({ data: [], error: null })
    return () => q
  } })
  return { supabase: { from: () => q, rpc: () => Promise.resolve({ data: null, error: null }) } }
})
vi.mock('../../src/lib/storage', () => ({
  sload: async () => [{ id: 'f1', nome: 'Coppetta', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3, componenti: [] }],
  ssave: async () => {}, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))
let RIGHE = []
vi.mock('../../src/lib/inventarioProduzione', async () => {
  const vero = await vi.importActual('../../src/lib/inventarioProduzione')
  return { ...vero, caricaSettimana: vi.fn(async () => RIGHE) }
})

const { classificaGusti, GIORNI_VETRINA_SOFFERENZA } = await import('../../src/lib/inventarioProduzione')
const { default: QuadraturaInventarioView } = await import('../../src/views/QuadraturaInventarioView')

/** Una settimana di celle già calcolate: { venduto, prod, riman } per giorno. */
const settimana = (celle) => Object.fromEntries(celle.map((c, i) => [`2026-08-1${7 + i}`, { registrata: true, ...c }]))

describe('Quando un gusto è in sofferenza', () => {
  it('la soglia è di 3 giorni di vendita', () => {
    expect(GIORNI_VETRINA_SOFFERENZA).toBe(3)
  })

  it('MANGO: 12 kg in vetrina, ne vende 1,6 al giorno → 7,5 giorni, in sofferenza', () => {
    const m = { MANGO: settimana([
      { prod: 8000, venduto: 1600, riman: 12000 }, { prod: 0, venduto: 1600, riman: 12000 },
      { prod: 0, venduto: 1600, riman: 12000 }, { prod: 0, venduto: 1600, riman: 12000 },
    ]) }
    const { sofferenza, totale } = classificaGusti(m)
    expect(totale[0].giorniVetrina).toBeCloseTo(7.5, 6)
    expect(sofferenza.map(s => s.gusto)).toEqual(['MANGO'])
  })

  it('un gusto fatto di rado ma che vende non soffre (prima sì: 63%)', () => {
    // 8 kg fatti una volta, 5 kg in vetrina in media, ne vende 5 al giorno.
    // Vecchia regola: 5 / 8 = 0,625 ≥ 0,5 → «in sofferenza». Falso.
    const m = { PISTACCHIO: settimana([
      { prod: 8000, venduto: 5000, riman: 5000 }, { prod: 0, venduto: 5000, riman: 5000 },
    ]) }
    const { sofferenza, totale } = classificaGusti(m)
    expect(totale[0].giorniVetrina).toBeCloseTo(1, 6)
    expect(sofferenza).toEqual([])
  })

  it('un gusto rimasto in vetrina senza essere rifatto può soffrire (prima mai)', () => {
    const m = { ZUCCA: settimana([
      { prod: 0, venduto: 500, riman: 4000 }, { prod: 0, venduto: 500, riman: 4000 },
    ]) }
    expect(classificaGusti(m).sofferenza.map(s => s.gusto)).toEqual(['ZUCCA'])
  })

  it('i giorni senza venduto calcolabile non abbassano la media', () => {
    const m = { MENTA: settimana([
      { prod: 1000, venduto: 1000, riman: 3500 }, { prod: 1000, venduto: null, riman: 3500 },
    ]) }
    // venduto medio 1 kg (un giorno solo), non 0,5 kg: 3,5 giorni.
    expect(classificaGusti(m).totale[0].giorniVetrina).toBeCloseTo(3.5, 6)
  })

  it('con un venduto negativo (caselle da sistemare) i giorni non si possono dire', () => {
    const m = { FICO: settimana([{ prod: 0, venduto: -2000, riman: 5000 }]) }
    const { totale, sofferenza } = classificaGusti(m)
    expect(totale[0].giorniVetrina).toBeNull()
    expect(sofferenza).toEqual([])
  })

  it('i gusti più fermi vengono per primi', () => {
    const m = {
      A: settimana([{ prod: 0, venduto: 1000, riman: 4000 }]),
      B: settimana([{ prod: 0, venduto: 1000, riman: 9000 }]),
    }
    expect(classificaGusti(m).sofferenza.map(s => s.gusto)).toEqual(['B', 'A'])
  })
})

describe('La pagina scrive i giorni, e la regola vera', () => {
  afterEach(() => { cleanup(); vi.useRealTimers() })
  it('«7,5 giorni», non una percentuale della produzione', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-19T10:00:00'))
    RIGHE = [
      { gusto_nome: 'MANGO', data: '2026-08-16', produzione_g: 0, rimanenza_g: 13600, scarto_g: 0, spedito_g: 0 },
      { gusto_nome: 'MANGO', data: '2026-08-17', produzione_g: 0, rimanenza_g: 12000, scarto_g: 0, spedito_g: 0 },
      { gusto_nome: 'MANGO', data: '2026-08-18', produzione_g: 1600, rimanenza_g: 12000, scarto_g: 0, spedito_g: 0 },
    ]
    render(<QuadraturaInventarioView orgId="org-1" sedeId="dg" sedi={[{ id: 'dg', nome: 'De Gasperi', attiva: true, is_sede_produzione: true }]}
      sedeAttiva={{ id: 'dg', nome: 'De Gasperi' }} chiusure={[]} metodoProduzione="inventario" onNavigate={() => {}} />)
    await waitFor(() => expect(document.body.textContent).toMatch(/Gusti in sofferenza/), { timeout: 5000 })
    const t = document.body.textContent
    expect(t).toMatch(/7,5 giorni/)
    expect(t).toMatch(/giorni di vendita o più/)
    expect(t).not.toMatch(/della produzione giornaliera/)
  })
})
