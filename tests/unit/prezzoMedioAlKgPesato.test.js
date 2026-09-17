// ── 12.700 € al mese di ricavo inventato ───────────────────────────────
//
// Difetto vero, 16/09/2026, misurato sui Formati vendita dell'account di
// Mara dei Boschi. Il prezzo medio di vendita al chilo — il numero da cui
// esce il ricavo di ogni gusto nel P&L e la stima dei ricavi da inventario —
// era la media aritmetica dei €/kg dei singoli formati:
//
//     CONO PICCOLO      100 g   3,50 €  →  35,00 €/kg
//     CONO MEDIO        140 g   4,50 €  →  32,14 €/kg
//     CONO GRANDE       180 g   5,50 €  →  30,56 €/kg
//     VASCHETTA 1 KG   1000 g  28,00 €  →  28,00 €/kg
//     VASCHETTA ½ KG    500 g  14,00 €  →  28,00 €/kg
//     ────────────────────────────────────────────────
//     media semplice                        30,74 €/kg
//     media pesata sui grammi               28,91 €/kg
//
// Quei cinque numeri non sono confrontabili: il primo descrive cento grammi,
// il quarto un chilo. Facendone la media semplice i coni — i formati più cari
// al chilo, e i più piccoli — contano dieci volte il loro peso.
//
// Lo scarto è **+6,34% su ogni ricavo di gusto**. Sui chili che Mara produce
// in un mese (circa 6.930) fa **12.706 € di ricavo inventato**, che si
// propagano nel margine, nel food cost in percentuale e nel confronto fra le
// due sedi.
//
// Il conto stava scritto due volte, in due file diversi, e tutte e due le
// copie sbagliavano allo stesso modo: `avgPrezzoPerKgCategoria`
// (formatiVendita.js — P&L, Menù) e `euroKgMedioFormati`
// (inventarioProduzione.js — Quadratura, ricavi da inventario). Un difetto in
// due copie si corregge in una sola e resta vivo nell'altra: ora la regola
// sta in `prezzoMedioAlKg.js` e tutte e due la chiamano.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { prezzoMedioAlKg } from '../../src/lib/prezzoMedioAlKg.js'
import { avgPrezzoPerKgCategoria } from '../../src/lib/formatiVendita.js'
import { euroKgMedioFormati } from '../../src/lib/inventarioProduzione.js'

// I formati veri di Mara dei Boschi, con i numeri che hanno prodotto la misura.
const FORMATI_MARA = [
  { id: 'cp', nome: 'CONO PICCOLO', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3.5 },
  { id: 'cm', nome: 'CONO MEDIO', categoria: 'Gusto', baseQtaG: 140, prezzoDefault: 4.5 },
  { id: 'cg', nome: 'CONO GRANDE', categoria: 'Gusto', baseQtaG: 180, prezzoDefault: 5.5 },
  { id: 'v1', nome: 'Vaschetta 1 KG', categoria: 'Gusto', baseQtaG: 1000, prezzoDefault: 28 },
  { id: 'vm', nome: 'Vaschetta 1/2 KG', categoria: 'Gusto', baseQtaG: 500, prezzoDefault: 14 },
]

// La formula di prima, tenuta qui per poter misurare la differenza.
function mediaSempliceComePrima(formati) {
  const validi = formati.filter(f => Number(f.baseQtaG) > 0 && Number(f.prezzoDefault) > 0)
  if (validi.length === 0) return null
  return validi.reduce((s, f) => s + (f.prezzoDefault / f.baseQtaG) * 1000, 0) / validi.length
}

describe('il difetto: la media semplice fa pesare un cono come una vaschetta', () => {
  it('sui formati veri di Mara la vecchia formula dava 30,74 €/kg', () => {
    expect(mediaSempliceComePrima(FORMATI_MARA)).toBeCloseTo(30.7397, 3)
  })

  it('il prezzo medio vero di un chilo è 28,91 €/kg', () => {
    // 55,50 € di incasso su 1.920 g di gelato, vendendo un pezzo per formato.
    expect(prezzoMedioAlKg(FORMATI_MARA)).toBeCloseTo(28.9063, 3)
  })

  it('la differenza è il 6,34% in più su ogni ricavo di gusto', () => {
    const prima = mediaSempliceComePrima(FORMATI_MARA)
    const dopo = prezzoMedioAlKg(FORMATI_MARA)
    expect((prima / dopo - 1) * 100).toBeCloseTo(6.34, 2)
    // Su 6.930 kg al mese: 12.706 € di ricavo che non esiste.
    expect(6930 * (prima - dopo)).toBeCloseTo(12706, 0)
  })
})

describe('la correzione: una regola sola, chiamata da tutti e due i posti', () => {
  it('il P&L e la Quadratura ora dicono lo stesso numero', () => {
    const dalPL = avgPrezzoPerKgCategoria('gusto', FORMATI_MARA)
    const dallaQuadratura = euroKgMedioFormati(FORMATI_MARA)
    expect(dalPL).toBeCloseTo(28.90625, 5)
    expect(dallaQuadratura).toBeCloseTo(28.90625, 5)
    expect(dalPL).toBeCloseTo(dallaQuadratura, 10)
  })

  it('e nessuna delle due si riscrive il conto a mano', () => {
    const fv = readFileSync(new URL('../../src/lib/formatiVendita.js', import.meta.url), 'utf8')
    const ip = readFileSync(new URL('../../src/lib/inventarioProduzione.js', import.meta.url), 'utf8')
    expect(fv).toContain('prezzoMedioAlKg(src)')
    expect(ip).toContain('return prezzoMedioAlKg(formati)')
    // Se qualcuno reintroduce la media aritmetica dei €/kg, si ferma qui.
    expect(fv).not.toContain('(Number(f.prezzoDefault) / Number(f.baseQtaG)) * 1000')
    expect(ip).not.toContain('sumEurKg / validi.length')
  })

  it('un solo formato: pesata e semplice coincidono, come deve essere', () => {
    const uno = [{ baseQtaG: 500, prezzoDefault: 14 }]
    expect(prezzoMedioAlKg(uno)).toBeCloseTo(28, 6)
    expect(mediaSempliceComePrima(uno)).toBeCloseTo(28, 6)
  })

  it('formati tutti dello stesso peso: idem, il peso non sposta niente', () => {
    const pari = [{ baseQtaG: 100, prezzoDefault: 3 }, { baseQtaG: 100, prezzoDefault: 2 }]
    expect(prezzoMedioAlKg(pari)).toBeCloseTo(25, 6)
    expect(mediaSempliceComePrima(pari)).toBeCloseTo(25, 6)
  })
})

describe("quello che c'è intorno", () => {
  it('un formato senza peso o senza prezzo resta fuori, non entra come zero', () => {
    // Una ricarica tessera (nessun peso) non dice niente sul prezzo al chilo.
    const con = [
      { baseQtaG: 1000, prezzoDefault: 28 },
      { baseQtaG: 0, prezzoDefault: 50 },     // ricarica tessera
      { baseQtaG: 500, prezzoDefault: 0 },    // prezzo non ancora inserito
    ]
    expect(prezzoMedioAlKg(con)).toBeCloseTo(28, 6)
  })

  it('senza nessun formato utile dice «non lo so», non zero', () => {
    expect(prezzoMedioAlKg([])).toBeNull()
    expect(prezzoMedioAlKg(null)).toBeNull()
    expect(prezzoMedioAlKg(undefined)).toBeNull()
    expect(prezzoMedioAlKg([{ baseQtaG: 0, prezzoDefault: 0 }])).toBeNull()
    expect(prezzoMedioAlKg([null, undefined])).toBeNull()
    // Un prezzo al chilo a zero direbbe «il gelato lo regalano».
    expect(prezzoMedioAlKg([])).not.toBe(0)
  })

  it('la scelta della categoria continua a funzionare come prima', () => {
    const misti = [
      { id: 'c', nome: 'Cono', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3 },
      { id: 't', nome: 'Torta', categoria: 'Torta', baseQtaG: 300, prezzoDefault: 12 },
    ]
    // Categoria esatta: solo la torta, 40 €/kg.
    expect(avgPrezzoPerKgCategoria('torta', misti)).toBeCloseTo(40, 3)
    // Categoria senza formati: cade sul generico gelateria, non su tutti.
    expect(avgPrezzoPerKgCategoria('frutta', misti)).toBeCloseTo(30, 3)
  })

  it('numeri scritti come stringhe non rompono il conto', () => {
    // I formati arrivano da un jsonb: capita che i numeri siano stringhe.
    expect(prezzoMedioAlKg([{ baseQtaG: '1000', prezzoDefault: '28' }])).toBeCloseTo(28, 6)
  })
})
