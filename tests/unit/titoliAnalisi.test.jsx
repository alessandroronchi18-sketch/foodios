// @vitest-environment happy-dom
//
// ── Il titolo di ogni pagina è una domanda, in dieci parole al massimo ──
//
// Audit del design del 04/10/2026 (CE9): le pagine sorelle si aprivano con
// una domanda («Quanto hai guadagnato ad agosto?», «Cosa preparo domani?»,
// «Di che cosa sono queste spese?») e il Conto economico con un'affermazione,
// «Il conto di agosto 2026». ANALISI_DESIGN regola 1: una pagina, una
// domanda; il primo numero è la risposta. §6: il titolo è una frase di dieci
// parole al massimo.
//
// Il Conto ora chiede «Dove sono andati i soldi ad agosto?». Qui si provano
// tutte e quattro, perché la regola vale per tutte.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese } from '../../src/lib/ilMese.js'
import { mesePrima, annoPrima, aMese } from '../../src/lib/formatoAnalisi.js'
import { todayLocal } from '../../src/lib/dateLocal.js'

let DATI = null
vi.mock('../../src/lib/ilMeseArchivio', () => ({ caricaIlMese: async () => DATI }))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))
vi.mock('../../src/lib/inventarioProduzione', async (o) => ({ ...(await o()), caricaRigheInventario: async () => [] }))
vi.mock('../../src/lib/giorniChiusura', async (o) => ({ ...(await o()), caricaRegoleChiusura: async () => ({ ricorrenti: [], periodi: [] }) }))

const { default: IlMeseView } = await import('../../src/views/IlMeseView.jsx')
const { default: ContoEconomicoView } = await import('../../src/views/ContoEconomicoView.jsx')
const { default: PrevisioniView } = await import('../../src/views/PrevisioniView.jsx')
const { default: ClassificaSpese } = await import('../../src/components/analisi/ClassificaSpese.jsx')

afterEach(() => cleanup())

const M = mesePrima(todayLocal().slice(0, 7))
const mese = (m, ricavi) => {
  const incassi = incassiDelMese({ stima: { ricavi } })
  const c = {
    perCategoria: [{ id: 'materie-prime', importo: 15000, fornitori: [] }],
    investimenti: { importo: 0 }, daClassificare: { importo: 0, nFornitori: 0, nFatture: 0 },
    copertura: { nFatture: 10, nSenzaImponibile: 0, importoIvaCompresa: 0 },
  }
  const p = personaleDelMese([{ attivo: true, stipendio_lordo_mensile: 2000 }], { mese: m })
  return { mese: m, incassi, costi: c, personale: p, conto: contoDelMese({ incassi, costi: c, personale: p }) }
}
DATI = {
  mese: M, confronto: annoPrima(M), attuale: mese(M, 99000), annoPrima: mese(annoPrima(M), 88000),
  andamento: [M].map(m => mese(m, 99000)), perSede: null, ultimoInventario: null, errori: [],
}
const clientVuoto = { from: () => { const q = { select: () => q, eq: () => q, in: () => q, gte: () => q, lte: () => q, order: () => q, range: () => q, then: (ok) => Promise.resolve({ data: [], error: null }).then(ok) }; return q } }

const titolo = () => document.querySelector('header h2')?.textContent || ''
const parole = (t) => t.trim().split(/\s+/).length

const PAGINE = [
  ['Il mese', () => <IlMeseView orgId="o1" sedi={[]} />],
  ['Conto economico', () => <ContoEconomicoView orgId="o1" sedi={[]} />],
  ['Di che cosa sono queste spese?', () => <ClassificaSpese orgId="o1" client={clientVuoto} oggi={new Date('2026-10-03T10:00:00')} />],
  ['Previsioni', () => <PrevisioniView orgId="o1" sedeId="s1" sedi={[{ id: 's1', nome: 'Carlina' }]} sedeAttiva={{ id: 's1', nome: 'Carlina' }} tipoAttivita="gelateria" oggi="2026-10-03" />],
]

describe('I titoli delle pagine dell\'Analisi', () => {
  for (const [nome, pagina] of PAGINE) {
    it(`${nome}: una domanda di dieci parole al massimo`, async () => {
      render(pagina())
      await waitFor(() => expect(titolo()).not.toBe(''))
      expect(titolo()).toMatch(/\?$/)
      expect(parole(titolo())).toBeLessThanOrEqual(10)
    })
  }

  it('il Conto chiede dove sono andati i soldi del mese (CE9)', async () => {
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(titolo()).toBe(`Dove sono andati i soldi ${aMese(M, { anno: false })}?`))
  })
})
