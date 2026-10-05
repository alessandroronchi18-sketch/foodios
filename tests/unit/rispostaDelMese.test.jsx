// @vitest-environment happy-dom
//
// ── «Il mese»: la risposta è la cosa più grande della pagina ────────────
//
// Audit del design del 04/10/2026 (IM3, il quinto difetto più grave): la
// domanda è «Quanto hai guadagnato ad agosto?», e la tessera della risposta
// mostrava «Non posso dirtelo: manca il personale» in grigio, mentre le
// tessere accanto avevano numeri neri. Il numero che si sa, 74.057 € rimasti
// prima del personale, stava nella riga piccola da 12 px. Dopo l'unione dei
// pezzi comuni la frase era diventata grande: la cosa più grande della pagina
// era ancora un «non posso».
//
// Ora la risposta è `NumeroPrincipale`, una sola per pagina, 48 px: l'utile
// se si sa; se manca il personale, il numero che si sa («Rimasti prima del
// personale», 74.057 €) con sotto, in ambra, perché l'utile vero sarà più
// basso e il passaggio per sistemarlo. Incassi e spese sono un gradino sotto,
// in una fila di tessere incolonnate (`FilaTessere`).
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese } from '../../src/lib/ilMese.js'
import { mesePrima, annoPrima, nomeMese, aMese } from '../../src/lib/formatoAnalisi.js'
import { todayLocal } from '../../src/lib/dateLocal.js'

let DATI = null
let MOBILE = false
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => MOBILE, useIsTablet: () => false, useDevice: () => (MOBILE ? 'telefono' : 'computer') }))
vi.mock('../../src/lib/ilMeseArchivio', () => ({ caricaIlMese: async () => DATI }))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))

const { default: IlMeseView } = await import('../../src/views/IlMeseView.jsx')
afterEach(() => { cleanup(); MOBILE = false })
const testo = () => document.body.textContent || ''

const M = mesePrima(todayLocal().slice(0, 7))
const MA = annoPrima(M)
const mese = (m, { personale, ricavi = 99000, mp = 15000 } = {}) => {
  const incassi = incassiDelMese({ stima: { ricavi } })
  const c = {
    perCategoria: [{ id: 'materie-prime', importo: mp, fornitori: [{ nome: 'DESA SRL', importo: mp }] }],
    investimenti: { importo: 0 }, daClassificare: { importo: 0, nFornitori: 0, nFatture: 0 },
    copertura: { nFatture: 10, nSenzaImponibile: 0, importoIvaCompresa: 0 },
  }
  const p = personaleDelMese(personale, { mese: m })
  return { mese: m, incassi, costi: c, personale: p, conto: contoDelMese({ incassi, costi: c, personale: p }) }
}
const SENZA = [{ attivo: true, stipendio_lordo_mensile: 0 }]
const CON = [{ attivo: true, stipendio_lordo_mensile: 2000 }]
const conDati = (personale) => ({
  mese: M, confronto: MA, attuale: mese(M, { personale }), annoPrima: mese(MA, { personale, ricavi: 88000, mp: 13000 }),
  andamento: [M].map(m => mese(m, { personale })), perSede: null, ultimoInventario: null, errori: [],
})
// La risposta: la sezione di NumeroPrincipale (ha per nome la sua etichetta).
const risposta = () => document.querySelector('section[aria-label="Rimasti prima del personale"], section[aria-label^="Utile di"]')
const numeriGrandi = () => [...document.querySelectorAll('span')].filter(s => parseFloat(s.style.fontSize) >= 36)

describe('La risposta del Mese, col personale che manca (IM3)', () => {
  it('grande è il numero che si sa, non «non posso dirtelo»', async () => {
    DATI = conDati(SENZA)
    render(<IlMeseView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(risposta()).toBeTruthy())
    expect(risposta().getAttribute('aria-label')).toBe('Rimasti prima del personale')
    // 90.000 € di incassi senza IVA − 15.000 € di fatture.
    expect(numeriGrandi().map(s => s.textContent)).toEqual(['75.000 €'])
    expect(parseFloat(numeriGrandi()[0].style.fontSize)).toBe(48)
    expect(testo()).not.toMatch(/Non posso dirtelo/)
  })

  it('sotto, in ambra, perché l\'utile vero sarà più basso, e il passaggio per sistemarlo', async () => {
    DATI = conDati(SENZA)
    const vai = vi.fn()
    render(<IlMeseView orgId="o1" sedi={[]} onNavigate={vai} />)
    await waitFor(() => expect(risposta()).toBeTruthy())
    expect(risposta().textContent).toMatch(/Il numero vero sarà più basso di questo/)
    expect(risposta().textContent).toMatch(/stimato/)
    const b = [...risposta().querySelectorAll('button')].find(x => x.textContent === 'Metti i costi in Personale')
    await act(async () => { fireEvent.click(b) })
    expect(vai).toHaveBeenCalledWith('personale')
  })

  it('e il numero non sta da solo: c\'è lo stesso mese dell\'anno prima', async () => {
    DATI = conDati(SENZA)
    render(<IlMeseView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(risposta()).toBeTruthy())
    // 80.000 € − 13.000 € l'anno prima.
    expect(risposta().textContent).toMatch(new RegExp(`${aMese(MA)} erano 67\\.000 €`, 'i'))
  })
})

describe('La risposta del Mese, con l\'utile', () => {
  it('l\'utile, grande, col confronto', async () => {
    DATI = conDati(CON)
    render(<IlMeseView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(risposta()).toBeTruthy())
    expect(risposta().getAttribute('aria-label')).toBe(`Utile di ${nomeMese(M, { anno: false })}`)
    expect(numeriGrandi()).toHaveLength(1)
    expect(risposta().textContent).toMatch(new RegExp(`su ${nomeMese(MA)}`))
    expect(risposta().textContent).toMatch(/degli incassi/)
  })
})

describe('Un gradino sotto: incassi e spese in fila (intorno a IM3)', () => {
  it('due tessere che condividono le righe interne', async () => {
    DATI = conDati(SENZA)
    render(<IlMeseView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(risposta()).toBeTruthy())
    const tessere = [...document.querySelectorAll('div')].filter(d => d.style.gridTemplateRows === 'subgrid')
    expect(tessere.map(t => t.firstElementChild.textContent)).toEqual(['Incassi stimati', 'Spese del mese'])
  })

  it('al telefono la risposta viene prima di tutto il resto, e resta una', async () => {
    MOBILE = true
    DATI = conDati(SENZA)
    render(<IlMeseView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(risposta()).toBeTruthy())
    expect(numeriGrandi()).toHaveLength(1)
    expect(parseFloat(numeriGrandi()[0].style.fontSize)).toBe(36)
  })
})
