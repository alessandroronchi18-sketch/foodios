// @vitest-environment happy-dom
//
// ── «IVA compresa» sta accanto al numero che tocca ──────────────────────
//
// 04/10/2026, prima foto dopo la copertura chiusa (coordinatore, verificato
// sul database): le spese di agosto, 50.497 €, sono IVA COMPRESA. Le fatture
// importate da WebDesk hanno l'imponibile a zero (3.042 su 3.104) finché non
// arriva lo ZIP dell'Agenzia, e il conto le prende col totale. La pagina
// invece diceva «Dagli incassi stimati all'utile, senza IVA», e «contati con
// l'IVA» era rimasto solo dentro la copertura, chiusa dietro un tocco. I
// 74.057 € «prima del personale» sono incassi senza IVA meno spese con
// l'IVA: più bassi del vero, e non lo diceva nessuno.
//
// ANALISI_DESIGN §6 (13a5411): un avvertimento che cambia come si legge un
// numero sta nella riga sotto quel numero. Qui: la tessera delle spese, il
// titolo e il sottotitolo della cascata, la frase «prima del personale», il
// sottotitolo del Conto. Se le fatture hanno l'imponibile, si dice «senza
// IVA» e basta.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese, ivaDelleSpese, titoloCascata } from '../../src/lib/ilMese.js'
import { mesePrima, annoPrima } from '../../src/lib/formatoAnalisi.js'
import { todayLocal } from '../../src/lib/dateLocal.js'

let DATI = null
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false, useDevice: () => 'computer' }))
vi.mock('../../src/lib/ilMeseArchivio', () => ({ caricaIlMese: async () => DATI }))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))

const { default: IlMeseView } = await import('../../src/views/IlMeseView.jsx')
const { default: ContoEconomicoView } = await import('../../src/views/ContoEconomicoView.jsx')
afterEach(() => cleanup())
const testo = () => document.body.textContent || ''

const M = mesePrima(todayLocal().slice(0, 7))
// Come agosto di Mara: tutte le fatture senza imponibile, contate con l'IVA.
const COPERTURA = {
  tutte: { nFatture: 76, nSenzaImponibile: 76, importoIvaCompresa: 18000 },
  parte: { nFatture: 76, nSenzaImponibile: 20, importoIvaCompresa: 5000 },
  senza: { nFatture: 76, nSenzaImponibile: 0, importoIvaCompresa: 0 },
}
const mese = (m, copertura, personale) => {
  const incassi = incassiDelMese({ stima: { ricavi: 99000 } })
  const c = {
    perCategoria: [{ id: 'materie-prime', importo: 15000, fornitori: [{ nome: 'DESA SRL', importo: 15000 }] }, { id: 'confezionamento', importo: 3000, fornitori: [] }],
    investimenti: { importo: 0 }, daClassificare: { importo: 0, nFornitori: 0, nFatture: 0 }, copertura,
  }
  const p = personaleDelMese(personale, { mese: m })
  return { mese: m, incassi, costi: c, personale: p, conto: contoDelMese({ incassi, costi: c, personale: p }) }
}
const SENZA_STIPENDI = [{ attivo: true, stipendio_lordo_mensile: 0 }]
const conDati = (tipo, personale = SENZA_STIPENDI) => ({
  mese: M, confronto: annoPrima(M), attuale: mese(M, COPERTURA[tipo], personale), annoPrima: mese(annoPrima(M), COPERTURA[tipo], personale),
  andamento: [M].map(m => mese(m, COPERTURA[tipo], personale)), perSede: null, ultimoInventario: null, errori: [],
})
// La tessera: dentro la fila, la casella che prende le righe della fila (subgrid).
const tessera = (re) => [...document.querySelectorAll('div')].find(d => d.style.gridTemplateRows === 'subgrid' && re.test(d.firstElementChild?.textContent || ''))
// L'avvertimento in ambra del pezzo comune (RigaAvviso): role=note.
const avvisoIn = (el) => el?.querySelector('[role="note"]')?.textContent || ''

describe('ivaDelleSpese', () => {
  it('tutte le fatture senza imponibile: «IVA compresa», col perché', () => {
    const iva = ivaDelleSpese({ copertura: COPERTURA.tutte })
    expect(iva.stato).toBe('tutte')
    expect(iva.riga).toBe('IVA compresa: 76 fatture senza imponibile')
  })
  it('solo una parte: quanti euro', () => {
    const iva = ivaDelleSpese({ copertura: COPERTURA.parte })
    expect(iva.stato).toBe('parte')
    expect(iva.riga).toBe('di cui 5.000 € IVA compresa: 20 fatture su 76 senza imponibile')
  })
  it('con l\'imponibile: senza IVA, niente avvertimento', () => {
    expect(ivaDelleSpese({ copertura: COPERTURA.senza })).toMatchObject({ stato: 'senza', riga: '' })
    expect(ivaDelleSpese(null).stato).toBe('senza')
  })
  it('il titolo della cascata lo dice quando l\'utile non c\'è', () => {
    const c = mese(M, COPERTURA.tutte, SENZA_STIPENDI)
    expect(titoloCascata(c.conto, ivaDelleSpese(c.costi))).toBe('Le fatture valgono il 20% degli incassi, IVA compresa')
    expect(titoloCascata(c.conto, ivaDelleSpese({ copertura: COPERTURA.senza }))).toBe('Le fatture valgono il 20% degli incassi')
  })
})

describe('«Il mese» con le spese IVA compresa', () => {
  // Dal secondo giro (04/10 sera) l'avvertimento è quello del pezzo comune:
  // `avviso`, in ambra, nella riga subito sotto il numero (non nella nota).
  it('la tessera delle spese lo dice sotto il numero', async () => {
    DATI = conDati('tutte')
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Quanto hai guadagnato/))
    expect(avvisoIn(tessera(/^Spese del mese/))).toBe('IVA compresa: 76 fatture senza imponibile')
  })

  it('anche la cascata e la risposta portano l\'avvertimento', async () => {
    DATI = conDati('tutte')
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Quanto hai guadagnato/))
    const cascata = [...document.querySelectorAll('section')].find(s => /Le fatture valgono/.test(s.querySelector('h3')?.textContent || ''))
    expect(avvisoIn(cascata)).toBe('IVA compresa: 76 fatture senza imponibile')
    expect(avvisoIn(document.querySelector('section[aria-label="Rimasti prima del personale"]'))).toMatch(/più basso del vero: le spese in fattura sono IVA compresa/i)
  })

  it('la cascata non dice più «all\'utile, senza IVA»: incassi senza, spese con', async () => {
    DATI = conDati('tutte')
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Quanto hai guadagnato/))
    expect(testo()).not.toMatch(/all'utile, senza IVA/)
    expect(testo()).toMatch(/Incassi senza IVA\. Le spese vengono dalle fatture/)
    expect(testo()).toMatch(/Le fatture valgono il 20% degli incassi, IVA compresa/)
  })

  it('«prima del personale» dice che, per l\'IVA, è più basso del vero', async () => {
    DATI = conDati('tutte')
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/72\.000 €/)) // 90.000 − 18.000
    expect(testo()).toMatch(/più basso del vero/i)
  })

  it('solo una parte con l\'IVA: lo dice in euro', async () => {
    DATI = conDati('parte')
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Quanto hai guadagnato/))
    expect(avvisoIn(tessera(/^Spese del mese/))).toMatch(/di cui 5\.000 € IVA compresa/)
  })

  it('con l\'imponibile c\'è, niente «IVA compresa» e niente «più basso del vero»', async () => {
    DATI = conDati('senza')
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Quanto hai guadagnato/))
    expect(testo()).not.toMatch(/IVA compresa|più basso del vero/i)
    expect(testo()).toMatch(/Incassi e spese senza IVA/)
  })
})

describe('Il Conto con le spese IVA compresa', () => {
  it('lo dice sotto la domanda, e non dice più «senza IVA» per tutto', async () => {
    DATI = conDati('tutte')
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Dove sono andati i soldi/))
    const sotto = document.querySelector('header').textContent
    expect(sotto).not.toMatch(/Voce per voce, senza IVA/)
    expect(sotto).toMatch(/spese IVA compresa/)
    // E dalla sera del 04/10 la risposta del Conto lo dice sotto il suo numero.
    expect(document.querySelector('section[aria-label^="Spese di"] [role="note"]').textContent).toBe('IVA compresa: 76 fatture senza imponibile')
  })
})
