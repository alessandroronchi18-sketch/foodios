// Import Parse — libreria pura (nessuna dipendenza runtime esplicita), riusabile
// browser (con loadXLSX da CDN) e Node (con `import * as XLSX from 'xlsx'`).
//
// Il chiamante passa il modulo XLSX già caricato: così non dobbiamo condizionare
// il codice su ambiente. Il wizard UI usa `loadXLSX()` da src/lib/xlsx.js, i test
// Node fanno `import * as XLSX from 'xlsx'`.
//
// API:
//   parseWorkbook(arrayBuffer, XLSX) → { sheetNames, firstSheetName, sheets: {[name]: {headers, rows}} }
//   getFirstSheet(workbook) → {headers, rows}
//
// Convenzione: `rows` e' array di oggetti con keys = headers puliti.

/**
 * Estrae un array di 2D arrays (raw) da uno sheet SheetJS.
 * Filtra righe completamente vuote.
 * @param {*} ws - SheetJS worksheet
 * @param {*} XLSX - modulo SheetJS
 * @returns {Array<Array<any>>}
 */
function sheetToRawRows(ws, XLSX) {
  // 18/09/2026 — le righe vuote non si buttano più via alla cieca.
  //
  // Con `blankrows: false` una riga bianca dentro il file spariva prima ancora
  // di essere contata, e da lì in poi l'indice dell'array non aveva più niente
  // a che vedere con la riga del foglio. Il guaio si vedeva quando un import
  // andava storto: il wizard scrive «Dalla riga N del tuo foglio», e con otto
  // righe bianche sparse — il modo normale di separare le famiglie di prodotti
  // in un listino — mandava l'utente otto righe più su. Cioè proprio nel
  // momento in cui sta cercando l'errore nel suo file.
  //
  // Adesso le righe si leggono tutte, si porta dietro il numero vero, e si
  // scartano dopo (in `normalizeSheet`), quando il numero è già stato scritto.
  // `!ref` serve perché un foglio può non cominciare dalla riga 1.
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true })
  const rif = ws?.['!ref']
  const origine = rif ? (XLSX.utils.decode_range(rif).s.r || 0) : 0
  return { raw, origine }
}

/**
 * Trasforma raw 2D array in {headers, rows} dove:
 *   headers = prima riga (stringhe, colonne vuote riempite con `_colN`)
 *   rows    = successive righe come oggetti { headerName: value }
 * Filtra righe completamente vuote.
 */
function normalizeSheet(raw, origine = 0) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { headers: [], rows: [] }
  }
  const headers = (raw[0] || []).map((h, i) => {
    const s = h == null ? '' : String(h).trim()
    return s || `_col${i}`
  })
  const rows = raw.slice(1)
    .map((r, i) => {
      const obj = {}
      for (let i2 = 0; i2 < headers.length; i2++) obj[headers[i2]] = r?.[i2] ?? null
      // Il numero della riga come si legge nel foglio: `origine` è la prima
      // riga usata, +1 per l'intestazione, +1 perché Excel conta da uno.
      // Non è una colonna del file: chi scrive nel database prende solo i
      // campi dello schema, quindi non finisce mai nei dati.
      Object.defineProperty(obj, '_riga_foglio', { value: origine + i + 2, enumerable: false })
      return obj
    })
    .filter(r => Object.values(r).some(v => v != null && String(v).trim() !== ''))
  return { headers, rows }
}

/**
 * Parsea un workbook (Excel/CSV) da ArrayBuffer.
 * Ritorna la struttura di tutti gli sheet + shortcut al primo.
 *
 * @param {ArrayBuffer|Uint8Array} arrayBuffer - contenuto del file
 * @param {*} XLSX - modulo SheetJS
 * @returns {{
 *   sheetNames: string[],
 *   firstSheetName: string,
 *   firstSheet: { headers: string[], rows: Object[] },
 *   sheets: Record<string, { headers: string[], rows: Object[] }>
 * }}
 */
export function parseWorkbook(arrayBuffer, XLSX) {
  if (!XLSX) throw new Error('parseWorkbook: modulo XLSX richiesto (passa loadXLSX() nel browser o `import * as XLSX from "xlsx"` in Node)')
  const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer)
  // cellDates: xlsx senza questa opzione restituisce le colonne data come
  // numeri seriali (46143). Audit 2026-09-09: coerceDate ora sa leggere anche i
  // seriali, ma e' meglio ricevere una Date vera: il seriale perde l'ora e non
  // distingue una data da un numero qualsiasi. Le due difese lavorano insieme,
  // perché i file dei clienti arrivano da fonti diverse (Excel, Google Sheets,
  // esportazioni da gestionali) e non tutte marcano le celle come data.
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true })
  const sheetNames = wb.SheetNames || []
  if (sheetNames.length === 0) throw new Error('Nessun sheet trovato nel file')

  const sheets = {}
  const rawSheets = {}
  for (const name of sheetNames) {
    const ws = wb.Sheets[name]
    if (!ws) continue
    const { raw, origine } = sheetToRawRows(ws, XLSX)
    sheets[name] = normalizeSheet(raw, origine)
    rawSheets[name] = raw
  }

  const firstSheetName = sheetNames[0]
  return {
    sheetNames,
    firstSheetName,
    firstSheet: sheets[firstSheetName] || { headers: [], rows: [] },
    sheets,
    rawSheets,  // 2D arrays crudi, utili per unpivot WIDE→LONG
  }
}

/**
 * Estrae fino a N sample rows come oggetti (utile per AI mapping).
 * @param {{ rows: Object[] }} sheet
 * @param {number} n
 * @returns {Object[]}
 */
export function getSamples(sheet, n = 5) {
  if (!sheet?.rows) return []
  return sheet.rows.slice(0, n)
}

/**
 * Helper browser: legge un File in ArrayBuffer.
 * @param {File|Blob} file
 * @returns {Promise<ArrayBuffer>}
 */
export function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = () => reject(fr.error || new Error('Errore lettura file'))
    fr.onload = () => resolve(fr.result)
    fr.readAsArrayBuffer(file)
  })
}
