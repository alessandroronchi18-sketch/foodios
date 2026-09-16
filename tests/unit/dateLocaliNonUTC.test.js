// I giorni si confrontano come giorni, non come istanti.
//
// È la quarta volta che questo difetto esce su Foodos, sempre uguale e sempre
// in un file diverso. `new Date('2026-09-16')` si legge come mezzanotte UTC,
// cioè **le 02:00 italiane**; e `new Date().toISOString().slice(0,10)` dà la
// data UTC, che fra mezzanotte e le due in Italia è ancora ieri.
//
// I due casi trovati il 16/09/2026 scrivendo i test:
//
//  - `TrasferimentiView`: i flussi del mese e il conto dell'accuratezza
//    confrontavano `new Date(t.data)` con `new Date()`. Fra mezzanotte e le
//    due, un trasferimento di oggi risultava «nel futuro» e **spariva** da
//    tutti e due;
//  - `Fornitori`: la finestra «ultimi 30 giorni» partiva da
//    `from.toISOString().slice(0,10)`, e a Torino alle 00:30 del 16/09 dava
//    il 16/08 invece del 17/08: ne contava 31.
//
// La cura non è aggiustare i due punti, è togliere di mezzo il tipo `Date` dal
// confronto: due giorni scritti '2026-09-16' e '2026-09-01' si confrontano
// come stringhe, e il fuso non c'entra più.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { soloData, primoDelMeseLocal, giorniFaLocal, todayLocal, formatLocalDate } from '../../src/lib/dateLocal'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('soloData: il giorno, comunque sia scritto', () => {
  it('una data già nella forma giusta resta identica', () => {
    expect(soloData('2026-09-16')).toBe('2026-09-16')
  })

  it('una data con l\'ora attaccata perde l\'ora senza spostarsi', () => {
    // Questo è il punto: passando da `new Date()` questa diventerebbe il 15
    // per chi sta a ovest di Greenwich, o il 16 alle 02:00 per noi.
    expect(soloData('2026-09-16T23:30:00.000Z')).toBe('2026-09-16')
    expect(soloData('2026-09-16T00:10:00+02:00')).toBe('2026-09-16')
  })

  it('un oggetto Date dà il suo giorno LOCALE', () => {
    const d = new Date(2026, 8, 16, 0, 30)   // 16 settembre, 00:30 ora locale
    expect(soloData(d)).toBe('2026-09-16')
    // La stessa cosa via UTC darebbe il 15.
    expect(d.toISOString().slice(0, 10)).not.toBe('2026-09-16')
  })

  it('valori vuoti o sballati danno stringa vuota, non una data a caso', () => {
    expect(soloData(null)).toBe('')
    expect(soloData('')).toBe('')
    expect(soloData('non è una data')).toBe('')
  })
})

describe('il confronto fra giorni', () => {
  it('un trasferimento di oggi rientra nel mese, anche all\'una di notte', () => {
    // Il caso vero: sono le 00:30 del 16 settembre.
    const adesso = new Date(2026, 8, 16, 0, 30)
    const inizioMese = primoDelMeseLocal(adesso)
    const oggiIso = formatLocalDate(adesso)
    const trasferimentoDiOggi = soloData('2026-09-16')
    expect(inizioMese).toBe('2026-09-01')
    expect(trasferimentoDiOggi >= inizioMese).toBe(true)
    expect(trasferimentoDiOggi <= oggiIso).toBe(true)   // era questo a fallire
  })

  it('e uno del mese scorso resta fuori', () => {
    const adesso = new Date(2026, 8, 16, 0, 30)
    expect(soloData('2026-08-31') >= primoDelMeseLocal(adesso)).toBe(false)
  })

  it('«ultimi 30 giorni» ne conta 30, non 31', () => {
    const adesso = new Date(2026, 8, 16, 0, 30)
    expect(giorniFaLocal(30, adesso)).toBe('2026-08-17')
    // Via UTC, alle 00:30, uscirebbe il 16 agosto: un giorno in più.
    const viaUtc = new Date(adesso); viaUtc.setDate(viaUtc.getDate() - 30)
    expect(viaUtc.toISOString().slice(0, 10)).toBe('2026-08-16')
  })

  it('funziona anche a cavallo di un mese', () => {
    const primoOttobre = new Date(2026, 9, 1, 0, 30)
    expect(primoDelMeseLocal(primoOttobre)).toBe('2026-10-01')
    expect(giorniFaLocal(1, primoOttobre)).toBe('2026-09-30')
  })

  it('e a cavallo di un anno', () => {
    const capodanno = new Date(2027, 0, 1, 1, 0)
    expect(primoDelMeseLocal(capodanno)).toBe('2027-01-01')
    expect(giorniFaLocal(1, capodanno)).toBe('2026-12-31')
  })
})

describe('i due file dove il difetto era vivo', () => {
  const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

  it('i trasferimenti non costruiscono più Date per confrontare i giorni', () => {
    const src = leggi('src', 'components', 'TrasferimentiView.jsx')
    expect(src).not.toMatch(/const x = new Date\(d\)/)
    expect(src).not.toMatch(/const d = new Date\(t\.data \|\| 0\)/)
    expect(src).toMatch(/soloData\(t\.data\)/)
    expect(src).toMatch(/primoDelMeseLocal\(\)/)
  })

  it('i fornitori non calcolano più la finestra in UTC', () => {
    const src = leggi('src', 'components', 'Fornitori.jsx')
    expect(src).not.toMatch(/from\.toISOString\(\)\.slice\(0, 10\)/)
    expect(src).toMatch(/giorniFaLocal\(/)
  })

  it('e la data di un trasferimento nuovo è quella locale', () => {
    const src = leggi('src', 'lib', 'trasferimenti.js')
    expect(src).not.toMatch(/data: data \|\| new Date\(\)\.toISOString\(\)/)
    expect(src).toMatch(/data: data \|\| todayLocal\(\)/)
  })
})

describe('todayLocal resta quello che deve essere', () => {
  it('dà una data nella forma giusta', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
