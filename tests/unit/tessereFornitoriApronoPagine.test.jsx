// @vitest-environment happy-dom
// Le tre tessere in cima a Fornitori aprono tre schermate, non tre filtri.
//
// Segnalato dal titolare il 19/09/2026 aprendo la pagina vera: «Da pagare»,
// «Scadute» e «In scadenza» erano tre numeri fermi. Premendoli cambiava solo
// il filtro dell'elenco sotto e si restava esattamente dov'eri — l'unico
// segnale era una pillola che si accendeva mezzo schermo più giù. Parole sue:
// «non si devono aprire nella stessa pagina, deve essere un'altra».
//
// Qui si prova il comportamento: si preme la tessera e si guarda dove si
// finisce, e si guarda che le tre schermate siano davvero tre — con tre nomi
// diversi, tre contenuti diversi e una strada per tornare indietro. Col codice
// di prima la prima prova è rossa perché `onNavigate` non veniva mai chiamato,
// e la seconda perché la prop `pagina` non esisteva: qualunque valore le si
// passasse, si disegnava sempre la pagina principale con le sue tessere.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/supabase', async () => {
  const { supabaseFinto } = await import('./aiutoFornitori.jsx')
  return { supabase: supabaseFinto }
})
vi.mock('../../src/lib/storage', () => ({ sload: async () => null, ssave: async () => {} }))
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false }))

const { reset, fattura, SEDI_TRE } = await import('./aiutoFornitori.jsx')
const { default: Scadenzario } = await import('../../src/components/Scadenzario.jsx')

const FATTURE = [
  fattura({ id: 'f1', fornitore: 'Latteria Rossi', totale: 1200, fra: -30 }),
  fattura({ id: 'f2', fornitore: 'Latteria Rossi', totale: 800, fra: -3 }),
  fattura({ id: 'f3', fornitore: 'Zucchero Bianchi', totale: 500, fra: 4 }),
  fattura({ id: 'f4', fornitore: 'Cioccolato Verdi', totale: 2000, fra: 20 }),
  fattura({ id: 'f5', fornitore: 'Nocciole Neri', totale: 300, fra: 90 }),
]

const bottoni = (c) => [...c.querySelectorAll('button')]
const perTesto = (c, t) => bottoni(c).find(b => (b.textContent || '').includes(t))

async function monta(pagina = 'scadenzario', vai = vi.fn()) {
  const r = render(
    <Scadenzario orgId="org-1" sedeId="s1" sedi={SEDI_TRE} pagina={pagina} onNavigate={vai} />
  )
  // Si aspetta che le fatture siano davvero arrivate: prima, la pagina dice
  // «Caricamento…» e misurare lì dentro vuol dire misurare il vuoto.
  await waitFor(() => { expect(r.container.textContent).not.toMatch(/Caricamento/) }, { timeout: 4000 })
  return { ...r, vai }
}

beforeEach(() => reset({ fatture: FATTURE.map(f => ({ ...f })), fornitori: [] }))
afterEach(() => cleanup())

describe('le tre tessere portano altrove', () => {
  it('«Da pagare» apre la pagina di tutte le fatture aperte', async () => {
    const { container, vai } = await monta()
    const t = perTesto(container, 'Da pagare')
    expect(t, 'la tessera «Da pagare» non c\'è più').toBeTruthy()
    act(() => { fireEvent.click(t) })
    expect(vai).toHaveBeenCalledWith('fatture-da-pagare')
  })

  it('«Scadute» e «In scadenza» aprono due pagine DIVERSE fra loro', async () => {
    const { container, vai } = await monta()
    act(() => { fireEvent.click(perTesto(container, 'Scadute')) })
    act(() => { fireEvent.click(perTesto(container, 'In scadenza')) })
    const dove = vai.mock.calls.map(c => c[0])
    expect(dove).toEqual(['fatture-scadute', 'fatture-in-scadenza'])
    expect(new Set(dove).size, 'le due tessere portano nello stesso posto').toBe(2)
  })

  it('e le tessere sono premibili col dito, non scritte morte', async () => {
    const { container } = await monta()
    for (const nome of ['Da pagare', 'Scadute', 'In scadenza']) {
      const t = perTesto(container, nome)
      expect(t.tagName, `«${nome}» non è un pulsante`).toBe('BUTTON')
      expect(t.getAttribute('aria-label') || '', `«${nome}» non dice che apre qualcosa`).toMatch(/Apri/)
    }
  })
})

describe('le tre schermate sono tre, e ognuna ha il suo nome e il suo ritorno', () => {
  const ATTESI = {
    'fatture-da-pagare': 'Da pagare',
    'fatture-scadute': 'Scadute',
    'fatture-in-scadenza': 'In scadenza',
  }

  it('ognuna scrive il proprio titolo in cima', async () => {
    const visti = []
    for (const [vista, titolo] of Object.entries(ATTESI)) {
      const { container } = await monta(vista)
      const h = container.querySelector('h2')
      expect(h, `«${vista}» non ha un titolo`).toBeTruthy()
      expect(h.textContent.trim()).toBe(titolo)
      visti.push(h.textContent.trim())
      cleanup()
    }
    expect(new Set(visti).size, 'due schermate con lo stesso titolo').toBe(3)
  })

  it('e NON è la stessa pagina filtrata: le tessere non ci sono più', async () => {
    const { container } = await monta('fatture-scadute')
    // Sulla pagina principale le tessere sono pulsanti con aria-label «Apri…».
    const tessere = bottoni(container).filter(b => /^Apri l/.test(b.getAttribute('aria-label') || ''))
    expect(tessere.length, 'la schermata mostra ancora le tessere della pagina di prima').toBe(0)
  })

  it('c\'è sempre il modo di tornare indietro, e torna a Fornitori', async () => {
    for (const vista of Object.keys(ATTESI)) {
      const { container, vai } = await monta(vista)
      const indietro = bottoni(container).find(b => (b.getAttribute('aria-label') || '') === 'Torna a Fornitori')
      expect(indietro, `«${vista}» non ha il ritorno`).toBeTruthy()
      act(() => { fireEvent.click(indietro) })
      expect(vai).toHaveBeenCalledWith('scadenzario')
      cleanup()
    }
  })

  it('ognuna elenca le SUE fatture, non quelle delle altre', async () => {
    const scadute = await monta('fatture-scadute')
    // f1 e f2 sono scadute, f3 scade fra 4 giorni, f5 fra 90.
    expect(scadute.container.textContent).toContain('FT-f1')
    expect(scadute.container.textContent).toContain('FT-f2')
    expect(scadute.container.textContent, 'in «Scadute» compare una fattura non scaduta').not.toContain('FT-f3')
    expect(scadute.container.textContent).not.toContain('FT-f5')
    cleanup()

    const settimana = await monta('fatture-in-scadenza')
    expect(settimana.container.textContent).toContain('FT-f3')
    expect(settimana.container.textContent, 'in «In scadenza» compare una scaduta').not.toContain('FT-f1')
    expect(settimana.container.textContent).not.toContain('FT-f5')
    cleanup()

    const tutte = await monta('fatture-da-pagare')
    for (const n of ['FT-f1', 'FT-f2', 'FT-f3', 'FT-f4', 'FT-f5']) {
      expect(tutte.container.textContent, `«Da pagare» dimentica ${n}`).toContain(n)
    }
  })

  it('e quando non c\'è niente da mostrare lo dice, invece di restare bianca', async () => {
    reset({ fatture: [fattura({ id: 'x1', fornitore: 'Tale', fra: 90 })], fornitori: [] })
    const { container } = await monta('fatture-scadute')
    expect(container.textContent).toMatch(/Nessuna fattura scaduta/i)
  })
})
