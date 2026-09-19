// @vitest-environment happy-dom
// L'avviso dell'IBAN è due righe, e gli IBAN si scrivono tutti di fila.
//
// Segnalato dal titolare il 19/09/2026: «Il bonifico automatico non può
// partire: manca l'IBAN a 38 fornitori» occupava un riquadro intero, con
// dentro i primi cinque fornitori e cinque pulsanti «Scrivi l'IBAN». Ognuno di
// quei pulsanti portava via dalla pagina, sulla vista per fornitore, aperta
// sulla scheda di quello solo: per scriverne 38 bisognava uscire e rientrare
// 38 volte. Parole sue: «deve diventare una o due righe con un pulsante, e il
// pulsante porta a una pagina dove quei 38 IBAN si scrivono uno dopo l'altro
// senza uscire e rientrare».
//
// Perché conta: sui dati veri ZERO fatture su 3.520 portano un IBAN, e in
// anagrafica ce l'ha 1 fornitore su 615. Il bonifico SEPA è la funzione che
// dovrebbe far risparmiare più tempo di tutte, e non può partire per nessuno.
//
// Col codice di prima: la prima prova è rossa perché i pulsanti «Scrivi
// l'IBAN» erano cinque, la seconda perché la pagina non esisteva.

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

const IBAN_BUONO = 'IT60X0542811101000000123456'
const IBAN_BUONO_2 = 'IT40S0542811101000000123456'

// Sei fornitori senza IBAN, in ordine di peso: serve a provare anche che
// l'elenco non venga tagliato a cinque come faceva il riquadro di prima.
const FATTURE = [
  fattura({ id: 'i1', fornitore: 'Latteria Rossi', totale: 6000, fra: 10 }),
  fattura({ id: 'i2', fornitore: 'Zucchero Bianchi', totale: 5000, fra: 12 }),
  fattura({ id: 'i3', fornitore: 'Cioccolato Verdi', totale: 4000, fra: 14 }),
  fattura({ id: 'i4', fornitore: 'Nocciole Neri', totale: 3000, fra: 16 }),
  fattura({ id: 'i5', fornitore: 'Farina Gialli', totale: 2000, fra: 18 }),
  fattura({ id: 'i6', fornitore: 'Panna Blu', totale: 1000, fra: 20 }),
]

const bottoni = (c) => [...c.querySelectorAll('button')]
const campiIban = (c) => [...c.querySelectorAll('input')].filter(i => /^IBAN di /.test(i.getAttribute('aria-label') || ''))

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

describe('in cima alla pagina l\'avviso è corto', () => {
  it('dice il problema e porta alla pagina, con UN pulsante solo', async () => {
    const { container, vai } = await monta()
    expect(container.textContent).toMatch(/manca l'IBAN a 6 fornitori/)
    const scrivi = bottoni(container).filter(b => /Scrivi gli IBAN/.test(b.textContent || ''))
    expect(scrivi.length, 'i pulsanti per scrivere gli IBAN non sono uno solo').toBe(1)
    act(() => { fireEvent.click(scrivi[0]) })
    expect(vai).toHaveBeenCalledWith('fornitori-senza-iban')
  })

  it('e non elenca più i fornitori uno per uno dentro l\'avviso', async () => {
    const { container } = await monta()
    // Prima l'avviso portava dentro i primi cinque nomi con un pulsante
    // ciascuno. Se ricompaiono, il riquadro è tornato grande.
    expect(bottoni(container).filter(b => /Scrivi l'IBAN/.test(b.textContent || '')).length).toBe(0)
  })
})

describe('la pagina degli IBAN si scrive tutta di fila', () => {
  it('elenca TUTTI i fornitori da fare, non i primi cinque', async () => {
    const { container } = await monta('fornitori-senza-iban')
    expect(campiIban(container).length, 'l\'elenco è troncato').toBe(6)
    expect(container.textContent).toContain('Panna Blu')
  })

  it('sono in ordine di quanto pesano: chi deve di più sta in cima', async () => {
    const { container } = await monta('fornitori-senza-iban')
    const nomi = campiIban(container).map(i => i.getAttribute('aria-label').replace('IBAN di ', ''))
    expect(nomi).toEqual([
      'Latteria Rossi', 'Zucchero Bianchi', 'Cioccolato Verdi',
      'Nocciole Neri', 'Farina Gialli', 'Panna Blu',
    ])
  })

  it('scritto un IBAN e premuto invio, si salva e il cursore va sul successivo', async () => {
    const { container } = await monta('fornitori-senza-iban')
    const campi = campiIban(container)
    act(() => { fireEvent.change(campi[0], { target: { value: IBAN_BUONO } }) })
    await act(async () => { fireEvent.keyDown(campi[0], { key: 'Enter' }) })

    const scritte = stato.scritture.filter(s => s.tabella === 'fornitori')
    expect(scritte.length, 'l\'IBAN non è stato salvato').toBe(1)
    expect(scritte[0].valori.iban).toBe(IBAN_BUONO)
    expect(scritte[0].valori.nome).toBe('Latteria Rossi')
    // È questa la parte che evita di uscire e rientrare: il fuoco passa da
    // solo al campo dopo.
    expect(document.activeElement, 'il cursore non è passato al fornitore successivo')
      .toBe(campiIban(container)[1])
  })

  it('la riga salvata resta al suo posto, segnata come fatta', async () => {
    const { container } = await monta('fornitori-senza-iban')
    act(() => { fireEvent.change(campiIban(container)[0], { target: { value: IBAN_BUONO } }) })
    await act(async () => { fireEvent.keyDown(campiIban(container)[0], { key: 'Enter' }) })
    await waitFor(() => expect(container.textContent).toMatch(/Salvato/))
    // Se l'elenco non fosse congelato, la riga salvata sparirebbe e le altre
    // salirebbero di un posto: si scriverebbe l'IBAN del fornitore sbagliato.
    const nomi = campiIban(container).map(i => i.getAttribute('aria-label').replace('IBAN di ', ''))
    expect(nomi[0], 'la riga salvata è sparita e le altre sono salite').toBe('Latteria Rossi')
    expect(nomi.length).toBe(6)
    expect(container.textContent).toMatch(/1<\/b> di 6 fatti|1 di 6 fatti/)
  })

  it('due IBAN di fila finiscono sui due fornitori giusti', async () => {
    const { container } = await monta('fornitori-senza-iban')
    act(() => { fireEvent.change(campiIban(container)[0], { target: { value: IBAN_BUONO } }) })
    await act(async () => { fireEvent.keyDown(campiIban(container)[0], { key: 'Enter' }) })
    act(() => { fireEvent.change(campiIban(container)[1], { target: { value: IBAN_BUONO_2 } }) })
    await act(async () => { fireEvent.keyDown(campiIban(container)[1], { key: 'Enter' }) })
    const scritte = stato.scritture.filter(s => s.tabella === 'fornitori')
    expect(scritte.map(s => [s.valori.nome, s.valori.iban])).toEqual([
      ['Latteria Rossi', IBAN_BUONO],
      ['Zucchero Bianchi', IBAN_BUONO_2],
    ])
  })

  it('un IBAN sbagliato non si salva: il pulsante resta spento', async () => {
    const { container } = await monta('fornitori-senza-iban')
    const campo = campiIban(container)[0]
    act(() => { fireEvent.change(campo, { target: { value: 'IT00 NON VALIDO 123' } }) })
    const salva = bottoni(container).filter(b => /^(Salva|Salvato|Salvo…)/.test((b.textContent || '').trim()))
    expect(salva[0].disabled, 'si può salvare un IBAN che non esiste').toBe(true)
    await act(async () => { fireEvent.keyDown(campo, { key: 'Enter' }) })
    expect(stato.scritture.filter(s => s.tabella === 'fornitori').length).toBe(0)
  })

  it('c\'è il ritorno a Fornitori', async () => {
    const { container, vai } = await monta('fornitori-senza-iban')
    const indietro = bottoni(container).find(b => (b.getAttribute('aria-label') || '') === 'Torna a Fornitori')
    expect(indietro).toBeTruthy()
    act(() => { fireEvent.click(indietro) })
    expect(vai).toHaveBeenCalledWith('scadenzario')
  })

  it('e quando gli IBAN ci sono tutti la pagina lo dice invece di restare vuota', async () => {
    reset({
      fatture: [fattura({ id: 'z1', fornitore: 'Tale', fra: 10, iban: IBAN_BUONO })],
      fornitori: [],
    })
    const { container } = await monta('fornitori-senza-iban')
    expect(container.textContent).toMatch(/hanno il loro IBAN|Nessun IBAN da scrivere/i)
  })
})
