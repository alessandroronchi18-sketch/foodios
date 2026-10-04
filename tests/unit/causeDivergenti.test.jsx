// @vitest-environment happy-dom
//
// ── «Cosa è cambiato»: barre che partono dallo stesso zero ──────────────
//
// Audit del design del 04/10/2026 (IM9): le cause del cambio erano cinque
// paragrafi uguali, ognuno con «di spesa rispetto ad agosto 2025» ripetuto e
// le ragioni sociali intere in maiuscolo («CONVICINUM AZIENDA AGRICOLA DI
// VETRIOLO SAMANTHA KATIA»): 520 px al telefono. È il caso da manuale delle
// barre divergenti (ricerca §3.3, scelta 7): una riga per voce, la barra
// parte da uno zero comune e va a destra se il numero è salito, a sinistra
// se è sceso; il colore dice il giudizio; ordinate per euro di impatto, al
// massimo 5 più «Altro»; il mese di confronto detto una volta; il fornitore
// principale in nome breve. Il titolo dice la conclusione, in dieci parole.
//
// Il disegno è il pezzo comune `ElencoDivergente`; qui si prova che la pagina
// gli passa le cose giuste.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese, causeDelCambio, titoloCause } from '../../src/lib/ilMese.js'
import { mesePrima, annoPrima, aMese, nomeMese } from '../../src/lib/formatoAnalisi.js'
import { todayLocal } from '../../src/lib/dateLocal.js'

let DATI = null
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false, useDevice: () => 'computer' }))
vi.mock('../../src/lib/ilMeseArchivio', () => ({ caricaIlMese: async () => DATI }))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))

const { default: IlMeseView } = await import('../../src/views/IlMeseView.jsx')
afterEach(() => cleanup())

const M = mesePrima(todayLocal().slice(0, 7))
const MA = annoPrima(M)
const mese = (m, { ricavi = 99000, conf = 3000, mp = 15000 } = {}) => {
  const incassi = incassiDelMese({ stima: { ricavi } })
  const c = {
    perCategoria: [
      { id: 'materie-prime', importo: mp, fornitori: [{ nome: 'CONVICINUM AZIENDA AGRICOLA DI VETRIOLO SAMANTHA KATIA', importo: mp }] },
      { id: 'confezionamento', importo: conf, fornitori: [{ nome: 'CONO ARTIC COMMERCIALE SRL', importo: conf }] },
    ],
    investimenti: { importo: 0 }, daClassificare: { importo: 0, nFornitori: 0, nFatture: 0 },
    copertura: { nFatture: 10, nSenzaImponibile: 0, importoIvaCompresa: 0 },
  }
  const p = personaleDelMese([{ attivo: true, stipendio_lordo_mensile: 0 }], { mese: m })
  return { mese: m, incassi, costi: c, personale: p, conto: contoDelMese({ incassi, costi: c, personale: p }) }
}
// Incassi uguali; confezioni +11.542 €, materie prime −368 €.
const conDati = () => ({
  mese: M, confronto: MA,
  attuale: mese(M, { conf: 15790, mp: 15000 }), annoPrima: mese(MA, { conf: 4248, mp: 15368 }),
  andamento: [], perSede: null, ultimoInventario: null, errori: [],
})
const elenco = () => document.querySelector('ul[aria-label="Che cosa è cambiato"]')

describe('titoloCause', () => {
  it('la voce che ha pesato di più, in dieci parole al massimo', () => {
    const d = conDati()
    const t = titoloCause(causeDelCambio(d.attuale.conto, d.annoPrima.conto), MA)
    expect(t).toBe(`Confezioni: +11.542 € di spesa rispetto ${aMese(MA)}`)
    expect(t.split(/\s+/).length).toBeLessThanOrEqual(10)
  })
  it('se pesano di più gli incassi, lo dice degli incassi', () => {
    const a = mese(M, { ricavi: 110000 }).conto, b = mese(MA).conto
    expect(titoloCause(causeDelCambio(a, b), MA)).toBe(`Hai incassato 10.000 € in più rispetto ${aMese(MA)}`)
  })
})

describe('«Cosa è cambiato» nel Mese (IM9)', () => {
  it('barre divergenti, una riga per voce, non paragrafi', async () => {
    DATI = conDati()
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(elenco()).toBeTruthy())
    const righe = [...elenco().querySelectorAll('li')]
    expect(righe.map(li => li.getAttribute('aria-label'))).toEqual([
      'Confezioni: +11.542 €, peggio',
      'Materie prime: −368 €, meglio',
    ])
    // Il mese di confronto si dice una volta (nel titolo), non in ogni riga.
    const riquadro = elenco().closest('section')
    expect(riquadro.textContent.match(new RegExp(nomeMese(MA), 'g'))).toHaveLength(2) // titolo + intestazione dei numeri
    expect(riquadro.textContent).not.toMatch(/di spesa rispetto ad? \w+ \d{4}, soprattutto/)
  })

  it('il fornitore principale in nome breve, sotto la voce', async () => {
    DATI = conDati()
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(elenco()).toBeTruthy())
    const conf = [...elenco().querySelectorAll('li')][0]
    expect(conf.textContent).toMatch(/soprattutto CONO ARTIC COMMERCIALE \+11\.542/)
    expect(elenco().textContent).not.toMatch(/AZIENDA AGRICOLA DI VETRIOLO/)
  })

  it('il titolo è la conclusione, e i numeri hanno l\'intestazione col mese di confronto', async () => {
    DATI = conDati()
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(elenco()).toBeTruthy())
    const riquadro = elenco().closest('section')
    expect(riquadro.querySelector('h3').textContent).toBe(`Confezioni: +11.542 € di spesa rispetto ${aMese(MA)}`)
    expect(riquadro.textContent).toMatch(new RegExp(`su ${nomeMese(MA)}, €`))
  })
})
