// @vitest-environment happy-dom
//
// ── Il menu si chiude anche senza mouse ─────────────────────────────────
//
// Nel telaio del programma (`src/Dashboard.jsx`) due rettangoli invisibili
// chiudevano quello che era aperto:
//
//   • quello sopra il menu del profilo (esci, cambia sede, impostazioni);
//   • quello scuro sopra la barra laterale sul telefono.
//
// Erano `<div onClick>`: col dito funzionano, con la tastiera no. Chi gira
// con Tab apriva il menu e non aveva più modo di chiuderlo, e un lettore di
// schermo quei due rettangoli non li annunciava nemmeno. Sono l'ultimo passo
// di ogni pagina — se resta aperto il menu, resta aperto sopra tutto.
//
// Sono diventati due `<button>` con un nome. Il secondo tiene il velo scuro
// che aveva prima: il disegno non cambia, cambia chi ci arriva.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let MOBILE = false
vi.mock('../../src/lib/useIsMobile', () => ({
  default: () => MOBILE,
  useIsTablet: () => false,
  useIsNarrow: () => MOBILE,
}))
function fluente(res = { data: [], error: null }) {
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(res)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return new Proxy({}, h)
}
vi.mock('../../src/lib/supabase', () => ({ supabase: {
  auth: {
    getUser: async () => ({ data: { user: { id: 'u1', email: 'riccardo@maradeiboschi.com' } } }),
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  from: () => fluente(), rpc: async () => ({ data: null, error: null }),
  channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe() {} }) }) }), removeChannel: () => {},
} }))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {},
  ssaveTutto: async () => {}, sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/stockPF', () => ({
  loadStockPF: async () => [], loadStockPFAllSedi: async () => [], loadMovimentiPF: async () => [],
  caricoProduzionePF: async () => {}, scaricoVenditaPF: async () => {}, scartoPF: async () => {},
}))

const { default: Dashboard } = await import('../../src/Dashboard.jsx')

const PROPS = {
  auth: { user: { id: 'u1', email: 'riccardo@maradeiboschi.com' } },
  orgId: 'org-1', sedeId: 's1',
  sedi: [{ id: 's1', nome: 'Carlina' }, { id: 's2', nome: 'Berthollet' }],
  sedeAttiva: { id: 's1', nome: 'Carlina' },
  nomeAttivita: 'Mara dei Boschi', tipoAttivita: 'gelateria',
  metodoProduzione: 'stampi', piano: 'pro', isTrialAttivo: false,
}

const bottoni = () => [...document.querySelectorAll('button')]
const perEtichetta = (re) => bottoni().find(b => re.test(b.getAttribute('aria-label') || ''))

async function apri(props = {}) {
  const r = render(<Dashboard {...PROPS} {...props} />)
  await waitFor(() => expect(document.body.textContent.length).toBeGreaterThan(200), { timeout: 5000 })
  return r
}

beforeEach(() => { MOBILE = false })
afterEach(() => cleanup())

describe('Il velo del menu del profilo', () => {
  it('esiste solo quando il menu è aperto', async () => {
    await apri()
    expect(perEtichetta(/^Chiudi il menu$/), 'il velo c\'è anche a menu chiuso').toBeFalsy()
  })

  it('è un pulsante con un nome, non un rettangolo muto', async () => {
    await apri()
    // il comando che apre il menu del profilo
    const profilo = bottoni().find(b => /profilo|account|menu utente/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || ''))
    expect(profilo, 'non trovo il comando del profilo').toBeTruthy()
    act(() => { fireEvent.click(profilo) })
    await waitFor(() => {
      const velo = perEtichetta(/^Chiudi il menu$/)
      expect(velo, 'il menu si chiude solo col mouse').toBeTruthy()
      expect(velo.tagName).toBe('BUTTON')
    })
  })

  it('e premendolo il menu si chiude davvero', async () => {
    await apri()
    const profilo = bottoni().find(b => /profilo|account|menu utente/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || ''))
    act(() => { fireEvent.click(profilo) })
    await waitFor(() => expect(perEtichetta(/^Chiudi il menu$/)).toBeTruthy())
    act(() => { fireEvent.click(perEtichetta(/^Chiudi il menu$/)) })
    await waitFor(() => expect(perEtichetta(/^Chiudi il menu$/)).toBeFalsy())
  })
})

describe('Il velo della barra laterale sul telefono', () => {
  it('quando la barra è aperta, il velo è un pulsante con un nome', async () => {
    MOBILE = true
    await apri()
    const apre = bottoni().find(b => /menu|barra|naviga/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || ''))
    expect(apre, 'non trovo il comando che apre la barra laterale').toBeTruthy()
    act(() => { fireEvent.click(apre) })
    await waitFor(() => {
      const veli = bottoni().filter(b => /^Chiudi il menu$/.test(b.getAttribute('aria-label') || ''))
      expect(veli.length, 'il velo della barra si chiude solo col dito').toBeGreaterThan(0)
      for (const v of veli) expect(v.tagName).toBe('BUTTON')
    })
  })
})

describe('La domanda prima di riscrivere il ricettario', () => {
  const SRC = readFileSync(join(process.cwd(), 'src/Dashboard.jsx'), 'utf8')

  it('non la fa più il browser', async () => {
    // Era `window.confirm(righe)` con otto righe di riepilogo dentro. È la
    // domanda più pericolosa del prodotto — dietro c'è la riscrittura del
    // ricettario — ed era l'ultima finestra del browser fuori dall'admin.
    const codice = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    expect(codice).not.toMatch(/window\.confirm\s*\(/)
  })

  it('la fa il componente che usa tutto il resto del prodotto', async () => {
    expect(SRC).toMatch(/useConfirm/)
    const i = SRC.indexOf('Salvo nel ricettario?')
    expect(i, 'la domanda dell\'import non c\'è più').toBeGreaterThan(-1)
    const intorno = SRC.slice(i - 800, i + 300)
    expect(intorno).toMatch(/chiediConfermaImport\s*\(/)
  })

  it('e il riepilogo arriva su più righe, non tutto attaccato', async () => {
    // `ConfirmModal` disegna il messaggio con `white-space: pre-line`
    // proprio per questo: qui si controlla che l'import gliene passi uno a
    // capo per punto, se no quel `pre-line` non serve a niente.
    const i = SRC.indexOf('Salvo nel ricettario?')
    const intorno = SRC.slice(i - 900, i + 300)
    expect(intorno).toMatch(/join\('\\n'\)/)
  })
})

describe('Il righello di questo file', () => {
  it('il telaio si disegna davvero: il menu di navigazione è a schermo', async () => {
    // Le pagine arrivano pigre (`Caricamento…`), ma la navigazione è già lì:
    // è quella che queste prove toccano.
    await apri()
    const etichette = bottoni().map(b => (b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')).join(' | ')
    expect(etichette).toMatch(/Oggi/)
    expect(etichette).toMatch(/Ricette/)
    expect(etichette).toMatch(/Menu profilo/)
  })

  it('e i comandi ci sono', async () => {
    await apri()
    expect(bottoni().length).toBeGreaterThan(5)
  })
})
