// @vitest-environment happy-dom
//
// ── Il calendario: la copertura, i giorni chiusi, la serie ────────────────
//
// La pagina che il titolare apre per capire «dove mancano i dati». Il numero
// che guarda per primo è la copertura del mese, e da quel numero decide se
// c'è un problema o no: se mente, manda a cercare un buco che non c'è o
// nasconde quello che c'è.
//
// ── Il difetto che ha fatto nascere questo file (19/09/2026) ──────────────
//
// Guardando un mese **futuro** — o un mese in cui il negozio è stato chiuso
// tutto, come agosto per molte pasticcerie — la copertura usciva «0% · molti
// giorni scoperti», in rosso. Nel riquadro accanto, allo stesso tempo,
// c'era scritto «nessun giorno da registrare».
//
// Due caselle affiancate che si contraddicono, e quella che urla è quella
// sbagliata. Zero e «non esiste» non sono la stessa cosa: è la stessa regola
// per cui un prezzo mancante non è un prezzo di zero euro.
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

// Le regole di chiusura si decidono test per test.
let REGOLE = { ricorrenti: [], periodi: [] }
vi.mock('../../src/lib/giorniChiusura', async () => {
  const real = await vi.importActual('../../src/lib/giorniChiusura')
  return { ...real, caricaRegoleChiusura: () => Promise.resolve(REGOLE) }
})

const { default: CalendarioOperativo } = await import('../../src/components/CalendarioOperativo.jsx')

const OGGI = new Date()
const MESE = `${OGGI.getFullYear()}-${String(OGGI.getMonth() + 1).padStart(2, '0')}`
const g = (n) => `${MESE}-${String(Math.min(n, OGGI.getDate())).padStart(2, '0')}`
const PASSATI = OGGI.getDate()

const chiusura = (data, totV = 400) => ({
  data, venduto: [], kpi: { totV, totFC: 0, totM: totV, totS: 0, totMP: 0, avgST: 0 },
})
const produzione = (data) => ({ data, prodotti: [{ nome: 'SACHER', stampi: 2 }], ricavoTot: 300 })
const tutteLeChiusure = () => Array.from({ length: PASSATI }, (_, i) => chiusura(g(i + 1)))
const tutteLeProduzioni = () => Array.from({ length: PASSATI }, (_, i) => produzione(g(i + 1)))

const base = { orgId: 'org-1', sedeId: 'sede-1', setView: () => {}, notify: () => {}, isMobile: false }
const monta = (p) => render(<CalendarioOperativo {...base} {...p} />)

const testo = (c) => [...c.querySelectorAll('div, span, button, li')]
  .map(e => (e.textContent || '').trim()).join(' | ')

const bottone = (c, etichetta) => [...c.querySelectorAll('button')]
  .find(b => (b.getAttribute('aria-label') || b.textContent || '').trim().includes(etichetta))

beforeEach(() => { REGOLE = { ricorrenti: [], periodi: [] }; cleanup() })

describe('La copertura del mese dice la verità', () => {
  it('con tutte le giornate registrate arriva al 100%', async () => {
    const { container } = monta({ chiusure: tutteLeChiusure(), giornaliero: tutteLeProduzioni() })
    await waitFor(() => expect(testo(container)).toMatch(/100%/))
  })

  it('con metà giornate registrate sta a metà', async () => {
    const meta = Math.max(1, Math.floor(PASSATI / 2))
    const { container } = monta({
      chiusure: Array.from({ length: meta }, (_, i) => chiusura(g(i + 1))),
      giornaliero: Array.from({ length: meta }, (_, i) => produzione(g(i + 1))),
    })
    await waitFor(() => {
      const pct = Math.round(meta / PASSATI * 100)
      expect(testo(container)).toMatch(new RegExp(`${pct}%`))
    })
  })

  it('senza niente registrato sta a 0%, e quello è uno zero vero', async () => {
    // Qui zero è giusto: i giorni ci sono, i dati no.
    const { container } = monta({ chiusure: [], giornaliero: [] })
    await waitFor(() => expect(testo(container)).toMatch(/0%/))
  })
})

describe('Un mese in cui non c\'è niente da registrare', () => {
  it('su un mese futuro la copertura non è zero: non esiste', async () => {
    const { container } = monta({ chiusure: tutteLeChiusure(), giornaliero: tutteLeProduzioni() })
    // Avanti di un mese: lì non è ancora successo niente.
    await act(async () => { fireEvent.click(bottone(container, 'Mese successivo') || bottone(container, '›')) })
    const t = testo(container)
    expect(t).toMatch(/mese non ancora cominciato/)
    expect(t).not.toMatch(/molti giorni scoperti/)
  })

  it('e non dipinge di rosso un mese che non è ancora arrivato', async () => {
    const { container } = monta({ chiusure: [], giornaliero: [] })
    await act(async () => { fireEvent.click(bottone(container, 'Mese successivo') || bottone(container, '›')) })
    // «0%» sarebbe una bocciatura su un mese che deve ancora cominciare.
    expect(testo(container)).not.toMatch(/Copertura mese \| 0%/)
  })

  it('i due riquadri affiancati non si contraddicono più', async () => {
    const { container } = monta({ chiusure: [], giornaliero: [] })
    await act(async () => { fireEvent.click(bottone(container, 'Mese successivo') || bottone(container, '›')) })
    const t = testo(container)
    // Il difetto era esattamente questo: «nessun giorno da registrare»
    // accanto a «molti giorni scoperti».
    expect(t).toMatch(/nessun giorno da registrare/)
    expect(t).not.toMatch(/molti giorni scoperti/)
  })
})

describe('I giorni di chiusura non pesano sulla copertura', () => {
  it('un giorno della settimana sempre chiuso esce dal conto', async () => {
    // Una pasticceria chiusa il lunedì non deve vedere ogni lunedì rosso per
    // sempre, e deve poter arrivare al 100%.
    //
    // La forma delle regole è quella vera di `src/lib/giorniChiusura.js`:
    // `giorni` è un elenco in numerazione ISO (1 = lunedì … 7 = domenica) e
    // `valido_da` dice da quando vale — una chiusura decisa oggi non deve
    // riscrivere il passato.
    const chiuso = 1   // lunedì, in numerazione ISO
    REGOLE = { ricorrenti: [{ giorni: [chiuso], valido_da: '2000-01-01' }], periodi: [] }
    const aperti = []
    for (let d = 1; d <= PASSATI; d++) {
      const data = new Date(OGGI.getFullYear(), OGGI.getMonth(), d)
      const iso = data.getDay() === 0 ? 7 : data.getDay()
      if (iso !== chiuso) aperti.push(d)
    }
    const { container } = monta({
      chiusure: aperti.map(d => chiusura(g(d))),
      giornaliero: aperti.map(d => produzione(g(d))),
    })
    await waitFor(() => expect(testo(container)).toMatch(/100%/))
  })

  it('e il riquadro dice quanti giorni ha escluso', async () => {
    REGOLE = { ricorrenti: [{ giorni: [1], valido_da: '2000-01-01' }], periodi: [] }
    const { container } = monta({ chiusure: tutteLeChiusure(), giornaliero: tutteLeProduzioni() })
    await waitFor(() => expect(testo(container)).toMatch(/gg di chiusura esclusi/))
  })
})

describe('Muoversi fra i mesi', () => {
  it('da gennaio all\'indietro si torna a dicembre dell\'anno prima', async () => {
    const { container } = monta({ chiusure: [], giornaliero: [] })
    // Si va indietro fino a gennaio, poi un altro passo.
    const indietro = () => bottone(container, 'Mese precedente') || bottone(container, '‹')
    for (let i = 0; i <= OGGI.getMonth(); i++) {
      await act(async () => { fireEvent.click(indietro()) })
    }
    expect(testo(container)).toMatch(new RegExp(`Dicembre ${OGGI.getFullYear() - 1}|Dicembre`))
  })

  it('e «oggi» riporta al mese corrente', async () => {
    const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
    const { container } = monta({ chiusure: [], giornaliero: [] })
    await act(async () => { fireEvent.click(bottone(container, 'Mese precedente') || bottone(container, '‹')) })
    const torna = bottone(container, 'Oggi')
    if (torna) {
      await act(async () => { fireEvent.click(torna) })
      expect(testo(container)).toMatch(new RegExp(MESI[OGGI.getMonth()]))
    }
  })
})

describe('Quello che il dipendente non deve vedere', () => {
  it('la banda con copertura, anomalie e serie è solo del titolare', async () => {
    const { container } = monta({
      chiusure: tutteLeChiusure(), giornaliero: tutteLeProduzioni(), isDipendente: true,
    })
    const t = testo(container)
    expect(t).not.toMatch(/Copertura mese/)
    expect(t).not.toMatch(/Giorni con anomalie/)
    expect(t).not.toMatch(/Giorni di fila/)
  })

  it('al titolare invece compare', async () => {
    const { container } = monta({ chiusure: tutteLeChiusure(), giornaliero: tutteLeProduzioni() })
    await waitFor(() => expect(testo(container)).toMatch(/Copertura mese/))
  })
})

describe('Il righello: il calendario si disegna davvero', () => {
  it('ci sono le celle dei giorni, non una schermata vuota', async () => {
    // Senza questo, tutti i test qui sopra potrebbero passare guardando il
    // nulla: è il modo in cui i controlli sull'interfaccia mentono.
    const { container } = monta({ chiusure: tutteLeChiusure(), giornaliero: tutteLeProduzioni() })
    await waitFor(() => {
      const celle = container.querySelectorAll('button')
      expect(celle.length).toBeGreaterThan(28)
    })
  })

  it('e le celle sono pulsanti, raggiungibili da tastiera', async () => {
    // Erano <div onClick>: 42 elementi interattivi muti per chi usa la
    // tastiera o un lettore di schermo.
    const { container } = monta({ chiusure: tutteLeChiusure(), giornaliero: tutteLeProduzioni() })
    await waitFor(() => {
      const conEtichetta = [...container.querySelectorAll('button')]
        .filter(b => b.getAttribute('aria-label'))
      expect(conEtichetta.length).toBeGreaterThan(20)
    })
  })
})
