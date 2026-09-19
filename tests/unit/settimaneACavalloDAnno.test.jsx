// @vitest-environment happy-dom
//
// ── Le settimane a cavallo d'anno, provate sul grafico vero ───────────────
//
// Due difetti veri, 19/09/2026, in `src/views/AnalisiInventarioSection.jsx`
// (il grafico dell'inventario raggruppato per settimana).
//
// 1. La chiave della colonna era `${d.getFullYear()}-W${n}`: l'anno del
//    GIORNO invece dell'anno ISO della settimana. Il 1° e il 2 gennaio 2027
//    cadono nella settimana 53 del 2026 e uscivano come «2027-W00», una
//    settimana che non esiste; la settimana dal 28/12 al 3/01 si spezzava in
//    TRE colonne del grafico invece di una.
// 2. `Math.round((d - week1Mon) / 86400000)` sottraeva due istanti (uno a
//    mezzogiorno, uno a mezzanotte): da novembre a marzo il conto veniva 6,5
//    giorni e si arrotondava a 7, quindi OGNI DOMENICA finiva nella settimana
//    dopo. Con l'ora legale no — il difetto compariva e spariva due volte
//    l'anno.
//
// PERCHÉ QUESTO FILE ESISTE (19/09/2026, audit della suite): la prima
// versione di questo test rifaceva la formula DENTRO il file di prova e
// controllava quella. Messo a girare sul sorgente col difetto, 11 test su 13
// passavano lo stesso: provavano la copia, non il prodotto. Qui il conto lo
// fa il componente, e le colonne si leggono da quello che il grafico riceve.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// Recharts non disegna niente senza larghezza: al posto del grafico mettiamo
// una targa che espone le colonne ricevute. È l'unico aggancio stabile —
// `data` è l'ingresso del grafico, non una stringa di stile.
vi.mock('recharts', () => {
  const nulla = () => null
  return {
    ResponsiveContainer: ({ children }) => React.createElement('div', null, children),
    BarChart: ({ data }) => React.createElement('div', { 'data-testid': 'colonne-grafico' }, JSON.stringify(data)),
    LineChart: ({ data }) => React.createElement('div', { 'data-testid': 'colonne-linea' }, JSON.stringify(data)),
    Bar: nulla, Line: nulla, XAxis: nulla, YAxis: nulla,
    CartesianGrid: nulla, Tooltip: nulla, Legend: nulla,
  }
})
vi.mock('../../src/lib/storage', () => ({ ssave: async () => {}, sload: async () => null }))
vi.mock('../../src/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) },
}))

const { default: AnalisiInventarioSection } = await import('../../src/views/AnalisiInventarioSection.jsx')

const riga = (data, prod = 1000) => ({
  gusto_nome: 'NOCCIOLA', data, produzione_g: prod,
  rimanenza_g: 0, scarto_g: 0, spedito_g: 0,
})

/** Renderizza, passa alla vista settimanale e restituisce le colonne del grafico. */
async function colonneSettimanali(giorni, { dateFrom, dateTo }) {
  const v = render(
    <AnalisiInventarioSection
      rows={giorni.map(g => riga(g))}
      rowsPrev={[]}
      dateFrom={dateFrom} dateTo={dateTo}
      confronto="nessuno"
      ricettario={{ ricette: {}, ingredienti_costi: {} }}
      orgId={null} sedeId={null} sedi={[]}
      onBack={() => {}}
    />,
  )
  await waitFor(() => expect(v.container.querySelector('[data-testid="colonne-grafico"]')).toBeTruthy())
  const bottone = [...v.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'settimana')
  expect(bottone, 'il selettore «settimana» del grafico non si trova più: aggiorna il test').toBeTruthy()
  fireEvent.click(bottone)
  const targa = v.container.querySelector('[data-testid="colonne-grafico"]')
  return JSON.parse(targa.textContent || '[]')
}

beforeEach(() => cleanup())

describe('il grafico per settimana non spezza il capodanno', () => {
  it('dal 28/12/2026 al 3/01/2027 il grafico mostra UNA colonna sola', async () => {
    const colonne = await colonneSettimanali(
      ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'],
      { dateFrom: '2026-12-28', dateTo: '2027-01-03' },
    )
    expect(colonne.map(c => c.key)).toEqual(['2026-W53'])
  })

  it('e la colonna porta tutti e sette i giorni, non solo quelli del 2026', async () => {
    const colonne = await colonneSettimanali(
      ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'],
      { dateFrom: '2026-12-28', dateTo: '2027-01-03' },
    )
    // 7 giorni × 1.000 g = 7 kg prodotti.
    expect(colonne[0].prod).toBeCloseTo(7, 6)
  })

  it('nessuna colonna si chiama «settimana zero»', async () => {
    const colonne = await colonneSettimanali(
      ['2027-01-01', '2027-01-02', '2026-01-01', '2025-01-01'],
      { dateFrom: '2025-01-01', dateTo: '2027-01-03' },
    )
    for (const c of colonne) {
      expect(c.key, `${c.key} è una settimana che non esiste`).not.toMatch(/-W00$/)
      expect(c.label, `${c.label} è una settimana che non esiste`).not.toContain('Sett 00')
    }
  })

  it('il 4 gennaio sta nella settimana 1 del suo anno, per definizione', async () => {
    const colonne = await colonneSettimanali(['2028-01-04'], { dateFrom: '2028-01-01', dateTo: '2028-01-31' })
    expect(colonne.map(c => c.key)).toEqual(['2028-W01'])
  })
})

describe('la domenica resta nella sua settimana in ogni stagione', () => {
  // Il difetto compariva solo con l'ora solare: la domenica 29/11/2026 e il
  // lunedì 23/11 che la precede devono stare nella stessa colonna.
  it('con l ora solare la domenica non scivola nella settimana dopo', async () => {
    const colonne = await colonneSettimanali(
      ['2026-11-23', '2026-11-29'],
      { dateFrom: '2026-11-23', dateTo: '2026-11-29' },
    )
    expect(colonne.map(c => c.key)).toEqual(['2026-W48'])
  })

  it('e non finisce insieme al lunedì che viene dopo', async () => {
    const colonne = await colonneSettimanali(
      ['2026-11-29', '2026-11-30'],
      { dateFrom: '2026-11-29', dateTo: '2026-11-30' },
    )
    expect(colonne.length, 'domenica e lunedì dopo sono finiti nella stessa colonna').toBe(2)
  })

  it('con l ora legale funzionava già, e deve continuare', async () => {
    const colonne = await colonneSettimanali(
      ['2026-06-22', '2026-06-28'],
      { dateFrom: '2026-06-22', dateTo: '2026-06-28' },
    )
    expect(colonne.map(c => c.key)).toEqual(['2026-W26'])
  })

  it('il giorno del cambio d ora non sposta la settimana', async () => {
    // 25/10/2026 è la domenica in cui si torna all'ora solare.
    const colonne = await colonneSettimanali(
      ['2026-10-19', '2026-10-25'],
      { dateFrom: '2026-10-19', dateTo: '2026-10-25' },
    )
    expect(colonne.map(c => c.key)).toEqual(['2026-W43'])
  })
})
