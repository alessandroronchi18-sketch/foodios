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

// XLSX dinamico: se non installato (repo fresh senza npm install), skip test
// che generano Excel. I test di logica pura (7-11) girano lo stesso.
let XLSX
try { XLSX = await import('xlsx') } catch { XLSX = null }

import { getEntitySchema } from '../src/lib/importSchemas.js'
import { validateRows, findMissingRequired, getLookupFields } from '../src/lib/importValidateCore.js'
import { applyUnpivot, defaultGelateriaWideConfig } from '../src/lib/importUnpivot.js'
import { guessMonthIsoFromFilename } from '../src/lib/importDateGuess.js'
import { summarizeErrors } from '../src/lib/importErrorSummary.js'
import { calcKpiStats, calcPerGustoDifferenziale } from '../src/lib/produzioneStats.js'

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

// ── Test 7: guessMonthIsoFromFilename ───────────────────────────

function testMonthGuess() {
  console.log('\n=== TEST 7: guessMonthIsoFromFilename ===')
  const cases = [
    ['FOGLIO PRODUZIONE MAGGIO 2026.xlsx', '2026-05'],
    ['produzione_giugno_2026.xlsx', '2026-06'],
    ['LUGLIO 2026 - agenda.xlsx', '2026-07'],
    ['agosto2027notes.xlsx', '2027-08'],
    ['gennaio 2025 - stock.csv', '2025-01'],
    ['dicembre-2025.xlsx', '2025-12'],
    // Nessun mese → null
    ['random file.xlsx', null],
    ['just numbers 12345.xlsx', null],
    // Mese ma nessun anno 20xx → null
    ['maggio.xlsx', null],
    // Anno prima del 2000 → null (nostro regex e' 20xx)
    ['maggio 1999.xlsx', null],
    // Case insensitive
    ['MARZO 2026.xlsx', '2026-03'],
    // Null/undefined/vuoto → null
    [null, null],
    [undefined, null],
    ['', null],
    [123, null],
  ]
  for (const [input, expected] of cases) {
    const got = guessMonthIsoFromFilename(input)
    if (got !== expected) {
      throw new Error(`guessMonth("${input}") = ${JSON.stringify(got)}, atteso ${JSON.stringify(expected)}`)
    }
  }
  console.log(`  ✓ Test guessMonthIsoFromFilename PASSED (${cases.length} casi)`)
}

// ── Test 8: summarizeErrors — pattern recognition ───────────────

function testSummarizeErrors() {
  console.log('\n=== TEST 8: summarizeErrors ===')

  // 0 righe → null
  if (summarizeErrors([]) !== null) throw new Error('Atteso null per array vuoto')
  if (summarizeErrors(null) !== null) throw new Error('Atteso null per null')

  // Dominante: dateNull (piu del 50%)
  const dateNullRows = [
    { row_index: 0, errors: ['"data" non e una data valida: "null-01"'] },
    { row_index: 1, errors: ['"data" non e una data valida: "null-02"'] },
    { row_index: 2, errors: ['"data" non e una data valida: "null-03"'] },
    { row_index: 3, errors: ['random other error'] },
  ]
  const s1 = summarizeErrors(dateNullRows)
  if (!s1 || !s1.title.toLowerCase().includes('mese')) {
    throw new Error(`Atteso title 'mese', ho: ${s1?.title}`)
  }

  // Dominante: sede lookup
  const sedeRows = [
    { row_index: 0, errors: ['"sede_id" = "Milano" non trovato tra le 3 opzioni'] },
    { row_index: 1, errors: ['"sede_id" = "Roma" non trovato tra le 3 opzioni'] },
    { row_index: 2, errors: ['"sede_id" = "Bari" non trovato tra le 3 opzioni'] },
  ]
  const s2 = summarizeErrors(sedeRows)
  if (!s2 || !s2.title.toLowerCase().includes('sedi')) {
    throw new Error(`Atteso title sedi, ho: ${s2?.title}`)
  }

  // Nessun pattern dominante (mix vario) → null
  const mixRows = [
    { row_index: 0, errors: ['"data" non e una data valida: "xxx"'] },
    { row_index: 1, errors: ['"sede_id" non trovato tra 3'] },
    { row_index: 2, errors: ['"costo_orario" non e un numero valido: "abc"'] },
    { row_index: 3, errors: ['campo obbligatorio "nome" vuoto'] },
  ]
  const s3 = summarizeErrors(mixRows)
  // 4 righe, ogni categoria = 1 riga = 25% < 50% → null
  if (s3 !== null) throw new Error(`Atteso null per mix, ho: ${JSON.stringify(s3)}`)

  console.log('  ✓ Test summarizeErrors PASSED')
}

// ── Test 9: calcKpiStats — produzione aggregata ─────────────────

function testCalcKpiStats() {
  console.log('\n=== TEST 9: calcKpiStats ===')

  // 0 righe → tutto zero
  const empty = calcKpiStats([])
  if (empty.prod !== 0 || empty.venduto !== 0 || empty.scarto !== 0) throw new Error('Atteso tutto zero per rows vuoto')

  // 2 gusti × 2 giorni: prod=10kg, scarto=1kg, rimanenza finale=3kg → venduto=6kg
  const rows = [
    { gusto_nome: 'NOCCIOLA', data: '2026-05-01', produzione_g: 3000, rimanenza_g: 1000, scarto_g: 200 },
    { gusto_nome: 'NOCCIOLA', data: '2026-05-02', produzione_g: 2000, rimanenza_g: 1500, scarto_g: 300 },
    { gusto_nome: 'FIOR DI PANNA', data: '2026-05-01', produzione_g: 3000, rimanenza_g: 800, scarto_g: 200 },
    { gusto_nome: 'FIOR DI PANNA', data: '2026-05-02', produzione_g: 2000, rimanenza_g: 1500, scarto_g: 300 },
  ]
  const s = calcKpiStats(rows)
  // prod = 3000+2000+3000+2000 = 10000
  if (s.prod !== 10000) throw new Error(`prod=${s.prod}, atteso 10000`)
  // scarto = 200+300+200+300 = 1000
  if (s.scarto !== 1000) throw new Error(`scarto=${s.scarto}, atteso 1000`)
  // rimanenza finale = 1500 (nocc) + 1500 (fior) = 3000 (ultima data per ogni gusto)
  // venduto stimato = 10000 - 1000 - 3000 = 6000
  if (s.venduto !== 6000) throw new Error(`venduto=${s.venduto}, atteso 6000`)
  // scartoPct = 1000/10000 = 10%
  if (Math.abs(s.scartoPct - 10) > 0.01) throw new Error(`scartoPct=${s.scartoPct}, atteso 10`)
  if (s.gustiN !== 2) throw new Error(`gustiN=${s.gustiN}, atteso 2`)

  // Gusto con rimanenza alta: rimanFin > prod
  const stagnante = [
    { gusto_nome: 'ARANCIA', data: '2026-05-01', produzione_g: 1000, rimanenza_g: 900, scarto_g: 0 },
    { gusto_nome: 'ARANCIA', data: '2026-05-02', produzione_g: 500, rimanenza_g: 2000, scarto_g: 0 }, // riman > prod totale (1500)
  ]
  const s2 = calcKpiStats(stagnante)
  if (!s2.gustiRimanAlta.includes('ARANCIA')) {
    throw new Error(`Atteso ARANCIA in gustiRimanAlta, ho: ${JSON.stringify(s2.gustiRimanAlta)}`)
  }

  console.log('  ✓ Test calcKpiStats PASSED')
}

// ── Test 10: calcPerGustoDifferenziale — venduto residuo ────────

function testCalcPerGustoDifferenziale() {
  console.log('\n=== TEST 10: calcPerGustoDifferenziale ===')

  // Gusto NOCCIOLA con 3 giorni consecutivi
  //  g1: prod=3000, riman=1000, scarto=100 → venduto = 0+3000-1000-100 = 1900 (rimanPrev iniziale=0)
  //  g2: prod=2000, riman=1500, scarto=50  → rimanPrev=1000, venduto = 1000+2000-1500-50 = 1450
  //  g3: prod=2500, riman=800, scarto=0    → rimanPrev=1500, venduto = 1500+2500-800-0 = 3200
  //  Totale: prod=7500, scarto=150, venduto=6550
  const rows = [
    { gusto_nome: 'NOCCIOLA', data: '2026-05-01', produzione_g: 3000, rimanenza_g: 1000, scarto_g: 100 },
    { gusto_nome: 'NOCCIOLA', data: '2026-05-02', produzione_g: 2000, rimanenza_g: 1500, scarto_g: 50 },
    { gusto_nome: 'NOCCIOLA', data: '2026-05-03', produzione_g: 2500, rimanenza_g: 800, scarto_g: 0 },
  ]
  const p = calcPerGustoDifferenziale(rows)
  const noc = p['NOCCIOLA']
  if (!noc) throw new Error('NOCCIOLA mancante')
  if (noc.prodTot !== 7500) throw new Error(`prodTot=${noc.prodTot}, atteso 7500`)
  if (noc.scartoTot !== 150) throw new Error(`scartoTot=${noc.scartoTot}, atteso 150`)
  if (noc.vendTot !== 6550) throw new Error(`vendTot=${noc.vendTot}, atteso 6550`)

  // Gap tra 2 giorni → reset rimanPrev
  const gapRows = [
    { gusto_nome: 'CAFFE', data: '2026-05-01', produzione_g: 2000, rimanenza_g: 1500, scarto_g: 0 }, // venduto = 500
    { gusto_nome: 'CAFFE', data: '2026-05-05', produzione_g: 3000, rimanenza_g: 500, scarto_g: 0 },   // rimanPrev reset a 0 → venduto = 2500
  ]
  const p2 = calcPerGustoDifferenziale(gapRows)
  const caf = p2['CAFFE']
  if (caf.vendTot !== 3000) throw new Error(`CAFFE vendTot=${caf.vendTot}, atteso 3000 (500+2500)`)

  // Consumo negativo → max(0)
  const negRows = [
    { gusto_nome: 'STRANO', data: '2026-05-01', produzione_g: 1000, rimanenza_g: 3000, scarto_g: 0 },
  ]
  const p3 = calcPerGustoDifferenziale(negRows)
  if (p3['STRANO'].vendTot !== 0) throw new Error(`Atteso venduto=0 con riman>prod, ho ${p3['STRANO'].vendTot}`)

  console.log('  ✓ Test calcPerGustoDifferenziale PASSED')
}

// ── Test 11: unpivot day inheritance (colonna RIMAN vuota) ──────

function testUnpivotDayInheritance() {
  console.log('\n=== TEST 11: unpivot day inheritance ===')

  // Scenario reale Mara: la riga day-number ha valore SOLO sulla colonna PROD.
  // La colonna RIMAN successiva ha day=null → deve ereditare dal PROD precedente.
  const raw = [
    [null, 'venerdì', null],       // r0: solo weekday
    [null, 1, null],                // r1: day=1 solo su col 1 (PROD); col 2 (RIMAN) null
    [null, 'PROD', 'RIMAN.'],       // r2: label
    ['NOCCIOLA', 2500, 800],        // r3: prod=2500, riman=800
  ]
  const config = {
    format: 'wide',
    header_rows: 3,
    row_dimension: { header_col: 0, field: 'gusto_nome' },
    column_groups: [{
      label_row: 2,
      day_number_row: 1,
      month_iso: '2026-05',
      date_field: 'data',
      measures: [
        { label: 'PROD', field: 'produzione_g' },
        { label: 'RIMAN.', field: 'rimanenza_g' },
      ],
    }],
    sheet_name_field: 'sede',
    skip_row_starts: ['TOTALE'],
    skip_col_header_contains: [],
  }
  const { rows } = applyUnpivot({ SEDE1: raw }, config)
  if (rows.length !== 1) throw new Error(`rows=${rows.length}, atteso 1`)
  const r = rows[0]
  if (r.produzione_g !== 2500) throw new Error(`prod=${r.produzione_g}, atteso 2500`)
  if (r.rimanenza_g !== 800) throw new Error(`riman=${r.rimanenza_g}, atteso 800 (ereditato dal day 1)`)
  if (r.data !== '2026-05-01') throw new Error(`data=${r.data}, atteso 2026-05-01`)

  console.log('  ✓ Test unpivot day inheritance PASSED')
}

// ── Run ─────────────────────────────────────────────────────────

try {
  if (XLSX) {
    testFornitori()
    testDipendenti()
    testProduzioneLookup()
    testProduzioneNoConversion()
    testUnpivotWideGelateria()
  } else {
    console.log('\n⚠  xlsx non installato: skip test 1,2,4,5,6 (usano SheetJS).')
    console.log('   Test di logica pura girano comunque.')
  }
  testMissingRequired()
  testMonthGuess()
  testSummarizeErrors()
  testCalcKpiStats()
  testCalcPerGustoDifferenziale()
  testUnpivotDayInheritance()
  console.log('\n🎉 TUTTI I TEST PASSATI')
} catch (e) {
  console.error(`\n❌ TEST FALLITO: ${e.message}`)
  if (e.stack) console.error(e.stack)
  process.exit(1)
}
