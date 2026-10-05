// @vitest-environment happy-dom
//
// 05/10/2026 — Il mese, gli ultimi dodici mesi: un dato che manca non è zero.
//
// Com'era: nei mesi senza incassi (o senza fatture) la colonna non c'era
// proprio, un buco vuoto che si legge «zero euro»; e il mese guardato si
// distingueva solo da un fondo grigio chiaro quasi invisibile.
// Adesso: nel posto della colonna una colonnina bassa a righe oblique
// (`data-senza-dati`), una legenda «Senza dati», e il mese guardato col
// contorno scuro.
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese } from '../../src/lib/ilMese.js'
import { mesePrima } from '../../src/lib/formatoAnalisi.js'
import { todayLocal } from '../../src/lib/dateLocal.js'

let DATI = null
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false, useDevice: () => 'computer' }))
vi.mock('../../src/lib/ilMeseArchivio', () => ({ caricaIlMese: async () => DATI }))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))
const { default: IlMeseView } = await import('../../src/views/IlMeseView.jsx')
afterEach(() => { cleanup() })

const M = mesePrima(todayLocal().slice(0, 7))
const costi = (importo) => ({
  perCategoria: [{ id: 'materie-prime', importo, fornitori: [] }], investimenti: { importo: 0 },
  daClassificare: { importo: 0, nFornitori: 0, nFatture: 0 }, copertura: { nFatture: 5, nSenzaImponibile: 0, importoIvaCompresa: 0 },
})
// ricavi/spese null = il dato non c'è
const mese = (m, { ricavi = null, spese = null } = {}) => {
  const incassi = incassiDelMese({ stima: ricavi == null ? null : { ricavi } })
  const c = spese == null ? null : costi(spese)
  const personale = personaleDelMese([{ attivo: true, stipendio_lordo_mensile: 1000 }], { mese: m })
  return { mese: m, incassi, costi: c, personale, conto: contoDelMese({ incassi, costi: c, personale }) }
}
const dodici = () => {
  const out = []
  let m = M
  for (let i = 0; i < 12; i++) { out.unshift(m); m = mesePrima(m) }
  return out
}
const conAndamento = (f) => ({
  mese: M, confronto: mesePrima(M), attuale: mese(M, { ricavi: 66000, spese: 20000 }), annoPrima: null,
  andamento: dodici().map(f), perSede: null, ultimoInventario: null, errori: [],
})
const lista = () => document.querySelector('[role="list"][aria-label="Gli ultimi dodici mesi"]')
const vuote = () => [...lista().querySelectorAll('[data-senza-dati]')]

describe('Dodici mesi: un dato che manca non è zero', () => {
  it('i mesi senza incassi hanno la colonnina a righe, non un buco', async () => {
    // I primi 9 mesi: solo fatture. Gli ultimi 3: tutto.
    DATI = conAndamento((m, i) => (i < 9 ? mese(m, { spese: 8000 }) : mese(m, { ricavi: 66000, spese: 20000 })))
    render(<IlMeseView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(lista()).toBeTruthy())
    expect(vuote().length).toBe(9)
    expect(vuote().every(v => v.getAttribute('data-senza-dati') === 'incassi')).toBe(true)
    expect(document.body.textContent).toMatch(/Senza dati/)
  })

  it('un mese senza nessun dato ha due colonnine a righe (incassi e spese)', async () => {
    DATI = conAndamento((m, i) => (i === 0 ? mese(m) : mese(m, { ricavi: 60000, spese: 18000 })))
    render(<IlMeseView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(lista()).toBeTruthy())
    expect(vuote().map(v => v.getAttribute('data-senza-dati')).sort()).toEqual(['incassi', 'spese'])
    // E il nome del mese dice che non si sa, non «0 €».
    const primo = lista().querySelector('button')
    expect(primo.getAttribute('aria-label')).toMatch(/incassi non noti, spese non note/)
  })

  it('intorno: con tutti i dati niente colonnine a righe e niente legenda «Senza dati»', async () => {
    DATI = conAndamento((m) => mese(m, { ricavi: 60000, spese: 18000 }))
    render(<IlMeseView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(lista()).toBeTruthy())
    expect(vuote().length).toBe(0)
    expect(document.body.textContent).not.toMatch(/Senza dati/)
  })

  it('il mese guardato ha il contorno scuro, gli altri no', async () => {
    DATI = conAndamento((m) => mese(m, { ricavi: 60000, spese: 18000 }))
    render(<IlMeseView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(lista()).toBeTruthy())
    const bottoni = [...lista().querySelectorAll('button')]
    const scelti = bottoni.filter(b => b.getAttribute('aria-current') === 'true')
    expect(scelti.length).toBe(1)
    expect(scelti[0]).toBe(bottoni.at(-1))
    expect(scelti[0].style.boxShadow).toMatch(/inset 0px 0px 0px 2px|inset 0 0 0 2px/)
    expect(bottoni.slice(0, -1).every(b => !/inset/.test(b.style.boxShadow))).toBe(true)
  })
})
