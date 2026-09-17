// @vitest-environment happy-dom
/**
 * Test hook useRicavoFlat + funzioni derivate.
 *
 * Verifica ricavo/kg per gusti gelateria: fetch formati vendita + listino
 * sede (override), calcolo avgPrezzoPerKgCategoria con fallback, ricavo
 * effettivo per gusto (rk × pesoKg) vs stampi (unita × prezzo).
 *
 * 16/09/2026: i numeri attesi di questo file sono cambiati perché è cambiata
 * la regola. Il prezzo medio al kg era la media semplice dei €/kg dei
 * formati — un cono da 100 g contava quanto una vaschetta da un chilo — ed è
 * diventato la media pesata sui grammi (`prezzoMedioAlKg.js`). Sui formati
 * veri di Mara dei Boschi la vecchia formula gonfiava ogni ricavo di gusto
 * del 6,34%.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'

// Mock Supabase: sload viene chiamato con (key, orgId, sedeId). Il router
// distingue SK_FORMATI (shared) da SK_LISTINO_SEDE (per-sede) per tornare
// i dataset del test.
const sloadMock = vi.fn()
vi.mock('../../src/lib/storage', () => ({
  sload: (key, orgId, sedeId) => sloadMock(key, orgId, sedeId),
  ssave: vi.fn(),
}))

const { useRicavoFlat } = await import('../../src/lib/useRicavoFlat.js')

const RICETTARIO = {
  ricette: {
    PISTACCHIO: { nome: 'PISTACCHIO', tipo: 'gusto', unita: 1, prezzo: 0, categoria: 'Gusto',
      ingredienti: [{ nome: 'pistacchio', qty1stampo: 1000 }] }, // 1 kg finito
    STRACCIATELLA: { nome: 'STRACCIATELLA', tipo: 'gusto', unita: 1, prezzo: 0, categoria: 'Crema',
      ingredienti: [{ nome: 'panna', qty1stampo: 800 }] }, // 0.8 kg
    TORTA: { nome: 'TORTA', tipo: 'fetta', unita: 8, prezzo: 4, categoria: 'Torte',
      ingredienti: [{ nome: 'farina', qty1stampo: 500 }] },
  },
}

const FORMATI_BASE = [
  { id: 'cono', nome: 'Cono', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3 }, // 30 €/kg
  { id: 'vasch', nome: 'Vaschetta', categoria: 'Gusto', baseQtaG: 500, prezzoDefault: 10 }, // 20 €/kg
]

describe('useRicavoFlat — ricavo/kg gusti dai Formati vendita', () => {
  beforeEach(() => {
    sloadMock.mockReset()
  })
  afterEach(() => { cleanup() })

  it('carica formati base + calcola ricavoFlatFor per categoria "Gusto"', async () => {
    sloadMock.mockImplementation((key) => {
      if (key === 'pasticceria-formati-vendita-v1') return Promise.resolve(FORMATI_BASE)
      return Promise.resolve(null)
    })
    const { result } = renderHook(() => useRicavoFlat('org-1', RICETTARIO, null))
    // Media PESATA SUI GRAMMI: 13 € su 600 g → 21,67 €/kg.
    // Fino al 16/09/2026 era la media semplice dei due €/kg, (30 + 20) / 2 =
    // 25, che fa contare un cono da 100 g quanto una vaschetta da mezzo
    // chilo. Il perché sta in `prezzoMedioAlKg.js`.
    await waitFor(() => {
      const rk = result.current.ricavoFlatFor(RICETTARIO.ricette.PISTACCHIO)
      expect(rk).toBeCloseTo(21.6667, 3)
    })
  })

  it('fallback su generic "gusto" quando la categoria del gusto non ha formati', async () => {
    sloadMock.mockImplementation((key) => {
      if (key === 'pasticceria-formati-vendita-v1') return Promise.resolve(FORMATI_BASE)
      return Promise.resolve(null)
    })
    const { result } = renderHook(() => useRicavoFlat('org-1', RICETTARIO, null))
    // Stracciatella ha categoria "Crema" senza formati match, fallback su
    // "Gusto" (generic gelateria) → 21,67 €/kg come sopra.
    await waitFor(() => {
      const rk = result.current.ricavoFlatFor(RICETTARIO.ricette.STRACCIATELLA)
      expect(rk).toBeCloseTo(21.6667, 3)
    })
  })

  it('applica override formati sede quando sedeId è passato', async () => {
    sloadMock.mockImplementation((key, orgId, sedeId) => {
      if (key === 'pasticceria-formati-vendita-v1') return Promise.resolve(FORMATI_BASE)
      if (key === 'pasticceria-listino-sede-v1' && sedeId === 'milano') {
        // Milano ha cono a €4 (override) → cambia la media
        return Promise.resolve({ ricette: {}, formati: { cono: { prezzoDefault: 4 } } })
      }
      return Promise.resolve(null)
    })
    const { result } = renderHook(() => useRicavoFlat('org-1', RICETTARIO, 'milano'))
    // Milano: cono 4 € / 100 g · vaschetta 10 € / 500 g → 14 € su 600 g =
    // 23,33 €/kg. L'override della sede si vede lo stesso: era 21,67.
    await waitFor(() => {
      const rk = result.current.ricavoFlatFor(RICETTARIO.ricette.PISTACCHIO)
      expect(rk).toBeCloseTo(23.3333, 3)
    })
  })

  it('ritorna null se nessun formato configurato', async () => {
    sloadMock.mockResolvedValue(null)
    const { result } = renderHook(() => useRicavoFlat('org-1', RICETTARIO, null))
    await waitFor(() => {
      const rk = result.current.ricavoFlatFor(RICETTARIO.ricette.PISTACCHIO)
      expect(rk).toBeNull()
    })
  })

  it('senza orgId non fa nulla (fallback prezzoBase)', async () => {
    const { result } = renderHook(() => useRicavoFlat(null, RICETTARIO, null))
    // formatiBase resta [] → byCategoria vuota → ricavoFlatFor null
    expect(result.current.ricavoFlatFor(RICETTARIO.ricette.PISTACCHIO)).toBeNull()
    expect(sloadMock).not.toHaveBeenCalled()
  })
})

describe('useRicavoFlat.ricavoEffettivo — unifica gusti e stampi', () => {
  beforeEach(() => {
    sloadMock.mockReset()
    // Default: qualsiasi sload risolve null (nessun dato). Test specifici
    // sovrascrivono con mockImplementation dove serve.
    sloadMock.mockResolvedValue(null)
  })
  afterEach(() => { cleanup() })

  it('gusto con ricavoFlat: ricavo = rk × pesoKg (pesoKg da ingredienti)', async () => {
    sloadMock.mockImplementation((key) => {
      if (key === 'pasticceria-formati-vendita-v1') return Promise.resolve(FORMATI_BASE)
      return Promise.resolve(null)
    })
    const { result } = renderHook(() => useRicavoFlat('org-1', RICETTARIO, null))
    await waitFor(() => {
      // PISTACCHIO: 1000 g ingredienti → pesoKg=1 · rk=21,67 → ricavo 21,67
      const r = result.current.ricavoEffettivo(RICETTARIO.ricette.PISTACCHIO)
      expect(r).toBeCloseTo(21.6667, 2)
    })
    // STRACCIATELLA: 800 g → pesoKg=0,8 · rk=21,67 (fallback Gusto) → 17,33
    const r2 = result.current.ricavoEffettivo(RICETTARIO.ricette.STRACCIATELLA)
    expect(r2).toBeCloseTo(17.3333, 2)
  })

  it('gusto senza ricavoFlat: ritorna 0', async () => {
    sloadMock.mockResolvedValue(null)
    const { result } = renderHook(() => useRicavoFlat('org-1', RICETTARIO, null))
    await waitFor(() => {
      const r = result.current.ricavoEffettivo(RICETTARIO.ricette.PISTACCHIO)
      expect(r).toBe(0)
    })
  })

  it('stampi/pezzi: ricavo = unita × prezzo (invariato)', async () => {
    sloadMock.mockResolvedValue(null)
    const { result } = renderHook(() => useRicavoFlat('org-1', RICETTARIO, null))
    // Non serve await: formati non toccano gli stampi
    const r = result.current.ricavoEffettivo(RICETTARIO.ricette.TORTA)
    expect(r).toBe(32) // 8 × 4
  })

  it('ricetta null / senza nome: ritorna 0', async () => {
    const { result } = renderHook(() => useRicavoFlat('org-1', RICETTARIO, null))
    expect(result.current.ricavoEffettivo(null)).toBe(0)
    expect(result.current.ricavoEffettivo({})).toBe(0)
  })
})
