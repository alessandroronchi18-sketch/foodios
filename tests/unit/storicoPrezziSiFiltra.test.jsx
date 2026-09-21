// @vitest-environment happy-dom
//
// ── Lo storico dei prezzi è una sezione, e si filtra ─────────────────────
//
// Richiesta del titolare, 21/09/2026: «nella pagina materie prime, il
// pulsante storico modifiche non deve solo aprire un elenco ma deve rimandare
// ad un'altra sezione sempre nella pagina materie prime, perché quando ci
// saranno un sacco di modifiche di ingredienti uno deve avere la possibilità
// di filtrare per fornitore / materia prima / prezzo ecc».
//
// Com'era: un cassetto che mostrava **le ultime 50 modifiche** in un riquadro
// alto 240 pixel, senza filtri e senza dire da dove arrivasse ogni riga.
//
// Perché quel 50 non regge: dal 21/09 i prezzi si aggiornano da soli quando si
// carica una bolla — arriva la merce, si carica il documento, il prezzo al
// chilo cambia e la modifica finisce qui. Una gelateria con quaranta materie
// prime e una consegna a settimana fa duemila righe l'anno. «Le ultime 50»
// vuol dire nove giorni di storia.
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
import StoricoPrezziSection, { filtraStorico, riassuntoStorico, origineInParole } from '../../src/views/StoricoPrezziSection.jsx'

const giorniFa = (n) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString()

// Uno storico con dentro tutti i casi che contano: due fornitori, una
// modifica a mano, un rincaro forte, un ribasso, una riga vecchia e un primo
// prezzo (che non è un aumento).
const LOG = [
  { id: 'l1', data: giorniFa(2), ingrediente: 'burro', prezzoVecchio: 9, prezzoNuovo: 10.8, delta: 1.8, deltaPct: 20,
    utente: 'riccardo@maradeiboschi.com', origine: { tipo: 'bolla', fornitore: 'Latteria Rossi', numero: 'DDT-100' } },
  { id: 'l2', data: giorniFa(5), ingrediente: 'panna', prezzoVecchio: 4, prezzoNuovo: 3.6, delta: -0.4, deltaPct: -10,
    origine: { tipo: 'bolla', fornitore: 'Latteria Rossi', numero: 'DDT-100' } },
  { id: 'l3', data: giorniFa(10), ingrediente: 'pasta di pistacchio', prezzoVecchio: 30, prezzoNuovo: 31.5, delta: 1.5, deltaPct: 5,
    origine: { tipo: 'bolla', fornitore: 'Secchi Srl', numero: 'DDT-7' } },
  { id: 'l4', data: giorniFa(45), ingrediente: 'zucchero', prezzoVecchio: 1, prezzoNuovo: 1.2, delta: 0.2, deltaPct: 20 },
  { id: 'l5', data: giorniFa(400), ingrediente: 'burro', prezzoVecchio: 8, prezzoNuovo: 9, delta: 1, deltaPct: 12.5,
    origine: { tipo: 'bolla', fornitore: 'Latteria Rossi', numero: 'DDT-1' } },
  { id: 'l6', data: giorniFa(1), ingrediente: 'vaniglia', prezzoVecchio: null, prezzoNuovo: 120, delta: null, deltaPct: null },
]

// «zucchero» non ha fornitore sulla riga: lo prende dal listino.
const FORNITORE_DI = { zucchero: 'Secchi Srl' }

const apri = (p = {}) => render(
  <StoricoPrezziSection logPrezzi={LOG} fornitoreDi={FORNITORE_DI} isMobile={false} {...p} />,
)
const testo = () => document.body.textContent || ''
const selects = () => [...document.querySelectorAll('select')]
const perEtichetta = (re) => [...document.querySelectorAll('select, input')]
  .find(e => re.test(e.getAttribute('id') || ''))

afterEach(() => cleanup())

describe('Il filtro per materia prima', () => {
  it('«burro» lascia solo le righe del burro', () => {
    const r = filtraStorico(LOG, { testo: 'burro' })
    expect(r.map(l => l.id).sort()).toEqual(['l1', 'l5'])
  })

  it('e non distingue maiuscole e spazi', () => {
    expect(filtraStorico(LOG, { testo: '  BURRO ' }).length).toBe(2)
  })

  it('cerca anche a pezzi di parola: «pista» trova la pasta di pistacchio', () => {
    expect(filtraStorico(LOG, { testo: 'pista' }).map(l => l.id)).toEqual(['l3'])
  })
})

describe('Il filtro per fornitore', () => {
  it('prende il fornitore scritto sulla bolla', () => {
    const r = filtraStorico(LOG, { fornitore: 'Latteria Rossi', fornitoreDi: FORNITORE_DI })
    expect(r.map(l => l.id).sort()).toEqual(['l1', 'l2', 'l5'])
  })

  it('e per le modifiche a mano usa quello del listino', () => {
    // Lo zucchero è stato cambiato a mano: sulla riga il fornitore non c'è,
    // ma nel listino quella materia prima è di Secchi Srl. Senza questo,
    // filtrando per Secchi la modifica sparirebbe.
    const r = filtraStorico(LOG, { fornitore: 'Secchi Srl', fornitoreDi: FORNITORE_DI })
    expect(r.map(l => l.id).sort()).toEqual(['l3', 'l4'])
  })

  it('«senza fornitore» tiene solo quelle che non ne hanno nessuno', () => {
    const r = filtraStorico(LOG, { fornitore: 'senza', fornitoreDi: FORNITORE_DI })
    expect(r.map(l => l.id)).toEqual(['l6'])
  })
})

describe('Il filtro per variazione', () => {
  it('solo aumenti', () => {
    expect(filtraStorico(LOG, { variazione: 'aumenti' }).map(l => l.id).sort()).toEqual(['l1', 'l3', 'l4', 'l5'])
  })

  it('solo ribassi', () => {
    expect(filtraStorico(LOG, { variazione: 'ribassi' }).map(l => l.id)).toEqual(['l2'])
  })

  it('oltre il 10%, e prende anche i ribassi forti', () => {
    // «Forte» vuol dire che sposta il food cost, in su o in giù: un −20%
    // sulla panna vale un avviso quanto un +20% sul burro.
    expect(filtraStorico(LOG, { variazione: 'forti' }).map(l => l.id).sort()).toEqual(['l1', 'l2', 'l4', 'l5'])
  })

  it('un primo prezzo non è né un aumento né un ribasso', () => {
    // La vaniglia prima non aveva prezzo: `delta` è nullo. Contarla come
    // «+120 €» direbbe che il costo è salito, e non è vero — prima non si
    // sapeva.
    const su = filtraStorico(LOG, { variazione: 'aumenti' })
    expect(su.map(l => l.id)).not.toContain('l6')
  })
})

describe('Il filtro per periodo', () => {
  it('ultimi 30 giorni', () => {
    expect(filtraStorico(LOG, { periodo: '30' }).map(l => l.id).sort()).toEqual(['l1', 'l2', 'l3', 'l6'])
  })

  it('ultimo anno: resta fuori solo quella di più di un anno fa', () => {
    expect(filtraStorico(LOG, { periodo: '365' }).map(l => l.id)).not.toContain('l5')
  })

  it('da sempre le tiene tutte', () => {
    expect(filtraStorico(LOG, { periodo: 'tutto' })).toHaveLength(LOG.length)
  })

  it('una riga con la data storta non fa sparire le altre', () => {
    const conRotta = [...LOG, { id: 'rotta', data: 'non è una data', ingrediente: 'x', prezzoNuovo: 1 }]
    expect(filtraStorico(conRotta, { periodo: 'tutto' })).toHaveLength(LOG.length + 1)
    expect(filtraStorico(conRotta, { periodo: '30' }).map(l => l.id)).not.toContain('rotta')
  })
})

describe('I filtri si combinano', () => {
  it('burro di Latteria Rossi nell\'ultimo anno', () => {
    const r = filtraStorico(LOG, { testo: 'burro', fornitore: 'Latteria Rossi', periodo: '365', fornitoreDi: FORNITORE_DI })
    expect(r.map(l => l.id)).toEqual(['l1'])
  })

  it('e se non resta niente non è un errore, è una risposta', () => {
    expect(filtraStorico(LOG, { testo: 'burro', variazione: 'ribassi' })).toEqual([])
  })
})

describe('Il riassunto in cima', () => {
  it('conta aumenti e ribassi', () => {
    const s = riassuntoStorico(LOG)
    expect(s.totale).toBe(6)
    expect(s.aumenti).toBe(4)
    expect(s.ribassi).toBe(1)
  })

  it('e dice qual è il rincaro maggiore', () => {
    const s = riassuntoStorico(LOG)
    expect(['burro', 'zucchero']).toContain(s.piuSu.ingrediente)
    expect(Number(s.piuSu.deltaPct)).toBe(20)
  })

  it('se non c\'è nessun aumento non ne inventa uno', () => {
    // Prendere «il meno peggio» e chiamarlo rincaro sarebbe un numero falso.
    const soloGiu = [{ id: 'a', data: giorniFa(1), ingrediente: 'panna', delta: -1, deltaPct: -10, prezzoNuovo: 3 }]
    expect(riassuntoStorico(soloGiu).piuSu).toBe(null)
    expect(riassuntoStorico(soloGiu).piuGiu.ingrediente).toBe('panna')
  })

  it('e su uno storico vuoto non esplode', () => {
    expect(riassuntoStorico([])).toEqual({ totale: 0, aumenti: 0, ribassi: 0, piuSu: null, piuGiu: null })
    expect(riassuntoStorico(null).totale).toBe(0)
  })
})

describe('Da dove arriva una modifica', () => {
  it('una bolla porta il numero del documento e il fornitore', () => {
    const o = origineInParole(LOG[0])
    expect(o.fornitore).toBe('Latteria Rossi')
    expect(o.testo).toMatch(/DDT-100/)
    expect(o.testo).toMatch(/Latteria Rossi/)
  })

  it('una modifica a mano lo dice', () => {
    expect(origineInParole(LOG[3]).testo).toBe('a mano')
    expect(origineInParole(LOG[3]).fornitore).toBe(null)
  })

  it('e un\'origine scritta come testo non rompe niente', () => {
    expect(origineInParole({ origine: 'import listino' }).testo).toBe('import listino')
  })
})

describe('La sezione a schermo', () => {
  it('mostra le modifiche con nome, prezzo vecchio e nuovo', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/burro/))
    expect(testo()).toMatch(/10,80 €\/kg/)
    expect(testo()).toMatch(/9,00 €\/kg/)
  })

  it('e scrive gli importi all\'italiana, col simbolo dopo la cifra', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/burro/))
    const suoi = [...document.querySelectorAll('*')]
      .map(e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(''))
      .filter(t => t.includes('€'))
    expect(suoi.length, 'nessun importo a schermo: la prova non guarda niente').toBeGreaterThan(0)
    expect(suoi.filter(t => /€\s?\d/.test(t)), 'il simbolo € va dopo la cifra').toEqual([])
  })

  it('scrivendo nel campo «materia prima» l\'elenco si stringe', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/pistacchio/))
    const campo = perEtichetta(/^storico-cerca$/)
    act(() => { fireEvent.change(campo, { target: { value: 'burro' } }) })
    await waitFor(() => expect(testo()).not.toMatch(/pistacchio/))
    expect(testo()).toMatch(/burro/)
  })

  it('il filtro dei fornitori si costruisce dai dati, non è scritto a mano', async () => {
    // Il giorno che arriva un fornitore nuovo, deve comparire da solo.
    apri()
    await waitFor(() => expect(testo()).toMatch(/burro/))
    const sel = selects().find(s => s.id === 'storico-fornitore')
    const opzioni = [...sel.options].map(o => o.textContent)
    expect(opzioni).toContain('Latteria Rossi')
    expect(opzioni).toContain('Secchi Srl')
    expect(opzioni).toContain('Senza fornitore')
  })

  it('scegliendo un fornitore restano solo le sue modifiche', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/pistacchio/))
    const sel = selects().find(s => s.id === 'storico-fornitore')
    act(() => { fireEvent.change(sel, { target: { value: 'Secchi Srl' } }) })
    await waitFor(() => expect(testo()).not.toMatch(/panna/))
    expect(testo()).toMatch(/pistacchio/)
  })

  it('ogni filtro ha la sua etichetta scritta, non solo un segnaposto', async () => {
    // Un campo senza etichetta è un campo che un lettore di schermo annuncia
    // come «casella di testo», e basta.
    apri()
    await waitFor(() => expect(testo()).toMatch(/burro/))
    for (const id of ['storico-cerca', 'storico-fornitore', 'storico-variazione', 'storico-periodo']) {
      const et = document.querySelector(`label[for="${id}"]`)
      expect(et, `manca l'etichetta di ${id}`).toBeTruthy()
      expect((et.textContent || '').trim().length).toBeGreaterThan(2)
    }
  })

  it('con i filtri che non lasciano niente lo dice, e dice cosa fare', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/burro/))
    const campo = perEtichetta(/^storico-cerca$/)
    act(() => { fireEvent.change(campo, { target: { value: 'zafferano' } }) })
    await waitFor(() => expect(testo()).toMatch(/Nessuna modifica con questi filtri/))
    expect(testo()).toMatch(/allargare il periodo|togliere il fornitore/)
  })

  it('senza nessuna modifica spiega a cosa serve questa pagina', async () => {
    apri({ logPrezzi: [] })
    await waitFor(() => expect(testo()).toMatch(/Nessuna modifica registrata/))
    expect(testo()).toMatch(/cambi di prezzo/)
  })

  it('c\'è il comando per tornare al listino', async () => {
    let tornato = false
    apri({ onTornaAlListino: () => { tornato = true } })
    await waitFor(() => expect(testo()).toMatch(/burro/))
    const b = [...document.querySelectorAll('button')].find(x => /torna al listino/i.test(x.textContent || ''))
    expect(b, 'dalla sezione non si torna indietro').toBeTruthy()
    act(() => { fireEvent.click(b) })
    expect(tornato).toBe(true)
  })

  it('non mostra NaN, undefined o Invalid Date, nemmeno con righe storte', async () => {
    apri({ logPrezzi: [
      { id: 'a', data: 'boh', ingrediente: 'x', prezzoVecchio: undefined, prezzoNuovo: undefined },
      { id: 'b', data: giorniFa(1), ingrediente: 'y', prezzoVecchio: 1, prezzoNuovo: 2, delta: 1, deltaPct: 100 },
    ] })
    await waitFor(() => expect(testo()).toMatch(/y/))
    expect(testo()).not.toMatch(/NaN/)
    expect(testo()).not.toMatch(/undefined/)
    expect(testo()).not.toMatch(/Invalid Date/)
  })

  it('e un primo prezzo si legge «primo prezzo», non «+120 €»', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/vaniglia/))
    expect(testo()).toMatch(/primo prezzo/)
  })
})

describe('Il righello di questo file', () => {
  it('lo storico di prova ha dentro tutti i casi che servono', () => {
    expect(LOG.length).toBeGreaterThanOrEqual(6)
    expect(LOG.some(l => l.delta > 0)).toBe(true)
    expect(LOG.some(l => l.delta < 0)).toBe(true)
    expect(LOG.some(l => !l.origine)).toBe(true)
    expect(new Set(LOG.map(l => l.origine?.fornitore).filter(Boolean)).size).toBe(2)
  })

  it('e la sezione disegna davvero delle righe, non una scatola vuota', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/burro/))
    expect(document.querySelectorAll('select').length).toBe(3)
    expect(testo()).toMatch(/Storico modifiche prezzi/)
  })
})
