// Attesa progressiva sui tentativi di accesso falliti.
//
// Sostituisce il vecchio muro "5 errori e sei fuori per 30 minuti", che su un
// gestionale usato da proprietari di sessanta anni si toccava per sbaglio: la
// maiuscola attiva, la password del vecchio account, una lettera accentata.
//
// Il criterio: un attaccante e una persona che sbaglia si distinguono per la
// velocità, non per il numero di tentativi. L'attesa deve essere impercettibile
// a chi sbaglia in buona fede e insostenibile per chi prova a indovinare.

import { describe, it, expect } from 'vitest'
import { attesaDopo } from '../../api/login-guard.js'

describe('chi sbaglia in buona fede non se ne accorge', () => {
  it.each([0, 1, 2, 3])('dopo %i tentativi non c\'è nessuna attesa', (n) => {
    expect(attesaDopo(n)).toBe(0)
  })

  it('il quarto errore costa pochi secondi, non mezz\'ora', () => {
    expect(attesaDopo(4)).toBe(5)
  })

  it('nei primi sei tentativi non si supera il mezzo minuto', () => {
    expect(attesaDopo(5)).toBeLessThanOrEqual(30)
    expect(attesaDopo(6)).toBeLessThanOrEqual(30)
  })
})

describe('chi insiste viene rallentato sul serio', () => {
  it('l\'attesa cresce a ogni tentativo', () => {
    const scala = [4, 5, 6, 7, 8, 9, 10].map(attesaDopo)
    for (let i = 1; i < scala.length; i++) {
      expect(scala[i]).toBeGreaterThanOrEqual(scala[i - 1])
    }
  })

  it('oltre il decimo tentativo l\'attesa si ferma al massimo', () => {
    expect(attesaDopo(10)).toBe(15 * 60)
    expect(attesaDopo(50)).toBe(15 * 60)
    expect(attesaDopo(1000)).toBe(15 * 60)
  })

  it('la forza bruta è morta: venti tentativi costano più di un\'ora', () => {
    let totale = 0
    for (let n = 1; n <= 20; n++) totale += attesaDopo(n)
    expect(totale).toBeGreaterThan(60 * 60)
  })

  it('ma un utente onesto che sbaglia tre volte non aspetta nulla', () => {
    let totale = 0
    for (let n = 1; n <= 3; n++) totale += attesaDopo(n)
    expect(totale).toBe(0)
  })
})

describe('robustezza', () => {
  it('valori non sensati non producono attese negative', () => {
    expect(attesaDopo(-5)).toBe(0)
    expect(attesaDopo(0)).toBe(0)
  })
})
