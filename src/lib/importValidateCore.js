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
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  if (m) {
    const [, dd, mm, yyyy] = m
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  return null
}

// ── Validation riga singola ───────────────────────────────────────────

/**
 * Valida una singola riga dopo aver applicato il mapping.
 * @param {Object} row - Riga input (chiavi = nomi colonne file)
 * @param {Record<string,string>} mapping - {field_target -> nome_colonna_input}
 * @param {Object} schema - EntitySchema da import-schemas.js
 * @returns {{ ok: true, data: Object } | { ok: false, errors: string[], data: Object }}
 */
export function validateRow(row, mapping, schema) {
  const errors = []
  const data = {}
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
  return errors.length === 0 ? { ok: true, data } : { ok: false, errors, data }
}

/**
 * Valida un batch di rows applicando il mapping.
 * @returns {{ valid_rows: Object[], invalid_rows: Array<{row_index:number, errors:string[], row_data:Object}>, stats: {total:number, valid:number, invalid:number} }}
 */
export function validateRows(rows, mapping, schema) {
  const valid_rows = []
  const invalid_rows = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || typeof row !== 'object') {
      invalid_rows.push({ row_index: i, errors: ['riga non e un oggetto'], row_data: row })
      continue
    }
    const res = validateRow(row, mapping, schema)
    if (res.ok) valid_rows.push(res.data)
    else invalid_rows.push({ row_index: i, errors: res.errors, row_data: row })
  }
  return {
    valid_rows,
    invalid_rows,
    stats: { total: rows.length, valid: valid_rows.length, invalid: invalid_rows.length },
  }
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
