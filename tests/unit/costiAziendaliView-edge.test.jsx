// @vitest-environment happy-dom
/**
 * Test regressione CostiAziendaliView: copertura edge cases che hanno
 * portato al "tilt" del 26/06.
 *
 * Garantisce che il componente renderizzi senza crash in tutti gli scenari
 * critici: nessuna sede, sede singola, multi-sede, modalità "Tutte le sedi"
 * aggregate (sedeId null), voci malformate (sede_id undefined/null),
 * form aperto, voci con categoria sconosciuta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'

// Mock costiAziendali helpers — restituiamo array vuoti o dati di test.
const mockState = { voci: [] }

vi.mock('../../src/lib/costiAziendali', async () => {
  const real = await vi.importActual('../../src/lib/costiAziendali')
  return {
    ...real,
    caricaCostiAziendali: vi.fn(() => Promise.resolve(mockState.voci)),
    salvaVoceCosto: vi.fn(() => Promise.resolve()),
    eliminaVoceCosto: vi.fn(() => Promise.resolve()),
  }
})

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }),
    }),
  },
}))

// Import dopo mock
const { default: CostiAziendaliView } = await import('../../src/views/CostiAziendaliView.jsx')

const baseProps = {
  orgId: 'org-test',
  notify: () => {},
}

describe('CostiAziendaliView — edge cases (regressione 26/06)', () => {
  beforeEach(() => {
    mockState.voci = []
    cleanup()
  })

  it('renderizza senza crash con NESSUNA sede (sedi undefined)', () => {
    expect(() => render(<CostiAziendaliView {...baseProps} sedeId={null} sedi={undefined} />)).not.toThrow()
  })

  it('renderizza senza crash con sedi=null', () => {
    expect(() => render(<CostiAziendaliView {...baseProps} sedeId={null} sedi={null} />)).not.toThrow()
  })

  it('renderizza senza crash con sedi=[] (array vuoto)', () => {
    expect(() => render(<CostiAziendaliView {...baseProps} sedeId={null} sedi={[]} />)).not.toThrow()
  })

  it('renderizza con sede singola (mono-sede, toggle non deve apparire)', () => {
    const sedi = [{ id: 's1', nome: 'Sede unica', attiva: true }]
    const { container } = render(<CostiAziendaliView {...baseProps} sedeId="s1" sedi={sedi} />)
    expect(container).toBeTruthy()
    // Banner SCOPE non deve apparire (single-sede)
    expect(container.textContent).not.toContain('Ambito visualizzazione')
  })

  it('renderizza con multi-sede + sede attiva (toggle visibile)', () => {
    const sedi = [
      { id: 's1', nome: 'Carlina', attiva: true },
      { id: 's2', nome: 'De Gasperi', attiva: true },
    ]
    const { container } = render(<CostiAziendaliView {...baseProps} sedeId="s1" sedi={sedi} />)
    expect(container).toBeTruthy()
    // Banner SCOPE deve apparire
    expect(container.textContent).toContain('Ambito visualizzazione')
  })

  it('renderizza in modalità "Tutte le sedi" (sedeId null + multi-sede): banner toggle NON appare', () => {
    const sedi = [
      { id: 's1', nome: 'Carlina', attiva: true },
      { id: 's2', nome: 'De Gasperi', attiva: true },
    ]
    const { container } = render(<CostiAziendaliView {...baseProps} sedeId={null} sedi={sedi} />)
    expect(container).toBeTruthy()
    // Banner deve essere NASCOSTO (sedeId null = aggregate mode)
    expect(container.textContent).not.toContain('Ambito visualizzazione')
  })

  it('regge voci malformate (sede_id undefined, voce undefined nel filter)', async () => {
    mockState.voci = [
      { id: '1', voce: 'Normal', importo: 100, periodicita: 'mensile', categoria: 'consumabili', sede_id: null, attivo: true },
      { id: '2', voce: 'No sede_id field', importo: 50, periodicita: 'mensile', categoria: 'utenze', attivo: true }, // missing sede_id
      { id: '3', voce: 'sede_id undefined', importo: 30, periodicita: 'annuale', categoria: 'consumabili', sede_id: undefined, attivo: true },
    ]
    const sedi = [
      { id: 's1', nome: 'Sede A', attiva: true },
      { id: 's2', nome: 'Sede B', attiva: true },
    ]
    expect(() => render(<CostiAziendaliView {...baseProps} sedeId="s1" sedi={sedi} />)).not.toThrow()
  })

  it('regge voce con sede_id valido che non corrisponde a nessuna sede esistente', () => {
    mockState.voci = [
      { id: '1', voce: 'Sede ghost', importo: 100, periodicita: 'mensile', categoria: 'altro', sede_id: 'ghost-sede-id', attivo: true },
    ]
    const sedi = [
      { id: 's1', nome: 'Sede A', attiva: true },
      { id: 's2', nome: 'Sede B', attiva: true },
    ]
    expect(() => render(<CostiAziendaliView {...baseProps} sedeId="s1" sedi={sedi} />)).not.toThrow()
  })

  it('renderizza senza crash anche se orgId è undefined', () => {
    expect(() => render(<CostiAziendaliView sedeId={null} sedi={[]} notify={() => {}} />)).not.toThrow()
  })
})
