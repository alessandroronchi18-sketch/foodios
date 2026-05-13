// Italian electronic invoice (FatturaPA SDI) parser + TeamSystem FatturaSMART parser

async function loadXLSX() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX)
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
    s.onload = () => resolve(window.XLSX)
    s.onerror = reject
    document.head.appendChild(s)
  })
}

function parseExcelDate(val, XLSX) {
  if (val === null || val === undefined || val === '') return null
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  if (typeof val === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(val)
      if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    } catch { return null }
  }
  const s = String(val).trim()
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function normalizeStato(v) {
  const s = String(v || '').toLowerCase().trim()
  if ((s.includes('pagat') || s.includes('saldat')) && !s.includes('da')) return 'pagata'
  return 'da_pagare'
}

// Parse FatturaPA XML (SDI) — returns array of invoices compatible with FoodOS fatture table
export function parseFatturaXML(xmlString) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'application/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) throw new Error('XML non valido: ' + parseError.textContent.slice(0, 120))

  if (!doc.querySelector('FatturaElettronica')) {
    throw new Error('Elemento <FatturaElettronica> non trovato — verifica che sia una fattura elettronica italiana (formato FatturaPA)')
  }

  // Header: cedente/prestatore
  const cedente = doc.querySelector('CedentePrestatore')
  const denominazione = cedente?.querySelector('Denominazione')?.textContent?.trim() || ''
  const nome = cedente?.querySelector('Nome')?.textContent?.trim() || ''
  const cognome = cedente?.querySelector('Cognome')?.textContent?.trim() || ''
  const fornitore = denominazione || [nome, cognome].filter(Boolean).join(' ') || 'Fornitore sconosciuto'
  const piva = cedente?.querySelector('IdFiscaleIVA IdCodice')?.textContent?.trim() || ''
  const cf = cedente?.querySelector('CodiceFiscale')?.textContent?.trim() || ''

  const bodies = doc.querySelectorAll('FatturaElettronicaBody')
  if (!bodies.length) throw new Error('Nessun corpo fattura (FatturaElettronicaBody) trovato nel file XML')

  const fatture = []

  for (const body of bodies) {
    const dgd = body.querySelector('DatiGeneraliDocumento')
    const numero = dgd?.querySelector('Numero')?.textContent?.trim() || ''
    const data = dgd?.querySelector('Data')?.textContent?.trim() || null
    const totaleRaw = dgd?.querySelector('ImportoTotaleDocumento')?.textContent?.trim() || '0'
    const totale = Math.round((parseFloat(totaleRaw) || 0) * 100) / 100

    // Prefer DatiRiepilogo for imponibile/imposta
    let imponibile = 0
    let imposta = 0
    const riepilogos = body.querySelectorAll('DatiRiepilogo')
    if (riepilogos.length) {
      riepilogos.forEach(r => {
        imponibile += parseFloat(r.querySelector('ImponibileImporto')?.textContent?.trim() || '0') || 0
        imposta += parseFloat(r.querySelector('Imposta')?.textContent?.trim() || '0') || 0
      })
    } else {
      // Fallback: sum from DettaglioLinee
      body.querySelectorAll('DettaglioLinee').forEach(l => {
        const pt = parseFloat(l.querySelector('PrezzoTotale')?.textContent?.trim() || '0') || 0
        const iva = parseFloat(l.querySelector('AliquotaIVA')?.textContent?.trim() || '0') || 0
        imponibile += pt
        imposta += pt * (iva / 100)
      })
    }

    // Collect line items descriptions for note field
    const descrizioni = []
    body.querySelectorAll('DettaglioLinee').forEach(l => {
      const desc = l.querySelector('Descrizione')?.textContent?.trim()
      if (desc) descrizioni.push(desc)
    })

    fatture.push({
      numero_rif: numero,
      data_fattura: data,
      fornitore,
      piva,
      cf,
      imponibile: Math.round(imponibile * 100) / 100,
      imposta: Math.round(imposta * 100) / 100,
      totale,
      stato: 'da_pagare',
      note: descrizioni.slice(0, 3).join('; ') + (descrizioni.length > 3 ? '…' : ''),
    })
  }

  return fatture
}

// Parse TeamSystem FatturaSMART Excel export
// Columns: Numero, Suffisso, Anno, Data, Numero Rif., Data Rif., Tipo Documento,
//          Fornitore, CF, PIVA, Imponibile, Cassa Previdenza, Imposta,
//          Totale, Ritenuta, Netto a pagare, Stato
export async function parseFatturaSMART(file) {
  const XLSX = await loadXLSX()
  const ab = await file.arrayBuffer()
  const wb = XLSX.read(ab, { type: 'array', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Find header row by looking for "Fornitore" column
  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if (rows[i].some(c => String(c).trim() === 'Fornitore')) { headerIdx = i; break }
  }
  if (headerIdx === -1) {
    throw new Error('Intestazione "Fornitore" non trovata — esporta da TeamSystem: Contabilità › Fatture passive › Esporta Excel')
  }

  const headers = rows[headerIdx].map(h => String(h).trim())
  const idx = {}
  headers.forEach((h, i) => { idx[h] = i })

  const col = (row, ...names) => {
    for (const n of names) {
      if (idx[n] !== undefined) return String(row[idx[n]] ?? '').trim()
    }
    return ''
  }
  const num = (v) => parseFloat(String(v).replace(',', '.')) || 0

  const fatture = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const fornitore = col(row, 'Fornitore')
    if (!fornitore) continue

    const numRif = col(row, 'Numero Rif.', 'Numero Rif')
    const numBase = col(row, 'Numero')
    const suf = col(row, 'Suffisso')
    const numero_rif = numRif || (numBase ? `${numBase}${suf ? '/' + suf : ''}` : '')

    const totale = num(col(row, 'Totale'))
    const imponibile = num(col(row, 'Imponibile'))
    const imposta = num(col(row, 'Imposta'))
    const ritenuta = num(col(row, 'Ritenuta'))
    const netto_pagare = num(col(row, 'Netto a pagare'))
    const cassa_prev = num(col(row, 'Cassa Previdenza'))
    const piva = col(row, 'PIVA', 'P.IVA', 'Partita IVA')
    const cf = col(row, 'CF', 'Codice Fiscale')
    const tipo = col(row, 'Tipo Documento')

    if (totale === 0 && !fornitore) continue

    const entry = {
      numero_rif,
      data_fattura: parseExcelDate(row[idx['Data']], XLSX),
      data_rif: parseExcelDate(row[idx['Data Rif.']] ?? row[idx['Data Rif']], XLSX),
      fornitore,
      piva,
      cf,
      tipo_documento: tipo,
      imponibile,
      imposta,
      totale,
      stato: normalizeStato(col(row, 'Stato')),
    }
    if (ritenuta) entry.ritenuta = ritenuta
    if (netto_pagare) entry.netto_pagare = netto_pagare
    if (cassa_prev) entry.cassa_previdenza = cassa_prev

    fatture.push(entry)
  }
  return fatture
}
