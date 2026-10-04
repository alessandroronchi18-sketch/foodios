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
// dello spostamento sta dentro il controllo del mese, in una riga: al
// telefono era una frase a parte, su tre righe (IM12) e poi su due.
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

// L'avviso dello spostamento sta dentro il controllo del mese, in una riga
// («settembre ancora senza incassi», accanto alla freccia › che ci porta);
// la frase intera è nel suo `title`. Prima era una frase a parte sotto la
// domanda, con «Vai a settembre» (richiesta del coordinatore, 04/10: al
// telefono la testa del Mese aveva quattro righe prima del contenuto).
const avviso = () => document.querySelector('[role="group"][aria-label="Mese guardato"] [role="status"]')
const breve = new RegExp(`${nomeMese(M, { anno: false })} ancora senza incassi`)

describe('Il Conto si apre sullo stesso mese de «Il mese» (CE2)', () => {
  it('se l\'ultimo mese chiuso non ha incassi va all\'ultimo che li ha, e lo dice', async () => {
    PER_MESE = daticome
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(avviso()?.textContent).toMatch(breve))
    expect(avviso().getAttribute('title')).toMatch(/non ha ancora gli incassi: ti mostro/)
    expect(document.querySelector('[aria-label="Mese guardato"]').textContent).toMatch(new RegExp(nomeMese(M1)))
    // Il conto del mese mostrato ha gli incassi, non «non lo so».
    await waitFor(() => expect(testo()).toMatch(/90\.000 €/))
  })

  it('«Il mese» fa lo stesso, con la stessa riga', async () => {
    PER_MESE = daticome
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(avviso()?.textContent).toMatch(breve))
    expect(testo()).toMatch(new RegExp(`Quanto hai guadagnato ${aMese(M1, { anno: false })}`))
  })

  it('la freccia accanto all\'avviso riporta al mese chiuso, e l\'avviso sparisce', async () => {
    PER_MESE = daticome
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(avviso()).toBeTruthy())
    expect(bottone(/^Mese dopo$/).getAttribute('title')).toBe(`Vai a ${nomeMese(M, { anno: false })}`)
    await act(async () => { fireEvent.click(bottone(/^Mese dopo$/)) })
    await waitFor(() => expect(chiesti.at(-1)).toBe(M))
    await waitFor(() => expect(avviso()).toBeNull())
  })

  it('la regola vale solo all\'apertura: tornando a mano su un mese senza incassi ci si resta', async () => {
    PER_MESE = daticome
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(avviso()).toBeTruthy())
    await act(async () => { fireEvent.click(bottone(/^Mese dopo$/)) })
    await waitFor(() => expect(chiesti.at(-1)).toBe(M))
    await waitFor(() => expect(testo()).toMatch(new RegExp(`Quanto hai guadagnato ${aMese(M, { anno: false })}`)))
  })
})

describe('Il mese è lo stesso controllo nelle due pagine (C9)', () => {
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

  it('ha l\'aspetto della barra del periodo chiusa: un bordo solo, frecce da 44 attaccate al mese', async () => {
    PER_MESE = daticome
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(avviso()).toBeTruthy())
    const g = document.querySelector('[role="group"][aria-label="Mese guardato"]')
    expect(g.style.border).toMatch(/^1px solid/)
    for (const b of g.querySelectorAll('button')) {
      expect([b.style.width, b.style.height]).toEqual(['44px', '44px'])
      expect(b.style.border).toMatch(/^none/)
    }
  })

  it('l\'avviso è una riga corta dentro il controllo, non una frase sotto la domanda', async () => {
    PER_MESE = daticome
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(avviso()).toBeTruthy())
    expect(avviso().textContent.length).toBeLessThanOrEqual(32)
    expect(avviso().style.whiteSpace).toBe('nowrap')
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1)
    expect(testo()).not.toMatch(/Vai a /)
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
