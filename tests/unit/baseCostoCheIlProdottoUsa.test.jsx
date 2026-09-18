// @vitest-environment happy-dom
//
// ── La pagina Semilavorati mostra il costo che il prodotto usa davvero ────
//
// Il difetto, trovato il 18/09/2026 facendo girare il codice sul ricettario
// vero di Mara dei Boschi.
//
// Quando una base ha SIA una ricetta SIA un prezzo al chilo scritto a mano nel
// listino, il motore del food cost usa **il prezzo scritto a mano**: è una
// decisione del 16/09 e il motivo è solido — un prezzo scritto da chi produce
// è una misura, un calcolo su ingredienti metà dei quali non hanno prezzo è
// una stima al ribasso.
//
// La pagina Semilavorati, però, mostrava sempre il conto sugli ingredienti.
// Sui dati veri:
//
//     BASE BIANCA, in questa pagina .................... 1,22 €/kg
//     BASE BIANCA, addebitata alle 29 ricette che la usano  2,31 €/kg
//
// Chi apriva questa pagina per decidere se una base conviene farla o comprarla
// leggeva un numero che il prodotto non usa, sbagliato dell'89%. Ed è proprio
// la pagina dove quella decisione si prende.
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import SemilavoratiView from '../../src/views/SemilavoratiView.jsx'

// BASE BIANCA come nei dati veri: una ricetta incompleta (due ingredienti su
// tre senza prezzo) e un prezzo scritto a mano più alto.
const RICETTARIO = {
  ingredienti_costi: {
    'base bianca': { costoKg: 2.31, costoG: 0.00231 },
    panna: { costoKg: 4.7, costoG: 0.0047 },
  },
  ricette: {
    'BASE BIANCA': {
      nome: 'BASE BIANCA', tipo: 'semilavorato', unita: 0, prezzo: 0,
      ingredienti: [
        { nome: 'panna', qty1stampo: 10000 },
        { nome: 'zucchero di barbabietola', qty1stampo: 20000 },
        { nome: 'base mara', qty1stampo: 19850 },
      ],
    },
  },
}

// Una base senza prezzo scritto a mano: il conto sugli ingredienti resta
// quello giusto, e non deve cambiare niente.
const SENZA_PREZZO_TUO = {
  ingredienti_costi: { panna: { costoKg: 4.7, costoG: 0.0047 } },
  ricette: {
    'CREMA SEMPLICE': {
      nome: 'CREMA SEMPLICE', tipo: 'semilavorato', unita: 0, prezzo: 0,
      ingredienti: [{ nome: 'panna', qty1stampo: 1000 }],
    },
  },
}

function disegna(ricettario) {
  return render(<SemilavoratiView ricettario={ricettario} onSave={async () => {}} notify={() => {}} tipoAttivita="gelateria" />)
}

describe('Il numero mostrato è quello che il prodotto addebita', () => {
  it('con un prezzo scritto a mano, la base costa quello', () => {
    const { container } = disegna(RICETTARIO)
    expect(container.textContent).toContain('2,31')
  })

  it('e NON il conto sugli ingredienti, che era il numero sbagliato', () => {
    const { container } = disegna(RICETTARIO)
    // 47 € di panna su 49.850 g = 0,94 €/kg. Era questo che si leggeva prima.
    const barra = container.querySelector('[aria-expanded]')
    expect(barra.textContent).not.toContain('0,94')
  })

  it('senza prezzo scritto a mano vale il conto sugli ingredienti', () => {
    const { container } = disegna(SENZA_PREZZO_TUO)
    // 1.000 g di panna a 4,70 €/kg su 1.000 g di resa = 4,70 €/kg
    expect(container.textContent).toContain('4,70')
  })
})

describe('Quando i due numeri divergono, si dice', () => {
  it('aprendo la scheda si legge quanto risulterebbe dagli ingredienti', () => {
    const utils = disegna(RICETTARIO)
    fireEvent.click(utils.container.querySelector('[aria-expanded]'))
    // Vuol dire una cosa sola delle due: o il prezzo scritto è vecchio, o
    // alla ricetta della base mancano dei prezzi. Tutt'e due da sapere.
    expect(utils.container.textContent).toMatch(/dagli ingredienti risulterebbe/i)
  })

  it('quando coincidono non si dice niente: sarebbe rumore', () => {
    const coincidono = {
      ingredienti_costi: {
        panna: { costoKg: 4.7, costoG: 0.0047 },
        'crema semplice': { costoKg: 4.7, costoG: 0.0047 },
      },
      ricette: SENZA_PREZZO_TUO.ricette,
    }
    const utils = disegna(coincidono)
    fireEvent.click(utils.container.querySelector('[aria-expanded]'))
    expect(utils.container.textContent).not.toMatch(/dagli ingredienti risulterebbe/i)
  })
})
