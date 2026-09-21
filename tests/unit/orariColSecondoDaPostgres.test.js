// ── Un orario con i secondi è un orario ──────────────────────────────────
//
// Postgres restituisce le colonne `time` **coi secondi**: «08:00:00», non
// «08:00». È il formato standard, e arriva così da PostgREST senza che
// nessuno lo chieda.
//
// ── Cosa è costato, il 21/09/2026 ───────────────────────────────────────
//
// `oraValida` accettava solo la forma corta. Quindi **ogni turno letto dal
// database** risultava scritto male: `finMin` ripiegava sull'ora di inizio e
// il turno durava zero minuti. Da lì cadeva tutto quello che sta sopra:
// la linea del giorno e della settimana vuote, la barra della copertura mai
// disegnata, «2 persone in turno» mai scritto, e l'avviso sugli accavallamenti
// muto perché confrontava intervalli lunghi zero.
//
// A schermo si leggeva **«32,0h» in cima e un calendario vuoto sotto**, e la
// contraddizione non aveva nessuna spiegazione visibile. Sul database del
// design partner ci sono 288 turni: tutti e 288.
//
// I secondi in un turno non servono a nessuno — non esiste un turno che
// finisce alle 16:00:30 — ma rifiutarli non li fa sparire: li fa diventare un
// turno lungo zero.
import { describe, it, expect } from 'vitest'
import { oraValida, toMin, finMin, oreTurno } from '../../src/lib/turni'

describe('L\'orario come lo manda il database', () => {
  it('«08:00:00» è un orario valido quanto «08:00»', () => {
    expect(oraValida('08:00:00')).toBe(true)
    expect(oraValida('08:00')).toBe(true)
  })

  it('e un turno letto dal database dura le sue ore, non zero', () => {
    // È il difetto, in una riga: otto ore diventavano zero.
    expect(oreTurno('08:00:00', '16:00:00')).toBe(8)
    expect(oreTurno('08:00', '16:00')).toBe(8)
  })

  it('i minuti si leggono uguali con e senza i secondi', () => {
    expect(toMin('08:30:00')).toBe(toMin('08:30'))
    expect(finMin('08:00:00', '16:00:00')).toBe(finMin('08:00', '16:00'))
  })
})

describe('Quello che resta rifiutato, e deve restarlo', () => {
  it('un orario illeggibile non diventa mezzanotte', () => {
    // Senza il controllo, «08:00 → abc» diventava un turno di SEDICI ore
    // (dalle 8 alla mezzanotte dopo) con il costo relativo. Meglio zero, che
    // si vede, di sedici ore inventate.
    expect(oraValida('abc')).toBe(false)
    expect(oraValida('')).toBe(false)
    expect(oraValida(null)).toBe(false)
  })

  it('«25:99» resta rifiutato anche scritto coi secondi', () => {
    // Passava il controllo sulla forma e diventava un turno di 18,65 ore.
    // L'input del browser non lo produce, un dato vecchio o importato sì.
    expect(oraValida('25:99')).toBe(false)
    expect(oraValida('25:99:00')).toBe(false)
    expect(oraValida('23:59:59')).toBe(true)
  })

  it('e non si accettano forme che non sono orari', () => {
    expect(oraValida('8')).toBe(false)
    expect(oraValida('08:00:00:00')).toBe(false)
    expect(oraValida('08-00')).toBe(false)
  })
})

describe('Il turno che passa la mezzanotte', () => {
  it('dalle 22 alle 2 dura quattro ore, non meno venti', () => {
    // Il turno di chiusura di una gelateria d'estate.
    expect(oreTurno('22:00:00', '02:00:00')).toBe(4)
  })

  it('e un turno che finisce quando comincia dura zero, non ventiquattro', () => {
    expect(oreTurno('08:00:00', '08:00:00')).toBe(0)
  })
})
