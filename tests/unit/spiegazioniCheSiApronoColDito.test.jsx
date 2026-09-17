// @vitest-environment happy-dom
//
// ── I mouseover non funzionavano per metà delle persone ────────────────
//
// Segnalato dal titolare il 17/09/2026: «controlla che i mouseover funzionino
// in tutto il tool, tipo ora in quella sezione non funzionano».
//
// Non era quella sezione: era il componente `Tip`, che disegna ogni
// spiegazione del prodotto. Reagiva SOLO a `onMouseEnter` — cioè a un mouse.
// Su un telefono o su un tablet quel gesto non esiste, e la spiegazione non
// si apriva mai. Il tablet è proprio dove sta chi lavora in laboratorio:
// ogni «?» era muto per metà di chi usa Foodos.
//
// È il genere di difetto che non si vede mai da chi sviluppa, perché chi
// sviluppa ha un mouse.
//
// Qui si prova che si apre nei tre modi in cui si usa il prodotto, e che si
// chiude quando deve — perché una spiegazione che resta aperta mentre la
// pagina scorre indica la cosa sbagliata.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { Tip } from '../../src/views/_shared.jsx'

afterEach(cleanup)

const apri = () => screen.getByRole('button', { name: /Spiegazione:/ })

describe('la spiegazione si apre in tutti i modi in cui si usa il prodotto', () => {
  it('col mouse, come prima', () => {
    render(<Tip text="Grammi per uno stampo"><span>g</span></Tip>)
    expect(screen.queryByText('Grammi per uno stampo')).toBeNull()
    fireEvent.mouseEnter(apri())
    expect(screen.getByText('Grammi per uno stampo')).toBeTruthy()
  })

  it('col dito — ed è quello che mancava', () => {
    render(<Tip text="Costo per uno stampo"><span>€</span></Tip>)
    fireEvent.click(apri())
    expect(screen.getByText('Costo per uno stampo'),
      'sul telefono la spiegazione deve aprirsi al tocco').toBeTruthy()
  })

  it('con la tastiera, per chi non usa né mouse né dito', () => {
    render(<Tip text="Spiegazione da tastiera"><span>?</span></Tip>)
    fireEvent.focus(apri())
    expect(screen.getByText('Spiegazione da tastiera')).toBeTruthy()
  })
})

describe('e si chiude quando deve', () => {
  it('toccando una seconda volta', () => {
    render(<Tip text="Apri e chiudi"><span>i</span></Tip>)
    fireEvent.click(apri())
    expect(screen.getByText('Apri e chiudi')).toBeTruthy()
    fireEvent.click(apri())
    expect(screen.queryByText('Apri e chiudi')).toBeNull()
  })

  it('toccando altrove nella pagina', () => {
    render(<Tip text="Chiudi da fuori"><span>i</span></Tip>)
    fireEvent.click(apri())
    expect(screen.getByText('Chiudi da fuori')).toBeTruthy()
    fireEvent.click(document.body)
    expect(screen.queryByText('Chiudi da fuori')).toBeNull()
  })

  it('con Esc', () => {
    render(<Tip text="Chiudi con Esc"><span>i</span></Tip>)
    fireEvent.click(apri())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Chiudi con Esc')).toBeNull()
  })

  it('quando la pagina scorre: è posizionata in coordinate di finestra', () => {
    // Se restasse aperta mentre il suo bersaglio scivola via, indicherebbe
    // un punto qualsiasi dello schermo.
    render(<Tip text="Chiudi allo scorrimento"><span>i</span></Tip>)
    fireEvent.click(apri())
    expect(screen.getByText('Chiudi allo scorrimento')).toBeTruthy()
    fireEvent.scroll(window)
    expect(screen.queryByText('Chiudi allo scorrimento')).toBeNull()
  })
})

describe('quello che c\'è intorno', () => {
  it('senza testo non disegna niente in più: resta solo il contenuto', () => {
    const { container } = render(<Tip text=""><span>solo io</span></Tip>)
    expect(container.textContent).toBe('solo io')
    expect(screen.queryByRole('button', { name: /Spiegazione:/ })).toBeNull()
  })

  it('chi legge con uno screen reader sa che c’è una spiegazione', () => {
    render(<Tip text="Il food cost per un chilo"><span>FC</span></Tip>)
    expect(apri().getAttribute('aria-label')).toBe('Spiegazione: Il food cost per un chilo')
  })

  it('e ci si arriva con la tastiera', () => {
    render(<Tip text="Raggiungibile"><span>?</span></Tip>)
    expect(apri().getAttribute('tabIndex') ?? apri().tabIndex).not.toBe(-1)
  })
})
