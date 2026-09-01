// Import Unpivot — engine di trasformazione WIDE → LONG per file eterogenei.
//
// Un file "WIDE" ha una dimensione (es. i giorni del mese) sparsa nelle
// COLONNE invece che nelle righe. Es. registro produzione gelateria:
// una riga per gusto, poi coppie di colonne (PROD, RIMAN.) per ogni giorno.
// Il DB si aspetta LONG: una riga per (gusto, giorno) con produzione e
// rimanenza come colonne singole.
//
// Questo modulo applica una CONFIG (dichiarativa) al workbook parsato e
// produce array LONG pronto per la validation dello schema.
//
// La CONFIG e' pensata per essere:
//   - generata dall'AI (`/api/import-detect-format`) leggendo headers + sample
//   - modificabile dall'utente nel wizard
//   - salvata in library per riuso su file simili di altri clienti
//
// Modulo puro (no I/O). Testabile.

/**
 * @typedef {Object} MeasureDef
 * @property {string} label   - Testo che appare in `label_row` (es. "PROD", "RIMAN.")
 * @property {string} field   - Field target nello schema Foodos (es. "produzione_g")
 */

/**
 * @typedef {Object} ColumnGroup
 * @property {number} label_row       - Indice riga da cui leggere il measure label (es. 2)
 * @property {number} day_number_row  - Indice riga da cui leggere il numero del giorno del mese
 * @property {string} month_iso       - Prefix data ISO "YYYY-MM"
 * @property {string} date_field      - Field target per la data (es. "data")
 * @property {MeasureDef[]} measures  - Lista dei measure attesi in questa riga
 */

/**
 * @typedef {Object} UnpivotConfig
 * @property {'long'|'wide'} format
 * @property {number} header_rows                                    - Quante righe di header (0-based scan da riga N)
 * @property {{ header_col: number, field: string }} row_dimension   - Colonna con nome (es. gusto)
 * @property {ColumnGroup[]} column_groups                           - Come esplodere le colonne
 * @property {string[]} [sheets_to_process]                          - Filtro sheet inclusi (case-insensitive trim)
 * @property {string[]} [sheets_to_skip]                             - Filtro sheet esclusi (case-insensitive trim)
 * @property {Record<string, Object>} [static_fields_per_sheet]      - Valori fissi da iniettare per sheet (es. { BERTHOLLET: { sede: 'Berthollet' } })
 * @property {string[]} [skip_row_starts]                            - Righe da scartare se col_header inizia con questi (es. ["TOTALE"])
 * @property {string[]} [skip_col_header_contains]                   - Colonne da scartare se qualche header contiene questi (es. ["VENDUTO"])
 * @property {string} [sheet_name_field]                             - Se presente, inietta il nome del sheet in questo field (es. "sede")
 */

// ── helpers ──────────────────────────────────────────────────────

function norm(s) { return String(s ?? '').trim() }
function ucNorm(s) { return norm(s).toUpperCase() }

function matchSheet(name, list) {
  if (!Array.isArray(list) || list.length === 0) return false
  const target = ucNorm(name)
  return list.some(x => ucNorm(x) === target)
}

// ── main ─────────────────────────────────────────────────────────

/**
 * Applica la config di unpivot a un workbook parsato.
 *
 * @param {Record<string, Array<Array<any>>>} sheetsRaw - Map: sheet name → 2D array di celle
 * @param {UnpivotConfig} config
 * @returns {{ rows: Object[], per_sheet: Record<string, number>, warnings: string[] }}
 */
export function applyUnpivot(sheetsRaw, config) {
  if (!sheetsRaw || typeof sheetsRaw !== 'object') throw new Error('sheetsRaw richiesto')
  if (!config || typeof config !== 'object') throw new Error('config richiesta')

  const warnings = []
  const allRows = []
  const perSheet = {}

  const {
    format = 'wide',
    header_rows = 3,
    row_dimension,
    column_groups = [],
    sheets_to_process,
    sheets_to_skip,
    static_fields_per_sheet = {},
    skip_row_starts = [],
    skip_col_header_contains = [],
    sheet_name_field,
  } = config

  if (format === 'long') {
    // Il file e' gia' LONG: ogni sheet e' una tabella {colonna: valore}.
    // Non fa unpivot: appiattisce le rows di ogni sheet inclusi.
    for (const [name, raw] of Object.entries(sheetsRaw)) {
      if (matchSheet(name, sheets_to_skip)) continue
      if (sheets_to_process && !matchSheet(name, sheets_to_process)) continue
      const headers = (raw[0] || []).map(h => norm(h))
      const rows = raw.slice(1)
        .filter(r => Array.isArray(r) && r.some(v => v != null && String(v).trim() !== ''))
        .map(r => {
          const obj = { ...(static_fields_per_sheet[name] || {}) }
          if (sheet_name_field) obj[sheet_name_field] = norm(name)
          for (let i = 0; i < headers.length; i++) obj[headers[i]] = r[i] ?? null
          return obj
        })
      perSheet[name] = rows.length
      allRows.push(...rows)
    }
    return { rows: allRows, per_sheet: perSheet, warnings }
  }

  // format='wide': esplodi le colonne.
  if (!row_dimension || typeof row_dimension.header_col !== 'number' || !row_dimension.field) {
    throw new Error('row_dimension {header_col, field} richiesto per format=wide')
  }
  if (column_groups.length === 0) {
    throw new Error('column_groups vuoto: niente da esplodere')
  }

  for (const [name, raw] of Object.entries(sheetsRaw)) {
    if (matchSheet(name, sheets_to_skip)) continue
    if (sheets_to_process && !matchSheet(name, sheets_to_process)) continue
    if (!Array.isArray(raw) || raw.length <= header_rows) {
      warnings.push(`Sheet "${name}" senza righe dati dopo ${header_rows} header, skip`)
      continue
    }

    const staticFields = { ...(static_fields_per_sheet[name] || {}) }
    if (sheet_name_field && !staticFields[sheet_name_field]) {
      staticFields[sheet_name_field] = norm(name)
    }

    // Per ogni column_group, determina le colonne utili.
    // Nota: nel formato tipico (Mara), il numero del giorno appare SOLO sulla
    // prima colonna del "gruppo giorno" (es. la colonna PROD), mentre le altre
    // colonne dello stesso gruppo (RIMAN.) hanno la cella day vuota. Per questo
    // manteniamo un "current day" che si aggiorna quando incontriamo un nuovo
    // day number e viene ereditato dalle colonne successive del gruppo.
    const columnPlan = [] // array di { col, date_iso, field }
    for (const group of column_groups) {
      const { label_row, day_number_row, month_iso, date_field, measures } = group
      const labelToField = {}
      for (const m of measures) labelToField[ucNorm(m.label)] = m.field

      const headerRow0 = raw[0] || []
      const dayRow = raw[day_number_row] || []
      const labelRow = raw[label_row] || []

      const maxCols = Math.max(headerRow0.length, dayRow.length, labelRow.length)
      let currentDay = null
      for (let c = 0; c < maxCols; c++) {
        // Skip via header check
        let skipByHeader = false
        for (let hr = 0; hr < header_rows; hr++) {
          const cell = ucNorm((raw[hr] || [])[c])
          if (!cell) continue
          if (skip_col_header_contains.some(p => cell.includes(ucNorm(p)))) {
            skipByHeader = true; break
          }
        }
        if (skipByHeader) { currentDay = null; continue }

        // Aggiorna il current day se questa colonna ne ha uno.
        const dayRaw = Number(dayRow[c])
        if (Number.isFinite(dayRaw) && dayRaw >= 1 && dayRaw <= 31) {
          currentDay = dayRaw
        }

        const label = ucNorm(labelRow[c])
        const field = labelToField[label]
        if (!field) continue
        if (currentDay == null) continue

        const dateIso = `${month_iso}-${String(currentDay).padStart(2, '0')}`
        columnPlan.push({ col: c, date_iso: dateIso, field, date_field })
      }
    }

    if (columnPlan.length === 0) {
      warnings.push(`Sheet "${name}": nessuna colonna dati riconosciuta`)
      continue
    }

    // Loop dati.
    const outMap = new Map()
    let emittedRows = 0
    for (let r = header_rows; r < raw.length; r++) {
      const row = raw[r] || []
      const rowKey = norm(row[row_dimension.header_col])
      if (!rowKey) continue
      const upperKey = rowKey.toUpperCase()
      if (skip_row_starts.some(s => upperKey.startsWith(ucNorm(s)))) continue

      for (const { col, date_iso, field, date_field } of columnPlan) {
        const raw_v = row[col]
        if (raw_v == null || raw_v === '') continue
        const n = Number(raw_v)
        if (!Number.isFinite(n) || n < 0) continue
        if (n === 0) continue

        const mapKey = `${date_iso}|${rowKey}`
        if (!outMap.has(mapKey)) {
          outMap.set(mapKey, {
            ...staticFields,
            [row_dimension.field]: rowKey,
            [date_field]: date_iso,
          })
        }
        outMap.get(mapKey)[field] = Math.round(n)
      }
    }
    const rows = Array.from(outMap.values())
    perSheet[name] = rows.length
    emittedRows = rows.length
    allRows.push(...rows)
    if (emittedRows === 0) {
      warnings.push(`Sheet "${name}": nessuna cella con valore utile`)
    }
  }

  return { rows: allRows, per_sheet: perSheet, warnings }
}

/**
 * Config di riferimento per il formato "produzione gelateria WIDE" tipo Mara.
 * Usata come fallback se l'AI detect fallisce, e come esempio nel prompt AI.
 *
 * @param {string} month_iso - "YYYY-MM"
 * @returns {UnpivotConfig}
 */
export function defaultGelateriaWideConfig(month_iso) {
  return {
    format: 'wide',
    header_rows: 3,
    row_dimension: { header_col: 0, field: 'gusto_nome' },
    column_groups: [
      {
        label_row: 2,
        day_number_row: 1,
        month_iso: month_iso || '2026-01',
        date_field: 'data',
        measures: [
          { label: 'PROD', field: 'produzione_g' },
          { label: 'RIMAN.', field: 'rimanenza_g' },
        ],
      },
    ],
    sheet_name_field: 'sede',
    skip_row_starts: ['TOTALE', 'TOT '],
    skip_col_header_contains: ['VENDUTO', 'TOTALE'],
  }
}
