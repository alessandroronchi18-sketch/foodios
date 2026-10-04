// @vitest-environment happy-dom
//
// ── «Il mese»: la cascata è la tabella del conto, e il perché a un tocco ─
//
// Scelte 1 e 7 della ricerca (04/10), ANALISI_DESIGN §6: la cascata non è un
// disegno accanto alla tabella, è la tabella: voce · barra · € del mese · %
// sugli incassi · differenza con l'anno prima come barretta da uno zero
// comune. Il pezzo comune lo sa fare (`conConfronto`, `titoloValore`,
// `titoloConfronto`, `evidenzia`), ma il Mese gli passava solo i passi del
// mese: niente anno prima, niente intestazione col mese, e la barra scura
// non era quella di cui parla il titolo.
//
// E «Cosa è cambiato» stava sempre aperto accanto alla cascata, che ora le
// differenze le mostra già voce per voce: il perché, ordinato per euro di
// impatto, si apre a un tocco sotto la cascata («Perché?», scelta 7).
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese } from '../../src/lib/ilMese.js'
import { mesePrima, annoPrima, nomeMese, aMese } from '../../src/lib/formatoAnalisi.js'
import { todayLocal } from '../../src/lib/dateLocal.js'
import { color as T } from '../../src/lib/theme.js'

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
const mese = (m, { conf, stipendi = 0 }) => {
  const incassi = incassiDelMese({ stima: { ricavi: 99000 } })
  const c = {
    perCategoria: [
      { id: 'materie-prime', importo: 15000, fornitori: [{ nome: 'DESA SRL', importo: 15000 }] },
      { id: 'confezionamento', importo: conf, fornitori: [{ nome: 'CONO ARTIC COMMERCIALE SRL', importo: conf }] },
    ],
    investimenti: { importo: 0 }, daClassificare: { importo: 0, nFornitori: 0, nFatture: 0 },
    copertura: { nFatture: 10, nSenzaImponibile: 0, importoIvaCompresa: 0 },
  }
  const p = personaleDelMese([{ attivo: true, stipendio_lordo_mensile: stipendi }], { mese: m })
  return { mese: m, incassi, costi: c, personale: p, conto: contoDelMese({ incassi, costi: c, personale: p }) }
}
const conDati = (stipendi = 0) => ({
  mese: M, confronto: MA,
  attuale: mese(M, { conf: 15000, stipendi }), annoPrima: mese(MA, { conf: 4000, stipendi }),
  andamento: [], perSede: null, ultimoInventario: null, errori: [],
})
const cascata = () => [...document.querySelectorAll('section')].find(s => s.querySelector('[role="list"]') && /Le fatture valgono|Su 100 €/.test(s.querySelector('h3')?.textContent || ''))

describe('La cascata del Mese è la tabella del conto', () => {
  it('prende tutta la riga, e ha le colonne del mese e della differenza con l\'anno prima', async () => {
    DATI = conDati()
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(cascata()).toBeTruthy())
    // A tutta riga: figlia diretta della pagina, non in una griglia accanto a un altro riquadro.
    expect(cascata().parentElement.classList.contains('fos-pagina-analisi')).toBe(true)
    expect(cascata().textContent).toMatch(new RegExp(`${nomeMese(M, { anno: false })}, €`))
    expect(cascata().textContent).toMatch(new RegExp(`su ${nomeMese(MA)}, €`))
    // Confezioni: 15.000 contro 4.000 → +11.000 nella colonna della differenza.
    const conf = [...cascata().querySelectorAll('[role="listitem"]')].find(r => /^Confezioni/.test(r.textContent))
    expect(conf.textContent).toMatch(/\+11\.000/)
  })

  it('la barra scura è quella di cui parla il titolo: l\'utile, quando il titolo parla dell\'utile', async () => {
    DATI = conDati(2000)
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(cascata()?.querySelector('h3').textContent).toMatch(/Su 100 € incassati/))
    const barraDi = (re) => {
      const r = [...cascata().querySelectorAll('[role="listitem"]')].find(x => re.test(x.textContent))
      return [...r.querySelectorAll('span')].find(s => s.style.background && s.style.position === 'absolute' && s.style.width !== '1px')
    }
    expect(barraDi(/^Utile/).style.background).toBe(T.graficoReale)
    expect(barraDi(/^Incassi/).style.background).toBe(T.graficoConfronto)
  })
})

describe('Il perché, a un tocco (scelta 7)', () => {
  it('chiuso all\'apertura; aperto mostra le cause ordinate per impatto', async () => {
    DATI = conDati()
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(cascata()).toBeTruthy())
    expect(document.querySelector('ul[aria-label="Che cosa è cambiato"]')).toBeNull()
    const perche = [...cascata().querySelectorAll('button')].find(b => b.textContent.startsWith('Perché'))
    expect(perche.textContent).toBe(`Perché è cambiato da ${nomeMese(MA)}?`)
    expect(perche.getAttribute('aria-expanded')).toBe('false')
    await act(async () => { fireEvent.click(perche) })
    expect(perche.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('ul[aria-label="Che cosa è cambiato"] li').getAttribute('aria-label')).toBe('Confezioni: +11.000 €, peggio')
    expect(cascata().textContent).toMatch(new RegExp(`Confezioni: \\+11\\.000 € di spesa rispetto ${aMese(MA)}`))
  })

  it('senza cause niente «Perché?»: la frase che dice cosa manca sta sotto il titolo', async () => {
    DATI = { ...conDati(), annoPrima: null }
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(cascata()).toBeTruthy())
    expect([...cascata().querySelectorAll('button')].some(b => b.textContent.startsWith('Perché'))).toBe(false)
    expect(testo()).toMatch(/Non ci sono dati dell'anno prima/)
  })
})
