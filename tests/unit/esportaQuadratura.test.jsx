// @vitest-environment happy-dom
//
// ── L'esportazione della Quadratura usciva vuota ──────────────────────────
//
// Trovato dall'audit della Quadratura del 03/10/2026. Il CSV e il PDF del
// «Dettaglio gusti» leggevano `r.gusto`, `prodottoG`, `finaleG`, `vendutoG`:
// campi che non esistono. Le righe erano quelle grezze del database
// (`gusto_nome`, `produzione_g`, `rimanenza_g`), quindi usciva una riga senza
// nome e piena di zeri per ognuna — 717 righe per la settimana 24-30/08 di
// tutte le sedi, compresi i sette giorni prima del lunedì. Gli importi erano
// numeri grezzi («12345,6789») e un valore mancante diventava «0»: la cassa
// non registrata arrivava al commercialista come incasso zero, e lo
// scostamento come «-15.273».
//
// Adesso: una riga per gusto (21 nella stessa settimana), con in vetrina
// all'inizio + prodotto − in vetrina alla fine = venduto (199,4 + 1.172,9 −
// 230,1 = 1.142,2 kg, uguale al totale della pagina), chili con un decimale,
// euro con due, e quello che non si sa vuoto o detto a parole.
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, waitFor, screen, fireEvent } from '@testing-library/react'

const giorno = (iso, n) => { const t = new Date(`${iso}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
const LUN = '2026-08-24'
// NOCCIOLA: la domenica prima restano 1 kg (e quel giorno se ne erano
// prodotti 9: NON vanno nel prodotto della settimana); lunedì 5 kg fatti e 2
// rimasti; martedì 0 fatti e 0,5 rimasti. Venduti 4 + 1,5 = 5,5 kg.
// PISTACCHIO: nessuna rimanenza di partenza nei sette giorni prima.
const RIGHE = {
  A: [
    { gusto_nome: 'NOCCIOLA', data: '2026-08-23', produzione_g: 9000, rimanenza_g: 1000, scarto_g: 0, spedito_g: 0 },
    { gusto_nome: 'NOCCIOLA', data: '2026-08-24', produzione_g: 5000, rimanenza_g: 2000, scarto_g: 0, spedito_g: 0 },
    { gusto_nome: 'NOCCIOLA', data: '2026-08-25', produzione_g: 0, rimanenza_g: 500, scarto_g: 0, spedito_g: 0 },
    { gusto_nome: 'PISTACCHIO', data: '2026-08-25', produzione_g: 2000, rimanenza_g: 800, scarto_g: 0, spedito_g: 0 },
  ],
  B: [
    { gusto_nome: 'NOCCIOLA', data: '2026-08-23', produzione_g: 0, rimanenza_g: 300, scarto_g: 0, spedito_g: 0 },
    { gusto_nome: 'NOCCIOLA', data: '2026-08-24', produzione_g: 1000, rimanenza_g: 300, scarto_g: 0, spedito_g: 0 },
  ],
}
vi.mock('../../src/lib/inventarioProduzione', async () => {
  const vero = await vi.importActual('../../src/lib/inventarioProduzione')
  return {
    ...vero,
    caricaSettimana: vi.fn(async (_org, sede, lun) =>
      (RIGHE[sede] || []).filter(r => r.data >= giorno(lun, -7) && r.data < giorno(lun, 7))),
  }
})
vi.mock('../../src/lib/supabase', () => {
  const q = new Proxy({}, { get(_t, p) {
    if (p === 'then') return (resolve) => resolve({ data: [], error: null })
    return () => q
  } })
  return { supabase: { from: () => q, rpc: () => Promise.resolve({ data: null, error: null }) } }
})
// 100 g a 3 € = 30 €/kg
vi.mock('../../src/lib/storage', () => ({
  sload: async () => [{ id: 'f1', nome: 'Coppetta', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3, componenti: [] }],
  ssave: async () => {}, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { dettaglioGustiSettimana, kpiQuadraturaSettimana, calcolaVendutoSettimana } = await import('../../src/lib/inventarioProduzione')
const vista = await import('../../src/views/QuadraturaInventarioView')
const { default: QuadraturaInventarioView, testoCsvSettimana, reportPdfSettimana } = vista

describe('Il dettaglio per gusto della settimana', () => {
  it('una riga per gusto, col prodotto dei soli giorni della settimana', () => {
    const d = dettaglioGustiSettimana({ A: RIGHE.A }, LUN)
    expect(d.map(r => r.gusto)).toEqual(['NOCCIOLA', 'PISTACCHIO'])
    const n = d[0]
    expect(n.prodottoG).toBe(5000)           // non 14.000: i 9 kg della domenica prima no
    expect(n.inizialeG).toBe(1000)
    expect(n.finaleG).toBe(500)
    expect(n.vendutoG).toBe(5500)
    // in vetrina all'inizio + prodotto − in vetrina alla fine = venduto
    expect(n.inizialeG + n.prodottoG - n.finaleG - n.scartoG).toBe(n.vendutoG)
  })
  it('quello che non si sa resta null, non zero', () => {
    const p = dettaglioGustiSettimana({ A: RIGHE.A }, LUN).find(r => r.gusto === 'PISTACCHIO')
    expect(p.inizialeG).toBeNull()
    expect(p.vendutoG).toBeNull()
    expect(p.celleNonCalcolabili).toBe(1)
  })
  it('con due sedi si sommano, e il venduto si calcola sede per sede', () => {
    const n = dettaglioGustiSettimana(RIGHE, LUN).find(r => r.gusto === 'NOCCIOLA')
    expect(n.prodottoG).toBe(6000)
    expect(n.inizialeG).toBe(1300)
    expect(n.finaleG).toBe(800)
    expect(n.vendutoG).toBe(5500 + 1000)
  })
})

describe('Il CSV', () => {
  const kpiDi = (chiusure) => kpiQuadraturaSettimana(calcolaVendutoSettimana(RIGHE.A, LUN), chiusure, 30, [])
  const csv = (extra = {}) => testoCsvSettimana({
    lunediIso: LUN, kpi: kpiDi([]), dettaglio: dettaglioGustiSettimana({ A: RIGHE.A }, LUN),
    sedeAttiva: { nome: 'Carlina' }, isAllSedi: false, perSede: [], ...extra,
  })

  it('il dettaglio ha i nomi dei gusti e i chili con la virgola', () => {
    const t = csv()
    expect(t.charCodeAt(0)).toBe(0xFEFF)   // il BOM, perché Excel legga gli accenti
    expect(t).toMatch(/\nNOCCIOLA;1,0;5,0;0,0;0,5;5,5\n/)
    // un valore che non si sa resta vuoto
    expect(t).toMatch(/\nPISTACCHIO;;2,0;0,0;0,8;\n/)
    // nessuna riga senza nome
    expect(t).not.toMatch(/\n;/)
  })

  it('senza cassa scrive «non registrata», non 0, e non inventa uno scostamento', () => {
    const t = csv()
    expect(t).toMatch(/Cassa \(€\);non registrata/)
    expect(t).toMatch(/Differenza con la cassa \(€\);non calcolabile: nessuna chiusura/)
    expect(t).not.toMatch(/Drift/)
  })

  it('gli euro hanno due decimali con la virgola', () => {
    const t = csv({ kpi: kpiDi([{ data: '2026-08-24', totale: 123.456 }, { data: '2026-08-25', totale: 50 }]) })
    expect(t).toMatch(/Cassa \(€\);173,46/)
    expect(t).toMatch(/Incasso stimato dall'inventario \(€\);165,00/)
  })

  it('in «Tutte le sedi» la cassa per sede non si inventa', () => {
    const t = csv({ isAllSedi: true, perSede: [{ sede: { nome: 'Carlina' }, kpi: kpiDi([]) }] })
    expect(t).toMatch(/Carlina;5,5;0,0;165,00;non separabile per sede/)
  })

  it('il PDF ha le stesse righe, e la cassa che manca la dice', () => {
    const r = reportPdfSettimana({
      lunediIso: LUN, kpi: kpiDi([]), dettaglio: dettaglioGustiSettimana({ A: RIGHE.A }, LUN),
      sedeAttiva: { nome: 'Carlina' }, isAllSedi: false, perSede: [], euroKg: 30,
    })
    expect(r.sections[0].table.rows.map(x => x[0])).toEqual(['NOCCIOLA', 'PISTACCHIO'])
    expect(r.sections[0].table.rows[1][1]).toBe('-')
    expect(r.kpi.find(k => k.label === 'Cassa').value).toBe('non registrata')
  })
})

describe('Il pulsante CSV della pagina', () => {
  let blobs = []
  beforeEach(() => {
    blobs = []
    globalThis.URL.createObjectURL = vi.fn((b) => { blobs.push(b); return 'blob:prova' })
    globalThis.URL.revokeObjectURL = vi.fn()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-26T10:00:00'))
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('scarica una riga per gusto, non le righe grezze del database', async () => {
    render(<QuadraturaInventarioView orgId="org-1" sedeId="A" sedi={[{ id: 'A', nome: 'Carlina', attiva: true, is_sede_produzione: true }]}
      sedeAttiva={{ id: 'A', nome: 'Carlina' }} chiusure={[]} metodoProduzione="inventario" onNavigate={() => {}} />)
    await waitFor(() => expect(document.body.textContent).toMatch(/Incasso stimato/), { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: 'Esporta settimana in CSV' }))
    expect(blobs).toHaveLength(1)
    const t = await blobs[0].text()
    expect(t).toMatch(/\nNOCCIOLA;1,0;5,0;0,0;0,5;5,5\n/)
    expect(t.split('\n').filter(l => l.startsWith(';')).length).toBe(0)
  })
})
