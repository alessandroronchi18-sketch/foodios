// @vitest-environment happy-dom
//
// ── Il Conto: una risposta grande alla sua domanda ──────────────────────
//
// Fase B della nuova Analisi (04/10/2026): ogni pagina ha UNA risposta
// grande in cima (ANALISI_DESIGN §6). Il Conto chiede «Dove sono andati i
// soldi ad agosto?» e il primo numero era una cella da 13 px della tabella
// (audit, «Cosa c'è prima del primo numero»: 347 px al computer). Ora la
// risposta è NumeroPrincipale: quanto si è speso, contro l'anno prima, con
// l'IVA detta sotto il numero quando le fatture ce l'hanno dentro, e una
// frase che dice dove: la voce più pesante e quanto non ha ancora la voce.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese } from '../../src/lib/ilMese.js'
import { mesePrima, annoPrima, nomeMese } from '../../src/lib/formatoAnalisi.js'
import { todayLocal } from '../../src/lib/dateLocal.js'

let DATI = null
let MOBILE = false
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => MOBILE, useIsTablet: () => false, useDevice: () => (MOBILE ? 'telefono' : 'computer') }))
vi.mock('../../src/lib/ilMeseArchivio', () => ({ caricaIlMese: async () => DATI }))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))

const { default: ContoEconomicoView } = await import('../../src/views/ContoEconomicoView.jsx')
afterEach(() => { cleanup(); MOBILE = false })

const M = mesePrima(todayLocal().slice(0, 7))
const MA = annoPrima(M)
const mese = (m, { conf, daClassificare = 0, iva = false }) => {
  const incassi = incassiDelMese({ stima: { ricavi: 110000 } })
  const c = {
    perCategoria: [
      { id: 'materie-prime', importo: 15000, fornitori: [] },
      { id: 'confezionamento', importo: conf, fornitori: [] },
    ],
    investimenti: { importo: 0 }, daClassificare: { importo: daClassificare, nFornitori: 3, nFatture: 4 },
    copertura: iva ? { nFatture: 20, nSenzaImponibile: 20, importoIvaCompresa: 40000 } : { nFatture: 20, nSenzaImponibile: 0, importoIvaCompresa: 0 },
  }
  const p = personaleDelMese([{ attivo: true, stipendio_lordo_mensile: 0 }], { mese: m })
  return { mese: m, incassi, costi: c, personale: p, conto: contoDelMese({ incassi, costi: c, personale: p }) }
}
const conDati = (opz = {}) => ({
  mese: M, confronto: MA, attuale: mese(M, { conf: 20000, daClassificare: 5000, ...opz }), annoPrima: mese(MA, { conf: 10000, ...opz }),
  andamento: [], perSede: null, ultimoInventario: null, errori: [],
})
const risposta = () => document.querySelector(`section[aria-label="Spese di ${nomeMese(M, { anno: false })}"]`)

describe('La risposta del Conto (fase B)', () => {
  it('è il numero più grande della pagina, e il solo: quanto si è speso, contro l\'anno prima', async () => {
    DATI = conDati()
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(risposta()).toBeTruthy())
    // 15.000 + 20.000 + 5.000 da classificare; l'anno prima 25.000.
    expect(risposta().textContent).toMatch(/40\.000 €/)
    expect(risposta().textContent).toMatch(new RegExp(`\\+60%su ${nomeMese(MA)}`))
    const grandi = [...document.querySelectorAll('span')].filter(s => parseFloat(s.style.fontSize) >= 36)
    expect(grandi.map(s => s.textContent)).toEqual(['40.000 €'])
  })

  it('la frase dice dove: la voce più pesante, e quanto non ha ancora la voce', async () => {
    DATI = conDati()
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(risposta()).toBeTruthy())
    // 40.000 su 100.000 di incassi senza IVA.
    expect(risposta().textContent).toMatch(/È il 40% degli incassi\. La voce più pesante è Confezioni: 20\.000 €; 5\.000 € non hanno ancora la voce\./)
  })

  it('con le spese IVA compresa lo dice sotto il numero', async () => {
    DATI = conDati({ iva: true })
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(risposta()).toBeTruthy())
    expect(risposta().querySelector('[role="note"]').textContent).toBe('IVA compresa: 20 fatture senza imponibile')
  })

  it('al telefono c\'è, prima delle schede', async () => {
    MOBILE = true
    DATI = conDati()
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(risposta()).toBeTruthy())
    const schede = document.querySelector('[aria-label="Il conto voce per voce"]')
    expect(risposta().compareDocumentPosition(schede) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
