// @vitest-environment happy-dom
//
// ── La pagina che si apre alle sei del mattino, su un tablet ───────────────
//
// Produzione giornaliera si usa in laboratorio, in piedi, con le mani
// infarinate. È la pagina del prodotto in cui un bersaglio piccolo costa di
// più: non si sbaglia un clic, si sbaglia una quantità di produzione, e da lì
// partono lo scarico del magazzino e il carico della vetrina.
//
// IL DIFETTO, misurato il 20/09/2026. Le misure erano decise sulla LARGHEZZA
// (`isMobile`) invece che sul DITO. `isMobile` è vero solo sotto i 768 px,
// quindi un iPad — che si tocca esattamente come un telefono — prendeva
// sempre la versione da mouse:
//
//     comando                       telefono   tablet   computer
//     più / meno degli stampi          40        30        30
//     Modifica / Elimina sessione      40        28        28
//     campi della modifica             40        28        28
//
// È la terza volta che questa forma costa cara in questo progetto: il
// 15/09/2026 lasciava 95 campi di testo sotto i 16 px su iPad, il 18/09 oltre
// duecento bersagli da 30 px nel Ricettario.
//
// LA CORREZIONE è una riga sola, applicata dappertutto:
// `const dito = isMobile || isTablet`, e 44 px come misura del polpastrello.
//
// Qui la finestra si sposta davvero (390 / 768 / 1440) invece di simulare gli
// hook: simulandoli si proverebbe solo il ramo che si è già deciso di provare,
// e le soglie — che sono metà del difetto — resterebbero fuori.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, ssaveBatch: async () => {}, sload: async () => null, sloadAllSedi: async () => ({}),
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
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getUser: () => Promise.resolve({ data: { user: null } }) },
    from: () => fluente(), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/lib/stockPF', () => ({
  caricoProduzionePF: async () => ({ ok: true }), scartoPF: async () => ({ ok: true }),
}))
vi.mock('../../src/lib/trasferimenti', () => ({ creaTrasferimento: async () => ({ ok: true }) }))

const { default: Produzione } = await import('../../src/views/ProduzioneGiornalieraView.jsx')

const LARGHEZZA = { telefono: 390, tablet: 768, computer: 1440 }
function schermo(px) { window.innerWidth = px; window.innerHeight = 900 }

const ricettario = {
  ricette: {
    'BANANA BREAD': {
      nome: 'BANANA BREAD', tipo: 'fetta', unita: 11, prezzo: 4, congelabile: true,
      ingredienti: [{ nome: 'farina 00', qty1stampo: 400 }, { nome: 'banane', qty1stampo: 300 }],
    },
  },
  ingredienti_costi: {
    'farina 00': { costoKg: 0.95, costoG: 0.00095 }, banane: { costoKg: 2, costoG: 0.002 },
  },
}
const magazzino = {
  'farina 00': { nome: 'farina 00', giacenza_g: 30000, soglia_g: 0 },
  banane: { nome: 'banane', giacenza_g: 10000, soglia_g: 0 },
}
const sessione = {
  id: 'g-1', data: '2026-09-18', note: '',
  prodotti: [{ nome: 'BANANA BREAD', stampi: 2, vendibile: 2, congelabile: true }],
  ingredientiUsati: { 'farina 00': 800, banana: 600 },
  scalatoPerChiave: { 'farina 00': 800, banane: 600 },
  fcTot: 1.96, ricavoTot: 88,
}

const props = {
  ricettario, magazzino, setMagazzino: () => {}, giornaliero: [sessione], setGiornaliero: () => {},
  notify: () => {}, sedi: [{ id: 's1', nome: 'Torino', attiva: true }],
  sedeAttiva: { id: 's1', nome: 'Torino' }, orgId: 'org-1', sedeId: 's1',
}

// L'altezza che il browser userebbe: `height` se c'è, altrimenti `minHeight`.
const alto = (e) => parseInt(String(e.style.height || e.style.minHeight || '0'), 10)

beforeEach(() => { schermo(LARGHEZZA.computer) })
afterEach(() => { cleanup() })

async function apri() {
  const v = render(<Produzione {...props} />)
  // Il righello: si aspetta la tabella disegnata, non il montaggio.
  await waitFor(() => expect(v.container.textContent).toContain('BANANA BREAD'))
  return v
}

/** I quattro comandi più/meno della riga (stampi e pezzi al banco). */
function comandiQuantita(v) {
  const b = [...v.container.querySelectorAll('button')]
    .filter(x => /Diminuisci|Aumenta/.test(x.getAttribute('aria-label') || ''))
  expect(b.length, 'i comandi più/meno').toBe(4)
  return b
}

async function apriStorico(v) {
  fireEvent.click([...v.container.querySelectorAll('button')].find(b => /^Storico$/.test(b.textContent.trim())))
  await waitFor(() => expect(v.container.textContent).toContain('Sessioni'))
}

describe('i più e i meno delle quantità, sulle tre larghezze', () => {
  it('sul TELEFONO sono 44: la misura di un polpastrello', async () => {
    schermo(LARGHEZZA.telefono)
    const v = await apri()
    for (const b of comandiQuantita(v)) expect(alto(b), b.getAttribute('aria-label')).toBe(44)
  })

  it('sul TABLET sono 44 anche loro — era il difetto', async () => {
    schermo(LARGHEZZA.tablet)
    const v = await apri()
    // Prima: 30. Su un iPad, con la farina sulle dita.
    for (const b of comandiQuantita(v)) expect(alto(b), b.getAttribute('aria-label')).toBe(44)
  })

  it('sul COMPUTER restano piccoli: lì si clicca col mouse', async () => {
    schermo(LARGHEZZA.computer)
    const v = await apri()
    for (const b of comandiQuantita(v)) expect(alto(b)).toBe(30)
  })

  it('sono larghi quanto sono alti: un bersaglio, non una fessura', async () => {
    schermo(LARGHEZZA.tablet)
    const v = await apri()
    for (const b of comandiQuantita(v)) expect(parseInt(b.style.width, 10)).toBe(44)
  })

  it('a 1023 px si è ancora su un tablet, a 1024 no', async () => {
    // Le soglie sono metà del difetto: è lì che si sbaglia il confronto.
    schermo(1023)
    const v1 = await apri()
    expect(alto(comandiQuantita(v1)[0])).toBe(44)
    cleanup()
    schermo(1024)
    const v2 = await apri()
    expect(alto(comandiQuantita(v2)[0])).toBe(30)
  })

  it('a 767 px è un telefono, a 768 un tablet: la misura non cambia', async () => {
    schermo(767)
    const v1 = await apri()
    expect(alto(comandiQuantita(v1)[0])).toBe(44)
    cleanup()
    schermo(768)
    const v2 = await apri()
    expect(alto(comandiQuantita(v2)[0])).toBe(44)
  })
})

describe('i campi dove si scrivono le quantità', () => {
  it('sul TABLET sono alti 44 e il testo è da 16: niente zoom di iOS', async () => {
    schermo(LARGHEZZA.tablet)
    const v = await apri()
    const campi = [...v.container.querySelectorAll('tbody input[type="number"]')]
    expect(campi.length).toBe(2)
    for (const c of campi) {
      expect(parseInt(c.style.minHeight, 10)).toBe(44)
      expect(parseInt(c.style.fontSize, 10)).toBeGreaterThanOrEqual(16)
    }
  })

  it('sul telefono uguale', async () => {
    schermo(LARGHEZZA.telefono)
    const v = await apri()
    for (const c of v.container.querySelectorAll('tbody input[type="number"]')) {
      expect(parseInt(c.style.minHeight, 10)).toBe(44)
    }
  })

  it('la data e la ricerca si toccano anche loro', async () => {
    schermo(LARGHEZZA.tablet)
    const v = await apri()
    const data = v.container.querySelector('input[type="date"]')
    const cerca = v.container.querySelector('input[aria-label="Cerca prodotto"]')
    expect(parseInt(data.style.minHeight, 10)).toBe(44)
    expect(parseInt(cerca.style.minHeight, 10)).toBe(44)
  })

  it('le note della sessione stanno sopra i 44', async () => {
    schermo(LARGHEZZA.tablet)
    const v = await apri()
    const note = [...v.container.querySelectorAll('input[type="text"]')]
      .find(i => /produzione weekend/.test(i.placeholder || ''))
    expect(note).toBeTruthy()
    expect(parseInt(note.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
  })
})

describe('i comandi dello storico: Modifica ed Elimina', () => {
  it('sul TABLET stanno sopra i 44 — erano 28', async () => {
    schermo(LARGHEZZA.tablet)
    const v = await apri()
    await apriStorico(v)
    const b = [...v.container.querySelectorAll('button')]
      .filter(x => /^(Modifica|Elimina)$/.test(x.textContent.trim()))
    expect(b.length).toBe(2)
    for (const x of b) expect(parseInt(x.style.minHeight, 10), x.textContent.trim()).toBeGreaterThanOrEqual(44)
  })

  it('sul telefono pure', async () => {
    schermo(LARGHEZZA.telefono)
    const v = await apri()
    await apriStorico(v)
    const b = [...v.container.querySelectorAll('button')]
      .filter(x => /^(Modifica|Elimina)$/.test(x.textContent.trim()))
    for (const x of b) expect(parseInt(x.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
  })

  it('sul computer restano compatti', async () => {
    schermo(LARGHEZZA.computer)
    const v = await apri()
    await apriStorico(v)
    const b = [...v.container.querySelectorAll('button')]
      .find(x => x.textContent.trim() === 'Modifica')
    expect(b.style.minHeight).toBe('auto')
  })

  it('i campi per correggere le quantità si toccano, sul tablet', async () => {
    schermo(LARGHEZZA.tablet)
    const v = await apri()
    await apriStorico(v)
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Modifica'))
    await waitFor(() => expect(v.container.textContent).toContain('Modifica quantità prodotte'))
    const campi = [...v.container.querySelectorAll('input[inputmode="decimal"]')]
    expect(campi.length).toBe(2)
    for (const c of campi) {
      expect(parseInt(c.style.minHeight, 10)).toBe(44)
      expect(parseInt(c.style.fontSize, 10)).toBeGreaterThanOrEqual(16)
    }
  })

  it('e le linguette Nuova sessione / Storico', async () => {
    schermo(LARGHEZZA.tablet)
    const v = await apri()
    const linguette = [...v.container.querySelectorAll('button')]
      .filter(b => /^(Nuova sessione|Storico)$/.test(b.textContent.trim()))
    expect(linguette.length).toBe(2)
    for (const l of linguette) expect(parseInt(l.style.minHeight, 10)).toBe(44)
  })

  it('la finestra di eliminazione ha già bersagli grandi, e restano tali', async () => {
    schermo(LARGHEZZA.tablet)
    const v = await apri()
    await apriStorico(v)
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Elimina'))
    const campo = await waitFor(() => {
      const c = v.container.querySelector('input[placeholder="ELIMINA"]')
      expect(c).toBeTruthy(); return c
    })
    expect(parseInt(campo.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
    const conferma = [...v.container.querySelectorAll('button')].find(b => /Elimina e reintegra/i.test(b.textContent))
    expect(parseInt(conferma.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
  })
})

describe('quello che il tablet NON deve perdere', () => {
  it('la tabella dei prodotti resta scorrevole di lato', async () => {
    schermo(LARGHEZZA.tablet)
    const v = await apri()
    const tabella = v.container.querySelector('table')
    expect(tabella).toBeTruthy()
    const contenitore = tabella.parentElement
    expect(contenitore.style.overflowX).toBe('auto')
    expect(contenitore.style.overflow).not.toBe('hidden')
  })

  it('i numeri restano in cifre tabellari, così le colonne si incolonnano', async () => {
    schermo(LARGHEZZA.tablet)
    const v = await apri()
    const celleNum = [...v.container.querySelectorAll('td')]
      .filter(td => td.style.fontVariantNumeric === 'tabular-nums')
    expect(celleNum.length).toBeGreaterThan(0)
  })

  it('i KPI dello storico stanno su due colonne, non su quattro schiacciate', async () => {
    schermo(LARGHEZZA.tablet)
    const v = await apri()
    await apriStorico(v)
    const griglia = [...v.container.querySelectorAll('div')]
      .find(d => d.style.display === 'grid' && /Sessioni/.test(d.textContent))
    expect(griglia).toBeTruthy()
    expect(griglia.style.gridTemplateColumns).toBe('repeat(2,1fr)')
  })
})
