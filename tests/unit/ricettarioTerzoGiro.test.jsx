// @vitest-environment happy-dom
//
// ── Il Ricettario, terzo giro di correzioni ───────────────────────────────
//
// Dieci richieste del titolare del 17/09/2026, tutte nate guardando la pagina
// vera con i suoi 58 prodotti. Quelle che questo file protegge:
//
//  · la tessera «Semilavorati» a destra non serviva — i semilavorati hanno
//    una scheda tutta loro — ed è diventata «Da completare», cioè quante
//    ricette non si riescono ancora a valutare;
//  · le quattro tessere dei numeri vanno a quadrato, non in fila;
//  · via la riga grigia che ripeteva costo e ricavo già scritti nelle
//    tessere a venti centimetri di distanza;
//  · gli allergeni dietro un pulsante, non quattordici etichette colorate
//    aperte sotto ogni riga;
//  · nella vista a riquadri il nome in grassetto e nel bordeaux del marchio;
//  · i nomi degli ingredienti con la prima maiuscola e il resto minuscolo.
//
// E un difetto trovato per strada, della stessa famiglia di quelli già
// corretti: nei riquadri, sotto ogni nome, c'era scritto «? pz · 0,00 €».
// Per un gusto di gelateria quel prezzo non esiste — vive sui formati di
// vendita — e zero euro scritto accanto a un prodotto non è un dato che
// manca, è un dato falso.
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RicettarioView from '../../src/views/RicettarioView.jsx'
import { formatNome } from '../../src/views/_shared.jsx'

const ricettario = {
  ingredienti_costi: { PANNA: { prezzoKg: 4.2 }, ZUCCHERO: { prezzoKg: 1.1 } },
  ricette: {
    'FIOR DI LATTE': {
      nome: 'FIOR DI LATTE', tipo: 'gusto', unita: 1, prezzo: 0,
      categoria: 'Gusto', allergeni: ['latte', 'uova'],
      ingredienti: [
        { nome: 'PANNA', qty1stampo: 300 },
        { nome: 'ZUCCHERO', qty1stampo: 180 },
      ],
    },
  },
}

/** Apre la scheda del gusto, come fa chi clicca sulla barra nell'elenco.
 *  Nell'elenco ogni scheda parte chiusa e mostra solo nome, avvisi e un
 *  numero: tessere e allergeni vivono nella scheda aperta. */
function apriGusto(utils) {
  const barra = utils.getByRole('button', { name: /FIOR DI LATTE/i })
  fireEvent.click(barra)
  return utils
}

function apri() {
  return render(
    <RicettarioView
      ricettario={ricettario}
      onUpdateRegola={() => {}}
      onUpload={() => {}}
      onEditRicetta={() => {}}
      onNuovaRicetta={() => {}}
      orgId="org-1"
      sedi={[]}
      sedeAttiva={null}
      notify={() => {}}
      metodoProduzione="stampi"
    />
  )
}

describe('La tessera che contava i semilavorati è diventata utile', () => {
  it('non conta più i semilavorati: hanno una scheda tutta loro', () => {
    apri()
    // Se tornasse, tornerebbe come etichetta di una tessera in cima.
    const etichette = screen.queryAllByText('Semilavorati')
    expect(etichette.length).toBe(0)
  })

  it('al suo posto dice quante ricette non si possono ancora valutare', () => {
    apri()
    expect(screen.getByText('Da completare')).toBeTruthy()
  })
})

describe('Gli allergeni stanno dietro un pulsante', () => {
  it('chiusi non si vedono', () => {
    apriGusto(apri())
    expect(screen.queryByText('Latte')).toBeNull()
  })

  it('il pulsante dice quanti sono e li apre', () => {
    apriGusto(apri())
    const bottone = screen.getByRole('button', { name: /allergeni/i })
    expect(bottone.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(bottone)
    expect(bottone.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('Le tessere dei numeri stanno a quadrato', () => {
  it('due colonne, non quattro in fila', () => {
    const { container } = apriGusto(apri())
    const griglia = [...container.querySelectorAll('div')]
      .find(el => (el.style.gridTemplateColumns || '').includes('minmax(86px'))
    expect(griglia, 'la griglia delle tessere non si trova').toBeTruthy()
    // Prima: repeat(4, minmax(86px, 1fr)) — tutte in fila, quasi 400px.
    expect(griglia.style.gridTemplateColumns).toContain('repeat(2')
    expect(griglia.style.gridTemplateColumns).not.toContain('repeat(4')
  })
})

describe('Niente numeri ripetuti a venti centimetri di distanza', () => {
  it('sotto il nome non si ripete «costo … /kg»', () => {
    const { container } = apriGusto(apri())
    // La riga grigia diceva «Gusto · costo 2,39 €/kg · ricavo medio …», e le
    // stesse due cifre erano nelle tessere lì accanto.
    expect(container.textContent).not.toMatch(/Gusto · costo/)
  })
})

describe('I nomi degli ingredienti si leggono, non si urlano', () => {
  it('prima lettera maiuscola, resto minuscolo', () => {
    expect(formatNome('ZUCCHERO')).toBe('Zucchero')
    expect(formatNome('zucchero_canna')).toBe('Zucchero canna')
    expect(formatNome('PASTA NOCCIOLA')).toBe('Pasta nocciola')
  })

  it('regge il vuoto e il nulla senza rompersi', () => {
    expect(formatNome('')).toBe('')
    expect(formatNome(null)).toBe('')
    expect(formatNome(undefined)).toBe('')
  })

  it('lo usano tutt’e due le pagine, non una sola', async () => {
    const fs = await import('node:fs')
    for (const f of ['src/views/RicettarioView.jsx', 'src/views/NuovaRicettaView.jsx']) {
      expect(fs.readFileSync(f, 'utf8'), f).toMatch(/formatNome/)
    }
  })
})

describe('Il pulsante che riscrive tutto non è il più invitante', () => {
  it('«Nuovo gusto» è quello pieno, «Aggiorna» quello discreto', async () => {
    const fs = await import('node:fs')
    const s = fs.readFileSync('src/views/RicettarioView.jsx', 'utf8')
    const nuova = s.slice(s.indexOf('const nuovaBtn'), s.indexOf('const nuovaBtn') + 700)
    // Si taglia dove il blocco finisce davvero: piu' in la' comincia
    // `nuovaBtn`, che il bordeaux pieno ce l'ha per scelta.
    const aggiorna = s.slice(s.indexOf('const aggiornaBtn'), s.indexOf('const nuovaBtn'))
    expect(nuova).toContain('T.brandGradient')
    // «Aggiorna ricettario» apre un Excel e riscrive tutta la raccolta:
    // il colore pieno è una promessa, e non va messo lì.
    expect(aggiorna.slice(aggiorna.indexOf('<label'))).not.toContain('T.brandGradient')
  })
})

describe('La barra che si scorre è stretta davvero', () => {
  it('la riga chiusa ha il bordo a 8, non a 14', () => {
    const { container } = apri()
    const barra = container.querySelector('[role="button"].fos-tile')
    expect(barra, 'la barra chiusa del gusto non si trova').toBeTruthy()
    expect(barra.style.padding).toMatch(/^8px/)
  })

  it('resta premibile col dito: almeno 44px', () => {
    const { container } = apri()
    const barra = container.querySelector('[role="button"].fos-tile')
    expect(barra.style.minHeight).toBe('44px')
  })

  it('il nome sta in cima, non in mezzo a due righe di servizio', () => {
    const { container } = apri()
    const barra = container.querySelector('[role="button"].fos-tile')
    const colonna = barra.querySelector('div')
    // Il primo figlio della colonna di sinistra dev'essere il nome: è la sola
    // cosa che si cerca scorrendo cinquantotto gusti.
    expect(colonna.firstElementChild.textContent).toContain('FIOR DI LATTE')
  })
})
