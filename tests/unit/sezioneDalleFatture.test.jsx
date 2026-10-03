// @vitest-environment happy-dom
//
// ── La sezione «Dalle fatture», a schermo ────────────────────────────────
//
// 03/10/2026. Le righe delle fatture elettroniche (lo ZIP dell'Agenzia)
// diventano prezzi delle materie prime quando il titolare abbina una volta
// fornitore + descrizione a una materia prima. Il conto è provato in
// `prezziDalleFatture.test.js`; qui si prova che la schermata lo usa davvero,
// e le cose che una schermata sbaglia in silenzio:
//
//   • una lettura della mappa fallita presa per «mappa vuota» farebbe
//     riscrivere al primo abbinamento una mappa con dentro solo quello —
//     tutti gli altri abbinamenti sparirebbero. Se la lettura non riesce, la
//     sezione lo dice e non lascia abbinare niente;
//   • un salvataggio rifiutato non deve cambiare niente a schermo;
//   • mappa, listino e storico entrano in una scrittura sola;
//   • sul tablet e sul telefono i comandi si toccano col dito (44 px).
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react'

// ── Il database finto ─────────────────────────────────────────────────────
const db = { fatture: [], userData: [], erroreUserData: null }
vi.mock('../../src/lib/supabase', () => {
  const from = (nome) => {
    const q = {}
    for (const m of ['select', 'eq', 'not', 'gte', 'lte', 'is', 'in', 'order', 'range']) q[m] = () => q
    q.then = (ok, ko) => {
      const res = nome === 'user_data'
        ? (db.erroreUserData ? { data: null, error: { message: db.erroreUserData } } : { data: db.userData, error: null })
        : { data: db.fatture, error: null }
      return Promise.resolve(res).then(ok, ko)
    }
    return q
  }
  return { supabase: { from } }
})

const { default: PrezziDaFattureSection } = await import('../../src/views/PrezziDaFattureSection.jsx')
const { chiaveGruppo, abbina } = await import('../../src/lib/prezziDaFatture.js')

const CONO = 'CONO ARTIC COMMERCIALE SRL'
const riga = (descrizione, quantita, unita, totale) => ({ n: 1, codice: null, descrizione, quantita, unita, prezzo_unitario: Math.round(totale / quantita * 10000) / 10000, totale, iva_pct: 10 })
const fattura = (numero, data, righe, extra = {}) => ({ id: `f-${numero}`, numero_rif: numero, data_fattura: data, fornitore: CONO, tipo: 'fattura', totale: 100, righe, ...extra })

const RICETTARIO = { ricette: {}, ingredienti_costi: { panna: { costoKg: 4.98, costoG: 0.00498 }, zucchero: { costoKg: 0.89, costoG: 0.00089 } } }
const LOG = [{ id: 'm1', data: '2026-09-17T10:00:00.000Z', decorre_da: '2025-12-31T00:00:00.000Z', ingrediente: 'panna', prezzoVecchio: null, prezzoNuovo: 4.98 }]
const MATERIE = [{ key: 'panna', nome: 'panna' }, { key: 'zucchero', nome: 'zucchero' }]

function prepara({ mappa = null, fatture } = {}) {
  db.erroreUserData = null
  db.fatture = fatture || [
    fattura('1', '2026-01-10', [riga('PANNA FRESCA 35% UHT', 10, 'KG', 49.8), riga('DETERSIVO PIATTI 5 LT', 2, 'PZ', 20)]),
    fattura('2', '2026-02-10', [riga('PANNA FRESCA 35% UHT', 10, 'KG', 51), riga('SPESE DI TRASPORTO', 1, 'NR', 8)]),
  ]
  db.userData = [
    { data_key: 'pasticceria-ricettario-v1', data_value: RICETTARIO, updated_at: '2026-10-01' },
    { data_key: 'pasticceria-log-prezzi-v1', data_value: LOG, updated_at: '2026-10-01' },
    ...(mappa ? [{ data_key: 'pasticceria-abbinamenti-fatture-v1', data_value: mappa, updated_at: '2026-10-01' }] : []),
  ]
}

const apri = (p = {}) => {
  const onScriviPrezzi = p.onScriviPrezzi || vi.fn(async () => ({ ok: true }))
  const notify = vi.fn()
  const r = render(
    <PrezziDaFattureSection orgId="org" ricettario={RICETTARIO} logPrezzi={LOG} materie={MATERIE}
      utente="titolare@x.it" onScriviPrezzi={onScriviPrezzi} notify={notify} onTornaAlListino={() => {}}
      onNavigate={p.onNavigate} isMobile={false} dito={!!p.dito} />,
  )
  return { ...r, onScriviPrezzi, notify }
}
const testo = () => document.body.textContent || ''
const bottone = (re) => [...document.querySelectorAll('button')].find(b => re.test(b.textContent || ''))

afterEach(() => cleanup())

describe('Si vede quello che c\'è da abbinare', () => {
  it('i prodotti, la spesa, l\'ultimo prezzo e la proposta', async () => {
    prepara()
    apri()
    await waitFor(() => expect(testo()).toMatch(/PANNA FRESCA 35% UHT/))
    expect(testo()).toMatch(/2 fatture con il dettaglio · 3 prodotti/)
    expect(testo()).toMatch(/Da abbinare\s*2/)
    expect(testo()).toMatch(/Ultimo prezzo\s*5,10 €\/kg/)
    expect(testo()).toMatch(/101 €/)
    // La proposta col nome della materia prima.
    expect(bottone(/^\s*È panna/)).toBeTruthy()
    // Il trasporto lo esclude la riga da sola: non è fra quelli da abbinare.
    expect(testo()).not.toMatch(/SPESE DI TRASPORTO/)
    // Il detersivo a pezzi senza peso: non lo so, non zero.
    expect(testo()).toMatch(/Prezzo al chilo: non lo so/)
  })

  it('senza fatture col dettaglio dice dove caricarle', async () => {
    prepara({ fatture: [] })
    const onNavigate = vi.fn()
    apri({ onNavigate })
    await waitFor(() => expect(testo()).toMatch(/Nessuna fattura ha ancora il dettaglio/))
    act(() => { fireEvent.click(bottone(/Vai allo Scadenzario/)) })
    expect(onNavigate).toHaveBeenCalledWith('scadenzario')
  })

  it('se la mappa non si legge lo dice, e non lascia abbinare niente', async () => {
    prepara()
    db.erroreUserData = 'permesso negato'
    apri()
    await waitFor(() => expect(testo()).toMatch(/Non sono riuscito a leggere le fatture \(permesso negato\)/))
    expect(bottone(/È panna|Abbina|Non è una materia prima/)).toBeFalsy()
  })
})

describe('Abbinare scrive mappa, listino e storico insieme', () => {
  it('«È panna»: una scrittura sola, e il prezzo nuovo nel listino', async () => {
    prepara()
    const { onScriviPrezzi, notify } = apri()
    await waitFor(() => expect(bottone(/^\s*È panna/)).toBeTruthy())
    await act(async () => { fireEvent.click(bottone(/^\s*È panna/)) })
    expect(onScriviPrezzi).toHaveBeenCalledTimes(1)
    const [p, altri] = onScriviPrezzi.mock.calls[0]
    expect(p.ingredientiCosti.panna).toEqual({ costoKg: 5.1, costoG: 0.0051 })
    expect(p.logPrezzi[0]).toMatchObject({ prezzoNuovo: 5.1, origine: { tipo: 'fattura', numero: '2' }, utente: 'titolare@x.it' })
    expect(altri).toHaveLength(1)
    expect(altri[0].key).toBe('pasticceria-abbinamenti-fatture-v1')
    expect(altri[0].value.gruppi[chiaveGruppo(CONO, 'PANNA FRESCA 35% UHT')]).toMatchObject({ tipo: 'materia', chiave: 'panna' })
    expect(notify.mock.calls[0][0]).toMatch(/ora è panna\. Listino: 5,10 €\/kg/)
    await waitFor(() => expect(testo()).toMatch(/Da abbinare\s*1/))
  })

  it('cercare un\'altra materia prima e abbinarla', async () => {
    prepara()
    const { onScriviPrezzi } = apri()
    await waitFor(() => expect(bottone(/Scegli un'altra/)).toBeTruthy())
    act(() => { fireEvent.click(bottone(/Scegli un'altra/)) })
    const campo = document.querySelector('input[id^="cerca-"]')
    act(() => { fireEvent.change(campo, { target: { value: 'zucch' } }) })
    await act(async () => { fireEvent.click(bottone(/^\s*zucchero\s*$/)) })
    const [, altri] = onScriviPrezzi.mock.calls[0]
    expect(Object.values(altri[0].value.gruppi)[0]).toMatchObject({ chiave: 'zucchero' })
  })

  it('«Non è una materia prima» scrive solo la mappa', async () => {
    prepara()
    const { onScriviPrezzi } = apri()
    await waitFor(() => expect(testo()).toMatch(/DETERSIVO/))
    const bottoni = [...document.querySelectorAll('button')].filter(b => /Non è una materia prima/.test(b.textContent))
    await act(async () => { fireEvent.click(bottoni[bottoni.length - 1]) })
    const [p, altri] = onScriviPrezzi.mock.calls[0]
    expect(p).toBeNull()
    expect(Object.values(altri[0].value.gruppi)[0].tipo).toBe('no')
    await waitFor(() => expect(testo()).toMatch(/Esclusi\s*2/))
  })

  it('se il salvataggio è rifiutato non cambia niente a schermo', async () => {
    prepara()
    const { notify } = apri({ onScriviPrezzi: vi.fn(async () => ({ ok: false, errore: 'rete' })) })
    await waitFor(() => expect(bottone(/^\s*È panna/)).toBeTruthy())
    await act(async () => { fireEvent.click(bottone(/^\s*È panna/)) })
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/Non sono riuscito a salvare \(rete\)/), false)
    expect(testo()).toMatch(/Da abbinare\s*2/)
  })
})

describe('Il prezzo sospetto si conferma a mano', () => {
  it('dieci volte il prezzo di oggi: compare in cima, e «Applica» lo scrive', async () => {
    const k = chiaveGruppo(CONO, 'PANNA FRESCA 35% UHT')
    prepara({
      mappa: abbina(null, k, { tipo: 'materia', chiave: 'panna', nome: 'panna' }),
      fatture: [fattura('9', '2026-03-10', [riga('PANNA FRESCA 35% UHT', 10, 'KG', 498)])],
    })
    const { onScriviPrezzi } = apri()
    await waitFor(() => expect(testo()).toMatch(/Un prezzo da confermare/))
    expect(testo()).toMatch(/49,80 €\/kg, prima 4,98 €\/kg/)
    await act(async () => { fireEvent.click(bottone(/^Applica$/)) })
    const [p] = onScriviPrezzi.mock.calls[0]
    expect(p.ingredientiCosti.panna.costoKg).toBe(49.8)
  })
})

// ── La scrittura vera: useBolle ─────────────────────────────────────────

const { default: useBolle } = await import('../../src/hooks/useBolle.js')
const { renderHook } = await import('@testing-library/react')
const { EVENTO_PREZZI_SCRITTI } = await import('../../src/lib/storageKeys.js')

function gancio(ssaveTutto) {
  const set = { ric: vi.fn(), logPrezzi: vi.fn(), magazzino: vi.fn(), logRif: vi.fn() }
  const chiavi = { SK_RIC: 'pasticceria-ricettario-v1', SK_LOG_PRZ: 'pasticceria-log-prezzi-v1', SK_MAG: 'm', SK_LOGRIF: 'r' }
  const { result, unmount } = renderHook(() => useBolle({ magazzino: {}, logRif: [], ricettario: RICETTARIO, logPrezzi: LOG, utente: 'u', chiavi, ssaveTutto, set }))
  return { result, set, unmount }
}

describe('useBolle scrive i prezzi delle fatture come quelli di una bolla', () => {
  it('listino, storico e mappa in una scrittura, e lo stato cambia solo dopo', async () => {
    const ssaveTutto = vi.fn(async () => {})
    const { result, set } = gancio(ssaveTutto)
    const costi = { ...RICETTARIO.ingredienti_costi, panna: { costoKg: 5.1, costoG: 0.0051 } }
    const r = await result.current.scriviPrezzi({ ingredientiCosti: costi, logPrezzi: [{ id: 'n' }, ...LOG] }, [{ key: 'pasticceria-abbinamenti-fatture-v1', value: { gruppi: {} } }])
    expect(r).toEqual({ ok: true })
    expect(ssaveTutto).toHaveBeenCalledTimes(1)
    expect(ssaveTutto.mock.calls[0][0].map(i => i.key)).toEqual(['pasticceria-ricettario-v1', 'pasticceria-log-prezzi-v1', 'pasticceria-abbinamenti-fatture-v1'])
    expect(ssaveTutto.mock.calls[0][0][0].value.ricette).toEqual(RICETTARIO.ricette)
    expect(set.ric).toHaveBeenCalledWith(expect.objectContaining({ ingredienti_costi: costi }))
    expect(set.logPrezzi).toHaveBeenCalledTimes(1)
  })

  it('se il database dice no, lo stato non si tocca', async () => {
    const { result, set } = gancio(vi.fn(async () => { throw new Error('rete caduta') }))
    const r = await result.current.scriviPrezzi({ ingredientiCosti: {}, logPrezzi: [] }, [])
    expect(r).toEqual({ ok: false, errore: 'rete caduta' })
    expect(set.ric).not.toHaveBeenCalled()
    expect(set.logPrezzi).not.toHaveBeenCalled()
  })

  it('solo la mappa: listino e storico non si riscrivono', async () => {
    const ssaveTutto = vi.fn(async () => {})
    const { result, set } = gancio(ssaveTutto)
    await result.current.scriviPrezzi(null, [{ key: 'pasticceria-abbinamenti-fatture-v1', value: {} }])
    expect(ssaveTutto.mock.calls[0][0].map(i => i.key)).toEqual(['pasticceria-abbinamenti-fatture-v1'])
    expect(set.ric).not.toHaveBeenCalled()
  })

  it('quando il caricamento degli XML scrive i prezzi, lo stato in memoria si rimette in pari', () => {
    const { set, unmount } = gancio(vi.fn())
    const ricettario = { ricette: {}, ingredienti_costi: { panna: { costoKg: 5.1, costoG: 0.0051 } } }
    act(() => { window.dispatchEvent(new CustomEvent(EVENTO_PREZZI_SCRITTI, { detail: { ricettario, logPrezzi: [{ id: 'x' }] } })) })
    expect(set.ric).toHaveBeenCalledWith(ricettario)
    expect(set.logPrezzi).toHaveBeenCalledWith([{ id: 'x' }])
    // Smontata la pagina, non ascolta più.
    unmount()
    act(() => { window.dispatchEvent(new CustomEvent(EVENTO_PREZZI_SCRITTI, { detail: { ricettario, logPrezzi: [] } })) })
    expect(set.ric).toHaveBeenCalledTimes(1)
  })
})

describe('Sul tablet si tocca col dito', () => {
  it('i comandi sono alti 44 px', async () => {
    prepara()
    apri({ dito: true })
    await waitFor(() => expect(bottone(/^\s*È panna/)).toBeTruthy())
    expect(bottone(/^\s*È panna/).style.minHeight).toBe('44px')
    expect(bottone(/Torna al listino/).style.minHeight).toBe('44px')
  })
})
