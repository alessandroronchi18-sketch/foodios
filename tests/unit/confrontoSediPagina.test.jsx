// @vitest-environment happy-dom
//
// Il Confronto sedi come lo legge Mara, il 5 ottobre 2026.
//
// La pagina di prima: solo «Settimana» e «Mese» correnti (il 5 ottobre, cinque
// giorni quasi vuoti), un numero di Carlina che contava le 22 chiusure e
// lasciava gli altri 8 giorni a zero senza dirlo, due sedi con trattini, un
// «sede critica» ricavato da pesi inventati. Adesso: la barra del periodo
// comune (parte da settembre, perché a inizio mese ci sono pochi giorni), il
// numero di Carlina dice «22 su 30 giorni», le sedi senza dati dicono «non lo
// so» e c'è il passaggio al mese prima, dove le tre sedi hanno l'inventario.
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, waitFor, act } from '@testing-library/react'

const CARL = 'sede-carl', BERT = 'sede-bert', DEGA = 'sede-dega'
const SETT = [['01', 1592.2], ['02', 1861.7], ['03', 1830.7], ['04', 2393.3], ['05', 2647.75], ['06', 3070.03], ['07', 1595.75],
  ['08', 1802.4], ['09', 1043.3], ['10', 1566.0], ['11', 2432.2], ['12', 3565.9], ['13', 2797.0], ['14', 1659.05], ['15', 1599.1],
  ['18', 1913.9], ['20', 3034.0], ['21', 1351.7], ['22', 1548.6], ['27', 3153.98], ['29', 1253.9], ['30', 1136.14]]
let RIGHE_INV = []
let FORMATI_T = null
let METODO = 'stampi'
const CHIUSURE = SETT.map(([g, t]) => ({ sede_id: CARL, data: `2026-09-${g}`, kpi: { totV: t } }))

vi.mock('../../src/lib/supabase', () => {
  const h = { get(_t, p) { if (p === 'then') return (r) => r({ data: [], error: null }); return () => new Proxy({}, h) } }
  return { supabase: { from: () => new Proxy({}, h), rpc: async () => ({ data: null, error: null }) } }
})
vi.mock('../../src/lib/storage', () => ({ sload: async (k) => (k === 'pasticceria-formati-vendita-v1' ? FORMATI_T : null), ssave: async () => {} }))
vi.mock('../../src/lib/chiusure', () => ({ caricaChiusure: async () => CHIUSURE }))
vi.mock('../../src/lib/costiAziendali', async (orig) => ({ ...(await orig()), caricaCostiAziendali: async () => [] }))
vi.mock('../../src/lib/venditeB2B', async (orig) => ({ ...(await orig()), venditeB2BPeriodo: async () => [] }))
vi.mock('../../src/lib/inventarioProduzione', async (orig) => ({ ...(await orig()), fetchAllInventarioProduzione: async (_o, { sedeIds }) => RIGHE_INV.filter(r => [].concat(sedeIds).includes(r.sede_id)) }))

import ConfrontoSedi from '../../src/components/ConfrontoSedi'

const SEDI = [{ id: CARL, nome: 'Carlina', attiva: true }, { id: BERT, nome: 'Berthollet', attiva: true }, { id: DEGA, nome: 'De Gasperi', attiva: true }]
const testo = () => document.body.textContent.replace(/\s+/g, ' ')
const attendi = (re) => waitFor(() => { if (!re.test(testo())) throw new Error('attendo') }, { timeout: 5000 })

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-05T10:00:00')) })
afterEach(() => { vi.useRealTimers(); cleanup(); RIGHE_INV = []; FORMATI_T = null; METODO = 'stampi' })

describe('Confronto sedi: la pagina', () => {
  it('parte da settembre (il 5 ottobre il mese corrente ha cinque giorni) e ha la barra del periodo', async () => {
    render(<ConfrontoSedi orgId="o" sedi={SEDI} />)
    await attendi(/Da dove vengono i numeri/)
    expect(testo()).toContain('1–30 settembre 2026')
    expect(document.querySelector('button[aria-label="Periodo precedente"]')).toBeTruthy()
    // niente più i pulsanti «Settimana» / «Mese» fatti in casa
    expect([...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Settimana')).toBe(false)
  })

  it('Carlina: il numero senza IVA e i giorni coperti detti, non 8 giorni a zero in silenzio', async () => {
    render(<ConfrontoSedi orgId="o" sedi={SEDI} />)
    await attendi(/22 su 30/)
    expect(testo()).toContain('40.771')
    expect(testo()).toMatch(/8 giorni senza dati/)
  })

  it('le sedi senza dati dicono «non lo so», mai 0 €', async () => {
    render(<ConfrontoSedi orgId="o" sedi={SEDI} />)
    await attendi(/non lo so/)
    // La riga degli incassi: Carlina col suo numero, Berthollet e De Gasperi senza dati.
    const riga = [...document.querySelectorAll('tr')].find(tr => /^Incassi/.test(tr.textContent))
    const celle = [...riga.querySelectorAll('td')].map(td => td.textContent.trim())
    expect(celle[0]).toMatch(/^40\.771/)
    expect(celle[1]).toBe('non lo so')
    expect(celle[2]).toBe('non lo so')
    expect(testo()).not.toContain('NaN')
    expect(testo()).toMatch(/Solo Carlina ha incassi/)
  })

  it('con una sola sede coi dati offre il mese prima, e un tocco ci porta ad agosto', async () => {
    render(<ConfrontoSedi orgId="o" sedi={SEDI} />)
    await attendi(/Guarda 1–31 agosto 2026/)
    const b = [...document.querySelectorAll('button')].find(x => /Guarda 1–31 agosto 2026/.test(x.textContent))
    expect(b.getBoundingClientRect).toBeTruthy()
    await act(async () => { b.click() })
    await attendi(/1–31 agosto 2026/)
    expect(testo()).not.toMatch(/Guarda 1–31 agosto/)
  })

  it('con una sede sola attiva dice che servono due sedi', () => {
    render(<ConfrontoSedi orgId="o" sedi={[SEDI[0]]} />)
    expect(testo()).toMatch(/almeno due sedi/)
  })

  it('niente punteggi inventati: «sede critica» e «Lettura AI» non esistono più', async () => {
    render(<ConfrontoSedi orgId="o" sedi={SEDI} />)
    await attendi(/Da dove vengono i numeri/)
    expect(testo()).not.toMatch(/Sede da gestire subito|Lettura AI|Sede champion/i)
  })

  // Secondo giro 05/10: righe da pasticceria e fonte degli incassi.
  it('a inventario «Prodotti oggi», «Stock vetrina» e «Trasferimenti» non compaiono se non hanno un dato', async () => {
    render(<ConfrontoSedi orgId="o" sedi={SEDI} metodoProduzione="inventario" />)
    await attendi(/Da dove vengono i numeri/)
    expect(testo()).not.toMatch(/Prodotti oggi|Stock vetrina|Trasferimenti in arrivo/)
  })

  it('con il metodo a stampi le righe ci sono ancora', async () => {
    render(<ConfrontoSedi orgId="o" sedi={SEDI} />)
    await attendi(/Prodotti oggi/)
    expect(testo()).toMatch(/Stock vetrina/)
  })

  it('cassa e inventario nello stesso mese: «in parte cassa», non «stimato»', async () => {
    FORMATI_T = [{ nome: 'Cono', baseQtaG: 100, categoria: 'Gusto', prezzoDefault: 3 }]
    // Agosto: una chiusura vera il 10, inventario tutti i giorni.
    CHIUSURE.push({ sede_id: CARL, data: '2026-08-10', kpi: { totV: 900 } })
    RIGHE_INV = Array.from({ length: 31 }, (_, i) => ({
      sede_id: CARL, gusto_nome: 'NOCCIOLA', data: `2026-08-${String(i + 1).padStart(2, '0')}`,
      produzione_g: 0, rimanenza_g: 20000 - 300 * i, scarto_g: 0, spedito_g: 0,
    }))
    try {
      render(<ConfrontoSedi orgId="o" sedi={SEDI} />)
      await attendi(/Da dove vengono i numeri/)
      const b = [...document.querySelectorAll('button')].find(x => /Guarda 1–31 agosto 2026/.test(x.textContent))
      await act(async () => { b.click() })
      await attendi(/Carlina: in parte cassa/)
      expect(testo()).not.toMatch(/Carlina: stimato/)
    } finally { CHIUSURE.pop() }
  })
})
