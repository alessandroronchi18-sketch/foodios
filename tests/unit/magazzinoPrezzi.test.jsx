// @vitest-environment happy-dom
//
// Scheda "Prezzi ingredienti": cinque difetti verificati leggendo il codice.
//
// Il piu' grave e' un crash: il log dei prezzi chiamava
// `l.delta.toLocaleString()` senza controlli, quindi una riga storica priva del
// campo `delta` portava via l'intera scheda — non solo la sua cella.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

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

const ricettario = {
  ricette: { r1: { nome: 'SACHER', tipo: 'torta', porzioni: 8, prezzo: 30,
    ingredienti: [{ nome: 'burro', qty1stampo: 300 }] } },
  ingredienti_costi: { burro: { costoKg: 8.4, costoG: 0.0084 } },
}
const base = {
  ricettario, magazzino: { burro: { giacenza_g: 3000, soglia_g: 1000 } },
  setMagazzino: () => {}, logRif: [], setLogRif: () => {}, giornaliero: [],
  notify: () => {}, orgId: 'org-1', sedeId: 's1',
}

async function apriPrezzi(extra = {}) {
  const v = render(<MagazzinoView {...base} logPrezzi={[]} {...extra} />)
  await waitFor(() => expect(v.container.textContent).toContain('Prezzi ingredienti'))
  fireEvent.click(v.getByText('Prezzi ingredienti'))
  return v
}

beforeEach(() => cleanup())

describe('prezzi ingredienti — il log non deve far cadere la scheda', () => {
  it('una riga di log senza `delta` non porta via la pagina', async () => {
    const logPrezzi = [
      { id: 'a', data: '2026-09-01T10:00:00Z', ingrediente: 'burro', prezzoVecchio: 8, prezzoNuovo: 8.4, delta: 0.4, deltaPct: 5 },
      // riga storica malformata: nessun delta, nessun deltaPct
      { id: 'b', data: '2026-08-01T10:00:00Z', ingrediente: 'zucchero', prezzoVecchio: 1, prezzoNuovo: 1.1 },
    ]
    const v = await apriPrezzi({ logPrezzi })
    fireEvent.click(v.getByText(/Storico modifiche/i))
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    // La scheda e' in piedi e mostra entrambe le righe.
    expect(v.container.textContent).toContain('burro')
  })

  it('l\'euro sta dopo la cifra anche nello storico', async () => {
    const logPrezzi = [{ id: 'a', data: '2026-09-01T10:00:00Z', ingrediente: 'burro', prezzoVecchio: 8, prezzoNuovo: 8.4, delta: 0.4, deltaPct: 5 }]
    const v = await apriPrezzi({ logPrezzi })
    fireEvent.click(v.getByText(/Storico modifiche/i))
    await waitFor(() => expect(v.container.textContent).toContain('burro'))
    expect(v.container.textContent).toMatch(/8,00 €\/kg/)
    expect(v.container.textContent).not.toMatch(/€ 8,00/)
  })

  it('la percentuale dello storico si scrive con la virgola', async () => {
    const logPrezzi = [{ id: 'a', data: '2026-09-01T10:00:00Z', ingrediente: 'burro', prezzoVecchio: 8, prezzoNuovo: 8.4, delta: 0.4, deltaPct: 5 }]
    const v = await apriPrezzi({ logPrezzi })
    fireEvent.click(v.getByText(/Storico modifiche/i))
    await waitFor(() => expect(v.container.textContent).toContain('burro'))
    expect(v.container.textContent).toContain('5,0%')
    expect(v.container.textContent).not.toContain('5.0%')
  })
})

describe('prezzi ingredienti — modificare un prezzo', () => {
  it('un prezzo scritto male lo dice, invece di non fare niente', async () => {
    // Prima: `if (isNaN(v)) return` muto. Scrivendo "12,5o" il pulsante Salva
    // non faceva niente e non diceva niente: non si capiva se il prezzo era
    // stato rifiutato o se il pulsante era rotto.
    const v = await apriPrezzi()
    await waitFor(() => expect(v.container.textContent).toContain('burro'))
    fireEvent.click(v.getByTitle('Clicca per modificare'))
    const campo = await waitFor(() => v.getByLabelText('Prezzo per chilo di burro'))
    fireEvent.change(campo, { target: { value: 'abc' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() => expect(v.container.textContent).toContain('Scrivi un prezzo in euro per chilo'))
  })

  it('due clic rapidi su "Conferma e salva" salvano una volta sola', async () => {
    // Due righe nello storico per una modifica sola sono uno storico che non
    // torna, e uno storico che non torna e' un P&L che non torna.
    const chiamate = []
    const v = await apriPrezzi({
      onUpdatePrezzoIng: async (...a) => {
        chiamate.push(a)
        await new Promise(r => setTimeout(r, 30))
      },
    })
    await waitFor(() => expect(v.container.textContent).toContain('burro'))
    fireEvent.click(v.getByTitle('Clicca per modificare'))
    const campo = await waitFor(() => v.getByLabelText('Prezzo per chilo di burro'))
    fireEvent.change(campo, { target: { value: '9,50' } })
    fireEvent.keyDown(campo, { key: 'Enter' })

    const conferma = await waitFor(() => {
      const b = [...v.container.querySelectorAll('button')].find(x => /Conferma e salva/.test(x.textContent))
      expect(b).toBeTruthy(); return b
    })
    fireEvent.click(conferma)
    fireEvent.click(conferma)
    fireEvent.click(conferma)
    await new Promise(r => setTimeout(r, 60))
    expect(chiamate).toHaveLength(1)
  })

  it('il pulsante di conferma usa un\'icona, non il carattere ✓', async () => {
    const v = await apriPrezzi()
    await waitFor(() => expect(v.container.textContent).toContain('burro'))
    fireEvent.click(v.getByTitle('Clicca per modificare'))
    const campo = await waitFor(() => v.getByLabelText('Prezzo per chilo di burro'))
    fireEvent.change(campo, { target: { value: '9,50' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    const conferma = await waitFor(() => [...v.container.querySelectorAll('button')].find(x => /Conferma e salva/.test(x.textContent)))
    expect(conferma.querySelector('svg')).toBeTruthy()
    expect(conferma.textContent).not.toContain('✓')
  })
})
