// @vitest-environment happy-dom
//
// Nell'Archivio si aprono solo le note scritte da una persona.
//
// 06/10/2026: 1.731 fatture su 2.418 hanno una nota, ma 1.632 sono la stessa
// frase automatica («Segnata pagata il 10/09/2026: scaduta da oltre un
// anno…») e 99 l'altra («Segnata pagata in blocco il 05/10/2026…»). Il segno
// per aprire la nota stava quindi su quasi ogni riga, e la nota vera, quella
// scritta da qualcuno, non si distingueva più. Scelta B (consigliata al
// titolare): le automatiche stanno nel suggerimento dello stato.
import React from 'react'
import { it, expect, vi, afterEach } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import { notaAutomatica } from '../../src/lib/archivioFatture'

vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false, useDevice: () => ({ isMobile: false, isTablet: false }) }))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))
const { default: Vista } = await import('../../src/views/ArchivioFattureView.jsx')
afterEach(() => cleanup())

const AUTO1 = 'Segnata pagata il 10/09/2026: scaduta da oltre un anno, quasi certamente già pagata.'
const AUTO2 = 'Segnata pagata in blocco il 05/10/2026 su indicazione del titolare: data del pagamento non nota.'
const UMANA = 'Pagata in contanti al fornitore, ricevuta in cassetto.'
const FATTURE = [
  { id: 'a', fornitore: 'Rossi', numero_rif: '1', data_fattura: '2026-03-28', totale: 10, imponibile: 8, stato: 'pagata', sede_id: null, note: AUTO1 },
  { id: 'b', fornitore: 'Bianchi', numero_rif: '2', data_fattura: '2026-06-01', totale: 20, imponibile: 16, stato: 'pagata', sede_id: null, note: AUTO2 },
  { id: 'c', fornitore: 'Verdi', numero_rif: '3', data_fattura: '2026-09-01', totale: 30, imponibile: 24, stato: 'pagata', sede_id: null, note: UMANA },
]
const client = { from(t) { const b = { select: () => b, eq: () => b, not: () => b, limit: () => b, range: () => b, order: () => b, gte: () => b, lte: () => b,
  then: (ok) => Promise.resolve({ data: t === 'fatture' ? FATTURE : [], error: null }).then(ok) }; return b } }

it('riconosce le due frasi automatiche, non le altre', () => {
  expect(notaAutomatica(AUTO1)).toBe(true)
  expect(notaAutomatica(AUTO2)).toBe(true)
  expect(notaAutomatica(UMANA)).toBe(false)
  expect(notaAutomatica('')).toBe(false)
  expect(notaAutomatica(null)).toBe(false)
})

it('si apre solo la riga con la nota scritta da una persona; le automatiche stanno nel suggerimento', async () => {
  render(<Vista orgId="o" sedi={[]} client={client} />)
  await waitFor(() => { if (document.querySelectorAll('tbody tr').length < 3) throw new Error('attendo') }, { timeout: 5000 })
  const conTasto = [...document.querySelectorAll('tbody th button')].map(b => b.textContent)
  expect(conTasto.join(' ')).toMatch(/Verdi/)
  expect(conTasto.join(' ')).not.toMatch(/Rossi|Bianchi/)
  const suggerimenti = [...document.querySelectorAll('tbody [title]')].map(e => e.getAttribute('title'))
  expect(suggerimenti).toEqual(expect.arrayContaining([AUTO1, AUTO2]))
})
