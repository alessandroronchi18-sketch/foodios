// @vitest-environment happy-dom
//
// 09/10/2026 — Ricettario: margine e food cost dei gusti con l'IVA dentro.
//
// I formati di vendita (cono, coppetta, vaschetta) hanno il prezzo CON l'IVA,
// quello che paga il cliente. Il Ricettario lo usava così com'era (29,49 €/kg)
// per contare il ricavo del gusto. La pagina Food cost e Il mese lo contano
// SENZA IVA (26,81 €/kg: 29,49 / 1,10). Stesso gusto, due numeri: per ABIS,
// 12,8% di food cost qui contro 14,1% là. Chi controlla il Ricettario contro
// Food cost vede due verità.
//
// La prova: per un gusto il ricavo e il food cost del Ricettario sono quelli
// calcolati da `righeFoodCostGusti` (la funzione di Food cost) sul prezzo netto.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { buildIngCosti } from '../../src/lib/foodcost'
import { righeFoodCostGusti } from '../../src/lib/foodCostGusti'
import { prezzoNetto } from '../../src/views/produzione/numeri'

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, ssaveBatch: async () => {},
  sload: async () => null, sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/listinoSede', async (orig) => {
  const vero = await orig()
  return { ...vero, useListinoSede: () => ({ listino: null, salva: async () => {} }) }
})
const PREZZO_CON_IVA = 29.49
vi.mock('../../src/lib/useRicavoFlat', () => ({
  useRicavoFlat: () => ({
    formati: [], byCategoria: {},
    ricavoFlatFor: () => 29.49,
    ricavoEffettivo: () => 0,
  }),
}))

const RicettarioView = (await import('../../src/views/RicettarioView.jsx')).default

const ricettario = {
  ricette: {
    'ABIS': {
      nome: 'ABIS', tipo: 'gusto', categoria: 'gelato', resa_g: 1000,
      ingredienti: [
        { nome: 'base bianca', qty1stampo: 600 },
        { nome: 'pasta abis', qty1stampo: 400 },
      ],
    },
  },
  ingredienti_costi: {
    'base bianca': { costoKg: 2.5, costoG: 0.0025 },
    'pasta abis': { costoKg: 6.6, costoG: 0.0066 },
  },
}

afterEach(() => cleanup())

describe('Ricettario — i gusti contano il ricavo senza IVA', () => {
  it('la tessera Food cost medio usa il prezzo senza IVA (15,4%, non 14,0%)', () => {
    render(<RicettarioView ricettario={ricettario} onUpdateRegola={async () => {}} onUpload={() => {}}
      onEditRicetta={() => {}} orgId="o" sedi={[]} sedeAttiva={null} notify={() => {}} />)
    // costo 4,14 €/kg: su 26,81 €/kg (netto) = 15,4%; su 29,49 (con IVA) = 14,0%
    expect(screen.getByText('15,4%')).toBeTruthy()
    expect(screen.queryByText('14,0%')).toBeNull()
  })

  it('il food cost in % è quello di Food cost per lo stesso gusto', () => {
    const netto = prezzoNetto(PREZZO_CON_IVA)
    const riga = righeFoodCostGusti(ricettario, buildIngCosti(ricettario.ingredienti_costi), netto)[0]
    const conIva = righeFoodCostGusti(ricettario, buildIngCosti(ricettario.ingredienti_costi), PREZZO_CON_IVA)[0]
    expect(riga.quota).not.toBeCloseTo(conIva.quota, 1)
    render(<RicettarioView ricettario={ricettario} onUpdateRegola={async () => {}} onUpload={() => {}}
      onEditRicetta={() => {}} orgId="o" sedi={[]} sedeAttiva={null} notify={() => {}} />)
    // la riga chiusa mostra il margine intero (85%), non 85,0%
    const margine = `${Math.round(100 - riga.quota)}%`
    expect(screen.getAllByText(margine).length).toBeGreaterThan(0)
  })

  it('la spiegazione del conto al kg dice che il prezzo è senza IVA', () => {
    // Il numero accanto è 26,81 €/kg mentre i formati dicono 29,49: senza la
    // parola, chi confronta col listino crede a un errore.
    render(<RicettarioView ricettario={ricettario} onUpdateRegola={async () => {}} onUpload={() => {}}
      onEditRicetta={() => {}} orgId="o" sedi={[]} sedeAttiva={null} notify={() => {}} />)
    fireEvent.click(screen.getByText('ABIS'))
    fireEvent.click(screen.getByText('Dettaglio'))
    fireEvent.click(screen.getByText('Conto al kg'))
    expect(document.body.textContent).toMatch(/Ricavo\/kg = prezzo medio dei Formati vendita della categoria .gelato., senza IVA/)
  })
})
