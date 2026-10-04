// @vitest-environment happy-dom
//
// ── «Il mese»: niente riquadri disegnati attorno a un «non lo so» ───────
//
// Audit del design del 04/10/2026:
//   • IM14: senza cause del cambio (all'apertura, o quando l'anno prima non ha
//     i dati) accanto alla cascata c'era un riquadro di 474 × 271 px con una
//     frase sola, «Per agosto 2025 mancano i dati per confrontare voce per
//     voce». Il coordinatore, dopo l'unione: va ridotto a una riga;
//   • IM6 (e la scelta della fase B «via i riquadri vuoti»): «Le tre spese che
//     decidono il margine» disegnava tre barre senza dato, poi tre righe di
//     «non lo so» dentro un riquadro col suo titolo e un sottotitolo di 160
//     caratteri.
//
// Ora: senza cause la cascata prende tutta la riga e la frase sta sotto il
// suo titolo; senza nessuna delle tre quote il riquadro non c'è, e al suo
// posto una riga dice quando ci saranno.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese } from '../../src/lib/ilMese.js'
import { mesePrima, annoPrima, nomeMese } from '../../src/lib/formatoAnalisi.js'
import { todayLocal } from '../../src/lib/dateLocal.js'

let DATI = null
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false, useDevice: () => 'computer' }))
vi.mock('../../src/lib/ilMeseArchivio', () => ({ caricaIlMese: async () => DATI }))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))

const { default: IlMeseView } = await import('../../src/views/IlMeseView.jsx')
afterEach(() => cleanup())
const testo = () => document.body.textContent || ''

const M = mesePrima(todayLocal().slice(0, 7))
const MA = annoPrima(M)
const mese = (m, { ricavi = 99000, daClassificare = 0, personale = [{ attivo: true, stipendio_lordo_mensile: 0 }] } = {}) => {
  const incassi = incassiDelMese({ stima: { ricavi } })
  const c = {
    perCategoria: [{ id: 'materie-prime', importo: 15000, fornitori: [{ nome: 'DESA SRL', importo: 15000 }] }],
    investimenti: { importo: 0 }, daClassificare: { importo: daClassificare, nFornitori: 3, nFatture: 4 },
    copertura: { nFatture: 10, nSenzaImponibile: 0, importoIvaCompresa: 0 },
  }
  const p = personaleDelMese(personale, { mese: m })
  return { mese: m, incassi, costi: c, personale: p, conto: contoDelMese({ incassi, costi: c, personale: p }) }
}
const riquadroCol = (re) => [...document.querySelectorAll('section')].find(s => re.test(s.querySelector('h3')?.textContent || ''))

describe('Senza cause del cambio (IM14)', () => {
  it('niente riquadro con una frase sola: la cascata prende la riga, la frase sta sotto il suo titolo', async () => {
    DATI = { mese: M, confronto: MA, attuale: mese(M, { daClassificare: 30000 }), annoPrima: mese(MA, { ricavi: null }), andamento: [], perSede: null, ultimoInventario: null, errori: [] }
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Quanto hai guadagnato/))
    expect(riquadroCol(/^Il confronto con/)).toBeUndefined()
    const cascata = riquadroCol(/Le fatture valgono/)
    // A tutta riga: figlia diretta della pagina.
    expect(cascata.parentElement.classList.contains('fos-pagina-analisi')).toBe(true)
    expect(cascata.textContent).toMatch(new RegExp(`Per ${nomeMese(MA)} mancano i dati per confrontare voce per voce`))
  })

  // Dalla sera del 04/10 la cascata ha le differenze voce per voce, e il
  // perché ordinato per impatto si apre a un tocco nello stesso riquadro
  // (scelta 7): prima era un secondo riquadro accanto, sempre aperto.
  it('con le cause, il perché sta nello stesso riquadro della cascata, dietro un tocco', async () => {
    DATI = { mese: M, confronto: MA, attuale: mese(M), annoPrima: mese(MA, { ricavi: 80000 }), andamento: [], perSede: null, ultimoInventario: null, errori: [] }
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(riquadroCol(/Le fatture valgono/)).toBeTruthy())
    const perche = [...riquadroCol(/Le fatture valgono/).querySelectorAll('button')].find(b => b.textContent.startsWith('Perché'))
    expect(perche.getAttribute('aria-expanded')).toBe('false')
    await act(async () => { fireEvent.click(perche) })
    expect(document.querySelector('ul[aria-label="Che cosa è cambiato"]').closest('section')).toBe(riquadroCol(/Le fatture valgono/))
  })
})

describe('Le tre spese senza nessun dato (IM6)', () => {
  it('niente riquadro, una riga che dice quando ci saranno', async () => {
    // Materie prime incomplete (30.000 € senza voce) e personale che manca: nessuna delle tre quote.
    DATI = { mese: M, confronto: MA, attuale: mese(M, { daClassificare: 30000 }), annoPrima: null, andamento: [], perSede: null, ultimoInventario: null, errori: [] }
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Quanto hai guadagnato/))
    expect(riquadroCol(/Le tre spese che decidono il margine/)).toBeUndefined()
    const riga = [...document.querySelectorAll('p')].find(p => /Materie prime e personale sugli incassi/.test(p.textContent))
    expect(riga.textContent).toMatch(/quando le spese avranno la voce e gli stipendi ci saranno/)
  })

  it('con almeno una quota il riquadro c\'è (intorno a IM6)', async () => {
    DATI = { mese: M, confronto: MA, attuale: mese(M), annoPrima: null, andamento: [], perSede: null, ultimoInventario: null, errori: [] }
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Quanto hai guadagnato/))
    expect(riquadroCol(/Le tre spese che decidono il margine/)).toBeTruthy()
  })
})
