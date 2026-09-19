// Leggere il file Excel che manda il cliente.
//
// È il primo passo di tutto: se qui si sbaglia, si sbaglia tutto quello che
// viene dopo, e in un modo che il cliente non può diagnosticare — vede il suo
// foglio giusto sullo schermo e Foodos che dice «zero righe».
//
// `src/lib/importParse.js` era a **zero copertura** fino al 15/09/2026.
// I file veri dei clienti non sono puliti: hanno righe vuote in mezzo,
// colonne senza intestazione, fogli multipli, celle unite, date come numeri.

import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseWorkbook, getSamples } from '../../src/lib/importParse'

// Costruisce un file Excel vero in memoria, come quello che arriva dal cliente.
function foglio(fogli) {
  const wb = XLSX.utils.book_new()
  for (const [nome, righe] of Object.entries(fogli)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(righe), nome)
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

describe('un file normale', () => {
  const buf = foglio({
    Fornitori: [
      ['Ragione sociale', 'Email', 'Telefono'],
      ['Molino Rossi SRL', 'info@molinorossi.it', '011 1234567'],
      ['Latteria Bianchi', 'ordini@bianchi.it', '0121 998877'],
    ],
  })

  it('legge le intestazioni e le righe', () => {
    const r = parseWorkbook(buf, XLSX)
    expect(r.sheetNames).toEqual(['Fornitori'])
    expect(r.firstSheetName).toBe('Fornitori')
    expect(r.firstSheet.headers).toEqual(['Ragione sociale', 'Email', 'Telefono'])
    expect(r.firstSheet.rows).toHaveLength(2)
  })

  it('ogni riga è un oggetto con le chiavi giuste', () => {
    const r = parseWorkbook(buf, XLSX)
    expect(r.firstSheet.rows[0]).toEqual({
      'Ragione sociale': 'Molino Rossi SRL',
      Email: 'info@molinorossi.it',
      Telefono: '011 1234567',
    })
  })

  it('tiene anche le righe crude, che servono per i fogli a colonne', () => {
    const r = parseWorkbook(buf, XLSX)
    expect(r.rawSheets.Fornitori[0]).toEqual(['Ragione sociale', 'Email', 'Telefono'])
  })
})

describe('i file veri dei clienti non sono puliti', () => {
  it('le righe completamente vuote spariscono', () => {
    const buf = foglio({ F: [
      ['Nome', 'Qta'],
      ['Sacher', 3],
      [],
      [null, null],
      ['', '  '],
      ['Babà', 5],
    ] })
    const r = parseWorkbook(buf, XLSX)
    expect(r.firstSheet.rows.map(x => x.Nome)).toEqual(['Sacher', 'Babà'])
  })

  it('una riga con un solo valore resta: non è vuota', () => {
    const buf = foglio({ F: [['Nome', 'Qta'], ['Sacher', null]] })
    expect(parseWorkbook(buf, XLSX).firstSheet.rows).toHaveLength(1)
  })

  it('una colonna senza intestazione prende un nome di riserva', () => {
    // Senza, due colonne senza nome si sovrascriverebbero a vicenda e i dati
    // di una delle due sparirebbero in silenzio.
    const buf = foglio({ F: [['Nome', '', ''], ['Sacher', 'a', 'b']] })
    const r = parseWorkbook(buf, XLSX)
    expect(r.firstSheet.headers).toEqual(['Nome', '_col1', '_col2'])
    expect(r.firstSheet.rows[0]).toEqual({ Nome: 'Sacher', _col1: 'a', _col2: 'b' })
  })

  it('gli spazi nelle intestazioni si tolgono', () => {
    const buf = foglio({ F: [['  Nome  ', ' Qta '], ['Sacher', 3]] })
    expect(parseWorkbook(buf, XLSX).firstSheet.headers).toEqual(['Nome', 'Qta'])
  })

  it('le celle mancanti in fondo alla riga diventano null, non spariscono', () => {
    const buf = foglio({ F: [['A', 'B', 'C'], ['x']] })
    expect(parseWorkbook(buf, XLSX).firstSheet.rows[0]).toEqual({ A: 'x', B: null, C: null })
  })

  it('un foglio con le sole intestazioni dà zero righe, non un errore', () => {
    const buf = foglio({ F: [['A', 'B']] })
    const r = parseWorkbook(buf, XLSX)
    expect(r.firstSheet.headers).toEqual(['A', 'B'])
    expect(r.firstSheet.rows).toEqual([])
  })

  it('un foglio completamente vuoto non fa esplodere niente', () => {
    // 19/09/2026: al foglio si sono aggiunti `rigaIntestazione` e
    // `righeSaltate` — servono al wizard per dire «ho saltato le prime N
    // righe» quando l'intestazione non è in cima. Su un foglio vuoto valgono
    // zero, e la forma resta dichiarata qui per intero.
    const buf = foglio({ Vuoto: [] })
    const r = parseWorkbook(buf, XLSX)
    expect(r.firstSheet).toEqual({ headers: [], rows: [], rigaIntestazione: 0, righeSaltate: 0 })
  })
})

describe('più fogli nello stesso file', () => {
  const buf = foglio({
    BERTHOLLET: [['Gusto', 'Kg'], ['Nocciola', 12]],
    MADAMA: [['Gusto', 'Kg'], ['Fiordilatte', 8], ['Pistacchio', 4]],
    Istruzioni: [['Compilare una riga per gusto']],
  })

  it('li legge tutti, e dice quali sono', () => {
    const r = parseWorkbook(buf, XLSX)
    expect(r.sheetNames).toEqual(['BERTHOLLET', 'MADAMA', 'Istruzioni'])
    expect(Object.keys(r.sheets)).toEqual(['BERTHOLLET', 'MADAMA', 'Istruzioni'])
  })

  it('ognuno con le sue righe', () => {
    const r = parseWorkbook(buf, XLSX)
    expect(r.sheets.BERTHOLLET.rows).toHaveLength(1)
    expect(r.sheets.MADAMA.rows).toHaveLength(2)
  })

  it('il primo foglio è la scorciatoia, ma gli altri restano raggiungibili', () => {
    // Il nome del foglio è spesso la SEDE: perderli significa perdere il dato.
    const r = parseWorkbook(buf, XLSX)
    expect(r.firstSheet).toEqual(r.sheets.BERTHOLLET)
    expect(r.sheets.MADAMA.rows[1].Gusto).toBe('Pistacchio')
  })
})

describe('le date', () => {
  it('arrivano come Date vere, non come numeri', () => {
    // Senza `cellDates`, xlsx restituisce il numero seriale (46143): il
    // seriale perde l'ora e non si distingue da un numero qualsiasi.
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([['Data', 'Kg'], [new Date(2026, 4, 1), 12]], { cellDates: true })
    XLSX.utils.book_append_sheet(wb, ws, 'F')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true })
    const r = parseWorkbook(buf, XLSX)
    expect(r.firstSheet.rows[0].Data).toBeInstanceOf(Date)
  })
})

describe('quando non si può leggere', () => {
  it('senza il lettore Excel lo dice, invece di fallire in modo oscuro', () => {
    expect(() => parseWorkbook(new Uint8Array([1, 2, 3]), null))
      .toThrow(/modulo XLSX richiesto/)
  })

  it('un file senza nessun foglio lo dice in italiano', () => {
    const wb = XLSX.utils.book_new()
    // Un workbook senza fogli: xlsx lo scrive solo forzandolo.
    const vuoto = { SheetNames: [], Sheets: {} }
    expect(() => parseWorkbook(new Uint8Array(0), {
      read: () => vuoto,
      utils: XLSX.utils,
    })).toThrow(/Nessun sheet trovato/)
    expect(wb).toBeTruthy()
  })

  it('accetta sia un ArrayBuffer sia dei byte', () => {
    const buf = foglio({ F: [['A'], ['x']] })
    expect(parseWorkbook(buf, XLSX).firstSheet.rows).toHaveLength(1)
    expect(parseWorkbook(new Uint8Array(buf), XLSX).firstSheet.rows).toHaveLength(1)
  })
})

describe('le righe di esempio per il riconoscimento automatico', () => {
  const sheet = { rows: Array.from({ length: 50 }, (_, i) => ({ n: i })) }

  it('ne prende cinque, non cinquanta', () => {
    // Il file intero non deve uscire dal browser: dentro ci sono stipendi e
    // ricette. Al server vanno solo le intestazioni e qualche riga.
    expect(getSamples(sheet)).toHaveLength(5)
    expect(getSamples(sheet, 3)).toHaveLength(3)
  })

  it('se ce ne sono meno, prende quelle che ci sono', () => {
    expect(getSamples({ rows: [{ a: 1 }] })).toHaveLength(1)
  })

  it('senza righe non esplode', () => {
    expect(getSamples(null)).toEqual([])
    expect(getSamples({})).toEqual([])
    expect(getSamples({ rows: [] })).toEqual([])
  })
})
