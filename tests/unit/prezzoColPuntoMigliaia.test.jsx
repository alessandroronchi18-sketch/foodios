// @vitest-environment happy-dom
//
// «1.250» nel campo del prezzo: il punto sono le migliaia, e lo diciamo.
//
// ═══ Il caso, deciso col titolare il 18/09/2026 ═════════════════════════
//
// Regola sua, netta: «di base il punto sono le migliaia, la virgola i
// decimali». Vale e vince: «1.250» fa milleduecentocinquanta.
//
// Ma c'è una forma, una sola, in cui l'altra lettura è altrettanto probabile:
// punto solo, niente virgola, esattamente tre cifre dopo. È come arriva un
// prezzo copiato da un gestionale scritto all'inglese, dove il punto è il
// decimale. E fra 1,25 €/kg e 1.250 €/kg ci sono **tre ordini di grandezza**.
//
// Perché è pericoloso e non è un dettaglio di tastiera: quel numero entra nel
// food cost di ogni ricetta che usa quella materia prima. Sbagliarlo di mille
// volte non si vede guardando la riga — si vede a fine mese nel margine,
// quando è tardi. È la stessa famiglia del prezzo che manca: un numero
// sbagliato che nessuno contesta.
//
// Quindi la pagina non indovina di nascosto e non blocca: legge all'italiana,
// **dice come ha letto**, e mette l'altra lettura a un clic.
//
// Il conto sta in `letturaPrezzoKg` (`src/lib/formatIt.js`), scritta insieme
// a questa schermata: qui si prova che la pagina la usa e che lo dice.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
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

const { default: MateriePrimeView, verificaNuovaMateriaPrima } =
  await import('../../src/views/MateriePrimeView.jsx')

const ricettario = {
  ricette: { r1: { nome: 'SACHER', ingredienti: [{ nome: 'zafferano', qty1stampo: 2 }] } },
  ingredienti_costi: { zafferano: { costoKg: 3000, costoG: 3 } },
}

const monta = (props = {}) => render(<MateriePrimeView
  ricettario={ricettario} logPrezzi={[]}
  onUpdatePrezzo={async () => {}} onCreaMateriaPrima={async () => ({ ok: true })}
  onRinominaMateriaPrima={async () => ({ ok: true })}
  onEliminaMateriaPrima={async () => ({ ok: true })}
  {...props} />)

/** Apre la riga in modifica e ci scrive dentro `testo`. */
const scrivi = async (v, testo) => {
  await waitFor(() => expect(v.container.textContent).toContain('zafferano'))
  fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Modifica'))
  const campo = await waitFor(() => v.getByLabelText('Prezzo per chilo di zafferano'))
  fireEvent.change(campo, { target: { value: testo } })
  return campo
}

beforeEach(() => { cleanup() })

describe('il punto sono le migliaia, e la pagina lo dichiara', () => {
  it('scrivendo «1.250» avverte che ha letto 1.250 €/kg', async () => {
    const v = monta()
    await scrivi(v, '1.250')
    await waitFor(() => expect(v.container.textContent).toMatch(/il punto sono le migliaia/))
    expect(v.container.textContent).toContain('1.250,00 €/kg')
  })

  it('e offre l’altra lettura, invece di lasciartela indovinare', async () => {
    const v = monta()
    await scrivi(v, '1.250')
    await waitFor(() => expect(v.container.textContent).toMatch(/il punto sono le migliaia/))
    expect(v.container.textContent).toContain('1,25 €/kg')
  })

  it('salvando, il prezzo che parte è quello all’italiana', async () => {
    const chiamate = []
    const v = monta({ onUpdatePrezzo: async (...a) => { chiamate.push(a) } })
    await scrivi(v, '1.250')
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Salva'))
    const finestra = await waitFor(() => v.container.querySelector('[role="dialog"]'))
    fireEvent.click([...finestra.querySelectorAll('button')].find(b => /Conferma e salva/.test(b.textContent)))
    await waitFor(() => expect(chiamate).toHaveLength(1))
    expect(chiamate[0][1]).toBe(1250)
  })

  it('con un clic si passa all’altra lettura, e parte quella', async () => {
    const chiamate = []
    const v = monta({ onUpdatePrezzo: async (...a) => { chiamate.push(a) } })
    await scrivi(v, '1.250')
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Salva'))
    const finestra = await waitFor(() => v.container.querySelector('[role="dialog"]'))
    const alternativa = [...finestra.querySelectorAll('button')].find(b => /No, intendevo/.test(b.textContent))
    expect(alternativa, 'la finestra non offre l’altra lettura').toBeTruthy()
    fireEvent.click(alternativa)
    await waitFor(() => expect(v.container.textContent).not.toMatch(/No, intendevo/))
    fireEvent.click([...v.container.querySelector('[role="dialog"]').querySelectorAll('button')]
      .find(b => /Conferma e salva/.test(b.textContent)))
    await waitFor(() => expect(chiamate).toHaveLength(1))
    expect(chiamate[0][1]).toBe(1.25)
  })
})

describe('dove non c’è dubbio, non si chiede niente', () => {
  const senzaDubbio = ['12,50', '380', '0.8825', '12.5', '1.250,50', '1,25']
  for (const testo of senzaDubbio) {
    it(`«${testo}» non fa comparire nessun avviso`, async () => {
      const v = monta()
      await scrivi(v, testo)
      await new Promise(r => setTimeout(r, 20))
      expect(v.container.textContent).not.toMatch(/il punto sono le migliaia/)
    })
  }

  it('«0.950» è novantacinque centesimi, non novecentocinquanta euro', async () => {
    // «Zeromila novecentocinquanta» non si scrive: è il prezzo della farina al
    // chilo, e leggerlo 950 €/kg sarebbe l'errore più caro di tutti.
    const v = monta()
    await scrivi(v, '0.950')
    await new Promise(r => setTimeout(r, 20))
    expect(v.container.textContent).not.toMatch(/il punto sono le migliaia/)
  })
})

describe('anche il modulo della materia prima nuova legge allo stesso modo', () => {
  it('«1.250» diventa 1250, non 1,25', () => {
    const esito = verificaNuovaMateriaPrima('zafferano nuovo', '1.250', new Set())
    // Sopra i 1.000 €/kg il modulo chiede comunque di ricontrollare — ed è
    // giusto: è il caso in cui l'errore da mille volte fa più danno. Quello
    // che conta qui è che NON l'abbia letto 1,25 accettandolo in silenzio.
    expect(esito.ok).toBe(false)
    expect(esito.errore).toMatch(/1\.000 € al chilo/)
  })

  it('e il prezzo copiato da una schermata, col simbolo attaccato, si rilegge', async () => {
    // «12,50 €» è come il prezzo è scritto ovunque in questo prodotto:
    // ricopiarlo da lì e incollarlo qui deve funzionare.
    const esito = verificaNuovaMateriaPrima('panna nuova', '12,50 €', new Set())
    expect(esito.ok).toBe(true)
    expect(esito.prezzoKg).toBe(12.5)
  })

  it('«12,5o» resta sbagliato: non diventa 12,50 di nascosto', () => {
    const esito = verificaNuovaMateriaPrima('panna nuova', '12,5o', new Set())
    expect(esito.ok).toBe(false)
  })
})
