// @vitest-environment happy-dom
// 05/10/2026, secondo giro — il titolare aveva chiesto «tutte le fatture» e
// l'Archivio si apriva sull'anno in corso: 545 fatture su 2.418, le altre
// (dal 28/03/2023) nascoste dietro un cambio di periodo che nessuno sapeva di
// dover fare. Ora si apre dalla prima fattura a oggi, e una scorciatoia
// «Tutto l'archivio» ci riporta dopo aver cambiato periodo.
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import { primaDataArchivio } from '../../src/lib/archivioFatture'

let MOBILE = false
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => MOBILE, useIsTablet: () => false, useDevice: () => ({ isMobile: MOBILE, isTablet: false }) }))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))
const { default: Vista } = await import('../../src/views/ArchivioFattureView.jsx')

const TUTTE = [
  { id: 'a', fornitore: 'Rossi', numero_rif: '1', data_fattura: '2023-03-28', totale: 10, imponibile: 8, stato: 'pagata', sede_id: null },
  { id: 'b', fornitore: 'Bianchi', numero_rif: '2', data_fattura: '2025-06-01', totale: 20, imponibile: 16, stato: 'pagata', sede_id: null },
  { id: 'c', fornitore: 'Verdi', numero_rif: '3', data_fattura: '2026-09-01', totale: 30, imponibile: 24, stato: 'pagata', sede_id: null },
]
function finto(chiamate) {
  return { from(t) {
    const fil = []
    const b = {
      select: () => b, eq: () => b, not: () => b, limit: () => b, range: () => b,
      order: (c, o) => { b._asc = o?.ascending; return b },
      gte: (c, v) => { fil.push(r => String(r[c]) >= v); chiamate.push({ gte: v }); return b },
      lte: (c, v) => { fil.push(r => String(r[c]) <= v); return b },
      then: (ok) => Promise.resolve({ data: t === 'fatture'
        ? TUTTE.filter(r => fil.every(f => f(r))).sort((x, y) => (b._asc ? 1 : -1) * x.data_fattura.localeCompare(y.data_fattura))
        : [], error: null }).then(ok),
    }
    return b
  } }
}
const righeTabella = () => document.querySelectorAll('tbody tr').length

describe('l\'Archivio si apre su tutto', () => {
  it('primaDataArchivio dà la fattura più vecchia, null se non ce ne sono', async () => {
    expect(await primaDataArchivio(finto([]), 'o')).toBe('2023-03-28')
    const vuoto = { from: () => { const b = { select: () => b, eq: () => b, not: () => b, order: () => b, limit: () => b, then: (ok) => Promise.resolve({ data: [], error: null }).then(ok) }; return b } }
    expect(await primaDataArchivio(vuoto, 'o')).toBeNull()
  })
  it('all\'apertura mostra tutte e tre, anche quelle del 2023; «Tutto l\'archivio» ci riporta', async () => {
    const chiamate = []
    const u = render(<Vista orgId="o" sedi={[]} client={finto(chiamate)} />)
    await waitFor(() => { if (righeTabella() !== 3) throw new Error('attendo') }, { timeout: 5000 })
    expect(chiamate.some(c => c.gte === '2026-01-01')).toBe(false)
    const bottone = (re) => [...document.querySelectorAll('button')].find(b => re.test(b.textContent))
    // Aperti su tutto, la scorciatoia non serve e non c'è.
    expect(bottone(/Tutto l'archivio/)).toBeFalsy()
    // Si cambia periodo (scorciatoia «Quest'anno» della barra): ne restano meno.
    await act(async () => { bottone(/1 gennaio|Tutto|2023|ottobre/).click() })
    await act(async () => { bottone(/^Quest'anno$/).click() })
    await waitFor(() => { if (righeTabella() !== 1) throw new Error('attendo') }, { timeout: 5000 })
    expect(bottone(/Tutto l'archivio/)).toBeTruthy()
    await act(async () => { bottone(/Tutto l'archivio/).click() })
    await waitFor(() => { if (righeTabella() !== 3) throw new Error('attendo') }, { timeout: 5000 })
    u.unmount(); cleanup()
  })
})

// Terzo punto del secondo giro: «al telefono 7 bersagli su 10». Era la riga
// «clic=7/10» della misura, che conta i comandi della prima schermata (7 su
// 10 in tutto), non quelli troppo piccoli: `bersagliPiccoli` era vuoto. Resta
// il test che li tiene a 44 px, perché i comandi di questa pagina sono molti.
describe('al telefono ogni comando è alto almeno 44 px', () => {
  it('campi, filtri e pulsanti dichiarano minHeight 44; le righe con la nota pure', async () => {
    MOBILE = true
    const u = render(<Vista orgId="o" sedi={[]} client={finto([])} />)
    await waitFor(() => { if (righeTabella() !== 3) throw new Error('attendo') }, { timeout: 5000 })
    const comandi = [...document.querySelectorAll('input[type=search], select, button')]
      .filter(el => !el.closest('table') && !/Periodo|Chiudi/.test(el.getAttribute('aria-label') || ''))
    expect(comandi.length).toBeGreaterThanOrEqual(5)
    for (const el of comandi) {
      const h = parseFloat(el.style.minHeight || '0')
      expect(h, `${el.tagName} «${el.getAttribute('aria-label') || el.textContent}»`).toBeGreaterThanOrEqual(44)
    }
    u.unmount(); cleanup(); MOBILE = false
  })
})
