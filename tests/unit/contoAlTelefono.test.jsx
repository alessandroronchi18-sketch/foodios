// @vitest-environment happy-dom
//
// ── Il conto al telefono: il confronto con l'anno prima si vede ─────────
//
// Audit del design del 04/10/2026 (difetto CE1, il quarto più grave della
// nuova Analisi), misurato al pixel con Chromium a 420 px: la tabella del
// conto era larga 608 px dentro un riquadro di 354. All'apertura si vedevano
// «Voce», «agosto» e metà di «agosto 2025», tagliato sul bordo; «Differenza»
// e «Sugli incassi», cioè le colonne per cui la pagina esiste, stavano fuori
// schermo, senza nessun segno che si potesse scorrere. Nasceva da
// `minWidth: 560` sulla tabella al telefono.
//
// Al telefono il conto ora è un elenco di schede (ANALISI_DESIGN §6, scelta 8
// della ricerca): voce ed euro sulla prima riga, e sotto, nella stessa
// scheda, il peso sugli incassi e la differenza con l'anno prima col suo
// giudizio. Niente scorrimento di lato. La scheda intera si tocca per aprire
// i fornitori (prima la freccia era alta 28 px, difetto CE5).
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese } from '../../src/lib/ilMese.js'
import { mesePrima, annoPrima, nomeMese } from '../../src/lib/formatoAnalisi.js'
import { todayLocal } from '../../src/lib/dateLocal.js'

const M = mesePrima(todayLocal().slice(0, 7))
const MA = annoPrima(M)

let MOBILE = true
let DATI = null
vi.mock('../../src/lib/useIsMobile', () => ({
  default: () => MOBILE, useIsTablet: () => false,
  useDevice: () => (MOBILE ? 'telefono' : 'computer'),
}))
vi.mock('../../src/lib/ilMeseArchivio', () => ({ caricaIlMese: async () => DATI }))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))

const { default: ContoEconomicoView } = await import('../../src/views/ContoEconomicoView.jsx')

afterEach(() => { cleanup(); MOBILE = true })
const testo = () => document.body.textContent || ''

const ATTIVI = [{ attivo: true, stipendio_lordo_mensile: 2000 }, { attivo: true, stipendio_lordo_mensile: 1000 }]
const costi = (mp, conf) => ({
  perCategoria: [
    { id: 'materie-prime', importo: mp, fornitori: [{ nome: 'DESA SRL', importo: mp * 0.5 }] },
    { id: 'confezionamento', importo: conf, fornitori: [{ nome: 'CONO ARTIC', importo: conf }] },
  ],
  investimenti: { importo: 0 },
  daClassificare: { importo: 0, nFornitori: 0, nFatture: 0 },
  copertura: { nFatture: 10, nSenzaImponibile: 0, importoIvaCompresa: 0 },
})
const mese = (m, { ricavi, mp = 15000, conf = 3000, personale = ATTIVI }) => {
  const incassi = incassiDelMese({ stima: { ricavi } })
  const c = costi(mp, conf)
  const p = personaleDelMese(personale, { mese: m })
  return { mese: m, incassi, costi: c, personale: p, conto: contoDelMese({ incassi, costi: c, personale: p }) }
}
const conDati = (opz = {}) => ({
  mese: M, confronto: MA,
  attuale: mese(M, { ricavi: 99000, ...opz }),
  annoPrima: mese(MA, { ricavi: 88000, mp: 13000, ...opz }),
  andamento: [mesePrima(M), M].map(m => mese(m, { ricavi: 60000, ...opz })),
  perSede: null, ultimoInventario: null, errori: [],
})
const schede = () => [...document.querySelectorAll('[aria-label="Il conto voce per voce"] > li')]

describe('Il conto al telefono (difetto CE1)', () => {
  it('non disegna più una tabella più larga dello schermo', async () => {
    DATI = conDati()
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Materie prime/))
    // Il difetto: una <table> con minWidth 560 dentro un riquadro di 354.
    expect(document.querySelector('table')).toBeNull()
    const larghi = [...document.querySelectorAll('[style]')].filter(el => parseFloat(el.style.minWidth) > 360)
    expect(larghi).toEqual([])
  })

  it('ogni voce porta nella sua scheda il peso sugli incassi e la differenza con l\'anno prima', async () => {
    DATI = conDati()
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(schede().length).toBeGreaterThan(0))
    const mp = schede().find(s => /Materie prime/.test(s.textContent))
    // 15.000 € su 90.000 € di incassi senza IVA; 13.000 € l'anno prima.
    expect(mp.textContent).toMatch(/−15\.000 €/)
    expect(mp.textContent).toMatch(/16,7% degli incassi/)
    expect(mp.textContent).toMatch(new RegExp(`\\+2\\.000 € su ${nomeMese(MA)} · peggio`))
    const inc = schede().find(s => /^Incassi/.test(s.textContent))
    expect(inc.textContent).toMatch(new RegExp(`\\+10\\.000 € su ${nomeMese(MA)} · meglio`))
    // Il giudizio si legge anche dal colore, mai solo dal colore.
    const diff = [...mp.querySelectorAll('span')].find(s => /peggio/.test(s.textContent) && !s.children.length)
    expect(diff.style.color).toBeTruthy()
  })

  it('dove non sa scrive «non lo so», non zero, e il confronto mancante lo dice', async () => {
    DATI = conDati({ personale: [{ attivo: true, stipendio_lordo_mensile: 0 }] })
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(schede().length).toBeGreaterThan(0))
    const pers = schede().find(s => /^Personale/.test(s.textContent))
    expect(pers.textContent).toMatch(/non lo so/)
    expect(pers.textContent).not.toMatch(/\b0 €/)
    const utile = schede().find(s => /^Utile/.test(s.textContent))
    expect(utile.textContent).toMatch(/non lo so/)
  })

  it('la scheda intera si tocca per aprire i fornitori, ed è alta almeno 44 px', async () => {
    DATI = conDati()
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(schede().length).toBeGreaterThan(0))
    const bottone = schede().find(s => /Materie prime/.test(s.textContent)).querySelector('button')
    expect(bottone).toBeTruthy()
    expect(parseFloat(bottone.style.minHeight)).toBeGreaterThanOrEqual(44)
    expect(bottone.getAttribute('aria-expanded')).toBe('false')
    await act(async () => { fireEvent.click(bottone) })
    expect(bottone.getAttribute('aria-expanded')).toBe('true')
    expect(testo()).toMatch(/DESA SRL/)
    expect(testo()).toMatch(/7\.500 €/)
  })
})

describe('Al computer la tabella resta (intorno a CE1)', () => {
  it('tutte le colonne, con l\'andamento dei 12 mesi', async () => {
    MOBILE = false
    DATI = conDati()
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(document.querySelector('table')).toBeTruthy())
    // La tabella comune dell'Analisi: l'euro nell'intestazione (sera del 04/10).
    const intestazioni = [...document.querySelectorAll('thead th')].map(t => t.textContent)
    expect(intestazioni).toEqual(['Voce', `${nomeMese(M, { anno: false })}, €`, `${nomeMese(MA)}, €`, 'differenza, €', '% incassi', '12 mesi'])
    expect(schede()).toEqual([])
  })
})
