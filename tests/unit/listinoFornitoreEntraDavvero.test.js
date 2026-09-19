// ── Il listino che manda il fornitore deve entrare, e entrare giusto ──────
//
// Audit del 19/09/2026, nato da una domanda del titolare: «la pagina è studiata
// per la ricezione di un Excel abbastanza generico: se carico un Excel con nome
// fornitore, prodotti, prezzo per prodotto, è pronta ad accoglierlo?».
//
// La risposta si è cercata costruendo i file come li manda un fornitore — non
// come li vorremmo — e passandoli dentro `parseWorkbook`. Sono venuti fuori tre
// difetti, tutti silenziosi, cioè della specie peggiore: il file entra, nessuno
// protesta, e il dato dentro è sbagliato.
//
// 1. CSV ITALIANO, PREZZI PER CENTO. Un listino salvato in CSV da un Excel
//    italiano usa il punto e virgola come separatore di colonna e la virgola
//    per i decimali. SheetJS il punto e virgola lo riconosce, ma poi legge
//    «1,15» come se la virgola raggruppasse le migliaia: la cella arriva come
//    il numero 115. Cento volte tanto, già di tipo numero, quindi
//    `coerceNumber` non ha più niente da correggere e lo accetta. Stessa
//    storia per le date: «01/05/2026» diventava il 5 gennaio, letto
//    all'americana. Si legge con `raw: true`, cioe' si prendono le celle come
//    testo e si lasciano interpretare a chi sa che il file è italiano.
//
// 2. INTESTAZIONE NON SULLA PRIMA RIGA. Il listino vero comincia col nome del
//    fornitore e l'indirizzo, poi una riga bianca, e solo allora «Codice |
//    Descrizione | U.M. | Prezzo». Si prendeva per intestazione la riga 1,
//    quindi le colonne si chiamavano «LISTINO PREZZI 2026 — MOLINO ROSSI SRL»,
//    «_col1», «_col2»: nessun abbinamento possibile, e l'utente restava fermo
//    su «Devi mappare i campi obbligatori» senza sapere perché.
//
// 3. DUE COLONNE CON LO STESSO NOME. Nei listini ci sono spesso due colonne
//    «Prezzo», quello di listino e quello netto. Diventavano la stessa chiave
//    nell'oggetto riga e la seconda sovrascriveva la prima: si importava un
//    prezzo dei due, sempre lo stesso, senza poter scegliere.
//
// Il quarto caso qui sotto non è un difetto ma una guardia: la correzione del
// 18/09 (le righe bianche non spostano più il numero di riga) deve restare in
// piedi anche dopo aver spostato la riga delle intestazioni.

import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseWorkbook } from '../../src/lib/importParse'
import { coerceNumber, coerceDate } from '../../src/lib/importValidateCore'

/** Scrive un foglio a partire da una matrice e lo restituisce come bytes. */
function comeFile(aoa, nomeFoglio = 'Listino') {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nomeFoglio)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

/** Un CSV come lo salva un Excel italiano. */
function comeCsv(testo) {
  return new TextEncoder().encode(testo)
}

describe('CSV italiano: il punto e virgola non deve gonfiare i prezzi', () => {
  const csv = 'Fornitore;Prodotto;Prezzo\nMolino Rossi SRL;Farina 00 W300;1,15\nLatteria Alpina;Panna 35%;4,20\n'

  it('le colonne si riconoscono lo stesso', () => {
    const { firstSheet } = parseWorkbook(comeCsv(csv), XLSX)
    expect(firstSheet.headers).toEqual(['Fornitore', 'Prodotto', 'Prezzo'])
    expect(firstSheet.rows.length).toBe(2)
  })

  it('«1,15» vale un euro e quindici, non centoquindici', () => {
    // Prima della correzione qui usciva 115: il prezzo al chilo della farina
    // diventava 115 € e il food cost con lui.
    const { firstSheet } = parseWorkbook(comeCsv(csv), XLSX)
    expect(coerceNumber(firstSheet.rows[0].Prezzo)).toBe(1.15)
    expect(coerceNumber(firstSheet.rows[1].Prezzo)).toBe(4.2)
  })

  it('e una data italiana resta il giorno che c’è scritto', () => {
    // «01/05/2026» è il primo maggio. Letto all'americana diventava il 5
    // gennaio: quattro mesi indietro, su tutte le righe del file.
    const { firstSheet } = parseWorkbook(
      comeCsv('Data;Gusto;Kg\n01/05/2026;Nocciola;2,5\n'), XLSX)
    expect(coerceDate(firstSheet.rows[0].Data)).toBe('2026-05-01')
    expect(coerceNumber(firstSheet.rows[0].Kg)).toBe(2.5)
  })

  it('il CSV con la virgola continua a funzionare come prima', () => {
    const { firstSheet } = parseWorkbook(
      comeCsv('Fornitore,Prodotto,Prezzo\nMolino Rossi SRL,Farina 00 W300,1.15\n'), XLSX)
    expect(firstSheet.headers).toEqual(['Fornitore', 'Prodotto', 'Prezzo'])
    expect(coerceNumber(firstSheet.rows[0].Prezzo)).toBe(1.15)
  })

  it('e in un .xlsx i numeri e le date restano quello che erano', () => {
    // La correzione tocca solo la lettura del testo: un foglio Excel vero
    // porta già i tipi dentro, e non deve cambiare di una virgola.
    const { firstSheet } = parseWorkbook(
      comeFile([['Prodotto', 'Prezzo', 'Data'], ['Farina', 1.15, new Date(2026, 4, 1)]]), XLSX)
    expect(firstSheet.rows[0].Prezzo).toBe(1.15)
    expect(coerceDate(firstSheet.rows[0].Data)).toBe('2026-05-01')
  })
})

describe('L’intestazione non è sempre sulla prima riga', () => {
  const listinoVero = [
    ['LISTINO PREZZI 2026 — MOLINO ROSSI SRL'],            // riga 1
    ['Via Garibaldi 12, Torino — P.IVA 01234567890'],      // riga 2
    [],                                                     // riga 3
    ['Codice', 'Descrizione', 'U.M.', 'Prezzo'],            // riga 4: le intestazioni vere
    ['FAR001', 'Farina 00 W300', 'kg', 1.15],               // riga 5
    ['FAR002', 'Farina manitoba', 'kg', 1.48],              // riga 6
  ]

  it('si trovano le colonne vere, non il titolo del foglio', () => {
    const { firstSheet } = parseWorkbook(comeFile(listinoVero), XLSX)
    expect(firstSheet.headers).toEqual(['Codice', 'Descrizione', 'U.M.', 'Prezzo'])
  })

  it('il titolo e l’indirizzo non diventano righe di dati', () => {
    const { firstSheet } = parseWorkbook(comeFile(listinoVero), XLSX)
    expect(firstSheet.rows.length).toBe(2)
    expect(firstSheet.rows.map(r => r.Codice)).toEqual(['FAR001', 'FAR002'])
  })

  it('e il numero di riga tiene conto di quelle saltate', () => {
    // FAR001 sta alla riga 5 del foglio, non alla 2.
    const { firstSheet } = parseWorkbook(comeFile(listinoVero), XLSX)
    expect(firstSheet.rows.map(r => r._riga_foglio)).toEqual([5, 6])
  })

  it('si dice quante righe sono state saltate, invece di farlo di nascosto', () => {
    // Indovinare va bene, indovinare senza dirlo no: il wizard deve poter
    // scrivere «ho saltato le prime 3 righe».
    const { firstSheet } = parseWorkbook(comeFile(listinoVero), XLSX)
    expect(firstSheet.rigaIntestazione).toBe(4)
    expect(firstSheet.righeSaltate).toBe(3)
  })

  it('quando l’intestazione è gia’ in cima non si salta niente', () => {
    const { firstSheet } = parseWorkbook(
      comeFile([['Codice', 'Descrizione'], ['FAR001', 'Farina']]), XLSX)
    expect(firstSheet.headers).toEqual(['Codice', 'Descrizione'])
    expect(firstSheet.rigaIntestazione).toBe(1)
    expect(firstSheet.righeSaltate).toBe(0)
    expect(firstSheet.rows.map(r => r._riga_foglio)).toEqual([2])
  })

  it('un foglio a una colonna sola non viene sbucciato fino a sparire', () => {
    // Il segnale per riconoscere l'intestazione è «almeno due celle scritte».
    // Se nel foglio non c'è nessuna riga così, si torna alla prima riga
    // invece di mangiarsi tutto il file.
    const { firstSheet } = parseWorkbook(
      comeFile([['Fornitore'], ['Molino Rossi SRL'], ['Latteria Alpina']]), XLSX)
    expect(firstSheet.headers).toEqual(['Fornitore'])
    expect(firstSheet.rows.map(r => r.Fornitore)).toEqual(['Molino Rossi SRL', 'Latteria Alpina'])
    expect(firstSheet.righeSaltate).toBe(0)
  })

  it('le colonne senza nome restano riconoscibili', () => {
    const { firstSheet } = parseWorkbook(
      comeFile([['Codice', null, 'Prezzo'], ['FAR001', 'Farina', 1.15]]), XLSX)
    expect(firstSheet.headers).toEqual(['Codice', '_col1', 'Prezzo'])
  })
})

describe('Due colonne con lo stesso nome sono due colonne', () => {
  const doppie = [
    ['Fornitore', 'Prodotto', 'Prezzo', 'Prezzo'],
    ['Molino Rossi SRL', 'Farina 00 W300', '1,50', '1,15'],
  ]

  it('la seconda non cancella la prima', () => {
    // Prima della correzione la riga aveva una sola chiave «Prezzo» = "1,15":
    // il prezzo di listino (1,50) non esisteva più.
    const { firstSheet } = parseWorkbook(comeFile(doppie), XLSX)
    expect(firstSheet.headers).toEqual(['Fornitore', 'Prodotto', 'Prezzo', 'Prezzo (2)'])
    expect(firstSheet.rows[0].Prezzo).toBe('1,50')
    expect(firstSheet.rows[0]['Prezzo (2)']).toBe('1,15')
  })

  it('e con tre uguali si continua a contare', () => {
    const { firstSheet } = parseWorkbook(
      comeFile([['Prezzo', 'Prezzo', 'Prezzo'], [1, 2, 3]]), XLSX)
    expect(firstSheet.headers).toEqual(['Prezzo', 'Prezzo (2)', 'Prezzo (3)'])
    expect(firstSheet.rows[0]['Prezzo (3)']).toBe(3)
  })
})

describe('Le righe bianche continuano a non spostare i numeri (18/09/2026)', () => {
  it('anche quando l’intestazione non è sulla prima riga', () => {
    const { firstSheet } = parseWorkbook(comeFile([
      ['LISTINO GENERALE 2026'],                    // riga 1
      [],                                            // riga 2
      ['Fornitore', 'Prodotto', 'Prezzo'],           // riga 3
      ['FARINE'],                                    // riga 4
      ['Molino Rossi SRL', 'Farina 00 W300', '1,15'],// riga 5
      [],                                            // riga 6
      [],                                            // riga 7
      ['Latteria Alpina', 'Panna 35%', '4,20'],      // riga 8
    ]), XLSX)
    expect(firstSheet.headers).toEqual(['Fornitore', 'Prodotto', 'Prezzo'])
    expect(firstSheet.rows.map(r => r._riga_foglio)).toEqual([4, 5, 8])
  })
})
