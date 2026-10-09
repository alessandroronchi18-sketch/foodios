// Le spese (F) del registro e le fatture: la stessa spesa non conta due volte (09/10/2026).
// I casi sono quelli veri di settembre (audit incassi, §3): 304,74 € con fattura.
import { describe, it, expect, vi } from 'vitest'

const fromMock = vi.fn()
vi.mock('../../src/lib/supabase', () => ({ supabase: { from: (...a) => fromMock(...a) } }))

import {
  normalizzaNome, collegaSpeseAFatture, riassuntoCollegamenti,
} from '../../src/lib/speseFatture'
import { usciteDaSottrarre } from '../../src/lib/primaNota'

const S = (id, data, importo, descrizione, documento = 'fattura') => ({ id, data, importo, descrizione, fornitore: null, documento })
const F = (id, fornitore, data_fattura, totale) => ({ id, fornitore, data_fattura, totale })

const FORNITORI = [
  { nome: 'WDD Srl', alias: ['koko'] },
  { nome: 'CESAR S.p.A.', alias: ['acqua e sapone'] },
  { nome: 'Bel Sas di Desana', alias: ['pepe'] },
  { nome: 'LA MACCHIA NERA S.n.c.', alias: [] },
]
const FATTURE = [
  F('f1', 'CESAR S.p.A.', '2026-09-06', 15.18), F('f2', 'CESAR S.p.A.', '2026-09-11', 24.31), F('f3', 'CESAR S.p.A.', '2026-09-21', 37.14),
  F('f4', 'LA MACCHIA NERA S.n.c.', '2026-09-16', 20.40), F('f5', 'LA MACCHIA NERA S.n.c.', '2026-09-18', 13.80), F('f6', 'LA MACCHIA NERA S.n.c.', '2026-09-25', 10.80),
  F('f7', 'WDD Srl', '2026-09-18', 11.85), F('f8', 'WDD Srl', '2026-09-18', 27.37), F('f9', 'WDD Srl', '2026-09-27', 38.89),
  F('f10', 'Bel Sas di Desana', '2026-09-15', 105),
  // fatture che non c'entrano
  F('x1', 'Borello', '2026-09-10', 99.9),
]
const SPESE = [
  S('s1', '2026-09-05', 15.18, 'acqua e sapone'), S('s2', '2026-09-10', 24.31, 'acqua e sapone'), S('s3', '2026-09-19', 37.14, 'acqua e sapone'),
  S('s4', '2026-09-15', 20.40, 'la macchia nera'), S('s5', '2026-09-18', 13.80, 'la macchia nera'), S('s6', '2026-09-25', 10.80, 'la macchia nera'),
  S('s7', '2026-09-17', 11.85, 'koko'), S('s8', '2026-09-23', 38.89, 'koko'), S('s9', '2026-09-08', 27.37, 'F)'),
  S('s10', '2026-09-15', 105, 'PEPE'),
  // non trovate
  S('n1', '2026-09-12', 60, 'speziale'), S('n2', '2026-09-29', 23.93, 'koko'), S('n3', '2026-09-15', 238, 'MINIMARKET'),
  // no F: non si collega mai
  S('nf', '2026-09-05', 15.18, 'acqua e sapone', 'senza'),
]

describe('nomi', () => {
  it('toglie la forma societaria e la punteggiatura', () => {
    expect(normalizzaNome('LA MACCHIA NERA S.n.c.')).toBe('la macchia nera')
    expect(normalizzaNome('CESAR S.p.A.')).toBe('cesar')
    expect(normalizzaNome('Bel Sas di Desana')).toBe('bel desana')
  })
})

describe('collegamento spese (F) - fatture sui casi di settembre', () => {
  const r = collegaSpeseAFatture(SPESE, FATTURE, FORNITORI)
  const per = Object.fromEntries(r.collegamenti.map(c => [c.spesaId, c]))

  it('le 10 spese con fattura si collegano: 304,74 €', () => {
    expect(r.collegamenti).toHaveLength(10)
    expect(riassuntoCollegamenti(r.collegamenti).sicuro + riassuntoCollegamenti(r.collegamenti).probabile).toBeCloseTo(304.74, 2)
  })
  it('fornitore noto + importo + entro 3 giorni = sicuro', () => {
    for (const id of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's10']) expect(per[id].livello).toBe('sicuro')
    expect(per.s1.fatturaId).toBe('f1')
    expect(per.s7.fatturaId).toBe('f7')
  })
  it('oltre i 3 giorni, o senza fornitore scritto, si propone soltanto', () => {
    expect(per.s8.livello).toBe('probabile')  // koko 23/9, fattura WDD 27/9: 4 giorni
    expect(per.s9.livello).toBe('probabile')  // «F)» senza nome, 10 giorni prima
    expect(per.s9.fatturaId).toBe('f8')
    expect(riassuntoCollegamenti(r.collegamenti).sicuro).toBeCloseTo(304.74 - 38.89 - 27.37, 2)
  })
  it('quelle senza fattura restano spese vere; le «no F» non si toccano', () => {
    expect(r.senzaFattura.map(s => s.id).sort()).toEqual(['n1', 'n2', 'n3'])
  })
  it('una fattura copre una spesa sola', () => {
    const due = collegaSpeseAFatture([S('a', '2026-09-05', 15.18, 'acqua e sapone'), S('b', '2026-09-06', 15.18, 'acqua e sapone')],
      [F('f1', 'CESAR S.p.A.', '2026-09-06', 15.18)], FORNITORI)
    expect(due.collegamenti).toHaveLength(1)
    expect(due.senzaFattura).toHaveLength(1)
  })
  it('senza alias «koko» non si riconosce: e il costo resta', () => {
    const senza = collegaSpeseAFatture([S('k', '2026-09-17', 11.85, 'koko')], [F('f7', 'WDD Srl', '2026-09-18', 11.85), F('f7b', 'Altro', '2026-09-17', 11.85)], [])
    expect(senza.collegamenti).toHaveLength(0)
  })
  it('importo diverso anche di un centesimo: nessun collegamento', () => {
    const r2 = collegaSpeseAFatture([S('a', '2026-09-05', 15.19, 'acqua e sapone')], FATTURE, FORNITORI)
    expect(r2.collegamenti).toHaveLength(0)
  })
})

describe('i costi contano la spesa collegata una volta sola', () => {
  const righe = (rows) => {
    const c = { select: vi.fn(() => c), eq: vi.fn(() => c), gte: vi.fn(() => c), lte: vi.fn(() => c), in: vi.fn(() => c),
      then: (ok) => ok({ data: rows, error: null }) }
    fromMock.mockReturnValue(c)
  }
  it('la spesa con fattura_id non si sottrae: va tra quelle gia\' in fattura', async () => {
    righe([
      { importo: 100, origine: 'import-registro', fattura_id: null },
      { importo: 15.18, origine: 'import-registro', fattura_id: 'f1' },
      { importo: 50, origine: 'fattura-pagata', fattura_id: null },
    ])
    const r = await usciteDaSottrarre('o', 's', '2026-09-01', '2026-09-30')
    expect(r.totale).toBe(100)
    expect(r.daFatture).toBe(65.18)
    expect(r.numeroDaFatture).toBe(2)
  })
})
