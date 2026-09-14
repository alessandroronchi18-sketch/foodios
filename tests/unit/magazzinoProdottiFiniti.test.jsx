// @vitest-environment happy-dom
//
// Scheda "Prodotti finiti": i difetti verificati il 14/09/2026 sull'elenco
// rimasto senza verifica dall'audit dell'8 set.
//
// Il piu' costoso non si vede a schermo: il pulsante "Azzera", che serve a
// cancellare una giacenza fantasma, scriveva un movimento con causale 'scarto'.
// Cioe' dichiarava buttata della merce che non era mai esistita, e gonfiava il
// registro degli sprechi con roba mai prodotta.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const scartoPF = vi.fn(async () => 0)
const rettificaPF = vi.fn(async () => 0)
let STOCK = []
let MOVIMENTI = []

vi.mock('../../src/lib/stockPF', () => ({
  loadStockPF: async () => STOCK,
  loadMovimentiPF: async () => MOVIMENTI,
  scartoPF: (...a) => scartoPF(...a),
  rettificaPF: (...a) => rettificaPF(...a),
}))
function fluente(res = { data: [], error: null }) {
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(res)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return new Proxy({}, h)
}
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: () => fluente(), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { default: MagazzinoView } = await import('../../src/views/MagazzinoView.jsx')

const base = {
  ricettario: { ricette: {}, ingredienti_costi: {} },
  magazzino: {}, setMagazzino: () => {}, logRif: [], setLogRif: () => {},
  giornaliero: [], logPrezzi: [], notify: () => {}, orgId: 'org-1', sedeId: 's1',
}

async function apriProdottiFiniti() {
  const v = render(<MagazzinoView {...base} />)
  await waitFor(() => expect(v.container.textContent).toContain('Prodotti finiti'))
  fireEvent.click(v.getByText('Prodotti finiti'))
  await waitFor(() => expect(v.container.textContent).not.toContain('Caricamento…'))
  return v
}

beforeEach(() => {
  cleanup()
  scartoPF.mockClear()
  rettificaPF.mockClear()
  STOCK = []
  MOVIMENTI = []
})

describe('prodotti finiti — quello che dicono i numeri in cima', () => {
  it('"Prodotti in stock" non conta le righe a zero', async () => {
    // La sera, con la vetrina svuotata e tutte le righe a zero, il KPI diceva
    // ancora "12 prodotti in stock": un numero che non cambia mai.
    STOCK = [
      { id: 'a', prodotto_nome: 'SACHER', quantita: 4, unita: 'pz', valore_unit: 12, soglia_min: 0, updated_at: new Date().toISOString() },
      { id: 'b', prodotto_nome: 'BIGNE', quantita: 0, unita: 'pz', valore_unit: 2, soglia_min: 0, updated_at: new Date().toISOString() },
      { id: 'c', prodotto_nome: 'TIRAMISU', quantita: 0, unita: 'pz', valore_unit: 5, soglia_min: 0, updated_at: new Date().toISOString() },
    ]
    const v = await apriProdottiFiniti()
    expect(v.container.textContent).toContain('su 3 censiti')
    const kpi = [...v.container.querySelectorAll('div')].find(d => d.textContent.trim().startsWith('Prodotti in stock'))
    expect(kpi?.textContent).toContain('1')
  })
})

describe('prodotti finiti — azzerare non e\' buttare', () => {
  it('"Azzera" scrive una rettifica, non uno scarto', async () => {
    STOCK = [{ id: 'a', prodotto_nome: 'SACHER', quantita: 6, unita: 'pz', valore_unit: 12, soglia_min: 0, updated_at: new Date().toISOString() }]
    const v = await apriProdottiFiniti()
    fireEvent.click(v.getByText('Azzera'))
    await waitFor(() => expect(v.container.textContent).toContain('Porta a zero la giacenza'))
    fireEvent.click(v.getByText('Porta a zero'))
    await waitFor(() => expect(rettificaPF).toHaveBeenCalledTimes(1))
    expect(scartoPF).not.toHaveBeenCalled()
    expect(rettificaPF.mock.calls[0][0]).toMatchObject({ prodotto: 'SACHER', delta: -6 })
  })

  it('lo scarto vero resta uno scarto, e dice quanto vale', async () => {
    STOCK = [{ id: 'a', prodotto_nome: 'SACHER', quantita: 6, unita: 'pz', valore_unit: 12, soglia_min: 0, updated_at: new Date().toISOString() }]
    const v = await apriProdottiFiniti()
    fireEvent.click(v.getByText('Scarto'))
    await waitFor(() => expect(v.container.textContent).toContain('Registra scarto'))
    const campo = v.container.querySelector('input[inputmode="decimal"]')
    fireEvent.change(campo, { target: { value: '2' } })
    // 2 pezzi da 12 € = 24 €, simbolo dopo la cifra
    await waitFor(() => expect(v.container.textContent).toContain('24 €'))
    // "Registra scarto" e' sia il titolo della finestra sia il pulsante
    const conferma = v.getAllByText('Registra scarto').find(e => e.tagName === 'BUTTON')
    fireEvent.click(conferma)
    await waitFor(() => expect(scartoPF).toHaveBeenCalledTimes(1))
    expect(rettificaPF).not.toHaveBeenCalled()
  })
})

describe('prodotti finiti — i movimenti', () => {
  it('senza movimenti la sezione resta, e lo dice', async () => {
    // Sparendo del tutto, chi cercava lo scarto di lunedi non sapeva se aveva
    // sbagliato a cercare o se non l'aveva mai registrato: e lo registrava di nuovo.
    STOCK = [{ id: 'a', prodotto_nome: 'SACHER', quantita: 2, unita: 'pz', valore_unit: 12, soglia_min: 0, updated_at: new Date().toISOString() }]
    const v = await apriProdottiFiniti()
    expect(v.container.textContent).toContain('Ancora nessun movimento in questa sede')
  })

  it('una vendita all\'ingrosso ha un nome, non la sigla del database', async () => {
    STOCK = [{ id: 'a', prodotto_nome: 'SACHER', quantita: 2, unita: 'pz', valore_unit: 12, soglia_min: 0, updated_at: new Date().toISOString() }]
    MOVIMENTI = [{ id: 'm1', prodotto_nome: 'SACHER', delta: -3, causale: 'vendita_b2b', note: '', created_at: new Date().toISOString() }]
    const v = await apriProdottiFiniti()
    expect(v.container.textContent).toContain('Vendita ingrosso')
    expect(v.container.textContent).not.toContain('vendita_b2b')
  })

  it('il delta porta l\'unita\' di misura della riga', async () => {
    // Un trasferimento di 8.400 grammi si leggeva "-8.400", identico a 8.400 pezzi.
    STOCK = [{ id: 'a', prodotto_nome: 'NOCCIOLA', quantita: 1200, unita: 'g', valore_unit: 0.02, soglia_min: 0, updated_at: new Date().toISOString() }]
    MOVIMENTI = [{ id: 'm1', prodotto_nome: 'NOCCIOLA', delta: -8400, causale: 'trasferimento_invio', note: '', created_at: new Date().toISOString() }]
    const v = await apriProdottiFiniti()
    expect(v.container.textContent).toContain('8.400 g')
  })
})
