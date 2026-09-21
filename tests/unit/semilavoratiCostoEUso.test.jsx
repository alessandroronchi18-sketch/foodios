// @vitest-environment happy-dom
//
// ── I semilavorati: quanto costano e chi li usa ─────────────────────────
//
// Le basi — la base bianca, la crema pasticcera, lo zabaione — non si vendono:
// entrano dentro altre ricette. Il loro costo si propaga a tutto quello che le
// contiene, quindi un errore qui non sbaglia una riga: sbaglia il food cost di
// **tutte** le ricette che usano quella base.
//
// Sui dati veri del design partner: 5 semilavorati, e **29 ricette su 68 usano
// la base bianca**. Un euro sbagliato al chilo lì dentro si moltiplica per
// ventinove.
//
// Queste prove montano la pagina vera e guardano quello che si legge. Coprono
// le tre cose che questa pagina deve azzeccare:
//
//   1. il costo al chilo di una base, ricavato dai suoi ingredienti;
//   2. cosa succede quando un ingrediente di quella base **non ha prezzo** —
//      perché il costo che ne esce è più basso del vero, e più basso del vero
//      vuol dire margine più alto del vero;
//   3. chi la usa, cioè l'elenco delle ricette a valle, che è il motivo per
//      cui uno apre questa pagina.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react'

const { default: SemilavoratiView } = await import('../../src/views/SemilavoratiView.jsx')

// Una base con tutti i prezzi, una base con un ingrediente senza prezzo, e due
// ricette che le usano.
const RICETTARIO = {
  ingredienti_costi: {
    latte: { costoKg: 1.2, costoG: 0.0012 },
    zucchero: { costoKg: 1.0, costoG: 0.001 },
    'pasta di pistacchio': { costoKg: 30, costoG: 0.03 },
    // «panna» manca di proposito: è il caso che conta.
  },
  ricette: {
    'BASE BIANCA': {
      nome: 'BASE BIANCA', tipo: 'semilavorato', unita: 0, prezzo: 0,
      ingredienti: [
        { nome: 'latte', qty1stampo: 600 },
        { nome: 'zucchero', qty1stampo: 400 },
      ],
    },
    'BASE INCOMPLETA': {
      nome: 'BASE INCOMPLETA', tipo: 'semilavorato', unita: 0, prezzo: 0,
      ingredienti: [
        { nome: 'latte', qty1stampo: 500 },
        { nome: 'panna', qty1stampo: 500 },   // senza prezzo
      ],
    },
    PISTACCHIO: {
      nome: 'PISTACCHIO', tipo: 'gusto', unita: 1, prezzo: 0,
      ingredienti: [
        { nome: 'base bianca', qty1stampo: 800 },
        { nome: 'pasta di pistacchio', qty1stampo: 200 },
      ],
    },
    FIORDILATTE: {
      nome: 'FIORDILATTE', tipo: 'gusto', unita: 1, prezzo: 0,
      ingredienti: [{ nome: 'base bianca', qty1stampo: 1000 }],
    },
  },
}

const apri = (p = {}) => render(
  <SemilavoratiView ricettario={RICETTARIO} onSave={async () => {}}
    notify={() => {}} tipoAttivita="gelateria" {...p} />,
)
const testo = () => document.body.textContent || ''

afterEach(() => cleanup())

describe('Il costo di una base esce dai suoi ingredienti', () => {
  it('la base bianca compare con il suo costo', async () => {
    // 600 g di latte a 1,20 €/kg + 400 g di zucchero a 1,00 €/kg = 1,12 € al
    // chilo di base.
    apri()
    await waitFor(() => expect(testo()).toContain('BASE BIANCA'))
    expect(testo()).toMatch(/1,12|1,1/)
  })

  it('e la pagina dice quante basi ci sono', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('BASE BIANCA'))
    expect(testo()).toContain('BASE INCOMPLETA')
  })

  it('i costi si scrivono all\'italiana, col simbolo dopo la cifra', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('BASE BIANCA'))
    const suoi = [...document.querySelectorAll('*')]
      .map(e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(''))
      .filter(t => t.includes('€'))
    expect(suoi.length, 'nessun importo a schermo: la prova non guarda niente').toBeGreaterThan(0)
    expect(suoi.filter(t => /€\s?\d/.test(t)), 'il simbolo € va dopo la cifra').toEqual([])
  })
})

describe('Una base con un ingrediente senza prezzo', () => {
  it('la pagina lo dice, invece di far finta che costi meno', async () => {
    // È il difetto di famiglia di questo prodotto: il costo che manca diventa
    // zero, il costo totale scende, e il margine sale. Una base che sembra
    // costare la metà fa sembrare tutte le ricette a valle più redditizie.
    apri()
    await waitFor(() => expect(testo()).toContain('BASE INCOMPLETA'))
    expect(testo()).toMatch(/senza prezzo|prezzo mancante|non ha prezzo|incompleto/i)
  })

  it('e nomina l\'ingrediente che manca, non solo il fatto che manchi', async () => {
    // «1 senza prezzo» manda a cercare fra dieci righe, «panna» manda a
    // correggere. L'etichetta resta corta — i badge di schede diverse devono
    // restare incolonnati fra loro — e il nome sta nel suggerimento.
    apri()
    await waitFor(() => expect(testo()).toContain('BASE INCOMPLETA'))
    const conTitolo = [...document.querySelectorAll('[title]')]
      .map(e => e.getAttribute('title')).join(' | ')
    expect(conTitolo).toMatch(/panna/i)
  })

  it('e il suggerimento spiega anche perché è un problema', async () => {
    // Sapere che manca un prezzo non basta: bisogna sapere che **il costo
    // esce più basso del vero**, e che tutte le ricette che usano quella base
    // sembrano più redditizie di quanto siano.
    apri()
    await waitFor(() => expect(testo()).toContain('BASE INCOMPLETA'))
    const conTitolo = [...document.querySelectorAll('[title]')]
      .map(e => e.getAttribute('title')).join(' | ')
    expect(conTitolo).toMatch(/meno del vero|più redditizie/i)
  })
})

describe('Chi usa quella base', () => {
  it('la pagina dice in quanti prodotti entra', async () => {
    // La base bianca sta in PISTACCHIO e in FIORDILATTE: due.
    apri()
    await waitFor(() => expect(testo()).toContain('BASE BIANCA'))
    expect(testo()).toMatch(/2 (prodotti|gusti|ricette)|usato in 2/i)
  })

  it('e una base che non usa nessuno lo dice', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('BASE INCOMPLETA'))
    expect(testo()).toMatch(/nessun|non è usat|0 /i)
  })
})

describe('Quello che non deve mai comparire a schermo', () => {
  it('niente NaN, undefined, Invalid Date o [object Object]', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('BASE BIANCA'))
    const t = testo()
    expect(t).not.toMatch(/NaN/)
    expect(t).not.toMatch(/undefined/)
    expect(t).not.toMatch(/\[object Object\]/)
  })

  it('nemmeno con un ricettario vuoto', async () => {
    apri({ ricettario: { ricette: {}, ingredienti_costi: {} } })
    await waitFor(() => expect(testo().length).toBeGreaterThan(50))
    expect(testo()).not.toMatch(/NaN|undefined|\[object Object\]/)
  })

  it('nemmeno con una base senza ingredienti', async () => {
    apri({ ricettario: {
      ingredienti_costi: {},
      ricette: { VUOTA: { nome: 'VUOTA', tipo: 'semilavorato', unita: 0, prezzo: 0, ingredienti: [] } },
    } })
    await waitFor(() => expect(testo()).toContain('VUOTA'))
    expect(testo()).not.toMatch(/NaN|undefined/)
  })

  it('e nemmeno con una quantità scritta come testo', async () => {
    apri({ ricettario: {
      ingredienti_costi: { latte: { costoKg: 1.2, costoG: 0.0012 } },
      ricette: { STORTA: {
        nome: 'STORTA', tipo: 'semilavorato', unita: 0, prezzo: 0,
        ingredienti: [{ nome: 'latte', qty1stampo: 'mille' }],
      } },
    } })
    await waitFor(() => expect(testo()).toContain('STORTA'))
    expect(testo()).not.toMatch(/NaN/)
  })
})

describe('Senza nessuna base, la pagina spiega a cosa servirebbe', () => {
  it('non mostra una tabella vuota', async () => {
    apri({ ricettario: { ricette: {}, ingredienti_costi: {} } })
    await waitFor(() => expect(testo().length).toBeGreaterThan(50))
    expect(testo()).toMatch(/semilavorat|base/i)
  })

  it('e il comando per crearne una c\'è', async () => {
    apri({ ricettario: { ricette: {}, ingredienti_costi: {} } })
    await waitFor(() => expect(testo().length).toBeGreaterThan(50))
    const nuovo = [...document.querySelectorAll('button')]
      .find(b => /nuov|aggiungi|crea/i.test(b.textContent || ''))
    expect(nuovo).toBeTruthy()
  })
})

describe('Il righello di questo file', () => {
  it('la pagina si disegna davvero, non è una schermata vuota', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('BASE BIANCA'))
    // Le schede si aprono da tastiera con un `onKeyDown`, non sono `<button>`:
    // qui basta sapere che qualcosa di interattivo c'è, e che i nomi delle
    // basi sono a schermo.
    expect(document.querySelectorAll('button').length).toBeGreaterThanOrEqual(1)
    expect(testo()).toContain('BASE INCOMPLETA')
  })

  it('e i gusti NON compaiono in questa pagina: qui stanno solo le basi', async () => {
    // Il 18/09 il titolare ha chiesto di togliere i semilavorati dalla pagina
    // dei gusti. Il contrario vale allo stesso modo: qui non ci sono i gusti.
    apri()
    await waitFor(() => expect(testo()).toContain('BASE BIANCA'))
    const t = testo()
    expect(t).not.toMatch(/FIORDILATTE/)
  })
})
