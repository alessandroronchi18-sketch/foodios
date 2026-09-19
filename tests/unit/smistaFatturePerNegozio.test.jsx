// @vitest-environment happy-dom
// Le fatture senza punto vendita si smistano fra i negozi, non finiscono
// tutte nello stesso.
//
// Segnalato dal titolare il 19/09/2026: l'avviso «24 fatture senza punto
// vendita» aveva un solo comando, «Assegna tutte le 24 a…», che mandava in
// blocco a una sede sola quello che è di tre. Parole sue: «un tot a un punto
// vendita, un tot a un altro».
//
// Perché conta: il Confronto sedi raggruppa per negozio, quindi una fattura
// con la sede vuota non entra nel conto di nessuno. Sui dati veri erano 142
// fatture per 189.458 € invisibili. Mandarle tutte a Carlina «per farle
// sparire dall'avviso» non le rende visibili: le rende sbagliate.
//
// Col codice di prima queste prove sono rosse due volte: la pagina di
// smistamento non esisteva (il pulsante apriva una tendina lì dentro), e
// l'unica scrittura possibile era un `update` con TUTTI gli id insieme.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/supabase', async () => {
  const { supabaseFinto } = await import('./aiutoFornitori.jsx')
  return { supabase: supabaseFinto }
})
vi.mock('../../src/lib/storage', () => ({ sload: async () => null, ssave: async () => {} }))
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false }))

const { reset, stato, fattura, SEDI_TRE } = await import('./aiutoFornitori.jsx')
const { default: Scadenzario } = await import('../../src/components/Scadenzario.jsx')

const SENZA_SEDE = [
  fattura({ id: 'a1', fornitore: 'Latteria Rossi', totale: 1000, fra: 10 }),
  fattura({ id: 'a2', fornitore: 'Zucchero Bianchi', totale: 500, fra: 12 }),
  fattura({ id: 'a3', fornitore: 'Cioccolato Verdi', totale: 700, fra: 15 }),
  fattura({ id: 'a4', fornitore: 'Nocciole Neri', totale: 300, fra: 20 }),
]

const bottoni = (c) => [...c.querySelectorAll('button')]
const tendine = (c) => [...c.querySelectorAll('select')]

// Il selettore globale della sede è su «tutte le sedi» (sedeId null): è la
// condizione in cui le fatture senza negozio si vedono tutte.
async function monta(pagina = 'scadenzario', vai = vi.fn()) {
  const r = render(
    <Scadenzario orgId="org-1" sedeId={null} sedi={SEDI_TRE} pagina={pagina} onNavigate={vai} />
  )
  // Si aspetta che le fatture siano davvero arrivate: prima, la pagina dice
  // «Caricamento…» e misurare lì dentro vuol dire misurare il vuoto.
  await waitFor(() => { expect(r.container.textContent).not.toMatch(/Caricamento/) }, { timeout: 4000 })
  return { ...r, vai }
}

beforeEach(() => reset({ fatture: SENZA_SEDE.map(f => ({ ...f })), fornitori: [] }))
afterEach(() => cleanup())

describe('l\'avviso è solo un avviso: lo smistamento è una pagina a parte', () => {
  it('dice quante sono e quanto valgono, e porta alla pagina', async () => {
    const { container, vai } = await monta()
    expect(container.textContent).toMatch(/4 fatture senza punto vendita/)
    const b = bottoni(container).find(x => /Smistale fra i negozi/.test(x.textContent || ''))
    expect(b, 'non c\'è il pulsante per smistarle').toBeTruthy()
    act(() => { fireEvent.click(b) })
    expect(vai).toHaveBeenCalledWith('fatture-senza-sede')
  })

  it('e nell\'avviso NON c\'è più il comando che le manda tutte a una sede sola', async () => {
    const { container } = await monta()
    expect(bottoni(container).some(b => /Assegna tutte/i.test(b.textContent || '')),
      'l\'avviso assegna ancora tutto in blocco a un negozio').toBe(false)
  })
})

describe('nella pagina di smistamento le fatture si dividono davvero', () => {
  it('le elenca tutte, con una scelta di negozio su ogni riga', async () => {
    const { container } = await monta('fatture-senza-sede')
    for (const n of ['FT-a1', 'FT-a2', 'FT-a3', 'FT-a4']) {
      expect(container.textContent, `manca ${n}`).toContain(n)
    }
    // Una tendina per riga, più quella della selezione multipla.
    const perRiga = tendine(container).filter(s => /Manda a/.test(s.textContent || ''))
    expect(perRiga.length, 'non c\'è una scelta per riga').toBe(4)
    for (const s of perRiga) {
      const opzioni = [...s.querySelectorAll('option')].map(o => o.textContent)
      expect(opzioni).toContain('Carlina')
      expect(opzioni).toContain('Berthollet')
      expect(opzioni).toContain('De Gasperi')
    }
  })

  it('la scelta su una riga tocca SOLO quella fattura', async () => {
    const { container } = await monta('fatture-senza-sede')
    const perRiga = tendine(container).filter(s => /Manda a/.test(s.textContent || ''))
    await act(async () => { fireEvent.change(perRiga[0], { target: { value: 's2' } }) })
    const scritte = stato.scritture.filter(s => s.tabella === 'fatture' && s.azione === 'update')
    expect(scritte.length, 'nessuna scrittura').toBe(1)
    expect(scritte[0].valori).toEqual({ sede_id: 's2' })
    const ids = scritte[0].filtri.find(([op, col]) => op === 'in' && col === 'id')[2]
    expect(ids, 'la scelta di una riga ha toccato anche le altre').toEqual(['a1'])
  })

  it('e due righe possono andare a due negozi diversi', async () => {
    const { container } = await monta('fatture-senza-sede')
    let perRiga = tendine(container).filter(s => /Manda a/.test(s.textContent || ''))
    await act(async () => { fireEvent.change(perRiga[0], { target: { value: 's2' } }) })
    await waitFor(() => expect(tendine(container).filter(s => /Manda a/.test(s.textContent || '')).length).toBe(3))
    perRiga = tendine(container).filter(s => /Manda a/.test(s.textContent || ''))
    await act(async () => { fireEvent.change(perRiga[0], { target: { value: 's3' } }) })
    const scritte = stato.scritture.filter(s => s.tabella === 'fatture')
    expect(scritte.map(s => s.valori.sede_id), 'le due righe sono finite nello stesso negozio')
      .toEqual(['s2', 's3'])
    expect(stato.fatture.find(f => f.id === 'a1').sede_id).toBe('s2')
    expect(stato.fatture.find(f => f.id === 'a2').sede_id).toBe('s3')
    expect(stato.fatture.find(f => f.id === 'a3').sede_id, 'una fattura non toccata ha cambiato negozio').toBe(null)
  })

  it('la selezione multipla assegna solo le spuntate', async () => {
    const { container } = await monta('fatture-senza-sede')
    const spunte = [...container.querySelectorAll('input[type="checkbox"]')]
    expect(spunte.length, 'non ci sono le caselle di spunta').toBe(4)
    act(() => { fireEvent.click(spunte[1]) })
    act(() => { fireEvent.click(spunte[2]) })
    const scelta = tendine(container).find(s => /Scegli il punto vendita/.test(s.textContent || ''))
    expect(scelta, 'manca la scelta del negozio per le spuntate').toBeTruthy()
    act(() => { fireEvent.change(scelta, { target: { value: 's3' } }) })
    const assegna = bottoni(container).find(b => /Assegna le 2 spuntate/.test(b.textContent || ''))
    expect(assegna, 'il pulsante non dice quante ne assegna').toBeTruthy()
    await act(async () => { fireEvent.click(assegna) })
    const scritte = stato.scritture.filter(s => s.tabella === 'fatture')
    expect(scritte.length).toBe(1)
    const ids = scritte[0].filtri.find(([op, col]) => op === 'in' && col === 'id')[2]
    expect(ids.sort()).toEqual(['a2', 'a3'])
    expect(stato.fatture.find(f => f.id === 'a1').sede_id, 'una fattura non spuntata è stata assegnata').toBe(null)
  })

  it('senza aver scelto il negozio il pulsante non parte', async () => {
    const { container } = await monta('fatture-senza-sede')
    const spunte = [...container.querySelectorAll('input[type="checkbox"]')]
    act(() => { fireEvent.click(spunte[0]) })
    const assegna = bottoni(container).find(b => /Assegna le 1 spuntata|Assegna le 1 spuntate/.test(b.textContent || ''))
    expect(assegna.disabled, 'si può assegnare senza dire a quale negozio').toBe(true)
  })

  it('quando non resta niente da smistare lo dice, e si può tornare indietro', async () => {
    reset({ fatture: [fattura({ id: 'b1', fornitore: 'Tale', fra: 10, sede: 's1' })], fornitori: [] })
    const { container } = await monta('fatture-senza-sede')
    expect(container.textContent).toMatch(/Tutte le fatture hanno il loro punto vendita/i)
    expect(bottoni(container).some(b => (b.getAttribute('aria-label') || '') === 'Torna a Fornitori')).toBe(true)
  })
})
