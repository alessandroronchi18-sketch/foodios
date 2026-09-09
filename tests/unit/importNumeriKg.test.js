// Import: i chili venivano arrotondati PRIMA di diventare grammi.
//
// applyUnpivot (la strada dei file "WIDE", con i giorni sparsi nelle colonne)
// scriveva `Math.round(n)` sul valore così come sta nel foglio. Poi
// validateRow moltiplicava per 1000 se l'utente aveva spuntato "I miei numeri
// sono in kg". Quindi:
//
//   2,5 kg  -> Math.round(2,5) = 3    -> 3.000 g   (+20% di produzione)
//   4,44 kg -> 4                      -> 4.000 g   (-10%)
//   0,4 kg  -> 0                      -> giornata a zero
//
// Nei dati reali del 09/09/2026, 6.143 delle 7.012 righe di Mara hanno una
// precisione sotto il chilo. Passando da questa strada si perdevano 666,7 kg di
// produzione e 1.577,2 kg di rimanenza, con 82 righe azzerate del tutto. E il
// dato corrotto entra nel food cost, nel P&L e nelle rese: da lì non si torna.
//
// Secondo difetto nello stesso punto: applyUnpivot leggeva le celle con
// `Number(raw_v)`, che su una cella di testo scritta all'italiana ("2,5") dà
// NaN. La cella veniva scartata in SILENZIO — nessun avviso, nessuna riga
// invalida, il numero semplicemente non arrivava.
//
// Terzo: coerceNumber leggeva "1.500" come 1,5. Mille volte meno.

import { describe, it, expect } from 'vitest'
import { coerceNumber, validateRow } from '../../src/lib/importValidateCore'
import { applyUnpivot, defaultGelateriaWideConfig } from '../../src/lib/importUnpivot'
import { IMPORT_SCHEMAS } from '../../src/lib/importSchemas'

const schema = IMPORT_SCHEMAS.produzione_inventario
const CONV = schema.unitConversions[0].label

describe('coerceNumber — numeri scritti all italiana', () => {
  it('il punto che raggruppa le migliaia non divide per mille', () => {
    expect(coerceNumber('1.500')).toBe(1500)
    expect(coerceNumber('4.440')).toBe(4440)
    expect(coerceNumber('1.234.567')).toBe(1234567)
  })

  it('il punto decimale resta decimale', () => {
    expect(coerceNumber('1.5')).toBe(1.5)
    expect(coerceNumber('12.75')).toBe(12.75)
    expect(coerceNumber('0.4')).toBe(0.4)
  })

  it('la virgola decimale funziona, con e senza migliaia', () => {
    expect(coerceNumber('2,5')).toBe(2.5)
    expect(coerceNumber('1.234,56')).toBeCloseTo(1234.56, 2)
    expect(coerceNumber('12,50 €')).toBe(12.5)
  })
})

describe('applyUnpivot — i kg non si arrotondano prima di diventare grammi', () => {
  // Forma vera dell'input: un foglio è un array 2D di celle, come lo legge xlsx.
  // Header a 3 righe: numeri del giorno sulla riga 1, etichette sulla riga 2,
  // dati dalla riga 3, col nome del gusto in colonna 0.
  const config = defaultGelateriaWideConfig('2026-05')

  function foglio(righeDati) {
    return [
      ['REGISTRO PRODUZIONE', '', ''],
      ['', 1, 1],
      ['GUSTO', 'PROD', 'RIMAN.'],
      ...righeDati,
    ]
  }

  // Dopo l'unpivot i campi hanno già il nome finale, quindi il mapping è
  // identità: è così che li passa il wizard (ImportWizard, strada wide).
  const mappingIdentita = Object.fromEntries(schema.fields.map(f => [f.name, f.name]))

  function passa(righeDati, opts = {}) {
    const { rows } = applyUnpivot({ CARLINA: foglio(righeDati) }, config)
    return rows.map(r => validateRow(r, mappingIdentita, schema, {
      activeConversions: new Set(opts.kg ? [CONV] : []),
      lookups: { sede_id: new Map([['carlina', 'sede-uuid-test']]) },
    }))
  }

  it('2,5 kg fanno 2.500 g, non 3.000', () => {
    const [r] = passa([['PISTACCHIO', 2.5, 0.4]], { kg: true })
    expect(r, 'la riga deve arrivare').toBeTruthy()
    expect(r.data.produzione_g).toBe(2500)
    // E 0,4 kg non diventa una giornata a zero.
    expect(r.data.rimanenza_g).toBe(400)
  })

  it('4,44 kg fanno 4.440 g, non 4.000', () => {
    const [r] = passa([['NOCCIOLA', 4.44, 1.06]], { kg: true })
    expect(r.data.produzione_g).toBe(4440)
    expect(r.data.rimanenza_g).toBe(1060)
  })

  it('una cella scritta "2,5" non viene buttata via in silenzio', () => {
    const esiti = passa([['LIMONE', '2,5', '0,75']], { kg: true })
    expect(esiti.length).toBe(1)
    expect(esiti[0].data.produzione_g).toBe(2500)
    expect(esiti[0].data.rimanenza_g).toBe(750)
  })

  it('i grammi restano interi anche quando la cella ha i decimali', () => {
    // Senza la conversione: i numeri sono già grammi, ma la colonna è INTEGER.
    const [r] = passa([['FIORDILATTE', 2500.6, 400.2]], { kg: false })
    expect(Number.isInteger(r.data.produzione_g)).toBe(true)
    expect(r.data.produzione_g).toBe(2501)
    expect(r.data.rimanenza_g).toBe(400)
  })

  it('il totale del mese non si sposta piu di un grammo per riga', () => {
    // Il caso reale: molte righe con precisione sotto il chilo.
    const dati = Array.from({ length: 20 }, (_, i) => [`GUSTO ${i}`, 2 + i / 10, 0.5])
    const esiti = passa(dati, { kg: true })
    expect(esiti.length).toBe(20)
    const totale = esiti.reduce((s, r) => s + r.data.produzione_g, 0)
    const atteso = dati.reduce((s, d) => s + Math.round(d[1] * 1000), 0)
    expect(totale).toBe(atteso)
    // Col vecchio codice (round sui kg) il totale era diverso: gli errori per
    // riga arrivano al 20% e solo in parte si compensano fra loro.
    const vecchio = dati.reduce((s, d) => s + Math.round(d[1]) * 1000, 0)
    expect(vecchio).not.toBe(atteso)
    // E su una riga singola lo scarto e' grosso: 2,5 kg diventavano 3 kg.
    const peggiore = Math.max(...dati.map(d => Math.abs(Math.round(d[1]) * 1000 - Math.round(d[1] * 1000))))
    expect(peggiore).toBeGreaterThanOrEqual(400)
  })
})

// ── Date ─────────────────────────────────────────────────────────────────
//
// Secondo difetto che rendeva l'import impossibile, non solo sbagliato.
//
// importParse leggeva il file con `XLSX.read(bytes, { type: 'array' })`, senza
// cellDates. Una colonna formattata come data in Excel arriva così come numero
// seriale (46143). coerceDate non li gestiva e cadeva sul `return null`: TUTTE
// le righe risultavano invalide, la schermata diceva "Pronte da caricare 0" e
// il consiglio era "serve il formato GG/MM/AAAA" — mentre nel foglio l'utente
// vede scritto 01/05/2026. Un vicolo cieco: non c'era niente da correggere nel
// file, perché il file era giusto.
//
// E anche con cellDates attivo restava il fuso: xlsx costruisce le Date in ora
// locale e `toISOString()` le converte in UTC, quindi in Italia il 1 maggio a
// mezzanotte diventava "2026-04-30". Tutte le giornate slittavano indietro.

import { coerceDate } from '../../src/lib/importValidateCore'

describe('coerceDate — le date dei fogli veri', () => {
  it('legge i numeri seriali di Excel', () => {
    // 45778 = 1 maggio 2025, 46143 = 1 maggio 2026 (verificati con Excel).
    expect(coerceDate(46143)).toBe('2026-05-01')
    expect(coerceDate(46144)).toBe('2026-05-02')
    expect(coerceDate(45778)).toBe('2025-05-01')
  })

  it('una Date locale non slitta al giorno prima', () => {
    // Il caso che rompeva tutto: mezzanotte del 1 maggio, ora italiana.
    expect(coerceDate(new Date(2026, 4, 1, 0, 0, 0))).toBe('2026-05-01')
    expect(coerceDate(new Date(2026, 0, 1, 0, 30, 0))).toBe('2026-01-01')
    // Anche a fine anno, dove lo slittamento cambierebbe l'anno.
    expect(coerceDate(new Date(2025, 11, 31, 1, 0, 0))).toBe('2025-12-31')
  })

  it('continua a leggere i formati scritti a mano', () => {
    expect(coerceDate('01/05/2026')).toBe('2026-05-01')
    expect(coerceDate('1-5-2026')).toBe('2026-05-01')
    expect(coerceDate('2026-05-01')).toBe('2026-05-01')
    // Anno a due cifre, comune nei fogli compilati a mano.
    expect(coerceDate('1/5/26')).toBe('2026-05-01')
  })

  it('non inventa una data da un numero che non lo e', () => {
    expect(coerceDate(0)).toBe(null)
    expect(coerceDate(-5)).toBe(null)
    expect(coerceDate(999999)).toBe(null)
    expect(coerceDate('ciao')).toBe(null)
    expect(coerceDate('')).toBe(null)
    expect(coerceDate(null)).toBe(null)
  })
})
