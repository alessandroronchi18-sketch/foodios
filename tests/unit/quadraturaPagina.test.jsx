// @vitest-environment happy-dom
//
// ── «Torna il conto?»: la Quadratura rifatta, il contratto ───────────────
//
// 04/10/2026, fase 2 della Produzione. L'audit del 03/10 aveva dato 12/100
// alla Quadratura. Dopo le correzioni della fase 1 (niente −100% e furti
// senza cassa, confronto solo sui giorni con la cassa, caselle col giorno
// giusto, «Tutte le sedi») i numeri erano giusti, ma la pagina restava
// difficile da leggere: in cima una barra di cinque comandi (Prec. · Oggi ·
// Succ. · CSV · PDF), poi quattro tessere senza giudizio, poi CINQUE
// riquadri colorati (grigio, blu, ambra, ambra, rosso) con le cose che la
// pagina sapeva e non sapeva, una sparkline a due assi e la classifica dei
// gusti, che è la domanda di un'altra pagina.
//
// La pagina nuova segue ANALISI_DESIGN.md: la domanda come titolo, la
// settimana in una riga (‹ settimana ›), da dove vengono i numeri in una
// riga sola (`CoperturaDati`), poi la risposta. Questo file prova il
// contratto pezzo per pezzo; le prove dei numeri restano nei file della fase
// 1 (quadraturaSenzaCassa, quadraturaNumeriEGiorni, …).
//
// 04/10/2026, dopo i pezzi comuni nuovi (copertura chiusa in una riga,
// tessere con la riga del confronto sempre presente, NumeroPrincipale): la
// risposta è il NumeroPrincipale; senza la cassa dice «Non si può dire: …»
// e sotto «Registra la cassa», perché l'azione che cambia come si legge il
// numero sta accanto al numero (ANALISI_DESIGN.md §6) e non solo dentro la
// riga chiusa. La riga del confronto delle tessere dice perché non si
// confronta, invece di restare vuota. Le prove qui sotto sono aggiornate a
// questo; la regola che proteggono è la stessa.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react'

const LUN = '2026-09-07'
// Domenica restano 400 g; lunedì si fanno 1.000 g e ne restano 600 (venduti
// 800); martedì 300 g e ne restano 200 (venduti 700). Settimana: 1,5 kg.
let RIGHE = []
const BASE = [
  { gusto_nome: 'NOCCIOLA', data: '2026-09-06', produzione_g: 1000, rimanenza_g: 400, scarto_g: 0, spedito_g: 0 },
  { gusto_nome: 'NOCCIOLA', data: '2026-09-07', produzione_g: 1000, rimanenza_g: 600, scarto_g: 0, spedito_g: 0 },
  { gusto_nome: 'NOCCIOLA', data: '2026-09-08', produzione_g: 300, rimanenza_g: 200, scarto_g: 0, spedito_g: 0 },
]
const piu = (iso, n) => { const t = new Date(`${iso}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
// Come quella vera: la settimana e i sette giorni prima (la vetrina di partenza).
// L'ultimo giorno registrato, rispettando `finoA` (come il vero). Spento di
// base: le prove della testata guardano la settimana di oggi.
let APERTURA = false
vi.mock('../../src/lib/inventarioProduzione', async () => {
  const vero = await vi.importActual('../../src/lib/inventarioProduzione')
  const { rigaHaDati } = await vi.importActual('../../src/lib/produzioneAnalisi')
  return {
    ...vero,
    caricaSettimana: vi.fn(async (_o, _s, lun) => RIGHE.filter(r => r.data >= piu(lun, -7) && r.data < piu(lun, 7))),
    ultimoGiornoRegistrato: vi.fn(async (_o, _ids, { finoA } = {}) => (APERTURA
      ? RIGHE.filter(r => rigaHaDati(r) && (!finoA || r.data <= finoA)).map(r => r.data).sort().pop() || null
      : null)),
  }
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
  return { supabase: { from: () => new Proxy({}, handler), rpc: () => Promise.resolve({ data: null, error: null }) } }
})
// 120 g a 4 € = 33,33 €/kg. La settimana vale 50 € stimati.
vi.mock('../../src/lib/storage', () => ({
  ssave: () => Promise.resolve(),
  sload: () => Promise.resolve([
    { id: 'f1', nome: 'Coppetta media', categoria: 'Gelato', baseQtaG: 120, prezzoDefault: 4, componenti: [] },
  ]),
}))

const { vociCoperturaQuadratura } = await import('../../src/views/quadratura/copertura.js')
const { default: QuadraturaInventarioView } = await import('../../src/views/QuadraturaInventarioView.jsx')

const testo = () => document.body.textContent || ''
const pronta = () => waitFor(() => expect(testo()).toMatch(/€\/kg medio/), { timeout: 5000 })
const props = (extra = {}) => ({
  orgId: 'org-1', sedeId: 'sede-1',
  sedi: [{ id: 'sede-1', nome: 'Centro', attiva: true, is_sede_produzione: true }],
  sedeAttiva: { id: 'sede-1', nome: 'Centro' },
  chiusure: [], metodoProduzione: 'inventario', onNavigate: () => {},
  ...extra,
})

// ── 1. La riga «da dove vengono i numeri» ──────────────────────────────────
const kpiSenzaCassa = { cassaRegistrata: false, giorniInventario: 2, giorniCassa: 0, giorniConfrontati: 0, b2bKg: 0, celleNonQuadrate: 0, celleNonCalcolabili: 0 }
const voce = (voci, id) => voci.find(v => v.id === id)

describe('La copertura della Quadratura: una frase per fonte', () => {
  it('senza giorni registrati non dice niente (lo dice la settimana vuota)', () => {
    expect(vociCoperturaQuadratura({ giorni: { n: 0 }, kpi: kpiSenzaCassa })).toEqual([])
  })
  it('l\'inventario: quanti giorni su 7', () => {
    expect(voce(vociCoperturaQuadratura({ giorni: { n: 7 }, kpi: kpiSenzaCassa }), 'inventario')).toEqual({ id: 'inventario', stato: 'ok', testo: '7 giorni su 7 con l\'inventario' })
    expect(voce(vociCoperturaQuadratura({ giorni: { n: 1 }, kpi: kpiSenzaCassa }), 'inventario').testo).toBe('1 giorno su 7 con l\'inventario')
    expect(voce(vociCoperturaQuadratura({ giorni: { n: 5 }, kpi: kpiSenzaCassa }), 'inventario').stato).toBe('parziale')
  })
  it('se la pagina si è spostata sull\'ultima settimana con i dati, lo dice qui', () => {
    const v = voce(vociCoperturaQuadratura({ giorni: { n: 2 }, kpi: kpiSenzaCassa, apertura: { ultimo: '2026-08-25', spostata: true } }), 'inventario')
    expect(v.testo).toBe('Dopo il 25/08/2026 non c\'è niente di registrato: ti mostro l\'ultima settimana con i dati (2 giorni su 7 con l\'inventario)')
  })
  it('la cassa che manca: «manca», e il pulsante per registrarla', () => {
    const vai = () => {}
    const v = voce(vociCoperturaQuadratura({ giorni: { n: 2 }, kpi: kpiSenzaCassa, azioni: { cassa: vai } }), 'cassa')
    expect(v.stato).toBe('manca')
    expect(v.testo).toBe('la cassa: nessuna chiusura in questa settimana, quindi la differenza non si calcola')
    expect(v.azione).toEqual({ etichetta: 'Registra la cassa', onClick: vai })
  })
  it('la cassa in parte: su quanti giorni si confronta', () => {
    const v = voce(vociCoperturaQuadratura({ giorni: { n: 2 }, kpi: { ...kpiSenzaCassa, cassaRegistrata: true, giorniCassa: 1, giorniConfrontati: 1 } }), 'cassa')
    expect(v.stato).toBe('parziale')
    expect(v.testo).toBe('cassa in 1 giorno su 2 con l\'inventario: il confronto è fatto solo su quelli')
  })
  it('la cassa in tutti i giorni', () => {
    const v = voce(vociCoperturaQuadratura({ giorni: { n: 2 }, kpi: { ...kpiSenzaCassa, cassaRegistrata: true, giorniCassa: 2, giorniConfrontati: 2 } }), 'cassa')
    expect(v).toEqual({ id: 'cassa', stato: 'ok', testo: 'Cassa registrata in tutti i giorni con l\'inventario (2)' })
  })
  it('l\'incasso dall\'inventario è una stima, col prezzo al chilo', () => {
    expect(voce(vociCoperturaQuadratura({ giorni: { n: 2 }, kpi: kpiSenzaCassa, euroKg: 29.4882 }), 'stima').testo)
      .toBe('incasso dall\'inventario: chili venduti al banco per 29,49 €/kg, il prezzo medio dei formati; a schermo senza IVA, come la cassa e il Mese')
    expect(voce(vociCoperturaQuadratura({ giorni: { n: 2 }, kpi: kpiSenzaCassa, euroKg: null }), 'stima')).toBeUndefined()
  })
  it('l\'ingrosso tolto dal banco, le caselle, lo scarto', () => {
    const voci = vociCoperturaQuadratura({
      giorni: { n: 2 }, euroKg: 30, scartoRegistrato: false, azioni: { caselle: () => {} },
      kpi: { ...kpiSenzaCassa, b2bKg: 3.5, ricaviB2b: 70, celleNonQuadrate: 3, celleNonCalcolabili: 1 },
    })
    expect(voce(voci, 'ingrosso').testo).toBe('3,5 kg venduti all\'ingrosso tolti dal banco (70 € fatturati)')
    expect(voce(voci, 'caselle').testo).toBe('4 caselle da sistemare nell\'inventario')
    expect(voce(voci, 'caselle').azione.etichetta).toBe('Vedi')
    expect(voce(voci, 'scarto')).toEqual({ id: 'scarto', stato: 'manca', breve: 'scarto mai scritto', testo: 'lo scarto, quindi quello che si butta è contato come venduto' })
    // Nella riga chiusa: «da sistemare» solo di quello che si sistema.
    expect(voce(voci, 'caselle').sistemabile).toBe(true)
    expect(voce(voci, 'scarto').sistemabile).toBeUndefined()
  })
})

// ── 2. La testata della pagina ─────────────────────────────────────────────
describe('La pagina si apre con la domanda, la settimana in una riga e la copertura', () => {
  beforeEach(() => { RIGHE = BASE; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(`${LUN}T10:00:00`)) })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('la domanda è il titolo, e la settimana sta fra due frecce', async () => {
    render(<QuadraturaInventarioView {...props()} />)
    await pronta()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Torna il conto?')
    expect(screen.getByRole('button', { name: 'Settimana precedente' }).style.minHeight || screen.getByRole('button', { name: 'Settimana precedente' }).style.height).toBe('44px')
    expect(screen.getByRole('button', { name: 'Settimana successiva' })).toBeTruthy()
    expect(testo()).toMatch(/07 set - 13 set 2026/)
    // È la settimana di oggi: «Questa settimana» non serve.
    expect(screen.queryByRole('button', { name: 'Settimana corrente' })).toBeNull()
  })

  it('in un\'altra settimana compare «Questa settimana», e ci riporta', async () => {
    render(<QuadraturaInventarioView {...props()} />)
    await pronta()
    fireEvent.click(screen.getByRole('button', { name: 'Settimana precedente' }))
    await waitFor(() => expect(testo()).toMatch(/31 ago - 06 set 2026/), { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: 'Settimana corrente' }))
    await waitFor(() => expect(testo()).toMatch(/07 set - 13 set 2026/), { timeout: 5000 })
  })

  it('la copertura dice che manca la cassa e porta a registrarla', async () => {
    const onNavigate = vi.fn()
    render(<QuadraturaInventarioView {...props({ onNavigate })} />)
    await pronta()
    const riga = screen.getByRole('region', { name: 'Da dove vengono i numeri' })
    expect(riga.textContent).toMatch(/2 giorni su 7 con l'inventario/)
    expect(riga.textContent).toMatch(/Manca: la cassa: nessuna chiusura in questa settimana/)
    // La copertura all'apertura è chiusa (04/10, C1): si apre, poi «Registra la cassa».
    // (Lo stesso pulsante sta anche sotto la risposta: qui si prende quello della riga.)
    fireEvent.click(within(riga).getAllByRole('button')[0])
    fireEvent.click(within(riga).getByRole('button', { name: 'Registra la cassa' }))
    expect(onNavigate).toHaveBeenCalledWith('chiusura')
  })

  it('senza la cassa dice da dove viene il venduto, con la vetrina della settimana', async () => {
    render(<QuadraturaInventarioView {...props()} />)
    await pronta()
    // Domenica 400 g in vetrina; fatti 1.000 + 300 g; martedì sera 200 g.
    expect(testo()).toMatch(/Viene dalla vetrina: c'erano 0,4 kg, ne hai fatti 1,3 kg, ne restano 0,2 kg\./)
    expect(screen.getByRole('button', { name: 'Vai alla Cassa' })).toBeTruthy()
  })

  it('la riga chiusa dice le cose per nome, e «da sistemare» solo di quello che si sistema', async () => {
    render(<QuadraturaInventarioView {...props()} />)
    await pronta()
    // Il pulsante della riga chiusa è il primo dentro la regione (il suo nome è il riassunto).
    expect(within(screen.getByRole('region', { name: 'Da dove vengono i numeri' })).getAllByRole('button')[0].textContent)
      .toMatch(/Incasso stimato · cassa non registrata · 2 giorni su 7 · scarto mai scritto/)
  })

  it('CSV e PDF stanno in fondo, per il commercialista', async () => {
    render(<QuadraturaInventarioView {...props()} />)
    await pronta()
    expect(testo()).toMatch(/Per il commercialista:/)
    expect(screen.getByRole('button', { name: 'Esporta settimana in CSV' })).toBeTruthy()
  })
})

// ── 3. La risposta ─────────────────────────────────────────────────────────
const { giudizio, frasiSenzaCassa } = await import('../../src/views/quadratura/Risposta.jsx')
const { default: Risposta } = await import('../../src/views/quadratura/Risposta.jsx')

describe('Il giudizio si scrive a parole', () => {
  it('sotto il 5% torna, fino al 15% da guardare, oltre non torna, nei due versi', () => {
    expect(giudizio(-4.9)).toBe('il conto torna')
    expect(giudizio(4.9)).toBe('il conto torna')
    expect(giudizio(-5)).toBe('da guardare')
    expect(giudizio(14.9)).toBe('da guardare')
    expect(giudizio(-15)).toBe('il conto non torna')
    expect(giudizio(null)).toBeNull()
  })
})

describe('Senza la cassa, cosa si può dire', () => {
  const kpi = { totVendutoG: 1500, ricavoAtteso: 50, giorniInventario: 2 }
  it('quanto è uscito e quanto vale', () => {
    // La pagina le passa i conti già senza IVA (kpiSenzaIva): la frase lo dice.
    expect(frasiSenzaCassa({ kpi })[0].testo).toBe('L\'inventario dice che sono usciti 1,5 kg di gelato, circa 50 € senza IVA ai prezzi dei formati.')
  })
  it('da dove viene il venduto: la vetrina, detto senza fingere un controllo', () => {
    // Il venduto si calcola da c'era + fatto − resta: quel conto «torna»
    // per costruzione. Non si scrive «torna» in verde (difetto del 04/10,
    // trovato sui dati veri prima di pubblicare).
    const ok = { inizioG: 400, prodottoG: 1300, ricevutoG: 0, speditoG: 0, scartoG: 0, vendutoG: 1500, fineG: 200, differenzaG: 0, torna: true, celleNonCalcolabili: 0 }
    expect(frasiSenzaCassa({ kpi, vetrina: ok })[1]).toEqual({ id: 'vetrina', verso: 'info', testo: 'Viene dalla vetrina: c\'erano 0,4 kg, ne hai fatti 1,3 kg, ne restano 0,2 kg.' })
    expect(frasiSenzaCassa({ kpi, vetrina: ok }).map(f => f.testo).join(' ')).not.toMatch(/torna/)
    const no = { ...ok, fineG: 1200, differenzaG: -1000, torna: false, celleNonCalcolabili: 1 }
    expect(frasiSenzaCassa({ kpi, vetrina: no })[1]).toEqual({ id: 'vetrina', verso: 'peggio', testo: 'Viene dalla vetrina: c\'erano 0,4 kg, ne hai fatti 1,3 kg, ne restano 1,2 kg. In 1 casella manca la rimanenza: il venduto di quei giorni non si sa, con una differenza di 1 kg.' })
  })
  it('la settimana prima solo con gli stessi giorni registrati', () => {
    expect(frasiSenzaCassa({ kpi, kpiPrev: { totVendutoG: 1000, giorniInventario: 2 } })[1].testo).toBe('Rispetto alla settimana prima: +50% di gelato uscito (1 kg allora).')
    expect(frasiSenzaCassa({ kpi, kpiPrev: { totVendutoG: 1000, giorniInventario: 7 } })[1].testo).toBe('Con la settimana prima non si confronta: ha 7 giorni registrati, questa 2.')
    expect(frasiSenzaCassa({ kpi, kpiPrev: { totVendutoG: 0, giorniInventario: 0 } }).length).toBe(1)
  })
})

describe('La tessera grande', () => {
  afterEach(() => cleanup())
  const base = { totVendutoG: 1500, totVendutoKg: 1.5, retailKg: 1.5, b2bKg: 0, ricavoAtteso: 50, cassaRegistrata: true, cassaEffettiva: 47, giorniCassa: 2, giorniInventario: 2, giorniConfrontati: 2, cassaConfrontata: 47, attesoConfrontato: 50 }
  it('con la cassa: la differenza col segno vero e il giudizio', () => {
    render(<Risposta kpi={{ ...base, driftEur: -3, driftPct: -6 }} kpiPrev={null} euroKg={33.33} />)
    expect(testo()).toMatch(/Differenza con la cassa−3 €Da guardare: −6% dell'incasso stimato\./)
  })
  it('senza la cassa «Registra la cassa» sta sotto la risposta, non solo nella riga chiusa', () => {
    const vai = vi.fn()
    render(<Risposta kpi={{ ...base, cassaRegistrata: false, driftEur: null, driftPct: null, motivoConfronto: 'nessuna chiusura di cassa registrata in questa settimana' }} kpiPrev={null} euroKg={33.33} onCassa={vai} />)
    const risposta = screen.getByRole('region', { name: 'Differenza con la cassa' })
    fireEvent.click(within(risposta).getByRole('button', { name: 'Registra la cassa' }))
    expect(vai).toHaveBeenCalled()
  })
  it('se l\'inventario non fa aspettare niente in quei giorni, niente percentuale e niente crash', () => {
    // Trovato scrivendo questa pagina (04/10/2026): driftPct nullo con la
    // differenza presente faceva cadere tutta la Quadratura.
    render(<Risposta kpi={{ ...base, cassaConfrontata: 500, attesoConfrontato: 0, driftEur: 500, driftPct: null }} kpiPrev={null} euroKg={33.33} />)
    expect(testo()).toMatch(/\+500 €500 € incassati contro 0 € stimati: la percentuale non si calcola\./)
  })
  it('il venduto si confronta con la settimana prima solo se ha gli stessi giorni registrati', () => {
    const k = { ...base, driftEur: -3, driftPct: -6 }
    render(<Risposta kpi={k} kpiPrev={{ ...base, retailKg: 1, giorniInventario: 2 }} euroKg={33.33} />)
    // «meglio» è la parola per chi legge con lo schermo vocale.
    expect(testo()).toMatch(/Venduto1,5 kg\+50%sulla settimana prima\(1,0 kg\)meglio/)
    cleanup()
    render(<Risposta kpi={k} kpiPrev={{ ...base, retailKg: 1, giorniInventario: 7 }} euroKg={33.33} />)
    // Niente variazione: la riga del confronto dice perché.
    expect(testo()).toMatch(/Venduto1,5 kgnessun confronto: la settimana prima ha 7 giorni registrati, questa 2dall'inventario/)
  })
  it('e la cassa solo se ha gli stessi giorni con la cassa', () => {
    const k = { ...base, driftEur: -3, driftPct: -6 }
    render(<Risposta kpi={k} kpiPrev={{ ...base, cassaEffettiva: 94, giorniCassa: 2 }} euroKg={33.33} />)
    expect(testo()).toMatch(/Cassa47 €−50%sulla settimana prima/)
    cleanup()
    render(<Risposta kpi={k} kpiPrev={{ ...base, cassaEffettiva: 94, giorniCassa: 7 }} euroKg={33.33} />)
    expect(testo()).toMatch(/Cassa47 €nessun confronto: la settimana prima ha la cassa in 7 giorni, questa in 2senza IVA · incassato in 2 giorni/)
  })

  it('senza la cassa: «non si può dire», col motivo', () => {
    render(<Risposta kpi={{ ...base, cassaRegistrata: false, driftEur: null, driftPct: null, motivoConfronto: 'nessuna chiusura di cassa registrata in questa settimana' }} kpiPrev={null} euroKg={33.33} />)
    expect(testo()).toMatch(/Differenza con la cassaNon si può dire: manca la cassa/)
    expect(testo()).toMatch(/Cassanon registrata/)
  })
})

// ── 4. Le ultime quattro settimane, su un asse solo ────────────────────────
const { titoloSettimane, default: UltimeSettimane } = await import('../../src/views/quadratura/UltimeSettimane.jsx')

describe('Le ultime quattro settimane', () => {
  afterEach(() => cleanup())
  const s = (lunIso, kg, cassa = null, driftEur = null, driftPct = null) => ({ lunIso, kg, cassa, driftEur, driftPct })
  it('senza cassa il titolo dice che non c\'è niente da confrontare', () => {
    expect(titoloSettimane([s('2026-08-10', 900), s('2026-08-17', 909), s('2026-08-24', 1142), s('2026-08-31', 173)]))
      .toBe('In 4 settimane nessuna cassa da confrontare')
  })
  it('con la cassa: in quante settimane il conto torna', () => {
    expect(titoloSettimane([s('2026-08-10', 900, 100, -2, -2), s('2026-08-17', 909, 100, -20, -20), s('2026-08-24', 1142)]))
      .toBe('Il conto torna in 1 settimana su 2')
  })
  it('una riga per settimana: le date, i chili, la cassa o «non registrata», la differenza a parole', () => {
    render(<UltimeSettimane lunediGuardato="2026-08-17" settimane={[s('2026-08-10', 900, 27000, -2000, -6.9), s('2026-08-17', 909.3)]} />)
    const righe = screen.getAllByRole('listitem').map(li => li.textContent)
    expect(righe[0]).toBe('10/08–16/08900,0 kgcassa 27.000 €−2.000 € · da guardare (−6,9%)')
    expect(righe[1]).toBe('17/08–23/08909,3 kgcassa non registrata')
  })
})

// ── 5. Dalle foto del 04/10 ────────────────────────────────────────────────
const { titoloSediSettimana, default: SediSettimana } = await import('../../src/views/quadratura/SediSettimana.jsx')

describe('Dalle foto coi dati veri', () => {
  afterEach(() => cleanup())
  it('senza cassa in nessuna settimana lo si dice una volta, non quattro', () => {
    const s = (lunIso, kg) => ({ lunIso, kg, cassa: null, driftEur: null, driftPct: null })
    render(<UltimeSettimane lunediGuardato="2026-08-24" settimane={[s('2026-08-17', 909.3), s('2026-08-24', 1142.2)]} />)
    expect(testo()).not.toMatch(/cassa non registrata/)
    expect(testo()).toMatch(/La cassa non è registrata in nessuna\./)
  })
  const sede = (id, nome, kg, atteso, b2bKg = 0) => ({ sede: { id, nome }, kpi: { retailKg: kg, totVendutoKg: kg + b2bKg, ricavoAtteso: atteso, b2bKg, ricaviB2b: b2bKg * 20 } })
  it('le sedi: chi pesa di più nel titolo, una riga per sede, l\'ingrosso solo se c\'è', () => {
    const tre = [sede('b', 'Berthollet', 297, 8758), sede('c', 'Carlina', 517.9, 15273), sede('d', 'De Gasperi', 327.3, 9650)]
    expect(titoloSediSettimana(tre)).toBe('Carlina: il 45,3% del gelato uscito')
    render(<SediSettimana perSede={tre} />)
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'Carlina517,9 kg15.273 €', 'De Gasperi327,3 kg9.650 €', 'Berthollet297,0 kg8.758 €',
    ])
    expect(testo()).toMatch(/Dettaglio per sede/)
    expect(testo()).not.toMatch(/ingrosso/)
    cleanup()
    render(<SediSettimana perSede={[sede('c', 'Carlina', 500, 15000, 3.5), sede('d', 'De Gasperi', 300, 9000)]} />)
    expect(testo()).toMatch(/all'ingrosso 3,5 kg, 70 € fatturati/)
  })
  it('il prezzo al chilo dell\'incasso stimato coi centesimi', () => {
    render(<Risposta kpi={{ totVendutoG: 1000, totVendutoKg: 1, retailKg: 1, b2bKg: 0, ricavoAtteso: 29.49, cassaRegistrata: false, giorniInventario: 1, driftEur: null, driftPct: null }} kpiPrev={null} euroKg={29.4882} />)
    expect(testo()).toMatch(/kg × 29,49 €\/kg medio dei formati/)
  })
})

// ── 6. Si apre sull'ultima settimana intera (decisione del titolare, 04/10) ─
// Sui dati di Mara l'ultimo giorno è lunedì 31/08: la pagina apriva la
// settimana 31/08-06/09 con un giorno solo (173 kg). Adesso si apre sulla
// settimana intera prima (24-30/08), lo dice sotto la domanda e porta,
// con un tocco, alla settimana dell'ultimo giorno.
describe('La settimana di apertura', () => {
  const giorniDal = (da, a) => { const out = []; for (let d = da; d <= a; d = piu(d, 1)) out.push({ gusto_nome: 'NOCCIOLA', data: d, produzione_g: 1000, rimanenza_g: 500, scarto_g: 0, spedito_g: 0 }); return out }
  beforeEach(() => { APERTURA = true; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-03T10:00:00')) })
  afterEach(() => { cleanup(); vi.useRealTimers(); APERTURA = false; RIGHE = BASE })

  it('l\'ultimo giorno è un lunedì: si apre sulla settimana intera prima, e lo dice', async () => {
    RIGHE = giorniDal('2026-08-16', '2026-08-31')
    render(<QuadraturaInventarioView {...props()} />)
    await waitFor(() => expect(testo()).toMatch(/24 ago - 30 ago 2026/), { timeout: 5000 })
    await pronta()
    expect(screen.getByRole('status').textContent).toMatch(/L'ultimo giorno registrato è il 31\/08: ti mostro l'ultima settimana intera\./)
    expect(testo()).toMatch(/ti mostro l'ultima settimana intera \(7 giorni su 7 con l'inventario\)/)
    fireEvent.click(screen.getByRole('button', { name: 'Vai alla settimana del 31/08' }))
    await waitFor(() => expect(testo()).toMatch(/31 ago - 06 set 2026/), { timeout: 5000 })
  })

  it('l\'ultimo giorno è una domenica: quella settimana è già intera', async () => {
    RIGHE = giorniDal('2026-08-16', '2026-08-30')
    render(<QuadraturaInventarioView {...props()} />)
    await waitFor(() => expect(testo()).toMatch(/24 ago - 30 ago 2026/), { timeout: 5000 })
    await pronta()
    expect(screen.queryByRole('status')).toBeNull()
    expect(testo()).toMatch(/Dopo il 30\/08\/2026 non c'è niente di registrato/)
  })

  it('se la settimana intera prima non ha niente, resta sulla settimana dell\'ultimo giorno', async () => {
    RIGHE = giorniDal('2026-08-31', '2026-09-01')
    render(<QuadraturaInventarioView {...props()} />)
    await waitFor(() => expect(testo()).toMatch(/31 ago - 06 set 2026/), { timeout: 5000 })
    await pronta()
    expect(screen.queryByRole('status')).toBeNull()
    expect(testo()).toMatch(/Dopo l'01\/09\/2026 non c'è niente di registrato/)
  })
})
