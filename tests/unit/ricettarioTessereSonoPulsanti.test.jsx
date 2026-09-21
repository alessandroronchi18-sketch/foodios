// @vitest-environment happy-dom
//
// ── Le tessere del Ricettario si aprono anche senza mouse ───────────────
//
// La vista a tessere del Ricettario mostra una griglia di riquadri, uno per
// gusto. Toccarne uno apre la ricetta: è **il comando principale della
// pagina**, quello per cui uno apre il Ricettario.
//
// ── Il difetto (21/09/2026) ─────────────────────────────────────────────
//
// Ogni tessera era un `<div onClick>`. Con la tastiera non ci si arriva — non
// entra nel giro del tabulatore — e un lettore di schermo non annuncia che si
// possa premere: legge «SACHER», come leggerebbe un titolo.
//
// Con trenta gusti, che è il numero vero del design partner, sono **trenta
// comandi invisibili in una schermata sola**.
//
// L'etichetta dice anche cosa succede («Apri la ricetta SACHER»), perché il
// solo nome non distingue una cosa che si legge da una che si preme.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react'

vi.mock('../../src/lib/supabase', () => {
  const RES = { data: [], error: null }
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(RES)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return { supabase: { from: () => new Proxy({}, h), rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) } } }
})
vi.mock('../../src/lib/storage', () => ({
  sload: async () => null, ssave: async () => {}, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { default: RicettarioView } = await import('../../src/views/RicettarioView.jsx')

const RICETTARIO = {
  ingredienti_costi: { latte: { costoKg: 1.2, costoG: 0.0012 } },
  ricette: {
    SACHER: { nome: 'SACHER', tipo: 'fetta', categoria: 'Torte', unita: 8, prezzo: 24,
      ingredienti: [{ nome: 'latte', qty1stampo: 1000 }] },
    PISTACCHIO: { nome: 'PISTACCHIO', tipo: 'gusto', categoria: 'Gelato', unita: 1, prezzo: 0,
      ingredienti: [{ nome: 'latte', qty1stampo: 800 }] },
  },
}

const apri = (p = {}) => render(
  <RicettarioView ricettario={RICETTARIO} orgId="org-1" sedeId="sede-1" sedi={[]}
    notify={() => {}} metodoProduzione="stampi" {...p} />,
)
const testo = () => document.body.textContent || ''
const tessere = () => [...document.querySelectorAll('button')]
  .filter(b => (b.getAttribute('aria-label') || '').startsWith('Apri la ricetta'))

/** Passa alla vista a schede: la pagina parte con l'elenco. */
async function vaiAlleTessere() {
  const b = [...document.querySelectorAll('button')]
    .find(x => x.getAttribute('aria-label') === 'Vista a schede')
  expect(b, 'non trovo il comando per la vista a schede').toBeTruthy()
  await act(async () => { fireEvent.click(b) })
}

afterEach(() => cleanup())

describe('Nella vista a tessere ogni gusto è un pulsante', () => {
  it('le tessere esistono e sono pulsanti veri', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/SACHER|PISTACCHIO/))
    await vaiAlleTessere()
    // Due ricette, due tessere. Senza questo controllo il ciclo qui sotto
    // girerebbe a vuoto e la prova passerebbe senza aver guardato niente.
    expect(tessere(), 'nessuna tessera: la prova guarderebbe il vuoto').toHaveLength(2)
    for (const t of tessere()) expect(t.tagName).toBe('BUTTON')
  })

  it('e l\'etichetta dice cosa fanno, non solo come si chiamano', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/SACHER|PISTACCHIO/))
    await vaiAlleTessere()
    expect(tessere()).toHaveLength(2)
    for (const t of tessere()) {
      expect(t.getAttribute('aria-label')).toMatch(/^Apri la ricetta .+/)
    }
  })

  it('premendola si apre quella ricetta, non un\'altra', async () => {
    let aperta = null
    apri({ onEditRicetta: (n) => { aperta = n } })
    await waitFor(() => expect(testo()).toMatch(/SACHER|PISTACCHIO/))
    await vaiAlleTessere()
    const t = tessere().find(x => (x.getAttribute('aria-label') || '').includes('SACHER'))
    expect(t, 'manca la tessera di SACHER').toBeTruthy()
    await act(async () => { fireEvent.click(t) })
    expect(aperta).toBe('SACHER')
  })
})

describe('Il righello di questo file', () => {
  it('la pagina si disegna e i gusti ci sono', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/SACHER/))
    expect(testo()).toMatch(/PISTACCHIO/)
  })

  it('e in questa pagina ci sono dei pulsanti veri', async () => {
    // Se non ce ne fosse nessuno, le prove qui sopra passerebbero guardando il
    // vuoto: `for (const t of [])` non fallisce mai.
    apri()
    await waitFor(() => expect(testo()).toMatch(/SACHER/))
    await vaiAlleTessere()
    expect(document.querySelectorAll('button').length).toBeGreaterThan(2)
  })
})
