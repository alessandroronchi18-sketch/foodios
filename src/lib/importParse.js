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
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false })
}

/**
 * Trasforma raw 2D array in {headers, rows} dove:
 *   headers = prima riga (stringhe, colonne vuote riempite con `_colN`)
 *   rows    = successive righe come oggetti { headerName: value }
 * Filtra righe completamente vuote.
 */
function normalizeSheet(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { headers: [], rows: [] }
  }
  const headers = (raw[0] || []).map((h, i) => {
    const s = h == null ? '' : String(h).trim()
    return s || `_col${i}`
  })
  const rows = raw.slice(1)
    .map(r => {
      const obj = {}
      for (let i = 0; i < headers.length; i++) obj[headers[i]] = r[i] ?? null
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
  const wb = XLSX.read(bytes, { type: 'array' })
  const sheetNames = wb.SheetNames || []
  if (sheetNames.length === 0) throw new Error('Nessun sheet trovato nel file')

  const sheets = {}
  const rawSheets = {}
  for (const name of sheetNames) {
    const ws = wb.Sheets[name]
    if (!ws) continue
    const raw = sheetToRawRows(ws, XLSX)
    sheets[name] = normalizeSheet(raw)
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
