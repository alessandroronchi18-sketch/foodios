// @vitest-environment happy-dom
//
// Costi fissi: le spese che arrivano già in fattura, e i doppioni.
//
// Domanda del titolare, 05/10/2026: «come inserisco i costi fissi, non si
// inseriscono automaticamente dalle fatture che arrivano?». Le fatture
// entrano già da sole nel conto; la pagina Costi fissi serve per le spese
// senza fattura. Ma la pagina non lo diceva da nessuna parte: chi scriveva
// «Luce, 1.800 € al mese» la faceva contare due volte (la fattura Enel e la
// voce), e nessun numero lo segnalava. Per Mara: zero voci in Costi fissi,
// Enel 1.881 € al mese, garage, Fastweb e Wind Tre fatturati tutti i mesi.
//
// Ora: in cima le spese fisse già dalle fatture (con la media al mese), e il
// modulo avverte quando la voce è probabilmente una di quelle.

import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'

vi.mock('../../src/lib/supabase', () => {
  const RES = { data: [], error: null }
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(RES)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return { supabase: { from: () => new Proxy({}, h), rpc: () => Promise.resolve({ data: null, error: null }) } }
})
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false, useDevice: () => 'computer' }))
vi.mock('../../src/lib/dateLocal', async (orig) => ({ ...(await orig()), todayLocal: () => '2026-10-05' }))

let FATTURE = []
let LETTURA_ROTTA = false
const salvate = []
vi.mock('../../src/lib/contoEconomicoArchivio', async (orig) => ({
  ...(await orig()),
  leggiFatturePeriodo: async () => { if (LETTURA_ROTTA) throw new Error('rete giù'); return { fatture: FATTURE } },
  leggiCategorieFornitori: async () => ({ fornitori: [], categoriePerFornitore: {} }),
}))
vi.mock('../../src/lib/costiAziendali', async (orig) => ({
  ...(await orig()),
  caricaCostiAziendali: async () => [],
  salvaVoceCosto: async (v) => { salvate.push(v); return v },
}))

const { speseRicorrenti, doppioneProbabile, testoDoppione, VOCE_DEL_CONTO } = await import('../../src/lib/speseRicorrenti.js')
const { fraseSenzaVoce } = await import('../../src/components/costiFissi/GiaDalleFatture.jsx')
const { default: CostiAziendaliView } = await import('../../src/views/CostiAziendaliView.jsx')
const { chiaveFornitore } = await import('../../src/lib/contoEconomico.js')

const SEDI = [{ id: 'C', nome: 'Carlina' }, { id: 'B', nome: 'Berthollet' }]
// Una fattura al mese, dal mese `da` al mese `a` (AAAA-MM), imponibile fisso.
function mensili(fornitore, imponibile, da, a, extra = {}) {
  const out = []
  for (let m = da; m <= a;) {
    out.push({ fornitore, data_fattura: `${m}-10`, imponibile, imposta: imponibile * 0.22, totale: imponibile * 1.22, sede_id: 'C', numero_rif: `${fornitore}-${m}`, ...extra })
    const [y, mm] = m.split('-').map(Number)
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`
  }
  return out
}
const OGGI = '2026-10-05'   // finestra: ottobre 2025 – settembre 2026

beforeEach(() => { FATTURE = []; LETTURA_ROTTA = false; salvate.length = 0 })
afterEach(() => cleanup())
const testo = () => document.body.textContent || ''

describe('quali spese arrivano già in fattura', () => {
  it('una fattura al mese per dodici mesi: c\'è, con la media al mese senza IVA', () => {
    const r = speseRicorrenti(mensili('ENEL ENERGIA S.P.A.', 1500, '2025-10', '2026-09'), { oggi: OGGI, sedi: SEDI })
    expect(r.finestra).toEqual({ da: '2025-10', a: '2026-09' })
    expect(r.voci).toHaveLength(1)
    const e = r.voci[0]
    expect(e.nome).toBe('ENEL ENERGIA')
    expect(e.voce).toBe('utenze')
    expect(e.proposta).toBe(true)         // la voce l'ha proposta Foodos dal nome
    expect(e.mediaMese).toBeCloseTo(1500, 6)
    expect([e.mesiCon, e.mesiFinestra]).toEqual([12, 12])
    expect(e.sedi).toEqual(['Carlina'])
    expect(r.totaleMese).toBeCloseTo(1500, 6)
  })

  it('cominciato da maggio: la media è sui mesi da maggio, non su dodici', () => {
    const r = speseRicorrenti(mensili('FASTWEB SPA', 100, '2026-05', '2026-09'), { oggi: OGGI })
    expect(r.voci[0].mediaMese).toBeCloseTo(100, 6)
    expect(r.voci[0].mesiFinestra).toBe(5)
  })

  it('non regolari, o finiti, non ci sono', () => {
    const due = mensili('WIND TRE S.P.A.', 30, '2026-08', '2026-09')                 // solo due mesi
    const finito = mensili('FASTWEB SPA', 80, '2025-10', '2026-06')                  // l'ultima a giugno
    const a_buchi = [...mensili('IREN SPA', 200, '2025-10', '2025-12'), ...mensili('IREN SPA', 200, '2026-09', '2026-09')]
    const r = speseRicorrenti([...due, ...finito, ...a_buchi], { oggi: OGGI })
    expect(r.voci.map(v => v.nome)).toEqual([])
  })

  it('materie prime, confezioni e commissioni delle app non sono spese fisse', () => {
    const r = speseRicorrenti([
      ...mensili('CONO ARTIC COMMERCIALE SRL', 4000, '2025-10', '2026-09'),
      ...mensili('FOODINHO S.R.L.', 900, '2025-10', '2026-09'),
      ...mensili('ENEL ENERGIA S.P.A.', 1500, '2025-10', '2026-09'),
    ], { oggi: OGGI })
    expect(r.voci.map(v => v.nome)).toEqual(['ENEL ENERGIA'])
  })

  it('la voce data al fornitore vince sulla proposta, e allora non è «proposta»', () => {
    const mappa = { [chiaveFornitore('ENEL ENERGIA S.P.A.')]: 'servizi' }
    const r = speseRicorrenti(mensili('ENEL ENERGIA S.P.A.', 1500, '2025-10', '2026-09'), { oggi: OGGI, categoriePerFornitore: mappa })
    expect(r.voci[0]).toMatchObject({ voce: 'servizi', nomeVoce: 'Servizi', proposta: false })
  })

  it('un fornitore messo «fuori conto» o fra le materie prime non è una spesa fissa', () => {
    const mappa = { [chiaveFornitore('ENEL ENERGIA S.P.A.')]: 'materie-prime' }
    const r = speseRicorrenti(mensili('ENEL ENERGIA S.P.A.', 1500, '2025-10', '2026-09'), { oggi: OGGI, categoriePerFornitore: mappa })
    expect(r.voci).toEqual([])
    expect(r.senzaVoce).toEqual([])
  })

  it('i ricorrenti di cui non si sa la voce stanno a parte, per chiederla', () => {
    const r = speseRicorrenti([...mensili('PRONTOSERVICE S.R.L.', 3000, '2025-10', '2026-09'), ...mensili('ENEL ENERGIA S.P.A.', 1500, '2025-10', '2026-09')], { oggi: OGGI })
    expect(r.senzaVoce.map(v => v.nome)).toEqual(['PRONTOSERVICE'])
    expect(r.totaleMese).toBeCloseTo(1500, 6)   // i senza voce non entrano nel totale delle fisse
    expect(fraseSenzaVoce(r.senzaVoce)).toBe('Un altro fornitore ti fattura tutti i mesi ma non ha ancora una voce: finché non ce l\'ha, il conto non sa se è una spesa fissa o materia prima.')
    expect(fraseSenzaVoce([...r.senzaVoce, ...r.senzaVoce])).toMatch(/^Altri 2 fornitori ti fatturano tutti i mesi ma non hanno ancora una voce/)
  })

  it('senza imponibile si conta il totale, e lo si dice', () => {
    const r = speseRicorrenti(mensili('ENEL ENERGIA S.P.A.', 1000, '2025-10', '2026-09').map(f => ({ ...f, imponibile: null, imposta: null })), { oggi: OGGI })
    expect(r.voci[0].mediaMese).toBeCloseTo(1220, 6)
    expect(r.voci[0].conIva).toBe(true)
  })

  it('le assicurazioni di Costi fissi corrispondono ai Servizi del conto', () => {
    expect(VOCE_DEL_CONTO.assicurazioni).toBe('servizi')
    expect(VOCE_DEL_CONTO.affitti).toBe('affitto')
  })
})

describe('il doppione probabile', () => {
  const R = speseRicorrenti([
    ...mensili('ENEL ENERGIA S.P.A.', 1500, '2025-10', '2026-09'),
    ...mensili('FASTWEB SPA', 80, '2025-10', '2026-09'),
    ...mensili('AUTORIMESSA ALBERTINA SNC', 200, '2025-10', '2026-09'),
  ], { oggi: OGGI, sedi: SEDI })

  it('per nome: «Enel negozio» è Enel, qualunque categoria si scelga', () => {
    const d = doppioneProbabile({ categoria: 'altro', voce: 'Enel negozio' }, R, { sedi: SEDI })
    expect(d).toMatchObject({ tipo: 'nome', forte: true })
    expect(testoDoppione(d)).toBe('ENEL ENERGIA ti manda già una fattura ogni mese (1.500 € in media): è già nel conto. Aggiungila qui solo se è un\'altra spesa.')
  })

  it('per parola: «Luce» con delle utenze ricorrenti è forte', () => {
    const d = doppioneProbabile({ categoria: 'altro', voce: 'Luce' }, R, { sedi: SEDI })
    expect(d).toMatchObject({ tipo: 'parola', forte: true })
    expect(testoDoppione(d)).toMatch(/^Per le utenze ti arrivano già le fatture di ENEL ENERGIA \(1\.500 € al mese\) e FASTWEB \(80 € al mese\): sono già nel conto/)
  })

  it('per sola categoria: è un\'informazione (l\'affitto del negozio spesso non ha fattura)', () => {
    const d = doppioneProbabile({ categoria: 'affitti', voce: 'Affitto' }, R, { sedi: SEDI })
    expect(d).toMatchObject({ tipo: 'voce', forte: false })
    expect(testoDoppione(d)).toBe('Per gli affitti ti arriva già in fattura AUTORIMESSA ALBERTINA (200 € al mese), che è già nel conto. Se questa è un\'altra spesa, senza fattura, va bene qui.')
  })

  it('il nome della sede non fa scattare niente (CARLINA21 SRL non è l\'affitto di Carlina)', () => {
    const conSocieta = speseRicorrenti(mensili('CARLINA21 SRL', 500, '2025-10', '2026-09'), { oggi: OGGI })
    const d = doppioneProbabile({ categoria: 'assicurazioni', voce: 'Assicurazione Carlina' }, conSocieta, { sedi: SEDI })
    expect(d).toBeNull()
  })

  it('una spesa che non arriva in fattura non ha avvisi', () => {
    expect(doppioneProbabile({ categoria: 'assicurazioni', voce: 'RC Generali' }, R, { sedi: SEDI })).toBeNull()
    expect(doppioneProbabile({ categoria: 'utenze', voce: 'Luce' }, null)).toBeNull()
    expect(testoDoppione(null)).toBe('')
  })
})

describe('la pagina', () => {
  it('il difetto: le spese con la fattura si vedono in cima, e la pagina dice che sono già nel conto', async () => {
    FATTURE = [...mensili('ENEL ENERGIA S.P.A.', 1500, '2025-10', '2026-09'), ...mensili('WIND TRE S.P.A.', 30, '2025-10', '2026-09')]
    render(<CostiAziendaliView orgId="o1" sedeId={null} sedi={SEDI} notify={() => {}} />)
    await waitFor(() => expect(testo()).toMatch(/Già dalle fatture: 1\.530 € al mese/))
    const t = screen.getByRole('table', { name: 'Spese fisse già dalle fatture' }).textContent
    expect(t).toMatch(/ENEL ENERGIA/)
    expect(t).toMatch(/12 su 12/)
    expect(testo()).toMatch(/Sono già nel conto: non aggiungerle qui sotto/)
    expect(testo()).toMatch(/Le spese senza fattura/)
  })

  it('scrivere «Luce» avverte, e il pulsante dice «Aggiungi lo stesso»; si può salvare lo stesso', async () => {
    FATTURE = mensili('ENEL ENERGIA S.P.A.', 1500, '2025-10', '2026-09')
    render(<CostiAziendaliView orgId="o1" sedeId={null} sedi={SEDI} notify={() => {}} />)
    await waitFor(() => expect(testo()).toMatch(/Già dalle fatture/))
    fireEvent.click(screen.getAllByRole('button', { name: /Aggiungi (nuova voce|la prima voce)/ })[0])
    const descr = screen.getByPlaceholderText(/Coppette piccole/)
    fireEvent.change(descr, { target: { value: 'Luce' } })
    expect(testo()).toMatch(/Per le utenze ti arrivano già le fatture di ENEL ENERGIA/)
    const salva = screen.getByRole('button', { name: 'Aggiungi lo stesso' })
    fireEvent.change(document.querySelector('input[type="number"], input[inputmode="decimal"]') || screen.getAllByRole('textbox')[1], { target: { value: '100' } })
    fireEvent.click(salva)
    await waitFor(() => expect(salvate).toHaveLength(1))
  })

  it('una voce che non arriva in fattura: niente avviso, il pulsante normale', async () => {
    FATTURE = mensili('ENEL ENERGIA S.P.A.', 1500, '2025-10', '2026-09')
    render(<CostiAziendaliView orgId="o1" sedeId={null} sedi={SEDI} notify={() => {}} />)
    await waitFor(() => expect(testo()).toMatch(/Già dalle fatture/))
    fireEvent.click(screen.getAllByRole('button', { name: /Aggiungi (nuova voce|la prima voce)/ })[0])
    fireEvent.change(screen.getByPlaceholderText(/Coppette piccole/), { target: { value: 'Assicurazione RC' } })
    expect(testo()).not.toMatch(/già nel conto\. Aggiungila/)
    expect(screen.queryByRole('button', { name: 'Aggiungi lo stesso' })).toBeNull()
  })

  it('«Dai la voce» apre la scelta delle voci, e si torna ai costi fissi', async () => {
    FATTURE = [...mensili('PRONTOSERVICE S.R.L.', 3000, '2025-10', '2026-09'), ...mensili('ENEL ENERGIA S.P.A.', 1500, '2025-10', '2026-09')]
    render(<CostiAziendaliView orgId="o1" sedeId={null} sedi={SEDI} notify={() => {}} />)
    await waitFor(() => expect(testo()).toMatch(/Un altro fornitore ti fattura tutti i mesi/))
    fireEvent.click(screen.getByRole('button', { name: 'Dai la voce' }))
    await screen.findByRole('button', { name: /Torna ai costi fissi/ })
    // La scelta delle voci si ridisegna quando ha finito di leggere: si
    // clicca il pulsante di quel momento, non uno vecchio.
    await waitFor(() => {
      const b = screen.queryByRole('button', { name: /Torna ai costi fissi/ })
      if (b) fireEvent.click(b)
      expect(testo()).toMatch(/Già dalle fatture/)
    })
  })

  it('se le fatture non si leggono, la pagina funziona come prima (niente riquadro, niente avvisi)', async () => {
    LETTURA_ROTTA = true
    render(<CostiAziendaliView orgId="o1" sedeId={null} sedi={SEDI} notify={() => {}} />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Aggiungi (nuova voce|la prima voce)/ }).length).toBeGreaterThan(0))
    expect(testo()).not.toMatch(/Già dalle fatture/)
    fireEvent.click(screen.getAllByRole('button', { name: /Aggiungi (nuova voce|la prima voce)/ })[0])
    fireEvent.change(screen.getByPlaceholderText(/Coppette piccole/), { target: { value: 'Luce' } })
    expect(screen.queryByRole('button', { name: 'Aggiungi lo stesso' })).toBeNull()
  })
})
