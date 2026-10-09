// La sede proposta per le fatture che non ce l'hanno (09/10/2026). Non sposta niente.
import { describe, it, expect } from 'vitest'
import { proponiSedeFatture } from '../../src/lib/sedeFatture'

const F = (id, fornitore, data_fattura, totale) => ({ id, fornitore, data_fattura, totale })
const FORNITORI = [
  { nome: 'WDD Srl', alias: ['koko'] },
  { nome: 'CESAR S.p.A.', alias: ['acqua e sapone'] },
  { nome: 'LA MACCHIA NERA S.n.c.', alias: ['macch ner'] },
  { nome: 'CONO ARTIC', alias: [] },
]
const SPESE = [
  { data: '2026-09-05', importo: 15.18, descrizione: 'acqua e sapone', documento: 'fattura', sede: 'BER' },
  { data: '2026-09-17', importo: 11.85, descrizione: 'koko', documento: 'fattura', sede: 'DEG' },
  { data: '2026-09-29', importo: 23.93, descrizione: 'koko', documento: 'fattura', sede: 'DEG' },
  { data: '2026-09-15', importo: 20.4, descrizione: 'MACCH.NER', documento: 'fattura', sede: 'BER' },
  { data: '2026-09-20', importo: 9.99, descrizione: 'la macchia nera', documento: 'fattura', sede: 'DEG' },
]
const FATTURE = [
  F('c1', 'CESAR S.P.A.', '2026-09-06', 15.18), // collegata
  F('c2', 'CESAR S.P.A.', '2026-08-01', 70),    // stesso fornitore, sempre Berthollet
  F('w1', 'WDD SRL', '2026-09-18', 11.85),      // collegata
  F('w2', 'WDD SRL', '2026-08-02', 40),         // koko sempre De Gasperi
  F('m1', 'LA MACCHIA NERA S.N.C.', '2026-09-16', 20.4),
  F('m2', 'LA MACCHIA NERA S.N.C.', '2026-08-03', 12),   // compare in due negozi
  F('x1', 'CONO ARTIC COMMERCIALE SRL', '2026-08-04', 300), // mai nel registro
]

describe('proponiSedeFatture', () => {
  const { proposte } = proponiSedeFatture({ fatture: FATTURE, spese: SPESE, fornitori: FORNITORI })
  const p = Object.fromEntries(proposte.map(x => [x.fatturaId, x]))
  it('la fattura collegata a una spesa prende la sede della spesa', () => {
    expect(p.c1).toMatchObject({ sedi: ['BER'], forza: 'sicura' })
    expect(p.w1).toMatchObject({ sedi: ['DEG'], forza: 'sicura' })
    expect(p.m1).toMatchObject({ sedi: ['BER'], forza: 'sicura' })
  })
  it('un fornitore che nel registro sta in un negozio solo: tutte le sue fatture li', () => {
    expect(p.c2).toMatchObject({ sedi: ['BER'], forza: 'probabile' })
    expect(p.w2).toMatchObject({ sedi: ['DEG'], forza: 'probabile' })
  })
  it('un fornitore in due negozi: spesa condivisa, non si sceglie', () => {
    expect([...p.m2.sedi].sort()).toEqual(['BER', 'DEG'])
    expect(p.m2.motivo).toMatch(/condivisa/)
  })
  it('un fornitore mai visto nel registro: nessuna proposta, si chiede', () => {
    expect(p.x1).toMatchObject({ sedi: [], forza: 'nessuna' })
  })
  it('non scrive niente: le fatture in ingresso restano com\'erano', () => {
    expect(FATTURE.every(f => !('sede_id' in f))).toBe(true)
  })
})
