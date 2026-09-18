// @vitest-environment happy-dom
//
// Materie prime sul telefono: il prezzo si deve poter cambiare.
//
// Il difetto, trovato il 18/09/2026 trasferendo la scheda «Prezzi
// ingredienti» dal Magazzino alla sua pagina. Su schermo stretto la tabella
// diventa una scheda per riga (`TabellaOSchede`): nella scheda c'era il
// pulsante «Modifica», e toccandolo non succedeva niente. Il campo per
// scrivere il prezzo veniva disegnato solo dentro la tabella del computer, e
// quel ramo sul telefono non viene mai eseguito.
//
// Come riprodurlo sul codice di prima: aprire il Magazzino con la finestra
// stretta, scheda «Prezzi ingredienti», toccare «Modifica» su una riga.
// Niente campo, niente finestra di conferma, niente messaggio.
//
// Sul telefono sono anche i pulsanti a contare: quelli sotto il dito devono
// stare sopra i 44px, altrimenti si sbaglia riga.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/useIsMobile', () => ({ default: () => true, useIsTablet: () => false }))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))

const { default: MateriePrimeView } = await import('../../src/views/MateriePrimeView.jsx')

const ricettario = {
  ricette: { r1: { nome: 'SACHER', tipo: 'torta', ingredienti: [{ nome: 'burro', qty1stampo: 300 }] } },
  ingredienti_costi: { burro: { costoKg: 8.4, costoG: 0.0084 } },
}

beforeEach(() => { cleanup() })

describe('materie prime sul telefono', () => {
  it('il pulsante «Modifica» apre davvero il campo del prezzo', async () => {
    const v = render(<MateriePrimeView ricettario={ricettario} logPrezzi={[]} onUpdatePrezzo={async () => {}} />)
    await waitFor(() => expect(v.container.textContent).toContain('burro'))
    // Nella scheda non c'è la tabella: il campo non esiste finché non si tocca.
    expect(v.queryByLabelText('Prezzo per chilo di burro')).toBeNull()
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Modifica/.test(b.textContent)))
    const campo = await waitFor(() => v.getByLabelText('Prezzo per chilo di burro'))
    expect(campo).toBeTruthy()
  })

  it('e da lì si arriva alla conferma e al salvataggio', async () => {
    const chiamate = []
    const v = render(<MateriePrimeView ricettario={ricettario} logPrezzi={[]} onUpdatePrezzo={async (...a) => { chiamate.push(a) }} />)
    await waitFor(() => expect(v.container.textContent).toContain('burro'))
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Modifica/.test(b.textContent)))
    const campo = await waitFor(() => v.getByLabelText('Prezzo per chilo di burro'))
    fireEvent.change(campo, { target: { value: '9,50' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    const conferma = await waitFor(() => {
      const b = [...v.container.querySelectorAll('button')].find(x => /Conferma e salva/.test(x.textContent))
      expect(b).toBeTruthy(); return b
    })
    fireEvent.click(conferma)
    await waitFor(() => expect(chiamate).toHaveLength(1))
    expect(chiamate[0][0]).toBe('burro')
    expect(chiamate[0][1]).toBe(9.5)
  })

  it('i pulsanti sotto il dito stanno sopra i 44px', async () => {
    const v = render(<MateriePrimeView ricettario={ricettario} logPrezzi={[]} onUpdatePrezzo={async () => {}} />)
    await waitFor(() => expect(v.container.textContent).toContain('burro'))
    const piccoli = [...v.container.querySelectorAll('button')]
      .map(b => ({ testo: b.textContent.trim(), h: parseInt(b.style.minHeight || '0', 10) }))
      .filter(b => b.testo && b.h > 0 && b.h < 44)
    expect(piccoli, 'pulsanti sotto la soglia del dito').toEqual([])
  })

  it('i riquadri in cima stanno su due colonne, non su quattro', async () => {
    const v = render(<MateriePrimeView ricettario={ricettario} logPrezzi={[]} onUpdatePrezzo={async () => {}} />)
    await waitFor(() => expect(v.container.textContent).toContain('Materie prime'))
    const griglia = [...v.container.querySelectorAll('div')]
      .find(d => d.style.display === 'grid' && /1fr 1fr|repeat/.test(d.style.gridTemplateColumns))
    expect(griglia.style.gridTemplateColumns).toBe('1fr 1fr')
  })
})
