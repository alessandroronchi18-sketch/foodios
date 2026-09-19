// @vitest-environment happy-dom
//
// ── Le due porte sullo stesso dato si comportano uguale ───────────────────
//
// Il prezzo di una materia prima si scrive in due punti del prodotto: nella
// pagina «Materie prime» e nella finestra che si apre da «Nuovo gusto» quando
// l'ingrediente non ha ancora un prezzo. Sono la stessa cosa scritta da due
// porte diverse, e ogni volta che una delle due è rimasta indietro è nato un
// difetto: il 18/09 una accettava «12,5o» come 12,50 e l'altra lo rifiutava.
//
// Il 19/09 la differenza era su «1.250». In italiano il punto sono le migliaia
// — regola data dal titolare — quindi si legge milleduecentocinquanta; ma è
// anche il decimale di chi copia da un gestionale inglese, e i due numeri
// stanno mille volte uno dall'altro. «Materie prime» lo diceva, «Nuovo gusto»
// sceglieva in silenzio.
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NuovaRicettaView from '../../src/views/NuovaRicettaView.jsx'

const RICETTARIO = {
  ingredienti_costi: { panna: { costoKg: 4.7, costoG: 0.0047 } },
  ricette: {
    'FIOR DI LATTE': { nome: 'FIOR DI LATTE', tipo: 'gusto', unita: 1, prezzo: 0,
      ingredienti: [{ nome: 'panna', qty1stampo: 500 }] },
  },
}

/** Apre la finestra del prezzo scrivendo un ingrediente che non esiste. */
function apriFinestraPrezzo(salvati = []) {
  const utils = render(
    <NuovaRicettaView ricettario={RICETTARIO} notify={() => {}}
      onSave={async (r) => { salvati.push(r) }} editingRicetta={null}
      onEditConsumed={() => {}} tipoAttivita="gelateria" />
  )
  fireEvent.change(utils.getByLabelText('Nome ingrediente da aggiungere'), { target: { value: 'Farcitura segreta zz' } })
  fireEvent.change(utils.getByLabelText('Grammi di ingrediente da aggiungere'), { target: { value: '100' } })
  fireEvent.click(utils.getByLabelText('Aggiungi ingrediente alla ricetta'))
  return utils
}

describe('Anche in «Nuovo gusto» il punto sono le migliaia, e si dichiara', () => {
  it('scrivendo 1.250 la finestra dice come ha letto', () => {
    const utils = apriFinestraPrezzo()
    fireEvent.change(utils.getByLabelText('Prezzo al chilo in euro'), { target: { value: '1.250' } })
    expect(utils.getByText(/il punto sono le migliaia/i)).toBeTruthy()
  })

  it('e propone l’altra lettura, che sta mille volte più in basso', () => {
    const utils = apriFinestraPrezzo()
    fireEvent.change(utils.getByLabelText('Prezzo al chilo in euro'), { target: { value: '1.250' } })
    const avviso = utils.getByText(/il punto sono le migliaia/i).closest('div')
    expect(avviso.textContent).toContain('1.250,00')
    expect(avviso.textContent).toContain('1,25')
  })

  it('su un prezzo normale non dice niente: sarebbe rumore', () => {
    const utils = apriFinestraPrezzo()
    fireEvent.change(utils.getByLabelText('Prezzo al chilo in euro'), { target: { value: '8,50' } })
    expect(utils.queryByText(/il punto sono le migliaia/i)).toBeNull()
  })

  it('e «0.950» non è ambiguo: è la farina a novantacinque centesimi', () => {
    // Con lo zero davanti le migliaia non si scrivono, quindi il punto è per
    // forza un decimale. Sbagliarlo moltiplicherebbe per mille l'ingrediente
    // più usato di una pasticceria.
    const utils = apriFinestraPrezzo()
    fireEvent.change(utils.getByLabelText('Prezzo al chilo in euro'), { target: { value: '0.950' } })
    expect(utils.queryByText(/il punto sono le migliaia/i)).toBeNull()
  })

  it('e il prezzo che si salva è quello letto all’italiana', async () => {
    const salvati = []
    const utils = apriFinestraPrezzo(salvati)
    fireEvent.change(utils.getByLabelText('Prezzo al chilo in euro'), { target: { value: '1.250' } })
    fireEvent.click(utils.getByRole('button', { name: /salva prezzo/i }))
    await new Promise(r => setTimeout(r, 0))
    const voce = salvati[salvati.length - 1]?.ingredienti_costi?.['farcitura segreta zz']
    expect(voce?.costoKg).toBe(1250)
  })
})
