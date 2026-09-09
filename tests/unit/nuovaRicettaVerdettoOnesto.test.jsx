// @vitest-environment happy-dom
//
// Nuova Ricetta: il verdetto migliore arrivava proprio quando il tool non
// sapeva niente.
//
// calcolaFC restituisce { tot, mancanti }: gli ingredienti di cui non conosce
// il prezzo finiscono in `mancanti` e valgono ZERO nel totale. La pagina usava
// solo `tot`. Quindi una ricetta con tutti gli ingredienti senza prezzo dava
// food cost 0 e da li:
//
//   semaforo VERDE "Sano" · "Food cost 0,0%" · Margine 100,0%
//   "prezzo minimo 0,00 €" scritto in 32px
//   messaggio verde "Sei sopra il minimo: stai guadagnando più del target"
//
// L'unico avviso era un box ambra da 10,5px in fondo alla colonna. Un
// pasticcere che guarda il semaforo verde e prezza di conseguenza vende
// sottocosto, ed e' il tool che gliel'ha detto.
//
// Stessa storia svuotando il campo "Fette per stampo": unita = 0 mandava
// prezzoConsigliato a 0 e deltaPrezzo negativo, che cadeva nel ramo verde.
//
// La regola che questi test fissano: quando il calcolo non e' completo, la
// pagina lo dice e non da' verdetti.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, ssaveBatch: async () => {},
  sload: async () => null, sloadAllSedi: async () => ({}),
}))

const NuovaRicettaView = (await import('../../src/views/NuovaRicettaView.jsx')).default

// Nessun prezzo caricato, e un nome che non esiste nel listino HoReCa:
// e' il caso di chi ha appena importato il ricettario senza i prezzi.
const ricettarioSenzaPrezzi = { ricette: {}, ingredienti_costi: {} }

function monta(ricettario = ricettarioSenzaPrezzi) {
  return render(
    <NuovaRicettaView
      ricettario={ricettario}
      onSave={async () => {}}
      notify={() => {}}
      editingRicetta={null}
      onEditConsumed={() => {}}
      tipoAttivita="pasticceria"
    />
  )
}

function aggiungiIngrediente(nome, grammi) {
  fireEvent.change(screen.getByLabelText(/nome ingrediente da aggiungere/i), { target: { value: nome } })
  fireEvent.change(screen.getByLabelText(/grammi di ingrediente da aggiungere/i), { target: { value: String(grammi) } })
  fireEvent.click(screen.getByRole('button', { name: 'Aggiungi ingrediente alla ricetta' }))
}

afterEach(() => cleanup())

describe('Nuova Ricetta - onesta del verdetto', () => {
  it('senza i prezzi degli ingredienti NON dice "Sano" e NON mostra margine 100%', async () => {
    monta()
    // "farcitura segreta della nonna" non sta in nessun listino.
    aggiungiIngrediente('farcitura segreta della nonna', 300)

    await waitFor(() => expect(screen.getByText(/senza prezzo/i)).toBeTruthy())
    expect(screen.queryByText('Sano')).toBeNull()
    // Il numero non esce nudo: dice che e' un massimo, non una misura.
    expect(screen.queryByText('100,0%')).toBeNull()
    expect(screen.getByText('max 100,0%')).toBeTruthy()
    // E lo dice in chiaro, non in un box da 10px in fondo.
    expect(screen.getByText(/il margine che vedi è più alto del vero/i)).toBeTruthy()
  })

  it('senza i prezzi non dice "stai guadagnando piu del target"', async () => {
    monta()
    aggiungiIngrediente('farcitura segreta della nonna', 300)
    await waitFor(() => expect(screen.getByText(/senza prezzo/i)).toBeTruthy())
    expect(screen.queryByText(/stai guadagnando più del target/i)).toBeNull()
    expect(screen.getByText(/più basso del vero/i)).toBeTruthy()
  })

  it('con le fette a zero non mostra un prezzo minimo di 0,00 €', async () => {
    monta({ ricette: {}, ingredienti_costi: { burro: { costoKg: 7.2, costoG: 0.0072 } } })
    aggiungiIngrediente('burro', 250)

    // L'utente svuota "Fette / porzioni per stampo".
    fireEvent.change(screen.getByLabelText(/fette o porzioni per stampo/i), { target: { value: '' } })

    await waitFor(() => expect(screen.getByText(/senza quel numero non si può dire/i)).toBeTruthy())
    expect(screen.queryByText(/stai guadagnando più del target/i)).toBeNull()
    // Il "prezzo minimo per fetta" in 32px non c'e' più: era 0,00 €.
    expect(screen.queryByText(/prezzo minimo per (fetta|pezzo)/i)).toBeNull()
  })

  it('con tutti i prezzi a posto il verdetto verde torna a comparire', async () => {
    monta({ ricette: {}, ingredienti_costi: { burro: { costoKg: 7.2, costoG: 0.0072 } } })
    aggiungiIngrediente('burro', 100)
    // 100 g × 0,0072 = 0,72 € di food cost; 8 fette × 4 € = 32 € di ricavo.
    await waitFor(() => expect(screen.getByText('Sano')).toBeTruthy())
    expect(screen.queryByText(/senza prezzo/i)).toBeNull()
  })
})
