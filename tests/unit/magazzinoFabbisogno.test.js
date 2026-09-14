// Il fabbisogno settimanale dev'essere fatto di giorni veri.
//
// Prima si prendevano le ULTIME 7 SESSIONI di produzione e la loro somma
// veniva chiamata "fabbisogno settimanale". Su una pasticceria che chiude tre
// settimane ad agosto, al rientro quelle 7 sessioni erano di luglio: il conto
// diceva "2 giorni di scorta" in rosso, con stato critico e una lista di
// riordino con la spesa stimata. Numeri inventati, presentati come misurati.

import { describe, it, expect } from 'vitest'
import { calcolaFabbisognoSettimana } from '../../src/views/MagazzinoView.jsx'

const ricettario = {
  ricette: {
    r1: { nome: 'SACHER', tipo: 'torta', porzioni: 8, prezzo: 30,
      ingredienti: [{ nome: 'burro', qty1stampo: 300 }] },
  },
}
// Una sessione: 2 stampi di Sacher = 600 g di burro.
const sess = (data, stampi = 2) => ({ data, prodotti: [{ nome: 'SACHER', stampi }] })

describe('fabbisogno settimanale', () => {
  it('conta quello che hai consumato negli ultimi 7 giorni', () => {
    const r = calcolaFabbisognoSettimana(ricettario, [sess('2026-09-10'), sess('2026-09-12')], '2026-09-14')
    expect(r.base).toBe('settimana')
    expect(r.fabb.burro).toBe(1200)
    expect(r.stimato).toBe(false)
  })

  it('le sessioni fuori dalla finestra non entrano nel conto della settimana', () => {
    // Questa e' la riga che prima non c'era: la sessione di luglio finiva
    // dentro la "settimana" solo perche' era una delle ultime sette.
    const r = calcolaFabbisognoSettimana(
      ricettario,
      [sess('2026-09-13'), sess('2026-07-02'), sess('2026-07-03'), sess('2026-07-04')],
      '2026-09-14',
    )
    expect(r.base).toBe('settimana')
    expect(r.fabb.burro).toBe(600) // solo la sessione del 13
  })

  it('senza produzione nell\'ultima settimana usa la media di 4 settimane, e lo dichiara', () => {
    const r = calcolaFabbisognoSettimana(
      ricettario,
      [sess('2026-08-25'), sess('2026-08-27'), sess('2026-09-01'), sess('2026-09-03')],
      '2026-09-14',
    )
    expect(r.base).toBe('media4settimane')
    // 4 sessioni × 600 g = 2.400 g in quattro settimane → 600 g a settimana
    expect(r.fabb.burro).toBe(600)
  })

  it('dopo la chiusura di agosto non inventa un fabbisogno', () => {
    // Tre settimane di chiusura: l'ultima produzione e' di luglio.
    const r = calcolaFabbisognoSettimana(
      ricettario,
      [sess('2026-07-28'), sess('2026-07-29'), sess('2026-07-30')],
      '2026-09-14',
    )
    expect(r.base).toBe('nessuno')
    expect(r.fabb).toEqual({})
    // Senza consumo, i giorni di scorta restano nulli: niente rosso, niente
    // lista di riordino, niente spesa stimata.
    expect(r.stimato).toBe(false)
  })

  it('nessuna sessione mai registrata: resta la stima, dichiarata come tale', () => {
    const r = calcolaFabbisognoSettimana(ricettario, [], '2026-09-14')
    expect(r.base).toBe('stima')
    expect(r.stimato).toBe(true)
    expect(r.fabb.burro).toBe(300) // un impasto per ricetta a settimana
  })
})
