// @vitest-environment happy-dom
//
// Il doppio invio: il pulsante si spegne, il tasto Invio no.
//
// ═══ Il difetto, trovato il 18/09/2026 ════════════════════════════════════
//
// La regola della casa dice: «Bottoni async: SEMPRE `disabled={saving}`
// durante operazioni await. Evita double-submit» (CLAUDE.md). I pulsanti
// nuovi la rispettano tutti. Ma le stesse azioni si lanciano anche con
// **Invio**, e il tasto non guarda se il pulsante è spento.
//
// E c'è di peggio: la guardia scritta come `if (salvando) return` con
// `salvando` in `useState` **non funziona**. Fra la pressione del tasto e il
// ridisegno di React passa un istante, e due Invio rapidi ci stanno dentro
// tutti e due: quando il secondo entra nella funzione, `salvando` è ancora
// quello del render di prima, cioè `false`. Verificato il 18/09/2026: sul
// codice di allora due Invio producevano due salvataggi.
//
// Quanto costa. Due righe nello storico dei prezzi per una modifica sola —
// e uno storico dei prezzi che non torna è un P&L che non torna, perché è
// quello che `calcolaFCStorico` legge per rifare il food cost di un mese
// passato. Sulla stessa finestra in Nuovo gusto costava di più: l'ingrediente
// entrava DUE volte nella ricetta, cioè il doppio del costo.
//
// La correzione è un `ref`, che cambia subito senza aspettare il ridisegno.
// Lo `state` resta, perché serve a spegnere il pulsante e a scrivere «Salvo…».

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { default: MateriePrimeView } = await import('../../src/views/MateriePrimeView.jsx')

const ricettario = {
  ricette: { r1: { nome: 'SACHER', tipo: 'torta', porzioni: 8, prezzo: 30,
    ingredienti: [{ nome: 'burro', qty1stampo: 300 }] } },
  ingredienti_costi: { burro: { costoKg: 8.4, costoG: 0.0084 } },
}

beforeEach(() => { cleanup() })

describe('materie prime — due Invio non fanno due scritture', () => {
  it('creare una materia prima: due Invio, un salvataggio solo', async () => {
    let risolvi
    const attesa = new Promise(r => { risolvi = r })
    const create = []
    render(<MateriePrimeView
      ricettario={ricettario} logPrezzi={[]}
      onUpdatePrezzo={async () => {}}
      onCreaMateriaPrima={async (nome, prezzo) => { create.push([nome, prezzo]); await attesa; return { ok: true } }} />)

    fireEvent.click(screen.getByRole('button', { name: /Nuova materia prima/i }))
    fireEvent.change(screen.getByLabelText(/come si chiama/i), { target: { value: 'panna fresca' } })
    const prezzo = screen.getByLabelText(/prezzo al chilo/i)
    fireEvent.change(prezzo, { target: { value: '4,20' } })

    fireEvent.keyDown(prezzo, { key: 'Enter' })
    fireEvent.keyDown(prezzo, { key: 'Enter' })
    risolvi()

    // 18/09: qui si aspettava che sparisse il pulsante «Nuova materia
    // prima», ma quel pulsante RICOMPARE appena il modulo si chiude — è lui
    // che lo riapre. Si aspetta invece che sparisca il campo del modulo, che
    // esiste solo mentre il modulo è aperto.
    await waitFor(() => expect(screen.queryByLabelText(/come si chiama/i)).toBeNull())
    expect(create).toEqual([['panna fresca', 4.2]])
  })

  it('cambiare un prezzo: due Invio, una riga sola nello storico', async () => {
    let risolvi
    const attesa = new Promise(r => { risolvi = r })
    const scritture = []
    render(<MateriePrimeView
      ricettario={ricettario} logPrezzi={[]}
      onUpdatePrezzo={async (nome, val) => { scritture.push([nome, val]); await attesa }}
      onCreaMateriaPrima={async () => ({ ok: true })} />)

    // Si apre la modifica del prezzo del burro e si conferma.
    fireEvent.click(screen.getAllByRole('button', { name: /Modifica/i })[0])
    const campo = screen.getByLabelText(/Prezzo per chilo di burro/i)
    fireEvent.change(campo, { target: { value: '9,10' } })
    fireEvent.keyDown(campo, { key: 'Enter' })

    const dialog = await screen.findByRole('dialog')
    // La finestra di conferma risponde a Invio: due pressioni rapide
    // scrivevano due volte lo stesso cambio di prezzo.
    fireEvent.keyDown(dialog, { key: 'Enter' })
    fireEvent.keyDown(dialog, { key: 'Enter' })
    risolvi()

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(scritture).toHaveLength(1)
    expect(scritture[0][1]).toBe(9.1)
  })
})
