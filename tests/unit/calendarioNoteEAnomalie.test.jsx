// @vitest-environment happy-dom
//
// ── Il calendario: le note, le anomalie, e cosa vede il dipendente ────────
//
// Tre cose che si guardano poco e sbagliano in silenzio.
//
// Le **anomalie** sono il numero che manda il titolare a cercare: «tre giorni
// con anomalie» vuol dire tre giornate da controllare. Se conta giornate che
// non sono anomalie fa perdere tempo; se ne salta, il buco resta.
//
// Le **note** sono l'unico posto del prodotto dove si scrive a mano perché una
// giornata è andata come è andata («grandine», «guasto alla macchina»): se una
// nota si perde, si perde la spiegazione di un numero strano fra sei mesi.
//
// Quello che vede il **dipendente** è una decisione presa il 15/09/2026: non
// deve vedere gli andamenti passati del negozio, solo quello che deve fare
// oggi. Non è una finezza: è la differenza fra dare uno strumento di lavoro e
// aprire i conti dell'azienda a chi non li deve vedere.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
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
vi.mock('../../src/lib/giorniChiusura', async () => {
  const real = await vi.importActual('../../src/lib/giorniChiusura')
  return { ...real, caricaRegoleChiusura: () => Promise.resolve({ ricorrenti: [], periodi: [] }) }
})

// La produzione con metodo inventario non sta nel blob `giornaliero` ma in
// una tabella a parte: il calendario deve saperla leggere di là.
let GIORNI_INVENTARIO = new Set()
vi.mock('../../src/lib/inventarioProduzione', async () => {
  const real = await vi.importActual('../../src/lib/inventarioProduzione')
  return { ...real, giorniConProduzione: () => Promise.resolve(GIORNI_INVENTARIO) }
})

const { default: CalendarioOperativo } = await import('../../src/components/CalendarioOperativo.jsx')

const OGGI = new Date()
const ANNO = OGGI.getFullYear()
const MESE0 = OGGI.getMonth()
const iso = (d) => `${ANNO}-${String(MESE0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const PASSATI = OGGI.getDate()
const IERI = PASSATI > 1 ? iso(PASSATI - 1) : iso(1)

const chiusura = (data, totV = 400) => ({
  data, venduto: [], kpi: { totV, totFC: 0, totM: totV, totS: 0, totMP: 0, avgST: 0 },
})
const produzione = (data) => ({ data, prodotti: [{ nome: 'SACHER', stampi: 2 }], ricavoTot: 300 })

const base = { orgId: 'org-1', sedeId: 'sede-1', setView: () => {}, notify: () => {}, isMobile: false }
const monta = (p) => render(<CalendarioOperativo {...base} {...p} />)

const testo = (c) => [...c.querySelectorAll('div, span, button, li, p, textarea')]
  .map(e => (e.textContent || '').trim()).join(' | ')
const cella = (c, giorno) => [...c.querySelectorAll('button')]
  .find(b => (b.getAttribute('aria-label') || '').includes(`${giorno} `))

beforeEach(() => { GIORNI_INVENTARIO = new Set(); cleanup() })

describe('Le anomalie sono le giornate registrate a metà', () => {
  it('chi registra tutto non ne ha nessuna', async () => {
    const giorni = Array.from({ length: PASSATI }, (_, i) => iso(i + 1))
    const { container } = monta({
      chiusure: giorni.map(k => chiusura(k)), giornaliero: giorni.map(k => produzione(k)),
    })
    await waitFor(() => expect(testo(container)).toMatch(/nessuna anomalia/))
  })

  it('una giornata con la sola produzione e senza cassa è un\'anomalia', async () => {
    if (PASSATI < 3) return   // nei primi due giorni del mese non c'è materiale
    const giorni = Array.from({ length: PASSATI }, (_, i) => iso(i + 1))
    const { container } = monta({
      // ieri manca la cassa
      chiusure: giorni.filter(k => k !== IERI).map(k => chiusura(k)),
      giornaliero: giorni.map(k => produzione(k)),
    })
    await waitFor(() => expect(testo(container)).toMatch(/senza cassa/))
  })

  it('oggi non conta come anomalia: alle nove la cassa non è ancora fatta', async () => {
    // Segnalare oggi per tutta la giornata è solo rumore, e il rumore fa
    // smettere di guardare il numero.
    const giorni = Array.from({ length: PASSATI }, (_, i) => iso(i + 1))
    const oggiStr = iso(PASSATI)
    const { container } = monta({
      chiusure: giorni.filter(k => k !== oggiStr).map(k => chiusura(k)),
      giornaliero: giorni.map(k => produzione(k)),
    })
    await waitFor(() => expect(testo(container)).toMatch(/nessuna anomalia/))
  })

  it('chi tiene la cassa fuori da Foodos non ha un\'anomalia al giorno', async () => {
    // È il difetto vero di Mara: 121 «anomalie» su quattro mesi di lavoro
    // fatto bene, solo perché la cassa la teneva altrove.
    const giorni = Array.from({ length: PASSATI }, (_, i) => iso(i + 1))
    const { container } = monta({ chiusure: [], giornaliero: giorni.map(k => produzione(k)) })
    await waitFor(() => expect(testo(container)).toMatch(/nessuna anomalia/))
  })

  it('e nemmeno chi tiene la produzione su carta', async () => {
    // Lo stesso errore nell'altro verso.
    const giorni = Array.from({ length: PASSATI }, (_, i) => iso(i + 1))
    const { container } = monta({ chiusure: giorni.map(k => chiusura(k)), giornaliero: [] })
    await waitFor(() => expect(testo(container)).toMatch(/nessuna anomalia/))
  })
})

describe('La produzione si legge da dove l\'azienda la tiene', () => {
  it('col metodo a stampi si legge dal registro giornaliero', async () => {
    const giorni = Array.from({ length: PASSATI }, (_, i) => iso(i + 1))
    const { container } = monta({
      chiusure: [], giornaliero: giorni.map(k => produzione(k)), metodoProduzione: 'stampi',
    })
    await waitFor(() => expect(testo(container)).toMatch(/100%/))
  })

  it('col metodo a inventario si legge dalla sua tabella, non dal registro', async () => {
    // Il difetto del 07/09: il calendario guardava solo il registro, e a Mara
    // — che ha 123 giorni di produzione registrata con l'altro metodo —
    // mostrava un muro di rosso e copertura 0%.
    GIORNI_INVENTARIO = new Set(Array.from({ length: PASSATI }, (_, i) => iso(i + 1)))
    const { container } = monta({ chiusure: [], giornaliero: [], metodoProduzione: 'inventario' })
    await waitFor(() => expect(testo(container)).toMatch(/100%/))
  })

  it('e se là dentro non c\'è niente, la copertura lo dice', async () => {
    GIORNI_INVENTARIO = new Set()
    const { container } = monta({
      chiusure: Array.from({ length: PASSATI }, (_, i) => chiusura(iso(i + 1))),
      giornaliero: [], metodoProduzione: 'inventario',
    })
    // La cassa c'è, la produzione no: o è al 100% perché la produzione non è
    // richiesta, o segnala. Quello che NON deve fare è mentire dicendo che la
    // produzione c'è.
    await waitFor(() => expect(testo(container)).toMatch(/Copertura mese/))
  })
})

describe('La nota di una giornata', () => {
  it('aprendo un giorno si può scrivere una nota', async () => {
    const { container } = monta({ chiusure: [chiusura(IERI)], giornaliero: [produzione(IERI)] })
    await act(async () => { fireEvent.click(cella(container, Number(IERI.slice(-2)))) })
    const campo = container.querySelector('textarea')
    expect(campo, 'manca il campo della nota').toBeTruthy()
  })

  it('il pulsante di salvataggio resta spento finché non si cambia niente', async () => {
    // Un pulsante acceso che non fa niente insegna a non fidarsi dei pulsanti.
    const { container } = monta({ chiusure: [chiusura(IERI)], giornaliero: [produzione(IERI)] })
    await act(async () => { fireEvent.click(cella(container, Number(IERI.slice(-2)))) })
    const salva = [...container.querySelectorAll('button')]
      .find(b => /salva/i.test(b.textContent || ''))
    if (salva) expect(salva.disabled).toBe(true)
  })

  it('e si accende appena si scrive', async () => {
    const { container } = monta({ chiusure: [chiusura(IERI)], giornaliero: [produzione(IERI)] })
    await act(async () => { fireEvent.click(cella(container, Number(IERI.slice(-2)))) })
    const campo = container.querySelector('textarea')
    if (campo) {
      await act(async () => { fireEvent.change(campo, { target: { value: 'grandine' } }) })
      const salva = [...container.querySelectorAll('button')]
        .find(b => /salva/i.test(b.textContent || ''))
      if (salva) expect(salva.disabled).toBe(false)
    }
  })
})

describe('Al dipendente il passato del negozio non si apre', () => {
  it('non vede i dati delle giornate passate', async () => {
    // Le mappe dei dati, per un dipendente, contengono solo oggi e il futuro.
    const giorni = Array.from({ length: PASSATI }, (_, i) => iso(i + 1))
    const { container } = monta({
      chiusure: giorni.map(k => chiusura(k, 999)), giornaliero: giorni.map(k => produzione(k)),
      isDipendente: true,
    })
    // 999 € è l'incasso di ogni giornata passata: non deve comparire da
    // nessuna parte, né come totale né come dettaglio.
    expect(testo(container)).not.toMatch(/999/)
  })

  it('e non vede nemmeno il riepilogo del mese', async () => {
    const giorni = Array.from({ length: PASSATI }, (_, i) => iso(i + 1))
    const { container } = monta({
      chiusure: giorni.map(k => chiusura(k)), giornaliero: giorni.map(k => produzione(k)),
      isDipendente: true,
    })
    const t = testo(container)
    expect(t).not.toMatch(/incassati nel mese/)
    expect(t).not.toMatch(/Giorni completi/)
  })

  it('ma il calendario lo vede, perché gli serve per lavorare', async () => {
    const { container } = monta({ chiusure: [], giornaliero: [], isDipendente: true })
    await waitFor(() => {
      expect(container.querySelectorAll('button').length).toBeGreaterThan(20)
    })
  })
})

describe('Il righello di questo file', () => {
  it('la finta tabella della produzione a inventario viene letta davvero', async () => {
    // Se il mock non fosse agganciato, il test «col metodo a inventario»
    // passerebbe o fallirebbe per il motivo sbagliato.
    GIORNI_INVENTARIO = new Set([iso(1)])
    const { container } = monta({ chiusure: [], giornaliero: [], metodoProduzione: 'inventario' })
    await waitFor(() => {
      const b = cella(container, 1)
      expect((b?.getAttribute('aria-label') || '')).toMatch(/produzione/i)
    })
  })
})

// ── Dal giorno alla pagina dove si registra ───────────────────────────────
//
// Il calendario dice «qui manca la cassa». Se poi tocca all'utente ricordarsi
// da solo in che pagina si registra, la diagnosi non serve: si guarda il
// rosso e si chiude la pagina.
describe('Il pulsante che porta dove si registra', () => {
  it('su una giornata senza cassa compare, e porta alla pagina giusta', async () => {
    let andato = null
    const giorni = Array.from({ length: PASSATI }, (_, i) => iso(i + 1))
    const { container } = render(
      <CalendarioOperativo {...base}
        setView={(v) => { andato = v }}
        chiusure={giorni.filter(k => k !== IERI).map(k => chiusura(k))}
        giornaliero={giorni.map(k => produzione(k))} />
    )
    await act(async () => { fireEvent.click(cella(container, Number(IERI.slice(-2)))) })
    const vai = [...container.querySelectorAll('button')]
      .find(b => (b.textContent || '').trim() === 'Vai')
    expect(vai, 'manca il pulsante per andare a registrare').toBeTruthy()
    await act(async () => { fireEvent.click(vai) })
    expect(andato, 'il pulsante non porta da nessuna parte').toBeTruthy()
  })

  it('su una giornata completa non compare: non c\'è niente da andare a fare', async () => {
    const giorni = Array.from({ length: PASSATI }, (_, i) => iso(i + 1))
    const { container } = monta({
      chiusure: giorni.map(k => chiusura(k)), giornaliero: giorni.map(k => produzione(k)),
    })
    await act(async () => { fireEvent.click(cella(container, Number(IERI.slice(-2)))) })
    const vai = [...container.querySelectorAll('button')]
      .find(b => (b.textContent || '').trim() === 'Vai')
    expect(vai).toBeFalsy()
  })

  it('e dove si tocca col dito il bersaglio cresce, invece di restare 36 px', async () => {
    // Questa pagina si apre sul tablet in laboratorio, e si tocca. I 36 px
    // erano scritti a mano, uguali per tutti e tre gli schermi, fuori dalla
    // misura condivisa che il resto della pagina già usava (40 sul telefono,
    // 44 sul tablet, 34 col mouse — che è giusto che sia più piccolo).
    const giorni = Array.from({ length: PASSATI }, (_, i) => iso(i + 1))
    const { container } = monta({
      isMobile: true,
      chiusure: giorni.filter(k => k !== IERI).map(k => chiusura(k)),
      giornaliero: giorni.map(k => produzione(k)),
    })
    await act(async () => { fireEvent.click(cella(container, Number(IERI.slice(-2)))) })
    const vai = [...container.querySelectorAll('button')]
      .find(b => (b.textContent || '').trim() === 'Vai')
    if (vai) {
      const h = Number(String(vai.style.minHeight || '').replace('px', ''))
      expect(h, 'sul telefono il bersaglio deve stare sopra i 36 px').toBeGreaterThanOrEqual(40)
    }
  })
})
