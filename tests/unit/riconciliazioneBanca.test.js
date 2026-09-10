import { describe, it, expect } from 'vitest'
import {
  normPerConfronto, nomeNellaDescrizione, normalizzaData,
  leggiEstrattoConto, proponiAbbinamenti, sottoinsiemeCheSomma,
} from '../../src/lib/riconciliazioneBanca'

const f = (p) => ({
  id: p.id, fornitore: p.forn, numero_rif: p.n || null,
  data_fattura: p.data, dueIso: p.due || p.data,
  totale: p.tot, importo_pagato: p.pagato || 0,
  stato: p.stato || 'da_pagare', tipo: p.tipo || 'fattura',
})

describe('normPerConfronto', () => {
  it('toglie le forme societarie e la punteggiatura, così i nomi si confrontano', () => {
    expect(normPerConfronto('CONO ARTIC COMMERCIALE S.R.L.')).toBe('CONO ARTIC COMMERCIALE')
    expect(normPerConfronto('Gelinova Group SRL società unipersonale')).toBe('GELINOVA GROUP')
  })
  it('toglie gli accenti', () => {
    expect(normPerConfronto('Frutta Felicità')).toBe('FRUTTA FELICITA')
  })
})

describe('nomeNellaDescrizione', () => {
  it('riconosce il fornitore dentro la descrizione della banca', () => {
    const s = nomeNellaDescrizione(
      'CONO ARTIC COMMERCIALE SRL',
      'BONIF. A FAVORE DI CONO ARTIC COMMERCIALE SRL VIA ROMA 12 TORINO')
    expect(s).toBe(1)
  })
  it('non scatta su un fornitore diverso', () => {
    expect(nomeNellaDescrizione('DESA SRL', 'BONIFICO A GELINOVA GROUP')).toBeLessThan(0.6)
  })
  it('i nomi corti si cercano come parola intera, non come pezzo', () => {
    // "DESA" non deve scattare dentro "DESALINIZZAZIONE"
    expect(nomeNellaDescrizione('DESA', 'PAGAMENTO DESALINIZZAZIONE ACQUE')).toBeLessThan(0.6)
    expect(nomeNellaDescrizione('DESA', 'BONIFICO A DESA PER FORNITURA')).toBe(1)
  })
})

describe('normalizzaData', () => {
  it('legge italiano, ISO e americano', () => {
    expect(normalizzaData('08/04/2026')).toBe('2026-04-08')
    expect(normalizzaData('2026-04-08')).toBe('2026-04-08')
    expect(normalizzaData('8.4.26')).toBe('2026-04-08')
  })
  it('quando il secondo numero è oltre 12 capisce che era americano', () => {
    expect(normalizzaData('04/25/2026')).toBe('2026-04-25')
  })
  it('null su quello che non è una data', () => {
    expect(normalizzaData('saldo iniziale')).toBeNull()
    expect(normalizzaData('')).toBeNull()
  })
})

describe('leggiEstrattoConto', () => {
  it('legge il formato con la colonna importo, e tiene solo le uscite', () => {
    const csv = [
      'Data;Descrizione;Importo',
      '08/04/2026;BONIF. A FAVORE DI CONO ARTIC SRL;-780,78',
      '09/04/2026;VERSAMENTO CONTANTI;1.200,00',
      '10/04/2026;ADDEBITO ENEL ENERGIA;-482,50',
    ].join('\n')
    const { movimenti, avvisi } = leggiEstrattoConto(csv)
    expect(avvisi).toHaveLength(0)
    expect(movimenti).toHaveLength(2)          // l'entrata resta fuori
    expect(movimenti[0]).toMatchObject({ data: '2026-04-08', importo: 780.78 })
    expect(movimenti[1].importo).toBe(482.5)
  })

  it('legge anche il formato con dare e avere separati', () => {
    const csv = [
      'Data contabile\tCausale\tDare\tAvere',
      '08/04/2026\tBonifico CONO ARTIC\t780,78\t',
      '09/04/2026\tIncasso POS\t\t1200,00',
    ].join('\n')
    const { movimenti } = leggiEstrattoConto(csv)
    expect(movimenti).toHaveLength(1)
    expect(movimenti[0].importo).toBe(780.78)
  })

  it('senza la colonna della data lo dice, invece di restituire un elenco vuoto', () => {
    const { movimenti, avvisi } = leggiEstrattoConto('Descrizione;Importo\nqualcosa;-10')
    expect(movimenti).toHaveLength(0)
    expect(avvisi.join(' ')).toMatch(/colonna della data/)
  })

  it('le righe senza data leggibile si contano e si dicono', () => {
    const csv = [
      'Data;Descrizione;Importo',
      'SALDO INIZIALE;;-0',
      '08/04/2026;BONIFICO;-100,00',
    ].join('\n')
    const { movimenti, avvisi } = leggiEstrattoConto(csv)
    expect(movimenti).toHaveLength(1)
    expect(avvisi.join(' ')).toMatch(/1 righe senza una data/)
  })
})

describe('sottoinsiemeCheSomma — il bonifico cumulativo', () => {
  const tre = [
    f({ id: 'a', forn: 'X', data: '2026-01-01', tot: 300 }),
    f({ id: 'b', forn: 'X', data: '2026-02-01', tot: 500 }),
    f({ id: 'c', forn: 'X', data: '2026-03-01', tot: 700 }),
  ]
  it('trova le due fatture che sommano all\'importo del bonifico', () => {
    const g = sottoinsiemeCheSomma(tre, 800)
    expect(g.map(x => x.id).sort()).toEqual(['a', 'b'])
  })
  it('riconosce il caso più frequente: si paga tutto l\'aperto', () => {
    const g = sottoinsiemeCheSomma(tre, 1500)
    expect(g).toHaveLength(3)
  })
  it('null quando nessuna combinazione somma a quella cifra', () => {
    expect(sottoinsiemeCheSomma(tre, 999)).toBeNull()
  })
  it('tiene conto degli acconti già versati', () => {
    const g = sottoinsiemeCheSomma([f({ id: 'z', forn: 'X', data: '2026-01-01', tot: 1000, pagato: 400 })], 600)
    expect(g).toBeNull()   // una sola fattura: serve un gruppo di almeno due
    const g2 = sottoinsiemeCheSomma([
      f({ id: 'z', forn: 'X', data: '2026-01-01', tot: 1000, pagato: 400 }),
      f({ id: 'y', forn: 'X', data: '2026-02-01', tot: 100 }),
    ], 700)
    expect(g2.map(x => x.id).sort()).toEqual(['y', 'z'])
  })
})

describe('proponiAbbinamenti', () => {
  const fatture = [
    f({ id: 'f1', forn: 'CONO ARTIC COMMERCIALE SRL', n: '1/973', data: '2026-03-08', due: '2026-04-08', tot: 780.78 }),
    f({ id: 'f2', forn: 'ENEL ENERGIA SPA', n: '9', data: '2026-03-10', due: '2026-04-10', tot: 482.50 }),
    f({ id: 'f3', forn: 'DESA SRL', n: '55', data: '2026-01-01', due: '2026-02-01', tot: 999.99 }),
  ]

  it('importo esatto + nome nella descrizione = certo', () => {
    const { abbinamenti } = proponiAbbinamenti([
      { data: '2026-04-08', importo: 780.78, descrizione: 'BONIF. A FAVORE DI CONO ARTIC COMMERCIALE SRL' },
    ], fatture)
    expect(abbinamenti).toHaveLength(1)
    expect(abbinamenti[0].certezza).toBe('certo')
    expect(abbinamenti[0].fatture[0].id).toBe('f1')
    expect(abbinamenti[0].motivo).toMatch(/compare nella descrizione/)
  })

  it('importo esatto e data vicina, senza il nome = probabile', () => {
    const { abbinamenti } = proponiAbbinamenti([
      { data: '2026-04-12', importo: 482.50, descrizione: 'ADDEBITO DIRETTO SDD' },
    ], fatture)
    expect(abbinamenti[0].certezza).toBe('probabile')
    expect(abbinamenti[0].fatture[0].id).toBe('f2')
  })

  it('due fatture con lo stesso importo: propone e chiede conferma', () => {
    const doppie = [
      f({ id: 'x', forn: 'A SRL', data: '2026-03-01', due: '2026-04-01', tot: 100 }),
      f({ id: 'y', forn: 'B SRL', data: '2026-03-05', due: '2026-04-05', tot: 100 }),
    ]
    const { abbinamenti } = proponiAbbinamenti([
      { data: '2026-04-02', importo: 100, descrizione: 'BONIFICO' },
    ], doppie)
    expect(abbinamenti[0].certezza).toBe('da confermare')
    expect(abbinamenti[0].motivo).toMatch(/2 fatture hanno questo importo/)
  })

  it('il bonifico cumulativo: la somma di più fatture dello stesso fornitore', () => {
    const molte = [
      f({ id: 'c1', forn: 'CONO ARTIC SRL', data: '2026-01-01', tot: 300 }),
      f({ id: 'c2', forn: 'CONO ARTIC SRL', data: '2026-02-01', tot: 500 }),
    ]
    const { abbinamenti } = proponiAbbinamenti([
      { data: '2026-04-01', importo: 800, descrizione: 'BONIFICO CONO ARTIC SRL SALDO FATTURE' },
    ], molte)
    expect(abbinamenti).toHaveLength(1)
    expect(abbinamenti[0].fatture).toHaveLength(2)
    expect(abbinamenti[0].motivo).toMatch(/somma di 2 fatture/)
  })

  it('nome sì, importo no: non abbina, e dice che può essere un acconto', () => {
    const { abbinamenti, nonAbbinati } = proponiAbbinamenti([
      { data: '2026-04-08', importo: 400, descrizione: 'ACCONTO CONO ARTIC COMMERCIALE SRL' },
    ], fatture)
    expect(abbinamenti).toHaveLength(0)
    expect(nonAbbinati[0].motivo).toMatch(/può essere un acconto/)
    expect(nonAbbinati[0].suggerito).toBe('f1')
  })

  it('quello che non corrisponde a niente resta fuori e lo dice', () => {
    const { abbinamenti, nonAbbinati } = proponiAbbinamenti([
      { data: '2026-04-08', importo: 37.20, descrizione: 'COMMISSIONI BANCARIE' },
    ], fatture)
    expect(abbinamenti).toHaveLength(0)
    expect(nonAbbinati[0].motivo).toMatch(/nessuna fattura aperta/)
  })

  it('una fattura non si abbina due volte', () => {
    const { abbinamenti } = proponiAbbinamenti([
      { data: '2026-04-08', importo: 780.78, descrizione: 'BONIFICO CONO ARTIC COMMERCIALE SRL' },
      { data: '2026-04-20', importo: 780.78, descrizione: 'BONIFICO CONO ARTIC COMMERCIALE SRL' },
    ], fatture)
    expect(abbinamenti).toHaveLength(1)
  })

  it('le fatture già pagate e le note di credito restano fuori', () => {
    const { abbinamenti } = proponiAbbinamenti([
      { data: '2026-04-08', importo: 500, descrizione: 'BONIFICO PAGATA SRL' },
    ], [
      f({ id: 'p', forn: 'PAGATA SRL', data: '2026-03-01', tot: 500, stato: 'pagata' }),
      f({ id: 'nc', forn: 'PAGATA SRL', data: '2026-03-02', tot: 500, tipo: 'nota_credito' }),
    ])
    expect(abbinamenti).toHaveLength(0)
  })
})
