// @vitest-environment happy-dom
// La barra in alto: via la lente della ricerca, e una campanella sola.
//
// Due segnalazioni del titolare, 19/09/2026.
//
// 1) «Togli questa sezione nella barra menu sopra, nascondila, ora non
//    serve» — la lente «Cerca o chiedi all'AI (Cmd+K)». Nascosta, non
//    cancellata: il pannello resta montato e la scorciatoia da tastiera
//    continua ad aprirlo, così torna in barra cambiando una parola
//    (`RICERCA_NELLA_BARRA` in Dashboard.jsx).
//
// 2) «Modificane una o nascondine una, quella meno utile» — nella barra
//    c'erano DUE campanelle identiche a tre centimetri di distanza.
//    Nota per chi legge fra sei mesi: la segnalazione diceva che la seconda
//    fosse `PushNotificationToggle`, cioè l'interruttore delle notifiche
//    push. Non era così: quel componente è importato in Dashboard.jsx e non
//    viene disegnato da nessuna parte. Le due campanelle vere erano il
//    pannello Notifiche (`NotifichePanel`) e i suggerimenti dell'AI
//    (`AISuggestionsBell`).
//    Quale spegnere lo hanno deciso i dati: nella tabella `notifiche` c'è
//    UNA riga in tutto il database, in `ai_suggestions` ce ne sono 1.387 di
//    cui 78 da leggere. È uscita dalla barra la campanella vuota — e non è
//    sparita: il pannello si apre ancora dal piede della barra laterale.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, act, fireEvent } from '@testing-library/react'
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
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      getUser: () => Promise.resolve({ data: { user: { id: 'u', email: 'anita@maradeiboschi.com' } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => fluente(),
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe() {} }) }) }),
    removeChannel: () => {},
  },
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/stockPF', () => ({
  loadStockPF: async () => [], loadMovimentiPF: async () => [],
  scartoPF: async () => 0, rettificaPF: async () => 0, caricoProduzionePF: async () => 0,
}))
vi.mock('../../src/lib/aiClient', () => ({
  chiediAI: async () => ({ testo: '' }), callAI: async () => ({}), default: {},
}))

const { default: Dashboard } = await import('../../src/Dashboard')

const SEDI = [
  { id: 's1', nome: 'Carlina', attiva: true, is_sede_produzione: true },
  { id: 's2', nome: 'Berthollet', attiva: true, is_sede_produzione: false },
]

function larghezza(px) {
  window.innerWidth = px
  window.matchMedia = (q) => {
    const max = /max-width:\s*(\d+)px/.exec(q)
    const min = /min-width:\s*(\d+)px/.exec(q)
    let matches = true
    if (max) matches = matches && px <= Number(max[1])
    if (min) matches = matches && px >= Number(min[1])
    if (/pointer:\s*coarse/.test(q)) matches = px < 1024
    return { matches, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
  }
}

async function monta() {
  const r = render(
    <Dashboard
      auth={{ user: { id: 'u', email: 'anita@maradeiboschi.com' }, ruolo: 'titolare' }}
      orgId="org-1" sedeId="s1" sedi={SEDI} sedeAttiva={SEDI[0]}
      nomeAttivita="Mara dei Boschi" tipoAttivita="gelateria"
      metodoProduzione="stampi" piano="pro" isTrialAttivo={false}
      onSignOut={() => {}} onSetSedeAttiva={() => {}}
    />
  )
  await waitFor(() => {
    expect(r.container.querySelector('.fos-topbar-accent'), 'la barra in alto non si è disegnata').toBeTruthy()
  }, { timeout: 6000 })
  return r
}

// La barra in alto è il contenitore della striscia colorata in cima.
const barra = (c) => c.querySelector('.fos-topbar-accent').parentElement
// Una campanella è un'icona con il disegno del campanello, comunque sia
// scritta: nel Dashboard è un `svg` a mano, in `Icon` è un `path` iniettato.
const campanelle = (el) => [...el.querySelectorAll('svg')]
  .filter(s => /M18 8[aA]6 6/.test(s.innerHTML || ''))

beforeEach(() => larghezza(1280))
afterEach(() => cleanup())

describe('la lente della ricerca non sta più nella barra', () => {
  it('nella barra in alto non c\'è nessun pulsante «Cerca…»', async () => {
    const { container } = await monta()
    const cerca = [...barra(container).querySelectorAll('button')]
      .filter(b => /cerca/i.test(`${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''}`))
    expect(cerca.length, 'la lente è ancora in barra').toBe(0)
  })

  it('ma è nascosta, non cancellata: la scorciatoia apre ancora il pannello', async () => {
    const { container } = await monta()
    expect(container.textContent).not.toMatch(/Cerca una sezione/)
    await act(async () => { window.dispatchEvent(new Event('foodos:cmdk')) })
    await waitFor(() => {
      expect(document.body.textContent, 'la scorciatoia non apre più la ricerca').toMatch(/Cerca una sezione/)
    }, { timeout: 4000 })
  })
})

describe('nella barra in alto c\'è una campanella sola', () => {
  it('non due uguali', async () => {
    const { container } = await monta()
    expect(campanelle(barra(container)).length, 'ci sono ancora due campanelle identiche').toBe(1)
  })

  it('e quella che resta è quella che ha qualcosa da dire: i suggerimenti', async () => {
    const { container } = await monta()
    const bottoniConCampanella = [...barra(container).querySelectorAll('button')]
      .filter(b => campanelle(b).length > 0)
    expect(bottoniConCampanella.length).toBe(1)
    const descrizione = `${bottoniConCampanella[0].getAttribute('title') || ''} ${bottoniConCampanella[0].getAttribute('aria-label') || ''}`
    expect(descrizione, 'in barra è rimasta la campanella sbagliata').toMatch(/suggeriment/i)
  })

  it('e il pannello Notifiche ha ancora una porta: sta nel menu del profilo', async () => {
    // Sul computer la barra laterale non c'è: se la campanella esce dalla
    // barra e basta, il pannello non si apre più da nessuna parte. Una cosa
    // nascosta deve restare raggiungibile, altrimenti è cancellata.
    const { container } = await monta()
    const profilo = [...container.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') || '') === 'Menu profilo')
    expect(profilo, 'non c\'è il menu del profilo').toBeTruthy()
    act(() => { fireEvent.click(profilo) })
    const voce = [...container.querySelectorAll('button')]
      .find(b => /^Notifiche/.test(b.getAttribute('aria-label') || ''))
    expect(voce, 'le Notifiche non si aprono più da nessuna parte').toBeTruthy()
    act(() => { fireEvent.click(voce) })
    await waitFor(() => {
      expect(document.body.textContent, 'la voce non apre il pannello').toMatch(/Notifiche/)
    }, { timeout: 4000 })
  })
})
