import { describe, it, expect } from 'vitest'
import {
  parseNomeFile, lunediSettimana1DelMese, parseFoglioInventario, diffConDb,
  classificaSheet, normNomeSede, trovaSedePerSheet,
  parseFoglioRistoranti, excelDateToIso, parseFoglioAltriProdotti,
  parseFoglioSprechi, checkTotaliCrossSheet,
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

describe('excelDateToIso', () => {
  it('null/empty -> null', () => {
    expect(excelDateToIso(null)).toBeNull()
    expect(excelDateToIso('')).toBeNull()
  })
  it('stringa ISO -> taglia ai primi 10', () => {
    expect(excelDateToIso('2026-06-17T10:00:00Z')).toBe('2026-06-17')
    expect(excelDateToIso('2026-06-17')).toBe('2026-06-17')
  })
  it('stringa dd/mm/yyyy -> ISO', () => {
    expect(excelDateToIso('17/06/2026')).toBe('2026-06-17')
    expect(excelDateToIso('1/6/26')).toBe('2026-06-01')
    expect(excelDateToIso('17-06-2026')).toBe('2026-06-17')
  })
  it('stringa non parsabile -> null', () => {
    expect(excelDateToIso('non una data')).toBeNull()
  })
  it('Excel serial number -> ISO', () => {
    expect(excelDateToIso(45993)).toBe('2025-12-02')
  })
  it('stringa numerica -> trattata come serial', () => {
    expect(excelDateToIso('45993')).toBe('2025-12-02')
  })
})

describe('normNomeSede', () => {
  it('normalizza minuscole e rimuove non alfanumerici', () => {
    expect(normNomeSede('DE GASPERI')).toBe('degasperi')
    expect(normNomeSede('de-gasperi')).toBe('degasperi')
    expect(normNomeSede('Carlina!')).toBe('carlina')
  })
  it('input nullo/empty -> stringa vuota', () => {
    expect(normNomeSede(null)).toBe('')
    expect(normNomeSede('')).toBe('')
    expect(normNomeSede(undefined)).toBe('')
  })
})

describe('trovaSedePerSheet', () => {
  const sedi = [
    { id: 1, nome: 'Carlina' },
    { id: 2, nome: 'De Gasperi' },
    { id: 3, nome: 'Berthollet' },
  ]
  it('match esatto su nome normalizzato', () => {
    expect(trovaSedePerSheet('CARLINA', sedi)).toEqual(sedi[0])
    expect(trovaSedePerSheet('de gasperi', sedi)).toEqual(sedi[1])
  })
  it('match substring (sheet contiene nome sede o viceversa)', () => {
    expect(trovaSedePerSheet('Sede Carlina centro', sedi)).toEqual(sedi[0])
  })
  it('null se non trova', () => {
    expect(trovaSedePerSheet('XYZ', sedi)).toBeNull()
  })
  it('null se input invalido', () => {
    expect(trovaSedePerSheet('Carlina', null)).toBeNull()
    expect(trovaSedePerSheet('', sedi)).toBeNull()
  })
})

describe('parseFoglioRistoranti', () => {
  it('parsa righe con header RISTORANTE/DATA/GUSTO', () => {
    const m = [
      ['PRODUZIONE PER RISTORANTI'],
      ['RISTORANTE', 'DATA', 'GUSTO', 'KG', 'PAGAMENTO', 'NEGOZIO'],
      ['Hotel Sole', '15/06/2026', 'Pistacchio', 5, 'Bonifico', 'CARLINA'],
      ['Bar Vista', 45993, 'Nocciola', 2.5, '', ''],
      ['', '', '', '', '', ''],         // riga vuota
      ['Pizz. Mario', '16/06/2026', 'TOTALE', 1, '', ''],  // filtrata
      ['Hotel X', '17/06/2026', 'fragola', 0, '', ''],     // qta=0 saltata
    ]
    const out = parseFoglioRistoranti(m)
    expect(out.warnings).toEqual([])
    expect(out.righe.length).toBe(2)
    expect(out.righe[0]).toMatchObject({ cliente: 'Hotel Sole', gusto: 'PISTACCHIO', qta: 5, pagamento: 'Bonifico', sedeNome: 'CARLINA' })
    expect(out.righe[1].dataIso).toBe('2025-12-02')
  })
  it('warning se header non trovato', () => {
    const m = [['foo', 'bar'], ['a', 'b']]
    const out = parseFoglioRistoranti(m)
    expect(out.warnings.length).toBeGreaterThan(0)
    expect(out.righe).toEqual([])
  })
  it('matrice vuota -> ritorna struttura vuota senza errori', () => {
    expect(parseFoglioRistoranti([])).toEqual({ righe: [], warnings: [] })
    expect(parseFoglioRistoranti(null)).toEqual({ righe: [], warnings: [] })
  })
})

describe('parseFoglioAltriProdotti', () => {
  it('parsa header SEDE CATEGORIA + righe per giorno', () => {
    const m = [
      [null, 'BERTHOLLET PASTORIZZATA', 'CARLINA PASTORIZZATA', null, 'BERTHOLLET CIOCCOLATA'],
      [1, 0.5, 1.0, null, 0.8],
      [2, 0, 2.5, null, 0],
      [3, '', '', '', ''],                // riga vuota - skip
      [99, 1, 1, 1, 1],                   // giorno fuori range - skip
    ]
    const out = parseFoglioAltriProdotti(m)
    expect(out.warnings).toEqual([])
    // Cattura: giorno 1 BERTH PAST 500g, CARL PAST 1000g, BERTH CIOC 800g; giorno 2 CARL PAST 2500g
    expect(out.righe.length).toBe(4)
    const r = out.righe.find(x => x.giornoMese === 1 && x.sedeNome === 'BERTHOLLET' && x.gusto === 'PASTORIZZATA')
    expect(r).toBeTruthy()
    expect(r.qtaG).toBe(500)
  })
  it('warning se header categorie non trovato', () => {
    const m = [['niente', 'di', 'noto']]
    const out = parseFoglioAltriProdotti(m)
    expect(out.warnings.length).toBeGreaterThan(0)
  })
  it('matrice vuota -> output vuoto', () => {
    expect(parseFoglioAltriProdotti([])).toEqual({ righe: [], warnings: [] })
  })
})

describe('parseFoglioSprechi', () => {
  it('parsa righe con NEGOZIO/KG/GUSTO/MOTIVO', () => {
    const m = [
      ['GELATO ELIMINATO'],
      ['NEGOZIO', 'KG', 'GUSTO', 'MOTIVO'],
      ['CARLINA', 2.5, 'Pistacchio', 'Scaduto'],
      ['BERTHOLLET', 1, 'TOTALE', 'X'],   // filtrato (totale)
      ['', 1, 'Nocciola', ''],            // sedeNome vuota -> skip
      ['CARLINA', 0, 'Fragola', ''],      // qta 0 -> skip
      ['DE GASPERI', 3, 'fior panna', 'Spalmato'],
    ]
    const out = parseFoglioSprechi(m)
    expect(out.warnings).toEqual([])
    expect(out.righe.length).toBe(2)
    expect(out.righe[0]).toMatchObject({ sedeNome: 'CARLINA', qta: 2.5, gusto: 'PISTACCHIO', motivo: 'Scaduto' })
    expect(out.righe[1]).toMatchObject({ sedeNome: 'DE GASPERI', gusto: 'FIOR PANNA' })
  })
  it('warning se header non trovato', () => {
    const out = parseFoglioSprechi([['foo'], ['bar']])
    expect(out.warnings.length).toBeGreaterThan(0)
  })
  it('vuoto -> struttura vuota', () => {
    expect(parseFoglioSprechi([])).toEqual({ righe: [], warnings: [] })
  })
})

describe('classificaSheet', () => {
  // Mock minimo XLSX: l'unica API usata e' utils.sheet_to_json (header:1).
  // Restituiamo direttamente la matrice gia' associata al sheet.
  const fakeXLSX = {
    utils: {
      sheet_to_json: (ws) => ws.__matrix || [],
    },
  }

  it('identifica sede produttiva (GUSTI + PROD)', () => {
    const ws = { __matrix: [['GUSTI', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.']] }
    const wb = { SheetNames: ['CARLINA'], Sheets: { CARLINA: ws } }
    const out = classificaSheet(fakeXLSX, wb)
    expect(out.sedi.length).toBe(1)
    expect(out.sedi[0].sheetName).toBe('CARLINA')
  })
  it('identifica sheet TOTALI via header VENDUTO SETTIMANA', () => {
    const ws = { __matrix: [['GUSTO', 'VENDUTO SETTIMANA 1', 'TOTALE MESE']] }
    const wb = { SheetNames: ['Riepilogo'], Sheets: { Riepilogo: ws } }
    const out = classificaSheet(fakeXLSX, wb)
    expect(out.totali).toBeTruthy()
    expect(out.totali.sheetName).toBe('Riepilogo')
  })
  it('identifica sheet B2B (RISTORANTE + DATA)', () => {
    const ws = { __matrix: [['RISTORANTE', 'DATA', 'GUSTO', 'KG']] }
    const wb = { SheetNames: ['Vendite Ristoranti'], Sheets: { 'Vendite Ristoranti': ws } }
    const out = classificaSheet(fakeXLSX, wb)
    expect(out.b2b).toBeTruthy()
  })
  it('identifica sprechi (NEGOZIO + KG + MOTIVO)', () => {
    const ws = { __matrix: [['NEGOZIO', 'KG', 'GUSTO', 'MOTIVO']] }
    const wb = { SheetNames: ['Eliminato'], Sheets: { Eliminato: ws } }
    const out = classificaSheet(fakeXLSX, wb)
    expect(out.sprechi).toBeTruthy()
  })
  it('identifica altri prodotti (PASTORIZZATA in header)', () => {
    const ws = { __matrix: [[null, 'BERTHOLLET PASTORIZZATA', 'CARLINA CIOCCOLATA']] }
    const wb = { SheetNames: ['Altri'], Sheets: { Altri: ws } }
    const out = classificaSheet(fakeXLSX, wb)
    expect(out.altri_prod).toBeTruthy()
  })
  it('fallback per nome: sheet sconosciuto -> finisce in altri[]', () => {
    const ws = { __matrix: [['x', 'y'], ['1', '2']] }
    const wb = { SheetNames: ['Foglio1'], Sheets: { Foglio1: ws } }
    const out = classificaSheet(fakeXLSX, wb)
    expect(out.altri.length).toBe(1)
  })
  it('skip sheet null', () => {
    const wb = { SheetNames: ['A'], Sheets: { A: null } }
    const out = classificaSheet(fakeXLSX, wb)
    expect(out.sedi).toEqual([])
    expect(out.altri).toEqual([])
  })
})

describe('checkTotaliCrossSheet', () => {
  it('matrice vuota -> coerente, niente divergenze', () => {
    expect(checkTotaliCrossSheet([], [])).toEqual({ coerente: true, divergenze: [] })
  })
  it('warning se colonna "TOTALE GUSTI TUTTI NEGOZI" non trovata', () => {
    const out = checkTotaliCrossSheet([], [['GUSTO', 'altra colonna'], ['', '']])
    expect(out.warning).toBeTruthy()
    expect(out.coerente).toBe(true)
  })
  it('rileva divergenza grossolana sul produzione cumulato', () => {
    const perSede = [[
      { gusto_nome: 'PISTACCHIO', produzione_g: 1000, rimanenza_g: 0 },
      { gusto_nome: 'PISTACCHIO', produzione_g: 1000, rimanenza_g: 0 },
    ]]
    const totali = [
      ['GUSTO', 'TOTALE GUSTI TUTTI NEGOZI'],
      ['', ''],
      ['PISTACCHIO', 10000],  // dichiarato 10000 vs calcolato 2000 -> divergenza
    ]
    const out = checkTotaliCrossSheet(perSede, totali)
    expect(out.coerente).toBe(false)
    expect(out.divergenze.length).toBe(1)
    expect(out.divergenze[0].gusto).toBe('PISTACCHIO')
  })
  it('valori coerenti -> nessuna divergenza', () => {
    const perSede = [[
      { gusto_nome: 'NOCCIOLA', produzione_g: 1000, rimanenza_g: 0 },
    ]]
    const totali = [
      ['GUSTO', 'TOTALE GUSTI TUTTI NEGOZI'],
      ['', ''],
      ['NOCCIOLA', 1000],
    ]
    const out = checkTotaliCrossSheet(perSede, totali)
    expect(out.coerente).toBe(true)
    expect(out.divergenze.length).toBe(0)
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
