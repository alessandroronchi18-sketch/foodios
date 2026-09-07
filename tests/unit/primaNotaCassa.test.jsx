// @vitest-environment happy-dom
//
// Prima nota di cassa: test di tenuta del componente.
//
// Non verifica la grafica ma le tre cose che, se si rompono, fanno perdere
// soldi veri: che l'elenco della giornata si veda, che la notazione sul
// documento arrivi al database come l'utente l'ha scelta, e che una spesa
// senza importo o senza descrizione non passi.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const stato = { righe: [], aggiunte: [], eliminate: [] }

vi.mock('../../src/lib/primaNota', async () => {
  const real = await vi.importActual('../../src/lib/primaNota')
  return {
    ...real,
    caricaMovimenti: vi.fn(() => Promise.resolve(stato.righe)),
    aggiungiMovimento: vi.fn((orgId, sedeId, m) => {
      stato.aggiunte.push({ orgId, sedeId, ...m })
      return Promise.resolve({ id: `m${stato.aggiunte.length}`, ...m, importo: Number(m.importo) })
    }),
    eliminaMovimento: vi.fn((id) => { stato.eliminate.push(id); return Promise.resolve() }),
  }
})

vi.mock('../../src/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({}) }) }) },
}))

const { default: PrimaNotaCassa } = await import('../../src/components/PrimaNotaCassa.jsx')
const { ConfirmProvider } = await import('../../src/components/ConfirmModal.jsx')
const primaNota = await import('../../src/lib/primaNota')

const props = { orgId: 'org-1', sedeId: 'sede-1', data: '2026-07-03', notify: () => {} }
const montaggio = (p = {}) => render(
  <ConfirmProvider><PrimaNotaCassa {...props} {...p} /></ConfirmProvider>
)

beforeEach(() => {
  stato.righe = []; stato.aggiunte = []; stato.eliminate = []
  vi.clearAllMocks()
  cleanup()
})

describe('PrimaNotaCassa', () => {
  it('senza uscite lo dice, invece di mostrare una tabella vuota', async () => {
    const { container } = montaggio()
    await waitFor(() => expect(container.textContent).toContain('Nessuna uscita segnata'))
  })

  it('mostra le uscite del giorno con il totale e la ripartizione', async () => {
    stato.righe = [
      { id: 'm1', data: '2026-07-03', importo: 10, descrizione: 'limoni', documento: 'senza' },
      { id: 'm2', data: '2026-07-03', importo: 11.56, descrizione: 'carrefour', documento: 'fattura' },
    ]
    const { container } = montaggio()
    await waitFor(() => expect(container.textContent).toContain('limoni'))
    expect(container.textContent).toContain('carrefour')
    // Totale in formato italiano, con l'euro dopo la cifra.
    expect(container.textContent).toContain('21,56 €')
    // Con documenti diversi compare la ripartizione: al commercialista servono distinte.
    expect(container.textContent).toContain('senza fattura')
    expect(container.textContent).toContain('con fattura')
  })

  it('chiede al database la sola giornata mostrata', async () => {
    montaggio({ data: '2026-07-09' })
    await waitFor(() => expect(primaNota.caricaMovimenti).toHaveBeenCalled())
    expect(primaNota.caricaMovimenti).toHaveBeenCalledWith('org-1', 'sede-1', { from: '2026-07-09', to: '2026-07-09' })
  })

  it('salva la spesa con il documento scelto, e la virgola vale come decimale', async () => {
    const { container, getByLabelText, getByText } = montaggio()
    await waitFor(() => expect(container.textContent).toContain('Uscite di cassa'))

    fireEvent.change(getByLabelText('Quanto'), { target: { value: '11,56' } })
    fireEvent.change(getByLabelText('Per cosa'), { target: { value: 'carrefour' } })
    fireEvent.click(getByText('Con fattura'))
    fireEvent.click(getByText(/Aggiungi l/))

    await waitFor(() => expect(stato.aggiunte).toHaveLength(1))
    expect(stato.aggiunte[0]).toMatchObject({
      orgId: 'org-1', sedeId: 'sede-1', data: '2026-07-03',
      importo: 11.56, descrizione: 'carrefour', documento: 'fattura',
    })
  })

  it('parte da "senza fattura", che nel registro reale è il caso più frequente', async () => {
    const { container, getByLabelText, getByText } = montaggio()
    await waitFor(() => expect(container.textContent).toContain('Uscite di cassa'))
    fireEvent.change(getByLabelText('Quanto'), { target: { value: '10' } })
    fireEvent.change(getByLabelText('Per cosa'), { target: { value: 'limoni' } })
    fireEvent.click(getByText(/Aggiungi l/))
    await waitFor(() => expect(stato.aggiunte).toHaveLength(1))
    expect(stato.aggiunte[0].documento).toBe('senza')
  })

  it('non salva senza importo o senza descrizione', async () => {
    const { container, getByLabelText, getByText } = montaggio()
    await waitFor(() => expect(container.textContent).toContain('Uscite di cassa'))

    fireEvent.click(getByText(/Aggiungi l/))                                  // tutto vuoto
    fireEvent.change(getByLabelText('Quanto'), { target: { value: '10' } })
    fireEvent.click(getByText(/Aggiungi l/))                                  // manca il perché
    fireEvent.change(getByLabelText('Quanto'), { target: { value: '' } })
    fireEvent.change(getByLabelText('Per cosa'), { target: { value: 'limoni' } })
    fireEvent.click(getByText(/Aggiungi l/))                                  // manca l'importo

    await new Promise(r => setTimeout(r, 0))
    expect(stato.aggiunte).toHaveLength(0)
  })

  it('senza organizzazione non interroga il database', async () => {
    montaggio({ orgId: null })
    await new Promise(r => setTimeout(r, 0))
    expect(primaNota.caricaMovimenti).not.toHaveBeenCalled()
  })

  it('togliere un\'uscita passa dalla conferma', async () => {
    stato.righe = [{ id: 'm1', data: '2026-07-03', importo: 10, descrizione: 'limoni', documento: 'senza' }]
    const { container, getByLabelText, getByText } = montaggio()
    await waitFor(() => expect(container.textContent).toContain('limoni'))

    fireEvent.click(getByLabelText('Togli limoni'))
    await waitFor(() => expect(container.textContent).toContain('Togliere questa uscita?'))
    expect(stato.eliminate).toHaveLength(0)     // niente è stato cancellato ancora

    fireEvent.click(getByText('Togli'))
    await waitFor(() => expect(stato.eliminate).toEqual(['m1']))
  })

  it('non mostra emoji: le icone sono SVG', async () => {
    stato.righe = [{ id: 'm1', data: '2026-07-03', importo: 10, descrizione: 'limoni', documento: 'senza' }]
    const { container } = montaggio()
    await waitFor(() => expect(container.textContent).toContain('limoni'))
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0)
  })
})
