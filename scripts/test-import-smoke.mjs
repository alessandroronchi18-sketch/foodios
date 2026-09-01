#!/usr/bin/env node
/**
 * Smoke test per il tooling import:
 *   1. Genera un Excel di test con colonne "Ragione Sociale"/"Referente"/"Cellulare"
 *   2. Parsea con SheetJS (stesso flusso di import-any.mjs)
 *   3. Applica un mapping mock (come se l'AI avesse mappato correttamente)
 *   4. Valida con validateRows
 *   5. Verifica che valid_rows.length matcha attese + shape corretto
 *
 * Non chiama Anthropic ne Supabase. Girabile senza .env.local.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

import * as XLSX from 'xlsx'

import { getEntitySchema } from '../src/lib/importSchemas.js'
import { validateRows, findMissingRequired } from '../src/lib/importValidateCore.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Test 1: fornitori ────────────────────────────────────────────

function testFornitori() {
  console.log('\n=== TEST 1: fornitori — mapping esplicito ===')

  const xlsxPath = resolve(tmpdir(), 'foodos-test-fornitori.xlsx')
  // Simuliamo file cliente con nomi colonne NON standard
  const data = [
    ['Ragione Sociale', 'Referente', 'Cellulare', 'Email', 'Note'],
    ['Molino Rossi SRL', 'Mario Rossi', '333 1234567', 'info@molino.it', 'Farine 00 e integrali'],
    ['Latteria Verdi',   'Anna Verdi', '02/1234567', 'anna@verdi.it',  'Latte fresco vaccino'],
    ['Cioccolato Nero',  '',           '+39 3391234', 'ordini@nero.it', ''],
    // Riga con email invalida per testare error path
    ['Frutteria Sud',    'Luigi',      '3211234567', 'non-una-email', 'Frutta di stagione'],
    // Riga con nome vuoto (required) → invalid
    ['',                 'Anonimo',    '',           '',              'anagrafica incompleta'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Fornitori')
  XLSX.writeFile(wb, xlsxPath)
  console.log(`  Creato: ${xlsxPath}`)

  // Parse
  const buf = readFileSync(xlsxPath)
  const wb2 = XLSX.read(buf, { type: 'buffer' })
  const ws2 = wb2.Sheets[wb2.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: null, blankrows: false })
  const headers = raw[0].map(h => String(h).trim())
  const rows = raw.slice(1).map(r => {
    const o = {}
    for (let i = 0; i < headers.length; i++) o[headers[i]] = r[i] ?? null
    return o
  }).filter(r => Object.values(r).some(v => v != null && String(v).trim() !== ''))

  console.log(`  Headers letti: ${headers.join(' · ')}`)
  console.log(`  Righe non vuote: ${rows.length} (attese 5)`)

  // Mock mapping (come se AI avesse mappato correttamente)
  const mockMapping = {
    nome:     'Ragione Sociale',
    contatto: 'Referente',
    telefono: 'Cellulare',
    email:    'Email',
    note:     'Note',
  }

  const schema = getEntitySchema('fornitori')
  const missing = findMissingRequired(mockMapping, schema)
  if (missing.length > 0) throw new Error(`Missing required: ${missing.join(',')}`)

  const { valid_rows, invalid_rows, stats } = validateRows(rows, mockMapping, schema)
  console.log(`  Stats: total=${stats.total} valid=${stats.valid} invalid=${stats.invalid}`)
  console.log(`  Attese: 3 valide (Molino, Latteria, Cioccolato) · 2 invalide (Frutteria email + riga vuota)`)

  if (stats.total !== 5) throw new Error(`total=${stats.total}, atteso 5`)
  if (stats.valid !== 3) throw new Error(`valid=${stats.valid}, atteso 3`)
  if (stats.invalid !== 2) throw new Error(`invalid=${stats.invalid}, atteso 2`)

  // Verifica shape prima riga valida
  const first = valid_rows[0]
  if (first.nome !== 'Molino Rossi SRL') throw new Error(`nome mismatch: ${first.nome}`)
  if (first.email !== 'info@molino.it') throw new Error(`email mismatch: ${first.email}`)
  if (first.telefono !== '333 1234567') throw new Error(`telefono mismatch: ${first.telefono}`)

  // Verifica errori invalid
  const emailErr = invalid_rows.find(r => r.row_data['Ragione Sociale'] === 'Frutteria Sud')
  if (!emailErr) throw new Error('Attesa riga invalid per Frutteria Sud')
  if (!emailErr.errors.some(e => e.includes('email'))) throw new Error(`Attesa err email, ho: ${emailErr.errors.join(',')}`)

  console.log('  ✓ Test fornitori PASSED')
}

// ── Test 2: dipendenti — coerce numerici IT ─────────────────────

function testDipendenti() {
  console.log('\n=== TEST 2: dipendenti — coerce numerici IT ===')

  const data = [
    ['Nome Completo', 'Mansione', 'Contratto', 'Costo/h', 'Ore Settimana', 'Attivo'],
    ['Marco Bianchi',   'Pasticcere',  'Full-time',   '18,50', '40',   'si'],
    // Numeri IT "1.234,56" (con separatore migliaia): non realistico per ore ma per completezza
    ['Anna Nera',       'Commessa',    'Part-time',   '15,00', '25,5', 'sì'],
    // Costo con simbolo €
    ['Luca Grigio',     'Aiuto',       'Apprendistato', '12,50 €', '38', 'attivo'],
    // Ore fuori range (>60) → invalid
    ['Rossi Errato',    'Fantasma',    'Full-time',   '20',    '99',   'si'],
    // Costo non numerico → invalid
    ['Verdi Sbagliato', 'Impossibile', 'Full-time',   'gratis', '40',   'no'],
  ]

  const xlsxPath = resolve(tmpdir(), 'foodos-test-dipendenti.xlsx')
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Dipendenti')
  XLSX.writeFile(wb, xlsxPath)

  const buf = readFileSync(xlsxPath)
  const wb2 = XLSX.read(buf, { type: 'buffer' })
  const ws2 = wb2.Sheets[wb2.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: null, blankrows: false })
  const headers = raw[0].map(h => String(h).trim())
  const rows = raw.slice(1).map(r => {
    const o = {}
    for (let i = 0; i < headers.length; i++) o[headers[i]] = r[i] ?? null
    return o
  })

  const mockMapping = {
    nome:            'Nome Completo',
    ruolo:           'Mansione',
    tipo_contratto:  'Contratto',
    costo_orario:    'Costo/h',
    ore_settimana:   'Ore Settimana',
    attivo:          'Attivo',
  }

  const schema = getEntitySchema('dipendenti')
  const { valid_rows, invalid_rows, stats } = validateRows(rows, mockMapping, schema)
  console.log(`  Stats: total=${stats.total} valid=${stats.valid} invalid=${stats.invalid}`)
  console.log(`  Attese: 3 valide (Marco, Anna, Luca) · 2 invalide (ore >60, costo non numerico)`)

  if (stats.valid !== 3) throw new Error(`valid=${stats.valid}, atteso 3. Invalid errors: ${JSON.stringify(invalid_rows.map(r=>r.errors))}`)
  if (stats.invalid !== 2) throw new Error(`invalid=${stats.invalid}, atteso 2`)

  const marco = valid_rows[0]
  if (marco.costo_orario !== 18.5) throw new Error(`Marco costo=${marco.costo_orario}, atteso 18.5`)
  if (marco.ore_settimana !== 40) throw new Error(`Marco ore=${marco.ore_settimana}, atteso 40`)
  if (marco.attivo !== true) throw new Error(`Marco attivo=${marco.attivo}, atteso true`)

  const luca = valid_rows[2]
  if (luca.costo_orario !== 12.5) throw new Error(`Luca costo=${luca.costo_orario}, atteso 12.5 (parse "12,50 €")`)

  console.log('  ✓ Test dipendenti PASSED')
}

// ── Test 3: findMissingRequired ─────────────────────────────────

function testMissingRequired() {
  console.log('\n=== TEST 3: findMissingRequired ===')

  const schema = getEntitySchema('fornitori')

  // Nessun mapping → nome (required) mancante
  const missing1 = findMissingRequired({}, schema)
  if (!missing1.includes('nome')) throw new Error(`Atteso nome in missing, ho: ${missing1}`)
  console.log(`  Empty mapping → missing: ${missing1.join(',')} ✓`)

  // Mapping completo required → nessun mancante
  const missing2 = findMissingRequired({ nome: 'X' }, schema)
  if (missing2.length !== 0) throw new Error(`Atteso vuoto, ho: ${missing2}`)
  console.log(`  Mapping con nome → missing: [] ✓`)

  console.log('  ✓ Test findMissingRequired PASSED')
}

// ── Run ─────────────────────────────────────────────────────────

try {
  testFornitori()
  testDipendenti()
  testMissingRequired()
  console.log('\n🎉 TUTTI I TEST PASSATI')
} catch (e) {
  console.error(`\n❌ TEST FALLITO: ${e.message}`)
  if (e.stack) console.error(e.stack)
  process.exit(1)
}
