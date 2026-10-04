// @vitest-environment happy-dom
//
// ── Gli incassi si chiamano allo stesso modo in tutte le pagine ─────────
//
// Audit del design del 04/10/2026 (§7, coerenza fra le pagine): lo stesso
// numero aveva tre nomi. Nella tessera de «Il mese» «Incassi senza IVA», nella
// cascata e nei negozi «Incassi stimati», nel Conto «Incassi (stimati)». Chi
// passa da una pagina all'altra si chiede se siano tre cose diverse.
//
// Ora il nome è uno, deciso da `nomeIncassi` (lib/ilMese.js): «Incassi
// stimati» quando vengono dall'inventario, «Incassi» quando vengono dalla
// cassa. «Senza IVA» lo dice la riga sotto il numero, una volta.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese, nomeIncassi, causeDelCambio } from '../../src/lib/ilMese.js'
import { mesePrima, annoPrima } from '../../src/lib/formatoAnalisi.js'
import { todayLocal } from '../../src/lib/dateLocal.js'

let MOBILE = false
let DATI = null
vi.mock('../../src/lib/useIsMobile', () => ({
  default: () => MOBILE, useIsTablet: () => false,
  useDevice: () => (MOBILE ? 'telefono' : 'computer'),
}))
vi.mock('../../src/lib/ilMeseArchivio', () => ({ caricaIlMese: async () => DATI }))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))

const { default: IlMeseView } = await import('../../src/views/IlMeseView.jsx')
const { default: ContoEconomicoView } = await import('../../src/views/ContoEconomicoView.jsx')

afterEach(() => { cleanup(); MOBILE = false })
const testo = () => document.body.textContent || ''

const M = mesePrima(todayLocal().slice(0, 7))
const costi = {
  perCategoria: [{ id: 'materie-prime', importo: 15000, fornitori: [{ nome: 'DESA SRL', importo: 15000 }] }],
  investimenti: { importo: 0 }, daClassificare: { importo: 0, nFornitori: 0, nFatture: 0 },
  copertura: { nFatture: 10, nSenzaImponibile: 0, importoIvaCompresa: 0 },
}
const mese = (m, { stima = true } = {}) => {
  const incassi = incassiDelMese(stima ? { stima: { ricavi: 99000 } } : { cassa: { totV: 99000, giorni: 30 }, giorniDelMese: 30 })
  const p = personaleDelMese([{ attivo: true, stipendio_lordo_mensile: 2000 }], { mese: m })
  return { mese: m, incassi, costi, personale: p, conto: contoDelMese({ incassi, costi, personale: p }) }
}
const sede = (id, nome, opz) => ({ sede: { id, nome }, ...mese(M, opz) })
const conDati = (opz) => ({
  mese: M, confronto: annoPrima(M), attuale: mese(M, opz), annoPrima: mese(annoPrima(M), opz),
  andamento: [M].map(m => mese(m, opz)),
  perSede: { a: sede('a', 'Carlina', opz), b: sede('b', 'Berthollet', opz) },
  ultimoInventario: null, errori: [],
})
const VECCHI = /Incassi \(stimati\)|Incassi senza IVA(?! al)/

describe('nomeIncassi', () => {
  it('«Incassi stimati» dall\'inventario, «Incassi» dalla cassa', () => {
    expect(nomeIncassi(true)).toBe('Incassi stimati')
    expect(nomeIncassi(false)).toBe('Incassi')
  })
  it('anche la causa del cambio porta lo stesso nome', () => {
    const a = mese(M).conto, b = { ...mese(annoPrima(M)).conto, ricavi: 50000 }
    expect(causeDelCambio(a, b).find(c => c.chiave === 'incassi').etichetta).toBe('Incassi stimati')
  })
})

describe('Le pagine usano quel nome (audit 04/10, §7)', () => {
  it('«Il mese»: tessera, cascata e negozi dicono «Incassi stimati»; «senza IVA» sta sotto il numero', async () => {
    DATI = conDati()
    render(<IlMeseView orgId="o1" sedi={[{ id: 'a', nome: 'Carlina' }, { id: 'b', nome: 'Berthollet' }]} />)
    await waitFor(() => expect(testo()).toMatch(/Quanto hai guadagnato/))
    expect(testo()).not.toMatch(VECCHI)
    expect(testo().match(/Incassi stimati/g).length).toBeGreaterThanOrEqual(4) // tessera, cascata, due negozi
    expect(testo()).toMatch(/dall'inventario, senza IVA/)
  })

  it('il Conto, al computer: la prima riga si chiama «Incassi stimati»', async () => {
    DATI = conDati()
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(document.querySelector('tbody tr')).toBeTruthy())
    expect(document.querySelector('tbody tr').textContent).toMatch(/^Incassi stimati/)
    expect(testo()).not.toMatch(VECCHI)
  })

  it('il Conto, al telefono: la prima scheda pure', async () => {
    MOBILE = true
    DATI = conDati()
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(document.querySelector('[aria-label="Il conto voce per voce"] > li')).toBeTruthy())
    expect(document.querySelector('[aria-label="Il conto voce per voce"] > li').textContent).toMatch(/^Incassi stimati/)
  })

  it('con la cassa si chiamano «Incassi», senza «stimati», dappertutto', async () => {
    DATI = conDati({ stima: false })
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Quanto hai guadagnato/))
    expect(testo()).not.toMatch(/Incassi stimati|stimat[oi] dall/)
    expect(testo()).toMatch(/dalla cassa, senza IVA/)
  })
})
