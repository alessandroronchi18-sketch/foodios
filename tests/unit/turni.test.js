// Orari dei turni. Il difetto che ha fatto nascere questo file costava soldi:
// un turno che passa la mezzanotte valeva zero ore e quindi zero costo del
// lavoro. Per una gelateria che d'estate chiude a mezzanotte, ogni turno di
// chiusura era lavoro gratis nei conti dell'azienda.

import { describe, it, expect } from 'vitest'
import { toMin, finMin, hm, oreTurno, siAccavallano, analizzaCopertura } from '../../src/lib/turni'

describe('oreTurno', () => {
  it('turno normale', () => {
    expect(oreTurno('08:00', '16:00')).toBe(8)
    expect(oreTurno('09:30', '13:00')).toBe(3.5)
  })

  it('turno che passa la mezzanotte', () => {
    // Prima: (30 - 1140)/60 = -18,5 → Math.max(0, ...) → ZERO ore, zero costo.
    expect(oreTurno('19:00', '00:30')).toBe(5.5)
    expect(oreTurno('22:00', '02:00')).toBe(4)
    expect(oreTurno('23:45', '00:15')).toBe(0.5)
  })

  it('fine uguale all inizio vale zero (è un errore di battitura)', () => {
    expect(oreTurno('08:00', '08:00')).toBe(0)
  })

  it('regge orari vuoti o storti senza inventare ore', () => {
    expect(oreTurno('', '')).toBe(0)
    expect(oreTurno(null, undefined)).toBe(0)
    // Prima "abc" veniva letto come mezzanotte e il turno diventava di SEDICI
    // ore (08:00 → 00:00 del giorno dopo), col costo relativo.
    expect(oreTurno('08:00', 'abc')).toBe(0)
    expect(oreTurno('08:00', '25:99')).toBe(0)
  })
})

describe('hm — scrittura dell orario', () => {
  it('riporta i minuti dentro le 24 ore', () => {
    expect(hm(1470)).toBe('00:30')   // 24:30 non esiste
    expect(hm(1140)).toBe('19:00')
    expect(hm(0)).toBe('00:00')
  })
  it('non va in negativo', () => {
    expect(hm(-30)).toBe('23:30')
  })
})

describe('siAccavallano', () => {
  const t = (i, f) => ({ ora_inizio: i, ora_fine: f })

  it('due turni di giorno', () => {
    expect(siAccavallano(t('08:00', '14:00'), t('13:00', '20:00'))).toBe(true)
    expect(siAccavallano(t('08:00', '14:00'), t('14:00', '20:00'))).toBe(false)
  })

  it('vede l accavallamento anche oltre la mezzanotte', () => {
    // Prima il confronto usava i minuti grezzi: 00:30 (30) risultava PRIMA di
    // 19:00 (1140), e l'accavallamento non veniva visto.
    expect(siAccavallano(t('19:00', '00:30'), t('23:00', '00:15'))).toBe(true)
    expect(siAccavallano(t('19:00', '00:30'), t('08:00', '14:00'))).toBe(false)
  })
})

describe('analizzaCopertura', () => {
  it('conta le persone presenti per fascia', () => {
    const cop = analizzaCopertura([
      { id: 1, ora_inizio: '08:00', ora_fine: '14:00', dipendenti: { nome: 'Anna' } },
      { id: 2, ora_inizio: '12:00', ora_fine: '20:00', dipendenti: { nome: 'Bruno' } },
    ])
    expect(cop.shifts).toHaveLength(2)
    expect(cop.open).toBe(toMin('08:00'))
    expect(cop.close).toBe(toMin('20:00'))
    expect(cop.max).toBe(2)          // 12:00-14:00 in due
    expect(cop.min).toBe(1)
    expect([...cop.overlaps].sort()).toEqual([1, 2])
  })

  it('non butta via il turno di chiusura', () => {
    // Prima il filtro `fin > ini` scartava il turno serale: il calendario
    // mostrava la sera scoperta e l'analisi diceva "nessuno in negozio".
    const cop = analizzaCopertura([
      { id: 1, ora_inizio: '10:00', ora_fine: '19:00', dipendenti: { nome: 'Anna' } },
      { id: 2, ora_inizio: '18:00', ora_fine: '00:30', dipendenti: { nome: 'Bruno' } },
    ])
    expect(cop.shifts).toHaveLength(2)
    expect(cop.close).toBe(finMin('18:00', '00:30'))   // 1470, cioè 00:30
    expect(hm(cop.close)).toBe('00:30')
    expect([...cop.overlaps].sort()).toEqual([1, 2])   // 18:00-19:00 in due
  })

  it('giornata vuota non fa esplodere niente', () => {
    const cop = analizzaCopertura([])
    expect(cop.shifts).toEqual([])
    expect(cop.max).toBe(0)
    expect(cop.segments).toEqual([])
  })

  it('scarta solo i turni davvero a zero', () => {
    const cop = analizzaCopertura([
      { id: 1, ora_inizio: '08:00', ora_fine: '08:00', dipendenti: { nome: 'Anna' } },
      { id: 2, ora_inizio: '09:00', ora_fine: '17:00', dipendenti: { nome: 'Bruno' } },
    ])
    expect(cop.shifts.map(s => s.id)).toEqual([2])
  })
})
