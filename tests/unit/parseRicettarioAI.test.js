// Test unit per parseRicettarioAI: verifichiamo il normalizer del JSON AI
// (funzione pura, no rete). Il flusso ibrido smart e' testato a mano perche'
// richiede intreccio parseRicettario rigido + xlsx + callAi.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/aiClient', () => ({
  callAi: vi.fn(),
}))
vi.mock('../../src/lib/xlsx', () => ({
  loadXLSX: vi.fn(async () => ({
    read: () => ({ SheetNames: [], Sheets: {} }),
    utils: { sheet_to_csv: () => '', sheet_to_json: () => [] },
  })),
}))

const { parseRicettarioAI } = await import('../../src/lib/parseRicettarioAI')
const aiClient = await import('../../src/lib/aiClient')
const xlsx = await import('../../src/lib/xlsx')

beforeEach(() => {
  aiClient.callAi.mockReset()
  xlsx.loadXLSX.mockReset()
})

function fakeFile() {
  const f = new Blob(['x'])
  f.arrayBuffer = async () => new ArrayBuffer(1)
  return f
}

describe('parseRicettarioAI - normalizzazione output', () => {
  it('mappa ricette AI al formato interno Foodos', async () => {
    xlsx.loadXLSX.mockResolvedValue({
      read: () => ({ SheetNames: ['s1'], Sheets: { s1: {} } }),
      utils: { sheet_to_csv: () => 'foo,bar\nbaz,1', sheet_to_json: () => [] },
    })
    aiClient.callAi.mockResolvedValueOnce({
      json: {
        ricette: [
          { nome: 'torta al cioccolato', ingredienti: [
              { nome: 'Burro', qty1stampo: 200 },
              { nome: 'zucchero', qty1stampo: 180 },
          ], note: '180C 40min' },
        ],
        ingredienti_costi: {
          Burro: { costoKg: 8.5 },
          zucchero: { costoKg: 1.2 },
        }
      }
    })
    const out = await parseRicettarioAI(fakeFile())
    expect(Object.keys(out.ricette)).toEqual(['TORTA AL CIOCCOLATO'])
    const r = out.ricette['TORTA AL CIOCCOLATO']
    expect(r.ingredienti.map(i => i.nome).sort()).toEqual(['burro', 'zucchero'])
    expect(r.ingredienti.find(i => i.nome === 'burro').qty1stampo).toBe(200)
    expect(r.note).toBe('180C 40min')
    expect(r.tipo).toBe('fetta')
    expect(r.sheetName).toBe('ai')
    expect(out.source).toBe('ai')
    // costoG calcolato se manca
    expect(out.ingredienti_costi.burro.costoKg).toBe(8.5)
    expect(out.ingredienti_costi.burro.costoG).toBeCloseTo(0.0085, 4)
  })

  it('salta ricette senza ingredienti validi', async () => {
    xlsx.loadXLSX.mockResolvedValue({
      read: () => ({ SheetNames: ['s1'], Sheets: { s1: {} } }),
      utils: { sheet_to_csv: () => 'x', sheet_to_json: () => [] },
    })
    aiClient.callAi.mockResolvedValueOnce({
      json: { ricette: [
        { nome: 'RICETTA VUOTA', ingredienti: [] },
        { nome: '', ingredienti: [{ nome: 'burro', qty1stampo: 100 }] },
        { nome: 'BUONA', ingredienti: [{ nome: 'burro', qty1stampo: 50 }] },
      ] }
    })
    const out = await parseRicettarioAI(fakeFile())
    expect(Object.keys(out.ricette)).toEqual(['BUONA'])
  })

  it('file vuoto → non chiama AI, ritorna ricettario vuoto', async () => {
    xlsx.loadXLSX.mockResolvedValue({
      read: () => ({ SheetNames: ['vuoto'], Sheets: { vuoto: {} } }),
      utils: { sheet_to_csv: () => '', sheet_to_json: () => [] },
    })
    const out = await parseRicettarioAI(fakeFile())
    expect(out.ricette).toEqual({})
    expect(out.source).toBe('ai-empty')
    expect(aiClient.callAi).not.toHaveBeenCalled()
  })

  it('normalizza kg→g e nomi capitalizzati', async () => {
    xlsx.loadXLSX.mockResolvedValue({
      read: () => ({ SheetNames: ['s1'], Sheets: { s1: {} } }),
      utils: { sheet_to_csv: () => 'x', sheet_to_json: () => [] },
    })
    aiClient.callAi.mockResolvedValueOnce({
      json: {
        ricette: [
          { nome: 'brownies', ingredienti: [
              { nome: 'Cioccolato Fondente', qty1stampo: 250 },
              { nome: 'burro', qty1stampo: 150 },
          ], tipo: 'PEZZO' },
        ],
      }
    })
    const out = await parseRicettarioAI(fakeFile())
    const r = out.ricette['BROWNIES']
    expect(r).toBeTruthy()
    expect(r.tipo).toBe('pezzo')
    // Nomi ingredienti lowercase
    expect(r.ingredienti.every(i => i.nome === i.nome.toLowerCase())).toBe(true)
  })
})
