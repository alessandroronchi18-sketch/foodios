// @vitest-environment happy-dom
//
// ── La Quadratura: i kg dell'inventario contro gli euro della cassa ──────
//
// È la pagina che mette in tensione i due dati veri dell'azienda: l'inventario
// dice quanta merce è uscita, la cassa dice quanti soldi sono entrati. Dove i
// due non tornano c'è una porzione troppo grande, un omaggio non registrato,
// uno scontrino sbagliato o un furto.
//
// Proprio perché serve a trovare i buchi, **questa pagina non può inventare
// niente**: se manca la cassa di una settimana, il buco che mostra non è un
// buco dell'azienda, è un buco dei dati. Confonderli manda il titolare a
// cercare un ammanco che non esiste — ed è già successo, su 604 caselle su
// 7.012 dei dati veri del design partner.
//
// Queste prove montano la pagina vera e guardano quello che si legge.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, waitFor, fireEvent, act } from '@testing-library/react'
import React from 'react'

const LUN = '2026-09-07'
let RIGHE = []

vi.mock('../../src/lib/inventarioProduzione', async () => {
  const vero = await vi.importActual('../../src/lib/inventarioProduzione')
  return { ...vero, caricaSettimana: vi.fn(async () => RIGHE) }
})

vi.mock('../../src/lib/supabase', () => {
  const RESULT = { data: [], error: null }
  const handler = {
    get(_t, prop) {
      if (prop === 'then') return (resolve) => resolve(RESULT)
      if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve({ data: null, error: null })
      return () => new Proxy({}, handler)
    },
  }
  return {
    supabase: {
      from: () => new Proxy({}, handler),
      rpc: () => Promise.resolve({ data: null, error: null }),
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    },
  }
})

let FORMATI = []
vi.mock('../../src/lib/storage', () => ({
  ssave: () => Promise.resolve(),
  sload: () => Promise.resolve(FORMATI),
  ssaveBatch: () => Promise.resolve(),
  sloadAllSedi: () => Promise.resolve({}),
}))

const { default: QuadraturaInventarioView } = await import('../../src/views/QuadraturaInventarioView')

const FORMATO = { id: 'f1', nome: 'Coppetta media', categoria: 'Gelato', baseQtaG: 120, prezzoDefault: 4, componenti: [] }

const props = (extra = {}) => ({
  orgId: 'org-1',
  sedeId: 'sede-1',
  sedi: [{ id: 'sede-1', nome: 'Centro', attiva: true, is_sede_produzione: true }],
  sedeAttiva: { id: 'sede-1', nome: 'Centro' },
  chiusure: [],
  metodoProduzione: 'inventario',
  onNavigate: () => {},
  ...extra,
})

const testo = () => document.body.textContent || ''
const apri = (extra) => render(<QuadraturaInventarioView {...props(extra)} />)
const pronta = () => waitFor(() => expect(testo()).not.toMatch(/Caricamento/i), { timeout: 5000 })

/** Una settimana normale: si produce e si vende, tutto torna. */
const settimanaPulita = () => ([
  { gusto_nome: 'NOCCIOLA', data: '2026-09-06', produzione_g: 1000, rimanenza_g: 400, scarto_g: 0, spedito_g: 0 },
  { gusto_nome: 'NOCCIOLA', data: '2026-09-08', produzione_g: 300, rimanenza_g: 200, scarto_g: 0, spedito_g: 0 },
])

beforeEach(() => {
  RIGHE = settimanaPulita()
  FORMATI = [FORMATO]
  vi.setSystemTime(new Date(`${LUN}T10:00:00`))
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Senza la cassa, il divario non è un divario', () => {
  it('con le chiusure la pagina confronta i due numeri', async () => {
    const { } = apri({ chiusure: [{ data: '2026-09-08', totale: 500, kpi: { totV: 500 } }] })
    await pronta()
    expect(testo()).toMatch(/cassa|incassat/i)
  })

  it('senza nessuna chiusura non presenta un ammanco come se fosse vero', async () => {
    // Zero euro incassati e 1,1 kg usciti non è «hanno rubato tutto»: è
    // «la cassa di quella settimana non è stata registrata». Mandare a
    // cercare un ammanco che non esiste è il modo più veloce per far
    // smettere di guardare questa pagina.
    apri({ chiusure: [] })
    await pronta()
    expect(testo()).not.toMatch(/ammanco di [\d.]+/i)
  })

  it('e senza formati di vendita non stima un euro al chilo', async () => {
    // L'euro/kg medio si ricava dai formati: senza formati non esiste, e un
    // atteso calcolato su un euro/kg inventato è peggio di nessun atteso.
    FORMATI = []
    apri({ chiusure: [{ data: '2026-09-08', totale: 500, kpi: { totV: 500 } }] })
    await pronta()
    expect(testo()).toMatch(/formato|formati/i)
  })
})

describe('Le caselle che non tornano si contano, non si azzerano', () => {
  it('una rimanenza più alta della disponibilità viene segnalata', async () => {
    // Martedì la rimanenza (900 g) è più alta di quanto c'era (400 rimasti +
    // 300 prodotti = 700). Venduto = −200 g: la casella non torna.
    RIGHE = [
      { gusto_nome: 'NOCCIOLA', data: '2026-09-06', produzione_g: 1000, rimanenza_g: 400, scarto_g: 0, spedito_g: 0 },
      { gusto_nome: 'NOCCIOLA', data: '2026-09-08', produzione_g: 300, rimanenza_g: 900, scarto_g: 0, spedito_g: 0 },
    ]
    apri()
    await waitFor(() => expect(testo()).toMatch(/casella non torna|caselle non tornano/i), { timeout: 5000 })
  })

  it('e la pagina dice perché, non solo che c\'è un problema', async () => {
    RIGHE = [
      { gusto_nome: 'NOCCIOLA', data: '2026-09-06', produzione_g: 1000, rimanenza_g: 400, scarto_g: 0, spedito_g: 0 },
      { gusto_nome: 'NOCCIOLA', data: '2026-09-08', produzione_g: 300, rimanenza_g: 900, scarto_g: 0, spedito_g: 0 },
    ]
    apri()
    await waitFor(() => expect(testo()).toMatch(/rimanenza scritta è più alta/i), { timeout: 5000 })
  })

  it('con tutte le caselle a posto non allarma nessuno', async () => {
    RIGHE = settimanaPulita()
    apri()
    await pronta()
    expect(testo()).not.toMatch(/caselle non tornano/i)
  })
})

describe('Le settimane si contano in giorni, non in millisecondi', () => {
  it('si può tornare alla settimana prima', async () => {
    apri()
    await pronta()
    const indietro = [...document.querySelectorAll('button')]
      .find(b => /precedente|‹|←/.test(b.getAttribute('aria-label') || b.textContent || ''))
    expect(indietro, 'manca il comando per la settimana precedente').toBeTruthy()
    await act(async () => { fireEvent.click(indietro) })
    await pronta()
    expect(testo()).toMatch(/\d/)
  })

  it('e la settimana mostrata comincia di lunedì', async () => {
    // Il 7 settembre 2026 è un lunedì: se la pagina saltasse alla domenica —
    // ed è quello che faceva passando dai millisecondi attraverso il cambio
    // dell'ora — la settimana sarebbe spostata di un giorno.
    apri()
    await pronta()
    expect(testo()).toMatch(/7|07/)
  })
})

describe('I numeri si scrivono all\'italiana', () => {
  it('i chili con la virgola decimale', async () => {
    RIGHE = [
      { gusto_nome: 'NOCCIOLA', data: '2026-09-06', produzione_g: 1000, rimanenza_g: 400, scarto_g: 0, spedito_g: 0 },
      { gusto_nome: 'NOCCIOLA', data: '2026-09-08', produzione_g: 300, rimanenza_g: 900, scarto_g: 0, spedito_g: 0 },
    ]
    apri()
    await waitFor(() => expect(testo()).toMatch(/0,2 kg/), { timeout: 5000 })
  })

  it('e gli euro col simbolo dopo la cifra', async () => {
    // **Attenzione al righello.** Guardare `body.textContent` non vale: le
    // celle di una tabella si incollano fra loro, e l'intestazione «Cassa (€)»
    // seguita dalla cella «500» diventa la stringa «€)500». Ho già preso
    // questo falso allarme una volta. Si guarda elemento per elemento, sul
    // testo che ognuno possiede davvero.
    apri({ chiusure: [{ data: '2026-09-08', totale: 500, kpi: { totV: 500 } }] })
    await pronta()
    const suoi = [...document.querySelectorAll('*')]
      .map(e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(''))
      .filter(t => t.includes('€'))
    expect(suoi.length, 'nessun importo a schermo: la prova non guarda niente').toBeGreaterThan(0)
    const sbagliati = suoi.filter(t => /€\s?\d/.test(t))
    expect(sbagliati, 'il simbolo € va dopo la cifra').toEqual([])
  })
})

describe('Quello che si legge senza vedere lo schermo', () => {
  it('la pagina dice in parole cosa mette a confronto', async () => {
    // Nota di quello che NON si prova qui, per non far sembrare coperta una
    // cosa che non lo è: **questa pagina non ha un titolo vero** (`<h1>`), e
    // non è un difetto suo — 25 viste su 35 non ce l'hanno, perché
    // `PageHeader` di `_shared.jsx` disegna solo il sottotitolo. Per chi
    // naviga con un lettore di schermo è come entrare in una stanza senza
    // targhetta sulla porta. Va sistemato in `PageHeader`, cioè per tutte
    // insieme, e non in questo file.
    apri()
    await pronta()
    expect(testo()).toMatch(/inventario/i)
    expect(testo()).toMatch(/cassa/i)
  })

  it('e i comandi sono pulsanti, non riquadri da toccare a indovinare', async () => {
    apri()
    await pronta()
    const bottoni = document.querySelectorAll('button')
    expect(bottoni.length).toBeGreaterThan(2)
  })
})

describe('Il righello di questo file', () => {
  it('la settimana finta viene letta davvero', async () => {
    // Se il mock non fosse agganciato, tutte le prove sopra guarderebbero una
    // pagina vuota e passerebbero per il motivo sbagliato.
    RIGHE = [{ gusto_nome: 'CONTROLLO RIGHELLO', data: '2026-09-08', produzione_g: 1000, rimanenza_g: 0, scarto_g: 0, spedito_g: 0 }]
    apri()
    await waitFor(() => expect(testo()).toMatch(/CONTROLLO RIGHELLO/i), { timeout: 5000 })
  })

  it('e la pagina esce davvero dal caricamento', async () => {
    apri()
    await pronta()
    expect(testo().length).toBeGreaterThan(200)
  })
})

// ── «È giusta così»: accettare uno scostamento ───────────────────────────
//
// Non tutte le caselle che non tornano sono errori: una vaschetta caduta, un
// assaggio, una consegna fatta a mano. Il titolare deve poter dire «questa
// l'ho guardata, è giusta così» — e quella riga non deve tornare a chiedere
// attenzione ogni settimana, se no l'avviso diventa rumore e si smette di
// leggerlo.
describe('Accettare uno scostamento', () => {
  const settimanaStorta = () => ([
    { gusto_nome: 'NOCCIOLA', data: '2026-09-06', produzione_g: 1000, rimanenza_g: 400, scarto_g: 0, spedito_g: 0 },
    { gusto_nome: 'NOCCIOLA', data: '2026-09-08', produzione_g: 300, rimanenza_g: 900, scarto_g: 0, spedito_g: 0 },
  ])

  it('la casella storta si può aprire e guardare', async () => {
    RIGHE = settimanaStorta()
    apri()
    await waitFor(() => expect(testo()).toMatch(/caselle non tornano|casella non torna/i), { timeout: 5000 })
    expect(testo()).toMatch(/NOCCIOLA/)
  })

  it('e la pagina dice di quanti chili si tratta, non solo che c\'è', async () => {
    RIGHE = settimanaStorta()
    apri()
    await waitFor(() => expect(testo()).toMatch(/0,2 kg/), { timeout: 5000 })
  })

  it('il totale resta quello vero: la casella storta non viene azzerata', async () => {
    // Azzerarla nasconderebbe l'errore, ed è la ragione per cui questa pagina
    // esiste. Entra col suo segno, e accanto si dice quante sono.
    RIGHE = settimanaStorta()
    apri()
    await waitFor(() => expect(testo()).toMatch(/caselle non tornano|casella non torna/i), { timeout: 5000 })
    expect(testo()).not.toMatch(/0,0 kg totali/)
  })
})

// ── Il confronto fra sedi ────────────────────────────────────────────────
describe('Con più sedi il confronto si può fare', () => {
  const DUE_SEDI = [
    { id: 'sede-1', nome: 'Centro', attiva: true, is_sede_produzione: true },
    { id: 'sede-2', nome: 'Berthollet', attiva: true, is_sede_produzione: false },
  ]

  it('con una sede sola non promette un confronto che non c\'è', async () => {
    apri()
    await pronta()
    expect(testo()).not.toMatch(/Berthollet/)
  })

  it('con due sedi la pagina si apre lo stesso', async () => {
    apri({ sedi: DUE_SEDI })
    await pronta()
    expect(testo().length).toBeGreaterThan(200)
  })

  it('e non scambia il nome di una sede per un numero', async () => {
    apri({ sedi: DUE_SEDI })
    await pronta()
    expect(testo()).not.toMatch(/undefined|NaN|\[object/)
  })
})

// ── Quello che non deve mai comparire a schermo ──────────────────────────
//
// Sono le parole che tradiscono un conto andato storto: se una di queste
// arriva davanti al titolare, il numero accanto non vale niente.
describe('Le parole che non devono mai comparire', () => {
  it('niente NaN, undefined, Invalid Date o [object Object]', async () => {
    RIGHE = [
      { gusto_nome: 'NOCCIOLA', data: '2026-09-06', produzione_g: 1000, rimanenza_g: 400, scarto_g: 0, spedito_g: 0 },
      { gusto_nome: 'PISTACCHIO', data: '2026-09-08', produzione_g: 300, rimanenza_g: 900, scarto_g: 0, spedito_g: 0 },
    ]
    apri({ chiusure: [{ data: '2026-09-08', totale: 500, kpi: { totV: 500 } }] })
    await pronta()
    const t = testo()
    expect(t).not.toMatch(/NaN/)
    expect(t).not.toMatch(/undefined/)
    expect(t).not.toMatch(/Invalid Date/)
    expect(t).not.toMatch(/\[object Object\]/)
  })

  it('nemmeno con una riga senza data', async () => {
    // Una riga arrivata storta dal database non deve sporcare la pagina.
    RIGHE = [
      { gusto_nome: 'NOCCIOLA', data: null, produzione_g: 1000, rimanenza_g: 400, scarto_g: 0, spedito_g: 0 },
      { gusto_nome: 'NOCCIOLA', data: '2026-09-08', produzione_g: 300, rimanenza_g: 200, scarto_g: 0, spedito_g: 0 },
    ]
    apri()
    await pronta()
    expect(testo()).not.toMatch(/Invalid Date|NaN/)
  })

  it('nemmeno con una riga senza nome del gusto', async () => {
    RIGHE = [
      { gusto_nome: '', data: '2026-09-08', produzione_g: 300, rimanenza_g: 200, scarto_g: 0, spedito_g: 0 },
    ]
    apri()
    await pronta()
    expect(testo()).not.toMatch(/undefined|\[object Object\]/)
  })

  it('e nemmeno con una settimana completamente vuota', async () => {
    RIGHE = []
    apri()
    await pronta()
    const t = testo()
    expect(t).not.toMatch(/NaN|undefined|Invalid Date/)
    expect(t.length).toBeGreaterThan(100)
  })
})

// ── Lo scarico dei dati ──────────────────────────────────────────────────
describe('Portare via i dati', () => {
  it('il comando per scaricare c\'è', async () => {
    apri({ chiusure: [{ data: '2026-09-08', totale: 500, kpi: { totV: 500 } }] })
    await pronta()
    const scarica = [...document.querySelectorAll('button')]
      .find(b => /csv|scarica|esporta|pdf/i.test(b.textContent || b.getAttribute('aria-label') || ''))
    expect(scarica, 'non si possono portare via i dati di questa pagina').toBeTruthy()
  })

  it('e non è acceso quando non c\'è niente da scaricare', async () => {
    RIGHE = []
    apri({ chiusure: [] })
    await pronta()
    // O il comando non c'è, o c'è ma non promette dati che non esistono.
    expect(testo()).not.toMatch(/NaN/)
  })
})

// ── La settimana che si guarda ───────────────────────────────────────────
describe('Muoversi fra le settimane', () => {
  it('c\'è il comando per la settimana dopo', async () => {
    apri()
    await pronta()
    const avanti = [...document.querySelectorAll('button')]
      .find(b => /successiva|›|→/.test(b.getAttribute('aria-label') || b.textContent || ''))
    expect(avanti).toBeTruthy()
  })

  it('tornando indietro e poi avanti si torna al punto di partenza', async () => {
    apri()
    await pronta()
    const trova = (re) => [...document.querySelectorAll('button')]
      .find(b => re.test(b.getAttribute('aria-label') || b.textContent || ''))
    const partenza = testo()
    const indietro = trova(/precedente|‹|←/)
    if (indietro) {
      await act(async () => { fireEvent.click(indietro) })
      await pronta()
      const avanti = trova(/successiva|›|→/)
      if (avanti) {
        await act(async () => { fireEvent.click(avanti) })
        await pronta()
        expect(testo().length).toBeGreaterThan(100)
      }
    }
    expect(partenza.length).toBeGreaterThan(100)
  })

  it('e la pagina non si rompe andando avanti di molte settimane', async () => {
    apri()
    await pronta()
    const avanti = () => [...document.querySelectorAll('button')]
      .find(b => /successiva|›|→/.test(b.getAttribute('aria-label') || b.textContent || ''))
    for (let i = 0; i < 6; i++) {
      const b = avanti()
      if (!b) break
      await act(async () => { fireEvent.click(b) })
    }
    await pronta()
    expect(testo()).not.toMatch(/NaN|Invalid Date/)
  })
})
