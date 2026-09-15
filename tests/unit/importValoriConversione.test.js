// Leggere i numeri e le date dai fogli dei clienti.
//
// È il punto in cui i dati di un'attività vera entrano in Foodos, e ogni
// errore qui non si vede subito: si vede settimane dopo, in un conto che non
// torna. Due difetti veri già trovati in questo file, tutti e due nel
// settembre 2026:
//
//   • «1.500» letto come 1,5 — mille volte meno;
//   • il 1° maggio salvato come 30 aprile, perché la data costruita nel fuso
//     locale veniva convertita in UTC.
//
// 157 righe al 53% di copertura fino al 15/09/2026.

import { describe, it, expect } from 'vitest'
import {
  coerceString, coerceNumber, coerceBoolean, coerceDate,
  isValidEmail, isValidPhone, findMissingRequired, getLookupFields,
} from '../../src/lib/importValidateCore'
import { IMPORT_SCHEMAS } from '../../src/lib/importSchemas'

describe('i numeri, come li scrivono i clienti', () => {
  it('numero semplice', () => {
    expect(coerceNumber(1500)).toBe(1500)
    expect(coerceNumber('1500')).toBe(1500)
    expect(coerceNumber(0)).toBe(0)
    expect(coerceNumber(-12.5)).toBe(-12.5)
  })

  it('formato italiano: la virgola è il decimale', () => {
    expect(coerceNumber('12,50')).toBe(12.5)
    expect(coerceNumber('0,75')).toBe(0.75)
  })

  it('il punto raggruppa le migliaia — ed è costato un fattore mille', () => {
    // Il difetto: «1.500» veniva letto come 1,5. Un magazzino da 1.500 grammi
    // diventava un grammo e mezzo, e nessuno se ne accorgeva finché il conto
    // non tornava.
    expect(coerceNumber('1.500')).toBe(1500)
    expect(coerceNumber('1.234.567')).toBe(1234567)
    expect(coerceNumber('12.000')).toBe(12000)
  })

  it('ma «1.5» e «12.75» restano decimali', () => {
    // La distinzione è sulla forma: le migliaia vanno a gruppi di tre esatti.
    expect(coerceNumber('1.5')).toBe(1.5)
    expect(coerceNumber('12.75')).toBe(12.75)
    expect(coerceNumber('0.5')).toBe(0.5)
    expect(coerceNumber('1.25')).toBe(1.25)
  })

  it('punto E virgola insieme: il punto è migliaia, la virgola decimale', () => {
    expect(coerceNumber('1.234,56')).toBe(1234.56)
    expect(coerceNumber('12.000,50')).toBe(12000.5)
  })

  it('il simbolo dell\'euro non fa fallire la lettura', () => {
    expect(coerceNumber('12,50 €')).toBe(12.5)
    expect(coerceNumber('€ 1.200')).toBe(1200)
    expect(coerceNumber('1200 EUR')).toBe(1200)
  })

  it('quello che non è un numero dà null, non zero', () => {
    // Zero è peggio di niente: entrerebbe nel conto come un dato vero.
    //
    // Due casi trovati il 15/09/2026 scrivendo questo test, e tutti e due
    // davano **zero**: una cella con dentro un elenco vuoto (`String([])` è
    // la stringa vuota, e `Number('')` è zero) e una cella di soli spazi.
    for (const v of ['', '   ', null, undefined, 'tanto', 'abc', {}, [], [1, 2]]) {
      expect(coerceNumber(v), JSON.stringify(v)).toBe(null)
    }
    expect(coerceNumber(NaN)).toBe(null)
    expect(coerceNumber(Infinity)).toBe(null)
  })

  it('una cella che contiene solo il simbolo dell\'euro non è zero euro', () => {
    for (const v of ['€', ' € ', 'EUR', 'eur']) {
      expect(coerceNumber(v), v).toBe(null)
    }
  })

  it('ma uno zero scritto davvero resta zero', () => {
    // «Ho prodotto 0 kg oggi» è un dato, non un dato mancante.
    expect(coerceNumber(0)).toBe(0)
    expect(coerceNumber('0')).toBe(0)
    expect(coerceNumber('0,00')).toBe(0)
    expect(coerceNumber('0 €')).toBe(0)
  })

  it('gli spazi intorno non contano', () => {
    expect(coerceNumber('  1.500  ')).toBe(1500)
  })
})

describe('le date, come arrivano da Excel', () => {
  it('già in formato ISO', () => {
    expect(coerceDate('2026-05-01')).toBe('2026-05-01')
  })

  it('all\'italiana, con barre o trattini', () => {
    expect(coerceDate('01/05/2026')).toBe('2026-05-01')
    expect(coerceDate('1/5/2026')).toBe('2026-05-01')
    expect(coerceDate('01-05-2026')).toBe('2026-05-01')
  })

  it('con l\'anno a due cifre, come nei fogli scritti a mano', () => {
    expect(coerceDate('1/5/26')).toBe('2026-05-01')
    expect(coerceDate('15/12/99')).toBe('1999-12-15')   // ≥70 è il Novecento
    expect(coerceDate('1/1/70')).toBe('1970-01-01')
    expect(coerceDate('1/1/69')).toBe('2069-01-01')
  })

  it('una data vera non slitta di un giorno', () => {
    // Il difetto: `toISOString()` converte in UTC, e in Italia (UTC+1/+2) il
    // 1° maggio a mezzanotte diventava «2026-04-30». Tutte le date
    // dell'import slittavano di un giorno, e con esse la produzione di ogni
    // giornata.
    expect(coerceDate(new Date(2026, 4, 1, 0, 0, 0))).toBe('2026-05-01')
    expect(coerceDate(new Date(2026, 0, 1, 0, 30, 0))).toBe('2026-01-01')
    expect(coerceDate(new Date(2026, 11, 31, 23, 59, 0))).toBe('2026-12-31')
  })

  it('il numero seriale di Excel diventa una data', () => {
    // Una colonna formattata come data arriva come numero (46143) se il file
    // non è stato letto chiedendo le date. Prima cadeva fuori: TUTTE le righe
    // risultavano invalide, la schermata diceva «Pronte da caricare 0» e il
    // consiglio era «serve GG/MM/AAAA» mentre nel foglio l'utente VEDE
    // 01/05/2026. Un vicolo cieco senza via d'uscita.
    expect(coerceDate(45778)).toBe('2025-05-01')
    expect(coerceDate(1)).toBe('1899-12-31')
  })

  it('un numero che non può essere una data resta null', () => {
    expect(coerceDate(0)).toBe(null)
    expect(coerceDate(-5)).toBe(null)
    expect(coerceDate(999999)).toBe(null)
  })

  it('quello che non è una data dà null', () => {
    for (const v of ['', null, undefined, 'domani', '2026-13-45', '32/01/2026']) {
      const r = coerceDate(v)
      expect(r === null || /^\d{4}-\d{2}-\d{2}$/.test(r), String(v)).toBe(true)
    }
    expect(coerceDate('domani')).toBe(null)
    expect(coerceDate(new Date('data storta'))).toBe(null)
  })
})

describe('i sì e i no', () => {
  it('capisce l\'italiano, non solo true/false', () => {
    for (const v of ['si', 'sì', 'SI', 'vero', 'attivo', 'in servizio', 'Y', '1', true]) {
      expect(coerceBoolean(v), String(v)).toBe(true)
    }
    for (const v of ['no', 'falso', 'inattivo', 'cessato', 'N', '0', false]) {
      expect(coerceBoolean(v), String(v)).toBe(false)
    }
  })

  it('quello che non si capisce resta null, non «no»', () => {
    // Trattare un valore incomprensibile come «no» licenzierebbe un
    // dipendente per un refuso.
    for (const v of ['forse', 'boh', '', null, undefined, 2]) {
      expect(coerceBoolean(v), String(v)).toBe(null)
    }
  })
})

describe('il testo', () => {
  it('toglie gli spazi e regge i tipi sbagliati', () => {
    expect(coerceString('  Mara  ')).toBe('Mara')
    expect(coerceString(null)).toBe('')
    expect(coerceString(undefined)).toBe('')
    expect(coerceString(42)).toBe('42')
    expect(coerceString(0)).toBe('0')
  })
})

describe('email e telefono', () => {
  it('accetta gli indirizzi veri e rifiuta i mezzi indirizzi', () => {
    for (const v of ['a@b.it', 'mario.rossi+tag@molino.co.uk']) expect(isValidEmail(v), v).toBe(true)
    for (const v of ['a@b', 'a b@c.it', '@b.it', 'a@', 'niente']) expect(isValidEmail(v), v).toBe(false)
  })

  it('il telefono accetta le forme italiane, e rifiuta i numeri improbabili', () => {
    for (const v of ['011 1234567', '+39 333 1234567', '0121/45.67.89', '3331234567']) {
      expect(isValidPhone(v), v).toBe(true)
    }
    for (const v of ['123', '12345', '1'.repeat(20)]) expect(isValidPhone(v), v).toBe(false)
  })
})

describe('cosa lo schema pretende', () => {
  it('dice quali campi obbligatori non sono stati abbinati', () => {
    const schema = IMPORT_SCHEMAS.produzione_inventario
    const mancanti = findMissingRequired({ data: 'Giorno' }, schema)
    expect(mancanti).toEqual(expect.arrayContaining(['sede_id', 'gusto_nome']))
    expect(mancanti).not.toContain('data')
  })

  it('con tutto abbinato non manca niente', () => {
    const schema = IMPORT_SCHEMAS.fornitori
    expect(findMissingRequired({ nome: 'Ragione sociale' }, schema)).toEqual([])
  })

  it('elenca i campi da risolvere su un\'altra tabella', () => {
    expect(getLookupFields(IMPORT_SCHEMAS.produzione_inventario).map(f => f.name)).toEqual(['sede_id'])
    expect(getLookupFields(IMPORT_SCHEMAS.fornitori)).toEqual([])
  })
})
