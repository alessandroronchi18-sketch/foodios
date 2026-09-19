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
 * Quante celle di una riga **esistono** nel foglio.
 *
 * Non è la stessa cosa di «quante hanno qualcosa scritto dentro», ed è proprio
 * la differenza che serve per riconoscere l'intestazione. Una riga di
 * intestazione con delle colonne senza nome (`["Nome", "", ""]`) ha tre celle,
 * due delle quali vuote: le celle ci sono, le ha battute l'utente. Un titolo
 * in cima al foglio (`["LISTINO PREZZI 2026", null, null, null]`) ha una cella
 * sola, e i `null` sono il vuoto attorno.
 */
function cellePresenti(r) {
  if (!Array.isArray(r)) return 0
  let n = 0
  for (const c of r) if (c != null) n++
  return n
}

// Quante righe in cima si guardano prima di rinunciare a cercare
// l'intestazione. Oltre, è più probabile che il foglio sia fatto in un modo
// che non sappiamo leggere che non un'intestazione molto in basso.
const MAX_RIGHE_PRIMA_INTESTAZIONE = 20

/**
 * Trova l'indice (dentro `raw`) della riga delle intestazioni.
 *
 * 19/09/2026 — Il listino vero non comincia dalle colonne. Comincia dal nome
 * del fornitore, l'indirizzo e la partita IVA, poi una riga bianca, e solo
 * allora «Codice | Descrizione | U.M. | Prezzo». Prendendo sempre la riga 1 le
 * colonne si chiamavano «LISTINO PREZZI 2026 — MOLINO ROSSI SRL», «_col1»,
 * «_col2», la riga delle intestazioni vere finiva fra i dati, e l'utente
 * restava fermo su «Devi mappare i campi obbligatori» senza capire perché.
 *
 * Il segnale è «almeno due celle presenti» (vedere `cellePresenti`): una riga
 * di intestazione occupa più di una colonna, un titolo in cima al foglio
 * quasi mai — e se il titolo è su celle unite, SheetJS riempie solo la prima
 * e lascia `null` le altre.
 *
 * Si guarda «presenti», non «scritte», perché un'intestazione può avere
 * delle colonne senza nome (`["Nome", "", ""]`): quelle celle esistono, le ha
 * battute l'utente, e quella riga è l'intestazione anche se ha un nome solo.
 *
 * Due limiti dichiarati, che restano il comportamento di prima e non lo
 * peggiorano: se un titolo è scritto con le celle accanto vuote-ma-esistenti
 * viene preso per intestazione; e se nelle prime righe non c'è nessuna riga
 * con due celle — un elenco a una colonna sola — si torna alla riga 1 invece
 * di mangiarsi il file.
 *
 * @param {Array<Array<any>>} raw
 * @returns {number} indice della riga di intestazione dentro `raw`
 */
function trovaRigaIntestazione(raw) {
  const limite = Math.min(raw.length, MAX_RIGHE_PRIMA_INTESTAZIONE)
  for (let i = 0; i < limite; i++) {
    if (cellePresenti(raw[i]) >= 2) return i
  }
  return 0
}

/**
 * Rende unici i nomi delle colonne: «Prezzo», «Prezzo (2)», «Prezzo (3)».
 *
 * 19/09/2026 — Nei listini ci sono spesso due colonne «Prezzo», quello di
 * listino e quello netto. Diventavano la stessa chiave dell'oggetto riga e la
 * seconda sovrascriveva la prima: si importava sempre l'ultima delle due,
 * l'altra non era più raggiungibile, e nel menu a tendina del wizard le due
 * voci erano indistinguibili (anzi, la seconda risultava «già usata»).
 */
function intestazioniUniche(riga) {
  const viste = new Map()
  return (riga || []).map((h, i) => {
    const grezzo = h == null ? '' : String(h).trim()
    const base = grezzo || `_col${i}`
    const quante = viste.get(base) || 0
    viste.set(base, quante + 1)
    return quante === 0 ? base : `${base} (${quante + 1})`
  })
}

/**
 * Trasforma raw 2D array in {headers, rows} dove:
 *   headers = riga delle intestazioni (stringhe, colonne vuote riempite con `_colN`)
 *   rows    = successive righe come oggetti { headerName: value }
 * Filtra righe completamente vuote.
 *
 * Restituisce anche `rigaIntestazione` (numero di riga del foglio, da 1) e
 * `righeSaltate`: servono al wizard per dire «ho saltato le prime 3 righe»
 * invece di farlo di nascosto.
 */
function normalizeSheet(raw, origine = 0) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { headers: [], rows: [], rigaIntestazione: 0, righeSaltate: 0 }
  }
  const iIntestazione = trovaRigaIntestazione(raw)
  const headers = intestazioniUniche(raw[iIntestazione])
  const rows = raw.slice(iIntestazione + 1)
    .map((r, i) => {
      const obj = {}
      for (let i2 = 0; i2 < headers.length; i2++) obj[headers[i2]] = r?.[i2] ?? null
      // Il numero della riga come si legge nel foglio: `origine` è la prima
      // riga usata, `iIntestazione` quante ne sono state saltate in cima,
      // +1 per l'intestazione stessa, +1 perché Excel conta da uno.
      // Non è una colonna del file: chi scrive nel database prende solo i
      // campi dello schema, quindi non finisce mai nei dati.
      Object.defineProperty(obj, '_riga_foglio', {
        value: origine + iIntestazione + i + 2, enumerable: false,
      })
      return obj
    })
    .filter(r => Object.values(r).some(v => v != null && String(v).trim() !== ''))
  return {
    headers,
    rows,
    rigaIntestazione: origine + iIntestazione + 1,
    righeSaltate: iIntestazione,
  }
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
  // raw: true — vale solo per i file di testo (CSV), perché un .xlsx porta i
  // tipi dentro di sé e non viene toccato (verificato: numeri, date e
  // percentuali escono identici con e senza).
  //
  // 19/09/2026 — Un listino salvato in CSV da un Excel italiano usa il punto e
  // virgola per separare le colonne e la virgola per i decimali. Il punto e
  // virgola SheetJS lo riconosce; la virgola no: legge «1,15» come se
  // raggruppasse le migliaia e restituisce **115**. Cento volte tanto, e già
  // di tipo numero, quindi `coerceNumber` non ha più niente da correggere e
  // lo prende per buono. Un listino di farina a 1,15 €/kg entrava a 115 €/kg
  // senza un avviso, e da li' passava nel food cost.
  // Le date facevano lo stesso giro all'americana: «01/05/2026», il primo
  // maggio, diventava il 5 gennaio su tutte le righe del file.
  // Con `raw: true` le celle restano il testo che l'utente ha scritto, e a
  // leggerle ci pensano `coerceNumber` e `coerceDate`, che sanno che il file
  // è italiano.
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true, raw: true })
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
