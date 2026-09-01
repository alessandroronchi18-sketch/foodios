#!/usr/bin/env node
/**
 * Melter custom per il "FOGLIO PRODUZIONE MAGGIO 2026" di Mara.
 *
 * Input:  import-data/FOGLIO PRODUZIONE MAGGIO 2026.xlsx (WIDE, 3 tab sede)
 * Output: import-data/produzione-maggio-LONG.xlsx  (LONG, 1 riga per data×sede×gusto)
 *
 * Formato input per ogni tab sede (BERTHOLLET / CARLINA / DE GASPERI):
 *   riga 0: giorni settimana ("venerdì", "sabato", ...) + "VENDUTO SETTIMANA N"
 *   riga 1: numero del giorno del mese (1, 2, 3, ...)
 *   riga 2: "PROD" | "RIMAN." | "Rimanenza" (iniziale) | null
 *   riga 3+: gusto | rimanenza iniziale | 30 colonne (PROD/RIMAN. per ogni giorno)
 *
 * Convenzione date: maggio 2026 inizia il venerdì 1 (verificato). Costruzione
 * data ISO: '2026-05-' + zero-pad(giorno).
 *
 * Skip: TOTALI, ALTRI PRODOTTI, RISTORANTI, GELATO ELIMINATO (non produzione).
 * Skip righe: nome gusto vuoto o "TOTALE".
 * Skip colonne: r2 non e' "PROD" ne "RIMAN." (rimanenza iniziale, VENDUTO, ecc).
 *
 * Output columns per il wizard produzione_inventario:
 *   data | sede | gusto | produzione_g | rimanenza_g
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

const INPUT = resolve(REPO_ROOT, 'import-data', 'FOGLIO PRODUZIONE MAGGIO 2026.xlsx')
const OUTPUT = resolve(REPO_ROOT, 'import-data', 'produzione-maggio-LONG.xlsx')
const MESE = '2026-05'
const SEDI_SHEETS = ['BERTHOLLET', 'CARLINA', 'DE GASPERI']

function trimSheetName(name) { return String(name).trim() }

function processSede(wb, sheetName) {
  const cleanName = trimSheetName(sheetName)
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`Sheet non trovato: "${sheetName}"`)
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false })
  if (raw.length < 4) {
    console.log(`  [${cleanName}] sheet troppo corto (${raw.length} righe), skip`)
    return []
  }

  const r0 = raw[0] || []
  const r1 = raw[1] || []
  const r2 = raw[2] || []

  // Determina quali colonne sono dati utili: PROD o RIMAN. con day valido.
  const columns = []
  for (let c = 0; c < r2.length; c++) {
    const label = String(r2[c] ?? '').trim().toUpperCase()
    if (label !== 'PROD' && label !== 'RIMAN.') continue
    const day = Number(r1[c])
    if (!Number.isFinite(day) || day < 1 || day > 31) continue
    columns.push({ col: c, day, type: label === 'PROD' ? 'produzione_g' : 'rimanenza_g' })
  }
  console.log(`  [${cleanName}] ${columns.length} colonne dati (PROD+RIMAN attesi 2×31 = 62 max)`)

  // Aggrega per (data, gusto) unendo PROD + RIMAN.
  const outMap = new Map()
  for (let r = 3; r < raw.length; r++) {
    const row = raw[r] || []
    const gusto = String(row[0] ?? '').trim()
    if (!gusto) continue
    if (gusto.toUpperCase().startsWith('TOTALE')) continue

    for (const { col, day, type } of columns) {
      const raw_v = row[col]
      if (raw_v == null || raw_v === '' || raw_v === 0) continue
      const n = Number(raw_v)
      if (!Number.isFinite(n) || n < 0) continue
      const data = `${MESE}-${String(day).padStart(2, '0')}`
      const key = `${data}|${gusto}`
      if (!outMap.has(key)) {
        outMap.set(key, { data, sede: cleanName, gusto, produzione_g: 0, rimanenza_g: 0 })
      }
      outMap.get(key)[type] = Math.round(n)
    }
  }
  return Array.from(outMap.values())
}

function main() {
  console.log(`Leggo ${INPUT}...`)
  const buf = readFileSync(INPUT)
  const wb = XLSX.read(buf, { type: 'buffer' })
  console.log('Sheet trovati:', wb.SheetNames.map(s => `"${s}"`).join(', '))

  const allRows = []
  for (const sedi of SEDI_SHEETS) {
    // Il file ha spazi leading, matching flessibile
    const matched = wb.SheetNames.find(n => trimSheetName(n).toUpperCase() === sedi)
    if (!matched) {
      console.warn(`  ATTENZIONE: sheet "${sedi}" non trovato nel file, skip`)
      continue
    }
    const rows = processSede(wb, matched)
    console.log(`  ${sedi}: ${rows.length} righe LONG emesse`)
    allRows.push(...rows)
  }

  if (allRows.length === 0) {
    console.error('Nessuna riga estratta. Verifica il file.')
    process.exit(1)
  }

  // Ordina per (sede, data, gusto) per output leggibile
  allRows.sort((a, b) => {
    if (a.sede !== b.sede) return a.sede.localeCompare(b.sede)
    if (a.data !== b.data) return a.data.localeCompare(b.data)
    return a.gusto.localeCompare(b.gusto)
  })

  console.log(`\nTotale righe emesse: ${allRows.length}`)
  console.log('Sample prime 3:')
  for (const r of allRows.slice(0, 3)) console.log(' ', r)
  console.log('Sample ultime 3:')
  for (const r of allRows.slice(-3)) console.log(' ', r)

  // Stats per sede
  const stats = {}
  for (const r of allRows) {
    stats[r.sede] = stats[r.sede] || { rows: 0, gusti: new Set(), giorni: new Set() }
    stats[r.sede].rows += 1
    stats[r.sede].gusti.add(r.gusto)
    stats[r.sede].giorni.add(r.data)
  }
  console.log('\nStatistiche per sede:')
  for (const [sede, s] of Object.entries(stats)) {
    console.log(`  ${sede}: ${s.rows} righe, ${s.gusti.size} gusti, ${s.giorni.size} giorni coperti`)
  }

  // Genera xlsx output
  const header = ['data', 'sede', 'gusto', 'produzione_g', 'rimanenza_g']
  const aoa = [header, ...allRows.map(r => header.map(h => r[h]))]
  const outWs = XLSX.utils.aoa_to_sheet(aoa)
  const outWb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(outWb, outWs, 'Produzione LONG')
  XLSX.writeFile(outWb, OUTPUT)
  console.log(`\nScritto: ${OUTPUT}`)
  console.log('\nOra carica questo file dal wizard: Menu -> Modelli e import dati -> Carica anagrafiche -> Produzione gelateria')
}

main()
