// @vitest-environment happy-dom
//
// ── Uno scarto mai scritto sembrava «niente buttato» ──────────────────────
//
// Trovato dall'audit dello Storico del 03/10/2026: nei dati di Mara dei
// Boschi `scarto_g` vale 0 in tutte le 7.013 righe dell'inventario. Lo
// Storico mostrava «-» nella colonna Scarto e una barra «Scarto kg» vuota nel
// grafico: si leggeva «non si butta niente». E non era solo una parola: se lo
// scarto non si scrive, quello che si butta finisce nel venduto (il conto è
// rimasto ieri + prodotto − rimasto oggi − scarto), e il ricavo stimato lo
// conta come incassato.
//
// Nello stesso giro, le piccole cose dell'audit su questa pagina: il
// triangolo era il carattere «⚠» sul computer (vietato: niente emoji, si usa
// l'icona, come già sul telefono), i pulsanti del grafico si chiamavano coi
// nomi del codice («giornaliero / settimana / mese») ed erano alti 34 px, e
// «Torna alla Produzione» aveva una freccia in giù.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor, screen } from '@testing-library/react'

vi.mock('../../src/lib/supabase', () => {
  const q = new Proxy({}, { get(_t, p) {
    if (p === 'then') return (resolve) => resolve({ data: [], error: null })
    return () => q
  } })
  return { supabase: { from: () => q, rpc: () => Promise.resolve({ data: null, error: null }) } }
})
vi.mock('../../src/lib/storage', () => ({
  sload: async (k) => (k === 'pasticceria-formati-vendita-v1'
    ? [{ id: 'f1', nome: 'Coppetta', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3, componenti: [] }] : null),
  ssave: async () => {}, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { default: AnalisiInventarioSection } = await import('../../src/views/AnalisiInventarioSection.jsx')
const { testoCsvSettimana } = await import('../../src/views/QuadraturaInventarioView.jsx')

const righe = (scarto = 0) => [
  { sede_id: 's1', gusto_nome: 'MISTIC', data: '2026-08-02', produzione_g: 0, rimanenza_g: 2000, scarto_g: 0, spedito_g: 0 },
  { sede_id: 's1', gusto_nome: 'MISTIC', data: '2026-08-03', produzione_g: 6000, rimanenza_g: 3000, scarto_g: scarto, spedito_g: 0 },
  { sede_id: 's1', gusto_nome: 'MISTIC', data: '2026-08-04', produzione_g: 0, rimanenza_g: 1000, scarto_g: 0, spedito_g: 0 },
]
const apri = (r) => render(
  <AnalisiInventarioSection rows={r} rowsPrev={[]} dateFrom="2026-08-03" dateTo="2026-08-04" confronto="nessuno"
    ricettario={{ ricette: {}, ingredienti_costi: {} }} orgId="org-1" sedeId="s1" sedi={[]} onBack={() => {}} />
)
const testo = () => document.body.textContent || ''

afterEach(() => cleanup())

describe('Lo scarto nello Storico', () => {
  it('senza nessuno scarto scritto lo dice, e dice dove finisce', async () => {
    apri(righe(0))
    await waitFor(() => expect(testo()).toMatch(/giorni registrati/), { timeout: 5000 })
    expect(testo()).toMatch(/scarto non registrato: quello che si butta è contato nel venduto/)
    // E nella tabella la casella dello scarto lo dice, invece di «-».
    const caselle = [...document.querySelectorAll('td')].map(td => td.textContent.trim())
    expect(caselle.filter(t => t === 'non registrato').length).toBeGreaterThan(0)
  })

  it('con lo scarto scritto mostra i chili e non dice «non registrato»', async () => {
    apri(righe(500))
    await waitFor(() => expect(testo()).toMatch(/giorni registrati/), { timeout: 5000 })
    expect(testo()).not.toMatch(/scarto non registrato/)
    expect(testo()).toMatch(/0,5/)
  })
})

describe('Le piccole cose della pagina', () => {
  it('niente emoji: il triangolo è un\'icona, con la spiegazione', async () => {
    apri(righe(0))
    await waitFor(() => expect(testo()).toMatch(/giorni registrati/), { timeout: 5000 })
    expect(testo()).not.toMatch(/⚠/)
    expect(document.querySelector('[title="Nessuna ricetta collegata a questo nome"]')).toBeTruthy()
  })

  it('i pulsanti del grafico parlano italiano e sono alti 44 px', async () => {
    apri(righe(0))
    await waitFor(() => expect(testo()).toMatch(/giorni registrati/), { timeout: 5000 })
    for (const nome of ['Giorno', 'Settimana', 'Mese']) {
      const b = screen.getByRole('button', { name: nome })
      expect(b.style.minHeight).toBe('44px')
    }
    expect(testo()).not.toMatch(/giornaliero/)
    expect(testo()).toMatch(/Prodotto e venduto per giorno/)
  })

  it('«Torna alla Produzione» è alto 44 px', async () => {
    apri(righe(0))
    await waitFor(() => expect(testo()).toMatch(/giorni registrati/), { timeout: 5000 })
    expect(screen.getByRole('button', { name: /Torna alla Produzione/ }).style.minHeight).toBe('44px')
  })
})

describe('Lo scarto nel CSV della Quadratura', () => {
  const base = { lunediIso: '2026-08-24', kpi: { totVendutoG: 1000, totVendutoKg: 1, retailKg: 1, b2bKg: 0, cassaRegistrata: false }, sedeAttiva: { nome: 'Carlina' }, isAllSedi: false, perSede: [] }
  it('mai scritto: «non registrato», non 0,0', () => {
    expect(testoCsvSettimana({ ...base, dettaglio: [{ gusto: 'A', inizialeG: 0, prodottoG: 1000, scartoG: 0, finaleG: 0, vendutoG: 1000 }] }))
      .toMatch(/Scarto \(kg\);non registrato/)
  })
  it('scritto: i chili', () => {
    expect(testoCsvSettimana({ ...base, dettaglio: [{ gusto: 'A', inizialeG: 0, prodottoG: 1000, scartoG: 300, finaleG: 0, vendutoG: 700 }] }))
      .toMatch(/Scarto \(kg\);0,3/)
  })
})
