// @vitest-environment happy-dom
//
// ── Il mese guardato: lo stesso in «Il mese» e nel Conto ────────────────
//
// Audit del design del 04/10/2026 (C9 e CE2). Le due pagine leggono gli
// stessi numeri dallo stesso archivio, ma ognuna aveva la sua copia delle
// frecce del mese, e si aprivano su due mesi diversi: «Il mese» saltava ad
// agosto, l'ultimo mese con gli incassi, e lo diceva; il Conto restava su
// settembre, con incassi e utile «non lo so». Le foto del 03/10 avevano
// dovuto spostarlo indietro a mano (`indietro: 1` nel test delle foto).
//
// Ora la regola del primo mese, la lettura e le frecce stanno in un pezzo
// solo (`MeseAnalisi`), e le due pagine lo usano tutte e due. E l'avviso
// dello spostamento è una frase sola col pulsante dentro: al telefono
// l'icona, la frase e il pulsante andavano a capo su tre righe (IM12).
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese } from '../../src/lib/ilMese.js'
import { mesePrima, annoPrima, nomeMese, aMese } from '../../src/lib/formatoAnalisi.js'
import { todayLocal } from '../../src/lib/dateLocal.js'

const M = mesePrima(todayLocal().slice(0, 7))   // l'ultimo mese chiuso
const M1 = mesePrima(M)                          // quello prima, con gli incassi

let PER_MESE = null
const chiesti = []
vi.mock('../../src/lib/ilMeseArchivio', () => ({ caricaIlMese: async ({ mese: m }) => { chiesti.push(m); return PER_MESE(m) } }))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))

const { default: IlMeseView } = await import('../../src/views/IlMeseView.jsx')
const { default: ContoEconomicoView } = await import('../../src/views/ContoEconomicoView.jsx')
const { primoMeseDaMostrare, meseDopo } = await import('../../src/components/analisi/MeseAnalisi.jsx')

afterEach(() => { cleanup(); chiesti.length = 0 })
const testo = () => document.body.textContent || ''
const bottone = (re) => [...document.querySelectorAll('button')].find(b => re.test(b.getAttribute('aria-label') || b.textContent))

const costi = {
  perCategoria: [{ id: 'materie-prime', importo: 15000, fornitori: [{ nome: 'DESA SRL', importo: 15000 }] }],
  investimenti: { importo: 0 }, daClassificare: { importo: 0, nFornitori: 0, nFatture: 0 },
  copertura: { nFatture: 10, nSenzaImponibile: 0, importoIvaCompresa: 0 },
}
const mese = (m, ricavi) => {
  const incassi = incassiDelMese({ stima: { ricavi } })
  const p = personaleDelMese([{ attivo: true, stipendio_lordo_mensile: 2000 }], { mese: m })
  return { mese: m, incassi, costi, personale: p, conto: contoDelMese({ incassi, costi, personale: p }) }
}
// L'ultimo mese chiuso senza incassi (l'inventario si ferma prima), gli altri con.
const daticome = (m) => ({
  mese: m, confronto: annoPrima(m),
  attuale: mese(m, m === M ? null : 99000),
  annoPrima: mese(annoPrima(m), 88000),
  andamento: [mesePrima(M1), M1, M].filter(x => x <= m).map(x => mese(x, x === M ? null : 99000)),
  perSede: null, ultimoInventario: `${M1}-31`, errori: [],
})

describe('Il Conto si apre sullo stesso mese de «Il mese» (CE2)', () => {
  it('se l\'ultimo mese chiuso non ha incassi va all\'ultimo che li ha, e lo dice', async () => {
    PER_MESE = daticome
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/non ha ancora gli incassi: ti mostro/))
    expect(testo()).toMatch(new RegExp(nomeMese(M1)))
    expect(bottone(/^Vai a /).textContent).toBe(`Vai a ${nomeMese(M, { anno: false })}`)
    // Il conto del mese mostrato ha gli incassi, non «non lo so».
    await waitFor(() => expect(testo()).toMatch(/90\.000 €/))
  })

  it('«Il mese» fa lo stesso, con la stessa frase', async () => {
    PER_MESE = daticome
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/non ha ancora gli incassi: ti mostro/))
    expect(testo()).toMatch(new RegExp(`Quanto hai guadagnato ${aMese(M1, { anno: false })}`))
  })

  it('«Vai a …» riporta al mese chiuso, e l\'avviso sparisce', async () => {
    PER_MESE = daticome
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(bottone(/^Vai a /)).toBeTruthy())
    await act(async () => { fireEvent.click(bottone(/^Vai a /)) })
    await waitFor(() => expect(chiesti.at(-1)).toBe(M))
    await waitFor(() => expect(testo()).not.toMatch(/non ha ancora gli incassi/))
  })

  it('la regola vale solo all\'apertura: tornando a mano su un mese senza incassi ci si resta', async () => {
    PER_MESE = daticome
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/ti mostro/))
    await act(async () => { fireEvent.click(bottone(/^Mese dopo$/)) })
    await waitFor(() => expect(chiesti.at(-1)).toBe(M))
    await waitFor(() => expect(testo()).toMatch(new RegExp(`Quanto hai guadagnato ${aMese(M, { anno: false })}`)))
  })
})

describe('Le frecce sono le stesse nelle due pagine (C9)', () => {
  it('un gruppo «Mese guardato», con «Mese prima» e «Mese dopo»', async () => {
    PER_MESE = (m) => ({ ...daticome(m), attuale: mese(m, 99000) })
    for (const Vista of [IlMeseView, ContoEconomicoView]) {
      render(<Vista orgId="o1" sedi={[]} />)
      await waitFor(() => expect(document.querySelector('[role="group"][aria-label="Mese guardato"]')).toBeTruthy())
      const g = document.querySelector('[role="group"][aria-label="Mese guardato"]')
      expect([...g.querySelectorAll('button')].map(b => b.getAttribute('aria-label'))).toEqual(['Mese prima', 'Mese dopo'])
      expect(g.textContent).toBe(nomeMese(M))
      cleanup()
    }
  })
})

describe('L\'avviso è una frase sola, col pulsante dentro (IM12)', () => {
  it('icona e frase affiancate; il pulsante sta nella frase; 44 px da toccare senza alzare la riga', async () => {
    PER_MESE = daticome
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(bottone(/^Vai a /)).toBeTruthy())
    const avviso = document.querySelector('[role="status"]')
    expect(avviso.children).toHaveLength(2)                // icona, frase
    expect(avviso.children[1].contains(bottone(/^Vai a /))).toBe(true)
    const b = bottone(/^Vai a /)
    expect(parseFloat(b.style.paddingTop) * 2 + 20).toBeGreaterThanOrEqual(44)
    expect(b.style.marginTop).toBe('-12px')
    // Ed è sotto la domanda, dentro l'intestazione.
    expect(avviso.closest('header')).toBeTruthy()
  })
})

describe('primoMeseDaMostrare', () => {
  it('il mese stesso se ha gli incassi', () => {
    expect(primoMeseDaMostrare({ attuale: { incassi: { fonte: 'stima' } } }, '2026-09')).toBe('2026-09')
  })
  it('l\'ultimo prima che li ha, se non li ha', () => {
    const d = { attuale: { incassi: { fonte: null } }, andamento: [{ mese: '2026-07', incassi: { fonte: 'stima' } }, { mese: '2026-08', incassi: { fonte: 'cassa' } }, { mese: '2026-09', incassi: { fonte: null } }] }
    expect(primoMeseDaMostrare(d, '2026-09')).toBe('2026-08')
  })
  it('resta dov\'è se nessun mese ha incassi (meglio «non lo so» che un mese a caso)', () => {
    expect(primoMeseDaMostrare({ attuale: { incassi: { fonte: null } }, andamento: [null, { mese: '2026-08', incassi: {} }] }, '2026-09')).toBe('2026-09')
  })
  it('il mese dopo di dicembre è gennaio dell\'anno dopo', () => {
    expect(meseDopo('2026-12')).toBe('2027-01')
    expect(meseDopo('2026-09')).toBe('2026-10')
  })
})
