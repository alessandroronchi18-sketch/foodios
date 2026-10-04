// @vitest-environment happy-dom
//
// ── Una pagina sola per l'Analisi: stessa larghezza, stesso ritmo ───────
//
// Audit del design del 04/10/2026 (C10 e PR1, il decimo difetto più grave):
// ogni vista decideva da sé larghezza e spazi. «Cosa preparo domani?» era
// larga 1040 px e le sorelle 1200: passando da una pagina all'altra titolo,
// copertura e tessere saltavano di 80 px. Fra un blocco e l'altro c'erano 10,
// 12, 14, 16 o 18 px, a seconda di chi aveva scritto il `marginBottom`.
//
// Ora le quattro pagine stanno dentro `PaginaAnalisi`: 1200 px, una colonna
// con 24 px fra i riquadri (16 al telefono) e 40 fra le sezioni (32), che
// possiede il ritmo: i margini verticali dei figli diretti si azzerano.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese } from '../../src/lib/ilMese.js'
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
vi.mock('../../src/lib/inventarioProduzione', async (o) => ({ ...(await o()), caricaRigheInventario: async () => [] }))
vi.mock('../../src/lib/giorniChiusura', async (o) => ({ ...(await o()), caricaRegoleChiusura: async () => ({ ricorrenti: [], periodi: [] }) }))

const { default: PaginaAnalisi, SezioneAnalisi, REGOLA_PAGINA, CLASSE_PAGINA } = await import('../../src/components/analisi/PaginaAnalisi.jsx')
const { default: IlMeseView } = await import('../../src/views/IlMeseView.jsx')
const { default: ContoEconomicoView } = await import('../../src/views/ContoEconomicoView.jsx')
const { default: PrevisioniView } = await import('../../src/views/PrevisioniView.jsx')
const { default: ClassificaSpese } = await import('../../src/components/analisi/ClassificaSpese.jsx')

afterEach(() => { cleanup(); MOBILE = false })

const M = mesePrima(todayLocal().slice(0, 7))
const MA = annoPrima(M)
const mese = (m, ricavi) => {
  const incassi = incassiDelMese({ stima: { ricavi } })
  const c = {
    perCategoria: [{ id: 'materie-prime', importo: 15000, fornitori: [{ nome: 'DESA SRL', importo: 15000 }] }],
    investimenti: { importo: 0 }, daClassificare: { importo: 0, nFornitori: 0, nFatture: 0 },
    copertura: { nFatture: 10, nSenzaImponibile: 0, importoIvaCompresa: 0 },
  }
  const p = personaleDelMese([{ attivo: true, stipendio_lordo_mensile: 2000 }], { mese: m })
  return { mese: m, incassi, costi: c, personale: p, conto: contoDelMese({ incassi, costi: c, personale: p }) }
}
const conDati = () => ({
  mese: M, confronto: MA, attuale: mese(M, 99000), annoPrima: mese(MA, 88000),
  andamento: [mesePrima(M), M].map(m => mese(m, 90000)), perSede: null, ultimoInventario: null, errori: [],
})
const clientVuoto = { from: () => { const q = { select: () => q, eq: () => q, in: () => q, gte: () => q, lte: () => q, order: () => q, range: () => q, then: (ok) => Promise.resolve({ data: [], error: null }).then(ok) }; return q } }

const pagina = () => document.querySelector(`.${CLASSE_PAGINA}`)

describe('PaginaAnalisi (C10)', () => {
  it('1200 px al massimo, centrata, una colonna con 24 px fra i blocchi', () => {
    render(<PaginaAnalisi><div>uno</div><div>due</div></PaginaAnalisi>)
    const p = pagina()
    expect(p.style.maxWidth).toBe('1200px')
    expect(p.style.margin).toMatch(/^0(px)? auto$/)
    expect(p.style.flexDirection).toBe('column')
    expect(p.style.gap).toBe('24px')
  })

  it('al telefono 16 px fra i blocchi', () => {
    render(<PaginaAnalisi isMobile><div>uno</div></PaginaAnalisi>)
    expect(pagina().style.gap).toBe('16px')
  })

  it('possiede il ritmo: azzera i margini verticali dei figli diretti', () => {
    render(<PaginaAnalisi><header style={{ marginBottom: 14 }}>titolo</header></PaginaAnalisi>)
    expect(REGOLA_PAGINA).toBe(`.${CLASSE_PAGINA}>*{margin-top:0!important;margin-bottom:0!important}`)
    expect(pagina().querySelector('style').textContent).toBe(REGOLA_PAGINA)
  })

  it('una sezione si stacca di 40 px (24 della pagina + 16), 32 al telefono', () => {
    const { rerender } = render(<PaginaAnalisi><div>a</div><SezioneAnalisi etichetta="I negozi"><div>b</div></SezioneAnalisi></PaginaAnalisi>)
    const s = document.querySelector('section[aria-label="I negozi"]')
    expect(s.style.paddingTop).toBe('16px')
    expect(s.style.gap).toBe('24px')
    rerender(<PaginaAnalisi isMobile><div>a</div><SezioneAnalisi isMobile etichetta="I negozi"><div>b</div></SezioneAnalisi></PaginaAnalisi>)
    expect(document.querySelector('section[aria-label="I negozi"]').style.paddingTop).toBe('16px')
    expect(document.querySelector('section[aria-label="I negozi"]').style.gap).toBe('16px')
  })

  it('mentre rilegge il contenuto resta, sbiadito', () => {
    render(<PaginaAnalisi attenuata><div>x</div></PaginaAnalisi>)
    expect(pagina().style.opacity).toBe('0.6')
  })
})

describe('Le quattro pagine stanno nella stessa pagina (PR1)', () => {
  it('Previsioni: 1200 px come le sorelle, non 1040', () => {
    render(<PrevisioniView orgId="o1" sedeId="s1" sedi={[{ id: 's1', nome: 'Carlina' }]} sedeAttiva={{ id: 's1', nome: 'Carlina' }} tipoAttivita="gelateria" oggi="2026-10-03" />)
    expect(pagina()).toBeTruthy()
    expect(pagina().style.maxWidth).toBe('1200px')
  })

  it('Il mese', async () => {
    DATI = conDati()
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(document.body.textContent).toMatch(/Quanto hai guadagnato/))
    expect(pagina().style.maxWidth).toBe('1200px')
  })

  it('Il conto', async () => {
    DATI = conDati()
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(document.body.textContent).toMatch(/Materie prime/))
    expect(pagina().style.maxWidth).toBe('1200px')
  })

  it('Di che cosa sono queste spese?', async () => {
    render(<ClassificaSpese orgId="o1" client={clientVuoto} oggi={new Date('2026-10-03T10:00:00')} />)
    await waitFor(() => expect(document.body.textContent).toMatch(/Tutti i fornitori hanno la loro voce/))
    expect(pagina().style.maxWidth).toBe('1200px')
  })

  it('nessun blocco della pagina porta un margine suo (lo spazio è della pagina)', async () => {
    DATI = conDati()
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(document.body.textContent).toMatch(/Quanto hai guadagnato/))
    // L'intestazione e la copertura sono pezzi comuni che hanno ancora il
    // loro margine: lo azzera la regola della pagina.
    const comuni = (el) => el.tagName === 'HEADER' || el.getAttribute('aria-label') === 'Da dove vengono i numeri' || el.tagName === 'STYLE'
    const conMargine = [...pagina().children].filter(el => !comuni(el) && (el.style.marginBottom || el.style.marginTop))
    expect(conMargine.map(el => el.textContent.slice(0, 30))).toEqual([])
  })
})
