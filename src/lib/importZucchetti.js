// Zucchetti integration parsers
// 3a: Zucchetti Infinity CSV (Contabilità › Estratti conto › Export CSV)
// 3b: Zucchetti Kassa CSV/XML (export giornaliero)

function splitCSV(line, sep) {
  const result = []
  let cur = ''
  let inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue }
    if (ch === sep && !inQ) { result.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  result.push(cur.trim())
  return result
}

function detectSep(firstLine) {
  return firstLine.includes(';') ? ';' : ','
}

function normDate(s) {
  if (!s) return null
  // dd/mm/yyyy → yyyy-mm-dd
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  // already yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(s).trim())) return String(s).trim()
  return null
}

function normNum(s) {
  return parseFloat(String(s || '0').replace(/[.]/g, '').replace(',', '.')) || 0
}

// Parse Zucchetti Infinity export CSV
// Columns: Data, Causale, Dare, Avere, Saldo, Descrizione
export function parseZucchettiInfinity(csvText) {
  const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) throw new Error('File CSV vuoto')

  const sep = detectSep(lines[0])

  // Find header
  let headerIdx = -1
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const low = lines[i].toLowerCase()
    if ((low.includes('dare') || low.includes('avere')) && low.includes('data')) {
      headerIdx = i; break
    }
  }

  let headers
  let startIdx
  if (headerIdx >= 0) {
    headers = splitCSV(lines[headerIdx], sep).map(h => h.toLowerCase().replace(/['"]/g, '').trim())
    startIdx = headerIdx + 1
  } else {
    // Assume default column order
    headers = ['data', 'causale', 'dare', 'avere', 'saldo', 'descrizione']
    startIdx = 0
  }

  const get = (cols, name) => {
    const i = headers.indexOf(name)
    return i >= 0 ? (cols[i] || '').replace(/['"]/g, '').trim() : ''
  }

  const movimenti = []
  for (let i = startIdx; i < lines.length; i++) {
    const cols = splitCSV(lines[i], sep)
    const data = normDate(get(cols, 'data'))
    if (!data) continue

    const dare = normNum(get(cols, 'dare'))
    const avere = normNum(get(cols, 'avere'))
    const saldo = normNum(get(cols, 'saldo'))

    movimenti.push({
      data,
      causale: get(cols, 'causale'),
      dare,
      avere,
      saldo,
      descrizione: get(cols, 'descrizione'),
      tipo: dare > 0 ? 'uscita' : 'entrata',
      importo: dare > 0 ? dare : avere,
    })
  }

  if (!movimenti.length) throw new Error('Nessun movimento trovato — verifica il formato (Data, Causale, Dare, Avere, Saldo, Descrizione)')
  return movimenti
}

// Parse Zucchetti Kassa daily export
// Columns: Data, Ora, Reparto, Importo, IVA, Metodo pagamento
// Returns { vendite, chiusure_giornaliere }
export function parseZucchettiKassa(csvText) {
  const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) throw new Error('File CSV vuoto')

  const sep = detectSep(lines[0])

  // Find header
  let headerIdx = -1
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const low = lines[i].toLowerCase()
    if (low.includes('reparto') || low.includes('importo') || (low.includes('data') && low.includes('ora'))) {
      headerIdx = i; break
    }
  }

  let headers
  let startIdx
  if (headerIdx >= 0) {
    headers = splitCSV(lines[headerIdx], sep).map(h => h.toLowerCase().replace(/['"]/g, '').trim())
    startIdx = headerIdx + 1
  } else {
    headers = ['data', 'ora', 'reparto', 'importo', 'iva', 'metodo pagamento']
    startIdx = 0
  }

  const get = (cols, ...names) => {
    for (const name of names) {
      const i = headers.findIndex(h => h.includes(name))
      if (i >= 0) return (cols[i] || '').replace(/['"]/g, '').trim()
    }
    return ''
  }

  const vendite = []
  const totaliGiorno = {}

  for (let i = startIdx; i < lines.length; i++) {
    const cols = splitCSV(lines[i], sep)
    const data = normDate(get(cols, 'data'))
    if (!data) continue

    const importo = normNum(get(cols, 'importo'))
    const iva = normNum(get(cols, 'iva'))
    const reparto = get(cols, 'reparto') || 'Generico'
    const metodo = get(cols, 'metodo', 'pagamento') || 'contante'
    const ora = get(cols, 'ora')

    if (importo === 0) continue

    vendite.push({ data, ora, reparto, importo, iva, metodo_pagamento: metodo })

    if (!totaliGiorno[data]) {
      totaliGiorno[data] = { data, totale: 0, iva_totale: 0, per_metodo: {}, per_reparto: {} }
    }
    totaliGiorno[data].totale += importo
    totaliGiorno[data].iva_totale += iva
    totaliGiorno[data].per_metodo[metodo] = (totaliGiorno[data].per_metodo[metodo] || 0) + importo
    totaliGiorno[data].per_reparto[reparto] = (totaliGiorno[data].per_reparto[reparto] || 0) + importo
  }

  if (!vendite.length) throw new Error('Nessuna vendita trovata — verifica il formato (Data, Ora, Reparto, Importo, IVA, Metodo pagamento)')

  return {
    vendite,
    chiusure_giornaliere: Object.values(totaliGiorno).sort((a, b) => a.data.localeCompare(b.data)),
  }
}
