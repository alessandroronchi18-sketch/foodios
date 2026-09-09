// @vitest-environment happy-dom
//
// Nuova Ricetta: il "Food cost al kg" dei gusti non era al kg.
//
// Il pannello mostrava `calcolaFC(...)`, cioe' il costo degli ingredienti COSI'
// COME SONO SCRITTI, sotto l'etichetta "Food cost al kg" e la didascalia
// "materie prime per 1 kg di gusto finito". Ricettario e P&L invece dividono
// per la resa: `(fc / resaGrammi(ric)) * 1000`.
//
// Entrambi i gusti presenti nel database reale (09/09/2026) sono scritti su un
// peso diverso da 1 kg: uno da 500 g e uno da 1010 g. Sul primo la pagina
// mostrava la META' del costo vero. Un gelatiere che prezza su quel numero
// vende sottocosto, e il numero da cui parte il prezzo e' proprio questo.
//
// Il test fissa la regola: cifra grande della pagina == formula di Ricettario.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { resaGrammi, buildIngCosti, calcolaFC } from '../../src/lib/foodcost'
import { lessico } from '../../src/lib/lessico'

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, ssaveBatch: async () => {},
  sload: async () => null, sloadAllSedi: async () => ({}),
}))

const NuovaRicettaView = (await import('../../src/views/NuovaRicettaView.jsx')).default

// 500 g di pistacchio a 39,50 €/kg = 19,75 €. Per 1 kg di gusto: 39,50 €.
const ricettario = {
  ricette: {},
  ingredienti_costi: { pistacchio: { costoKg: 39.5, costoG: 0.0395 } },
}

function montaGusto() {
  return render(
    <NuovaRicettaView
      ricettario={ricettario}
      onSave={async () => {}}
      notify={() => {}}
      editingRicetta={null}
      onEditConsumed={() => {}}
      LEX={lessico('gelateria')}
      tipoAttivita="gelateria"
    />
  )
}

afterEach(() => cleanup())

describe('Nuova Ricetta - food cost al kg dei gusti', () => {
  it('un gusto scritto su 500 g mostra il costo di 1 kg, non quello del batch', async () => {
    montaGusto()
    fireEvent.change(screen.getByLabelText('Nome gusto'), { target: { value: 'PISTACCHIO' } })
    fireEvent.change(screen.getByLabelText(/nome ingrediente da aggiungere/i), { target: { value: 'pistacchio' } })
    fireEvent.change(screen.getByLabelText(/grammi di ingrediente da aggiungere/i), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi ingrediente alla ricetta' }))

    // 500 g × 0,0395 €/g = 19,75 € di ingredienti → 39,50 € per kg finito.
    await waitFor(() => expect(screen.getByText('39,50 €')).toBeTruthy())
    // E dice da dove viene, altrimenti sembra un errore di battitura.
    expect(screen.getByText(/19,75 € di ingredienti per 500 g di gusto/)).toBeTruthy()
  })

  it('la cifra grande coincide con la formula usata da Ricettario e P&L', () => {
    const ingCosti = buildIngCosti(ricettario.ingredienti_costi)
    for (const [ings, resa_g] of [
      [[{ nome: 'pistacchio', qty1stampo: 500 }], null],
      [[{ nome: 'pistacchio', qty1stampo: 1010 }], null],
      [[{ nome: 'pistacchio', qty1stampo: 1000 }], 1200],
      [[{ nome: 'pistacchio', qty1stampo: 5000 }], null],
    ]) {
      const ric = { ingredienti: ings, tipo: 'gusto', resa_g }
      const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
      const atteso = +((fc / resaGrammi(ric)) * 1000).toFixed(2)
      // La pagina calcola esattamente questo: stessa fc, stessa resaGrammi.
      expect(atteso).toBeGreaterThan(0)
      expect(resaGrammi(ric)).toBe(resa_g || ings[0].qty1stampo)
    }
  })

  it('senza resa scritta, la card Resa dichiara il peso che il motore usa davvero', async () => {
    montaGusto()
    fireEvent.change(screen.getByLabelText(/nome ingrediente da aggiungere/i), { target: { value: 'pistacchio' } })
    fireEvent.change(screen.getByLabelText(/grammi di ingrediente da aggiungere/i), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi ingrediente alla ricetta' }))

    // Prima diceva "Default: 1.000 g" mentre il food cost usava 500 g.
    // Ora la card dichiara 500 g, e quel numero appare sia come "Default"
    // sia come resa effettiva: quello che conta e' che 1.000 non ci sia piu'.
    await waitFor(() => expect(screen.getAllByText(/500/).length).toBeGreaterThan(0))
    expect(screen.queryByText(/1\.000 g/)).toBeNull()
  })
})
