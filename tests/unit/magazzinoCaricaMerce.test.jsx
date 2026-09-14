// @vitest-environment happy-dom
//
// Scheda "Carica merce": i difetti verificati il 14/09/2026.
//
// Tutti e quattro nascono dallo stesso posto — il tablet appoggiato al bancone,
// che e' dove questa scheda si usa davvero: la virgola della tastiera italiana
// che il campo scartava, la barra spaziatrice sfiorata per sbaglio che creava
// una riga senza nome, il modo "scarico" che restava impostato dopo il
// salvataggio, e l'Invio che non confermava.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const salvato = []
vi.mock('../../src/lib/storage', () => ({
  ssave: async (k, v) => { salvato.push([k, v]) },
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

const { default: MagazzinoView } = await import('../../src/views/MagazzinoView.jsx')

let magazzino
const base = () => ({
  ricettario: { ricette: { r1: { nome: 'SACHER', tipo: 'torta', porzioni: 8, prezzo: 30, ingredienti: [{ nome: 'burro', qty1stampo: 300 }] } }, ingredienti_costi: {} },
  magazzino, setMagazzino: (m) => { magazzino = m }, logRif: [], setLogRif: () => {},
  giornaliero: [], logPrezzi: [], notify: () => {}, orgId: 'org-1', sedeId: 's1',
})

async function apriCarica() {
  const v = render(<MagazzinoView {...base()} />)
  await waitFor(() => expect(v.container.textContent).toContain('Carica merce'))
  fireEvent.click(v.getByText('Carica merce'))
  await waitFor(() => expect(document.getElementById('mag-qty-input')).toBeTruthy())
  return v
}

beforeEach(() => {
  cleanup()
  salvato.length = 0
  magazzino = { burro: { nome: 'Burro', giacenza_g: 4000, soglia_g: 1000 } }
})

describe('carica merce — il tablet sul bancone', () => {
  it('il campo quantita accetta la virgola della tastiera italiana', async () => {
    const v = await apriCarica()
    const qty = document.getElementById('mag-qty-input')
    // type="number" scartava "1,5" e lasciava il campo vuoto: il pulsante
    // restava grigio e il programma sembrava rotto.
    expect(qty.getAttribute('type')).toBe('text')
    expect(qty.getAttribute('inputmode')).toBe('decimal')
    fireEvent.change(document.getElementById('mag-ing-input'), { target: { value: 'burro' } })
    fireEvent.change(qty, { target: { value: '1,5' } })
    expect(qty.value).toBe('1,5')
    const bottone = v.getByText(/Aggiungi al magazzino/).closest('button')
    expect(bottone.disabled).toBe(false)
  })

  it('un nome fatto di soli spazi non crea una riga senza nome', async () => {
    const v = await apriCarica()
    fireEvent.change(document.getElementById('mag-ing-input'), { target: { value: '   ' } })
    fireEvent.change(document.getElementById('mag-qty-input'), { target: { value: '500' } })
    const bottone = v.getByText(/Aggiungi al magazzino/).closest('button')
    expect(bottone.disabled).toBe(true)
  })

  it('si conferma con Invio dal campo quantita', async () => {
    await apriCarica()
    fireEvent.change(document.getElementById('mag-ing-input'), { target: { value: 'burro' } })
    fireEvent.change(document.getElementById('mag-qty-input'), { target: { value: '500' } })
    fireEvent.keyDown(document.getElementById('mag-qty-input'), { key: 'Enter' })
    await waitFor(() => expect(salvato.length).toBeGreaterThan(0))
    const [, mag] = salvato.find(([k]) => String(k).includes('magazzino'))
    expect(mag.burro.giacenza_g).toBe(4500)
  })

  it('i suggerimenti propongono il nome vero, non la chiave normalizzata', async () => {
    await apriCarica()
    const opzioni = [...document.querySelectorAll('#ing-list option')].map(o => o.value)
    // "Burro" con la maiuscola, com'e' scritto in magazzino: la lista proponeva
    // "burro" normalizzato e il carico rinominava l'ingrediente.
    expect(opzioni).toContain('Burro')
  })
})
