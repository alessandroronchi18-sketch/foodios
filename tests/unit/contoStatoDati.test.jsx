// @vitest-environment happy-dom
//
// ── Il conto dice quanto è classificato, e cosa resta prima del personale ──
//
// 05/10/2026 sera (agente conto, voto 84). Il titolare ha tolto 749 fatture
// che non sono della gelateria e ha dato la voce a una parte dei fornitori
// (119 su 316). Sui dati veri di agosto il conto diceva «Da classificare:
// 552 €» solo come riga di tabella e dentro una frase; non diceva quanto del
// totale ha la voce, né quanti fornitori mancano. In fondo la tabella finiva
// con «Personale: non lo so» e «Utile: non lo so»: un vicolo cieco, mentre
// «Il mese» dà 72.678 € «prima del personale» (lo stesso conto). I
// «Fuori dal conto» erano un numero («317 €») senza dire di chi, e le
// fatture «Fuori conto» non erano nominate.
// Qui: la riga «Con la voce / Senza voce» con «Classifica»; la riga
// «Prima del personale» uguale a quella de «Il mese»; i fuori conto detti.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese } from '../../src/lib/ilMese.js'
import { mesePrima, annoPrima } from '../../src/lib/formatoAnalisi.js'
import { todayLocal } from '../../src/lib/dateLocal.js'

let MOBILE = false
let DATI = null
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => MOBILE, useIsTablet: () => false, useDevice: () => (MOBILE ? 'telefono' : 'computer') }))
vi.mock('../../src/lib/ilMeseArchivio', () => ({ caricaIlMese: async () => DATI }))
vi.mock('../../src/lib/supabase', () => ({ supabase: { from: () => { throw new Error('niente rete nelle prove') } } }))

const { default: ContoEconomicoView, statoClassificazione } = await import('../../src/views/ContoEconomicoView.jsx')
const { default: IlMeseView } = await import('../../src/views/IlMeseView.jsx')

afterEach(() => { cleanup(); MOBILE = false })
const testo = () => document.body.textContent || ''
const M = mesePrima(todayLocal().slice(0, 7))

const costi = ({ dc = 552, mp = 48145, invest = null, esclusi = null } = {}) => ({
  perCategoria: [{ id: 'materie-prime', importo: mp, fornitori: [{ nome: 'DESA SRL', importo: mp }] }],
  investimenti: invest || { importo: 0, nFatture: 0, fatture: [] },
  esclusi: esclusi || { importo: 0, nFatture: 0 },
  daClassificare: { importo: dc, nFornitori: dc ? 12 : 0, nFatture: dc ? 20 : 0, fornitori: dc ? [{ nome: 'GECKO', importo: dc }] : [] },
  copertura: { nFatture: 10, nSenzaImponibile: 0, importoIvaCompresa: 0 },
})
const mese = (m, c, conPersonale = false) => {
  const incassi = incassiDelMese({ stima: { ricavi: 121375 } })
  const p = personaleDelMese(conPersonale ? [{ attivo: true, stipendio_lordo_mensile: 2000 }] : [], { mese: m })
  return { mese: m, incassi, costi: c, personale: p, conto: contoDelMese({ incassi, costi: c, personale: p }) }
}
const dati = (c, conPersonale = false) => ({
  mese: M, confronto: annoPrima(M), attuale: mese(M, c, conPersonale), annoPrima: mese(annoPrima(M), costi({ dc: 0, mp: 30000 }), conPersonale),
  andamento: [mese(M, c, conPersonale)], perSede: null, ultimoInventario: null, errori: [],
})
const euroIt = (n) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`
const attendi = (sel) => waitFor(() => { const e = document.querySelector(sel); expect(e).toBeTruthy(); return e })

describe('quanto è classificato', () => {
  it('dice quanto ha la voce, quanto no e di quanti fornitori, con «Classifica»', async () => {
    DATI = dati(costi())
    render(<ContoEconomicoView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    const el = await attendi('[data-classificazione]')
    expect(el.textContent).toMatch(/Con la voce/)
    expect(el.textContent).toMatch(/48\.145 €/)
    expect(el.textContent).toMatch(/98,9%/)
    expect(el.textContent).toMatch(/Senza voce/)
    expect(el.textContent).toMatch(/552 € di 12 fornitori/)
    const b = [...el.querySelectorAll('button')].find(x => x.textContent === 'Classifica')
    expect(b).toBeTruthy()
    await act(async () => { fireEvent.click(b) })
    await waitFor(() => expect(testo()).toMatch(/Di che cosa sono queste spese/))
  })

  it('tutto con la voce: lo dice, senza pulsante (intorno)', async () => {
    DATI = dati(costi({ dc: 0 }))
    render(<ContoEconomicoView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    const el = await attendi('[data-classificazione]')
    expect(el.textContent).toMatch(/Tutte le spese hanno la voce/)
    expect(el.querySelectorAll('button').length).toBe(0)
  })

  it('fatture non lette: niente riga e niente numeri inventati (intorno)', async () => {
    DATI = dati(null)
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Dove sono andati i soldi/))
    expect(document.querySelector('[data-classificazione]')).toBeNull()
    expect(statoClassificazione({ speseFatture: null, daClassificare: null }, null)).toBeNull()
  })

  it('al telefono la riga c\'è e il pulsante è da 44 px', async () => {
    MOBILE = true
    DATI = dati(costi())
    render(<ContoEconomicoView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    const el = await attendi('[data-classificazione]')
    const b = [...el.querySelectorAll('button')].find(x => x.textContent === 'Classifica')
    expect(parseInt(b.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
  })
})

describe('prima del personale, lo stesso numero de «Il mese»', () => {
  it('senza personale il conto dà la riga «Prima del personale», uguale a Il mese', async () => {
    DATI = dati(costi())
    const atteso = euroIt(DATI.attuale.conto.primaDelPersonale)
    expect(DATI.attuale.conto.primaDelPersonale).toBeCloseTo(DATI.attuale.conto.ricavi - 48697, 1)
    render(<ContoEconomicoView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    const riga = await waitFor(() => { const r = [...document.querySelectorAll('tbody tr')].find(x => /Prima del personale/.test(x.textContent)); expect(r).toBeTruthy(); return r })
    expect(riga.textContent).toContain(atteso.replace(' €', ''))
    expect(testo()).toContain(`Restano ${atteso} prima del personale`)
    cleanup()
    render(<IlMeseView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(testo()).toContain(atteso))
  })

  it('col personale non c\'è la riga: c\'è l\'utile (intorno)', async () => {
    DATI = dati(costi(), true)
    render(<ContoEconomicoView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect([...document.querySelectorAll('tbody tr')].some(x => /^Utile/.test(x.textContent))).toBe(true))
    expect([...document.querySelectorAll('tbody tr')].some(x => /Prima del personale/.test(x.textContent))).toBe(false)
  })

  it('al telefono la scheda c\'è', async () => {
    MOBILE = true
    DATI = dati(costi())
    render(<ContoEconomicoView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect([...document.querySelectorAll('[aria-label="Il conto voce per voce"] > li')].some(li => /Prima del personale/.test(li.textContent))).toBe(true))
  })
})

describe('fuori dal conto, detto', () => {
  it('gli investimenti col nome del fornitore e le fatture «Fuori conto» contate', async () => {
    DATI = dati(costi({
      invest: { importo: 86651, nFatture: 1, fatture: [{ fornitore: 'GECKO SRL', importo: 86651, data: `${M}-12` }] },
      esclusi: { importo: 5000, nFatture: 7 },
    }))
    render(<ContoEconomicoView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    const el = await attendi('[data-fuori-conto]')
    expect(el.textContent).toMatch(/GECKO SRL/)
    expect(el.textContent).toMatch(/86\.651 €/)
    expect(el.textContent).toMatch(/7 fatture/)
    expect(el.textContent).toMatch(/non sono della gelateria/i)
  })

  it('niente investimenti e niente esclusi: nessuna riga (intorno)', async () => {
    DATI = dati(costi())
    render(<ContoEconomicoView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(testo()).toMatch(/Dove sono andati/))
    expect(document.querySelector('[data-fuori-conto]')).toBeNull()
  })
})
