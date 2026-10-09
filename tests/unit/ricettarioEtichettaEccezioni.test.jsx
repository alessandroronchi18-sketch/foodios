// @vitest-environment happy-dom
//
// 09/10/2026 — Ricettario: l'etichetta di qualità solo per le eccezioni.
//
// Sui 63 gusti veri di Mara tutti e 63 dicevano «Eccellente» (margine fra
// 76,3% e 96,7%): una parola ripetuta 63 volte nasconde quella che serve. Ora
// la riga tace quando va bene e scrive solo «Da completare» (manca il prezzo)
// o «Basso» (margine sotto il 55%). Prima di questa correzione ogni gusto
// con margine buono portava «Eccellente» o «Buono».

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, ssaveBatch: async () => {},
  sload: async () => null, sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/listinoSede', async (orig) => {
  const vero = await orig()
  return { ...vero, useListinoSede: () => ({ listino: null, salva: async () => {} }) }
})
const flat = { v: 29.49 }
vi.mock('../../src/lib/useRicavoFlat', () => ({
  useRicavoFlat: () => ({ formati: [], byCategoria: {}, ricavoFlatFor: () => flat.v, ricavoEffettivo: () => 0 }),
}))

const { default: RicettarioView, etichettaEccezione } = await import('../../src/views/RicettarioView.jsx')

const gusto = (nome, kgBase, costoKg) => ({
  nome, tipo: 'gusto', categoria: 'gelato', resa_g: 1000,
  ingredienti: [{ nome: `ing ${nome}`, qty1stampo: kgBase }],
  _c: costoKg,
})
const ricettario = {
  ricette: {
    OTTIMO: gusto('OTTIMO', 1000, 3),    // costo 3 €/kg su 26,81: margine 89%
    BUONO: gusto('BUONO', 1000, 10),     // 63%
    SCARSO: gusto('SCARSO', 1000, 14),   // 48%
    PERSO: gusto('PERSO', 1000, 20),     // 25%
  },
  ingredienti_costi: {
    'ing ottimo': { costoKg: 3, costoG: 0.003 }, 'ing buono': { costoKg: 10, costoG: 0.01 },
    'ing scarso': { costoKg: 14, costoG: 0.014 }, 'ing perso': { costoKg: 20, costoG: 0.02 },
  },
}
const monta = () => render(<RicettarioView ricettario={ricettario} onUpdateRegola={async () => {}} onUpload={() => {}}
  onEditRicetta={() => {}} orgId="o" sedi={[]} sedeAttiva={null} notify={() => {}} />)

afterEach(() => cleanup())

describe('etichettaEccezione', () => {
  it('tace quando va bene', () => {
    expect(etichettaEccezione(96.7)).toBeNull()
    expect(etichettaEccezione(76)).toBeNull()
    expect(etichettaEccezione(55)).toBeNull()
  })
  it('Basso sotto il 55% (rosso sotto il 40%)', () => {
    expect(etichettaEccezione(54.9)).toEqual({ label: 'Basso', color: 'amber' })
    expect(etichettaEccezione(25)).toEqual({ label: 'Basso', color: 'red' })
  })
  it('senza prezzo di vendita: Da completare', () => {
    expect(etichettaEccezione(0, true)).toEqual({ label: 'Da completare', color: 'gray' })
  })
})

describe('Ricettario — le etichette nella pagina', () => {
  it('nessun «Eccellente» o «Buono» ripetuto', () => {
    monta()
    expect(screen.queryAllByText('Eccellente')).toHaveLength(0)
    expect(screen.queryAllByText('Buono')).toHaveLength(0)
  })
  it('«Basso» compare solo sui due gusti con margine sotto il 55%', () => {
    monta()
    expect(screen.getAllByText('Basso')).toHaveLength(2)
  })
  it('un gusto senza formati di vendita è «Da completare», non «Basso»', () => {
    flat.v = 0
    monta()
    expect(screen.queryAllByText('Basso')).toHaveLength(0)
    expect(screen.getAllByText('Da completare').length).toBeGreaterThan(0)
    flat.v = 29.49
  })
})
