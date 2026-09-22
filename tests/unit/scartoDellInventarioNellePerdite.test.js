// ── Lo scarto dell'inventario è una perdita, e va dove vanno le perdite ──
//
// Nella griglia settimanale della produzione c'è una colonna «scarto»: i chili
// buttati quel giorno. Fino al 22/09/2026 quel numero lo leggeva **solo la
// Quadratura**: non entrava in «Perdite & cessioni» — la pagina dove si va a
// vedere quanto prodotto se n'è andato senza incasso — e non entrava nel conto
// del P&L.
//
// Decisione del titolare, 22/09/2026: «lo scarto deve arrivare in perdite e
// cessioni, anche la pagina sprechi deve essere collegata. Anche se nei dati
// ora caricati non risultano potrebbero essercene ogni tanto, soprattutto in
// altri tipi di business che non fanno gelato ma panini ecc.».
//
// Ha ragione su tutti e due i punti, e il secondo è quello che conta: sui dati
// del design partner la colonna è **zero su tutte e 7.013 le righe**, ma un
// panificio che butta l'invenduto tutte le sere la riempirebbe ogni giorno.
//
// ── Si proietta, non si copia ──────────────────────────────────────────
//
// I movimenti si costruiscono al volo dalle righe dell'inventario, non si
// scrivono nel registro delle perdite. Copiarli vorrebbe dire tenere lo stesso
// chilo in due posti, e il giorno che uno dei due cambia il conto non torna
// più — con la differenza che qui il numero finisce in un bilancio.
import { describe, it, expect } from 'vitest'
import { scartiComeMovimenti } from '../../src/lib/inventarioProduzione'
import { buildIngCosti } from '../../src/lib/foodcost'

const RICETTARIO = {
  ingredienti_costi: {
    latte: { costoKg: 1.2, costoG: 0.0012 },
    zucchero: { costoKg: 1, costoG: 0.001 },
  },
  ricette: {
    NOCCIOLA: {
      nome: 'NOCCIOLA', tipo: 'gusto', unita: 1, prezzo: 0,
      // Un impasto da 1.000 g che costa 1,10 €: 1,10 €/kg.
      ingredienti: [
        { nome: 'latte', qty1stampo: 500 },
        { nome: 'zucchero', qty1stampo: 500 },
      ],
    },
  },
}
const ING = buildIngCosti(RICETTARIO.ingredienti_costi)

const riga = (gusto, data, scarto_g, extra = {}) => ({
  gusto_nome: gusto, data, produzione_g: 5000, rimanenza_g: 0, scarto_g, sede_id: 's1', ...extra,
})

describe('Una cella con dello scarto diventa una perdita', () => {
  it('con prodotto, giorno e chili', () => {
    const [m] = scartiComeMovimenti([riga('NOCCIOLA', '2026-09-20', 2500)], RICETTARIO, ING)
    expect(m.tipo).toBe('spreco')
    expect(m.causale).toBe('scarto')
    expect(m.prodotto).toBe('NOCCIOLA')
    expect(m.qta).toBe(2.5)
    expect(m.unita).toBe('kg')
    expect(m.data).toBe('2026-09-20')
  })

  it('e col suo costo, preso dalla ricetta', () => {
    // Un impasto da 1.000 g costa 1,10 €, quindi 1,10 €/kg: 2,5 kg buttati
    // sono 2,75 € andati nel secchio.
    const [m] = scartiComeMovimenti([riga('NOCCIOLA', '2026-09-20', 2500)], RICETTARIO, ING)
    expect(m.fcUnit).toBeCloseTo(1.1, 3)
    expect(m.fcTot).toBe(2.75)
  })

  it('l\'ora è mezzogiorno, non mezzanotte', () => {
    // `2026-09-20T00:00` a est di Greenwich è ancora il 19: la perdita del
    // primo del mese finirebbe nel mese prima. È lo stesso difetto già
    // corretto altrove in questo prodotto.
    const [m] = scartiComeMovimenti([riga('NOCCIOLA', '2026-09-20', 1000)], RICETTARIO, ING)
    expect(m.ts).toBe('2026-09-20T12:00:00')
  })
})

describe('Quello che non deve diventare una perdita', () => {
  it('una cella senza scarto non produce niente', () => {
    expect(scartiComeMovimenti([riga('NOCCIOLA', '2026-09-20', 0)], RICETTARIO, ING)).toEqual([])
    expect(scartiComeMovimenti([riga('NOCCIOLA', '2026-09-20', null)], RICETTARIO, ING)).toEqual([])
  })

  it('e nemmeno uno scarto negativo, che è una correzione', () => {
    expect(scartiComeMovimenti([riga('NOCCIOLA', '2026-09-20', -500)], RICETTARIO, ING)).toEqual([])
  })

  it('una riga senza gusto o senza data si salta', () => {
    expect(scartiComeMovimenti([riga('', '2026-09-20', 1000)], RICETTARIO, ING)).toEqual([])
    expect(scartiComeMovimenti([riga('NOCCIOLA', null, 1000)], RICETTARIO, ING)).toEqual([])
  })

  it('e un elenco vuoto non fa saltare niente', () => {
    expect(scartiComeMovimenti(null, RICETTARIO, ING)).toEqual([])
    expect(scartiComeMovimenti([], null, null)).toEqual([])
  })
})

describe('Quando il costo non si sa', () => {
  it('resta vuoto, invece di diventare zero', () => {
    // Un costo inventato in una pagina di perdite è peggio di un costo
    // mancante: «0 €» vuol dire «non è costato niente», e non è vero.
    const [m] = scartiComeMovimenti([riga('SCONOSCIUTO', '2026-09-20', 2000)], RICETTARIO, ING)
    expect(m.fcUnit).toBe(null)
    expect(m.fcTot).toBe(null)
    expect(m.qta).toBe(2)
  })

  it('e nemmeno senza ricettario', () => {
    const [m] = scartiComeMovimenti([riga('NOCCIOLA', '2026-09-20', 2000)], null, null)
    expect(m.fcTot).toBe(null)
    expect(m.prodotto).toBe('NOCCIOLA')
  })
})

describe('Le righe restano dell\'inventario', () => {
  it('sono marcate, così la pagina delle perdite non le lascia cancellare', () => {
    // Si correggono dove sono scritte: cancellarle da un'altra pagina
    // lascerebbe l'inventario a dire una cosa e le perdite un'altra.
    const [m] = scartiComeMovimenti([riga('NOCCIOLA', '2026-09-20', 1000)], RICETTARIO, ING)
    expect(m._daInventario).toBe(true)
    expect(m.note).toMatch(/produzione/i)
  })

  it('e due proiezioni della stessa cella hanno lo stesso id', () => {
    // È quello che impedisce di contare due volte lo stesso chilo quando la
    // pagina ricarica: l'id porta dentro sede, gusto e giorno, e
    // l'inventario ha un vincolo di unicità proprio su quella terna.
    const a = scartiComeMovimenti([riga('NOCCIOLA', '2026-09-20', 1000)], RICETTARIO, ING)[0]
    const b = scartiComeMovimenti([riga('NOCCIOLA', '2026-09-20', 1000)], RICETTARIO, ING)[0]
    expect(a.id).toBe(b.id)
  })

  it('ma due giorni diversi, o due gusti diversi, no', () => {
    const righe = [
      riga('NOCCIOLA', '2026-09-20', 1000),
      riga('NOCCIOLA', '2026-09-21', 1000),
      riga('PISTACCHIO', '2026-09-20', 1000),
    ]
    const ids = scartiComeMovimenti(righe, RICETTARIO, ING).map(m => m.id)
    expect(new Set(ids).size).toBe(3)
  })
})

describe('Più righe insieme', () => {
  it('escono dalla più recente alla più vecchia, come le altre perdite', () => {
    const righe = [
      riga('NOCCIOLA', '2026-09-18', 1000),
      riga('NOCCIOLA', '2026-09-20', 2000),
      riga('NOCCIOLA', '2026-09-19', 1500),
    ]
    expect(scartiComeMovimenti(righe, RICETTARIO, ING).map(m => m.data))
      .toEqual(['2026-09-20', '2026-09-19', '2026-09-18'])
  })

  it('e il totale dei chili è la somma di quello che c\'era scritto', () => {
    const righe = [riga('NOCCIOLA', '2026-09-18', 1000), riga('NOCCIOLA', '2026-09-20', 2500)]
    const tot = scartiComeMovimenti(righe, RICETTARIO, ING).reduce((a, m) => a + m.qta, 0)
    expect(tot).toBe(3.5)
  })
})

describe('Il righello di questo file', () => {
  it('la ricetta di prova costa davvero 1,10 € al chilo', () => {
    // Se il costo di riferimento cambiasse, le prove sul costo passerebbero
    // per il motivo sbagliato.
    const [m] = scartiComeMovimenti([riga('NOCCIOLA', '2026-09-20', 1000)], RICETTARIO, ING)
    expect(m.fcTot).toBeCloseTo(1.1, 2)
  })
})
