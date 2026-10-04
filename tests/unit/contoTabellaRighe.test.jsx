// @vitest-environment happy-dom
//
// ── La tabella del conto: righe alte uguali, bersagli da 44 px ──────────
//
// Audit del design del 04/10/2026, misurato con Chromium:
//   • CE4: le righe che si aprono erano alte 47 px, le altre 44 (il pulsante
//     della freccia alto 28 dentro un'imbottitura di 9, fuori dalla griglia
//     di 4): scorrendo la tabella il passo cambiava sotto «Da classificare»;
//   • CE5: al tocco (tablet, computer con lo schermo da toccare) la freccia
//     della voce era un bersaglio alto 28 px, sotto i 44.
//
// Ora ogni riga è alta 44 px senza imbottitura verticale, e il pulsante che
// apre la voce occupa tutta l'altezza della riga.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese } from '../../src/lib/ilMese.js'
import { mesePrima, annoPrima } from '../../src/lib/formatoAnalisi.js'
import { todayLocal } from '../../src/lib/dateLocal.js'

let DATI = null
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false, useDevice: () => 'computer' }))
vi.mock('../../src/lib/ilMeseArchivio', () => ({ caricaIlMese: async () => DATI }))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))

const { default: ContoEconomicoView } = await import('../../src/views/ContoEconomicoView.jsx')
afterEach(() => cleanup())

const M = mesePrima(todayLocal().slice(0, 7))
const mese = (m, mp) => {
  const incassi = incassiDelMese({ stima: { ricavi: 99000 } })
  const c = {
    perCategoria: [
      { id: 'materie-prime', importo: mp, fornitori: [{ nome: 'DESA SRL', importo: mp }] },
      { id: 'confezionamento', importo: 3000, fornitori: [{ nome: 'CONO ARTIC', importo: 3000 }] },
    ],
    investimenti: { importo: 0 },
    daClassificare: { importo: 5000, nFornitori: 2, nFatture: 3, fornitori: [{ nome: 'GECKO', importo: 5000 }] },
    copertura: { nFatture: 10, nSenzaImponibile: 0, importoIvaCompresa: 0 },
  }
  const p = personaleDelMese([{ attivo: true, stipendio_lordo_mensile: 2000 }], { mese: m })
  return { mese: m, incassi, costi: c, personale: p, conto: contoDelMese({ incassi, costi: c, personale: p }) }
}
DATI = {
  mese: M, confronto: annoPrima(M), attuale: mese(M, 15000), annoPrima: mese(annoPrima(M), 13000),
  andamento: [M].map(m => mese(m, 15000)), perSede: null, ultimoInventario: null, errori: [],
}

describe('La tabella del conto al computer', () => {
  it('ogni riga è alta uguale, 44 px più il filo, senza imbottitura verticale (CE4)', async () => {
    render(<ContoEconomicoView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(4))
    const celle = [...document.querySelectorAll('tbody tr td')]
    // 44 px di riga più 1 di filo sotto, che con box-sizing border-box sta dentro la cella.
    expect(new Set(celle.map(td => td.style.height))).toEqual(new Set(['45px']))
    expect(celle.filter(td => td.style.paddingTop && td.style.paddingTop !== '0px')).toEqual([])
    // Le apribili e le altre hanno lo stesso passo: nessuna eccezione.
  })

  it('il pulsante che apre una voce è alto quanto la riga (CE5)', async () => {
    render(<ContoEconomicoView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(document.querySelectorAll('tbody button[aria-expanded]').length).toBeGreaterThan(0))
    for (const b of document.querySelectorAll('tbody button')) {
      expect(parseFloat(b.style.minHeight)).toBeGreaterThanOrEqual(44)
    }
  })
})
