import { formatLocalDate } from './dateLocal'
// Core validation per import bulk. Modulo puro (no I/O, no auth):
// usato sia da /api/import-validate.js (Edge endpoint) sia da
// scripts/import-any.mjs (CLI Node).

// ── Coercion per tipo ──────────────────────────────────────────────────

export function coerceString(v) {
  if (v == null) return ''
  return String(v).trim()
}

export function coerceNumber(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  // Accetta "1.234,56" (formato IT) o "1234.56" o "12,50 €"
  let s = String(v).trim()
  s = s.replace(/€|EUR|eur/g, '').trim()
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    // "1.234,56" -> "1234.56". Punti come separatore migliaia.
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (hasComma) {
    s = s.replace(',', '.')
  } else if (hasDot) {
    // Audit 2026-09-09: "1.500" senza virgola era letto come 1,5, cioè mille
    // volte meno. In italiano il punto raggruppa le migliaia a gruppi di tre
    // esatti: "1.500" e "1.234.567" sono migliaia, "1.5" e "12.75" sono
    // decimali. Distinguiamo sulla forma, che e' l'unico segnale disponibile.
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function coerceBoolean(v) {
  if (v == null || v === '') return null
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toLowerCase()
  if (['true', 'vero', 'si', 'sì', 'yes', 'y', '1', 'attivo', 'in servizio'].includes(s)) return true
  if (['false', 'falso', 'no', 'n', '0', 'inattivo', 'cessato'].includes(s)) return false
  return null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function isValidEmail(s) { return EMAIL_RE.test(s) }

// Telefono IT: accetta cifre, spazi, + iniziale, / -. Almeno 6 cifre.
export function isValidPhone(s) {
  const digits = String(s).replace(/\D/g, '')
  return digits.length >= 6 && digits.length <= 16
}

// Date ISO YYYY-MM-DD (Excel spesso arriva già così). Accetta anche
// "DD/MM/YYYY" e converte.
export function coerceDate(v) {
  if (v == null || v === '') return null
  // Audit 2026-09-09: qui c'era `toISOString().slice(0,10)`. xlsx costruisce le
  // Date nel fuso LOCALE, e toISOString le converte in UTC: in Italia (UTC+1/+2)
  // il 1 maggio a mezzanotte diventava "2026-04-30". Tutte le date dell'import
  // slittavano di un giorno, e con esse la produzione di ogni giornata.
  // formatLocalDate legge giorno, mese e anno locali senza passare per UTC.
  if (v instanceof Date && !isNaN(v)) return formatLocalDate(v)
  // Numero seriale Excel. Audit 2026-09-09: una colonna formattata come data in
  // Excel arriva come numero (46143) se il file non e' stato letto con
  // cellDates. Prima cadeva nel `return null` finale, quindi TUTTE le righe
  // risultavano invalide, la schermata diceva "Pronte da caricare 0" e il
  // consiglio era "serve GG/MM/AAAA" mentre nel foglio l'utente VEDE
  // 01/05/2026: un vicolo cieco senza via d'uscita.
  // L'epoca e' 1899-12-30 perché Excel considera il 1900 bisestile (non lo e'):
  // partendo da quella data i seriali >= 61 tornano giusti senza correzioni.
  // Limiti: 1 = 1899-12-31, 200000 ~ anno 2447. Fuori da li' non e' una data.
  if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v < 200000) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000
    const d = new Date(ms)
    if (!isNaN(d)) return d.toISOString().slice(0, 10) // costruita in UTC: qui e' corretto
  }
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  if (m) {
    const [, dd, mm, yyyy] = m
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  // "1/5/26" a due cifre: comune nei fogli scritti a mano.
  const m2 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/)
  if (m2) {
    const [, dd, mm, yy] = m2
    const anno = Number(yy) >= 70 ? `19${yy}` : `20${yy}`
    return `${anno}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  return null
}

// ── Validation riga singola ───────────────────────────────────────────

/**
 * Valida una singola riga dopo aver applicato il mapping.
 * @param {Object} row - Riga input (chiavi = nomi colonne file)
 * @param {Record<string,string>} mapping - {field_target -> nome_colonna_input}
 * @param {Object} schema - EntitySchema
 * @param {Object} [opts]
 * @param {Record<string, Map<string, *>>} [opts.lookups]  - Per field type='lookup':
 *   mappa da valore-cliente (lowercase trim) → chiave DB.
 * @param {Set<string>} [opts.activeConversions] - unitConversions attivate
 * @returns {{ ok: true, data: Object } | { ok: false, errors: string[], data: Object }}
 */
export function validateRow(row, mapping, schema, opts = {}) {
  const errors = []
  const data = {}
  const lookups = opts.lookups || {}
  for (const field of schema.fields) {
    const inputCol = mapping[field.name]
    const raw = inputCol ? row[inputCol] : undefined

    if ((raw == null || raw === '') && field.default !== undefined) {
      data[field.name] = field.default
      continue
    }
    if (field.required && (raw == null || String(raw).trim() === '')) {
      errors.push(`campo obbligatorio "${field.name}" vuoto`)
      continue
    }
    if (raw == null || String(raw).trim() === '') continue

    switch (field.type) {
      case 'lookup': {
        const key = String(raw).trim().toLowerCase()
        const lookupMap = lookups[field.name]
        if (!lookupMap) {
          errors.push(`"${field.name}" non risolvibile: manca la tabella di lookup`)
          break
        }
        const resolved = lookupMap.get(key)
        if (!resolved) {
          errors.push(`"${field.name}" = "${raw}" non trovato tra le ${lookupMap.size} opzioni disponibili`)
          break
        }
        data[field.name] = resolved
        break
      }
      case 'string': {
        const s = coerceString(raw)
        if (!s) { if (field.required) errors.push(`"${field.name}" vuoto dopo trim`); continue }
        data[field.name] = s
        break
      }
      case 'email': {
        const s = coerceString(raw)
        if (!isValidEmail(s)) errors.push(`"${field.name}" non e' un'email valida: "${s}"`)
        else data[field.name] = s.toLowerCase()
        break
      }
      case 'phone': {
        const s = coerceString(raw)
        if (!isValidPhone(s)) errors.push(`"${field.name}" non e' un telefono valido: "${s}"`)
        else data[field.name] = s
        break
      }
      case 'number': {
        const n = coerceNumber(raw)
        if (n == null) { errors.push(`"${field.name}" non e' un numero valido: "${raw}"`); break }
        if (field.minValue != null && n < field.minValue) {
          errors.push(`"${field.name}" = ${n} sotto minimo ${field.minValue}`); break
        }
        if (field.maxValue != null && n > field.maxValue) {
          errors.push(`"${field.name}" = ${n} sopra massimo ${field.maxValue}`); break
        }
        data[field.name] = n
        break
      }
      case 'boolean': {
        const b = coerceBoolean(raw)
        if (b == null) errors.push(`"${field.name}" non e' un booleano valido: "${raw}"`)
        else data[field.name] = b
        break
      }
      case 'date': {
        const d = coerceDate(raw)
        if (!d) errors.push(`"${field.name}" non e' una data valida: "${raw}"`)
        else data[field.name] = d
        break
      }
      default:
        errors.push(`Tipo schema sconosciuto: ${field.type}`)
    }
  }

  // unitConversions attive: applica dopo il parsing dei numeri.
  const activeConv = opts.activeConversions
  if (activeConv && activeConv.size > 0 && Array.isArray(schema.unitConversions)) {
    for (const conv of schema.unitConversions) {
      if (!activeConv.has(conv.label)) continue
      for (const f of (conv.fields || [])) {
        if (data[f] != null && typeof data[f] === 'number') {
          data[f] = Math.round(data[f] * (conv.factor || 1))
        }
      }
    }
  }

  // Audit 2026-09-09: i campi in grammi finiscono in colonne INTEGER, e prima
  // l'arrotondamento arrivava da importUnpivot, che lo faceva sul valore in kg
  // (2,5 kg -> 3 -> 3.000 g). Ora si arrotonda qui, alla fine: quando i numeri
  // sono già in grammi non c'e' conversione da applicare, ma una cella con i
  // decimali va comunque portata all'intero prima dell'insert.
  for (const f of (schema.fields || [])) {
    if (f.type !== 'number') continue
    if (!/_g$/.test(f.name)) continue
    if (data[f.name] != null && typeof data[f.name] === 'number') {
      data[f.name] = Math.round(data[f.name])
    }
  }

  return errors.length === 0 ? { ok: true, data } : { ok: false, errors, data }
}

/**
 * Valida un batch di rows applicando il mapping.
 * @param {Object[]} rows
 * @param {Record<string,string>} mapping
 * @param {Object} schema
 * @param {Object} [opts] - Vedi validateRow: {lookups, activeConversions}
 * @returns {{ valid_rows, invalid_rows, stats }}
 */
export function validateRows(rows, mapping, schema, opts = {}) {
  const valid_rows = []
  const invalid_rows = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || typeof row !== 'object') {
      invalid_rows.push({ row_index: i, errors: ['riga non e un oggetto'], row_data: row })
      continue
    }
    const res = validateRow(row, mapping, schema, opts)
    // `_row_index` = riga del foglio da cui viene il dato. Serve a dire
    // all'utente la riga VERA quando un blocco di insert fallisce: prima si
    // stampava l'indice dentro le righe valide, che con 400 righe scartate e'
    // una riga completamente diversa. Chi inserisce lo togliera' dal payload.
    if (res.ok) valid_rows.push({ ...res.data, _row_index: i })
    else invalid_rows.push({ row_index: i, errors: res.errors, row_data: row })
  }
  return {
    valid_rows,
    invalid_rows,
    stats: { total: rows.length, valid: valid_rows.length, invalid: invalid_rows.length },
  }
}

/**
 * Estrae i field type='lookup' da uno schema.
 * @returns {Array<{name: string, resolver: Object}>}
 */
export function getLookupFields(schema) {
  return (schema.fields || [])
    .filter(f => f.type === 'lookup' && f.resolver)
    .map(f => ({ name: f.name, resolver: f.resolver }))
}

/**
 * Verifica che il mapping copra tutti i field required dello schema.
 * @returns {string[]} lista dei field required senza mapping (vuoto se ok)
 */
export function findMissingRequired(mapping, schema) {
  return schema.fields
    .filter(f => f.required && !mapping[f.name])
    .map(f => f.name)
}
