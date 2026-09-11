// Quanto il tempo che farà sposta la domanda.
//
// Per una gelateria il meteo è la variabile più forte dopo il giorno della
// settimana: trenta gradi e sole non sono la stessa giornata di quindici gradi
// e pioggia, e chi impasta la mattina decide su quello.
//
// La regola esisteva, ma viveva dentro api/cron-forecast.js: girava solo di
// notte sul server per riempire un'altra tabella. La pagina "Previsione
// domanda", quella che il titolare guarda prima di impastare, dava lo stesso
// numero col sole e col diluvio.

import { describe, it, expect } from 'vitest'
import { correzioneMeteo, spiegaCorrezione } from '../../src/lib/meteoCorrezione.js'

describe('correzioneMeteo', () => {
  it('trenta gradi: più gelato', () => {
    expect(correzioneMeteo({ t_max: 32, precip: 0 }, 'gelateria')).toBeCloseTo(1.15, 3)
  })

  it('trenta gradi in un bar: un filo meno caffè', () => {
    expect(correzioneMeteo({ t_max: 32, precip: 0 }, 'bar')).toBeCloseTo(0.97, 3)
  })

  it('cinque gradi: molto meno gelato', () => {
    expect(correzioneMeteo({ t_max: 5, precip: 0 }, 'gelateria')).toBeCloseTo(0.80, 3)
  })

  it('cinque gradi in un bar: un po più caffè', () => {
    expect(correzioneMeteo({ t_max: 5, precip: 0 }, 'bar')).toBeCloseTo(1.05, 3)
  })

  it('pioggia vera: meno gente in giro, per tutti', () => {
    expect(correzioneMeteo({ t_max: 20, precip: 12 }, 'gelateria')).toBeCloseTo(0.85, 3)
    expect(correzioneMeteo({ t_max: 20, precip: 12 }, 'bar')).toBeCloseTo(0.85, 3)
  })

  it('caldo e pioggia insieme si sommano', () => {
    // Un temporale estivo: il caldo tira, l acqua frena.
    expect(correzioneMeteo({ t_max: 30, precip: 20 }, 'gelateria')).toBeCloseTo(1.15 * 0.85, 3)
  })

  it('una giornata normale non corregge niente', () => {
    expect(correzioneMeteo({ t_max: 20, precip: 0 }, 'gelateria')).toBe(1)
    expect(correzioneMeteo({ t_max: 20, precip: 2 }, 'gelateria')).toBe(1)
  })

  it('senza meteo non si inventa una correzione', () => {
    expect(correzioneMeteo(null, 'gelateria')).toBe(1)
    expect(correzioneMeteo(undefined, 'gelateria')).toBe(1)
  })
})

describe('spiegaCorrezione', () => {
  it('dice PERCHE il numero è cambiato', () => {
    // Una correzione del 15% applicata di nascosto è un numero di cui non ci
    // si fida: va scritto accanto.
    expect(spiegaCorrezione({ t_max: 32, precip: 0 }, 'gelateria')).toMatch(/caldo/)
    expect(spiegaCorrezione({ t_max: 5, precip: 0 }, 'gelateria')).toMatch(/freddo/)
    expect(spiegaCorrezione({ t_max: 20, precip: 12 }, 'gelateria')).toMatch(/pioggia/)
  })

  it('elenca tutte le ragioni quando sono più di una', () => {
    const t = spiegaCorrezione({ t_max: 30, precip: 20 }, 'gelateria')
    expect(t).toMatch(/caldo/)
    expect(t).toMatch(/pioggia/)
  })

  it('una giornata normale non ha niente da spiegare', () => {
    expect(spiegaCorrezione({ t_max: 20, precip: 0 }, 'gelateria')).toBeNull()
    expect(spiegaCorrezione(null, 'gelateria')).toBeNull()
  })
})
