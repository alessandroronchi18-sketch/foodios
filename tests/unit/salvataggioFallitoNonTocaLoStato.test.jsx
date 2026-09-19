// @vitest-environment happy-dom
//
// ── Se il salvataggio non riesce, a schermo non deve cambiare niente ──────
//
// La regola sta in CLAUDE.md e nasce da un audit del 30/05/2026 che trovò
// sei punti scritti al contrario: prima `setState(...)`, poi `await ssave(...)`.
// Quando il salvataggio falliva — rete caduta, sessione scaduta, tablet in
// laboratorio col wifi che va e viene — la pagina mostrava il dato nuovo e il
// database teneva quello vecchio. L'utente vedeva «fatto», ricaricava il
// giorno dopo, e il carico di merce non c'era più. È la peggiore delle perdite
// di dati, perché non lascia traccia: nessun errore, solo un numero che torna
// indietro da solo.
//
// 19/09/2026, audit della suite: in tutta la suite **un solo test** faceva
// fallire `ssave` (`rese.test.js:83`). La regola era scritta dappertutto nei
// commenti e provata quasi da nessuna parte — cioè esattamente la situazione
// in cui sta prima di rompersi di nuovo.
//
// Qui si prova sul Magazzino, che è il posto dove il danno costa di più:
// le giacenze alimentano la lista della spesa, le soglie di riordino e il
// fabbisogno della produzione.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const salvato = []
let ssaveFallisce = false
vi.mock('../../src/lib/storage', () => ({
  ssave: async (k, v) => {
    if (ssaveFallisce) throw new Error('rete non raggiungibile')
    salvato.push([k, v])
  },
  sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
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
vi.mock('../../src/lib/stockPF', () => ({
  loadStockPF: async () => [], loadMovimentiPF: async () => [], scartoPF: async () => 0, rettificaPF: async () => 0,
}))

const { default: MagazzinoView } = await import('../../src/views/MagazzinoView.jsx')

let magazzino
const avvisi = []
const base = () => ({
  ricettario: { ricette: { r1: { nome: 'SACHER', tipo: 'torta', unita: 8, prezzo: 30,
    ingredienti: [{ nome: 'burro', qty1stampo: 300 }] } }, ingredienti_costi: {} },
  magazzino,
  setMagazzino: (m) => { magazzino = m },
  logRif: [], setLogRif: () => {}, giornaliero: [], logPrezzi: [],
  notify: (testo, ok = true) => { avvisi.push([testo, ok]) },
  orgId: 'org-1', sedeId: 's1',
})

async function apriCarica() {
  const v = render(<MagazzinoView {...base()} />)
  await waitFor(() => expect(v.container.textContent).toContain('Carica merce'))
  fireEvent.click(v.getByText('Carica merce'))
  await waitFor(() => expect(document.getElementById('mag-qty-input')).toBeTruthy())
  return v
}

beforeEach(() => {
  try { sessionStorage.clear() } catch { /* niente */ }
  cleanup()
  salvato.length = 0
  avvisi.length = 0
  ssaveFallisce = false
  magazzino = { burro: { nome: 'Burro', giacenza_g: 4000, soglia_g: 1000 } }
})

describe('magazzino — un salvataggio fallito non muove le giacenze', () => {
  it('il righello: quando il salvataggio riesce, la giacenza cambia davvero', async () => {
    // Se questa non passa, la prova qui sotto non dimostra niente: potrebbe
    // essere il banco di prova che non preme il pulsante.
    await apriCarica()
    fireEvent.change(document.getElementById('mag-ing-input'), { target: { value: 'burro' } })
    fireEvent.change(document.getElementById('mag-qty-input'), { target: { value: '500' } })
    fireEvent.keyDown(document.getElementById('mag-qty-input'), { key: 'Enter' })
    await waitFor(() => expect(magazzino.burro.giacenza_g).toBe(4500))
  })

  it('con la rete caduta la giacenza resta quella di prima', async () => {
    await apriCarica()
    ssaveFallisce = true
    fireEvent.change(document.getElementById('mag-ing-input'), { target: { value: 'burro' } })
    fireEvent.change(document.getElementById('mag-qty-input'), { target: { value: '500' } })
    fireEvent.keyDown(document.getElementById('mag-qty-input'), { key: 'Enter' })
    await waitFor(() => expect(avvisi.length).toBeGreaterThan(0))
    expect(magazzino.burro.giacenza_g,
      'il carico è entrato nello stato a schermo ma non nel database').toBe(4000)
  })

  it('e lo dice, invece di far finta che sia andata bene', async () => {
    await apriCarica()
    ssaveFallisce = true
    fireEvent.change(document.getElementById('mag-ing-input'), { target: { value: 'burro' } })
    fireEvent.change(document.getElementById('mag-qty-input'), { target: { value: '500' } })
    fireEvent.keyDown(document.getElementById('mag-qty-input'), { key: 'Enter' })
    await waitFor(() => expect(avvisi.length).toBeGreaterThan(0))
    const [testo, ok] = avvisi[avvisi.length - 1]
    expect(ok, 'l\'avviso è verde: sembra che sia andato tutto bene').toBe(false)
    // In italiano, e dice cosa NON è successo: il difetto di prima era un
    // messaggio verde di conferma sopra un salvataggio fallito.
    expect(testo.toLowerCase()).toContain('non ho potuto salvare')
    expect(testo.toLowerCase()).not.toMatch(/error|failed|exception|undefined/)
  })

  it('e il pulsante torna utilizzabile: non resta bloccato su «sto salvando»', async () => {
    // Quello che c'è intorno: se `setSaving(false)` mancasse nel ramo
    // dell'errore, la pagina resterebbe congelata e l'unica via d'uscita
    // sarebbe ricaricare — perdendo quello che si stava scrivendo.
    const v = await apriCarica()
    ssaveFallisce = true
    fireEvent.change(document.getElementById('mag-ing-input'), { target: { value: 'burro' } })
    fireEvent.change(document.getElementById('mag-qty-input'), { target: { value: '500' } })
    fireEvent.keyDown(document.getElementById('mag-qty-input'), { key: 'Enter' })
    await waitFor(() => expect(avvisi.length).toBeGreaterThan(0))
    const bottone = v.getByText(/Aggiungi al magazzino/).closest('button')
    await waitFor(() => expect(bottone.disabled).toBe(false))
  })

  it('e riprovando quando la rete torna, il carico va a buon fine una volta sola', async () => {
    await apriCarica()
    ssaveFallisce = true
    fireEvent.change(document.getElementById('mag-ing-input'), { target: { value: 'burro' } })
    fireEvent.change(document.getElementById('mag-qty-input'), { target: { value: '500' } })
    fireEvent.keyDown(document.getElementById('mag-qty-input'), { key: 'Enter' })
    await waitFor(() => expect(avvisi.length).toBeGreaterThan(0))
    // La rete torna: lo stesso carico, rifatto.
    ssaveFallisce = false
    fireEvent.change(document.getElementById('mag-ing-input'), { target: { value: 'burro' } })
    fireEvent.change(document.getElementById('mag-qty-input'), { target: { value: '500' } })
    fireEvent.keyDown(document.getElementById('mag-qty-input'), { key: 'Enter' })
    await waitFor(() => expect(magazzino.burro.giacenza_g).toBe(4500))
    // 4.500, non 5.000: il tentativo fallito non deve aver lasciato residui.
    expect(magazzino.burro.giacenza_g).toBe(4500)
  })
})
