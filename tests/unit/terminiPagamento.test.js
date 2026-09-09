// Termini di pagamento per fornitore: "30 giorni fine mese" non è
// "30 giorni".
//
// Il calcolo della scadenza sapeva fare solo `data fattura + N giorni`. Ma i
// fornitori alimentari lavorano quasi tutti a "30 giorni data fattura fine
// mese" (30 gg d.f. f.m.), che è un'altra cosa: si contano i giorni dalla FINE
// DEL MESE della fattura.
//
// Una fattura del 3 marzo:
//   30 giorni netti     → 2 aprile
//   30 giorni fine mese → 30 aprile
// Ventotto giorni di differenza. Su 211 fatture scadute cambia completamente
// quali sono davvero in ritardo, e quanto esce di cassa in una settimana.
//
// Il caso che rompe le implementazioni fatte a mano è febbraio, insieme agli
// anni bisestili e ai mesi da 31 giorni: qui il calcolo passa dall'ultimo
// giorno del mese ricavato dal calendario, non da una tabella.

import { describe, it, expect } from 'vitest'
import { scadenzaFattura, residuoFattura, riepilogoFatture, TIPI_TERMINE, GIORNI_PAGAMENTO_DEFAULT } from '../../src/lib/fatture'

const netti = (data, giorni = 30) => scadenzaFattura({ data_fattura: data, _termini: giorni })
const fineMese = (data, giorni = 30) => scadenzaFattura({ data_fattura: data, _termini: giorni, _terminiTipo: 'fine_mese' })

describe('scadenza a giorni netti', () => {
  it('conta dalla data della fattura', () => {
    expect(netti('2026-03-03').iso).toBe('2026-04-02')
    expect(netti('2026-01-15', 60).iso).toBe('2026-03-16')
  })

  it('è il comportamento predefinito', () => {
    expect(scadenzaFattura({ data_fattura: '2026-03-03' }).tipo).toBe('netti')
    expect(GIORNI_PAGAMENTO_DEFAULT).toBe(30)
  })
})

describe('scadenza a fine mese', () => {
  it('conta dalla fine del mese della fattura', () => {
    // 3 marzo → fine marzo (31) → +30 → 30 aprile.
    expect(fineMese('2026-03-03').iso).toBe('2026-04-30')
    // Anche una fattura dell'ultimo giorno del mese dà lo stesso risultato.
    expect(fineMese('2026-03-31').iso).toBe('2026-04-30')
  })

  it('regge febbraio, che è il caso che rompe i calcoli a mano', () => {
    // 2026 non è bisestile: febbraio finisce il 28.
    expect(fineMese('2026-02-10').iso).toBe('2026-03-30')
    // 2028 è bisestile: febbraio finisce il 29.
    expect(fineMese('2028-02-10').iso).toBe('2028-03-30')
    // E una fattura del 29 febbraio bisestile non sballa.
    expect(fineMese('2028-02-29').iso).toBe('2028-03-30')
  })

  it('regge il passaggio d anno', () => {
    // 20 dicembre → fine dicembre → +30 → 30 gennaio dell'anno dopo.
    expect(fineMese('2026-12-20').iso).toBe('2027-01-30')
  })

  it('con 60 giorni fine mese arriva al mese dopo', () => {
    // 5 gennaio → fine gennaio (31) → +60 → 1 aprile.
    expect(fineMese('2026-01-05', 60).iso).toBe('2026-04-01')
  })

  it('la differenza con i giorni netti è quella che conta', () => {
    const a = netti('2026-03-03').iso
    const b = fineMese('2026-03-03').iso
    expect(a).not.toBe(b)
    const giorni = (new Date(b) - new Date(a)) / 86400000
    expect(giorni).toBe(28)
  })
})

describe('la scadenza scritta nel documento vince sempre', () => {
  it('se la fattura porta la sua scadenza, non si calcola niente', () => {
    const f = { data_fattura: '2026-03-03', data_scadenza: '2026-05-15', _termini: 30, _terminiTipo: 'fine_mese' }
    const sc = scadenzaFattura(f)
    expect(sc.iso).toBe('2026-05-15')
    expect(sc.stimata).toBe(false)
  })

  it('quando manca, è marcata come stimata', () => {
    expect(fineMese('2026-03-03').stimata).toBe(true)
    expect(netti('2026-03-03').stimata).toBe(true)
  })

  it('senza data fattura non inventa una scadenza', () => {
    expect(scadenzaFattura({}).iso).toBe(null)
    expect(scadenzaFattura({ data_fattura: 'non una data' }).iso).toBe(null)
  })
})

describe('residuo e riepilogo', () => {
  it('il residuo sottrae gli acconti', () => {
    expect(residuoFattura({ totale: 1250, importo_pagato: 250 })).toBe(1000)
    expect(residuoFattura({ totale: 1250 })).toBe(1250)
    // Una nota di credito riduce il debito.
    expect(residuoFattura({ totale: 100, tipo: 'nota_credito' })).toBe(-100)
    // Un pagato superiore al totale non produce un residuo negativo.
    expect(residuoFattura({ totale: 100, importo_pagato: 150 })).toBe(0)
  })

  it('il riepilogo dice quante scadenze sono calcolate e non lette', () => {
    const lista = [
      { data_fattura: '2026-03-01', totale: 100 },                           // stimata
      { data_fattura: '2026-03-01', data_scadenza: '2026-04-01', totale: 50 }, // certa
    ]
    const r = riepilogoFatture(lista)
    expect(r.n).toBe(2)
    expect(r.totale).toBe(150)
    expect(r.stimate).toBe(1)
    expect(r.tutteStimate).toBe(false)
    // Il caso vero di Mara: nessuna fattura porta la scadenza.
    const tutte = riepilogoFatture([lista[0], { data_fattura: '2026-02-01', totale: 10 }])
    expect(tutte.tutteStimate).toBe(true)
  })

  it('i due tipi di termine hanno un nome leggibile', () => {
    expect(TIPI_TERMINE.netti.breve).toBe('gg d.f.')
    expect(TIPI_TERMINE.fine_mese.breve).toBe('gg f.m.')
  })
})
