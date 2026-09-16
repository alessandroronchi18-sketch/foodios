// ── Il righello dei test sulle date ────────────────────────────────────
//
// Difetto vero, 16/09/2026. La suite passava sul portatile e falliva su
// GitHub da sei giri di fila: sempre gli stessi 3 test su 3.586, in
// `dateLocaliNonUTC` e `periodoAnalisi`. Non era rotto il prodotto: erano
// rotte le righe di *contrasto* dei test, quelle che dimostrano «calcolato
// in UTC verrebbe il giorno sbagliato». A Roma è vero. Su un runner che
// gira già in UTC, mezzanotte locale e mezzanotte UTC sono lo stesso
// istante: non c'è nessuna differenza da dimostrare, e l'asserzione cade.
//
// È lo stesso errore già visto altre volte su Foodos: sbagliato il righello,
// non l'oggetto misurato. La correzione sta in `vitest.config.js`, che fissa
// il fuso della suite a Europe/Rome — il fuso di chi usa Foodos davvero.
//
// Questo file è il controllo di taratura: se qualcuno toglie quella riga, o
// un domani la suite gira di nuovo in UTC, qui si rompe subito e si capisce
// perché, invece di far cadere tre test lontani con un messaggio oscuro.
import { describe, it, expect } from 'vitest'
import { soloData, giorniFaLocal, todayLocal } from '../../src/lib/dateLocal.js'
import { finestraScorciatoia } from '../../src/lib/periodoAnalisi.js'

// Le 00:30 del 16 settembre, ora italiana: l'istante in cui locale e UTC
// cadono su due giorni diversi. È il caso che fa sbagliare i conti veri —
// la pasticceria che chiude dopo mezzanotte.
const NOTTE = new Date(2026, 8, 16, 0, 30, 0)

describe('la suite gira nel fuso di chi usa Foodos', () => {
  it('il fuso dei test è Europe/Rome, non quello del server', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Rome')
  })

  it('l’Italia è avanti rispetto a UTC, sia d’estate che d’inverno', () => {
    // getTimezoneOffset è NEGATIVO per i fusi avanti rispetto a UTC.
    expect(new Date(2026, 7, 15, 12, 0).getTimezoneOffset()).toBe(-120) // agosto, ora legale
    expect(new Date(2026, 0, 15, 12, 0).getTimezoneOffset()).toBe(-60)  // gennaio, ora solare
  })
})

describe('il contrasto che i test sulle date danno per scontato', () => {
  it('alle 00:30 il giorno UTC è quello prima: è questo che rende utili quei test', () => {
    expect(NOTTE.toISOString().slice(0, 10)).toBe('2026-09-15')
    expect(soloData(NOTTE)).toBe('2026-09-16')
  })

  it('senza questo contrasto le asserzioni «non deve essere UTC» sarebbero vuote', () => {
    // Se la suite girasse in UTC queste due sarebbero uguali e i test di
    // `dateLocaliNonUTC` passerebbero senza dimostrare più niente.
    expect(soloData(NOTTE)).not.toBe(NOTTE.toISOString().slice(0, 10))
  })
})

describe('quello che ci sta intorno continua a valere', () => {
  it('«oggi» alle 00:30 è il giorno locale, non quello UTC', () => {
    expect(finestraScorciatoia('oggi', NOTTE)).toEqual({ from: '2026-09-16', to: '2026-09-16' })
  })

  it('«ultimi 30 giorni» ne conta 30, anche a cavallo di mezzanotte', () => {
    expect(giorniFaLocal(30, NOTTE)).toBe('2026-08-17')
  })

  it('todayLocal e soloData dicono lo stesso giorno', () => {
    expect(soloData(new Date())).toBe(todayLocal())
  })
})
