// @vitest-environment happy-dom
//
// Food cost dei gusti: il prezzo al chilo è una stima, e un simulatore dei
// formati per provare i prezzi (05/10/2026).
//
// Due cose aperte dopo il rifacimento della pagina sui gusti di Mara dei
// Boschi (63 gusti, prezzo medio dei formati 29,49 €/kg, 26,81 senza IVA):
//
// 1. Il prezzo al chilo è la media dei formati pesata sui grammi, come se se
//    ne vendesse uno di ciascuno. Quante coppette contro quante vaschette si
//    vendono davvero non è nei dati. Il numero stava lì nudo, come se fosse
//    il prezzo vero. Ora accanto c'è detto che è una stima e quanto può
//    spostarsi: dai formati veri di Mara va da 25,45 a 31,82 €/kg senza IVA
//    (vaschetta da un chilo contro cono piccolo).
// 2. Mancava «se porto la coppetta da 3,30 a 3,50 €, cosa cambia». Ora un
//    controllo per formato, il prezzo medio ricalcolato con la stessa
//    funzione (`prezzoMedioAlKg`), la tabella dei gusti che si aggiorna, e
//    «Rimetti i prezzi veri». È una prova: non salva niente.

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, within } from '@testing-library/react'

vi.mock('../../src/lib/supabase', () => {
  const RES = { data: [], error: null }
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(RES)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return { supabase: { from: () => new Proxy({}, h), rpc: () => Promise.resolve({ data: null, error: null }) } }
})
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false, useDevice: () => 'computer' }))

// Coppetta 100 g a 3,30 € (33 €/kg) e vaschetta 1 kg a 28 €: media pesata
// 31,30 / 1,1 kg = 28,4545 €/kg al banco, 25,8678 senza IVA al 10%.
const FORMATI_BASE = [
  { id: 'f1', nome: 'Coppetta', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3.3, componenti: [] },
  { id: 'f2', nome: 'Vaschetta 1 kg', categoria: 'Gusto', baseQtaG: 1000, prezzoDefault: 28, componenti: [] },
]
let FORMATI = FORMATI_BASE
const ssave = vi.fn(async () => {})
vi.mock('../../src/lib/storage', () => ({
  sload: async (k) => (k === 'pasticceria-formati-vendita-v1' ? FORMATI : null),
  ssave: (...a) => ssave(...a), ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { default: SimulatorePrezziView } = await import('../../src/views/SimulatorePrezziView.jsx')
const { intervalloPrezzoKg, prezzoKgInProva, formatiDelPrezzo } = await import('../../src/lib/foodCostGusti.js')
const { prezzoMedioAlKg } = await import('../../src/lib/prezzoMedioAlKg.js')

afterEach(() => { cleanup(); FORMATI = FORMATI_BASE; ssave.mockClear() })
const testo = () => document.body.textContent || ''

const COSTI = {
  'latte prova': { costoKg: 1, costoG: 0.001 },
  'nocciola prova': { costoKg: 20, costoG: 0.02 },
}
const gusto = (nome, ingredienti) => ({ nome, tipo: 'gusto', ingredienti })
// NOCCIOLA: 8,80 € per 1.200 g = 7,3333 €/kg. FIORDILATTE: 1,00 €/kg.
const RIC = { ricette: {
  NOCCIOLA: gusto('NOCCIOLA', [{ nome: 'latte prova', qty1stampo: 800 }, { nome: 'nocciola prova', qty1stampo: 400 }]),
  FIORDILATTE: gusto('FIORDILATTE', [{ nome: 'latte prova', qty1stampo: 1000 }]),
}, ingredienti_costi: COSTI }
const disegna = () => render(<SimulatorePrezziView ricettario={RIC} giornaliero={[]} tipoAttivita="gelateria" orgId="o1" sedeId={null} />)
const apriProva = async () => {
  await screen.findByRole('table', { name: /Food cost dei gusti/ })
  fireEvent.click(screen.getByRole('button', { name: /Prova i prezzi dei formati/ }))
}
const riga = (nome) => within(screen.getByRole('table', { name: /Food cost dei gusti/ })).getByText(nome).closest('tr')

describe('il prezzo al chilo è una stima e lo dice', () => {
  it('accanto al prezzo medio dice che non si sa il mix e quanto può spostarsi', async () => {
    disegna()
    await screen.findByRole('table', { name: /Food cost dei gusti/ })
    expect(testo()).toMatch(/È una stima/)
    expect(testo()).toMatch(/quanti pezzi vendi di ogni formato/)
    // Dai formati: 28 €/kg (vaschetta) a 33 €/kg (coppetta), senza IVA.
    expect(testo()).toMatch(/da 25,45 a 30,00 € al chilo/)
  })

  it('un formato solo: niente intervallo inventato, la stima resta', async () => {
    FORMATI = [FORMATI_BASE[0]]
    disegna()
    await screen.findByRole('table', { name: /Food cost dei gusti/ })
    expect(testo()).not.toMatch(/da \d+,\d+ a \d+,\d+ € al chilo/)
  })

  it('intervalloPrezzoKg: senza IVA, solo i formati che entrano nella media', () => {
    const i = intervalloPrezzoKg([...FORMATI_BASE, { nome: 'Tessera', baseQtaG: 0, prezzoDefault: 10 }, { nome: 'Omaggio', baseQtaG: 100, prezzoDefault: 0 }])
    expect(i.min).toBeCloseTo(28 / 1.1, 6)
    expect(i.max).toBeCloseTo(33 / 1.1, 6)
    expect(intervalloPrezzoKg([FORMATI_BASE[0]])).toBeNull()
    expect(intervalloPrezzoKg([])).toBeNull()
    expect(intervalloPrezzoKg(null)).toBeNull()
  })
})

describe('il simulatore dei formati', () => {
  it('all\'arrivo è chiuso: i controlli stanno dietro un tocco', async () => {
    disegna()
    await screen.findByRole('table', { name: /Food cost dei gusti/ })
    expect(screen.queryByLabelText(/Prezzo Coppetta/)).toBeNull()
    expect(screen.getByRole('button', { name: /Prova i prezzi dei formati/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('coppetta da 3,30 a 3,50: il prezzo medio e la tabella si ricalcolano', async () => {
    disegna()
    await apriProva()
    expect(testo()).toMatch(/25,87 €/) // prima: (31,3 / 1,1) / 1,1
    fireEvent.change(screen.getByLabelText(/Prezzo Coppetta/), { target: { value: '3,50' } })
    // 31,5 / 1,1 kg = 28,6364 al banco, 26,0331 senza IVA
    expect(testo()).toMatch(/26,03 €/)
    // NOCCIOLA: 7,3333 / 26,0331 = 28,2% (prima 7,3333 / 25,8678 = 28,3%)
    expect(riga('NOCCIOLA').textContent).toMatch(/28,2%/)
    expect(riga('NOCCIOLA').textContent).toMatch(/18,70/) // margine 26,0331 - 7,3333
    expect(riga('NOCCIOLA').textContent).toMatch(/28,2%.*28,3%/)
  })

  it('il prezzo ricalcolato è quello di prezzoMedioAlKg, la stessa funzione', () => {
    const prove = { f1: 3.5 }
    const atteso = prezzoMedioAlKg(formatiDelPrezzo(FORMATI_BASE, prove)) / 1.1
    expect(prezzoKgInProva(FORMATI_BASE, prove)).toBeCloseTo(atteso, 9)
    expect(prezzoKgInProva(FORMATI_BASE, {})).toBeCloseTo(prezzoMedioAlKg(FORMATI_BASE) / 1.1, 9)
  })

  it('dice che è una prova, non salva niente, e rimanda al Listino', async () => {
    disegna()
    await apriProva()
    fireEvent.change(screen.getByLabelText(/Prezzo Coppetta/), { target: { value: '3,50' } })
    expect(testo()).toMatch(/È una prova: non cambia il listino/)
    expect(testo()).toMatch(/Il listino vero si cambia in Listino/)
    expect(ssave).not.toHaveBeenCalled()
  })

  it('«Rimetti i prezzi veri» riporta tutto com\'era', async () => {
    disegna()
    await apriProva()
    const prima = riga('NOCCIOLA').textContent
    fireEvent.change(screen.getByLabelText(/Prezzo Coppetta/), { target: { value: '5' } })
    expect(riga('NOCCIOLA').textContent).not.toBe(prima)
    fireEvent.click(screen.getByRole('button', { name: /Rimetti i prezzi veri/ }))
    expect(riga('NOCCIOLA').textContent).toBe(prima)
    expect(screen.getByLabelText(/Prezzo Coppetta/).value).toBe('3,30')
    expect(testo()).not.toMatch(/È una prova/)
  })

  it('un campo vuoto o storto non diventa zero: vale il prezzo vero', async () => {
    disegna()
    await apriProva()
    const prima = riga('NOCCIOLA').textContent
    for (const v of ['', 'abc', '0', '-2']) {
      fireEvent.change(screen.getByLabelText(/Prezzo Coppetta/), { target: { value: v } })
      expect(riga('NOCCIOLA').textContent).toBe(prima)
    }
  })

  it('un prezzo uguale a quello vero non è una prova', async () => {
    disegna()
    await apriProva()
    fireEvent.change(screen.getByLabelText(/Prezzo Coppetta/), { target: { value: '3,3' } })
    expect(testo()).not.toMatch(/È una prova/)
    expect(screen.queryByRole('button', { name: /Rimetti i prezzi veri/ })).toBeNull()
  })

  it('senza formati non c\'è simulatore e niente numeri inventati', async () => {
    FORMATI = []
    disegna()
    await screen.findByRole('table', { name: /Food cost dei gusti/ })
    expect(screen.queryByRole('button', { name: /Prova i prezzi dei formati/ })).toBeNull()
  })
})
