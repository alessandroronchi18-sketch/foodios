// @vitest-environment happy-dom
//
// Magazzino: un ingrediente, una riga.
//
// Il bug che questi test difendono, verificato sui dati di produzione il
// 7/09/2026. Le ricette passavano da `normIng` — che porta i plurali al
// singolare, "uova" → "uovo" — e il magazzino no. L'unione dei due elenchi
// produceva DUE righe per lo stesso ingrediente: quella vera con la giacenza e
// un fantasma a zero marcato ESAURITO.
//
// Su "Gelateria Demo" erano 5 chiavi su 35 (uova, noci, nocciole, mirtilli,
// mandorle) con le ricette che le usano al plurale. Quattro conseguenze, tutte
// visibili al cliente: righe doppie, contatore "critici" gonfiato, banner
// rosso accesso per merce presente, e la lista di riordino che suggeriva di
// comprare uova che c'erano già.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
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
const salvato = { mag: null }
vi.mock('../../src/lib/storage', () => ({
  ssave: async (key, val) => { if (key === 'pasticceria-magazzino-v1') salvato.mag = val },
  sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { default: MagazzinoView } = await import('../../src/views/MagazzinoView.jsx')
const { normIng } = await import('../../src/lib/foodcost.js')

// Il caso reale: la giacenza e' salvata al PLURALE, la ricetta lo usa al
// plurale, e `normIng` porta entrambi al singolare.
const magazzino = {
  uova:      { giacenza_g: 4800, soglia_g: 1000, nome: 'uova' },
  nocciole:  { giacenza_g: 5400, soglia_g: 2000, nome: 'nocciole' },
  'farina 00': { giacenza_g: 28000, soglia_g: 10000, nome: 'farina 00' },
}
const ricettario = {
  ricette: {
    r1: { nome: 'PASTA FROLLA', tipo: 'torta', porzioni: 8, prezzo: 20,
          ingredienti: [{ nome: 'uova', quantita: 200 }, { nome: 'farina 00', quantita: 500 }] },
    r2: { nome: 'BISCOTTI NOCCIOLA', tipo: 'torta', porzioni: 20, prezzo: 18,
          ingredienti: [{ nome: 'nocciole', quantita: 300 }] },
  },
  // Forma vera: { costoKg, costoG }. Con un numero nudo `buildIngCosti` lo
  // scarta e ripiega sulla stima HORECA.
  ingredienti_costi: {
    uovo: { costoKg: 4.2, costoG: 0.0042 },
    nocciola: { costoKg: 18.5, costoG: 0.0185 },
    'farina 00': { costoKg: 0.95, costoG: 0.00095 },
  },
}

const props = {
  ricettario, magazzino, setMagazzino: () => {}, logRif: [], setLogRif: () => {},
  logPrezzi: [], giornaliero: [], notify: () => {}, orgId: 'org-1', sedeId: 's1',
}
const monta = (p = {}) => render(<MagazzinoView {...props} {...p} />)

/** Quante volte compare un ingrediente nella colonna dei nomi. */
function righeConNome(container, testo) {
  return [...container.querySelectorAll('td')]
    .filter(td => td.textContent.trim().toLowerCase().startsWith(testo))
    .length
}

beforeEach(() => { salvato.mag = null; cleanup() })

describe('magazzino — un ingrediente, una riga', () => {
  it('la giacenza salvata al plurale non genera una riga fantasma', async () => {
    const v = monta()
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))

    // Prima della correzione: "Uova" con 4,8 kg e "Uovo" a 0,000 kg ESAURITO.
    expect(righeConNome(v.container, 'uov')).toBe(1)
    expect(righeConNome(v.container, 'nocciol')).toBe(1)
  })

  it('la giacenza salvata col nome vecchio si vede, non va persa', async () => {
    const v = monta()
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
    expect(v.container.textContent).toContain('4,80 kg')     // uova
    expect(v.container.textContent).toContain('5,40 kg')     // nocciole
    expect(v.container.textContent).toContain('28,00 kg')    // farina, chiave già canonica
  })

  it('non conta come critico un ingrediente che in magazzino c\'è', async () => {
    // Le tre giacenze sono tutte sopra la loro soglia: nessun critico, e
    // quindi nessun banner d'allarme. Prima ne contava due, fantasma.
    const v = monta()
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
    expect(v.container.textContent).not.toContain('ESAURITO')
    expect(v.container.textContent).not.toContain('Magazzino sotto pressione')
  })

  it('il prezzo si trova anche se la giacenza sta sotto il nome vecchio', async () => {
    // `buildIngCosti` indicizza i prezzi con normIng: il prezzo delle uova sta
    // sotto "uovo". Con la riga chiamata "uova" il lookup falliva e il valore
    // a magazzino risultava sottostimato.
    const v = monta()
    await waitFor(() => expect(v.container.textContent).toContain('Valore a magazzino'))
    // 4,8 kg × 4,20 + 5,4 × 18,50 + 28 × 0,95 = 20,16 + 99,90 + 26,60 = 146,66
    expect(v.container.textContent).toContain('147 €')
    expect(v.container.textContent).toContain('3 su 3 valorizzati')
    // Prezzi inseriti dall'utente: nessuna stima da dichiarare.
    expect(v.container.textContent).not.toContain('stima')
  })

  it('la soglia si somma mai: e\' un livello, non una quantità', async () => {
    // Due chiavi che ricadono sulla stessa canonica devono dare UNA soglia,
    // la più alta, non la loro somma.
    const v = monta({
      magazzino: { uova: { giacenza_g: 1000, soglia_g: 800 }, uovo: { giacenza_g: 500, soglia_g: 300 } },
      ricettario: { ricette: {}, ingredienti_costi: {} },
    })
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
    expect(righeConNome(v.container, 'uov')).toBe(1)
    expect(v.container.textContent).toContain('1,50 kg')   // 1000 + 500 sommati
    expect(v.container.textContent).toContain('0,800 kg')  // soglia, la più alta
  })

  it('normIng resta la fonte della verità sulla forma canonica', () => {
    // Se questa mappa cambia, il raggruppamento cambia con lei: il test serve
    // a rendere esplicito il legame.
    expect(normIng('uova')).toBe('uovo')
    expect(normIng('nocciole')).toBe('nocciola')
    expect(normIng('farina 00')).toBe('farina 00')
  })
})

describe('magazzino — quello che il numero non sa', () => {
  it('dichiara quali prezzi sono stimati e non inseriti', async () => {
    // `buildIngCosti` ripiega su una stima di mercato quando il prezzo non
    // c'è. Prima la tabella mostrava stima e prezzo vero allo stesso modo, e
    // il valore a magazzino li sommava senza dirlo.
    const v = render(<MagazzinoView {...props}
      magazzino={{ 'farina 00': { giacenza_g: 10000, soglia_g: 1000 } }}
      ricettario={{ ricette: {}, ingredienti_costi: {} }} />)
    await waitFor(() => expect(v.container.textContent).toContain('Valore a magazzino'))
    expect(v.container.textContent).toContain('stima')
    expect(v.container.textContent).toContain('a prezzo stimato')
  })

  it('l\'euro sta dopo la cifra, come in italiano', async () => {
    const v = render(<MagazzinoView {...props} />)
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
    expect(v.container.textContent).toMatch(/\d,\d{2} €\/kg/)
    expect(v.container.textContent).not.toMatch(/€ \d/)
  })

  it('non scrive "ingrediente/i"', async () => {
    // Ricettario vuoto: nell'elenco resta il solo burro, cosi' il critico e'
    // uno e il singolare si puo' verificare.
    const v = render(<MagazzinoView {...props}
      magazzino={{ burro: { giacenza_g: 100, soglia_g: 5000 } }}
      ricettario={{ ricette: {}, ingredienti_costi: {} }} />)
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
    expect(v.container.textContent).not.toContain('ingrediente/i')
    // Accordo al singolare, e la voce del verbo che gli tocca.
    expect(v.container.textContent).toMatch(/1 ingrediente ha toccato la soglia/)
    expect(v.container.textContent).not.toContain('ingredienti hanno')
  })
})

describe('magazzino — il rosso a chi tocca', () => {
  it('sotto la soglia di riordino non e\' un allarme rosso', async () => {
    // Toccare la soglia e' il sistema che funziona: la soglia esiste per dire
    // "ordina". La pagina si apriva in allarme rosso per la condizione normale
    // di una cucina ben gestita.
    const v = render(<MagazzinoView {...props}
      magazzino={{ burro: { giacenza_g: 100, soglia_g: 5000 } }}
      ricettario={{ ricette: {}, ingredienti_costi: {} }} />)
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
    expect(v.container.textContent).toContain('Da mettere in lista')
    expect(v.container.textContent).toContain('la lista della spesa')
    expect(v.container.textContent).not.toContain('Magazzino sotto pressione')
    // E nella tabella la parola dice cosa fare, non che c'e' una crisi.
    expect(v.container.textContent).toContain('Da ordinare')
    expect(v.container.textContent).not.toContain('Critico')
  })

  it('a zero invece l\'allarme e\' dovuto: non si produce', async () => {
    const v = render(<MagazzinoView {...props}
      magazzino={{ burro: { giacenza_g: 0, soglia_g: 5000 } }}
      ricettario={{ ricette: {}, ingredienti_costi: {} }} />)
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
    expect(v.container.textContent).toContain('Un ingrediente è finito')
    expect(v.container.textContent).toContain('1 ingrediente a zero')
    expect(v.container.textContent).toContain('Esaurito')
  })

  it('con tutto a posto lo dice senza festeggiare', async () => {
    const v = render(<MagazzinoView {...props}
      magazzino={{ burro: { giacenza_g: 20000, soglia_g: 5000 } }}
      ricettario={{ ricette: {}, ingredienti_costi: {} }} />)
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
    expect(v.container.textContent).toContain('Scorte in equilibrio')
  })
})
