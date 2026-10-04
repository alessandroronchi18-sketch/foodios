// @vitest-environment happy-dom
//
// ── Nel conto, «Da classificare» non è una spesa salita ─────────────────
//
// Audit del design del 04/10/2026 (CE3): nella colonna «Differenza» la riga
// «Da classificare» diceva «+4.417 € · peggio», in rosso. Non è una spesa
// salita: sono fatture di cui non si sa ancora la voce, ed è più probabile che
// l'anno prima ce ne fossero meno da classificare. Il rosso è per gli
// scostamenti in peggio veri (ANALISI_DESIGN regola 12); con 5 righe rosse su
// 6 la colonna diventava una macchia rossa.
//
// Ora quella differenza è scritta senza giudizio, in ambra (il colore di
// «incompleto»), e nella riga c'è il pulsante per sistemarla: «Classifica».
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese } from '../../src/lib/ilMese.js'
import { mesePrima, annoPrima } from '../../src/lib/formatoAnalisi.js'
import { todayLocal } from '../../src/lib/dateLocal.js'
import { color as T } from '../../src/lib/theme.js'

let MOBILE = false
let DATI = null
vi.mock('../../src/lib/useIsMobile', () => ({
  default: () => MOBILE, useIsTablet: () => false,
  useDevice: () => (MOBILE ? 'telefono' : 'computer'),
}))
vi.mock('../../src/lib/ilMeseArchivio', () => ({ caricaIlMese: async () => DATI }))
vi.mock('../../src/lib/supabase', () => ({ supabase: { from: () => { throw new Error('niente rete nelle prove') } } }))

const { default: ContoEconomicoView } = await import('../../src/views/ContoEconomicoView.jsx')

afterEach(() => { cleanup(); MOBILE = false })
const testo = () => document.body.textContent || ''

const M = mesePrima(todayLocal().slice(0, 7))
const costi = (daClassificare, mp) => ({
  perCategoria: [{ id: 'materie-prime', importo: mp, fornitori: [{ nome: 'DESA SRL', importo: mp }] }],
  investimenti: { importo: 0 },
  daClassificare: { importo: daClassificare, nFornitori: 3, nFatture: 5, fornitori: [{ nome: 'GECKO', importo: daClassificare }] },
  copertura: { nFatture: 10, nSenzaImponibile: 0, importoIvaCompresa: 0 },
})
const mese = (m, daClassificare, mp) => {
  const incassi = incassiDelMese({ stima: { ricavi: 99000 } })
  const c = costi(daClassificare, mp)
  const p = personaleDelMese([{ attivo: true, stipendio_lordo_mensile: 2000 }], { mese: m })
  return { mese: m, incassi, costi: c, personale: p, conto: contoDelMese({ incassi, costi: c, personale: p }) }
}
// Da classificare: 27.190 € contro 22.773 € l'anno prima. Materie prime salite davvero.
const conDati = () => ({
  mese: M, confronto: annoPrima(M),
  attuale: mese(M, 27190, 15000), annoPrima: mese(annoPrima(M), 22773, 13000),
  andamento: [M].map(m => mese(m, 27190, 15000)), perSede: null, ultimoInventario: null, errori: [],
})
const rigaDi = (re) => [...document.querySelectorAll('tbody tr')].find(r => re.test(r.textContent))

describe('«Da classificare» nel conto, al computer (CE3)', () => {
  it('la differenza non porta «peggio» e non è rossa: è ambra', async () => {
    DATI = conDati()
    render(<ContoEconomicoView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(rigaDi(/Da classificare/)).toBeTruthy())
    const r = rigaDi(/Da classificare/)
    expect(r.textContent).toMatch(/\+4\.417/)
    expect(r.textContent).not.toMatch(/peggio|meglio/)
    const cella = [...r.querySelectorAll('td')].find(td => /\+4\.417/.test(td.textContent))
    expect(cella.style.color).not.toBe(T.red)
    expect(cella.style.color).toBe(T.amberDark)
  })

  it('le spese salite davvero restano «peggio», in rosso (intorno a CE3)', async () => {
    DATI = conDati()
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(rigaDi(/Materie prime/)).toBeTruthy())
    expect(rigaDi(/Materie prime/).textContent).toMatch(/\+2\.000 · peggio/)
  })

  it('nella riga c\'è «Classifica», che apre la schermata delle voci', async () => {
    DATI = conDati()
    render(<ContoEconomicoView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(rigaDi(/Da classificare/)).toBeTruthy())
    const b = [...rigaDi(/Da classificare/).querySelectorAll('button')].find(x => x.textContent === 'Classifica')
    expect(b).toBeTruthy()
    await act(async () => { fireEvent.click(b) })
    await waitFor(() => expect(testo()).toMatch(/Di che cosa sono queste spese/))
  })
})

describe('«Da classificare» nel conto, al telefono (CE3)', () => {
  it('senza giudizio, in ambra, con «Classifica» nella scheda', async () => {
    MOBILE = true
    DATI = conDati()
    render(<ContoEconomicoView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(document.querySelector('[aria-label="Il conto voce per voce"]')).toBeTruthy())
    const scheda = [...document.querySelectorAll('[aria-label="Il conto voce per voce"] > li')].find(li => /Da classificare/.test(li.textContent))
    expect(scheda.textContent).not.toMatch(/peggio|meglio/)
    expect(scheda.textContent).toMatch(/\+4\.417 €/)
    expect([...scheda.querySelectorAll('button')].some(b => b.textContent === 'Classifica')).toBe(true)
  })
})
