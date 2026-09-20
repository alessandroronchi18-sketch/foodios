// @vitest-environment happy-dom
//
// ── Il calendario: il giorno aperto, le chiusure, l'incasso del mese ──────
//
// Quello che succede quando si tocca una casella, e quello che il totale del
// mese conta davvero.
//
// ── Il difetto che ha fatto nascere questo file (19/09/2026) ──────────────
//
// **Un giorno segnato come chiuso faceva sparire il suo incasso dal totale
// del mese.** La somma degli incassi stava dopo il `continue` che toglie i
// giorni chiusi dal denominatore della copertura, quindi saltava anche i
// soldi.
//
// Sembra un caso di scuola e non lo è: capita con una consegna B2B partita
// in un giorno di ferie, e capita quando si segna chiuso un giorno dopo aver
// già fatto la cassa. Il risultato è che «incassati nel mese» non torna con
// la cassa, e non si capisce perché — che è il modo peggiore in cui un numero
// può sbagliare.
//
// La chiusura dice «non devi registrare», non «non sono entrati soldi».
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'

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
    from: () => fluente(), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))

let REGOLE = { ricorrenti: [], periodi: [] }
vi.mock('../../src/lib/giorniChiusura', async () => {
  const real = await vi.importActual('../../src/lib/giorniChiusura')
  return { ...real, caricaRegoleChiusura: () => Promise.resolve(REGOLE) }
})

const { default: CalendarioOperativo } = await import('../../src/components/CalendarioOperativo.jsx')

const OGGI = new Date()
const ANNO = OGGI.getFullYear()
const MESE0 = OGGI.getMonth()
const iso = (d) => `${ANNO}-${String(MESE0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const IERI = OGGI.getDate() > 1 ? iso(OGGI.getDate() - 1) : iso(1)

const chiusura = (data, totV = 400) => ({
  data, venduto: [], kpi: { totV, totFC: 0, totM: totV, totS: 0, totMP: 0, avgST: 0 },
})
const produzione = (data) => ({ data, prodotti: [{ nome: 'SACHER', stampi: 2 }], ricavoTot: 300 })

const base = { orgId: 'org-1', sedeId: 'sede-1', setView: () => {}, notify: () => {}, isMobile: false }
const monta = (p) => render(<CalendarioOperativo {...base} {...p} />)

const testo = (c) => [...c.querySelectorAll('div, span, button, li, p')]
  .map(e => (e.textContent || '').trim()).join(' | ')

/** La casella di un giorno del mese in corso. */
const cella = (c, giorno) => [...c.querySelectorAll('button')]
  .find(b => (b.getAttribute('aria-label') || '').includes(`${giorno} `))

beforeEach(() => { REGOLE = { ricorrenti: [], periodi: [] }; cleanup() })

describe('L\'incasso del mese conta tutti i soldi entrati', () => {
  it('somma le giornate registrate', async () => {
    const { container } = monta({
      chiusure: [chiusura(IERI, 400), chiusura(iso(1), 600)],
      giornaliero: [],
    })
    await waitFor(() => expect(testo(container)).toMatch(/1\.000 € incassati nel mese|incassati nel mese/))
  })

  it('e conta anche l\'incasso di un giorno segnato come chiuso', async () => {
    // Il difetto: quei 600 € sparivano dal totale perché il giorno era fuori
    // dal conto della copertura.
    //
    // **Attenzione al righello.** Le regole di chiusura si caricano dopo il
    // primo disegno: un `waitFor` sul totale passa subito, sul disegno in cui
    // la chiusura non è ancora in vigore, e non prova niente. Qui si aspetta
    // prima che la chiusura ci sia davvero — «gg di chiusura esclusi» compare
    // solo dopo — e **poi** si guarda il totale.
    REGOLE = { ricorrenti: [], periodi: [{ data_da: iso(1), data_a: iso(1), motivo: 'ferie' }] }
    const { container } = monta({
      chiusure: [chiusura(IERI, 400), chiusura(iso(1), 600)],
      giornaliero: [],
    })
    await waitFor(() => {
      expect(testo(container), 'la chiusura non è ancora in vigore').toMatch(/gg di chiusura esclusi/)
    })
    expect(testo(container)).toMatch(/1\.000 €/)
  })

  it('ma quel giorno resta fuori dal conto della copertura', async () => {
    // Le due cose sono separate, ed è il punto: i soldi si contano, il dovere
    // di registrare no.
    REGOLE = { ricorrenti: [], periodi: [{ data_da: iso(1), data_a: iso(1), motivo: 'ferie' }] }
    const { container } = monta({ chiusure: [chiusura(iso(1), 600)], giornaliero: [] })
    await waitFor(() => expect(testo(container)).toMatch(/gg di chiusura esclusi|1 gg/))
  })
})

describe('Toccare una casella apre il giorno', () => {
  it('si apre il dettaglio del giorno scelto', async () => {
    const { container } = monta({ chiusure: [chiusura(IERI)], giornaliero: [produzione(IERI)] })
    const b = cella(container, Number(IERI.slice(-2)))
    expect(b, 'non trovo la casella del giorno').toBeTruthy()
    await act(async () => { fireEvent.click(b) })
    expect(testo(container)).toMatch(/incasso|Registra|nota|Nota/i)
  })

  it('e ri-toccarla la richiude', async () => {
    const { container } = monta({ chiusure: [chiusura(IERI)], giornaliero: [produzione(IERI)] })
    const b = cella(container, Number(IERI.slice(-2)))
    await act(async () => { fireEvent.click(b) })
    const conDettaglio = testo(container).length
    await act(async () => { fireEvent.click(cella(container, Number(IERI.slice(-2)))) })
    expect(testo(container).length).toBeLessThan(conDettaglio)
  })
})

describe('Le etichette delle caselle si leggono anche senza vederle', () => {
  it('ogni casella dice che giorno è e com\'è messo', async () => {
    // Erano `<div onClick>`: quarantadue elementi interattivi muti per chi usa
    // la tastiera o un lettore di schermo.
    const { container } = monta({ chiusure: [chiusura(IERI)], giornaliero: [produzione(IERI)] })
    const b = cella(container, Number(IERI.slice(-2)))
    const et = b.getAttribute('aria-label') || ''
    expect(et).toMatch(/luned|marted|mercoled|gioved|venerd|sabato|domenica/i)
  })

  it('un giorno chiuso lo dice nell\'etichetta', async () => {
    REGOLE = { ricorrenti: [], periodi: [{ data_da: IERI, data_a: IERI, motivo: 'ferie' }] }
    const { container } = monta({ chiusure: [], giornaliero: [] })
    await waitFor(() => {
      const b = cella(container, Number(IERI.slice(-2)))
      expect((b.getAttribute('aria-label') || '')).toMatch(/chiuso/i)
    })
  })

  it('un giorno futuro lo dice, invece di sembrare un buco', async () => {
    const { container } = monta({ chiusure: [], giornaliero: [] })
    const ultimo = new Date(ANNO, MESE0 + 1, 0).getDate()
    if (ultimo > OGGI.getDate()) {
      const b = cella(container, ultimo)
      expect((b?.getAttribute('aria-label') || '')).toMatch(/in arrivo/i)
    }
  })
})

describe('Il periodo di chiusura copre tutti i suoi giorni', () => {
  it('una settimana di ferie toglie sette giorni dal conto', async () => {
    const da = 1, a = Math.min(7, OGGI.getDate())
    REGOLE = { ricorrenti: [], periodi: [{ data_da: iso(da), data_a: iso(a), motivo: 'ferie' }] }
    const { container } = monta({ chiusure: [], giornaliero: [] })
    await waitFor(() => expect(testo(container)).toMatch(new RegExp(`${a} gg di chiusura esclusi`)))
  })

  it('e un mese chiuso per intero non si vede come un mese scoperto', async () => {
    // È agosto, per molte pasticcerie. Prima usciva «0% · molti giorni
    // scoperti» in rosso su un mese in cui non c'era niente da fare.
    const ultimo = new Date(ANNO, MESE0 + 1, 0).getDate()
    REGOLE = { ricorrenti: [], periodi: [{ data_da: iso(1), data_a: iso(ultimo), motivo: 'ferie' }] }
    const { container } = monta({ chiusure: [], giornaliero: [] })
    await waitFor(() => {
      const t = testo(container)
      expect(t).toMatch(/mese di chiusura/)
      expect(t).not.toMatch(/molti giorni scoperti/)
    })
  })
})

describe('La serie di giorni completi', () => {
  it('i giorni di chiusura non spezzano la serie', async () => {
    // Chi chiude il lunedì non deve perdere la serie ogni settimana.
    REGOLE = { ricorrenti: [{ giorni: [1], valido_da: '2000-01-01' }], periodi: [] }
    const giorni = []
    for (let d = 1; d <= OGGI.getDate(); d++) {
      const data = new Date(ANNO, MESE0, d)
      const w = data.getDay() === 0 ? 7 : data.getDay()
      if (w !== 1) giorni.push(iso(d))
    }
    const { container } = monta({
      chiusure: giorni.map(k => chiusura(k)), giornaliero: giorni.map(k => produzione(k)),
    })
    await waitFor(() => expect(testo(container)).toMatch(/completi consecutivi/))
  })

  it('senza niente registrato la serie è a zero e lo dice in chiaro', async () => {
    const { container } = monta({ chiusure: [], giornaliero: [] })
    await waitFor(() => expect(testo(container)).toMatch(/chiudi oggi per ripartire/))
  })
})

describe('Il righello di questo file', () => {
  it('le caselle dei giorni esistono e si trovano per etichetta', async () => {
    // Se `cella()` non trovasse niente, metà dei test qui sopra passerebbero
    // guardando il vuoto.
    const { container } = monta({ chiusure: [], giornaliero: [] })
    await waitFor(() => {
      expect(cella(container, 1)).toBeTruthy()
      expect(cella(container, OGGI.getDate())).toBeTruthy()
    })
  })
})
