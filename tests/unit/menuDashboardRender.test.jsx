// @vitest-environment happy-dom
//
// Il menu, montato davvero.
//
// Dashboard.jsx è il file più grande del progetto (3.500 righe) e **nessun
// test lo montava**: si controllava il testo del file, non quello che
// compare a schermo. Dopo aver unificato le tre barre su un elenco solo
// (src/lib/menuFoodos.js) serviva una prova che le barre si disegnino
// ancora, e che disegnino le stesse cose.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
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

// La larghezza decide quale barra si disegna: sotto 768 il telefono, sopra
// il computer. happy-dom parte a 1024.
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
  { id: 's1', nome: 'Laboratorio', attiva: true, is_sede_produzione: true },
  { id: 's2', nome: 'Berthollet', attiva: true, is_sede_produzione: false },
]

// Il Dashboard mostra una schermata d'attesa finché non ha caricato i dati:
// il menu compare dopo. Senza aspettare qui si misurava il vuoto.
async function monta(extra = {}) {
  const r = render(
    <Dashboard
      auth={{ user: { id: 'u', email: 'anita@maradeiboschi.com' }, ruolo: 'titolare' }}
      orgId="org-1" sedeId="s1" sedi={SEDI} sedeAttiva={SEDI[0]}
      nomeAttivita="Mara dei Boschi" tipoAttivita="gelateria"
      metodoProduzione="stampi" piano="pro" isTrialAttivo={false}
      onSignOut={() => {}} onSetSedeAttiva={() => {}}
      {...extra}
    />
  )
  await waitFor(() => {
    expect(r.container.querySelector('button'), 'il Dashboard non è mai uscito dalla schermata d\'attesa').toBeTruthy()
  }, { timeout: 5000 })
  return r
}

const testi = (c) => [...c.querySelectorAll('button, a, h1, h2, span, div')]
  .map(e => (e.textContent || '').trim())

// I gruppi che non si usano ogni giorno partono chiusi: per leggerne le voci
// bisogna aprirli, come farebbe una persona.
function apriGruppo(container, titolo) {
  const testa = [...container.querySelectorAll('.fos-drawer-shell button')]
    .find(b => (b.textContent || '').trim() === titolo)
  expect(testa, `non trovo il gruppo "${titolo}"`).toBeTruthy()
  // Il click e' un interruttore: su un gruppo gia' aperto lo CHIUDE. Prima
  // qui si cliccava alla cieca, dando per scontato che partisse chiuso —
  // vero solo finche' nessun altro test lo aveva aperto prima (il cassetto
  // ricorda aperto/chiuso in `localStorage`, e in un file di test quel
  // ricordo sopravvive da un test all'altro). Mescolando l'ordine il
  // 19/09/2026 questo test e' andato rosso col menu perfettamente sano.
  if (testa.getAttribute('aria-expanded') === 'true') return
  act(() => { fireEvent.click(testa) })
}

beforeEach(() => {
  // Ogni test riparte dal prodotto appena installato: senza questo, il
  // ricordo dei gruppi aperti passa da un test al successivo e il risultato
  // dipende dall'ordine in cui girano.
  try { localStorage.clear() } catch { /* niente localStorage: va bene lo stesso */ }
  larghezza(1280)
})
afterEach(() => cleanup())

describe('la barra in alto del computer', () => {
  // Sul computer c'è solo la barra in alto: i nomi delle sezioni sempre
  // visibili, le voci dentro un menu che si apre passandoci sopra.
  it('mostra i titoli delle cinque sezioni', async () => {
    const { container } = await monta()
    const tutti = testi(container)
    for (const sez of ['Oggi', 'Ricette', 'Acquisti',
                       'Analisi', 'Azienda']) {
      expect(tutti.some(t => t === sez), `manca la sezione "${sez}"`).toBe(true)
    }
  })

  it('al dipendente mostra solo le sezioni che gli restano', async () => {
    // Al dipendente restano: le quattro cose di «Oggi», gli sprechi, e la
    // merce che arriva dalle altre sedi (decisione del titolare, 15/09/2026:
    // è lui che scarica il furgone). Niente conti, niente ricette, niente
    // prezzi.
    const { container } = await monta({ auth: { user: { id: 'd', email: 'dip@x.it' }, ruolo: 'dipendente' } })
    const tutti = testi(container)
    for (const sez of ['Analisi', 'Ricette']) {
      expect(tutti.some(t => t === sez), `il dipendente vede la sezione "${sez}"`).toBe(false)
    }
    expect(tutti.some(t => t === 'Oggi'), 'al dipendente manca perfino "Oggi"').toBe(true)
  })
})

describe('la barra laterale del telefono', () => {
  // Sul telefono la barra laterale è un cassetto: sta nel documento anche da
  // chiuso, spostato fuori schermo. Quindi le sue voci si possono leggere.
  const sulTelefono = (extra) => { larghezza(390); return monta(extra) }

  it('«Produzione» compare una volta sola nel cassetto', async () => {
    // Il difetto che ha fatto nascere menuFoodos.js: la stessa etichetta
    // apriva due pagine diverse a seconda di quale barra si toccasse. Se ne
    // comparissero due, sarebbero due strade diverse con lo stesso nome.
    const { container } = await sulTelefono()
    const cassetto = container.querySelector('.fos-drawer-shell')
    expect(cassetto, 'il cassetto non si disegna').toBeTruthy()
    const n = [...cassetto.querySelectorAll('button')]
      .filter(b => (b.textContent || '').trim() === 'Produzione').length
    expect(n, `Produzione compare ${n} volte invece di una`).toBe(1)
  })

  it('a stampi apre la produzione a stampi, a inventario quella per gusto', async () => {
    // La condizione sta in un posto solo: si verifica che arrivi a schermo.
    const { container: aStampi } = await sulTelefono({ metodoProduzione: 'stampi' })
    const prodStampi = [...aStampi.querySelectorAll('.fos-drawer-shell button')]
      .find(b => (b.textContent || '').trim() === 'Produzione')
    expect(prodStampi, 'manca la voce Produzione').toBeTruthy()
    cleanup()
    const { container: aInv } = await sulTelefono({ metodoProduzione: 'inventario' })
    const prodInv = [...aInv.querySelectorAll('.fos-drawer-shell button')]
      .filter(b => (b.textContent || '').trim() === 'Produzione')
    expect(prodInv, 'a inventario la voce Produzione è sparita o raddoppiata').toHaveLength(1)
  })

  it('con due sedi attive compaiono Confronto sedi e Trasferimenti', async () => {
    const { container } = await sulTelefono()
    apriGruppo(container, 'Azienda')
    const tutti = testi(container)
    expect(tutti.some(t => t === 'Confronto sedi')).toBe(true)
    expect(tutti.some(t => t === 'Trasferimenti')).toBe(true)
  })

  it('con una sola sede quelle due voci non ci sono', async () => {
    const { container } = await sulTelefono({ sedi: [SEDI[0]], sedeAttiva: SEDI[0] })
    apriGruppo(container, 'Azienda')
    const tutti = testi(container)
    expect(tutti.some(t => t === 'Confronto sedi')).toBe(false)
    expect(tutti.some(t => t === 'Trasferimenti')).toBe(false)
  })

  it('con una sede archiviata è come averne una sola', async () => {
    // Era il difetto: la barra in alto contava tutte le sedi, quella laterale
    // solo le attive, e la voce compariva in una e non nell'altra.
    const archiviata = [{ ...SEDI[0] }, { ...SEDI[1], attiva: false }]
    const { container } = await sulTelefono({ sedi: archiviata })
    apriGruppo(container, 'Azienda')
    expect(testi(container).some(t => t === 'Merce spostata tra negozi')).toBe(false)
  })
})

describe('il dipendente vede solo le sue pagine, anche a schermo', () => {
  const dip = { auth: { user: { id: 'd', email: 'dip@x.it' }, ruolo: 'dipendente' } }
  const sulTelefono = (extra) => { larghezza(390); return monta(extra) }

  it('nessuna voce di soldi o di persone compare da nessuna parte', async () => {
    const { container } = await sulTelefono(dip)
    const tutti = testi(container)
    for (const vietata of ['P&L', 'Personale',
                           'Fornitori', 'Vendite B2B',
                           'Food cost', 'Confronto sedi', 'Registro attività',
                           'Assistente AI', 'Listino']) {
      expect(tutti.some(t => t === vietata), `il dipendente vede "${vietata}"`).toBe(false)
    }
  })

  it('e nemmeno i titoli delle sezioni che non gli servono', async () => {
    const { container } = await sulTelefono(dip)
    const tutti = testi(container)
    for (const sez of ['Analisi & Numeri', 'AI', 'Vendite & Clienti']) {
      expect(tutti.some(t => t === sez), `il dipendente vede la sezione "${sez}"`).toBe(false)
    }
  })

  it('una sezione con una voce sola non mostra il titolo', async () => {
    // Leggeva «Acquisti & Fornitori» e sotto trovava una riga.
    const { container } = await sulTelefono(dip)
    expect(testi(container).some(t => t === 'Acquisti')).toBe(false)
  })
})

describe('la barra in basso non c\'è più', () => {
  // Decisione del titolare, 16/09/2026: «la si può togliere, non servono che
  // stanno là dato che ci sono nel menu a sinistra». Erano le stesse quattro
  // voci di «Oggi» più «Altro», duplicate in fondo allo schermo: 64px fissi
  // più 24px di spazio riservato sopra, su un telefono dove lo schermo è la
  // risorsa scarsa.
  it('sul telefono non si disegna nessuna barra fissa in fondo', async () => {
    larghezza(390)
    const { container } = await monta()
    const barre = [...container.querySelectorAll('nav')]
      .filter(n => (n.getAttribute('style') || '').includes('bottom:0') ||
                   (n.getAttribute('style') || '').includes('bottom: 0'))
    expect(barre, 'la barra in fondo è tornata').toHaveLength(0)
  })

  it('e le quattro voci restano raggiungibili dal cassetto', async () => {
    // Il costo della scelta: due tocchi invece di uno. Ma non devono
    // diventare irraggiungibili.
    larghezza(390)
    const { container } = await monta()
    const cassetto = container.querySelector('.fos-drawer-shell')
    const voci = [...cassetto.querySelectorAll('button')].map(b => (b.textContent || '').trim())
    for (const v of ['Produzione', 'Cassa', 'Magazzino']) {
      expect(voci, `"${v}" non si raggiunge più`).toContain(v)
    }
  })

  it('lo spazio in fondo alla pagina è tornato normale', async () => {
    // Gli 88px tenevano posto per la barra: senza barra sono 88px che non si
    // riprendono mai, su una pagina che si scorre per trenta gusti.
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const d = readFileSync(join(import.meta.dirname, '../../src/Dashboard.jsx'), 'utf8')
    expect(d).toMatch(/padding:isMobile\?"16px 16px 28px"/)
    const t = readFileSync(join(import.meta.dirname, '../../src/lib/theme.js'), 'utf8')
    expect(t).toMatch(/telefono: '16px 16px 28px'/)
  })
})

describe('i gruppi della barra laterale si aprono e si chiudono', () => {
  it('di partenza sono aperti «Oggi» e «Ricette», gli altri chiusi', async () => {
    // Le chiavi di partenza nominavano ancora `azienda` e `strumenti`,
    // sezioni abolite il 30/07/2026: non decidevano più niente, e le tre
    // sezioni nuove restavano aperte tutte insieme — la barra si apriva
    // lunga il doppio.
    larghezza(390)
    const { container } = await monta()
    const cassetto = container.querySelector('.fos-drawer-shell')
    const voci = [...cassetto.querySelectorAll('button')].map(b => (b.textContent || '').trim())
    // Aperte: si vedono le voci dentro.
    expect(voci).toContain('Cassa')                  // Oggi
    expect(voci).toContain('Listino')     // sezione Ricette
    // Chiuse: si vede solo il titolo.
    expect(voci).toContain('Analisi')
    expect(voci).not.toContain('P&L')
    expect(voci).toContain('Acquisti')
    expect(voci).not.toContain('Fornitori')
  })

  it('le chiavi di partenza sono quelle delle sezioni vere', async () => {
    const { costruisciMenu } = await import('../../src/lib/menuFoodos')
    const DASH = (await import('node:fs')).readFileSync(
      (await import('node:path')).join(import.meta.dirname, '../../src/Dashboard.jsx'), 'utf8')
    const riga = DASH.match(/return \{ oggi: true[^}]*\}/)
    expect(riga, 'le chiavi di partenza non si trovano').toBeTruthy()
    const chiavi = [...riga[0].matchAll(/(\w+):\s*(true|false)/g)].map(m => m[1])
    const vere = new Set(costruisciMenu({ piuSedi: true, metodoInventario: true, sedeDiProduzione: true }).map(s => s.id))
    for (const k of chiavi) expect(vere.has(k), `"${k}" non è una sezione del menu`).toBe(true)
    for (const v of vere) expect(chiavi, `la sezione "${v}" non ha uno stato di partenza`).toContain(v)
  })
})
