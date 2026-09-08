// @vitest-environment happy-dom
//
// Scheda "Prodotti finiti": quattro difetti confermati dall'audit del 7/09.
//
// Il più insidioso e' il primo. I due caricatori dello stock restituivano un
// array vuoto ANCHE quando la lettura falliva (rete giù, permesso mancante):
// la scheda diceva "Nessun prodotto in stock per questa sede" e i contatori
// mostravano zero in verde. Chi guardava poteva rimettersi a produrre merce
// che aveva già in cella.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const stato = { stock: [], movimenti: [], errore: false, scarti: [] }

vi.mock('../../src/lib/stockPF', () => ({
  loadStockPF: async (o, s, opts = {}) => {
    if (stato.errore) {
      if (opts.rilancia) throw new Error('rete non raggiungibile')
      return []
    }
    return stato.stock
  },
  loadMovimentiPF: async (o, s, opts = {}) => {
    if (stato.errore) {
      if (opts.rilancia) throw new Error('rete non raggiungibile')
      return []
    }
    return stato.movimenti
  },
  scartoPF: async (a) => { stato.scarti.push(a) },
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

const props = {
  ricettario: { ricette: {}, ingredienti_costi: {} }, magazzino: {}, setMagazzino: () => {},
  logRif: [], setLogRif: () => {}, logPrezzi: [], giornaliero: [],
  notify: () => {}, orgId: 'org-1', sedeId: 's1',
}

/** Apre la scheda Prodotti finiti. */
async function apri(extra = {}) {
  const v = render(<MagazzinoView {...props} {...extra} />)
  await waitFor(() => expect(v.container.textContent).toContain('Prodotti finiti'))
  fireEvent.click(v.getByText('Prodotti finiti'))
  return v
}

beforeEach(() => {
  stato.stock = []; stato.movimenti = []; stato.errore = false; stato.scarti = []
  cleanup()
})

describe('prodotti finiti — vuoto non è lo stesso di illeggibile', () => {
  it('se la lettura fallisce lo dice, invece di mostrare "nessun prodotto"', async () => {
    stato.errore = true
    const v = await apri()
    await waitFor(() => expect(v.container.textContent).toContain('Non riesco a leggere lo stock'))
    // La frase che mentiva non c'e' piu'.
    expect(v.container.textContent).not.toContain('Nessun prodotto in stock')
    // E non si mostrano contatori a zero come se fossero un dato.
    expect(v.container.textContent).not.toContain('Pezzi totali')
    expect(v.container.textContent).toContain('Riprova')
  })

  it('con il magazzino davvero vuoto continua a dirlo', async () => {
    const v = await apri()
    await waitFor(() => expect(v.container.textContent).toContain('Nessun prodotto in stock'))
    expect(v.container.textContent).not.toContain('Non riesco a leggere')
  })
})

describe('prodotti finiti — pezzi e grammi', () => {
  it('non somma i pezzi con i grammi in un unico numero', async () => {
    // 20 torte a pezzi + 8.400 g di gelato sfuso. Prima: "8.420 pezzi totali".
    stato.stock = [
      { id: 1, prodotto_nome: 'SACHER', quantita: 20, unita: 'pz', soglia_min: 0, updated_at: null },
      { id: 2, prodotto_nome: 'NOCCIOLA', quantita: 8400, unita: 'g', soglia_min: 0, updated_at: null },
    ]
    const v = await apri()
    await waitFor(() => expect(v.container.textContent).toContain('Pezzi totali'))
    expect(v.container.textContent).toContain('20 pz')
    expect(v.container.textContent).toContain('8,40 kg sfusi')
    expect(v.container.textContent).not.toContain('8.420')
  })

  it('il modale dello scarto chiede i grammi su una riga in grammi', async () => {
    stato.stock = [{ id: 2, prodotto_nome: 'NOCCIOLA', quantita: 8400, unita: 'g', soglia_min: 0, updated_at: null }]
    const v = await apri()
    await waitFor(() => expect(v.container.textContent).toContain('NOCCIOLA'))
    fireEvent.click(v.getByText('Scarto'))
    await waitFor(() => expect(v.container.textContent).toContain('Registra scarto'))
    expect(v.container.textContent).toContain('Quantità scartata (g)')
    expect(v.container.textContent).not.toContain('Quantità scartata (pz)')
  })
})

describe('prodotti finiti — i decimali nel campo dello scarto', () => {
  it('si può scrivere una virgola senza che venga mangiata', async () => {
    stato.stock = [{ id: 2, prodotto_nome: 'NOCCIOLA', quantita: 8400, unita: 'g', soglia_min: 0, updated_at: null }]
    const v = await apri()
    await waitFor(() => expect(v.container.textContent).toContain('NOCCIOLA'))
    fireEvent.click(v.getByText('Scarto'))
    const campo = await waitFor(() => {
      const i = [...v.container.querySelectorAll('input')].find(x => x.inputMode === 'decimal')
      expect(i).toBeTruthy(); return i
    })
    // Prima: "1," passava da parseFloat, diventava 1 e la virgola sparuva.
    fireEvent.change(campo, { target: { value: '1,' } })
    expect(campo.value).toBe('1,')
    fireEvent.change(campo, { target: { value: '1,5' } })
    expect(campo.value).toBe('1,5')

    const salva = [...v.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Registra scarto')
    fireEvent.click(salva)
    await waitFor(() => expect(stato.scarti.length).toBe(1))
    // E arriva al salvataggio come numero, non come stringa.
    expect(stato.scarti[0].quantita).toBe(1.5)
  })

  it('a campo vuoto non compare uno zero, e non si può salvare', async () => {
    stato.stock = [{ id: 1, prodotto_nome: 'SACHER', quantita: 20, unita: 'pz', soglia_min: 0, updated_at: null }]
    const v = await apri()
    await waitFor(() => expect(v.container.textContent).toContain('SACHER'))
    fireEvent.click(v.getByText('Scarto'))
    const campo = await waitFor(() => [...v.container.querySelectorAll('input')].find(x => x.inputMode === 'decimal'))
    expect(campo.value).toBe('')
    const salva = [...v.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Registra scarto')
    expect(salva.disabled).toBe(true)
    fireEvent.click(salva)
    await new Promise(r => setTimeout(r, 0))
    expect(stato.scarti).toHaveLength(0)
  })
})
