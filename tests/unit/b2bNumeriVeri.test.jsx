// @vitest-environment happy-dom
//
// ── Vendite B2B: i numeri dicono quello che è successo ──────────────────
//
// Audit del 03/10/2026 (la parte Analisi giudicata «fatta male e inutile»):
// Vendite B2B 35/100. Il registro funzionava, i numeri no.
//
//   1. «Ricavo B2B (mese) — incassato finora questo mese» sommava TUTTE le
//      vendite del mese, annullate e non pagate comprese. Nella demo: 1.477 €
//      «incassati» con zero vendite pagate su otto.
//   2. Modificare una vendita la riportava a «consegnata» (cioè «da
//      fatturare») e le dava la sede attiva: una vendita fatturata e
//      incassata tornava da fatturare, e cambiava negozio.
//   3. Il margine del mese contava anche le vendite annullate.
//   4. I chili tolti all'inventario (Quadratura, conto economico)
//      contavano anche le vendite annullate, che la merce l'avevano già
//      rimessa a posto.
//   5. La pagina scriveva «pz» e la Quadratura sommava le stesse quantità
//      come kg. Il conto giusto era quello della Quadratura (le righe vecchie
//      restano kg); da oggi ogni riga sceglie, e i pezzi non sono chili.
//   6. Senza nessuna vendita, «Da incassare: 0 € — tutto incassato» in verde:
//      un dato che manca presentato come una buona notizia.
//   7. I clienti cancellati finivano tutti in una riga «Cliente», che
//      sembrava un cliente vero.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'

// ── Un database finto che ricorda cosa gli si scrive ─────────────────────
const scritture = []
let RIGA_ESISTENTE = null
let VENDITE_PERIODO = []
vi.mock('../../src/lib/supabase', () => {
  const catena = (tabella) => {
    const st = { tabella, op: 'select', payload: null }
    const c = {
      select: () => c, eq: () => c, or: () => c, gte: () => c, lte: () => c, order: () => c, range: () => c,
      insert: (p) => { st.op = 'insert'; st.payload = p; scritture.push({ ...st }); return c },
      update: (p) => { st.op = 'update'; st.payload = p; scritture.push({ ...st }); return c },
      delete: () => { st.op = 'delete'; return c },
      single: async () => (st.op === 'insert' ? { data: { id: 'nuova' }, error: null } : { data: RIGA_ESISTENTE, error: null }),
      then: (ok, ko) => Promise.resolve(
        st.op === 'select' && tabella === 'vendite_b2b' ? { data: VENDITE_PERIODO, error: null } : { data: [], error: null },
      ).then(ok, ko),
    }
    return c
  }
  return { supabase: { from: catena, rpc: async () => ({ data: 5, error: null }) } }
})

const lib = await import('../../src/lib/venditeB2B.js')
const { kgB2B } = await import('../../src/lib/inventarioProduzione.js')

beforeEach(() => { scritture.length = 0; RIGA_ESISTENTE = null; VENDITE_PERIODO = [] })
afterEach(() => cleanup())

const v = (o) => ({ id: Math.random().toString(36).slice(2), stato: 'consegnata', pagata: false, totale: 100, righe: [], ...o })

describe('Il riepilogo del mese', () => {
  it('«incassato» sono solo le vendite pagate nel mese, non tutte quelle del mese', () => {
    const r = lib.riepilogoMeseB2B([
      v({ data: '2026-06-03', totale: 500, pagata: false }),
      v({ data: '2026-06-10', totale: 300, pagata: true, data_pagamento: '2026-06-20' }),
      v({ data: '2026-05-28', totale: 200, pagata: true, data_pagamento: '2026-06-02' }),
    ], '2026-06')
    expect(r.venduto).toBe(800)
    expect(r.incassato).toBe(500) // 300 di giugno + 200 di maggio pagati a giugno
    expect(r.daIncassare).toBe(500)
  })

  it('le annullate non sono vendute, non sono da incassare e non hanno margine', () => {
    const r = lib.riepilogoMeseB2B([
      v({ data: '2026-06-03', totale: 1000, stato: 'annullata', margine: 400 }),
      v({ data: '2026-06-04', totale: 200, margine: 50 }),
    ], '2026-06')
    expect(r.venduto).toBe(200)
    expect(r.daIncassare).toBe(200)
    expect(r.margine).toBe(50)
    expect(r.marginePct).toBe(25)
    expect(r.nVendite).toBe(1)
  })

  it('senza vendite lo dice (nTotali 0), invece di sembrare «tutto incassato»', () => {
    expect(lib.riepilogoMeseB2B([], '2026-06')).toMatchObject({ nTotali: 0, venduto: 0, margine: null, marginePct: null })
  })

  it('il margine si calcola solo sulle vendite di cui si sa il costo, e conta quelle senza', () => {
    const r = lib.riepilogoMeseB2B([
      v({ data: '2026-06-01', totale: 100, margine: 40 }),
      v({ data: '2026-06-02', totale: 900, margine: null }),
    ], '2026-06')
    expect(r.marginePct).toBe(40)
    expect(r.senzaCosto).toBe(1)
  })
})

describe('I chili dell\'ingrosso tolti all\'inventario', () => {
  it('una vendita annullata non toglie chili', () => {
    expect(kgB2B([
      { stato: 'annullata', righe: [{ prodotto: 'FIORDILATTE', qta: 20 }] },
      { stato: 'consegnata', righe: [{ prodotto: 'FIORDILATTE', qta: 5 }] },
    ])).toBe(5)
  })

  it('i pezzi non sono chili; le righe senza unità restano kg, come sempre', () => {
    expect(kgB2B([{ righe: [
      { prodotto: 'CORNETTO', qta: 421, unita: 'pz' },
      { prodotto: 'PISTACCHIO', qta: 50, unita: 'kg' },
      { prodotto: 'NOCCIOLA', qta: 23 },
    ] }])).toBe(73)
  })

  it('anche la lettura per periodo lascia fuori le annullate', async () => {
    VENDITE_PERIODO = [
      { data: '2026-06-01', righe: [{ qta: 10 }], totale: 100, sede_id: 's1', stato: 'annullata' },
      { data: '2026-06-02', righe: [{ qta: 4 }], totale: 40, sede_id: 's1', stato: 'consegnata' },
    ]
    const out = await lib.venditeB2BPeriodo('o1', { da: '2026-06-01', a: '2026-06-30' })
    expect(out.map(x => x.data)).toEqual(['2026-06-02'])
  })
})

describe('Modificare una vendita non la sposta e non la riapre', () => {
  it('una vendita fatturata resta fatturata, e resta della sua sede', async () => {
    RIGA_ESISTENTE = { id: 'v1', sede_id: 'carlina', stato: 'fatturata', righe: [] }
    await lib.salvaVenditaB2B({ orgId: 'o1', sedeId: 'berthollet', id: 'v1', righe: [{ prodotto: 'Pistacchio', qta: '5', unita: 'kg', prezzo: '18' }] })
    const up = scritture.find(s => s.tabella === 'vendite_b2b' && s.op === 'update')
    expect(up.payload).not.toHaveProperty('stato')
    expect(up.payload.sede_id).toBe('carlina')
  })

  it('una vendita nuova parte «consegnata», nella sede attiva', async () => {
    await lib.salvaVenditaB2B({ orgId: 'o1', sedeId: 'berthollet', righe: [{ prodotto: 'Pistacchio', qta: '5', prezzo: '18' }] })
    const ins = scritture.find(s => s.tabella === 'vendite_b2b' && s.op === 'insert')
    expect(ins.payload).toMatchObject({ stato: 'consegnata', sede_id: 'berthollet' })
  })

  it('l\'unità scelta si salva con la riga', () => {
    expect(lib.pulisciRighe([{ prodotto: 'cornetto', qta: '12', unita: 'pz', prezzo: '1,2' }])[0]).toMatchObject({ unita: 'pz', qta: 12 })
    expect(lib.unitaRiga({})).toBe('kg')
    expect(lib.unitaRiga({ unita: 'pz' })).toBe('pz')
  })
})

// ── La pagina vera ──────────────────────────────────────────────────────
let VENDITE = []
let CLIENTI = []
vi.mock('../../src/lib/venditeB2B.js', async (orig) => {
  const vero = await orig()
  return { ...vero, loadVenditeB2B: async () => VENDITE, loadClientiB2B: async () => CLIENTI }
})
const { default: VenditeB2BView } = await import('../../src/views/VenditeB2BView.jsx')
const testo = () => document.body.textContent || ''
const apri = (props = {}) => render(<VenditeB2BView orgId="o1" sedeId="s1" sedi={[]} ricettario={{ ricette: {} }} notify={() => {}} {...props} />)

describe('La pagina senza vendite', () => {
  it('non dice «tutto incassato» in verde: dice che non ci sono vendite', async () => {
    VENDITE = []; CLIENTI = []
    apri()
    // 06/10/2026: senza vendite non ci sono più i quattro box col trattino
    // (nessuna vendita registrata): la pagina spiega a cosa serve.
    await waitFor(() => expect(testo()).toMatch(/Qui registri quello che vendi a bar e ristoranti/))
    expect(testo()).not.toMatch(/tutto incassato/)
    expect(testo()).not.toMatch(/Da incassare/)
  })
})

describe('La pagina con delle vendite', () => {
  it('il riquadro del mese dice venduto e incassato separati', async () => {
    const mese = new Date().toISOString().slice(0, 7)
    VENDITE = [
      v({ data: mese + '-02', totale: 500 }),
      v({ data: mese + '-03', totale: 300, pagata: true, data_pagamento: mese + '-04' }),
      v({ data: mese + '-05', totale: 900, stato: 'annullata' }),
    ]
    CLIENTI = []
    apri()
    await waitFor(() => expect(testo()).toMatch(/Venduto B2B/))
    expect(testo()).toMatch(/2 vendite · incassati 300/)
    expect(testo()).not.toMatch(/incassato finora/)
  })

  it('i clienti cancellati non si spacciano per un cliente vero', async () => {
    VENDITE = [v({ data: '2026-06-02', cliente_id: null, clienti_b2b: null, totale: 120 })]
    CLIENTI = []
    apri()
    await waitFor(() => expect(testo()).toMatch(/Da incassare/))
    const analisi = [...document.querySelectorAll('button')].find(b => /analisi/i.test(b.textContent || ''))
    if (analisi) await act(async () => { fireEvent.click(analisi) })
    expect(testo()).toMatch(/Clienti eliminati/)
  })
})
