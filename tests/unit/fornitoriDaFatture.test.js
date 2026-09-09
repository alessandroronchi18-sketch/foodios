// I fornitori si ricavano dalle fatture che sono già dentro FoodOS.
//
// Le fatture entrano dallo Scadenziario, che legge gli XML. Nel database del
// 09/09/2026: Mara ha 217 fatture, 77 fornitori diversi, 82.676 € — e ZERO righe
// di anagrafica. La pagina Fornitori leggeva solo l'anagrafica scritta a mano,
// quindi le diceva "Fornitori attivi 0 · Spesa 30gg 0 €" con tutto quel dato già
// nel sistema. Per popolarla servivano 77 form compilati a mano: il match fra i
// nomi delle fatture e l'anagrafica era 0 su 77, perché nessuno lo fa.

import { describe, it, expect } from 'vitest'
import { raggruppaFornitoriDaFatture, spesaDaFatture, normNomeFornitore } from '../../src/lib/fornitoriDaFatture'

// Forma vera delle righe di `fatture` (colonne: fornitore, totale, data_fattura, iban).
const fatture = [
  { fornitore: 'MOLINO ROSSI SRL',   totale: 1200.50, data_fattura: '2026-09-01', iban: 'IT60X0542811101000000123456' },
  { fornitore: 'Molino Rossi Srl',   totale: 800.00,  data_fattura: '2026-08-15', iban: null },
  { fornitore: 'molino  rossi  srl', totale: 300.00,  data_fattura: '2026-06-01', iban: null },
  { fornitore: 'LATTERIA ALPINA',    totale: 2400.00, data_fattura: '2026-09-05', iban: null },
  { fornitore: 'LATTERIA ALPINA',    totale: 100.00,  data_fattura: '2026-01-10', iban: null },
  { fornitore: 'CONO ARTIC SRL',     totale: 450.00,  data_fattura: '2026-09-08', iban: null },
  { fornitore: '   ',                totale: 999.00,  data_fattura: '2026-09-08', iban: null }, // da ignorare
]

const OGGI = '2026-09-09'

describe('fornitori ricavati dalle fatture', () => {
  it('raggruppa le scritture diverse dello stesso fornitore', () => {
    const { daImportare } = raggruppaFornitoriDaFatture(fatture, [], OGGI)
    const molino = daImportare.find(v => v.chiave === 'MOLINO ROSSI SRL')
    // Tre scritture ("MOLINO ROSSI SRL", "Molino Rossi Srl", doppi spazi) = un fornitore.
    expect(molino.nFatture).toBe(3)
    expect(molino.totale).toBeCloseTo(2300.50, 2)
  })

  it('esclude chi è già in anagrafica, anche se scritto in modo diverso', () => {
    const esistenti = [{ nome: 'molino rossi srl' }]
    const { daImportare, giaPresenti } = raggruppaFornitoriDaFatture(fatture, esistenti, OGGI)
    expect(giaPresenti.map(v => v.chiave)).toEqual(['MOLINO ROSSI SRL'])
    expect(daImportare.map(v => v.chiave)).toEqual(['LATTERIA ALPINA', 'CONO ARTIC SRL'])
  })

  it('ordina per euro fatturati: chi conta davvero sta in cima', () => {
    const { daImportare } = raggruppaFornitoriDaFatture(fatture, [], OGGI)
    expect(daImportare.map(v => v.chiave)).toEqual(['LATTERIA ALPINA', 'MOLINO ROSSI SRL', 'CONO ARTIC SRL'])
  })

  it('calcola gli ultimi 30 giorni rispetto alla data che gli passo', () => {
    const { daImportare } = raggruppaFornitoriDaFatture(fatture, [], OGGI)
    const latteria = daImportare.find(v => v.chiave === 'LATTERIA ALPINA')
    // 2400 € del 5 settembre dentro, 100 € del 10 gennaio fuori.
    expect(latteria.totale30gg).toBeCloseTo(2400, 2)
    expect(latteria.totale).toBeCloseTo(2500, 2)
    expect(latteria.ultimaData).toBe('2026-09-05')
  })

  it('porta con sé l IBAN più recente, così non va riscritto a mano', () => {
    const { daImportare } = raggruppaFornitoriDaFatture(fatture, [], OGGI)
    const molino = daImportare.find(v => v.chiave === 'MOLINO ROSSI SRL')
    expect(molino.iban).toBe('IT60X0542811101000000123456')
    expect(daImportare.find(v => v.chiave === 'LATTERIA ALPINA').iban).toBeNull()
  })

  it('ignora le fatture senza nome fornitore invece di creare un fornitore vuoto', () => {
    const { daImportare, totaleFatture } = raggruppaFornitoriDaFatture(fatture, [], OGGI)
    expect(daImportare.some(v => !v.nome.trim())).toBe(false)
    expect(totaleFatture).toBe(6) // 7 righe, una senza nome
  })

  it('sceglie come nome la scrittura più frequente, non la prima incontrata', () => {
    const tre = [
      { fornitore: 'acme snc', totale: 10, data_fattura: '2026-01-01' },
      { fornitore: 'ACME SNC', totale: 10, data_fattura: '2026-02-01' },
      { fornitore: 'ACME SNC', totale: 10, data_fattura: '2026-03-01' },
    ]
    const { daImportare } = raggruppaFornitoriDaFatture(tre, [], OGGI)
    expect(daImportare[0].nome).toBe('ACME SNC')
  })

  it('regge liste vuote e input mancanti senza esplodere', () => {
    for (const input of [null, undefined, []]) {
      const r = raggruppaFornitoriDaFatture(input, null, OGGI)
      expect(r.daImportare).toEqual([])
      expect(r.totaleFatture).toBe(0)
    }
    expect(normNomeFornitore(null)).toBe('')
  })
})

describe('spesa calcolata sulle fatture', () => {
  it('somma il periodo e ordina per importo', () => {
    const { righe, totale, nFatture, media } = spesaDaFatture(fatture, { da: '2026-08-01', a: '2026-09-09' })
    expect(nFatture).toBe(4) // esclude giugno, gennaio e la riga senza nome
    expect(totale).toBeCloseTo(1200.50 + 800 + 2400 + 450, 2)
    expect(righe[0].nome).toBe('LATTERIA ALPINA')
    expect(media).toBeCloseTo(totale / 4, 2)
  })

  it('senza finestra temporale prende tutto', () => {
    const { nFatture } = spesaDaFatture(fatture)
    expect(nFatture).toBe(6)
  })

  it('una finestra senza fatture non produce una media inventata', () => {
    const { totale, nFatture, media, righe } = spesaDaFatture(fatture, { da: '2027-01-01', a: '2027-12-31' })
    expect(nFatture).toBe(0)
    expect(totale).toBe(0)
    expect(media).toBe(0)
    expect(righe).toEqual([])
  })
})
