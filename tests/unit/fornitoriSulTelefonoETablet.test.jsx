// @vitest-environment happy-dom
// Le schermate nuove di Fornitori si usano col dito, non solo col mouse.
//
// Regola permanente del progetto (CLAUDE.md): ogni cosa che si aggiunge va
// curata sul telefono e sul tablet quanto sul computer, e i bersagli da
// toccare non scendono sotto i 44px — il tablet si tocca col dito come un
// telefono, quindi non vale `isMobile ? 44 : 32`.
//
// Le cinque schermate aggiunte il 19/09/2026 (le tre degli elenchi, lo
// smistamento fra i negozi, gli IBAN) hanno tendine, caselle di spunta e
// campi di scrittura: sono esattamente i comandi che su un telefono si
// sbagliano se sono piccoli. Questo file li monta a 390px e a 820px e misura.
//
// **Ha già trovato un difetto vero, lo stesso giorno.** Sul TABLET i due
// pulsanti di ogni riga — «Segna pagata» e il cestino — erano alti 30px:
// `ActionsCell` decideva l'altezza con `isMobile ? 44 : 30`, e il tablet non è
// `isMobile`. Valeva anche sulla pagina vecchia, non solo sulle schermate
// nuove. Ora si guarda `isMobile || isTablet`.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import React from 'react'

const schermo = { mobile: false, tablet: false }

vi.mock('../../src/lib/supabase', async () => {
  const { supabaseFinto } = await import('./aiutoFornitori.jsx')
  return { supabase: supabaseFinto }
})
vi.mock('../../src/lib/storage', () => ({ sload: async () => null, ssave: async () => {} }))
vi.mock('../../src/lib/useIsMobile', () => ({
  default: () => schermo.mobile,
  useIsTablet: () => schermo.tablet,
}))

const { reset, fattura, SEDI_TRE } = await import('./aiutoFornitori.jsx')
const { default: Scadenzario } = await import('../../src/components/Scadenzario.jsx')

const FATTURE = [
  fattura({ id: 'm1', fornitore: 'Latteria Rossi', totale: 1200, fra: -30 }),
  fattura({ id: 'm2', fornitore: 'Zucchero Bianchi', totale: 500, fra: 4 }),
  fattura({ id: 'm3', fornitore: 'Cioccolato Verdi', totale: 900, fra: 20 }),
]

const PAGINE = [
  'fatture-da-pagare', 'fatture-scadute', 'fatture-in-scadenza',
  'fatture-senza-sede', 'fornitori-senza-iban',
]

async function monta(pagina) {
  const r = render(<Scadenzario orgId="org-1" sedeId={null} sedi={SEDI_TRE} pagina={pagina} onNavigate={() => {}} />)
  await waitFor(() => { expect(r.container.textContent).not.toMatch(/Caricamento/) }, { timeout: 4000 })
  return r
}

// I comandi che si toccano: pulsanti, tendine, caselle, campi di scrittura.
function troppoPiccoli(container) {
  const colpevoli = []
  for (const el of container.querySelectorAll('button, select, input')) {
    if (el.type === 'checkbox') {
      const l = parseInt(el.style.width, 10) || 0
      // Le caselle di spunta hanno un margine intorno che allarga l'area
      // toccabile: si misura la casella più il margine.
      const m = parseInt(el.style.margin, 10) || 0
      if (l + 2 * m < 36) colpevoli.push(`casella ${l}+${m}px`)
      continue
    }
    const h = parseInt(el.style.minHeight, 10) || 0
    if (h < 44) colpevoli.push(`${el.tagName.toLowerCase()} «${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}» ${h}px`)
  }
  return colpevoli
}

beforeEach(() => reset({ fatture: FATTURE.map(f => ({ ...f })), fornitori: [] }))
afterEach(() => { cleanup(); schermo.mobile = false; schermo.tablet = false })

describe('sul telefono', () => {
  beforeEach(() => { schermo.mobile = true; schermo.tablet = false })

  it('le cinque schermate si disegnano e dicono il loro nome', async () => {
    for (const p of PAGINE) {
      const { container } = await monta(p)
      expect(container.querySelector('h2'), `«${p}» non si disegna sul telefono`).toBeTruthy()
      expect(container.querySelector('h2').textContent.trim().length).toBeGreaterThan(2)
      cleanup()
    }
  })

  it('tutti i comandi si prendono col dito', async () => {
    for (const p of PAGINE) {
      const { container } = await monta(p)
      expect(troppoPiccoli(container), `«${p}» ha comandi troppo piccoli sul telefono`).toEqual([])
      cleanup()
    }
  })
})

describe('sul tablet, che si tocca col dito come il telefono', () => {
  beforeEach(() => { schermo.mobile = false; schermo.tablet = true })

  it('i comandi restano grandi come sul telefono', async () => {
    for (const p of PAGINE) {
      const { container } = await monta(p)
      expect(troppoPiccoli(container), `«${p}» ha comandi troppo piccoli sul tablet`).toEqual([])
      cleanup()
    }
  })
})
