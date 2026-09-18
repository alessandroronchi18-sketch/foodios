// @vitest-environment happy-dom
//
// ── Gli avvisi delle tessere dei semilavorati stanno incolonnati ──────────
//
// Il difetto, 17/09/2026, segnalato dal titolare guardando la pagina vera:
//
//     Base / SALSA ZABAIONE  / 2 senza prezzo / 1 prezzo stimato
//     Base / CREMA PASTICCERA / 3 senza prezzo
//     Base / CROCCANTE SESAMO / 2 senza prezzo / 3 prezzi stimati
//
//     «gli avvisi "senza prezzo" devono essere tutti incolonnati fra di loro
//      anche se non compare l'avviso "prezzo stimato"»
//
// I due avvisi stavano uno accanto all'altro in una riga che li spinge a
// destra. Dove l'avviso giallo manca — CREMA PASTICCERA — quello rosso
// scivolava a destra di tutta la larghezza di quello mancante, e mettendo le
// tessere una sotto l'altra non c'era nessun bordo comune da seguire con
// l'occhio.
//
// La correzione: ogni avviso ha un posto suo, sempre della stessa larghezza;
// se l'avviso non c'è il posto resta vuoto invece di chiudersi. È lo stesso
// rimedio già usato nella riga sotto per il peso del batch.
//
// Vale la regola generale del progetto: le scritte dei riquadri affiancati
// vanno incolonnate fra loro.
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import SemilavoratiView from '../../src/views/SemilavoratiView.jsx'

// Tre basi come quelle vere: una con entrambi gli avvisi, una col solo rosso,
// una con entrambi ma numeri diversi. È il caso che ha fatto vedere il
// difetto.
const ricettario = {
  ingredienti_costi: { ZUCCHERO: { prezzoKg: 1.2 } },
  ricette: {
    'SALSA ZABAIONE': { nome: 'SALSA ZABAIONE', tipo: 'semilavorato', unita: 0, prezzo: 0,
      ingredienti: [
        { nome: 'ZUCCHERO', qty1stampo: 500 }, { nome: 'TUORLO', qty1stampo: 300 }, { nome: 'MARSALA', qty1stampo: 850 },
      ] },
    'CREMA PASTICCERA': { nome: 'CREMA PASTICCERA', tipo: 'semilavorato', unita: 0, prezzo: 0,
      ingredienti: [
        { nome: 'LATTE', qty1stampo: 600 }, { nome: 'PANNA', qty1stampo: 300 }, { nome: 'AMIDO', qty1stampo: 200 },
      ] },
    'CROCCANTE SESAMO': { nome: 'CROCCANTE SESAMO', tipo: 'semilavorato', unita: 0, prezzo: 0,
      ingredienti: [
        { nome: 'SESAMO', qty1stampo: 800 }, { nome: 'GLUCOSIO', qty1stampo: 800 },
      ] },
  },
}

function disegna() {
  return render(<SemilavoratiView ricettario={ricettario} onSave={() => {}} notify={() => {}} tipoAttivita="gelateria" />)
}

/** 18/09/2026 — le schede delle basi adesso partono chiuse.
 *
 *  Richiesta del titolare: «in semilavorati le box bianche hanno dentro
 *  troppi dati e confusionari, rendile più pulite, intuitive ed eleganti,
 *  uguali a quelle dei gusti». Nel Ricettario le schede dei gusti erano già
 *  diventate barre che si aprono; queste erano rimaste sempre aperte, con
 *  sette informazioni per riga su dodici basi.
 *
 *  Quello che questi test proteggevano — gli avvisi incolonnati, la targhetta
 *  del costo alta come i pulsanti — vale dentro la scheda aperta, che è dove
 *  quelle cose vivono adesso. Quindi si apre, e poi si misura. */
function apriTutte(utils) {
  for (const barra of utils.container.querySelectorAll('[aria-expanded]')) {
    fireEvent.click(barra)
  }
  return utils
}

/** I contenitori degli avvisi: quelli con una larghezza minima dichiarata,
 *  che è il modo in cui il posto resta occupato anche da vuoto. */
function postiDegliAvvisi(root) {
  return [...root.querySelectorAll('span')].filter(el => {
    const m = el.style.minWidth
    return m === '112px' || m === '122px'
  })
}

describe('Gli avvisi delle tessere restano incolonnati', () => {
  it('ogni tessera ha due posti per gli avvisi, anche quando un avviso manca', () => {
    const { container } = apriTutte(disegna())
    const posti = postiDegliAvvisi(container)
    // Tre basi × due posti: il conto non deve dipendere da quanti avvisi
    // siano effettivamente comparsi.
    expect(posti.length).toBe(6)
  })

  it('il posto dell’avviso rosso è largo uguale in tutte le tessere', () => {
    const { container } = apriTutte(disegna())
    const rossi = postiDegliAvvisi(container).filter(el => el.style.minWidth === '112px')
    expect(rossi.length).toBe(3)
    expect(new Set(rossi.map(el => el.style.minWidth)).size).toBe(1)
  })

  it('la tessera senza «prezzo stimato» tiene comunque il posto vuoto', () => {
    const { container } = apriTutte(disegna())
    const vuoti = postiDegliAvvisi(container).filter(el => el.textContent.trim() === '')
    // CREMA PASTICCERA non ha stime: il suo posto giallo dev'essere vuoto ma
    // presente. Se il difetto tornasse, quel posto sparirebbe del tutto.
    expect(vuoti.length).toBeGreaterThan(0)
  })
})

describe('La targhetta del costo è alta come i pulsanti accanto', () => {
  it('«Costo / kg» sta su una riga sola, a 40px come «Costo» e «Dove»', () => {
    const { container } = apriTutte(disegna())
    const targhetta = [...container.querySelectorAll('div')]
      .find(el => el.style.minWidth === '130px' && el.style.minHeight)
    expect(targhetta, 'la targhetta Costo / kg non si trova').toBeTruthy()
    expect(targhetta.style.minHeight).toBe('40px')
    // Era 56px: più alta dei pulsanti, ed era l'unica cosa in quella fila che
    // non si può nemmeno premere.
    expect(targhetta.style.minHeight).not.toBe('56px')
  })

  it('etichetta e numero stanno affiancati, non impilati', () => {
    const { container } = apriTutte(disegna())
    const targhetta = [...container.querySelectorAll('div')]
      .find(el => el.style.minWidth === '130px' && el.style.minHeight === '40px')
    expect(targhetta.style.flexDirection).not.toBe('column')
  })
})

describe('La barra chiusa di una base dice il minimo indispensabile', () => {
  it('parte chiusa: niente pannelli aperti, niente pulsanti sparsi', () => {
    const { container } = disegna()
    // A scheda chiusa non c'è la targhetta larga del costo né il quadrato dei
    // comandi: c'è una riga con il nome, un avviso e un numero.
    const targhetta = [...container.querySelectorAll('div')].find(el => el.style.minWidth === '130px')
    expect(targhetta).toBeUndefined()
    expect(container.textContent).not.toContain('Elimina')
  })

  it('il nome sta in cima, come nelle schede dei gusti', () => {
    const { container } = disegna()
    const barra = container.querySelector('[aria-expanded]')
    expect(barra.firstElementChild.firstElementChild.textContent).toBe('SALSA ZABAIONE')
  })

  it('il costo al chilo si vede senza aprire: è il numero per cui si apre la pagina', () => {
    const { container } = disegna()
    // Cercarlo in tutta la pagina non provava niente: «Costo / kg» è anche
    // l'intestazione della tabella di riepilogo in fondo, quindi il test
    // passava pure se dalle barre fosse sparito. Si guarda dentro la barra.
    const barra = container.querySelector('[aria-expanded]')
    expect(barra.textContent).toContain('Costo / kg')
    expect(barra.textContent).toMatch(/\d+,\d{2}\s?€/)
  })

  it('il distintivo «BASE» non si ripete su ogni riga', () => {
    // In una pagina che si chiama Semilavorati, dire che ognuna è una base è
    // come mettere il cartello «libro» su ogni libro di una libreria.
    //
    // Scritto solo in negativo passava anche a pagina vuota: prima si conta
    // che le barre ci siano tutte e tre e portino il loro nome.
    const { container } = disegna()
    // Le barre si riconoscono da `aria-expanded`: contare tutti i
    // `role="button"` prendeva dentro anche le intestazioni ordinabili della
    // tabella di riepilogo, ed era un conteggio che si rompeva da solo.
    const barre = [...container.querySelectorAll('[aria-expanded]')]
    expect(barre.length).toBe(3)
    for (const b of barre) {
      expect(b.textContent.trim().length, 'barra vuota').toBeGreaterThan(10)
      expect(b.textContent).not.toMatch(/\bBase\b/)
    }
  })

  it('cliccando si apre e si vedono i comandi', () => {
    const utils = disegna()
    fireEvent.click(utils.container.querySelector('[aria-expanded]'))
    expect(utils.container.textContent).toContain('Elimina')
    expect(utils.container.textContent).toContain('Modifica')
  })

  it('i quattro comandi stanno in un quadrato, non in fila', () => {
    const utils = disegna()
    fireEvent.click(utils.container.querySelector('[aria-expanded]'))
    const quadrato = [...utils.container.querySelectorAll('div')]
      .find(el => el.style.gridTemplateColumns === '1fr 1fr' && el.textContent.includes('Elimina'))
    expect(quadrato, 'il quadrato dei comandi non si trova').toBeTruthy()
  })
})
