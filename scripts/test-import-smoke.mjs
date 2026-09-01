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
import { validateRows, findMissingRequired, getLookupFields } from '../src/lib/importValidateCore.js'
import { applyUnpivot, defaultGelateriaWideConfig } from '../src/lib/importUnpivot.js'

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

// ── Test 4: produzione — lookup sede_id + conversione kg→g ──────

function testProduzioneLookup() {
  console.log('\n=== TEST 4: produzione_inventario — lookup + kg→g ===')

  const schema = getEntitySchema('produzione_inventario')
  if (!schema) throw new Error('Schema produzione_inventario non trovato')

  const lookupFields = getLookupFields(schema)
  if (lookupFields.length !== 1) throw new Error(`Attesi 1 lookup field, ho ${lookupFields.length}`)
  if (lookupFields[0].name !== 'sede_id') throw new Error(`Atteso sede_id, ho ${lookupFields[0].name}`)

  const rows = [
    { 'Giorno': '2026-03-01', 'Sede': 'Torino Centro', 'Gusto': 'Nocciola',   'Kg':   '2,5' },
    { 'Giorno': '2026-03-01', 'Sede': 'Torino Centro', 'Gusto': 'Pistacchio', 'Kg':   '3'   },
    { 'Giorno': '2026-03-01', 'Sede': 'Milano Nord',    'Gusto': 'Fiordilatte','Kg':  '4'   },
    // Sede non esistente → invalid
    { 'Giorno': '2026-03-02', 'Sede': 'Roma Sud',      'Gusto': 'Cioccolato', 'Kg':  '2'   },
  ]

  const mapping = { data: 'Giorno', sede_id: 'Sede', gusto_nome: 'Gusto', produzione_g: 'Kg' }

  // Lookup mock: solo Torino Centro e Milano Nord esistono
  const lookups = {
    sede_id: new Map([
      ['torino centro', 'uuid-torino'],
      ['milano nord', 'uuid-milano'],
    ]),
  }

  // Conversione kg→g attiva
  const activeConversions = new Set(['I miei numeri sono in kg (convertili in grammi)'])

  const { valid_rows, invalid_rows, stats } = validateRows(rows, mapping, schema, { lookups, activeConversions })
  console.log(`  Stats: total=${stats.total} valid=${stats.valid} invalid=${stats.invalid}`)
  console.log(`  Attese: 3 valide (Torino x2 + Milano) · 1 invalida (Roma Sud sconosciuta)`)

  if (stats.valid !== 3) throw new Error(`valid=${stats.valid}, atteso 3. Errori: ${JSON.stringify(invalid_rows.map(r => r.errors))}`)
  if (stats.invalid !== 1) throw new Error(`invalid=${stats.invalid}, atteso 1`)

  const nocciola = valid_rows[0]
  if (nocciola.sede_id !== 'uuid-torino') throw new Error(`sede_id mismatch: ${nocciola.sede_id}`)
  if (nocciola.produzione_g !== 2500) throw new Error(`produzione_g=${nocciola.produzione_g}, atteso 2500 (2.5 kg × 1000)`)

  const romaErr = invalid_rows[0]
  if (!romaErr.errors.some(e => e.includes('Roma Sud'))) throw new Error(`Atteso errore Roma Sud, ho: ${romaErr.errors.join(',')}`)

  console.log('  ✓ Test produzione lookup+conversion PASSED')
}

// ── Test 5: produzione — senza conversione (grammi diretti) ────

function testProduzioneNoConversion() {
  console.log('\n=== TEST 5: produzione_inventario — grammi diretti (no conversione) ===')

  const schema = getEntitySchema('produzione_inventario')
  const rows = [
    { 'Giorno': '2026-03-01', 'Sede': 'Torino Centro', 'Gusto': 'Nocciola', 'Grammi': '2500' },
  ]
  const mapping = { data: 'Giorno', sede_id: 'Sede', gusto_nome: 'Gusto', produzione_g: 'Grammi' }
  const lookups = { sede_id: new Map([['torino centro', 'uuid-torino']]) }
  const activeConversions = new Set() // NESSUNA conversione

  const { valid_rows, stats } = validateRows(rows, mapping, schema, { lookups, activeConversions })
  if (stats.valid !== 1) throw new Error(`valid=${stats.valid}, atteso 1`)
  if (valid_rows[0].produzione_g !== 2500) throw new Error(`produzione_g=${valid_rows[0].produzione_g}, atteso 2500 (senza conversione)`)

  console.log('  ✓ Test produzione senza conversione PASSED')
}

// ── Test 6: Unpivot WIDE gelateria (formato Mara) ──────────────

function testUnpivotWideGelateria() {
  console.log('\n=== TEST 6: unpivot WIDE gelateria stile Mara ===')

  const sedeBerthollet = [
    [null, null, 'venerdì', null, 'sabato', null, 'VENDUTO SETTIMANA 1'],
    ['GUSTI', null, 1, null, 2, null, null],
    [null, 'Rimanenza', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', null],
    ['FIOR DI PANNA', 8900, null, 4700, 8800, 8000, 14900],
    ['STRACCIATELLA', 6200, 4000, 5000, 4000, 3700, 13500],
    ['TOTALE ', 15100, 4000, 9700, 12800, 11700, 28400],
  ]
  const sedeCarlina = [
    [null, null, 'venerdì', null, 'sabato', null, 'VENDUTO SETTIMANA 1'],
    ['GUSTI', null, 1, null, 2, null, null],
    [null, 'Rimanenza', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', null],
    ['NOCCIOLA', 3000, 5000, 2000, 4000, 1500, 6500],
    ['TOTALE ', 3000, 5000, 2000, 4000, 1500, 6500],
  ]

  const rawSheets = {
    ' BERTHOLLET': sedeBerthollet,
    ' CARLINA': sedeCarlina,
    'TOTALI': [['TOTALI'], [null]],
  }

  const config = {
    ...defaultGelateriaWideConfig('2026-05'),
    sheets_to_process: ['BERTHOLLET', 'CARLINA'],
    sheets_to_skip: ['TOTALI'],
  }

  const { rows, per_sheet, warnings } = applyUnpivot(rawSheets, config)

  console.log(`  Righe estratte: ${rows.length}`)
  console.log(`  Per sheet:`, per_sheet)
  if (warnings.length > 0) console.log('  Warnings:', warnings)

  // Attese:
  // BERTHOLLET FIOR DI PANNA g1: RIMAN=4700 → 1 riga
  // BERTHOLLET FIOR DI PANNA g2: PROD=8800+RIMAN=8000 → 1 riga
  // BERTHOLLET STRACCIATELLA g1: PROD=4000+RIMAN=5000 → 1 riga
  // BERTHOLLET STRACCIATELLA g2: PROD=4000+RIMAN=3700 → 1 riga
  // CARLINA NOCCIOLA g1: PROD=5000+RIMAN=2000 → 1 riga
  // CARLINA NOCCIOLA g2: PROD=4000+RIMAN=1500 → 1 riga
  // Totale: 6 righe
  if (rows.length !== 6) throw new Error(`rows=${rows.length}, atteso 6`)

  const g2 = rows.find(r => r.sede === 'BERTHOLLET' && r.gusto_nome === 'FIOR DI PANNA' && r.data === '2026-05-02')
  if (!g2) throw new Error('Non trovato Berthollet FIOR DI PANNA 02/05')
  if (g2.produzione_g !== 8800) throw new Error(`produzione_g=${g2.produzione_g}, atteso 8800`)
  if (g2.rimanenza_g !== 8000) throw new Error(`rimanenza_g=${g2.rimanenza_g}, atteso 8000`)

  if (!rows.every(r => ['BERTHOLLET', 'CARLINA'].includes(r.sede))) {
    throw new Error('Sede non popolata correttamente')
  }
  if (rows.some(r => r.gusto_nome && r.gusto_nome.startsWith('TOTALE'))) {
    throw new Error('Trovata riga TOTALE non skippata')
  }

  console.log('  ✓ Test unpivot WIDE PASSED')
}

// ── Run ─────────────────────────────────────────────────────────

try {
  testFornitori()
  testDipendenti()
  testMissingRequired()
  testProduzioneLookup()
  testProduzioneNoConversion()
  testUnpivotWideGelateria()
  console.log('\n🎉 TUTTI I TEST PASSATI')
} catch (e) {
  console.error(`\n❌ TEST FALLITO: ${e.message}`)
  if (e.stack) console.error(e.stack)
  process.exit(1)
}
