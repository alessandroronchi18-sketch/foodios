// @vitest-environment happy-dom
//
// ── Il ricavo stimato è lo stesso numero in tutte le pagine ──────────────
//
// Decisione del titolare, 04/10/2026. Sui dati di Mara, luglio-agosto, la
// Produzione diceva «Ricavo stimato 244.452 €» (i chili dei soli gusti con
// la ricetta, al prezzo della loro categoria), mentre «Il mese» e «Torna il
// conto?» stimano gli incassi con TUTTI i chili venduti per il prezzo medio
// dei formati: circa 347.600 € (29,49 €/kg). Stessa parola, due numeri, e
// collegare un nome di gusto alla sua ricetta faceva salire il «ricavo»
// della Produzione, che non è il ricavo: è il margine che si conosce meglio.
//
// Adesso la Produzione usa la stessa somma del Mese (`ricaviStimatiSedi`,
// lib/produzioneQuadro: `ricaviDaInventario` sede per sede, l'ingrosso a
// ogni sede, quello senza sede alla prima). Questo file prova che sugli
// stessi giorni i tre numeri sono uguali, chiamando le funzioni vere delle
// tre pagine (niente formule rifatte qui): «Il mese» col suo caricamento
// (`caricaIlMese`, letture finte), «Torna il conto?» coi conti della
// settimana (`kpiQuadraturaSettimana`: incasso al banco + ingrosso), la
// Produzione con `ricaviStimatiSedi`.
//
// 04/10/2026, seconda decisione: lo stesso numero anche A SCHERMO. Il Mese
// mostra gli incassi senza IVA (ALIQUOTA_IVA_INCASSI, `senzaIva`), mentre
// Produzione e «Torna il conto?» mostravano i chili × 29,49 €/kg con l'IVA
// dentro: settimana 24-30/08, 33.681 € contro 30.619 €. Adesso le tre pagine
// scrivono il numero senza IVA con la stessa funzione, e il margine della
// Produzione si calcola su quello (i costi degli ingredienti sono senza
// IVA). Le prove qui sotto confrontano il numero che si VEDE: la tessera
// della Produzione disegnata, la tessera della Quadratura coi conti che la
// pagina le passa (`kpiSenzaIva`), il Mese col suo `conto.ricavi`.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'

const FORMATI = [{ id: 'f1', nome: 'Coppetta', categoria: 'Gelato', baseQtaG: 100, prezzoDefault: 3, componenti: [] }] // 30 €/kg
let RIGHE = []
let VENDITE = []

vi.mock('../../src/lib/supabase', () => {
  const h = { get(_t, p) { if (p === 'then') return (r) => r({ data: [], error: null }); return () => new Proxy({}, h) } }
  return { supabase: { from: () => new Proxy({}, h), rpc: async () => ({ data: null, error: null }) } }
})
vi.mock('../../src/lib/storage', () => ({ sload: async () => FORMATI, ssave: async () => {} }))
vi.mock('../../src/lib/chiusure', () => ({ caricaChiusure: async () => [] }))
vi.mock('../../src/lib/costiAziendali', async (orig) => ({ ...(await orig()), caricaCostiAziendali: async () => [] }))
vi.mock('../../src/lib/contoEconomicoArchivio', async (orig) => ({
  ...(await orig()),
  leggiFatturePeriodo: async () => ({ fatture: [] }),
  leggiCategorieFornitori: async () => ({ fornitori: [], categoriePerFornitore: {} }),
}))
vi.mock('../../src/lib/venditeB2B', async (orig) => ({ ...(await orig()), venditeB2BPeriodo: async () => VENDITE }))
vi.mock('../../src/lib/inventarioProduzione', async (orig) => ({
  ...(await orig()),
  fetchAllInventarioProduzione: async (_o, { sedeIds, dataFrom, dataTo }) =>
    RIGHE.filter(r => [].concat(sedeIds).includes(r.sede_id) && (!dataFrom || r.data >= dataFrom) && (!dataTo || r.data <= dataTo)),
}))

const { caricaIlMese } = await import('../../src/lib/ilMeseArchivio.js')
const { ricaviStimatiSedi } = await import('../../src/lib/produzioneQuadro.js')
const { calcolaVendutoSettimana, matriceDiPiuSedi, kpiQuadraturaSettimana, euroKgMedioFormati } = await import('../../src/lib/inventarioProduzione.js')
const { euro } = await import('../../src/lib/formatoAnalisi.js')
const { default: AnalisiInventarioSection } = await import('../../src/views/AnalisiInventarioSection.jsx')
const { kpiSenzaIva } = await import('../../src/views/QuadraturaInventarioView.jsx')
const { default: Risposta } = await import('../../src/views/quadratura/Risposta.jsx')

const supabaseFinto = { from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) }
const SEDI = [{ id: 'A', nome: 'Carlina', attiva: true }, { id: 'B', nome: 'Berthollet', attiva: true }]
const riga = (sede, gusto, data, produzione_g, rimanenza_g) => ({ sede_id: sede, gusto_nome: gusto, data, produzione_g, rimanenza_g, scarto_g: 0, spedito_g: 0, ricevuto_g: 0 })

// Agosto ha dati solo dal 23 (la vetrina di partenza) al 30: il mese
// intero e la settimana 24-30/08 contano gli stessi giorni.
function settimana() {
  const out = []
  for (const [sede, gusto, prod, resta] of [['A', 'NOCCIOLA', 5000, 1000], ['A', 'MISTIC', 3000, 500], ['B', 'NOCCIOLA', 2000, 400]]) {
    out.push(riga(sede, gusto, '2026-08-23', 0, resta))
    for (let g = 24; g <= 30; g++) out.push(riga(sede, gusto, `2026-08-${g}`, prod, resta))
  }
  return out
}
const LUN = '2026-08-24', DOM = '2026-08-30'

async function treNumeri() {
  const produzione = ricaviStimatiSedi(RIGHE, FORMATI, { da: LUN, a: DOM, venditeB2B: VENDITE }).ricavi
  const mese = (await caricaIlMese({ supabase: supabaseFinto, orgId: 'o1', sedi: SEDI, mese: '2026-08' })).attuale.incassi.lordo
  const perSede = ['A', 'B'].map(id => ({ sedeId: id, matrice: calcolaVendutoSettimana(RIGHE.filter(r => r.sede_id === id), LUN) }))
  const k = kpiQuadraturaSettimana(matriceDiPiuSedi(perSede), [], euroKgMedioFormati(FORMATI), VENDITE)
  const quadratura = k.ricavoAtteso + k.ricaviB2b
  return { produzione, mese, quadratura }
}

describe('Lo stesso periodo, lo stesso ricavo stimato', () => {
  beforeEach(() => { RIGHE = settimana(); VENDITE = [] })

  it('senza ingrosso: Produzione, Mese e Quadratura danno lo stesso numero', async () => {
    const n = await treNumeri()
    // Venduti al giorno: A 5 + 3 kg, B 2 kg = 10 kg × 7 giorni × 30 €/kg.
    expect(n.produzione).toBeCloseTo(2100, 6)
    expect(n.mese).toBeCloseTo(n.produzione, 2)
    expect(n.quadratura).toBeCloseTo(n.produzione, 6)
  })

  it('il gusto senza ricetta (MISTIC) è dentro il ricavo: collegarlo non lo cambia', () => {
    const tutto = ricaviStimatiSedi(RIGHE, FORMATI, { da: LUN, a: DOM }).ricavi
    const senzaMistic = ricaviStimatiSedi(RIGHE.filter(r => r.gusto_nome !== 'MISTIC'), FORMATI, { da: LUN, a: DOM }).ricavi
    // 3 kg al giorno × 7 × 30 €/kg.
    expect(tutto - senzaMistic).toBeCloseTo(630, 6)
  })

  it('con l\'ingrosso, anche senza sede: i chili all\'ingrosso valgono il fatturato, non il prezzo del banco', async () => {
    VENDITE = [
      { sede_id: 'B', data: '2026-08-26', totale: 40, stato: 'consegnata', righe: [{ qta: 2, unita: 'kg' }] },
      { sede_id: null, data: '2026-08-27', totale: 25, stato: 'consegnata', righe: [{ qta: 1, unita: 'kg' }] },
    ]
    const n = await treNumeri()
    // 70 kg − 3 kg all'ingrosso = 67 kg × 30 € + 65 € fatturati.
    expect(n.produzione).toBeCloseTo(67 * 30 + 65, 6)
    expect(n.mese).toBeCloseTo(n.produzione, 2)
    expect(n.quadratura).toBeCloseTo(n.produzione, 6)
  })

  it('una vendita annullata non conta, in nessuna pagina', async () => {
    VENDITE = [{ sede_id: 'A', data: '2026-08-26', totale: 40, stato: 'annullata', righe: [{ qta: 2, unita: 'kg' }] }]
    const n = await treNumeri()
    expect(n.produzione).toBeCloseTo(2100, 6)
    expect(n.mese).toBeCloseTo(n.produzione, 2)
  })

  it('senza formati il ricavo non si sa (non zero)', () => {
    expect(ricaviStimatiSedi(RIGHE, [], { da: LUN, a: DOM }).ricavi).toBeNull()
  })
})

// ── Il numero che si vede, senza IVA ───────────────────────────────────────
// La tessera di una pagina: l'etichetta e quello che segue.
const tessera = (etichetta) => {
  const el = [...document.querySelectorAll('div')].find(d => d.textContent === etichetta && d.parentElement?.children.length >= 2)
  return el ? el.parentElement.textContent : ''
}

async function treNumeriAschermo() {
  // La Produzione, disegnata coi dati della settimana.
  render(<AnalisiInventarioSection rows={RIGHE} rowsPrev={[]} dateFrom={LUN} dateTo={DOM} confronto="nessuno"
    ricettario={{ ricette: {}, ingredienti_costi: {} }} orgId="o1" sedeId={null} sedi={SEDI} venditeB2B={VENDITE} />)
  await waitFor(() => { if (!/Ricavo stimato\d/.test(tessera('Ricavo stimato'))) throw new Error('attendo') }, { timeout: 5000 })
  const produzione = /Ricavo stimato([\d.]+ €)/.exec(tessera('Ricavo stimato'))[1]
  cleanup()
  // «Torna il conto?»: la tessera coi conti che la pagina le passa.
  const perSede = ['A', 'B'].map(id => ({ sedeId: id, matrice: calcolaVendutoSettimana(RIGHE.filter(r => r.sede_id === id), LUN) }))
  const kpi = kpiQuadraturaSettimana(matriceDiPiuSedi(perSede), [], euroKgMedioFormati(FORMATI), VENDITE)
  render(<Risposta kpi={kpiSenzaIva(kpi)} kpiPrev={null} euroKg={euroKgMedioFormati(FORMATI)} />)
  const quadratura = /Incasso stimato([\d.]+ €)/.exec(tessera('Incasso stimato'))[1]
  cleanup()
  // Il Mese: il numero della sua tessera degli incassi.
  const dati = await caricaIlMese({ supabase: supabaseFinto, orgId: 'o1', sedi: SEDI, mese: '2026-08' })
  const mese = euro(dati.attuale.conto.ricavi)
  return { produzione, quadratura, mese, kpi }
}

describe('A schermo, senza IVA: lo stesso numero nelle tre pagine', () => {
  beforeEach(() => { RIGHE = settimana(); VENDITE = [] })
  afterEach(() => cleanup())

  it('senza ingrosso: 2.100 € al banco, 1.909 € senza IVA, uguale nelle tre pagine', async () => {
    const n = await treNumeriAschermo()
    expect(n.produzione).toBe('1.909 €')
    expect(n.quadratura).toBe('1.909 €')
    expect(n.mese).toBe('1.909 €')
  })

  it('la Produzione scrive «senza IVA» sotto il numero', async () => {
    render(<AnalisiInventarioSection rows={RIGHE} rowsPrev={[]} dateFrom={LUN} dateTo={DOM} confronto="nessuno"
      ricettario={{ ricette: {}, ingredienti_costi: {} }} orgId="o1" sedeId={null} sedi={SEDI} />)
    await waitFor(() => expect(tessera('Ricavo stimato')).toMatch(/senza IVA \(10%\)/), { timeout: 5000 })
  })

  it('con l\'ingrosso: la Produzione e il Mese uguali; la Quadratura dà il banco, e col fatturato fa lo stesso', async () => {
    VENDITE = [
      { sede_id: 'B', data: '2026-08-26', totale: 40, stato: 'consegnata', righe: [{ qta: 2, unita: 'kg' }] },
      { sede_id: null, data: '2026-08-27', totale: 25, stato: 'consegnata', righe: [{ qta: 1, unita: 'kg' }] },
    ]
    const n = await treNumeriAschermo()
    // (67 kg × 30 € + 65 €) / 1,10 = 1.886,36 €.
    expect(n.produzione).toBe('1.886 €')
    expect(n.mese).toBe('1.886 €')
    // La Quadratura confronta il banco con la cassa: 67 × 30 / 1,10.
    expect(n.quadratura).toBe('1.827 €')
    const k = kpiSenzaIva(n.kpi)
    expect(k.ricavoAtteso + k.ricaviB2b).toBeCloseTo(1886.36, 1)
  })
})
