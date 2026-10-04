// @vitest-environment happy-dom
//
// ── Lo Storico produzione diceva «Margine 100%» su ogni gusto ────────────
//
// Trovato dall'audit dello Storico del 03/10/2026, rifacendo i conti con le
// funzioni vere sui dati di Mara dei Boschi.
//
// La sezione a inventario dello Storico (l'unica che Mara vede, perché lavora
// col metodo differenziale) calcolava il food cost così:
//
//     calcolaFC(ricetta, ricettario).foodCost
//
// Due errori in una riga: la firma vera è `calcolaFC(ricetta, ingCosti,
// ricettario)`, quindi al posto dei prezzi degli ingredienti arrivava il
// ricettario e nessun ingrediente aveva prezzo; e `foodCost` non esiste,
// `calcolaFC` restituisce `tot`. Il food cost di ogni gusto era 0, il margine
// il 100% del ricavo. A schermo, 03/08-03/10, tutte le sedi: «Margine
// 88.970 € (100,0%)»; quello vero è 75.087 € (84,4%). L'esportazione Excel
// portava gli stessi zeri al commercialista.
//
// C'era un secondo errore, nella correzione già fatta altrove (PLView):
// `calcolaFC` dà il costo dell'impasto intero, non di un chilo. BOCUSE costa
// 8,31 € per 1.192 g, cioè 6,97 €/kg. Senza dividere per la resa il food cost
// usciva più alto del 10%.
//
// Il terzo, della stessa famiglia: un gusto col ricavo ma senza il costo (o
// con un ingrediente senza prezzo) faceva anche lui un margine del 100%, e
// quel 100% entrava nel totale. Adesso il suo margine è «non lo so» e il
// totale dice su quanti gusti è calcolato.
//
// 04/10/2026, pagina rifatta (fase 2): la tessera non scrive più «Margine
// (79,0%)» ma «Margine stimato 166 €» con sotto «79% del ricavo» (le quote
// con al massimo un decimale, zero se intero: ANALISI_DESIGN.md §2.6). La
// prova resta la stessa — 79 e non 100 — cambia solo come si legge.
// E la tabella mostra il costo AL CHILO (7,33 €/kg) invece del food cost del
// periodo (44 €): la prova della resa è la stessa, 8,80 € diviso 1,2 kg e
// non 8,80 €/kg (il food cost totale resta nel file Excel). La tabella dei
// gusti si apre al tocco, sotto la classifica (ANALISI_DESIGN.md §6): la
// prova la apre.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, screen } from '@testing-library/react'

vi.mock('../../src/lib/supabase', () => {
  const RES = { data: [], error: null }
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(RES)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return { supabase: { from: () => new Proxy({}, h), rpc: () => Promise.resolve({ data: null, error: null }) } }
})

// Un formato solo: 100 g a 3 € = 30 €/kg.
const FORMATI = [{ id: 'f1', nome: 'Coppetta', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3, componenti: [] }]
vi.mock('../../src/lib/storage', () => ({
  sload: async (k) => (k === 'pasticceria-formati-vendita-v1' ? FORMATI : null),
  ssave: async () => {}, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { costoAlKgGusto, valutaGusti, sommaGusti } = await import('../../src/lib/produzioneAnalisi.js')
const { buildIngCosti } = await import('../../src/lib/foodcost.js')
const { totaliPerGusto, ricettaDelGusto } = await import('../../src/lib/inventarioProduzione.js')
const { default: AnalisiInventarioSection } = await import('../../src/views/AnalisiInventarioSection.jsx')

// NOCCIOLA: 800 g di latte a 1 €/kg + 400 g di nocciola a 20 €/kg.
// Impasto 1.200 g, costo 8,80 €: 7,33 €/kg di gelato finito.
const RICETTARIO = {
  ingredienti_costi: {
    latte: { costoKg: 1, costoG: 0.001 },
    nocciola: { costoKg: 20, costoG: 0.02 },
  },
  ricette: {
    NOCCIOLA: { nome: 'NOCCIOLA', tipo: 'gusto', categoria: 'Gusto',
      ingredienti: [{ nome: 'latte', qty1stampo: 800 }, { nome: 'nocciola', qty1stampo: 400 }] },
    // Un ingrediente senza prezzo: il costo è a metà.
    PISTACCHIO: { nome: 'PISTACCHIO', tipo: 'gusto', categoria: 'Gusto',
      ingredienti: [{ nome: 'latte', qty1stampo: 800 }, { nome: 'pasta pistacchio sconosciuta', qty1stampo: 200 }] },
  },
}
const ING = buildIngCosti(RICETTARIO.ingredienti_costi)

// Il 02/08 resta 2 kg in vetrina; il 03/08 si fanno 6 kg e restano 3 kg
// (venduti 5); il 04/08 restano 1 kg (venduti 2). Nel periodo 03-04/08:
// prodotti 6 kg, venduti 7 kg.
const RIGHE = [
  { sede_id: 's1', gusto_nome: 'NOCCIOLA', data: '2026-08-02', produzione_g: 0, rimanenza_g: 2000, scarto_g: 0, spedito_g: 0 },
  { sede_id: 's1', gusto_nome: 'NOCCIOLA', data: '2026-08-03', produzione_g: 6000, rimanenza_g: 3000, scarto_g: 0, spedito_g: 0 },
  { sede_id: 's1', gusto_nome: 'NOCCIOLA', data: '2026-08-04', produzione_g: 0, rimanenza_g: 1000, scarto_g: 0, spedito_g: 0 },
]
const dipendenze = (ricettario = RICETTARIO) => ({
  ricettaDi: (g) => ricettaDelGusto(ricettario, g),
  ricavoKgDi: () => 30,
  ingCosti: buildIngCosti(ricettario.ingredienti_costi), ricettario,
})

afterEach(() => cleanup())

describe('Il costo al chilo di un gusto', () => {
  it('usa i prezzi degli ingredienti (la firma giusta di calcolaFC)', () => {
    const c = costoAlKgGusto(RICETTARIO.ricette.NOCCIOLA, ING, RICETTARIO)
    expect(c.fcKg).toBeGreaterThan(0)
    expect(c.mancanti).toEqual([])
    expect(c.completo).toBe(true)
  })

  it('divide il costo dell\'impasto per la sua resa: 8,80 € su 1.200 g sono 7,33 €/kg', () => {
    const c = costoAlKgGusto(RICETTARIO.ricette.NOCCIOLA, ING, RICETTARIO)
    expect(c.fcKg).toBeCloseTo(8.8 / 1.2, 3)
  })

  it('la resa dichiarata vince sulla somma degli ingredienti', () => {
    const ric = { ...RICETTARIO.ricette.NOCCIOLA, resa_g: 1100 }
    expect(costoAlKgGusto(ric, ING, RICETTARIO).fcKg).toBeCloseTo(8.8 / 1.1, 3)
  })

  it('un ingrediente senza prezzo rende il costo incompleto, e lo dice', () => {
    const c = costoAlKgGusto(RICETTARIO.ricette.PISTACCHIO, ING, RICETTARIO)
    expect(c.completo).toBe(false)
    expect(c.mancanti.length).toBe(1)
  })

  it('una ricetta senza peso non ha un costo al chilo (non zero: non si sa)', () => {
    const c = costoAlKgGusto({ nome: 'VUOTA', tipo: 'fetta', ingredienti: [] }, ING, RICETTARIO)
    expect(c.fcKg).toBeNull()
    expect(c.completo).toBe(false)
  })

  it('senza ricetta non c\'è costo', () => {
    expect(costoAlKgGusto(null, ING, RICETTARIO)).toEqual({ fcKg: null, mancanti: [], completo: false })
  })
})

describe('Il valore dei gusti nel periodo', () => {
  const tot = () => totaliPerGusto(RIGHE, { da: '2026-08-03', a: '2026-08-04' })

  it('margine = ricavo dei chili venduti − costo dei chili prodotti', () => {
    const { righe, totali } = valutaGusti(tot(), dipendenze())
    const n = righe.find(r => r.gusto === 'NOCCIOLA')
    expect(n.vendKg).toBeCloseTo(7, 6)
    expect(n.prodKg).toBeCloseTo(6, 6)
    expect(n.ricavo).toBeCloseTo(210, 6)
    expect(n.fc).toBeCloseTo(6 * 8.8 / 1.2, 6)       // 44 €
    expect(n.margine).toBeCloseTo(210 - 44, 6)
    expect(totali.margPct).toBeCloseTo((166 / 210) * 100, 6)
    // Il difetto: margine uguale al ricavo.
    expect(totali.margine).not.toBeCloseTo(totali.ricavo, 0)
  })

  it('un gusto col ricavo ma col costo a metà non ha margine (non 100%)', () => {
    const righe = RIGHE.map(r => ({ ...r, gusto_nome: 'PISTACCHIO' }))
    const { righe: v, totali } = valutaGusti(totaliPerGusto(righe, { da: '2026-08-03', a: '2026-08-04' }), dipendenze())
    expect(v[0].ricavo).toBeCloseTo(210, 6)
    expect(v[0].margine).toBeNull()
    expect(v[0].margPct).toBeNull()
    expect(totali.margine).toBeNull()
    expect(totali.margPct).toBeNull()
  })

  it('un gusto senza ricetta non vale niente e non entra nel margine', () => {
    const righe = [...RIGHE, ...RIGHE.map(r => ({ ...r, gusto_nome: 'MISTIC' }))]
    const { righe: v, totali } = valutaGusti(totaliPerGusto(righe, { da: '2026-08-03', a: '2026-08-04' }), dipendenze())
    const m = v.find(r => r.gusto === 'MISTIC')
    expect(m.haRicetta).toBe(false)
    expect(m.ricavo).toBe(0)
    expect(m.margine).toBeNull()
    // Il totale: chili di tutti e due, margine della sola NOCCIOLA, e dice
    // su quanti gusti è fatto.
    expect(totali.vend).toBeCloseTo(14, 6)
    expect(totali.margine).toBeCloseTo(166, 6)
    expect(totali.nConMargine).toBe(1)
    expect(totali.nConVendita).toBe(2)
  })

  it('un gusto senza movimenti non conta fra i gusti venduti', () => {
    const t = sommaGusti([
      { prodKg: 0, vendKg: 0, scartoKg: 0, ricavo: 0, fc: 0, margine: 0 },
      { prodKg: 2, vendKg: 2, scartoKg: 0, ricavo: 60, fc: 10, margine: 50 },
    ])
    expect(t.nConVendita).toBe(1)
    expect(t.nConMargine).toBe(1)
    expect(t.margine).toBe(50)
  })

  it('senza nessun gusto il margine non è zero: non si sa', () => {
    const t = sommaGusti([])
    expect(t.margine).toBeNull()
    expect(t.margPct).toBeNull()
  })
})

describe('La pagina dello Storico mostra il margine vero', () => {
  const apri = (ricettario = RICETTARIO, righe = RIGHE) => render(
    <AnalisiInventarioSection rows={righe} rowsPrev={[]} dateFrom="2026-08-03" dateTo="2026-08-04"
      confronto="nessuno" ricettario={ricettario} orgId="org-1" sedeId="s1" sedi={[]} />
  )
  const testo = () => document.body.textContent || ''

  it('non scrive «Margine (100,0%)» quando la ricetta ha i prezzi', async () => {
    apri()
    // Il ricavo arriva quando i formati sono caricati: 7 kg × 30 €/kg.
    await waitFor(() => expect(testo()).toMatch(/210\s?€/), { timeout: 5000 })
    expect(testo()).not.toMatch(/100(,0)?% del ricavo/)
    // 166 / 210 = 79,0%
    // Il confronto qui è «nessuno», scelto: la riga del confronto c'è ma resta
    // vuota. «nessun confronto» si scrive solo quando era atteso e manca.
    expect(testo()).toMatch(/Margine stimato166\s?€79% del ricavo/)
    expect(testo()).toMatch(/166\s?€/)
  })

  it('col costo a metà la tessera dice che il margine non si può calcolare', async () => {
    apri(RICETTARIO, RIGHE.map(r => ({ ...r, gusto_nome: 'PISTACCHIO' })))
    await waitFor(() => expect(testo()).toMatch(/210\s?€/), { timeout: 5000 })
    expect(testo()).toMatch(/non calcolabile/)
    // Il margine non è il 100%. («100,0%» c'è, ma nella classifica dei gusti:
    // un gusto solo fa il 100% del venduto. La prova guarda il margine.)
    expect(testo()).not.toMatch(/100(,0)?% del ricavo/)
    expect(testo()).not.toMatch(/Margine stimato[^€]{0,20}100/)
  })

  it('il costo della tabella è quello diviso per la resa (7,33 €/kg, non 8,80 €/kg)', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/210\s?€/), { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: /^Vedi (tutti i \d+ gusti|la tabella del gusto)/ }))
    expect(testo()).toMatch(/7,33\s?€\/kg/)
    expect(testo()).not.toMatch(/8,80\s?€\/kg/)
    // E il margine della riga è 210 − 6 kg × 7,33 = 166 €, non 210 − 53.
    expect(testo()).not.toMatch(/157\s?€/)
  })
})
