import { describe, it, expect } from 'vitest'
import {
  parseNomeFile, lunediSettimana1DelMese, parseFoglioInventario, diffConDb,
} from '../../src/lib/inventarioImport.js'

describe('parseNomeFile', () => {
  it('riconosce mesi in lettere IT con anno a 4 cifre', () => {
    expect(parseNomeFile('inventario_giugno_2026.xlsx')).toEqual({ mese: 6, anno: 2026 })
    expect(parseNomeFile('gennaio-2025.csv')).toEqual({ mese: 1, anno: 2025 })
  })
  it('riconosce abbreviazioni IT con anno a 2 cifre', () => {
    expect(parseNomeFile('inv_giu_26.csv')).toEqual({ mese: 6, anno: 2026 })
    expect(parseNomeFile('foglio-dic-26.xlsx')).toEqual({ mese: 12, anno: 2026 })
  })
  it('riconosce formato MM-YYYY', () => {
    expect(parseNomeFile('06-2026.xlsx')).toEqual({ mese: 6, anno: 2026 })
    expect(parseNomeFile('gelati 06_2026.xls')).toEqual({ mese: 6, anno: 2026 })
  })
  it('riconosce formato YYYY-MM', () => {
    expect(parseNomeFile('2026-06_inventario.xlsx')).toEqual({ mese: 6, anno: 2026 })
  })
  it('null quando il nome non contiene un mese riconoscibile', () => {
    expect(parseNomeFile('foglio.xlsx')).toBeNull()
    expect(parseNomeFile('inventario.csv')).toBeNull()
    expect(parseNomeFile('')).toBeNull()
  })
})

describe('lunediSettimana1DelMese', () => {
  it('giugno 2026 -> primo lunedi 1 giu 2026', () => {
    // 1 giu 2026 e' lunedi
    expect(lunediSettimana1DelMese(6, 2026)).toBe('2026-06-01')
  })
  it('gennaio 2026 -> primo lunedi 5 gen 2026', () => {
    // 1 gen 2026 e' giovedi → primo lun = 5 gen
    expect(lunediSettimana1DelMese(1, 2026)).toBe('2026-01-05')
  })
})

describe('parseFoglioInventario', () => {
  it('esclude righe TOTALE/TOTALI/SUBTOTALE dai gusti', () => {
    const m = [
      ['GUSTI', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.'],
      ['',      'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.'],
      ['PISTACCHIO', 1000, 0, 1000, 0, 1000, 0, 1000, 0, 1000, 0, 1000, 0, 1000, 0],
      ['TOTALE',     5000, 0, 0,    0, 0,    0, 0,    0, 0,    0, 0,    0, 0,    0],  // riga di totale
      ['TOTALI',     0,    0, 0,    0, 0,    0, 0,    0, 0,    0, 0,    0, 0,    0],
      ['SUBTOTALE',  0,    0, 0,    0, 0,    0, 0,    0, 0,    0, 0,    0, 0,    0],
      ['TOT',        0,    0, 0,    0, 0,    0, 0,    0, 0,    0, 0,    0, 0,    0],
      ['Totale gusti tutti negozi', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ['NOCCIOLA',   500, 0, 500, 0, 500, 0, 500, 0, 500, 0, 500, 0, 500, 0],
    ]
    const out = parseFoglioInventario(m, '2026-06-01')
    expect(out.gusti).toEqual(['PISTACCHIO', 'NOCCIOLA'])
    expect(out.righe.find(r => r.gusto_nome === 'TOTALE')).toBeUndefined()
    expect(out.righe.find(r => r.gusto_nome === 'TOTALI')).toBeUndefined()
    expect(out.righe.find(r => r.gusto_nome === 'SUBTOTALE')).toBeUndefined()
  })

  it('parsa una settimana base con 2 gusti', () => {
    const m = [
      ['GUSTI', 'Rimanenza', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'VENDUTO'],
      ['',      '',          'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', ''],
      ['PISTACCHIO', 2000, 0, 1900, 0, 1600, 0, 1400, 0, 1200, 0, 2220, 0, 3100, 0, 2200, 2940],
      ['NOCCIOLA',   1700, 0, 1500, 0, 1500, 0, 1000, 0, 2200, 0, 2700, 0, 3300, 0, 4400, 7200],
    ]
    const out = parseFoglioInventario(m, '2026-06-01')
    expect(out.warnings).toEqual([])
    expect(out.gusti).toEqual(['PISTACCHIO', 'NOCCIOLA'])
    // Il PROD del lunedi (col 2) di PISTACCHIO è 0, RIMAN col 3 = 1900.
    const lun = out.righe.find(r => r.gusto_nome === 'PISTACCHIO' && r.data === '2026-06-01')
    expect(lun).toBeTruthy()
    expect(lun.produzione_g).toBe(0)
    expect(lun.rimanenza_g).toBe(1900)
  })

  it('avvisa se manca header GUSTI', () => {
    const m = [['ALTRO', 'cose'], ['x', 1]]
    const out = parseFoglioInventario(m, '2026-06-01')
    expect(out.warnings.length).toBeGreaterThan(0)
    expect(out.righe).toEqual([])
  })

  it('salta righe vuote nel mezzo', () => {
    const m = [
      ['GUSTI', 'Rimanenza', 'PROD', 'RIMAN.'],
      ['', '', 'PROD', 'RIMAN.'],
      ['PISTACCHIO', 2000, 100, 1900],
      ['', '', '', ''],
      ['NOCCIOLA', 1700, 200, 1500],
    ]
    const out = parseFoglioInventario(m, '2026-06-01')
    expect(out.gusti).toEqual(['PISTACCHIO', 'NOCCIOLA'])
  })
})

describe('diffConDb', () => {
  it('classifica nuovi/identici/divergenti', () => {
    const file = [
      { gusto_nome: 'PISTACCHIO', data: '2026-06-01', produzione_g: 100, rimanenza_g: 50 },
      { gusto_nome: 'NOCCIOLA',   data: '2026-06-01', produzione_g: 200, rimanenza_g: 80 },
      { gusto_nome: 'FIOR PANNA', data: '2026-06-01', produzione_g: 300, rimanenza_g: 0 },
    ]
    const db = [
      { gusto_nome: 'PISTACCHIO', data: '2026-06-01', produzione_g: 100, rimanenza_g: 50 },  // identico
      { gusto_nome: 'NOCCIOLA',   data: '2026-06-01', produzione_g: 250, rimanenza_g: 80 },  // divergente su prod
      { gusto_nome: 'LIMONE',     data: '2026-06-01', produzione_g: 1, rimanenza_g: 1 },     // solo_db
    ]
    const d = diffConDb(file, db)
    expect(d.identici.length).toBe(1)
    expect(d.identici[0].gusto_nome).toBe('PISTACCHIO')
    expect(d.divergenti.length).toBe(1)
    expect(d.divergenti[0].gusto_nome).toBe('NOCCIOLA')
    expect(d.divergenti[0].produzione).toEqual({ vecchio: 250, nuovo: 200 })
    expect(d.nuovi.length).toBe(1)
    expect(d.nuovi[0].gusto_nome).toBe('FIOR PANNA')
    expect(d.solo_db.length).toBe(1)
    expect(d.solo_db[0].gusto_nome).toBe('LIMONE')
  })
})
