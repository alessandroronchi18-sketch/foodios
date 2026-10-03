// @vitest-environment happy-dom
//
// ── Costi fissi: il totale è di un mese vero, e i mesi passati non cambiano ──
//
// Audit del 03/10/2026 sulla parte Analisi (Costi fissi 35/100):
//
//   1. il «Costo mensile totale» in cima si calcolava senza una data: contava
//      anche le voci già finite e quelle che iniziano fra sei mesi, quindi non
//      era il costo di nessun mese (`CostiAziendaliView.jsx:120`);
//   2. «Elimina» cancellava la riga dal database, mentre la finestra diceva
//      «Le voci storiche restano»: l'affitto di gennaio spariva anche da
//      gennaio e il conto dei mesi passati cambiava (`:202`, `:207`);
//   3. «N voci attive» contava anche le voci finite.
//
// Ora il totale è quello di oggi; una voce che ha già pesato su un mese
// passato si chiude (data di fine), e si cancella solo quella che non ha
// passato.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { comeEliminare } from '../../src/lib/costiAziendali.js'

const stato = { voci: [] }
const salvaMock = vi.fn(() => Promise.resolve({ id: 'x' }))
const eliminaMock = vi.fn(() => Promise.resolve())
vi.mock('../../src/lib/costiAziendali', async () => {
  const vero = await vi.importActual('../../src/lib/costiAziendali')
  return {
    ...vero,
    caricaCostiAziendali: () => Promise.resolve(stato.voci),
    salvaVoceCosto: (...a) => salvaMock(...a),
    eliminaVoceCosto: (...a) => eliminaMock(...a),
  }
})
vi.mock('../../src/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) } }))

const { default: CostiAziendaliView } = await import('../../src/views/CostiAziendaliView.jsx')
const { todayLocal } = await import('../../src/lib/dateLocal.js')
const { ConfirmProvider } = await import('../../src/components/ConfirmModal.jsx')

const OGGI = todayLocal()
const MESE = OGGI.slice(0, 7)
const testo = () => document.body.textContent || ''

beforeEach(() => { stato.voci = []; salvaMock.mockClear(); eliminaMock.mockClear() })
afterEach(() => cleanup())

async function monta() {
  // Come nell'app: la finestra di conferma vive nel suo contenitore.
  const u = render(<ConfirmProvider><CostiAziendaliView orgId="o1" sedeId={null} sedi={[]} notify={() => {}} /></ConfirmProvider>)
  await waitFor(() => expect(u.container.textContent).not.toContain('Caricamento'))
  return u
}

describe('Come si elimina una voce', () => {
  it('con dei mesi passati si chiude, senza passato si cancella', () => {
    expect(comeEliminare({ data_inizio: '2025-01-01' }, '2026-10-03')).toBe('chiudi')
    expect(comeEliminare({ created_at: '2026-02-11T10:00:00Z' }, '2026-10-03')).toBe('chiudi')
    expect(comeEliminare({ created_at: '2026-10-01T10:00:00Z' }, '2026-10-03')).toBe('cancella')
    expect(comeEliminare({ data_inizio: '2027-01-01' }, '2026-10-03')).toBe('cancella')
    expect(comeEliminare({}, '2026-10-03')).toBe('cancella')
  })
})

describe('Il totale del mese', () => {
  it('non conta le voci finite né quelle che non sono ancora iniziate', async () => {
    stato.voci = [
      { id: 'a', voce: 'Affitto', importo: 1500, periodicita: 'mensile', categoria: 'affitti', attivo: true, data_inizio: '2024-01-01' },
      { id: 'b', voce: 'Vecchio leasing', importo: 800, periodicita: 'mensile', categoria: 'altro', attivo: true, data_inizio: '2024-01-01', data_fine: '2025-12-31' },
      { id: 'c', voce: 'Nuovo laboratorio', importo: 300, periodicita: 'mensile', categoria: 'affitti', attivo: true, data_inizio: '2099-01-01' },
    ]
    await monta()
    expect(testo()).toMatch(/1\.500 €/)
    expect(testo()).not.toMatch(/2\.600 €/)
    expect(testo()).toMatch(/1 voce attiva · 2 finite o non ancora iniziate/)
  })
})

describe('Eliminare non riscrive i mesi passati', () => {
  it('una voce con mesi passati si chiude con la data di oggi', async () => {
    stato.voci = [{ id: 'a', voce: 'Affitto', importo: 1500, periodicita: 'mensile', categoria: 'affitti', attivo: true, data_inizio: '2024-01-01' }]
    const u = await monta()
    await act(async () => { fireEvent.click(u.getByLabelText('Elimina voce Affitto')) })
    expect(testo()).toMatch(/Smettere di contare «Affitto»\?/)
    expect(testo()).toMatch(/I mesi passati restano/)
    await act(async () => { fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent === 'Smetti di contarla')) })
    expect(eliminaMock).not.toHaveBeenCalled()
    expect(salvaMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', data_fine: OGGI }))
  })

  it('una voce nata questo mese si cancella davvero', async () => {
    stato.voci = [{ id: 'n', voce: 'Prova', importo: 50, periodicita: 'mensile', categoria: 'altro', attivo: true, data_inizio: `${MESE}-01` }]
    const u = await monta()
    await act(async () => { fireEvent.click(u.getByLabelText('Elimina voce Prova')) })
    expect(testo()).toMatch(/sparisce del tutto/)
    await act(async () => { fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent === 'Elimina')) })
    expect(eliminaMock).toHaveBeenCalledWith('n', false)
    expect(salvaMock).not.toHaveBeenCalled()
  })
})
