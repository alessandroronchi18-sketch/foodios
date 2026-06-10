// Parser per export ordini da piattaforme e-commerce.
// Restituisce sempre: [{ data: 'YYYY-MM-DD', importo, ordini, fonte, dettagli? }]
// Aggrega per data ordini "pagati" / "completati".

import { parseNum } from './importCassa'

function parseItalianDate(str) {
  if (!str) return null
  str = String(str).trim()
  // ISO datetime
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)
  // "YYYY-MM-DD HH:MM:SS +ZZZZ" (Shopify timezone format)
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.slice(0, 10)
  // DD/MM/YYYY o DD-MM-YYYY
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

function detectSeparator(text) {
  const first = text.split('\n')[0] || ''
  const counts = { ',': 0, ';': 0, '\t': 0 }
  for (const c of first) if (c in counts) counts[c]++
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

function parseCSV(text) {
  const sep = detectSeparator(text)
  const lines = text.split('\n').map(l => l.trimEnd())
  if (!lines.length) return { headers: [], rows: [] }
  const headers = lines[0].split(sep).map(h => h.replace(/^["']|["']$/g, '').trim())
  const rows = lines.slice(1).filter(l => l.trim()).map(l => {
    const vals = []
    let cur = '', inQ = false
    for (const ch of l + sep) {
      if (ch === '"') { inQ = !inQ; continue }
      if (ch === sep && !inQ) { vals.push(cur.trim()); cur = '' }
      else cur += ch
    }
    const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
    return obj
  })
  return { headers, rows }
}

function aggregaPerData(rows, dateKey, totalKey, fonte, extraKeys = {}) {
  const map = {}
  for (const r of rows) {
    const data = parseItalianDate(r[dateKey])
    if (!data) continue
    const tot = parseNum(r[totalKey])
    if (!map[data]) map[data] = { importo: 0, ordini: 0, extra: {} }
    map[data].importo += tot
    map[data].ordini += 1
    for (const [k, srcKey] of Object.entries(extraKeys)) {
      map[data].extra[k] = (map[data].extra[k] || 0) + parseNum(r[srcKey])
    }
  }
  return Object.entries(map).map(([data, v]) => ({
    data,
    importo: Math.round(v.importo * 100) / 100,
    ordini: v.ordini,
    fonte,
    ...Object.fromEntries(Object.entries(v.extra).map(([k, val]) => [k, Math.round(val * 100) / 100])),
  })).sort((a, b) => a.data.localeCompare(b.data))
}

// ─── Shopify ────────────────────────────────────────────────────────────────
// Export "Orders" dal pannello Admin Shopify (Orders > Export).
// Colonne ufficiali documentate: Name, Email, Financial Status, Paid at,
// Fulfillment Status, Currency, Subtotal, Shipping, Taxes, Total, Discount Amount, ...
// Considera solo ordini "paid" e "partially_refunded".
export function parseShopifyOrders(csvText) {
  const { rows } = parseCSV(csvText)
  if (!rows.length) return []

  // Ogni "Order" è ripetuto su più righe (una per line item). Deduplico per Name.
  const seen = new Set()
  const ordersOnly = []
  for (const r of rows) {
    const id = r['Name'] || r['Order'] || r['ID']
    if (!id || seen.has(id)) continue
    seen.add(id)
    const status = String(r['Financial Status'] || r['Status'] || '').toLowerCase()
    if (status && !['paid', 'partially_refunded', 'authorized'].includes(status)) continue
    ordersOnly.push(r)
  }

  const dateKey = ['Paid at', 'Created at', 'Processed at'].find(k => ordersOnly[0]?.[k] !== undefined) || 'Created at'
  const totalKey = ['Total', 'Order Total'].find(k => ordersOnly[0]?.[k] !== undefined) || 'Total'

  return aggregaPerData(ordersOnly, dateKey, totalKey, 'Shopify', {
    iva: 'Taxes',
    spedizione: 'Shipping',
  })
}

// ─── WooCommerce ────────────────────────────────────────────────────────────
// Export "Orders" dal plugin standard WooCommerce Customer/Order CSV Export
// oppure dall'admin Orders > Export.
// Colonne tipiche: Order ID, Order Date, Status, Customer Email, Order Total,
// Tax Total, Shipping Total, Discount Total, Payment Method, ...
// Considera solo ordini "completed", "processing", "on-hold".
export function parseWooCommerceOrders(csvText) {
  const { rows } = parseCSV(csvText)
  if (!rows.length) return []

  // WooCommerce export ha 1 riga per ordine — niente dedupe necessaria
  const okStatuses = new Set(['completed', 'processing', 'on-hold', 'wc-completed', 'wc-processing'])
  const ordersOnly = rows.filter(r => {
    const s = String(r['Status'] || r['Order Status'] || r['order_status'] || '').toLowerCase().trim()
    return !s || okStatuses.has(s) || okStatuses.has(s.replace(/^wc-/, ''))
  })

  const dateKey = ['Order Date', 'Date', 'order_date', 'Created Date', 'paid_date'].find(k => ordersOnly[0]?.[k] !== undefined) || 'Order Date'
  const totalKey = ['Order Total', 'Total', 'order_total', 'Total Amount'].find(k => ordersOnly[0]?.[k] !== undefined) || 'Order Total'

  return aggregaPerData(ordersOnly, dateKey, totalKey, 'WooCommerce', {
    iva: ordersOnly[0]?.['Tax Total'] !== undefined ? 'Tax Total' : 'order_tax',
    spedizione: ordersOnly[0]?.['Shipping Total'] !== undefined ? 'Shipping Total' : 'order_shipping',
  })
}

// ─── Funzione merge: aggiunge gli ordini come "cassaImport" delle chiusure ──
export function mergeOrdiniInChiusure(chiusure = [], ordini = [], fonte = '') {
  const nuove = [...chiusure]
  for (const o of ordini) {
    const idx = nuove.findIndex(c => c.data === o.data)
    const entry = { ...o, importatoAt: new Date().toISOString() }
    if (idx >= 0) {
      nuove[idx] = {
        ...nuove[idx],
        cassaImport: [...(nuove[idx].cassaImport || []).filter(c => c.fonte !== fonte), entry],
      }
    } else {
      nuove.push({
        id: `ch-${o.data}-${fonte.toLowerCase()}`,
        data: o.data,
        salvatoAt: new Date().toISOString(),
        venduto: [],
        confronto: [],
        kpi: { totV: o.importo, totFC: 0, totM: o.importo, totS: 0, totMP: 0, avgST: 0 },
        cassaImport: [entry],
      })
    }
  }
  nuove.sort((a, b) => b.data.localeCompare(a.data))
  return nuove
}
