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
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'

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
vi.mock('../../src/lib/inventarioProduzione', async () => {
  const vero = await vi.importActual('../../src/lib/inventarioProduzione')
  return { ...vero, caricaSettimana: vi.fn(async (_o, _s, lun) => RIGHE.filter(r => r.data >= piu(lun, -7) && r.data < piu(lun, 7))) }
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
      .toBe('incasso dall\'inventario: chili venduti al banco per 29,49 €/kg, il prezzo medio dei formati')
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
    expect(voce(voci, 'scarto')).toEqual({ id: 'scarto', stato: 'manca', testo: 'lo scarto, quindi quello che si butta è contato come venduto' })
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
    fireEvent.click(screen.getByRole('button', { name: 'Registra la cassa' }))
    expect(onNavigate).toHaveBeenCalledWith('chiusura')
  })

  it('CSV e PDF stanno in fondo, per il commercialista', async () => {
    render(<QuadraturaInventarioView {...props()} />)
    await pronta()
    expect(testo()).toMatch(/Per il commercialista:/)
    expect(screen.getByRole('button', { name: 'Esporta settimana in CSV' })).toBeTruthy()
  })
})
