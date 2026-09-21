// @vitest-environment happy-dom
//
// ── Nella pagina Fornitori si entra anche senza mouse ────────────────────
//
// Misurato il 21/09/2026 su `src/components/Scadenzario.jsx`: cinque comandi
// erano `<div onClick>`, cioè rettangoli che sentono il clic e basta.
//
//   • il **nome del fornitore**, che apre e chiude l'elenco delle sue
//     fatture. Un comando vero, usato tutti i giorni: con Tab non lo si
//     raggiungeva, e un lettore di schermo non aveva modo di sapere né che si
//     potesse premere né se la riga fosse aperta o chiusa;
//   • i **veli di quattro finestre** — IBAN identico, «eliminare tutte le
//     fatture?», bonifico SEPA, «di quale negozio sono queste fatture?». Il
//     velo è la parte scura intorno al riquadro: si clicca e la finestra si
//     chiude. Con la tastiera, invece, la finestra si apriva e non c'era
//     nessun modo di chiuderla che non fosse premere il pulsante giusto —
//     e nella finestra dell'IBAN non ce n'era nessuno.
//
// La correzione è la stessa già usata in `Personale.jsx`: il velo diventa un
// `<button>` con un nome, la finestra si chiude anche con Esc, e il riquadro
// dichiara di essere una finestra (`role="dialog"`).
//
// ── Come queste prove diventano rosse sul codice di prima ───────────────
//
// Non guardano che «esista un pulsante»: guardano **quale elemento** porta il
// comando. `tagName === 'BUTTON'` sul nome del fornitore era `DIV` prima, e
// `aria-label="Chiudi la finestra"` non esisteva proprio. Rimettendo i `<div
// onClick>` tornano rosse tutte e sette.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('../../src/lib/supabase', async () => {
  const { supabaseFinto } = await import('./aiutoFornitori.jsx')
  return { supabase: supabaseFinto }
})
vi.mock('../../src/lib/storage', () => ({ sload: async () => null, ssave: async () => {} }))
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false }))

const { reset, fattura, SEDI_TRE } = await import('./aiutoFornitori.jsx')
const { default: Scadenzario } = await import('../../src/components/Scadenzario.jsx')

const FATTURE = [
  fattura({ id: 'r1', fornitore: 'Latteria Rossi', totale: 1200, fra: -30, numero: 'FT-901' }),
  fattura({ id: 'r2', fornitore: 'Latteria Rossi', totale: 800, fra: 20, numero: 'FT-902' }),
  fattura({ id: 'b1', fornitore: 'Zucchero Bianchi', totale: 500, fra: 20, numero: 'FT-903' }),
]

const bottoni = (c) => [...c.querySelectorAll('button')]
const perEtichetta = (c, re) => bottoni(c).find(b => re.test(b.getAttribute('aria-label') || ''))
const perTesto = (c, re) => bottoni(c).find(b => re.test(b.textContent || ''))

async function montaPerFornitore() {
  const r = render(<Scadenzario orgId="org-1" sedeId="s1" sedi={SEDI_TRE} pagina="scadenzario" onNavigate={() => {}} />)
  await waitFor(() => { expect(r.container.textContent).toMatch(/Per fornitore/) }, { timeout: 4000 })
  const passa = perEtichetta(r.container, /^Vista Per fornitore$/)
  expect(passa, 'non c\'è più la vista «Per fornitore»').toBeTruthy()
  act(() => { fireEvent.click(passa) })
  await waitFor(() => { expect(r.container.querySelectorAll('[data-colonne-fornitore]').length).toBeGreaterThan(0) }, { timeout: 4000 })
  return r
}

beforeEach(() => reset({ fatture: FATTURE.map(f => ({ ...f })), fornitori: [] }))
afterEach(() => cleanup())

describe('Il nome del fornitore apre le sue fatture, ed è un comando vero', () => {
  it('è un pulsante, non un rettangolo che sente il clic', async () => {
    const { container } = await montaPerFornitore()
    const apre = perEtichetta(container, /Latteria Rossi: (mostra|nascondi) tutte le fatture/)
    expect(apre, 'il nome del fornitore non è un comando raggiungibile').toBeTruthy()
    expect(apre.tagName).toBe('BUTTON')
    // `type="button"` e non il difetto storico di React: dentro un form un
    // pulsante senza tipo invia il modulo.
    expect(apre.getAttribute('type')).toBe('button')
  })

  it('dice se la riga è aperta o chiusa', async () => {
    const { container } = await montaPerFornitore()
    const apre = perEtichetta(container, /Latteria Rossi: mostra tutte le fatture/)
    expect(apre.getAttribute('aria-expanded')).toBe('false')
    act(() => { fireEvent.click(apre) })
    await waitFor(() => {
      const ora = perEtichetta(container, /Latteria Rossi: nascondi tutte le fatture/)
      expect(ora, 'dopo il clic l\'etichetta non è cambiata').toBeTruthy()
      expect(ora.getAttribute('aria-expanded')).toBe('true')
    })
  })

  it('e premendolo compaiono davvero i numeri delle fatture', async () => {
    // Senza questa, le due prove sopra proverebbero solo che un attributo
    // cambia: il comando deve fare la cosa per cui esiste.
    const { container } = await montaPerFornitore()
    expect(container.textContent).not.toMatch(/FT-901/)
    act(() => { fireEvent.click(perEtichetta(container, /Latteria Rossi: mostra tutte le fatture/)) })
    await waitFor(() => { expect(container.textContent).toMatch(/FT-901/) })
    expect(container.textContent).toMatch(/FT-902/)
  })

  it('e non si porta dietro il clic della casella SEPA', async () => {
    // La casella per il bonifico sta dentro la stessa riga: premere il nome
    // non deve selezionare il fornitore per il bonifico.
    const { container } = await montaPerFornitore()
    const prima = [...container.querySelectorAll('input[type=checkbox]')].filter(c => c.checked).length
    act(() => { fireEvent.click(perEtichetta(container, /Latteria Rossi: mostra tutte le fatture/)) })
    await waitFor(() => { expect(container.textContent).toMatch(/FT-901/) })
    const dopo = [...container.querySelectorAll('input[type=checkbox]')].filter(c => c.checked).length
    expect(dopo, 'aprire le fatture ha selezionato qualcosa per il bonifico').toBe(prima)
  })
})

describe('La finestra «eliminare tutte le fatture» si chiude anche senza mouse', () => {
  async function apriLaFinestra() {
    const r = await montaPerFornitore()
    act(() => { fireEvent.click(perEtichetta(r.container, /^Altre azioni$/)) })
    const elimina = perTesto(r.container, /Elimina tutte/i)
    expect(elimina, 'non c\'è la voce «Elimina tutte le fatture»').toBeTruthy()
    act(() => { fireEvent.click(elimina) })
    await waitFor(() => { expect(document.body.textContent).toMatch(/Eliminare tutte le fatture/) })
    return r
  }

  it('si presenta come una finestra, non come un riquadro qualsiasi', async () => {
    await apriLaFinestra()
    const finestra = document.querySelector('[role="dialog"][aria-modal="true"]')
    expect(finestra, 'il riquadro non dichiara di essere una finestra').toBeTruthy()
    expect(finestra.getAttribute('aria-label')).toMatch(/Eliminare tutte le fatture/)
  })

  it('il velo intorno è un pulsante con un nome, non un rettangolo muto', async () => {
    const { container } = await apriLaFinestra()
    const velo = perEtichetta(container, /^Chiudi la finestra$/)
    expect(velo, 'il velo della finestra non si raggiunge con la tastiera').toBeTruthy()
    expect(velo.tagName).toBe('BUTTON')
  })

  it('premendo il velo la finestra si chiude', async () => {
    const { container } = await apriLaFinestra()
    act(() => { fireEvent.click(perEtichetta(container, /^Chiudi la finestra$/)) })
    await waitFor(() => { expect(document.body.textContent).not.toMatch(/Eliminare tutte le fatture/) })
  })

  it('e si chiude anche con Esc', async () => {
    // È il modo in cui la chiude chi non usa il mouse — e anche chi lo usa e
    // ha le mani sulla tastiera.
    await apriLaFinestra()
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    await waitFor(() => { expect(document.body.textContent).not.toMatch(/Eliminare tutte le fatture/) })
  })

  it('il riquadro resta sopra il velo', async () => {
    // Il velo copre tutto lo schermo: se il riquadro non è `position:
    // relative` finisce sotto, e la finestra diventa inutilizzabile col
    // mouse. È il modo in cui questa correzione può rompere quello che
    // funzionava.
    await apriLaFinestra()
    const finestra = document.querySelector('[role="dialog"][aria-modal="true"]')
    expect(finestra.style.position).toBe('relative')
  })
})

describe('Il righello di questo file', () => {
  // Con happy-dom `import.meta.url` non è un percorso di file: si parte
  // dalla radice del progetto, che è da dove vitest gira.
  const SRC = readFileSync(join(process.cwd(), 'src/components/Scadenzario.jsx'), 'utf8')

  it('nessun velo di finestra è rimasto un `<div onClick>`', async () => {
    // Un velo si riconosce da `position: 'fixed', inset: 0`. Se qualcuno ne
    // aggiunge uno nuovo col vecchio taglio, questa prova lo trova.
    const veli = [...SRC.matchAll(/position: 'fixed', inset: 0/g)]
    expect(veli.length, 'non c\'è più nessuna finestra: la prova non guarda niente').toBeGreaterThan(0)
    const colClic = veli.filter(m => {
      const intorno = SRC.slice(Math.max(0, m.index - 260), m.index)
      return /<div[^]{0,200}onClick\s*=\s*\{/.test(intorno)
    })
    expect(colClic.length, 'un velo di finestra si chiude solo col mouse').toBe(0)
  })

  it('e la pagina si disegna davvero, non è una schermata vuota', async () => {
    const { container } = await montaPerFornitore()
    expect(container.textContent).toMatch(/Latteria Rossi/)
    expect(container.textContent).toMatch(/Zucchero Bianchi/)
  })
})
