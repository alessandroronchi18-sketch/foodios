// @vitest-environment happy-dom
//
// ── Il tablet non è un telefono, ma si usa col dito ────────────────────────
//
// Il difetto, misurato il 18/09/2026 rendendo le pagine in Chromium con il
// tocco attivo (`hasTouch: true`) alle tre larghezze del progetto — 390, 768
// e 1440.
//
// Quel giorno i comandi delle barre dei gusti erano stati rimpiccioliti su
// richiesta del titolare: «più piccoli e in disposizione a quadrato». La
// decisione era giusta e riguardava il computer, dove si clicca col mouse;
// sul telefono dovevano restare 40px, la misura di un polpastrello. Il
// commento nel codice lo diceva esplicitamente.
//
// Misurato, non letto:
//
//     telefono  390px →  134x40   giusto
//     tablet    768px →  112x30   SBAGLIATO
//     computer 1440px →  112x30   voluto
//
// Nessuno aveva deciso il tablet. La misura era scritta `isMobile ? 40 : 30`,
// e `isMobile` è vero solo sotto i 768px: «tutto quello che non è telefono»
// comprende anche l'iPad, che però si tocca col dito esattamente come un
// telefono. Su una pagina con 55 gusti fanno oltre 200 bersagli sotto la
// soglia, tutti da 30px.
//
// È la seconda volta che questa forma di errore costa cara: il 15/09/2026 la
// regola contro lo zoom automatico di iOS era scritta `isMobile ? 16 : 13` e
// sul tablet lasciava 95 campi di testo sotto i 16px.
//
// Come riprodurlo sul codice di prima: aprire il Ricettario su un iPad (o una
// finestra da 768px con il tocco attivo), aprire un gusto, misurare i quattro
// comandi del quadrato. Alti 30.
//
// La correzione è una sola idea, applicata dappertutto: la misura si decide
// sul DITO, non sulla larghezza — `const dito = isMobile || isTablet`.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      getUser: () => Promise.resolve({ data: { user: { id: 'u', email: 'anita@maradeiboschi.com' } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

// ── Le tre larghezze, senza simulare gli hook ──────────────────────────────
//
// Qui NON si sostituisce `useIsMobile`: si sposta la finestra vera. Così la
// prova copre anche le soglie (767 / 768 / 1023 / 1024), che sono la metà del
// difetto: simulando l'hook si proverebbe solo il ramo che si è già deciso di
// provare, e il pixel sbagliato resterebbe invisibile.
const LARGHEZZA = { telefono: 390, tablet: 768, computer: 1440 }
function schermo(px) {
  window.innerWidth = px
  window.innerHeight = 900
}

const ricettario = {
  ricette: {
    r1: {
      nome: 'SACHER', tipo: 'torta', porzioni: 8, prezzo: 30, unita: 8, categoria: 'Torte',
      ingredienti: [{ nome: 'farina 00', qty1stampo: 500 }, { nome: 'burro', qty1stampo: 300 }],
    },
  },
  ingredienti_costi: {
    'farina 00': { costoKg: 0.95, costoG: 0.00095 },
    burro: { costoKg: 8.4, costoG: 0.0084 },
  },
}

const { default: RicettarioView } = await import('../../src/views/RicettarioView.jsx')
const { CampoConElenco } = await import('../../src/views/_shared.jsx')

/** Apre la prima barra che si dichiara apribile e restituisce i comandi. */
async function apriPrimoGusto(v) {
  const barra = v.container.querySelector('[aria-expanded="false"]')
  expect(barra, 'la barra del gusto non si è disegnata').toBeTruthy()
  fireEvent.click(barra)
  return waitFor(() => {
    const b = [...v.container.querySelectorAll('button')].filter(x => /Dettaglio|PDF|Modifica/.test(x.textContent))
    expect(b.length).toBeGreaterThan(1)
    return b
  })
}

const altezza = (b) => parseInt(String(b.style.height || b.style.minHeight || '0'), 10)

beforeEach(() => { schermo(LARGHEZZA.computer) })
afterEach(() => { cleanup() })

describe('i comandi delle barre dei gusti, sulle tre larghezze', () => {
  it('sul TELEFONO sono alti 40: la misura di un polpastrello', async () => {
    schermo(LARGHEZZA.telefono)
    const v = render(<RicettarioView ricettario={ricettario} orgId="org-1" sedi={[{ id: 's1', nome: 'Corso Vittorio' }]} />)
    for (const b of await apriPrimoGusto(v)) expect(altezza(b), b.textContent.trim()).toBe(40)
  })

  // Questa è la prova che cade sul codice di prima: là i comandi uscivano 30.
  it('sul TABLET sono alti 40 anche loro — era il difetto del 18/09/2026', async () => {
    schermo(LARGHEZZA.tablet)
    const v = render(<RicettarioView ricettario={ricettario} orgId="org-1" sedi={[{ id: 's1', nome: 'Corso Vittorio' }]} />)
    for (const b of await apriPrimoGusto(v)) expect(altezza(b), b.textContent.trim()).toBe(40)
  })

  it('sul COMPUTER restano 30: la richiesta del titolare non viene annullata', async () => {
    schermo(LARGHEZZA.computer)
    const v = render(<RicettarioView ricettario={ricettario} orgId="org-1" sedi={[{ id: 's1', nome: 'Corso Vittorio' }]} />)
    for (const b of await apriPrimoGusto(v)) expect(altezza(b), b.textContent.trim()).toBe(30)
  })

  // Il pixel che ha creato il difetto: 767 è telefono, 768 è tablet. Fino al
  // 18/09 fra i due cambiava la misura del bersaglio; adesso no, perché su
  // tutti e due c'è un dito.
  it('a 767 e a 768 la misura è la stessa: di là e di qua c\'è un dito', async () => {
    const misure = []
    for (const px of [767, 768, 1023]) {
      schermo(px)
      const v = render(<RicettarioView ricettario={ricettario} orgId="org-1" sedi={[{ id: 's1', nome: 'Corso Vittorio' }]} />)
      misure.push(altezza((await apriPrimoGusto(v))[0]))
      cleanup()
    }
    expect(misure).toEqual([40, 40, 40])
  })
})

describe('l\'avviso «non è fra le tue materie prime»', () => {
  // Nato il 18/09/2026 insieme al campo a elenco chiuso. I suoi due pulsanti
  // sono le uniche vie d'uscita da un nome scritto storto — e un nome storto
  // vale ZERO nel food cost, in silenzio. Misuravano 145x32 e 193x32: sotto
  // la soglia del dito sul TELEFONO, non solo sul tablet.
  const props = {
    valore: 'aceto balsamicp',
    onCambia: () => {},
    voci: ['Aceto balsamico', 'Burro'],
    soloDallElenco: true,
    onCreaNuova: () => {},
    etichettaCrea: 'Aggiungila alle materie prime',
  }
  const pulsantiAvviso = (v) => [...v.container.querySelectorAll('button')]
    .filter(b => /^(Usa |Aggiungila)/.test(b.textContent.trim()))

  for (const [dove, px] of [['telefono', LARGHEZZA.telefono], ['tablet', LARGHEZZA.tablet]]) {
    it(`sul ${dove} i due pulsanti stanno sopra i 40px`, () => {
      schermo(px)
      const v = render(<CampoConElenco {...props} />)
      const b = pulsantiAvviso(v)
      expect(b.length, 'i pulsanti dell\'avviso non ci sono').toBe(2)
      for (const x of b) expect(parseInt(x.style.minHeight, 10), x.textContent.trim()).toBeGreaterThanOrEqual(40)
    })
  }

  it('sul computer restano 32, che col mouse bastano', () => {
    schermo(LARGHEZZA.computer)
    const v = render(<CampoConElenco {...props} />)
    for (const x of pulsantiAvviso(v)) expect(parseInt(x.style.minHeight, 10)).toBe(32)
  })
})

// ── Il censimento, e quello che dichiara di non aver sistemato ─────────────
//
// La forma `isMobile ? <misura da dito> : <misura da mouse>` è una famiglia,
// non un caso singolo: al 18/09/2026 stava in 13 file. Le pagine toccate
// quel giorno sono state ripulite; le altre no, e dirlo vale più che far
// finta di niente — è il loro elenco, congelato qui.
//
// Se qualcuno ne scrive una nuova, questo censimento la vede. Se qualcuno ne
// sistema una, il numero scende e il test lo dice: allora si aggiorna
// l'elenco, che è esattamente il segnale che si vuole.
describe('censimento: la misura decisa sulla larghezza invece che sul dito', () => {
  // Le parole valgono zero: un commento che RACCONTA il difetto contiene la
  // stessa forma che si sta cercando, e senza questo il censimento
  // accuserebbe le proprie spiegazioni.
  const senzaCommenti = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

  const SOSPETTO = /isMobile \? (4[0-9]|5[0-9]) : ([12][0-9]|3[0-9])\b/g

  function tuttiIFile(dir, out = []) {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) { if (n !== 'node_modules') tuttiIFile(p, out) }
      else if (/\.jsx?$/.test(n)) out.push(p)
    }
    return out
  }

  // ── Prova di controllo sul righello ──────────────────────────────────
  // Un censimento che dice «zero» va bene solo se ha davvero guardato, e
  // solo se sa riconoscere quello che cerca. Qui si verificano tutte e due
  // le cose: che i file ci siano, e che la forma si veda quando c'è.
  it('il setaccio guarda dentro il progetto e riconosce quello che cerca', () => {
    expect(tuttiIFile(join(RADICE, 'src')).length).toBeGreaterThan(150)
    expect([...'height: isMobile ? 44 : 32'.matchAll(SOSPETTO)]).toHaveLength(1)
    expect([...'height: dito ? 44 : 32'.matchAll(SOSPETTO)]).toHaveLength(0)
    // E che non si faccia ingannare dalle proprie spiegazioni.
    expect([...senzaCommenti('// era isMobile ? 44 : 32\nheight: dito ? 44 : 32').matchAll(SOSPETTO)]).toHaveLength(0)
  })

  const RIPULITI = [
    'src/views/RicettarioView.jsx',
    'src/views/SemilavoratiView.jsx',
    'src/views/NuovaRicettaView.jsx',
    'src/views/MagazzinoView.jsx',
    'src/views/ChiusuraView.jsx',
    'src/views/_shared.jsx',
    'src/components/PrimaNotaCassa.jsx',
  ]

  for (const f of RIPULITI) {
    it(`${f} decide sul dito, non sulla larghezza`, () => {
      const src = senzaCommenti(readFileSync(join(RADICE, f), 'utf8'))
      expect([...src.matchAll(SOSPETTO)].map(m => m[0])).toEqual([])
    })
  }

  // I file ancora da sistemare, con quante occorrenze ciascuno. Non è una
  // regola: è un debito dichiarato. Dichiararlo costa una riga, scoprirlo fra
  // sei mesi costa un audit.
  it('gli altri file: l\'elenco di quello che resta, congelato al 18/09/2026', () => {
    const rimasti = {}
    for (const p of tuttiIFile(join(RADICE, 'src'))) {
      const rel = relative(RADICE, p).split('\\').join('/')
      const n = [...senzaCommenti(readFileSync(p, 'utf8')).matchAll(SOSPETTO)].length
      if (n > 0) rimasti[rel] = n
    }
    // 18/09/2026, stesso giorno: due file sono usciti dall'elenco perché il
    // capo ha ripulito anche quelli — `FormatiVendita.jsx` (2) e
    // `MateriePrimeView.jsx` (1), cioè la pagina del Listino e il campo del
    // prezzo delle materie prime, che era l'azione principale di una pagina
    // nata quel giorno. L'elenco si accorcia solo così: correggendo, mai
    // allargando la maglia.
    expect(rimasti).toEqual({
      'src/components/BarraPeriodo.jsx': 1,
      'src/components/EsportaDati.jsx': 1,
      'src/components/Haccp.jsx': 4,
      'src/components/Impostazioni.jsx': 1,
      'src/components/Personale.jsx': 2,
      'src/components/UpgradeModal.jsx': 2,
      'src/views/AzioniView.jsx': 5,
      'src/views/CostiAziendaliView.jsx': 2,
      'src/views/VenditeB2BView.jsx': 2,
    })
  })
})
