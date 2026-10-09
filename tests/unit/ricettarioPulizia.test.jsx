// @vitest-environment happy-dom
//
// 09/10/2026 — Ricettario, la pulizia (fase 2 della pagina).
//
// Difetti misurati sulla pagina vera di Mara (63 gusti) e corretti qui:
//   · «tutte le gusti hanno costo e prezzo»: l'articolo era fisso al femminile
//     e la parola cambia con l'attività (gusti, pizze, piatti).
//   · grammi con il punto: «0.4» accanto a importi con la virgola.
//   · telefono: i bottoni della scheda erano 149x40, sotto i 44 px del dito.
//   · telefono: la tabella degli ingredienti era larga 480 su 326 visibili,
//     la colonna «Costo» finiva tagliata.
//   · l'intestazione «G / ST.» non la capisce nessuno: ora «Grammi».
// Prima di queste correzioni ognuna di queste prove falliva.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
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
const telefono = { v: false }
vi.mock('../../src/lib/useIsMobile', () => ({
  default: () => telefono.v,
  useIsTablet: () => false,
}))

const RicettarioView = (await import('../../src/views/RicettarioView.jsx')).default
const { lessico } = await import('../../src/lib/lessico')

const ricettario = {
  ricette: {
    'ABIS': {
      nome: 'ABIS', tipo: 'gusto', categoria: 'gelato', resa_g: 1000,
      ingredienti: [
        { nome: 'base bianca', qty1stampo: 999.6 },
        { nome: 'zafferano', qty1stampo: 0.4 },
      ],
    },
  },
  ingredienti_costi: {
    'base bianca': { costoKg: 2.5, costoG: 0.0025 },
    'zafferano': { costoKg: 6000, costoG: 6 },
  },
}

function monta(LEX) {
  return render(<RicettarioView ricettario={ricettario} onUpdateRegola={async () => {}} onUpload={() => {}}
    onEditRicetta={() => {}} orgId="o" sedi={[]} sedeAttiva={null} notify={() => {}} {...(LEX ? { LEX } : {})} />)
}
function apriDettaglio() {
  fireEvent.click(screen.getByText('ABIS'))
  fireEvent.click(screen.getByText('Dettaglio'))
}

beforeEach(() => { telefono.v = false })
afterEach(() => cleanup())

describe('Ricettario — pulizia', () => {
  it('nessuna frase con l’articolo sbagliato («tutte le gusti»)', () => {
    monta(lessico('gelateria'))
    expect(document.body.textContent).not.toMatch(/tutte le gusti/i)
    expect(document.body.textContent).not.toMatch(/tutte le piatti/i)
  })

  it('i grammi hanno la virgola italiana, non il punto', () => {
    monta()
    apriDettaglio()
    expect(screen.getByText('0,4')).toBeTruthy()
    expect(screen.queryByText('0.4')).toBeNull()
    expect(screen.getByText('999,6')).toBeTruthy()
  })

  it('l’intestazione dei grammi si capisce: «Grammi», non «G / ST.»', () => {
    monta()
    apriDettaglio()
    expect(screen.getByText('Grammi')).toBeTruthy()
    expect(screen.queryByText(/g \/ st/i)).toBeNull()
  })

  it('al telefono i bottoni della scheda sono alti 44 px', () => {
    telefono.v = true
    monta()
    fireEvent.click(screen.getByText('ABIS'))
    for (const nome of ['Dettaglio', 'PDF']) {
      const b = screen.getByText(nome).closest('button')
      expect(b.style.height, nome).toBe('44px')
    }
  })

  it('al telefono la tabella ingredienti sta nello schermo: senza la colonna «€ / g»', () => {
    telefono.v = true
    monta()
    apriDettaglio()
    expect(screen.queryByText('€ / g')).toBeNull()
    expect(screen.getByText('Costo')).toBeTruthy()
    const tabella = document.querySelector('table')
    expect(tabella.style.minWidth).not.toBe('480px')
  })

  it('sul computer la colonna «€ / g» resta', () => {
    monta()
    apriDettaglio()
    expect(screen.getByText('€ / g')).toBeTruthy()
  })
})
