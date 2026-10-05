// @vitest-environment happy-dom
//
// Costi fissi: i totali nel kit dell'Analisi, e da cosa sono fatti.
//
// Difetti del 05/10/2026 (pagina a 76):
//  1. Con zero voci (Mara oggi) i tre riquadri dicevano «-», «-», «-»: non si
//     capiva cosa scrivere. Nelle fatture di Mara non c'è l'affitto dei
//     negozi (solo il garage): è un dato da chiedere, e va chiesto a parole.
//  2. Il totale delle voci e quello «già dalle fatture» non erano né sommati
//     né distinti: chi leggeva «1.200 €» non sapeva di cosa fosse fatto.
//  3. Il vuoto passava per un «-» e il design aveva gradiente e cerchio.
// Questi test falliscono sul codice di prima (nessuna di queste frasi c'era).

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'

vi.mock('../../src/lib/supabase', () => {
  const RES = { data: [], error: null }
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(RES)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return { supabase: { from: () => new Proxy({}, h), rpc: () => Promise.resolve({ data: null, error: null }) } }
})
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false, useDevice: () => 'computer' }))
vi.mock('../../src/lib/dateLocal', async (orig) => ({ ...(await orig()), todayLocal: () => '2026-10-05' }))

let FATTURE = []
let VOCI = []
vi.mock('../../src/lib/contoEconomicoArchivio', async (orig) => ({
  ...(await orig()),
  leggiFatturePeriodo: async () => ({ fatture: FATTURE }),
  leggiCategorieFornitori: async () => ({ fornitori: [], categoriePerFornitore: {} }),
}))
vi.mock('../../src/lib/costiAziendali', async (orig) => ({
  ...(await orig()),
  caricaCostiAziendali: async () => VOCI,
}))

const { composizioneFissi, invitoPrimaVoce } = await import('../../src/components/costiFissi/TotaliCostiFissi.jsx')
const { default: CostiAziendaliView } = await import('../../src/views/CostiAziendaliView.jsx')

const SEDI = [{ id: 'C', nome: 'Carlina' }, { id: 'B', nome: 'Berthollet' }]
function mensili(fornitore, imponibile, da, a) {
  const out = []
  for (let m = da; m <= a;) {
    out.push({ fornitore, data_fattura: `${m}-10`, imponibile, imposta: imponibile * 0.22, totale: imponibile * 1.22, sede_id: 'C', numero_rif: `${fornitore}-${m}` })
    const [y, mm] = m.split('-').map(Number)
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`
  }
  return out
}
const voce = (o) => ({ id: o.voce, organization_id: 'o', sede_id: null, categoria: 'affitti', periodicita: 'mensile', note: '', data_inizio: '', data_fine: '', ...o })
const GARAGE = () => mensili('GARAGE ROMA SRL', 200, '2025-10', '2026-09')
const testo = () => document.body.textContent

async function apri(props = {}) {
  render(<CostiAziendaliView orgId="o" sedeId={null} sedi={SEDI} notify={() => {}} {...props} />)
  await waitFor(() => expect(screen.queryByText('Caricamento…')).toBeNull())
}
afterEach(() => { cleanup(); FATTURE = []; VOCI = [] })

describe('composizioneFissi: da cosa è fatto il totale', () => {
  it('voci + fatture: somma e lo dice', () => {
    const r = composizioneFissi({ totVoci: 1000, nVoci: 2, totFatture: 200 })
    expect(r.totale).toBe(1200)
    expect(r.frase).toBe('1.000 € dalle tue 2 voci + 200 € già dalle fatture.')
  })
  it('fatture non sommabili (una sede sola): solo le voci, e lo dice', () => {
    const r = composizioneFissi({ totVoci: 1000, nVoci: 1, totFatture: null })
    expect(r.totale).toBe(1000)
    expect(r.frase).toContain('1.000 € dalle tue 1 voce')
    expect(r.frase).toContain('non si sommano')
  })
  it('nessuna spesa fissa dalle fatture: non inventa una somma', () => {
    expect(composizioneFissi({ totVoci: 500, nVoci: 1, totFatture: 0 }).totale).toBe(500)
  })
  it('l\'invito chiede sempre l\'affitto dei negozi (il garage in fattura non è quello)', () => {
    expect(invitoPrimaVoce()).toContain('l\'affitto di ogni negozio')
  })
})

describe('la pagina con zero voci', () => {
  it('invita a scrivere affitti, rate, assicurazioni, TARI; niente «-» al posto del numero', async () => {
    FATTURE = GARAGE()
    await apri()
    expect(testo()).toContain('l\'affitto di ogni negozio, le rate, le assicurazioni, la TARI')
    // il numero che si sa (il garage in fattura) è mostrato come tale
    await waitFor(() => expect(testo()).toContain('Già dalle fatture, al mese'))
  })
  it('gli esempi aprono il modulo sulla categoria giusta', async () => {
    await apri()
    fireEvent.click(screen.getByRole('button', { name: 'Scrivi: Le assicurazioni' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByDisplayValue('Assicurazioni')).toBeTruthy()
  })
  it('il vuoto non scrive mai «0 €»', async () => {
    await apri()
    expect(testo()).not.toMatch(/(^|[^\d.,])0 €/)
  })
})

describe('la pagina con voci e fatture', () => {
  it('il totale è voci + fatture e dice da cosa è fatto', async () => {
    FATTURE = GARAGE()
    VOCI = [voce({ voce: 'Affitto Carlina', importo: 1000 })]
    await apri()
    await waitFor(() => expect(testo()).toContain('1.000 € dalle tue 1 voce + 200 € già dalle fatture.'))
    expect(testo()).toContain('1.200 €')
  })
  it('per una sede sola non somma le fatture e lo dice', async () => {
    FATTURE = GARAGE()
    VOCI = [voce({ voce: 'Affitto Carlina', importo: 1000, sede_id: 'C' })]
    await apri({ sedeId: 'C' })
    fireEvent.click(screen.getByRole('button', { name: 'Sede: Carlina' }))
    expect(testo()).toContain('non si sommano')
    expect(testo()).not.toContain('già dalle fatture.')
  })
})
