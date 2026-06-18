// @vitest-environment happy-dom
// Test aggiuntivi su src/lib/importCassa.js (coverage push da 16% a 75%+).
// Non duplica i casi di importCassa.test.js (parseNum base + mergeInChiusureCassa).
import { describe, it, expect } from 'vitest'
import {
  parseNum,
  parseZucchettiCSV,
  parseZucchettiXML,
  parseCassaInCloud,
  parseSumUp,
  parseSatispay,
  parseLightspeed,
  parseSquare,
  parseTilby,
  parseRCH,
  parseOlivetti,
  parseCustom,
  parseSalvi,
  parseIndaco,
  parsePolotouch,
  autoDetectCassaFormat,
  readTextSmart,
  parseFile,
  parseFatturaXML,
  mergeInChiusureCassa,
} from '../../src/lib/importCassa.js'

// ── Detection separatore CSV ────────────────────────────────────────────────
describe('parseZucchettiCSV — detection separatore CSV', () => {
  it('separatore virgola (,)', () => {
    const csv = 'Data,Importo,IVA\n01/02/2026,"100,00","22,00"\n02/02/2026,"50,00","11,00"'
    const out = parseZucchettiCSV(csv)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ data: '2026-02-01', importo: 100, iva: 22 })
  })

  it('separatore punto e virgola (;)', () => {
    const csv = 'Data;Importo;IVA\n01/02/2026;"100,00";"22,00"\n02/02/2026;"50,00";"11,00"'
    const out = parseZucchettiCSV(csv)
    expect(out).toHaveLength(2)
    expect(out[0].importo).toBe(100)
    expect(out[1].data).toBe('2026-02-02')
  })

  it('separatore tab (\\t)', () => {
    const csv = 'Data\tImporto\tIVA\n01/02/2026\t100.00\t22.00\n02/02/2026\t50.00\t11.00'
    const out = parseZucchettiCSV(csv)
    expect(out).toHaveLength(2)
    expect(out[0].data).toBe('2026-02-01')
    expect(out[1].importo).toBe(50)
  })

  it('aggrega per giorno se più righe stessa data', () => {
    const csv = 'Data;Importo;IVA\n01/02/2026;50;11\n01/02/2026;50;11\n02/02/2026;30;7'
    const out = parseZucchettiCSV(csv)
    expect(out).toHaveLength(2)
    const g1 = out.find(x => x.data === '2026-02-01')
    expect(g1.importo).toBe(100)
    expect(g1.iva).toBe(22)
    expect(g1.righe).toBe(2)
  })

  it('output ordinato per data crescente', () => {
    const csv = 'Data;Importo\n05/02/2026;10\n01/02/2026;5\n03/02/2026;7'
    const out = parseZucchettiCSV(csv)
    expect(out.map(x => x.data)).toEqual(['2026-02-01', '2026-02-03', '2026-02-05'])
  })

  it('file vuoto restituisce array vuoto', () => {
    expect(parseZucchettiCSV('')).toEqual([])
  })

  it('header solo (senza righe dati) restituisce vuoto', () => {
    expect(parseZucchettiCSV('Data;Importo;IVA')).toEqual([])
  })

  it('riconosce header alternativi DATE/Amount/VAT', () => {
    const csv = 'DATE;Amount;VAT\n01/02/2026;100;22'
    const out = parseZucchettiCSV(csv)
    expect(out[0]).toMatchObject({ data: '2026-02-01', importo: 100, iva: 22 })
  })

  it('righe con data invalida vengono ignorate', () => {
    const csv = 'Data;Importo;IVA\nTOTALE;1000;220\n01/02/2026;50;11'
    const out = parseZucchettiCSV(csv)
    expect(out).toHaveLength(1)
    expect(out[0].importo).toBe(50)
  })
})

// ── Escape doppia virgoletta dentro campi quotati ───────────────────────────
describe('CSV: escape `""` dentro campi quotati (audit 2026-07-01)', () => {
  it('una doppia virgoletta `""` diventa `"` letterale dentro un campo quotato', () => {
    // Tilby export con descrizione contenente virgolette
    const csv = [
      'Data;Articolo;Totale',
      '01/02/2026;"Caffe ""speciale""";"3,50"',
    ].join('\n')
    const out = parseTilby(csv)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ data: '2026-02-01', importo: 3.5 })
  })

  it('separatore dentro campo quotato non spezza la riga', () => {
    const csv = [
      'Data;Articolo;Totale',
      '01/02/2026;"Brioche; con crema";"2,00"',
    ].join('\n')
    const out = parseTilby(csv)
    expect(out).toHaveLength(1)
    expect(out[0].importo).toBe(2)
  })
})

// ── parseItalianDate (testata via aggrega) ─────────────────────────────────
describe('parseItalianDate — formati supportati (via parseZucchettiCSV)', () => {
  const cases = [
    ['01/02/2026', '2026-02-01'],
    ['1/2/2026',   '2026-02-01'], // zero-padding implicito
    ['01-02-2026', '2026-02-01'], // dash
    ['01.02.2026', '2026-02-01'], // dot
    ['01/02/26',   '2026-02-01'], // anno 2 cifre
    ['2026-02-01', '2026-02-01'], // già ISO
    ['2026-02-01T08:30:00', '2026-02-01'], // ISO con time
  ]
  for (const [input, expected] of cases) {
    it(`accetta "${input}" come ${expected}`, () => {
      const csv = `Data;Importo\n${input};10`
      const out = parseZucchettiCSV(csv)
      expect(out).toHaveLength(1)
      expect(out[0].data).toBe(expected)
    })
  }

  it('date manifestamente invalide vengono scartate', () => {
    const csv = 'Data;Importo\nnon-una-data;10\n01/02/2026;5'
    const out = parseZucchettiCSV(csv)
    expect(out).toHaveLength(1)
    expect(out[0].data).toBe('2026-02-01')
  })
})

// ── parseNum: completa i casi non coperti dal test esistente ───────────────
describe('parseNum — casi extra (coverage)', () => {
  it('input boolean / oggetto / array → 0', () => {
    expect(parseNum({})).toBe(0)
    expect(parseNum([])).toBe(0)
  })

  it('stringa "-" da sola → 0', () => {
    expect(parseNum('-')).toBe(0)
  })

  it('numero infinito o NaN ritornano 0', () => {
    expect(parseNum(Infinity)).toBe(0)
    expect(parseNum(-Infinity)).toBe(0)
    expect(parseNum(NaN)).toBe(0)
  })

  it('un solo separatore con !=3 cifre dopo → decimale', () => {
    expect(parseNum('12.5')).toBeCloseTo(12.5, 6)
    expect(parseNum('12,5')).toBeCloseTo(12.5, 6)
    expect(parseNum('12.50')).toBeCloseTo(12.5, 6)
  })
})

// ── Parser specifici per provider ──────────────────────────────────────────
describe('parser per provider', () => {
  it('parseCassaInCloud aggrega per metodo pagamento', () => {
    const csv = [
      'Data;Ora;Prodotto;Quantita;Prezzo;Totale;Metodo pagamento',
      '01/02/2026;10:00;Caffe;1;"1,50";"1,50";contante',
      '01/02/2026;11:00;Brioche;2;"1,00";"2,00";carta',
    ].join('\n')
    const out = parseCassaInCloud(csv)
    expect(out[0].metodi).toEqual({ contante: 1.5, carta: 2 })
    expect(out[0].importo).toBe(3.5)
  })

  it('parseSumUp filtra SALE + SUCCESSFUL', () => {
    const csv = [
      'Date,Type,Amount,Status',
      '01/02/2026,SALE,"10,00",SUCCESSFUL',
      '01/02/2026,REFUND,"5,00",SUCCESSFUL',
      '01/02/2026,SALE,"7,00",FAILED',
    ].join('\n')
    const out = parseSumUp(csv)
    expect(out).toHaveLength(1)
    expect(out[0].importo).toBe(10)
  })

  it('parseSatispay calcola netto = importo - commissione', () => {
    const csv = [
      'Data;Stato;Importo;Commissione',
      '01/02/2026;ACCEPTED;100;"1,00"',
      '02/02/2026;REFUSED;50;"0,50"',
    ].join('\n')
    const out = parseSatispay(csv)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ data: '2026-02-01', importo: 100, commissione: 1, netto: 99 })
  })

  it('parseLightspeed legge "Total incl. tax"', () => {
    const csv = [
      'Date;Receipt number;Total incl. tax;Payment method',
      '01/02/2026;001;"15,00";card',
    ].join('\n')
    const out = parseLightspeed(csv)
    expect(out[0]).toMatchObject({ data: '2026-02-01', importo: 15, metodi: { card: 15 } })
  })

  it('parseSquare sottrae Fee da Amount', () => {
    const csv = 'Date,Time,Amount,Fee\n01/02/2026,10:00,"100,00","2,50"'
    const out = parseSquare(csv)
    expect(out[0].importo).toBe(97.5)
  })

  it('parseRCH legge "Tipo Pag."', () => {
    const csv = 'Data;Numero;Totale;IVA;Tipo Pag.\n01/02/2026;1;"10,00";"2,20";contante'
    const out = parseRCH(csv)
    expect(out[0]).toMatchObject({ data: '2026-02-01', importo: 10, iva: 2.2 })
  })

  it('parseOlivetti supporta header MAIUSCOLI con DATA OPERAZIONE / ALIQ. IVA', () => {
    const csv = 'DATA OPERAZIONE;TOTALE €;ALIQ. IVA\n01/02/2026;"12,00";"2,20"'
    const out = parseOlivetti(csv)
    expect(out[0]).toMatchObject({ data: '2026-02-01', importo: 12, iva: 2.2 })
  })

  it('parseCustom Q3X usa header lowercase brevi (dt/tot/iva/pag)', () => {
    const csv = 'dt;ora;tot;iva;pag\n01/02/2026;10:00;"5,00";"1,10";contante'
    const out = parseCustom(csv)
    expect(out[0]).toMatchObject({ data: '2026-02-01', importo: 5, iva: 1.1 })
  })

  it('parseSalvi / parseIndaco / parsePolotouch usano lo stesso schema con fonti diverse', () => {
    const csv = 'Data;Scontrino;Reparto;Articolo;Qta;Prezzo;Totale;IVA;Pagamento\n01/02/2026;1;Bar;Caffe;1;"1,50";"1,50";"0,33";contante'
    expect(parseSalvi(csv)[0].fonte).toBe('Salvi Cassa')
    expect(parseIndaco(csv)[0].fonte).toBe('Indaco')
    expect(parsePolotouch(csv)[0].fonte).toBe('Polotouch')
  })
})

// ── Auto-detect formato ─────────────────────────────────────────────────────
describe('autoDetectCassaFormat', () => {
  it('null/empty input → null', () => {
    expect(autoDetectCassaFormat(null)).toBeNull()
    expect(autoDetectCassaFormat('')).toBeNull()
  })

  it('riconosce Olivetti da ALIQ. IVA', () => {
    const r = autoDetectCassaFormat('DATA OPERAZIONE;TOTALE €;ALIQ. IVA\n')
    expect(r.provider).toBe('Olivetti')
  })

  it('riconosce Tilby da "Numero scontrino" o "Cassiere"', () => {
    const r = autoDetectCassaFormat('Data;Articolo;Totale;Numero scontrino\n')
    expect(r.provider).toBe('Tilby')
  })

  it('riconosce Lightspeed da "Receipt number"', () => {
    const r = autoDetectCassaFormat('Date;Receipt number;Total incl. tax\n')
    expect(r.provider).toBe('Lightspeed')
  })

  it('riconosce Custom Q3X dall header "dt"', () => {
    const r = autoDetectCassaFormat('dt;ora;tot;iva\n')
    expect(r.provider).toBe('Custom Q3X')
  })

  it('riconosce Satispay da "ID Transazione"', () => {
    const r = autoDetectCassaFormat('Data;ID Transazione;Importo\n')
    expect(r.provider).toBe('Satispay')
  })

  it('fallback Zucchetti per Data;Importo generico', () => {
    const r = autoDetectCassaFormat('Data;Importo\n')
    expect(r.provider).toBe('Zucchetti')
  })

  it('fallback finale Zucchetti con confidence bassa', () => {
    const r = autoDetectCassaFormat('Foo;Bar;Baz\n')
    expect(r.provider).toContain('Zucchetti')
    expect(r.confidence).toBeLessThanOrEqual(0.5)
  })
})

// ── readTextSmart: BOM UTF-8 / latin1 fallback (audit 17 giu 2026) ─────────
describe('readTextSmart — sniffing encoding', () => {
  // Mini-mock di un File (con .arrayBuffer())
  function mkFile(bytes) {
    return { arrayBuffer: async () => new Uint8Array(bytes).buffer }
  }

  it('strippa il BOM UTF-8 (EF BB BF)', async () => {
    const txt = 'Data;Importo'
    const enc = new TextEncoder().encode(txt)
    const withBom = new Uint8Array(enc.length + 3)
    withBom[0] = 0xEF; withBom[1] = 0xBB; withBom[2] = 0xBF
    withBom.set(enc, 3)
    const out = await readTextSmart(mkFile(Array.from(withBom)))
    expect(out).toBe(txt)
    expect(out.charCodeAt(0)).toBe('D'.charCodeAt(0)) // niente BOM iniziale
  })

  it('decodifica UTF-8 plain quando valido', async () => {
    const txt = 'Caffè è buono'
    const bytes = Array.from(new TextEncoder().encode(txt))
    expect(await readTextSmart(mkFile(bytes))) .toBe(txt)
  })

  it('fallback windows-1252 (latin1) quando UTF-8 strict fallisce', async () => {
    // 0xE8 = 'è' in windows-1252, invalid in UTF-8 strict
    const out = await readTextSmart(mkFile([0x43, 0x61, 0x66, 0x66, 0xE8])) // "Caffè"
    expect(out).toBe('Caffè')
  })
})

// ── parseFile dispatch ─────────────────────────────────────────────────────
describe('parseFile — dispatch per sistema', () => {
  function mkTextFile(text, name = 'test.csv') {
    return { name, arrayBuffer: async () => new TextEncoder().encode(text).buffer }
  }

  it('dispatch zucchetti CSV', async () => {
    const out = await parseFile('zucchetti', mkTextFile('Data;Importo\n01/02/2026;10'))
    expect(out[0].fonte).toBe('Zucchetti')
  })

  it('dispatch zucchetti XML in base all estensione .xml', async () => {
    const xml = '<root><Vendita><Data>01/02/2026</Data><Totale>10</Totale><IVA>2</IVA></Vendita></root>'
    const out = await parseFile('zucchetti', mkTextFile(xml, 'export.xml'))
    expect(out[0]).toMatchObject({ data: '2026-02-01', importo: 10, iva: 2, fonte: 'Zucchetti' })
  })

  it('dispatch cassaincloud / sumup / satispay / lightspeed / square', async () => {
    expect((await parseFile('cassaincloud', mkTextFile('Data;Totale\n01/02/2026;5')))[0].fonte).toBe('Cassa in Cloud')
    expect((await parseFile('sumup',        mkTextFile('Date,Amount\n01/02/2026,5')))[0].fonte).toBe('SumUp')
    expect((await parseFile('satispay',     mkTextFile('Data;Importo\n01/02/2026;5')))[0].fonte).toBe('Satispay')
    expect((await parseFile('lightspeed',   mkTextFile('Date;Total incl. tax\n01/02/2026;5')))[0].fonte).toBe('Lightspeed')
    expect((await parseFile('square',       mkTextFile('Date,Amount\n01/02/2026,5')))[0].fonte).toBe('Square')
  })

  it('dispatch fattura_xml usa il parser SDI semplificato', async () => {
    const xml = '<root><Data>2026-02-01</Data><Denominazione>Acme</Denominazione><ImportoPagamento>122</ImportoPagamento><Imposta>22</Imposta><Numero>1</Numero></root>'
    const out = await parseFile('fattura_xml', mkTextFile(xml, 'fatt.xml'))
    expect(out[0]).toMatchObject({ cedente: 'Acme', importo: 122, iva: 22, tipo: 'fattura', numero: '1' })
  })

  it('sistema non riconosciuto lancia errore', async () => {
    await expect(parseFile('boh', mkTextFile('x'))).rejects.toThrow(/non riconosciuto/)
  })
})

// ── parseFatturaXML (variante semplificata che vive in importCassa.js) ─────
describe('parseFatturaXML (variante in importCassa.js)', () => {
  it('estrae cedente / data / importo / iva / numero', () => {
    const xml = `<root>
      <Data>2026-02-01</Data>
      <Denominazione>Molino SRL</Denominazione>
      <ImportoPagamento>122,00</ImportoPagamento>
      <Imposta>22,00</Imposta>
      <Numero>17</Numero>
    </root>`
    const f = parseFatturaXML(xml)
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({
      data: '2026-02-01',
      cedente: 'Molino SRL',
      importo: 122,
      iva: 22,
      numero: '17',
      tipo: 'fattura',
      fonte: 'SDI/XML',
    })
  })

  it('default cedente="Fornitore" e numero="" se mancanti, data=oggi', () => {
    const f = parseFatturaXML('<root><ImportoPagamento>10</ImportoPagamento></root>')
    expect(f[0].cedente).toBe('Fornitore')
    expect(f[0].numero).toBe('')
    expect(f[0].data).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('accetta tag fallback Nome / DataDocumento / NumeroDocumento', () => {
    const xml = `<root>
      <DataDocumento>01/02/2026</DataDocumento>
      <Nome>Mario Rossi</Nome>
      <ImponibileImporto>100</ImponibileImporto>
      <AliquotaIVA>22</AliquotaIVA>
      <NumeroDocumento>99</NumeroDocumento>
    </root>`
    const f = parseFatturaXML(xml)
    expect(f[0]).toMatchObject({ data: '2026-02-01', cedente: 'Mario Rossi', numero: '99' })
  })
})

// ── parseZucchettiXML ───────────────────────────────────────────────────────
describe('parseZucchettiXML', () => {
  it('estrae righe <Vendita> e aggrega per data', () => {
    const xml = `<root>
      <Vendita><Data>01/02/2026</Data><Totale>10,00</Totale><IVA>2,20</IVA></Vendita>
      <Vendita><Data>01/02/2026</Data><Totale>5,00</Totale><IVA>1,10</IVA></Vendita>
      <Vendita><Data>02/02/2026</Data><Totale>20,00</Totale><IVA>4,40</IVA></Vendita>
    </root>`
    const out = parseZucchettiXML(xml)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ data: '2026-02-01', importo: 15, iva: 3.3, righe: 2 })
    expect(out[1].importo).toBe(20)
  })

  it('XML senza vendite → array vuoto', () => {
    expect(parseZucchettiXML('<root></root>')).toEqual([])
  })

  it('vendita senza Data o Totale viene ignorata', () => {
    const xml = '<root><Vendita><Totale>10</Totale></Vendita><Vendita><Data>01/02/2026</Data><Totale>5</Totale></Vendita></root>'
    expect(parseZucchettiXML(xml)).toHaveLength(1)
  })
})

// ── mergeInChiusureCassa: KPI ricalcolati ──────────────────────────────────
describe('mergeInChiusureCassa — KPI recalc', () => {
  it('ricalcola totV/totM/totMP usando totFC esistente come food cost', () => {
    const ch = [{ data: '2026-02-01', kpi: { totFC: 30 } }]
    const imp = [{ data: '2026-02-01', importo: 100 }]
    const out = mergeInChiusureCassa(ch, imp, 'Test')
    const r = out.find(c => c.data === '2026-02-01')
    expect(r.kpi.totV).toBe(100)
    expect(r.kpi.totM).toBe(70)
    expect(r.kpi.totMP).toBeCloseTo(70, 6)
  })

  it('rimuove cassaImport con stessa fonte prima di aggiungere il nuovo entry', () => {
    // Le righe in `importati` non hanno `fonte` (è un parametro a parte usato
    // solo come filtro). Il vecchio entry con fonte=Test viene rimosso e
    // sostituito dal nuovo (importo aggiornato).
    const ch = [{ data: '2026-02-01', kpi: {}, cassaImport: [{ fonte: 'Test', importo: 50 }, { fonte: 'AltraFonte', importo: 1 }] }]
    const imp = [{ data: '2026-02-01', importo: 100 }]
    const out = mergeInChiusureCassa(ch, imp, 'Test')
    const r = out.find(c => c.data === '2026-02-01')
    // L entry vecchio "Test" è stato filtrato fuori; "AltraFonte" resta; più il nuovo (senza fonte)
    expect(r.cassaImport.filter(c => c.fonte === 'Test')).toHaveLength(0)
    expect(r.cassaImport.filter(c => c.fonte === 'AltraFonte')).toHaveLength(1)
    expect(r.cassaImport).toHaveLength(2)
    // il nuovo ha importatoAt + importo aggiornato
    const nuovo = r.cassaImport.find(c => !c.fonte)
    expect(nuovo.importo).toBe(100)
    expect(nuovo.importatoAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('totMP=0 se importo=0 (no divisione per zero)', () => {
    const ch = [{ data: '2026-02-01', kpi: { totFC: 10 } }]
    const imp = [{ data: '2026-02-01', importo: 0 }]
    const out = mergeInChiusureCassa(ch, imp, 'Test')
    const r = out.find(c => c.data === '2026-02-01')
    expect(r.kpi.totMP).toBe(0)
  })

  it('ordina output per data decrescente', () => {
    const out = mergeInChiusureCassa([], [
      { data: '2026-02-01', importo: 5 },
      { data: '2026-02-05', importo: 10 },
      { data: '2026-02-03', importo: 7 },
    ], 'X')
    expect(out.map(c => c.data)).toEqual(['2026-02-05', '2026-02-03', '2026-02-01'])
  })
})
