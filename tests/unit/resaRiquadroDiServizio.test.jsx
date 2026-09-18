// @vitest-environment happy-dom
//
// Nuovo gusto: il riquadro «Somma ingredienti / Resa dichiarata» pesava quanto
// il risultato della pagina.
//
// Il titolare di Mara dei Boschi, il 18/09/2026: «rivedi le dimensioni di
// questa box e miglioralre e rendile perfette per la pagina, non invasive e
// grandi».
//
// Era un riquadro pieno — fondo suo, cornice, angoli tondi — con dentro due
// righe larghe quanto mezza pagina per dire una somma e una resa. Due numeri
// di servizio, disegnati con lo stesso peso del pannello del costo, che in
// questa pagina è la cosa che conta davvero.
//
// La correzione ha un vincolo che è già costato un difetto vero a questo
// progetto: il corpo del testo non scende sotto i 12px. «Più piccolo» qui si
// ottiene con l'ingombro, i bordi interni e il contrasto — niente fondo,
// niente cornice, un filo a sinistra, una riga sola — non rimpicciolendo i
// caratteri. Il primo test della lista è quello che tiene ferma questa
// distinzione.
//
// E c'è un caso in cui il riquadro deve restare grosso: quando lo scarto fra
// somma e resa supera il 5%. Lì non è un'informazione di servizio, è una cosa
// da guardare, con un pulsante da premere. Gli ultimi test difendono quello.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, ssaveBatch: async () => {},
  sload: async () => null, sloadAllSedi: async () => ({}),
}))

const NuovaRicettaView = (await import('../../src/views/NuovaRicettaView.jsx')).default

const RICETTARIO = { ricette: {}, ingredienti_costi: { burro: { costoKg: 9, costoG: 0.009 } } }

function monta(tipoAttivita = 'pasticceria') {
  return render(
    <NuovaRicettaView
      ricettario={RICETTARIO}
      onSave={async () => {}}
      notify={() => {}}
      editingRicetta={null}
      onEditConsumed={() => {}}
      tipoAttivita={tipoAttivita}
    />
  )
}

function aggiungi(nome, grammi) {
  fireEvent.change(screen.getByLabelText(/nome ingrediente da aggiungere/i), { target: { value: nome } })
  fireEvent.change(screen.getByLabelText(/grammi di ingrediente da aggiungere/i), { target: { value: String(grammi) } })
  fireEvent.click(screen.getByRole('button', { name: 'Aggiungi ingrediente alla ricetta' }))
}

// Il contenitore dei due numeri: si risale dall'etichetta finche' non si
// trova l'elemento che li contiene tutti e due. Serve perche' il riquadro
// cambia forma fra i due casi (riga sola / avviso a due righe) e un
// `closest('div')` secco prenderebbe due elementi diversi.
function riquadro() {
  let n = screen.getByText('Somma ingredienti')
  while (n && !(n.textContent.includes('Somma ingredienti') && n.textContent.includes('Resa dichiarata'))) n = n.parentElement
  return n
}

// La resa va scritta a mano: se il campo resta vuoto il programma usa la somma
// degli ingredienti, e uno scarto non c'e' mai per definizione.
function scriviResa(grammi, etichetta) {
  fireEvent.change(screen.getByLabelText(etichetta), { target: { value: String(grammi) } })
}

afterEach(() => cleanup())

describe('Nuovo gusto - il riquadro somma/resa quando non c\'e niente da segnalare', () => {
  it('il difetto: non ha piu ne fondo ne cornice', () => {
    monta()
    aggiungi('Burro', 1000)     // somma 1.000 g, resa 1.000 g: nessuno scarto
    const box = riquadro()
    expect(box.style.background).toBe('')
    expect(box.style.border).toBe('')
    expect(box.style.borderRadius).toBe('')
  })

  it('l\'ingombro si riduce con un filo a sinistra, non con il carattere', () => {
    monta()
    aggiungi('Burro', 1000)
    const box = riquadro()
    expect(box.style.borderLeft).toMatch(/2px solid/)
    // Il minimo che il progetto si e' dato dopo un difetto vero.
    expect(parseFloat(box.style.fontSize)).toBeGreaterThanOrEqual(12)
  })

  it('i due numeri restano leggibili e all\'italiana', () => {
    monta()
    aggiungi('Burro', 4300)
    // Senza resa scritta a mano, somma e resa coincidono: due volte lo stesso
    // numero, tutte e due all'italiana.
    expect(screen.getAllByText('4.300 g').length).toBe(2)
    expect(screen.getByText('Somma ingredienti')).toBeTruthy()
    expect(screen.getByText('Resa dichiarata')).toBeTruthy()
  })

  it('stanno su una riga sola: e una nota di servizio, non un pannello', () => {
    monta()
    aggiungi('Burro', 1000)
    const box = riquadro()
    expect(box.style.display).toBe('flex')
    expect(box.style.flexWrap).toBe('wrap')
    // Il pulsante «Normalizza» non c'entra niente quando non c'è scarto.
    expect(screen.queryByRole('button', { name: /Normalizza/i })).toBeNull()
  })

  it('non ruba l\'occhio: il testo sta sul grigio tenue, non sul colore di un avviso', () => {
    monta()
    aggiungi('Burro', 1000)
    const box = riquadro()
    // #92400E è l'ambra degli avvisi: qui non ci deve stare.
    expect(box.style.color.toLowerCase()).not.toContain('92400e')
  })
})

describe('Nuovo gusto - quando lo scarto e vero, il riquadro torna a farsi vedere', () => {
  // Gelateria: la resa di default è 1 kg, quindi 4.300 g di ingredienti
  // fanno uno scarto del 76%.
  it('con uno scarto sopra il 5% ricompaiono fondo, cornice e pulsante', () => {
    monta('gelateria')
    aggiungi('Burro', 4300)
    scriviResa(1000, /Resa 1 kg finito/i)
    const box = riquadro()
    expect(box.style.background.toUpperCase()).toContain('FFFBEB')
    expect(box.style.border).toMatch(/FDE68A/i)
    expect(screen.getByRole('button', { name: /Normalizza ingredienti a 1000 g/i })).toBeTruthy()
  })

  it('e dice di quanto e lo scarto, non solo che c\'e', () => {
    monta('gelateria')
    aggiungi('Burro', 4300)
    scriviResa(1000, /Resa 1 kg finito/i)
    expect(screen.getByText(/^Scarto/).textContent).toMatch(/76,7%/)
  })

  it('normalizzando, lo scarto sparisce e il riquadro torna discreto', () => {
    monta('gelateria')
    aggiungi('Burro', 4300)
    scriviResa(1000, /Resa 1 kg finito/i)
    fireEvent.click(screen.getByRole('button', { name: /Normalizza/i }))
    expect(screen.queryByRole('button', { name: /Normalizza/i })).toBeNull()
    expect(riquadro().style.background).toBe('')
  })
})
