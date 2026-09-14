// @vitest-environment happy-dom
//
// Produzione: quattro difetti di perdita dati, verificati leggendo il codice.
//
// I primi due si combinano in un danno peggiore della somma. Lo scarico
// SALTAVA IN SILENZIO gli ingredienti la cui chiave in magazzino non era
// canonica (in un'azienda reale sono 5 su 35: "uova", "nocciole", "mirtilli",
// "mandorle", "noci", che normIng porta al singolare). Poi l'eliminazione
// della sessione CREAVA una voce nuova con la quantita' teorica intera.
//
// Quindi: produci — le uova non vengono scalate. Elimini la sessione — nasce
// una voce "uovo" con tutta la quantita'. Il magazzino e' CRESCIUTO di merce
// che non e' mai entrata, e nessuno puo' accorgersene guardando la pagina.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const scritte = { mag: null, gior: null }

vi.mock('../../src/lib/storage', () => ({
  ssave: async (key, val) => {
    if (key === 'pasticceria-magazzino-v1') scritte.mag = val
    if (key === 'pasticceria-giornaliero-v1') scritte.gior = val
  },
  ssaveBatch: async (voci) => {
    for (const v of (voci || [])) {
      if (v.key === 'pasticceria-magazzino-v1') scritte.mag = v.value
      if (v.key === 'pasticceria-giornaliero-v1') scritte.gior = v.value
    }
  },
  sload: async () => null, sloadAllSedi: async () => ({}),
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
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            getUser: () => Promise.resolve({ data: { user: null } }) },
    from: () => fluente(), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/lib/stockPF', () => ({
  caricoProduzionePF: async () => ({ ok: true }), scartoPF: async () => ({ ok: true }),
}))
vi.mock('../../src/lib/trasferimenti', () => ({ creaTrasferimento: async () => ({ ok: true }) }))

const { default: Produzione } = await import('../../src/views/ProduzioneGiornalieraView.jsx')
const { normIng } = await import('../../src/lib/foodcost.js')

// Il caso reale: la giacenza e' salvata al PLURALE, la ricetta la usa al
// plurale, e normIng porta entrambi al singolare.
const ricettario = {
  ricette: {
    r1: { nome: 'PASTA FROLLA', tipo: 'torta', porzioni: 8, prezzo: 20, unita: 8,
          ingredienti: [{ nome: 'uova', qty1stampo: 200 }, { nome: 'farina 00', qty1stampo: 500 }] },
  },
  ingredienti_costi: { uovo: { costoKg: 4.2, costoG: 0.0042 }, 'farina 00': { costoKg: 0.95, costoG: 0.00095 } },
}
const magazzino = {
  uova: { giacenza_g: 4800, soglia_g: 1000, nome: 'uova' },
  'farina 00': { giacenza_g: 28000, soglia_g: 5000, nome: 'farina 00' },
}

const props = {
  ricettario, magazzino, setMagazzino: () => {}, giornaliero: [], setGiornaliero: () => {},
  notify: () => {}, sedi: [{ id: 's1', nome: 'Torino', attiva: true }],
  sedeAttiva: { id: 's1', nome: 'Torino' }, orgId: 'org-1', sedeId: 's1',
}

beforeEach(() => { scritte.mag = null; scritte.gior = null; cleanup() })

describe('produzione — lo scarico trova gli ingredienti col nome vecchio', () => {
  it('normIng porta "uova" a "uovo": e\' il presupposto del bug', () => {
    expect(normIng('uova')).toBe('uovo')
    expect(normIng('farina 00')).toBe('farina 00')
  })

  it('scala anche l\'ingrediente salvato al plurale, invece di saltarlo', async () => {
    const v = render(<Produzione {...props} />)
    await waitFor(() => expect(v.container.textContent).toContain('PASTA FROLLA'))

    // Due stampi: 400 g di uova e 1.000 g di farina.
    const campi = [...v.container.querySelectorAll('input[type="number"], input[inputmode="decimal"]')]
    expect(campi.length).toBeGreaterThan(0)
    fireEvent.change(campi[0], { target: { value: '2' } })

    const conferma = [...v.container.querySelectorAll('button')].find(b => /Registra|Conferma/i.test(b.textContent))
    expect(conferma).toBeTruthy()
    fireEvent.click(conferma)
    // Se c'e' una seconda conferma, premila.
    await new Promise(r => setTimeout(r, 20))
    const conferma2 = [...v.container.querySelectorAll('button')].find(b => /Confermo|Conferma/i.test(b.textContent))
    if (conferma2) fireEvent.click(conferma2)

    await waitFor(() => expect(scritte.mag).toBeTruthy(), { timeout: 3000 })
    // Prima: `magazzino["uovo"]` non esisteva, quindi le uova non venivano
    // MAI scalate e restavano 4.800.
    expect(scritte.mag.uova.giacenza_g).toBe(4400)
    expect(scritte.mag['farina 00'].giacenza_g).toBe(27000)
    // E non si e' creata nessuna voce canonica fantasma.
    expect(scritte.mag.uovo).toBeUndefined()
  })

  it('registra quanto ha scalato e da quale chiave', async () => {
    const v = render(<Produzione {...props} />)
    await waitFor(() => expect(v.container.textContent).toContain('PASTA FROLLA'))
    const campi = [...v.container.querySelectorAll('input[type="number"], input[inputmode="decimal"]')]
    fireEvent.change(campi[0], { target: { value: '2' } })
    const conferma = [...v.container.querySelectorAll('button')].find(b => /Registra|Conferma/i.test(b.textContent))
    fireEvent.click(conferma)
    await new Promise(r => setTimeout(r, 20))
    const conferma2 = [...v.container.querySelectorAll('button')].find(b => /Confermo|Conferma/i.test(b.textContent))
    if (conferma2) fireEvent.click(conferma2)

    await waitFor(() => expect(scritte.gior).toBeTruthy(), { timeout: 3000 })
    const sess = scritte.gior[0]
    // La sessione porta il consumo REALE per chiave: e' l'unica informazione
    // con cui l'eliminazione puo' restituire la quantita' giusta al posto giusto.
    expect(sess.scalatoPerChiave).toBeTruthy()
    expect(sess.scalatoPerChiave.uova).toBe(400)
    expect(sess.scalatoPerChiave['farina 00']).toBe(1000)
  })
})

describe('produzione — i difetti verificati il 14/09', () => {
  it('non dichiara "scorte insufficienti" su un ingrediente che c\'è', async () => {
    // L'allarme leggeva la giacenza dalla chiave canonica ("uovo") mentre il
    // magazzino la tiene al plurale ("uova"): risultato zero, allarme rosso
    // ogni giorno su un ingrediente pieno. Lo scarico era stato corretto il 9
    // set, l'allarme no.
    const v = render(<Produzione {...props} />)
    await waitFor(() => expect(v.container.textContent).toContain('PASTA FROLLA'))
    const campi = [...v.container.querySelectorAll('input[type="number"], input[inputmode="decimal"]')]
    fireEvent.change(campi[0], { target: { value: '2' } })
    await waitFor(() => expect(v.container.textContent).toContain('Riepilogo'))
    expect(v.container.textContent).not.toContain('Scorte insufficienti')
  })

  it('una quantità negativa non entra nella sessione', async () => {
    const v = render(<Produzione {...props} />)
    await waitFor(() => expect(v.container.textContent).toContain('PASTA FROLLA'))
    const campi = [...v.container.querySelectorAll('input[type="number"], input[inputmode="decimal"]')]
    fireEvent.change(campi[0], { target: { value: '-5' } })
    // Zero, non meno cinque: un numero negativo non si scrive per scelta.
    expect(campi[0].value === '' || Number(campi[0].value) >= 0).toBe(true)
    expect(v.container.textContent).not.toContain('-5 stampi')
  })

  it('avvisa se per quel giorno una sessione c\'è già', async () => {
    const oggi = new Date().toISOString().slice(0, 10)
    const v = render(<Produzione {...props} giornaliero={[{ id: 'g1', data: oggi, prodotti: [], ingredientiUsati: {} }]} />)
    await waitFor(() => expect(v.container.textContent).toContain('PASTA FROLLA'))
    expect(v.container.textContent).toContain('una sessione c\'è già')
  })
})
