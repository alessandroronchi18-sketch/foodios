// @vitest-environment happy-dom
//
// ── I materiali di confezionamento si scrivono una volta sola ─────────────
//
// Richiesta del titolare, 18/09/2026, sulla pagina Listino:
//
//   «c'è margine di errore se l'utente scrive coppettp o fazzolettp. e poi i
//    costi per singola coppetta o singolo fazzoletto sono molto bassi.
//    possiamo invertire il calcolo: l'utente in quella pagina inserisce tutti
//    i prodotti che usa legati alla vendita — cucchiaini, fazzoletti,
//    coppette — e spiega quanto spende per ognuno. una volta salvati, quando
//    clicca nuovo formato e fa "aggiungi materiale" compare l'elenco fisso.
//    se un prodotto non viene aggiunto prima, non compare nell'elenco»
//
// Prima ogni formato portava i suoi materiali scritti a mano, nome e prezzo.
// Due guai, tutt'e due silenziosi: «coppettp» diventava un materiale nuovo che
// nessuno notava, e il costo — tre o quattro millesimi di euro — andava
// ribattuto a ogni formato, con uno zero in più o in meno che a quella misura
// non si vede a occhio.
//
// È lo stesso principio dell'elenco chiuso delle materie prime, applicato
// all'altra porta da cui entrano i costi.
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const salvataggi = []
vi.mock('../../src/lib/storage', () => ({
  sload: async (key) => {
    if (key === 'pasticceria-materiali-confezionamento-v1') {
      return [{ nome: 'Cono cialda piccolo', costo: 0.06 }, { nome: 'Coppetta 120', costo: 0.032 }]
    }
    if (key === 'pasticceria-formati-vendita-v1') return []
    return null
  },
  ssave: async (key, val) => { salvataggi.push([key, val]) },
}))

const { default: FormatiVendita } = await import('../../src/components/FormatiVendita.jsx')

const ricettario = { ricette: {}, ingredienti_costi: {} }

function apri() {
  return render(<FormatiVendita orgId="o1" ricettario={ricettario} onSaveRicettario={async () => {}}
    notify={() => {}} tipoAttivita="gelateria" sedi={[]} />)
}

beforeEach(() => { salvataggi.length = 0 })

describe('I materiali hanno una casa loro', () => {
  it('il pulsante dice quanti sono', async () => {
    apri()
    const b = await screen.findByRole('button', { name: /i tuoi materiali/i })
    expect(b.textContent).toContain('2')
  })

  it('aprendolo si vedono, con il loro costo', async () => {
    apri()
    fireEvent.click(await screen.findByRole('button', { name: /i tuoi materiali/i }))
    expect(screen.getByDisplayValue('Cono cialda piccolo')).toBeTruthy()
    expect(screen.getByDisplayValue('0.032')).toBeTruthy()
  })

  it('un doppione non si aggiunge', async () => {
    const avvisi = []
    render(<FormatiVendita orgId="o1" ricettario={ricettario} onSaveRicettario={async () => {}}
      notify={(m, ok) => avvisi.push([m, ok])} tipoAttivita="gelateria" sedi={[]} />)
    fireEvent.click(await screen.findByRole('button', { name: /i tuoi materiali/i }))
    fireEvent.change(screen.getByLabelText(/nome del materiale da aggiungere/i), { target: { value: 'coppetta 120' } })
    fireEvent.click(screen.getByRole('button', { name: /aggiungi ai materiali/i }))
    await waitFor(() => expect(avvisi.length).toBeGreaterThan(0))
    expect(avvisi[avvisi.length - 1][0]).toMatch(/c’è già|c'è già/i)
    expect(salvataggi.filter(([k]) => k.includes('materiali'))).toEqual([])
  })

  it('un materiale senza costo si salva `null`, non `0`', async () => {
    apri()
    fireEvent.click(await screen.findByRole('button', { name: /i tuoi materiali/i }))
    fireEvent.change(screen.getByLabelText(/nome del materiale da aggiungere/i), { target: { value: 'Cucchiaino' } })
    fireEvent.click(screen.getByRole('button', { name: /aggiungi ai materiali/i }))
    await waitFor(() => expect(salvataggi.some(([k]) => k.includes('materiali'))).toBe(true))
    const [, arr] = salvataggi.filter(([k]) => k.includes('materiali')).pop()
    const nuovo = arr.find(m => m.nome === 'Cucchiaino')
    // Zero vorrebbe dire «me lo regalano»: è un'altra cosa da «non lo so
    // ancora», e nel food cost sparirebbe senza lasciare traccia.
    expect(nuovo.costo).toBeNull()
  })
})

describe('Nel formato il materiale si sceglie, non si scrive', () => {
  it('il campo è un elenco, e offre i materiali salvati', async () => {
    apri()
    fireEvent.click(await screen.findByRole('button', { name: /nuovo formato/i }))
    fireEvent.click(screen.getByRole('button', { name: /aggiungi materiale/i }))
    const campo = screen.getByLabelText('Materiale 1')
    expect(campo.getAttribute('role')).toBe('combobox')
    fireEvent.focus(campo)
    expect(screen.getByText('Coppetta 120')).toBeTruthy()
  })

  it('un nome inventato viene segnalato', async () => {
    apri()
    fireEvent.click(await screen.findByRole('button', { name: /nuovo formato/i }))
    fireEvent.click(screen.getByRole('button', { name: /aggiungi materiale/i }))
    const campo = screen.getByLabelText('Materiale 1')
    fireEvent.change(campo, { target: { value: 'coppettp' } })
    fireEvent.keyDown(campo, { key: 'Escape' })
    // E lo dice con la parola giusta: qui l'elenco non è quello delle materie
    // prime, sono coni e fazzoletti. Il componente è lo stesso, le cose che
    // contiene no.
    expect(screen.getByText(/non è fra i tuoi materiali di confezionamento/i)).toBeTruthy()
    // La proposta non scatta, ed è giusto: «coppettp» dista quattro lettere da
    // «Coppetta 120», e a quella distanza una proposta sarebbe un tiro a caso.
    // Resta comunque la strada per crearlo.
    expect(screen.getByRole('button', { name: /aggiungilo ai materiali/i })).toBeTruthy()
  })

  it('scegliendo dall’elenco il costo si compila da solo', async () => {
    apri()
    fireEvent.click(await screen.findByRole('button', { name: /nuovo formato/i }))
    fireEvent.click(screen.getByRole('button', { name: /aggiungi materiale/i }))
    const campo = screen.getByLabelText('Materiale 1')
    fireEvent.focus(campo)
    fireEvent.mouseDown(screen.getByText('Coppetta 120'))
    // Il costo non si ribatte: arriva dall'elenco, dove è scritto una volta
    // sola e si corregge in un posto solo.
    await waitFor(() => expect(screen.getByDisplayValue('0.032')).toBeTruthy())
  })
})
