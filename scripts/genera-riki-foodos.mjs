// Prende /Users/aler/Downloads/riki1.2.xlsx (layout pivot 40 gusti gelato +
// listino prezzi) e produce /Users/aler/Downloads/riki-foodos-ready.xlsx
// nel formato standard Foodos (1 sheet per ricetta + 1 sheet "ingredienti"
// per il listino prezzi). Cosi' l'utente carica dalla UI e il parser rigido
// lo prende in 1 click senza AI.

import { readFileSync, writeFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

const IN = '/Users/aler/Downloads/riki1.2.xlsx'
const OUT = '/Users/aler/Downloads/riki-foodos-ready.xlsx'

const SEP_HEADER_RE = /quantitativo|materia\s*prima|prodotto|ingredient|nome|totale|somma/i

// Legge il file input
const buf = readFileSync(IN)
const wb = XLSX.read(buf, { type: 'buffer' })

// ── 1. Estrai listino prezzi ────────────────────────────────────────────────
const listinoWs = wb.Sheets['listino materie prime']
const listinoRows = XLSX.utils.sheet_to_json(listinoWs, { header: 1, defval: null })
// Layout: MATERIA PRIMA, TIPOLOGIA, UDM, VOLUME, COSTO CONFEZIONE, COSTO UNITARIO €/UDM
// Il costo unitario e' formattato "8.24 €" o "1.66", possibilmente null.
const prezzi = {} // { nomeLowercase: costoKg }
function parseCosto(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const clean = String(v).replace(/[^\d.,-]/g, '').replace(',', '.')
  const n = parseFloat(clean)
  return Number.isFinite(n) ? n : null
}
for (let i = 1; i < listinoRows.length; i++) {
  const nome = String(listinoRows[i]?.[0] || '').trim()
  if (!nome) continue
  const volume = parseCosto(listinoRows[i]?.[3]) // volume confezione (litri o kg)
  const costoConf = parseCosto(listinoRows[i]?.[4]) // costo confezione €
  const costoUnit = parseCosto(listinoRows[i]?.[5]) // costo €/UDM (gia' calcolato)
  // Preferisci costoUnit se disponibile; altrimenti costoConf/volume
  let costoKg = null
  if (costoUnit != null && costoUnit > 0) costoKg = costoUnit
  else if (costoConf != null && volume != null && volume > 0) costoKg = costoConf / volume
  if (costoKg != null && costoKg > 0) prezzi[nome.toLowerCase()] = costoKg
}
console.log(`Listino: ${Object.keys(prezzi).length} ingredienti con prezzo`)

// ── 2. Estrai ricette dal pivot ─────────────────────────────────────────────
const pivotWs = wb.Sheets['ricette gusti']
const pivotRows = XLSX.utils.sheet_to_json(pivotWs, { header: 1, defval: null, blankrows: false })

const header = pivotRows[0] || []
// Colonne "label" (ingredienti) — di solito solo col 0, ma in file con doppio
// blocco anche altre col intermedie possono essere label. Le riconosciamo se
// il loro header matcha SEP_HEADER_RE.
const labelCols = [0]
for (let c = 1; c < header.length; c++) {
  const h = String(header[c] || '').trim()
  if (h && SEP_HEADER_RE.test(h)) labelCols.push(c)
}
// Colonne ricetta = tutte quelle con header non vuoto e non separator
const ricetteCol = []
for (let c = 1; c < header.length; c++) {
  const h = String(header[c] || '').trim()
  if (!h || SEP_HEADER_RE.test(h)) continue
  ricetteCol.push({ nome: h, col: c })
}
console.log(`Ricette rilevate: ${ricetteCol.length}`)

// Per ogni riga trova la label ingrediente piu' vicina a sinistra
function ingredienteDiRiga(row, colRicetta) {
  // Scorri le labelCols da destra a sinistra: la piu' vicina <= colRicetta e' la label giusta
  const validLabels = labelCols.filter(lc => lc < colRicetta)
  for (const lc of validLabels.slice().reverse()) {
    const v = String(row[lc] || '').trim()
    if (v && !SEP_HEADER_RE.test(v)) return v
  }
  return ''
}

const ricette = [] // [{ nome, ingredienti: [{nome, qty1stampo, costoKg}] }]
for (const { nome, col } of ricetteCol) {
  const ings = []
  for (let r = 1; r < pivotRows.length; r++) {
    const row = pivotRows[r] || []
    const raw = row[col]
    if (raw == null || raw === '') continue
    const qtyKg = Number(raw)
    if (!Number.isFinite(qtyKg) || qtyKg <= 0) continue
    const ing = ingredienteDiRiga(row, col)
    if (!ing) continue
    const qty1stampo = Math.round(qtyKg * 1000) // kg -> g
    const costoKg = prezzi[ing.toLowerCase()] || 0
    const costoPerG = costoKg > 0 ? parseFloat((costoKg / 1000).toFixed(6)) : 0
    const costo1stampo = parseFloat((qty1stampo * costoPerG).toFixed(3))
    ings.push({ nome: ing, qty1stampo, costoPerG, costo1stampo })
  }
  if (ings.length === 0) continue
  ricette.push({ nome, ingredienti: ings })
}
console.log(`Ricette con ingredienti validi: ${ricette.length}`)
for (const r of ricette) console.log(`  · ${r.nome}: ${r.ingredienti.length} ingredienti`)

// ── 3. Costruisci il nuovo XLSX in schema Foodos ───────────────────────────
// Per ogni ricetta un sheet con questo layout:
//   Row 0: ["Nome ricetta", NOMERICETTA, "", "", "", totImpasto1]
//   Row 1: ["Num stampi", 1]
//   Row 2: ["", "", "", "", "", foodCost1]
//   Rows 3-6: vuoti
//   Row 7+: [nome, qty1stampo, costoPerG, costo1stampo]
// Nome sheet: max 31 char, no [ ] : * / \ ?
function sanitizeSheetName(name, i) {
  let s = String(name).replace(/[[\]:*/\\?]/g, ' ').trim().slice(0, 28)
  if (!s) s = `ricetta ${i + 1}`
  return s
}
const outWb = XLSX.utils.book_new()
const usedNames = new Set()

for (let i = 0; i < ricette.length; i++) {
  const r = ricette[i]
  const totImpasto1 = r.ingredienti.reduce((s, ing) => s + ing.qty1stampo, 0)
  const foodCost1 = parseFloat(r.ingredienti.reduce((s, ing) => s + ing.costo1stampo, 0).toFixed(2))
  const aoa = [
    ['Nome ricetta', r.nome.toUpperCase(), '', '', '', totImpasto1],
    ['Num stampi', 1],
    ['', '', '', '', '', foodCost1],
    [],
    [],
    [],
    [],
    ['Ingrediente', 'g/stampo', '€/g', '€/stampo'],
    ...r.ingredienti.map(ing => [ing.nome, ing.qty1stampo, ing.costoPerG, ing.costo1stampo]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  let name = sanitizeSheetName(r.nome, i)
  let suffix = 1
  while (usedNames.has(name.toLowerCase())) {
    name = sanitizeSheetName(r.nome, i).slice(0, 26) + ` (${suffix++})`
  }
  usedNames.add(name.toLowerCase())
  XLSX.utils.book_append_sheet(outWb, ws, name)
}

// Sheet "ingredienti" per i prezzi (parser rigido lo cerca per nome che
// contiene "ingredient*")
const listinoAoa = [['Ingrediente', 'Costo €/kg', 'Costo €/g']]
for (const [nome, costoKg] of Object.entries(prezzi)) {
  listinoAoa.push([nome, costoKg, parseFloat((costoKg / 1000).toFixed(6))])
}
XLSX.utils.book_append_sheet(outWb, XLSX.utils.aoa_to_sheet(listinoAoa), 'ingredienti')

XLSX.writeFile(outWb, OUT)
console.log(`\nGenerato: ${OUT}`)
console.log(`Contiene ${ricette.length} sheets ricetta + 1 sheet "ingredienti".`)
console.log('Caricalo dalla UI Foodos: Ricettario → Aggiorna ricettario.')
