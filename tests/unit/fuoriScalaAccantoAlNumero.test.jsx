// @vitest-environment happy-dom
//
// Le fatture fuori scala nel «Il mese»: accanto al numero delle spese, non in
// un riquadro a parte.
//
// Trovato il 04/10/2026 (audit del design + regola §6 di ANALISI_DESIGN.md:
// l'avvertimento che cambia come si legge un numero sta accanto al numero).
// La fattura GECKO da 86.651 € di luglio, probabilmente un investimento,
// veniva segnalata da un riquadro giallo grande sotto le tessere, mentre la
// tessera «Spese del mese» la contava senza dire niente: chi leggeva il
// numero delle spese non sapeva che dentro c'era una spesa da anni, non da
// un mese. Ora il conto sta sotto il numero (avviso) e il dettaglio, con
// «Apri», sta nella copertura dei dati.

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { incassiDelMese, personaleDelMese, contoDelMese } from '../../src/lib/ilMese.js'
import { mesePrima, annoPrima } from '../../src/lib/formatoAnalisi.js'
import { todayLocal } from '../../src/lib/dateLocal.js'

let DATI = null
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false, useDevice: () => 'computer' }))
vi.mock('../../src/lib/ilMeseArchivio', () => ({ caricaIlMese: async () => DATI }))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))

const { default: IlMeseView, vociCopertura } = await import('../../src/views/IlMeseView.jsx')
afterEach(() => cleanup())
const testo = () => document.body.textContent || ''
const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const M = mesePrima(todayLocal().slice(0, 7))
const GECKO = { id: 'f1', fornitore: 'GECKO SRL', importo: 86651, data: `${M}-12`, motivo: 'cinque volte la sua media' }
const FORNO = { id: 'f2', fornitore: 'FORNI ROSSI', importo: 12000, data: `${M}-20`, motivo: 'mai vista prima' }
const mese = (m, eccezionali) => {
  const incassi = incassiDelMese({ stima: { ricavi: 99000 } })
  const c = {
    perCategoria: [{ id: 'materie-prime', importo: 15000, fornitori: [] }],
    investimenti: { importo: 0 }, daClassificare: { importo: 0, nFornitori: 0, nFatture: 0 },
    copertura: { nFatture: 40, nSenzaImponibile: 0, importoIvaCompresa: 0 },
  }
  const p = personaleDelMese([{ attivo: true, stipendio_lordo_mensile: 0 }], { mese: m })
  return { mese: m, incassi, costi: c, personale: p, eccezionali, conto: contoDelMese({ incassi, costi: c, personale: p }) }
}
const conDati = (eccezionali) => ({
  mese: M, confronto: annoPrima(M), attuale: mese(M, eccezionali), annoPrima: mese(annoPrima(M), []),
  andamento: [mese(M, eccezionali)], perSede: null, ultimoInventario: null, errori: [],
})
const tessera = (re) => [...document.querySelectorAll('div')].find(d => d.style.gridTemplateRows === 'subgrid' && re.test(d.firstElementChild?.textContent || ''))
const avvisoIn = (el) => el?.querySelector('[role="note"]')?.textContent || ''

describe('la copertura del Mese nomina le fatture fuori scala', () => {
  it('una fattura: voce sua, col fornitore, l\'importo e dove guardarla', () => {
    const vai = vi.fn()
    const v = vociCopertura(conDati([GECKO]), { onNavigate: vai }).find(x => x.id === 'fuoriScala')
    expect(v.breve).toBe('1 fattura fuori scala')
    expect(v.testo).toMatch(/GECKO SRL, 86\.651 €/)
    expect(v.testo).toMatch(/investimenti/)
    expect(v.azione.etichetta).toBe('Apri')
    v.azione.onClick()
    expect(vai).toHaveBeenCalledWith('scadenzario')
  })

  it('più fatture: il plurale, e tutte nominate', () => {
    const v = vociCopertura(conDati([GECKO, FORNO])).find(x => x.id === 'fuoriScala')
    expect(v.breve).toBe('2 fatture fuori scala')
    expect(v.testo).toMatch(/GECKO SRL.*FORNI ROSSI/)
    // Senza navigazione non c'è un pulsante che non porta da nessuna parte.
    expect(v.azione).toBeNull()
  })

  it('senza fatture fuori scala, nessuna voce', () => {
    expect(vociCopertura(conDati([])).some(x => x.id === 'fuoriScala')).toBe(false)
  })
})

describe('la tessera delle spese lo dice sotto il numero', () => {
  it('una fattura: «è un investimento?», con l\'importo', async () => {
    DATI = conDati([GECKO])
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Quanto hai guadagnato/))
    expect(avvisoIn(tessera(/^Spese del mese/))).toMatch(/una fattura fuori scala \(86\.651 €\): è un investimento\?/)
  })

  it('due fatture: il plurale e la somma', async () => {
    DATI = conDati([GECKO, FORNO])
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Quanto hai guadagnato/))
    expect(avvisoIn(tessera(/^Spese del mese/))).toMatch(/2 fatture fuori scala \(98\.651 €\): sono investimenti\?/)
  })

  it('senza fatture fuori scala la tessera non ne parla', async () => {
    DATI = conDati([])
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Quanto hai guadagnato/))
    expect(avvisoIn(tessera(/^Spese del mese/))).not.toMatch(/fuori scala/)
  })

  it('e il riquadro giallo a parte non c\'è più', async () => {
    DATI = conDati([GECKO])
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Quanto hai guadagnato/))
    expect(testo()).not.toMatch(/fuori scala questo mese/)
    const s = readFileSync(join(RADICE, 'src', 'views', 'IlMeseView.jsx'), 'utf8')
    expect(s).not.toMatch(/fatture fuori scala questo mese/)
  })
})
