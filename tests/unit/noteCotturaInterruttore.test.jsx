// @vitest-environment happy-dom
//
// Nuovo gusto: il pulsante «Aggiungi note di cottura o congelabilità» si
// apriva e non si richiudeva più.
//
// Segnalato dal titolare di Mara dei Boschi il 18/09/2026, provando la pagina
// sul ricettario vero: «ottimo che clicco e si apre ma poi devo poter
// ricliccare e si deve chiudere».
//
// Nel codice di prima il pulsante esisteva solo mentre la sezione era chiusa
// (`!showMore && !form.note && !form.congelabile`): al primo clic spariva e
// non restava niente da premere. E c'era un secondo giro dello stesso difetto,
// meno visibile: la sezione si teneva aperta da sola quando nelle note c'era
// scritto qualcosa, quindi aprendo una ricetta che ha le note non si
// richiudeva in nessun modo.
//
// La correzione porta con sé un rischio suo, ed è quello che questi test
// guardano più da vicino: chiudere deve nascondere, non cancellare. Quello che
// è stato scritto resta nel modulo, si salva con la ricetta, e il pulsante
// chiuso lo dice — invece di tornare a proporre «Aggiungi», che farebbe
// pensare di averlo perso.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, ssaveBatch: async () => {},
  sload: async () => null, sloadAllSedi: async () => ({}),
}))

const NuovaRicettaView = (await import('../../src/views/NuovaRicettaView.jsx')).default

const RICETTARIO_VUOTO = { ricette: {}, ingredienti_costi: {} }

function monta({ ricettario = RICETTARIO_VUOTO, editingRicetta = null, onSave = async () => {} } = {}) {
  return render(
    <NuovaRicettaView
      ricettario={ricettario}
      onSave={onSave}
      notify={() => {}}
      editingRicetta={editingRicetta}
      onEditConsumed={() => {}}
      tipoAttivita="pasticceria"
    />
  )
}

// Il pulsante è uno solo e cambia scritta: lo si prende dall'aria-controls,
// che è l'unica cosa che non cambia fra i tre stati.
const interruttore = () => document.querySelector('[aria-controls="note-e-congelabilita"]')
const campoNote = () => screen.queryByLabelText(/note ricetta/i)

afterEach(() => cleanup())

describe('Nuovo gusto - note di cottura: apre e chiude', () => {
  it('il difetto: dopo aver aperto, un secondo clic richiude', () => {
    monta()
    expect(campoNote()).toBeNull()

    fireEvent.click(interruttore())
    expect(campoNote()).toBeTruthy()

    // Qui il codice di prima si fermava: il pulsante non c'era più.
    expect(interruttore()).toBeTruthy()
    fireEvent.click(interruttore())
    expect(campoNote()).toBeNull()
  })

  it('aria-expanded segue lo stato, in tutti e due i versi', () => {
    monta()
    expect(interruttore().getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(interruttore())
    expect(interruttore().getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(interruttore())
    expect(interruttore().getAttribute('aria-expanded')).toBe('false')
  })

  it('il testo del pulsante dice in che stato sta', () => {
    monta()
    expect(interruttore().textContent).toMatch(/Aggiungi note di cottura/i)
    fireEvent.click(interruttore())
    expect(interruttore().textContent).toMatch(/Nascondi/i)
  })

  it('richiudere non cancella la nota appena scritta', () => {
    monta()
    fireEvent.click(interruttore())
    fireEvent.change(campoNote(), { target: { value: '180°C per 45 min' } })

    fireEvent.click(interruttore())          // chiudo
    expect(campoNote()).toBeNull()

    fireEvent.click(interruttore())          // riapro
    expect(campoNote().value).toBe('180°C per 45 min')
  })

  it('a sezione chiusa con qualcosa dentro, il pulsante lo dice e non fa credere che sia perso', () => {
    monta()
    fireEvent.click(interruttore())
    fireEvent.change(campoNote(), { target: { value: '180°C per 45 min' } })
    fireEvent.click(interruttore())

    const testo = interruttore().textContent
    expect(testo).toMatch(/Mostra note/i)
    expect(testo).toMatch(/180°C per 45 min/)
    expect(testo).toMatch(/si salva con la ricetta/i)
    // Non deve tornare a dire «Aggiungi»: farebbe pensare che dentro non ci
    // sia niente.
    expect(testo).not.toMatch(/Aggiungi note/i)
  })

  it('la nota nascosta finisce comunque nella ricetta salvata', async () => {
    const salvate = []
    monta({ onSave: async (ric) => { salvate.push(ric) } })

    fireEvent.change(screen.getByLabelText(/^nome ricetta$/i), { target: { value: 'CROSTATA' } })
    fireEvent.change(screen.getByLabelText(/nome ingrediente da aggiungere/i), { target: { value: 'burro' } })
    fireEvent.change(screen.getByLabelText(/grammi di ingrediente da aggiungere/i), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi ingrediente alla ricetta' }))

    fireEvent.click(interruttore())
    fireEvent.change(campoNote(), { target: { value: '180°C per 45 min' } })
    fireEvent.click(interruttore())          // la chiudo prima di salvare

    fireEvent.click(screen.getByRole('button', { name: /Salva nuova ricetta/i }))
    await waitFor(() => expect(salvate.length).toBe(1))
    expect(salvate[0].ricette.CROSTATA.note).toBe('180°C per 45 min')
  })

  it('aprendo una ricetta che ha gia le note, la sezione parte aperta', async () => {
    const ricettario = {
      ingredienti_costi: {},
      ricette: {
        CROSTATA: {
          nome: 'CROSTATA', tipo: 'fetta', unita: 8, prezzo: 4,
          note: 'forno statico 170°C', congelabile: false,
          ingredienti: [{ nome: 'burro', qty1stampo: 200 }],
        },
      },
    }
    monta({ ricettario, editingRicetta: 'CROSTATA' })
    await waitFor(() => expect(campoNote()).toBeTruthy())
    expect(campoNote().value).toBe('forno statico 170°C')
    expect(interruttore().getAttribute('aria-expanded')).toBe('true')

    // E da lì si richiude come le altre: era proprio questo il caso che prima
    // restava incastrato aperto.
    fireEvent.click(interruttore())
    expect(campoNote()).toBeNull()
  })

  it('ricominciando da capo la sezione si richiude', async () => {
    const ricettario = {
      ingredienti_costi: {},
      ricette: {
        CROSTATA: {
          nome: 'CROSTATA', tipo: 'fetta', unita: 8, prezzo: 4,
          note: 'forno statico 170°C', congelabile: false,
          ingredienti: [{ nome: 'burro', qty1stampo: 200 }],
        },
      },
    }
    monta({ ricettario, editingRicetta: 'CROSTATA' })
    await waitFor(() => expect(campoNote()).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Ricetta nuova/i }))
    expect(campoNote()).toBeNull()
    expect(interruttore().textContent).toMatch(/Aggiungi note di cottura/i)
  })
})
