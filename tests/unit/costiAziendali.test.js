// costiAziendali — normalizzazione mensile + aggregazione P&L.
// Audit 2026-07-01 LOW: una_tantum spalmata su 12 mesi calendariali,
// non 30.44 giorni astronomici.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => mkChain()),
  },
}))

function mkChain(returnValue = { data: [], error: null }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    or: vi.fn(() => chain),
    update: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    single: vi.fn(async () => returnValue),
    then: (cb) => Promise.resolve(returnValue).then(cb),
  }
  return chain
}

import {
  importoMensile, totaleMensile, aggregaPerCategoria,
  CATEGORIE_DEFAULT, PERIODICITA,
  caricaCostiAziendali, salvaVoceCosto, eliminaVoceCosto,
} from '../../src/lib/costiAziendali'
import { supabase } from '../../src/lib/supabase'

describe('costanti', () => {
  it('CATEGORIE_DEFAULT contiene categorie standard', () => {
    const ids = CATEGORIE_DEFAULT.map(c => c.id)
    expect(ids).toContain('consumabili')
    expect(ids).toContain('utenze')
    expect(ids).toContain('affitti')
    expect(ids).toContain('marketing')
    expect(ids).toContain('altro')
  })

  it('PERIODICITA contiene 3 valori standard', () => {
    expect(PERIODICITA.map(p => p.id)).toEqual(['mensile', 'annuale', 'una_tantum'])
  })
})

describe('importoMensile — periodicita base', () => {
  it('mensile → importo invariato', () => {
    expect(importoMensile({ importo: 250, periodicita: 'mensile' })).toBe(250)
  })

  it('annuale → /12', () => {
    expect(importoMensile({ importo: 1200, periodicita: 'annuale' })).toBe(100)
  })

  it('default (periodicita non specificata) = mensile', () => {
    expect(importoMensile({ importo: 100 })).toBe(100)
  })

  it('importo non-finite → 0', () => {
    expect(importoMensile({ importo: 'abc', periodicita: 'mensile' })).toBe(0)
    expect(importoMensile(null)).toBe(0)
  })
})

describe('importoMensile — una_tantum (audit 2026-07-01 LOW)', () => {
  it('senza data_inizio → fallback v/12 (legacy)', () => {
    expect(importoMensile({ importo: 1200, periodicita: 'una_tantum' })).toBe(100)
  })

  it('entro 12 mesi calendariali dalla data_inizio → /12', () => {
    const voce = { importo: 1200, periodicita: 'una_tantum', data_inizio: '2026-01-15' }
    // Riferimento: 2026-06-15 (5 mesi dopo)
    expect(importoMensile(voce, '2026-06-15')).toBe(100)
  })

  it('oltre 12 mesi → 0 (no piu contributo P&L)', () => {
    const voce = { importo: 1200, periodicita: 'una_tantum', data_inizio: '2025-01-01' }
    // Riferimento 2026-06-01 = 17 mesi dopo
    expect(importoMensile(voce, '2026-06-01')).toBe(0)
  })

  it('mese 11 incluso, mese 12 escluso (boundary)', () => {
    const voce = { importo: 1200, periodicita: 'una_tantum', data_inizio: '2026-01-15' }
    expect(importoMensile(voce, '2026-12-15')).toBe(100) // m11
    expect(importoMensile(voce, '2027-01-15')).toBe(0)   // m12
  })

  it('data futura (negative monthsElapsed) → 0', () => {
    const voce = { importo: 1200, periodicita: 'una_tantum', data_inizio: '2030-01-01' }
    expect(importoMensile(voce, '2026-06-01')).toBe(0)
  })

  it('data_inizio invalida → fallback v/12', () => {
    const voce = { importo: 1200, periodicita: 'una_tantum', data_inizio: 'not-a-date' }
    expect(importoMensile(voce)).toBe(100)
  })

  it('fallback created_at se data_inizio mancante', () => {
    const voce = { importo: 1200, periodicita: 'una_tantum', created_at: '2026-01-01' }
    expect(importoMensile(voce, '2026-06-01')).toBe(100)
  })
})

describe('totaleMensile', () => {
  it('somma su voci miste', () => {
    const voci = [
      { importo: 200, periodicita: 'mensile' },
      { importo: 1200, periodicita: 'annuale' },     // 100/mese
      { importo: 600, periodicita: 'una_tantum', data_inizio: '2026-06-01' }, // 50/mese
    ]
    // Test con riferimento Date.now su una data nota:
    // (50 se 600/12 e siamo entro 12 mesi)
    const tot = totaleMensile(voci)
    // 200 + 100 + (importoMensile della una_tantum, dipende da now vs 2026-06-01)
    expect(tot).toBeGreaterThanOrEqual(300)
  })

  it('input non-array → 0', () => {
    expect(totaleMensile(null)).toBe(0)
    expect(totaleMensile(undefined)).toBe(0)
    expect(totaleMensile('x')).toBe(0)
  })

  it('array vuoto → 0', () => {
    expect(totaleMensile([])).toBe(0)
  })
})

describe('aggregaPerCategoria', () => {
  it('raggruppa per categoria con totale ordinato desc', () => {
    const voci = [
      { categoria: 'utenze', importo: 300, periodicita: 'mensile' },
      { categoria: 'utenze', importo: 100, periodicita: 'mensile' },
      { categoria: 'marketing', importo: 50, periodicita: 'mensile' },
      { categoria: 'affitti', importo: 800, periodicita: 'mensile' },
    ]
    const aggr = aggregaPerCategoria(voci)
    expect(aggr).toHaveLength(3)
    // Sorted desc per totaleMensile
    expect(aggr[0].categoria).toBe('affitti')
    expect(aggr[0].totaleMensile).toBe(800)
    expect(aggr[1].categoria).toBe('utenze')
    expect(aggr[1].totaleMensile).toBe(400)
    expect(aggr[2].categoria).toBe('marketing')
    expect(aggr[2].totaleMensile).toBe(50)
  })

  it('categoria mancante → "altro"', () => {
    const voci = [{ importo: 100, periodicita: 'mensile' }]
    const aggr = aggregaPerCategoria(voci)
    expect(aggr[0].categoria).toBe('altro')
  })

  it('lista voci puo essere null → []', () => {
    expect(aggregaPerCategoria(null)).toEqual([])
  })

  it('include lista voci nel risultato per categoria', () => {
    const voci = [
      { id: 1, categoria: 'utenze', importo: 100, periodicita: 'mensile' },
      { id: 2, categoria: 'utenze', importo: 50, periodicita: 'mensile' },
    ]
    const aggr = aggregaPerCategoria(voci)
    expect(aggr[0].voci).toHaveLength(2)
    expect(aggr[0].voci[0].id).toBe(1)
  })
})

describe('CRUD wrappers Supabase', () => {
  beforeEach(() => { supabase.from.mockClear() })

  it('caricaCostiAziendali ritorna [] su orgId mancante', async () => {
    expect(await caricaCostiAziendali(null)).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('caricaCostiAziendali chiama supabase.from("costi_aziendali")', async () => {
    await caricaCostiAziendali('org-id')
    expect(supabase.from).toHaveBeenCalledWith('costi_aziendali')
  })

  it('eliminaVoceCosto soft → update attivo:false', async () => {
    await eliminaVoceCosto('v-id', true)
    expect(supabase.from).toHaveBeenCalledWith('costi_aziendali')
    // verifica che sia stata chiamata .update
    const chain = supabase.from.mock.results[0].value
    expect(chain.update).toHaveBeenCalledWith({ attivo: false })
  })

  it('eliminaVoceCosto hard → delete fisica', async () => {
    await eliminaVoceCosto('v-id', false)
    const chain = supabase.from.mock.results[0].value
    expect(chain.delete).toHaveBeenCalled()
  })

  it('salvaVoceCosto INSERT su voce senza id', async () => {
    await salvaVoceCosto({
      organization_id: 'org', categoria: 'utenze', voce: 'Luce', importo: '150',
    })
    const chain = supabase.from.mock.results[0].value
    expect(chain.insert).toHaveBeenCalled()
    const args = chain.insert.mock.calls[0][0]
    expect(args.importo).toBe(150)  // coerced
    expect(args.periodicita).toBe('mensile') // default
  })

  it('salvaVoceCosto UPDATE su voce con id', async () => {
    await salvaVoceCosto({
      id: 'v-id', categoria: 'affitti', voce: 'Negozio',
      importo: 800, periodicita: 'mensile', attivo: true,
    })
    const chain = supabase.from.mock.results[0].value
    expect(chain.update).toHaveBeenCalled()
  })
})
