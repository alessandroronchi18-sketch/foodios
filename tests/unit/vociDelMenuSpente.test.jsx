// @vitest-environment happy-dom
//
// ── Le voci del menu che il titolare spegne ─────────────────────────────
//
// Richiesta del titolare, 09/10/2026: «nascondere il superfluo». Ricontrollando
// il menu vero è venuto fuori che la produzione a stampi e il Cashflow, le due
// pagine indicate dalla classifica del 06/10, Mara non le vedeva già: le sue
// tre sedi sono laboratori a inventario, e il Cashflow è fuori dal menu dal
// 15/09. Nel menu restavano invece Recensioni e Assistente AI, mai più aperte
// dopo il 16/09. Toglierle a tutti sarebbe stato sbagliato per il cliente
// dopo: decide ogni titolare, in Impostazioni → Voci del menu.
//
// Quello che queste prove tengono fermo:
//   • una voce spenta esce dalle barre, ma la ricerca la trova ancora (anche
//     quella del cassetto sul telefono, che prima filtrava solo le voci a
//     schermo e una voce spenta non l'avrebbe trovata mai);
//   • la pagina aperta non sparisce da sotto i piedi;
//   • Impostazioni non si spegne, perché è da lì che si riaccende;
//   • si salva prima e si cambia lo schermo dopo: se il salvataggio non
//     riesce, l'interruttore resta com'era e lo si dice.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act, screen } from '@testing-library/react'

const CHIAVE = 'pasticceria-voci-spente-v1'
let SALVATE = null
const ssave = vi.fn(async () => {})

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
  ssave: (...a) => ssave(...a),
  sload: async (k) => (k === CHIAVE ? SALVATE : null),
  ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/stockPF', () => ({
  loadStockPF: async () => [], loadMovimentiPF: async () => [],
  scartoPF: async () => 0, rettificaPF: async () => 0, caricoProduzionePF: async () => 0,
}))
vi.mock('../../src/lib/aiClient', () => ({
  chiediAI: async () => ({ testo: '' }), callAI: async () => ({}), default: {},
}))

const {
  costruisciMenu, sezioniAccese, vociAccese, vociInFondo, vociDaScegliere, leggiVociSpente,
  cercaVoci, EVENTO_VOCI_SPENTE,
} = await import('../../src/lib/menuFoodos')
const { SK_VOCI_SPENTE } = await import('../../src/lib/storageKeys')
const { isSharedKey } = await vi.importActual('../../src/lib/storage')
const { default: ImpostazioniVociMenu } = await import('../../src/components/ImpostazioniVociMenu')
const { default: Dashboard } = await import('../../src/Dashboard')

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

const SEDI = [
  { id: 's1', nome: 'Carlina', attiva: true, is_sede_produzione: true },
  { id: 's2', nome: 'Berthollet', attiva: true, is_sede_produzione: true },
]
const MENU = () => costruisciMenu({ metodoInventario: true, sedeDiProduzione: true, piuSedi: true })
const ids = (sezioni) => sezioni.flatMap(s => s.voci.map(v => v.id))

beforeEach(() => {
  SALVATE = null
  ssave.mockReset()
  ssave.mockImplementation(async () => {})
  try { localStorage.clear() } catch { /* va bene lo stesso */ }
  larghezza(1280)
})
afterEach(() => cleanup())

describe('la regola, nel file del menu', () => {
  it('la chiave è dell\'azienda, non della sede: il menu è lo stesso in tutti i negozi', () => {
    expect(SK_VOCI_SPENTE).toBe(CHIAVE)
    expect(isSharedKey(CHIAVE)).toBe(true)
  })

  it('il valore salvato si ripulisce: niente doppioni, niente spazzatura, mai Impostazioni', () => {
    expect(leggiVociSpente(null)).toEqual([])
    expect(leggiVociSpente('recensioni')).toEqual([])
    expect(leggiVociSpente(['recensioni', 'recensioni', '', 3, null, 'impostazioni', 'ai-brain']))
      .toEqual(['recensioni', 'ai-brain'])
  })

  it('una voce spenta esce dalla sua sezione, le altre restano dove sono', () => {
    const prima = MENU()
    const dopo = sezioniAccese(prima, ['recensioni'])
    expect(ids(dopo)).not.toContain('recensioni')
    expect(ids(dopo)).toEqual(ids(prima).filter(id => id !== 'recensioni'))
  })

  it('senza voci spente il menu è identico a quello di sempre', () => {
    const prima = MENU()
    expect(sezioniAccese(prima, [])).toEqual(prima)
    expect(vociAccese(vociInFondo(), [])).toEqual(vociInFondo())
  })

  it('una sezione con tutte le voci spente sparisce, titolo compreso', () => {
    const azienda = MENU().find(s => s.id === 'team').voci.map(v => v.id)
    const dopo = sezioniAccese(MENU(), azienda)
    expect(dopo.map(s => s.id)).not.toContain('team')
  })

  it('la pagina aperta non sparisce da sotto i piedi, nemmeno se è una scheda della voce', () => {
    expect(ids(sezioniAccese(MENU(), ['recensioni'], 'recensioni'))).toContain('recensioni')
    // «Da fare» (azioni) è una scheda dell'Assistente AI
    expect(vociAccese(vociInFondo(), ['ai-brain'], 'azioni').map(v => v.id)).toContain('ai-brain')
    expect(vociAccese(vociInFondo(), ['ai-brain'], 'home').map(v => v.id)).not.toContain('ai-brain')
  })

  it('Impostazioni non si spegne: anche scritta nel valore salvato, resta', () => {
    expect(vociAccese(vociInFondo(), ['impostazioni']).map(v => v.id)).toContain('impostazioni')
  })

  it('la ricerca guarda il menu intero e trova la voce spenta', () => {
    const trovate = cercaVoci('recensioni', MENU())
    expect(trovate.map(v => v.id)).toContain('recensioni')
  })

  it('le voci da scegliere sono tutte quelle del menu più quelle in fondo, tranne Impostazioni', () => {
    const gruppi = vociDaScegliere(MENU())
    const tutte = gruppi.flatMap(g => g.voci.map(v => v.id))
    expect(tutte).toEqual([...ids(MENU()), ...vociInFondo().map(v => v.id).filter(id => id !== 'impostazioni')])
    expect(gruppi.at(-1).label).toBe('In fondo al menu')
  })
})

describe('Impostazioni → Voci del menu', () => {
  const apri = (notify = vi.fn()) => {
    render(<ImpostazioniVociMenu orgId="org-1" metodoProduzione="inventario" sedi={SEDI} sedeId="s1"
      tipoAttivita="gelateria" notify={notify}/>)
    return notify
  }
  const interruttore = (nome) => screen.getAllByRole('switch').find(b => b.textContent.trim() === nome)

  it('parte da quello che è salvato e lo dice in una riga', async () => {
    SALVATE = ['recensioni']
    apri()
    await screen.findByText('Spente: Recensioni.')
    expect(interruttore('Recensioni').getAttribute('aria-checked')).toBe('false')
    expect(interruttore('Personale').getAttribute('aria-checked')).toBe('true')
  })

  it('Impostazioni non compare fra gli interruttori', async () => {
    apri()
    await screen.findByText('Sono tutte accese.')
    expect(interruttore('Impostazioni')).toBeUndefined()
    expect(interruttore('Assistente AI')).toBeTruthy()
  })

  it('spegnere salva l\'elenco nuovo dell\'azienda e avvisa il menu', async () => {
    apri()
    await screen.findByText('Sono tutte accese.')
    const ricevuti = []
    const ascolta = (e) => ricevuti.push(e.detail)
    window.addEventListener(EVENTO_VOCI_SPENTE, ascolta)
    await act(async () => { fireEvent.click(interruttore('Recensioni')) })
    window.removeEventListener(EVENTO_VOCI_SPENTE, ascolta)
    expect(ssave).toHaveBeenCalledWith(CHIAVE, ['recensioni'], 'org-1', null)
    expect(interruttore('Recensioni').getAttribute('aria-checked')).toBe('false')
    expect(ricevuti).toEqual([['recensioni']])
    expect(screen.getByText('Spente: Recensioni.')).toBeTruthy()
  })

  it('riaccendere toglie la voce dall\'elenco', async () => {
    SALVATE = ['recensioni', 'ai-brain']
    apri()
    await screen.findByText('Spente: Recensioni, Assistente AI.')
    await act(async () => { fireEvent.click(interruttore('Recensioni')) })
    expect(ssave).toHaveBeenLastCalledWith(CHIAVE, ['ai-brain'], 'org-1', null)
  })

  it('se il salvataggio non riesce, l\'interruttore resta com\'era e il menu non cambia', async () => {
    ssave.mockImplementation(async () => { throw new Error('rete giù') })
    const notify = apri()
    await screen.findByText('Sono tutte accese.')
    const ricevuti = []
    const ascolta = (e) => ricevuti.push(e.detail)
    window.addEventListener(EVENTO_VOCI_SPENTE, ascolta)
    await act(async () => { fireEvent.click(interruttore('Assistente AI')) })
    window.removeEventListener(EVENTO_VOCI_SPENTE, ascolta)
    expect(interruttore('Assistente AI').getAttribute('aria-checked')).toBe('true')
    expect(ricevuti).toEqual([])
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/Non è stato salvato/), false)
  })

  it('ogni riga è alta almeno 44 px: si tocca col dito', async () => {
    apri()
    await screen.findByText('Sono tutte accese.')
    for (const b of screen.getAllByRole('switch')) expect(b.style.minHeight).toBe('44px')
  })
})

describe('il Dashboard, montato davvero', () => {
  async function monta() {
    const r = render(
      <Dashboard
        auth={{ user: { id: 'u', email: 'anita@maradeiboschi.com' }, ruolo: 'titolare' }}
        orgId="org-1" sedeId="s1" sedi={SEDI} sedeAttiva={SEDI[0]}
        nomeAttivita="Mara dei Boschi" tipoAttivita="gelateria"
        metodoProduzione="inventario" piano="pro" isTrialAttivo={false}
        onSignOut={() => {}} onSetSedeAttiva={() => {}}
      />
    )
    await waitFor(() => expect(r.container.querySelector('.fos-drawer-shell button')).toBeTruthy(), { timeout: 5000 })
    return r
  }
  const nelCassetto = (c, nome) => [...c.querySelectorAll('.fos-drawer-shell button')]
    .some(b => (b.textContent || '').trim() === nome)
  function apriAzienda(c) {
    const testa = [...c.querySelectorAll('.fos-drawer-shell button')].find(b => (b.textContent || '').trim() === 'Azienda')
    if (testa && testa.getAttribute('aria-expanded') !== 'true') act(() => { fireEvent.click(testa) })
  }

  it('le voci spente non sono nel cassetto, le altre sì', async () => {
    larghezza(390)
    SALVATE = ['recensioni', 'ai-brain']
    const { container } = await monta()
    apriAzienda(container)
    await waitFor(() => expect(nelCassetto(container, 'Assistente AI')).toBe(false))
    expect(nelCassetto(container, 'Recensioni')).toBe(false)
    expect(nelCassetto(container, 'Personale')).toBe(true)
    expect(nelCassetto(container, 'Impostazioni')).toBe(true)
  })

  it('cercando dal cassetto del telefono la voce spenta si trova', async () => {
    larghezza(390)
    SALVATE = ['recensioni']
    const { container } = await monta()
    await waitFor(() => expect(nelCassetto(container, 'Recensioni')).toBe(false))
    const cerca = container.querySelector('input[aria-label="Cerca nel menu"]')
    act(() => { fireEvent.change(cerca, { target: { value: 'recens' } }) })
    expect(nelCassetto(container, 'Recensioni')).toBe(true)
  })

  it('quando Impostazioni salva, il menu cambia subito, senza ricaricare', async () => {
    larghezza(390)
    SALVATE = ['ai-brain']
    const { container } = await monta()
    await waitFor(() => expect(nelCassetto(container, 'Assistente AI')).toBe(false))
    act(() => { window.dispatchEvent(new CustomEvent(EVENTO_VOCI_SPENTE, { detail: [] })) })
    expect(nelCassetto(container, 'Assistente AI')).toBe(true)
  })
})
