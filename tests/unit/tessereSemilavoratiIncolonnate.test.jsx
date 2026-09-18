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
import { render } from '@testing-library/react'
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
    const { container } = disegna()
    const posti = postiDegliAvvisi(container)
    // Tre basi × due posti: il conto non deve dipendere da quanti avvisi
    // siano effettivamente comparsi.
    expect(posti.length).toBe(6)
  })

  it('il posto dell’avviso rosso è largo uguale in tutte le tessere', () => {
    const { container } = disegna()
    const rossi = postiDegliAvvisi(container).filter(el => el.style.minWidth === '112px')
    expect(rossi.length).toBe(3)
    expect(new Set(rossi.map(el => el.style.minWidth)).size).toBe(1)
  })

  it('la tessera senza «prezzo stimato» tiene comunque il posto vuoto', () => {
    const { container } = disegna()
    const vuoti = postiDegliAvvisi(container).filter(el => el.textContent.trim() === '')
    // CREMA PASTICCERA non ha stime: il suo posto giallo dev'essere vuoto ma
    // presente. Se il difetto tornasse, quel posto sparirebbe del tutto.
    expect(vuoti.length).toBeGreaterThan(0)
  })
})

describe('La targhetta del costo è alta come i pulsanti accanto', () => {
  it('«Costo / kg» sta su una riga sola, a 40px come «Costo» e «Dove»', () => {
    const { container } = disegna()
    const targhetta = [...container.querySelectorAll('div')]
      .find(el => el.style.minWidth === '130px' && el.style.minHeight)
    expect(targhetta, 'la targhetta Costo / kg non si trova').toBeTruthy()
    expect(targhetta.style.minHeight).toBe('40px')
    // Era 56px: più alta dei pulsanti, ed era l'unica cosa in quella fila che
    // non si può nemmeno premere.
    expect(targhetta.style.minHeight).not.toBe('56px')
  })

  it('etichetta e numero stanno affiancati, non impilati', () => {
    const { container } = disegna()
    const targhetta = [...container.querySelectorAll('div')]
      .find(el => el.style.minWidth === '130px' && el.style.minHeight === '40px')
    expect(targhetta.style.flexDirection).not.toBe('column')
  })
})
