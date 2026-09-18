// ── «Dalla riga N del tuo foglio» deve dire la riga vera ──────────────────
//
// Il difetto, trovato il 18/09/2026 mentre un agente costruiva l'import dei
// prezzi delle materie prime.
//
// `parseWorkbook` leggeva il foglio con `blankrows: false`, cioè buttava via
// le righe completamente vuote **prima di contarle**. Da quel momento
// l'indice dell'array non aveva più niente a che vedere con la riga del
// foglio di chi ha scritto il file.
//
// Si vedeva quando un import andava storto: il wizard scrive «Dalla riga N del
// tuo foglio», e in un listino con le righe bianche a separare le famiglie di
// prodotti — che è il modo normale di scriverlo — mandava l'utente tante righe
// più su quante erano le bianche sopra. Proprio nel momento in cui sta
// cercando l'errore nel suo file, e proprio dove la nostra unica utilità è
// dirgli dove guardare.
//
// Era già stato corretto uno strato dello stesso difetto («prima si stampava
// l'indice dentro le righe valide»): era stato sistemato quello sopra e non
// quello sotto.
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseWorkbook } from '../../src/lib/importParse'
import { validateRows } from '../../src/lib/importValidateCore'

/** Un foglio con le righe bianche in mezzo, come i listini veri. */
function foglioConRigheVuote() {
  const aoa = [
    ['Nome', 'Prezzo'],      // riga 1 del foglio: intestazioni
    ['Panna', 4.7],          // riga 2
    [null, null],            // riga 3: bianca (stacco fra famiglie)
    [null, null],            // riga 4: bianca
    ['Zucchero', 1.66],      // riga 5
    [null, null],            // riga 6: bianca
    ['Destrosio', 1.72],     // riga 7
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Listino')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

describe('Il numero di riga sopravvive alle righe bianche', () => {
  const { firstSheet } = parseWorkbook(foglioConRigheVuote(), XLSX)

  it('le righe bianche restano fuori dai dati, come prima', () => {
    expect(firstSheet.rows.length).toBe(3)
    expect(firstSheet.rows.map(r => r.Nome)).toEqual(['Panna', 'Zucchero', 'Destrosio'])
  })

  it('ma ognuna sa da che riga del foglio viene', () => {
    // Senza la correzione sarebbero 2, 3, 4: le posizioni fra le righe
    // ripulite. Nel file sono 2, 5 e 7.
    expect(firstSheet.rows.map(r => r._riga_foglio)).toEqual([2, 5, 7])
  })

  it('e il numero non è una colonna: non finisce nei dati', () => {
    // Se fosse una chiave come le altre verrebbe scritta nel database o
    // proposta come colonna da mappare nel wizard.
    expect(Object.keys(firstSheet.rows[0])).toEqual(['Nome', 'Prezzo'])
    expect(JSON.parse(JSON.stringify(firstSheet.rows[0]))._riga_foglio).toBeUndefined()
  })
})

describe('La riga vera arriva fino al messaggio d’errore', () => {
  // La forma vera di uno schema del wizard: `type` è obbligatorio, altrimenti
  // `validateRow` non riconosce il campo e scarta la riga.
  const schema = { table: 'prova', fields: [
    { name: 'nome', label: 'Nome', type: 'string', required: true },
    { name: 'prezzo', label: 'Prezzo', type: 'number' },
  ] }

  it('`_row_index` porta la riga del foglio, non la posizione nell’array', () => {
    const { firstSheet } = parseWorkbook(foglioConRigheVuote(), XLSX)
    const res = validateRows(firstSheet.rows, { nome: 'Nome', prezzo: 'Prezzo' }, schema)
    // Il wizard calcola `riga_file = _row_index + 2`: deve tornare 2, 5, 7.
    expect(res.valid_rows.map(r => r._row_index + 2)).toEqual([2, 5, 7])
  })

  it('con righe costruite a mano, senza foglio, si comporta come prima', () => {
    // Il ripiego serve: non tutti i chiamanti passano da un file Excel.
    const res = validateRows(
      [{ Nome: 'Panna', Prezzo: 4.7 }, { Nome: 'Zucchero', Prezzo: 1.66 }],
      { nome: 'Nome', prezzo: 'Prezzo' }, schema)
    expect(res.valid_rows.map(r => r._row_index)).toEqual([0, 1])
  })
})
