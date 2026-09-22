// @vitest-environment happy-dom
//
// Una domanda, una risposta.
//
// Il difetto, trovato il 22/09/2026 leggendo le due pagine una accanto
// all'altra: alla domanda «quanto devo riordinare» il Magazzino e Ordini AI
// rispondevano con DUE formule diverse. Sulla farina del design partner — 2 kg
// al giorno, soglia 10 kg, 10 kg in magazzino, fornitore che passa ogni 7
// giorni — il Magazzino diceva «ordina 18 kg» e Ordini AI «ordina 28 kg».
// Corretto sostituendo entrambe le pagine con `src/lib/riordino.js`, l'unica
// formula (vedi `tests/unit/riordinoUnaFormulaSola.test.js`).
//
// Questo test monta TUTTE E DUE LE PAGINE VERE con dati equivalenti sullo
// stesso ingrediente e legge cosa scrivono a schermo: prima di questa
// correzione sarebbe stato impossibile scriverlo, perché non esisteva un
// unico numero da controllare.
//
// I dati arrivano alle due pagine da fonti diverse, come nella vita vera: il
// Magazzino riceve `giornaliero` (produzione di laboratorio) come prop, Ordini
// AI legge `chiusure` (vendite di cassa) da solo con `sload`. Sono costruiti
// apposta perché il consumo giornaliero calcolato dalle due fonti torni
// identico (1.000 g/giorno), cosi' la sola cosa che puo' far divergere il
// numero finale e' la formula — che ora e' la stessa.
//
// I due formati di stampa restano legittimamente diversi (il Magazzino segue
// il toggle kg/g della pagina con 2 decimali, Ordini AI mostra sempre un
// decimale in kg): si confronta il NUMERO in grammi che ciascuna pagina
// scrive, non il testo carattere per carattere.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import { todayLocal } from '../../src/lib/dateLocal'

function fluente(res = { data: [], error: null }) {
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(res)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return new Proxy({}, h)
}
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    // Nessun fornitore, nessuna fattura: Ordini AI non impara nessuna cadenza,
    // esattamente come il Magazzino non la conosce mai. E' la condizione in
    // cui le due pagine hanno a disposizione la STESSA informazione.
    from: () => fluente(), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))

// Ordini AI carica magazzino/chiusure/ricettario da solo con `sload`; il
// Magazzino invece li riceve come prop (li carica chi lo monta). Lo store qui
// sotto serve solo al mock di `sload`.
const perOrdiniAi = { magazzino: null, chiusure: null, ricettario: null }
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {},
  sload: async (key) => {
    if (key === 'pasticceria-magazzino-v1') return perOrdiniAi.magazzino
    if (key === 'pasticceria-chiusure-v1') return perOrdiniAi.chiusure
    if (key === 'pasticceria-ricettario-v1') return perOrdiniAi.ricettario
    return null
  },
  ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { default: MagazzinoView } = await import('../../src/views/MagazzinoView.jsx')
const { default: OrdiniAiView } = await import('../../src/views/OrdiniAiView.jsx')

const oggi = todayLocal()

const ricettario = {
  ricette: {
    r1: { nome: 'TORTA', tipo: 'torta', porzioni: 8, prezzo: 20,
      ingredienti: [{ nome: 'farina 00', qty1stampo: 1000 }] },
  },
  ingredienti_costi: {},
}

// 10 kg in magazzino, soglia 10 kg: sotto soglia per Ordini AI, "critico" per
// il Magazzino — lo stesso trigger, letto con le due parole di ciascuna pagina.
const magazzino = { 'farina 00': { giacenza_g: 10000, soglia_g: 10000, nome: 'Farina 00' } }

// 7 stampi in un giorno solo = 7.000 g nella finestra dei 7 giorni del
// Magazzino → 1.000 g/giorno.
const giornaliero = [{ data: oggi, prodotti: [{ nome: 'TORTA', stampi: 7 }] }]

// 30 unità vendute in un giorno solo = 30.000 g nella finestra fissa dei 30
// giorni di Ordini AI, divisi per 30 → 1.000 g/giorno: stesso numero della
// riga sopra, misurato da una fonte diversa (vendite invece di produzione).
const chiusure = [{ data: oggi, venduto: [{ nome: 'TORTA', unitaV: 30 }] }]

const propsMagazzino = {
  ricettario, magazzino, giornaliero,
  setMagazzino: () => {}, logRif: [], setLogRif: () => {}, logPrezzi: [],
  notify: () => {}, orgId: 'org-1', sedeId: 's1',
}

/** Il numero scritto dalla pagina, in grammi — non il testo: i formati
 * (decimali, kg/g) restano legittimamente diversi fra le due pagine. */
function grammiDaTesto(testo) {
  const t = String(testo || '').trim()
  const num = (s) => parseFloat(s.replace(/\./g, '').replace(',', '.'))
  const kg = t.match(/([\d.,]+)\s*kg/)
  if (kg) return Math.round(num(kg[1]) * 1000)
  const g = t.match(/([\d.,]+)\s*g\b/)
  if (g) return Math.round(num(g[1]))
  return null
}

beforeEach(() => {
  cleanup()
  perOrdiniAi.magazzino = magazzino
  perOrdiniAi.chiusure = chiusure
  perOrdiniAi.ricettario = ricettario
})

describe('la stessa farina, la stessa risposta', () => {
  it('il Magazzino e Ordini AI suggeriscono la stessa quantità da ordinare', async () => {
    const vMag = render(<MagazzinoView {...propsMagazzino} />)
    await waitFor(() => expect(vMag.container.textContent).toContain('Lista di riordino'))
    const cardMag = vMag.container.querySelector('#riordino-urgente')
    expect(cardMag, 'la farina è "critica" (giacenza = soglia): deve comparire nella lista').toBeTruthy()
    const rigaMag = [...cardMag.querySelectorAll('tbody tr')]
      .find(tr => tr.textContent.toLowerCase().includes('farina'))
    expect(rigaMag, 'la farina deve comparire nella lista di riordino del Magazzino').toBeTruthy()
    // Colonne della tabella: Ingrediente, Da chi, Giacenza, Giorni scorta,
    // Da ordinare, Costo stimato, azioni.
    const grammiMag = grammiDaTesto(rigaMag.querySelectorAll('td')[4].textContent)

    const vAi = render(<OrdiniAiView orgId="org-1" sedeId="s1" notify={() => {}} />)
    await waitFor(() => expect(vAi.container.textContent.toLowerCase()).toContain('farina'))
    const rigaAi = [...vAi.container.querySelectorAll('tbody tr')]
      .find(tr => tr.textContent.toLowerCase().includes('farina'))
    expect(rigaAi, 'la farina deve comparire nella lista di Ordini AI').toBeTruthy()
    // Colonne della tabella: Ingrediente, Da chi, Giacenza, Soglia,
    // Cons. medio/gg, Gg rimasti, Da ordinare.
    const grammiAi = grammiDaTesto(rigaAi.querySelectorAll('td')[6].textContent)

    expect(grammiMag).not.toBeNull()
    expect(grammiAi).not.toBeNull()
    // Prima della formula unica (22/09/2026) qui sarebbero usciti due numeri
    // diversi, come 18.000 contro 28.000 sulla farina vera di Mara.
    expect(grammiMag).toBe(grammiAi)
    expect(grammiMag).toBe(10000)
  })
})
