// @vitest-environment happy-dom
//
// ── «Il mese» al telefono ───────────────────────────────────────────────
//
// Audit del design del 04/10/2026, misurato con Chromium a 420 px e il tocco
// vero (difetto IM7, l'ottavo più grave della nuova Analisi): la griglia dei
// dodici mesi voleva 378 px e il riquadro ne mostrava 354. Scorreva di 24 px
// senza nessun segno, e «ago», il mese scelto, era tagliato a metà sul bordo
// destro. Nasceva da `minmax(26px, 1fr)` con `minWidth: 360` al telefono.
//
// Ora al telefono le dodici colonne si dividono lo spazio che c'è
// (`minmax(0, 1fr)`, 2 px fra l'una e l'altra): ci stanno tutte, e il mese
// scelto si vede sempre intero.
//
// Stesso giorno, dopo l'unione dei pezzi comuni: la prova delle tabelle
// larghe (`tabelleLargheTelefono`) ha trovato la tabella dei dodici mesi,
// quella dietro «Vedi i numeri in tabella», con `minWidth: 420` in un
// riquadro di 356. Ora l'euro sta nell'intestazione e non in ogni cella
// (come nelle altre tabelle dell'Analisi), e la tabella sta nel telefono.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese } from '../../src/lib/ilMese.js'
import { mesePrima, annoPrima } from '../../src/lib/formatoAnalisi.js'
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

const { default: IlMeseView } = await import('../../src/views/IlMeseView.jsx')

afterEach(() => { cleanup(); MOBILE = true })

const costi = (mp) => ({
  perCategoria: [{ id: 'materie-prime', importo: mp, fornitori: [{ nome: 'DESA SRL', importo: mp }] }],
  investimenti: { importo: 0 }, daClassificare: { importo: 0, nFornitori: 0, nFatture: 0 },
  copertura: { nFatture: 10, nSenzaImponibile: 0, importoIvaCompresa: 0 },
})
const mese = (m, ricavi) => {
  const incassi = incassiDelMese({ stima: { ricavi } })
  const c = costi(15000)
  const p = personaleDelMese([{ attivo: true, stipendio_lordo_mensile: 2000 }], { mese: m })
  return { mese: m, incassi, costi: c, personale: p, conto: contoDelMese({ incassi, costi: c, personale: p }) }
}
const dodici = () => {
  const out = [M]
  while (out.length < 12) out.unshift(mesePrima(out[0]))
  return out
}
const conDati = () => ({
  mese: M, confronto: MA, attuale: mese(M, 99000), annoPrima: mese(MA, 88000),
  andamento: dodici().map((m, i) => mese(m, i > 7 ? 99000 : null)),
  perSede: null, ultimoInventario: null, errori: [],
})
// La griglia dei mesi: l'elenco con dodici pulsanti (la cascata è un altro elenco).
const griglia = () => [...document.querySelectorAll('[role="list"]')].find(l => l.querySelectorAll('button').length === 12)

describe('I dodici mesi al telefono (difetto IM7)', () => {
  it('stanno nel riquadro: niente larghezza minima più grande dello schermo', async () => {
    DATI = conDati()
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(griglia()).toBeTruthy())
    // Riquadro al telefono: 420 − 2 × 16 di pagina − 2 × 16 di imbottitura = 356 px (354 col bordo).
    expect(parseFloat(griglia().style.minWidth) || 0).toBeLessThanOrEqual(354)
    expect(griglia().style.gridTemplateColumns).toMatch(/minmax\(0(px)?, 1fr\)/)
    // 12 colonne × 18 px di barre + 11 spazi da 2 px = 238 px: ci stanno con margine.
    expect(parseFloat(griglia().style.columnGap || griglia().style.gap)).toBeLessThanOrEqual(2)
  })

  it('il mese scelto c\'è, intero, ed è segnato', async () => {
    DATI = conDati()
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(griglia()).toBeTruthy())
    const mesi = [...griglia().querySelectorAll('button')]
    expect(mesi).toHaveLength(12)
    const scelto = mesi.at(-1)
    expect(scelto.getAttribute('aria-current')).toBe('true')
    expect(mesi.filter(b => b.getAttribute('aria-current') === 'true')).toHaveLength(1)
  })
})

describe('Al computer i dodici mesi restano larghi (intorno a IM7)', () => {
  it('almeno 40 px a colonna, con 8 px fra l\'una e l\'altra', async () => {
    MOBILE = false
    DATI = conDati()
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(griglia()).toBeTruthy())
    expect(griglia().style.gridTemplateColumns).toMatch(/minmax\(40px, 1fr\)/)
  })
})

describe('La tabella dei dodici mesi al telefono (tabelleLargheTelefono)', () => {
  it('non è più larga del riquadro, e l\'euro sta nell\'intestazione', async () => {
    DATI = conDati()
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(griglia()).toBeTruthy())
    // Il pulsante del riquadro dei dodici mesi (la cascata ha il suo).
    const apri = [...document.querySelectorAll('button')].filter(b => b.textContent === 'Vedi i numeri in tabella').at(-1)
    await act(async () => { fireEvent.click(apri) })
    const tabella = document.querySelector('table[aria-label="Gli ultimi dodici mesi, in numeri"]')
    expect(parseFloat(tabella.style.minWidth) || 0).toBeLessThanOrEqual(356)
    expect([...tabella.querySelectorAll('th[scope="col"]')].map(t => t.textContent)).toEqual(['Mese', 'Incassi, €', 'Spese, €', 'Utile, €'])
    expect([...tabella.querySelectorAll('td')].some(td => /€/.test(td.textContent))).toBe(false)
  })
})
