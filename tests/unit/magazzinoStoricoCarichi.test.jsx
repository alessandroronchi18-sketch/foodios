// @vitest-environment happy-dom
//
// Scheda "Storico carichi": gli ultimi difetti dell'audit dell'8 set.
//
// Il piu' importante era anche l'unico rimasto aperto in tutta la sezione: una
// riga sbagliata non si poteva correggere ne' annullare. Un carico di 250 g
// battuto al posto di 2.500 restava li' per sempre, e la giacenza restava
// sbagliata con lui: l'unica strada era registrare uno scarico finto, che
// sporca lo storico esattamente come l'errore.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const scritture = []
vi.mock('../../src/lib/storage', () => ({
  ssave: async (k, v) => { scritture.push([k, v]) },
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

let magazzino, logRif
const props = () => ({
  ricettario: { ricette: { r1: { nome: 'SACHER', tipo: 'torta', porzioni: 8, prezzo: 30, ingredienti: [{ nome: 'burro', qty1stampo: 300 }] } }, ingredienti_costi: {} },
  magazzino, setMagazzino: (m) => { magazzino = m },
  logRif, setLogRif: (l) => { logRif = l },
  giornaliero: [], logPrezzi: [], notify: () => {},
  orgId: 'org-1', sedeId: 's1', utente: 'anita@maradeiboschi.com',
})

async function apriStorico() {
  const v = render(<MagazzinoView {...props()} />)
  await waitFor(() => expect(v.container.textContent).toContain('Storico carichi'))
  fireEvent.click(v.getByText('Storico carichi'))
  await waitFor(() => expect(v.container.textContent).toContain('Ingrediente'))
  return v
}

beforeEach(() => {
  cleanup()
  scritture.length = 0
  window.confirm = () => true
  magazzino = { burro: { nome: 'Burro', giacenza_g: 5000, soglia_g: 1000 } }
  logRif = [
    { id: 'r1', data: '2026-09-10T09:00:00.000Z', ingrediente: 'Burro', quantita_g: 2000, note: 'bolla 114', utente: 'anita@maradeiboschi.com' },
    { id: 'r2', data: '2026-09-12T09:00:00.000Z', ingrediente: 'Burro', quantita_g: -500, note: 'scarico manuale' },
  ]
})

describe('storico carichi', () => {
  it('le righe sono ordinate dalla piu recente, non come sono arrivate', async () => {
    const v = await apriStorico()
    const righe = [...v.container.querySelectorAll('tbody tr')]
    expect(righe.length).toBe(2)
    // r2 (12 set) prima di r1 (10 set), anche se nell'elenco stanno al contrario
    expect(righe[0].textContent).toContain('scarico manuale')
    expect(righe[1].textContent).toContain('bolla 114')
  })

  it('sotto il chilo si leggono i grammi, senza bisogno del pulsante kg/g', async () => {
    // Il pulsante kg/g sta solo nella scheda delle giacenze: qui "500 g"
    // diventava "0,500 kg" e non c'era modo di cambiarlo.
    const v = await apriStorico()
    expect(v.container.textContent).toContain('500 g')
    expect(v.container.textContent).toContain('2,00 kg')
  })

  it('si vede chi ha registrato il movimento', async () => {
    const v = await apriStorico()
    expect(v.container.textContent).toContain('anita')
  })

  it('annullare una riga scrive una riga uguale e contraria, e rimette a posto la giacenza', async () => {
    const v = await apriStorico()
    const annulla = [...v.container.querySelectorAll('button')].filter(b => b.textContent === 'Annulla')
    expect(annulla.length).toBe(2)
    // La prima riga in tabella e' lo scarico del 12: annulliamo quello.
    fireEvent.click(annulla[0])
    await waitFor(() => expect(scritture.length).toBeGreaterThanOrEqual(2))

    const [, mag] = scritture.find(([k]) => String(k).includes('magazzino'))
    // Era 5.000 g, lo scarico annullato era di 500 g: tornano 5.500 g
    expect(mag.burro.giacenza_g).toBe(5500)

    const [, log] = scritture.find(([k]) => String(k).includes('rif'))
    expect(log[0]).toMatchObject({ ingrediente: 'Burro', quantita_g: 500, annulla_id: 'r2' })
    // La riga sbagliata resta nello storico, segnata: quello che e' successo
    // e' successo.
    expect(log.find(x => x.id === 'r2').annullata).toBe(true)
    expect(log.find(x => x.id === 'r1').annullata).toBeUndefined()
  })

  it('una riga gia annullata non si annulla due volte', async () => {
    logRif = [{ id: 'r1', data: '2026-09-10T09:00:00.000Z', ingrediente: 'Burro', quantita_g: 2000, note: 'bolla', annullata: true }]
    const v = await apriStorico()
    const annulla = [...v.container.querySelectorAll('button')].filter(b => b.textContent === 'Annulla')
    expect(annulla.length).toBe(0)
  })
})
