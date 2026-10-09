// @vitest-environment happy-dom
//
// 09/10/2026 — Ricettario: le tre tessere diventano una riga di stato.
//
// In cima alla pagina tre tessere alte 194 px dicevano «63», «12,8%» e «—»:
// mezzo schermo per tre numeri, e il primo gusto spinto sotto la prima
// schermata. Ora è una riga sola con gli stessi tre numeri e la frase che
// spiega solo quando serve. Il food cost resta verde sotto il 30%.
// Prima di questa correzione non esisteva nessun gruppo «Stato del ricettario».

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, within } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, ssaveBatch: async () => {},
  sload: async () => null, sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/listinoSede', async (orig) => {
  const vero = await orig()
  return { ...vero, useListinoSede: () => ({ listino: null, salva: async () => {} }) }
})
vi.mock('../../src/lib/useRicavoFlat', () => ({
  useRicavoFlat: () => ({ formati: [], byCategoria: {}, ricavoFlatFor: () => 29.49, ricavoEffettivo: () => 0 }),
}))

const { default: RicettarioView } = await import('../../src/views/RicettarioView.jsx')

const ricettario = {
  ricette: {
    ABIS: { nome: 'ABIS', tipo: 'gusto', categoria: 'gelato', resa_g: 1000, ingredienti: [{ nome: 'base', qty1stampo: 1000 }] },
    NOCE: { nome: 'NOCE', tipo: 'gusto', categoria: 'gelato', resa_g: 1000, ingredienti: [{ nome: 'base', qty1stampo: 1000 }, { nome: 'noce', qty1stampo: 100 }] },
  },
  ingredienti_costi: { base: { costoKg: 3, costoG: 0.003 } },
}
const monta = () => render(<RicettarioView ricettario={ricettario} onUpdateRegola={async () => {}} onUpload={() => {}}
  onEditRicetta={() => {}} onNuovaRicetta={() => {}} orgId="o" sedi={[]} sedeAttiva={null} notify={() => {}} />)

afterEach(() => cleanup())

describe('Ricettario — riga di stato', () => {
  it('è un gruppo solo con i tre numeri: ricette, food cost medio, da completare', () => {
    monta()
    const riga = screen.getByRole('group', { name: 'Stato del ricettario' })
    const t = within(riga)
    expect(t.getByText('ricette')).toBeTruthy()
    expect(t.getByText('Food cost medio')).toBeTruthy()
    expect(t.getByText('Da completare')).toBeTruthy()
    expect(t.getByText('2')).toBeTruthy()
  })

  it('il food cost medio è una percentuale con un decimale', () => {
    monta()
    const riga = screen.getByRole('group', { name: 'Stato del ricettario' })
    // 3 €/kg su 26,81 €/kg senza IVA: 11,2%. NOCE non entra (costo incompleto).
    expect(within(riga).getByText('11,2%')).toBeTruthy()
  })

  it('la frase sotto dice su quante ricette è calcolato e cosa manca', () => {
    monta()
    const riga = screen.getByRole('group', { name: 'Stato del ricettario' })
    expect(riga.textContent).toMatch(/Food cost medio su 1 ricetta di 2/)
    expect(riga.textContent).toMatch(/1 senza il prezzo di un ingrediente/)
  })

  it('non ci sono più le tre tessere grandi', () => {
    monta()
    expect(document.querySelectorAll('.fos-kpi-tile').length).toBe(0)
  })
})
