// @vitest-environment happy-dom
//
// Anagrafica fornitori e ordini: i conti che si possono sbagliare in silenzio.
//
// È la pagina da cui passano i soldi che escono. Tre cose, se vanno storte,
// non si vedono sullo schermo — si vedono sul conto corrente:
//
//   1. l'IBAN. Se si salva com'è scritto, con gli spazi o in minuscolo, il
//      file dei bonifici (`generateSepaXml`) scarta quel pagamento in silenzio
//      e il fornitore resta da pagare senza che nessuno sappia perché;
//   2. il totale degli ordini. Nel database del design partner ci sono tre
//      ordini, e uno è **annullato da 113.322 €**: col filtro su "tutti" — che
//      è il default — quella cifra entrava nel totale di testata come se fosse
//      spesa. Un ordine annullato non è una spesa;
//   3. l'ordine salvato a metà. L'ordine e le sue righe sono due scritture
//      separate: se la seconda fallisce, deve sparire anche la prima, se no
//      resta a database un ordine con un totale e nessun prodotto dentro.
//
// In più: "non lo so" e "zero" sono cose diverse. Giorni di consegna vuoti e
// minimo d'ordine vuoto devono restare NULL, non diventare 0 — un minimo
// d'ordine a zero significa "spedisce sempre", ed è una bugia.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { todayLocal } from '../../src/lib/dateLocal'

// ── Un finto Supabase che ricorda quello che gli è stato chiesto ────────────
//
// Non basta un mock che risponde sempre `[]`: qui interessa **cosa** viene
// scritto (il payload) e **con quali filtri** (l'isolamento per organizzazione
// è la difesa multi-tenant di tutto il prodotto).

const db = vi.hoisted(() => ({
  tabelle: {},
  scritture: [],
  errori: {},
  reset() {
    this.tabelle = { fornitori: [], ordini_fornitori: [], righe_ordine: [], fatture: [] }
    this.scritture = []
    this.errori = {}
  },
}))

vi.mock('../../src/lib/supabase', () => {
  const applica = (righe, filtri) => righe.filter(r => filtri.every(f => {
    if (f[0] === 'eq') return String(r[f[1]] ?? '') === String(f[2] ?? '')
    if (f[0] === 'gte') return String(r[f[1]] ?? '') >= String(f[2])
    if (f[0] === 'or') return true   // `sede_id.eq.X,sede_id.is.null`: non discrimina qui
    return true
  }))

  function costruisci(tabella) {
    const q = { tabella, op: 'select', payload: null, filtri: [], conteggio: false }
    const chiudi = (singolo) => {
      const errore = db.errori[`${tabella}:${q.op}`] || null
      db.scritture.push({ tabella, op: q.op, payload: q.payload, filtri: q.filtri })
      if (errore) return { data: null, error: errore, count: null }
      const righe = db.tabelle[tabella] || (db.tabelle[tabella] = [])
      if (q.op === 'select') {
        const out = applica(righe, q.filtri)
        if (q.conteggio) return { data: null, error: null, count: out.length }
        return { data: singolo ? (out[0] ?? null) : out, error: null, count: out.length }
      }
      if (q.op === 'insert') {
        const nuove = (Array.isArray(q.payload) ? q.payload : [q.payload])
          .map((r, i) => ({ id: r.id || `${tabella}-${righe.length + i + 1}`, attivo: true, ...r }))
        righe.push(...nuove)
        return { data: singolo ? nuove[0] : nuove, error: null, count: nuove.length }
      }
      if (q.op === 'update') {
        const tocche = applica(righe, q.filtri)
        for (const r of tocche) Object.assign(r, q.payload)
        return { data: tocche, error: null, count: tocche.length }
      }
      if (q.op === 'delete') {
        const tocche = applica(righe, q.filtri)
        db.tabelle[tabella] = righe.filter(r => !tocche.includes(r))
        return { data: tocche, error: null, count: tocche.length }
      }
      return { data: null, error: null, count: 0 }
    }
    const c = {
      select(_cols, opts) { if (opts?.count) q.conteggio = true; return c },
      insert(p) { q.op = 'insert'; q.payload = p; return c },
      update(p) { q.op = 'update'; q.payload = p; return c },
      delete() { q.op = 'delete'; return c },
      eq(col, val) { q.filtri.push(['eq', col, val]); return c },
      gte(col, val) { q.filtri.push(['gte', col, val]); return c },
      or(s) { q.filtri.push(['or', s]); return c },
      order() { return c },
      limit() { return c },
      single: async () => chiudi(true),
      maybeSingle: async () => chiudi(true),
      then: (res, rej) => Promise.resolve(chiudi(false)).then(res, rej),
    }
    return c
  }
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) },
      from: (t) => costruisci(t),
      rpc: async () => ({ data: null, error: null }),
    },
  }
})

const magazzinoFinto = vi.hoisted(() => ({ ssave: vi.fn(async () => {}), sload: vi.fn(async () => null) }))
vi.mock('../../src/lib/storage', () => ({
  ssave: (...a) => magazzinoFinto.ssave(...a),
  sload: (...a) => magazzinoFinto.sload(...a),
  ssaveBatch: async () => {},
  sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false }))

// ── Impalcatura ────────────────────────────────────────────────────────────

const ORG = 'org-mara'

async function renderizza(props = {}) {
  const avvisi = []
  const { default: Fornitori } = await import('../../src/components/Fornitori.jsx')
  let v
  await act(async () => {
    v = render(<Fornitori orgId={ORG} sedeId={null} sedi={[]} notify={(msg, ok = true) => avvisi.push({ msg, ok })} {...props} />)
  })
  await act(async () => { await new Promise(r => setTimeout(r, 40)) })
  return { v, avvisi }
}

const bottone = (v, testo) => [...v.container.querySelectorAll('button')].find(b => b.textContent.trim() === testo)
const perEtichetta = (v, etichetta) => [...v.container.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === etichetta)

async function vaiSu(v, tab) {
  await act(async () => { fireEvent.click(bottone(v, tab)) })
  await act(async () => { await new Promise(r => setTimeout(r, 30)) })
}

// I campi del form fornitore non hanno `htmlFor`: si prendono per tipo e
// segnaposto, che è anche il modo in cui li riconosce chi compila.
function campiFornitore(v) {
  const testo = [...v.container.querySelectorAll('input[type="text"]')]
  return {
    nome: testo[0],
    referente: testo[1],
    email: v.container.querySelector('input[type="email"]'),
    telefono: v.container.querySelector('input[type="tel"]'),
    categoria: v.container.querySelector('input[list="fos-categorie"]'),
    terminiGiorni: v.container.querySelector('input[aria-label="Giorni di pagamento concordati"]'),
    terminiTipo: v.container.querySelector('select[aria-label="Come si contano i giorni di pagamento"]'),
    iban: v.container.querySelector('input[placeholder^="IT60"]'),
    partitaIva: v.container.querySelector('input[placeholder="IT01234567890"]'),
    consegna: v.container.querySelector('input[placeholder="3"]'),
    minimo: v.container.querySelector('input[placeholder="250"]'),
    ricerca: v.container.querySelector('input[placeholder^="Cerca per nome"]'),
  }
}

const scritture = (tabella, op) => db.scritture.filter(s => s.tabella === tabella && s.op === op)

// Sul desktop lo stato dell'ordine si cambia dalla tendina, non da un pulsante.
async function segnaRicevuto(v, fornitore = 'Molino Rossetto') {
  const sel = v.container.querySelector(`select[aria-label="Stato dell'ordine di ${fornitore}"]`)
  expect(sel, 'la tendina dello stato deve esistere').toBeTruthy()
  await act(async () => { fireEvent.change(sel, { target: { value: 'ricevuto' } }) })
  await act(async () => { await new Promise(r => setTimeout(r, 40)) })
}

let confermaRisposta = true
beforeEach(() => {
  db.reset()
  magazzinoFinto.ssave.mockReset().mockResolvedValue(undefined)
  magazzinoFinto.sload.mockReset().mockResolvedValue(null)
  confermaRisposta = true
  window.confirm = () => confermaRisposta
})
afterEach(() => { vi.restoreAllMocks() })

// ────────────────────────────────────────────────────────────────────────────

describe('anagrafica fornitori: quello che finisce nel database', () => {
  it('senza nome non si scrive niente', async () => {
    const { v, avvisi } = await renderizza()
    await act(async () => { fireEvent.click(bottone(v, 'Aggiungi')) })
    expect(scritture('fornitori', 'insert')).toHaveLength(0)
    expect(avvisi.at(-1)).toEqual({ msg: 'Inserisci il nome del fornitore', ok: false })
    v.unmount()
  })

  it('l\'IBAN si salva senza spazi e in maiuscolo', async () => {
    // Così com'è scritto ("it60 x054 …") il file dei bonifici lo scarta.
    const { v } = await renderizza()
    const c = campiFornitore(v)
    fireEvent.change(c.nome, { target: { value: 'Molino Rossetto' } })
    fireEvent.change(c.iban, { target: { value: 'it60 x054 2811 1010 0000 0123 456' } })
    await act(async () => { fireEvent.click(bottone(v, 'Aggiungi')) })

    const payload = scritture('fornitori', 'insert').at(-1).payload
    expect(payload.iban).toBe('IT60X0542811101000000123456')
    expect(payload.iban).not.toMatch(/\s/)
    expect(payload.organization_id).toBe(ORG)
    v.unmount()
  })

  it('un IBAN che non torna viene segnalato prima di salvarlo', async () => {
    const { v } = await renderizza()
    const c = campiFornitore(v)
    fireEvent.change(c.iban, { target: { value: 'IT00 0000 0000 0000 0000 0000 000' } })
    expect(v.container.textContent).toContain('Questo IBAN non torna')
    expect(c.iban.getAttribute('aria-invalid')).toBe('true')
    v.unmount()
  })

  it('e se l\'utente dice no alla conferma, il fornitore non si salva', async () => {
    confermaRisposta = false
    const { v } = await renderizza()
    const c = campiFornitore(v)
    fireEvent.change(c.nome, { target: { value: 'Ditta Sbagliata' } })
    fireEvent.change(c.iban, { target: { value: 'IT00 0000 0000 0000 0000 0000 000' } })
    await act(async () => { fireEvent.click(bottone(v, 'Aggiungi')) })
    expect(scritture('fornitori', 'insert')).toHaveLength(0)
    v.unmount()
  })

  it('"non lo so" resta vuoto: giorni di consegna e minimo d\'ordine non diventano zero', async () => {
    // Un minimo d'ordine a 0 vorrebbe dire "spedisce sempre". Non è vero: è
    // che non gliel'abbiamo chiesto.
    const { v } = await renderizza()
    fireEvent.change(campiFornitore(v).nome, { target: { value: 'Latteria Bianca' } })
    await act(async () => { fireEvent.click(bottone(v, 'Aggiungi')) })

    const payload = scritture('fornitori', 'insert').at(-1).payload
    expect(payload.lead_time_giorni).toBeNull()
    expect(payload.minimo_ordine).toBeNull()
    expect(payload.categoria).toBeNull()
    expect(payload.partita_iva).toBeNull()
    v.unmount()
  })

  it('il minimo d\'ordine scritto all\'italiana ("250,50") non perde i centesimi', async () => {
    const { v } = await renderizza()
    const c = campiFornitore(v)
    fireEvent.change(c.nome, { target: { value: 'Cioccolato Sud' } })
    fireEvent.change(c.minimo, { target: { value: '250,50' } })
    fireEvent.change(c.consegna, { target: { value: '5' } })
    await act(async () => { fireEvent.click(bottone(v, 'Aggiungi')) })

    const payload = scritture('fornitori', 'insert').at(-1).payload
    expect(payload.minimo_ordine).toBeCloseTo(250.5, 2)
    expect(payload.lead_time_giorni).toBe(5)
    v.unmount()
  })

  it('i termini di pagamento senza numero tornano a 30 giorni, non a zero', async () => {
    // 0 giorni significherebbe "si paga alla consegna", e lo Scadenzario
    // metterebbe tutte le fatture come già scadute.
    const { v } = await renderizza()
    const c = campiFornitore(v)
    fireEvent.change(c.nome, { target: { value: 'Senza Termini' } })
    fireEvent.change(c.terminiGiorni, { target: { value: '' } })
    await act(async () => { fireEvent.click(bottone(v, 'Aggiungi')) })

    expect(scritture('fornitori', 'insert').at(-1).payload.termini_pagamento).toBe(30)
    v.unmount()
  })

  it('"fine mese" si salva come tale: sono ventotto giorni di differenza', async () => {
    const { v } = await renderizza()
    const c = campiFornitore(v)
    fireEvent.change(c.nome, { target: { value: 'Grandi Molini' } })
    fireEvent.change(c.terminiTipo, { target: { value: 'fine_mese' } })
    await act(async () => { fireEvent.click(bottone(v, 'Aggiungi')) })
    expect(scritture('fornitori', 'insert').at(-1).payload.termini_tipo).toBe('fine_mese')
    v.unmount()
  })

  it('la sede vuota vuol dire "tutta l\'azienda", cioè NULL', async () => {
    const sedi = [{ id: 's1', nome: 'Corso Vittorio', attiva: true }, { id: 's2', nome: 'Berthollet', attiva: true }]
    const { v } = await renderizza({ sedi })
    fireEvent.change(campiFornitore(v).nome, { target: { value: 'Fornitore Comune' } })
    await act(async () => { fireEvent.click(bottone(v, 'Aggiungi')) })
    expect(scritture('fornitori', 'insert').at(-1).payload.sede_id).toBeNull()
    v.unmount()
  })
})

describe('archiviare, riattivare, eliminare', () => {
  beforeEach(() => {
    db.tabelle.fornitori = [
      { id: 'f1', organization_id: ORG, nome: 'Molino Rossetto', attivo: true, categoria: 'Farine', contatto: 'Luca', termini_pagamento: 30 },
      { id: 'f2', organization_id: ORG, nome: 'Latteria Bianca', attivo: true, categoria: 'Latticini', contatto: 'Anna', termini_pagamento: 60 },
    ]
  })

  it('archiviare non cancella: il fornitore resta, cambia solo la bandierina', async () => {
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('Molino Rossetto'))
    await act(async () => { fireEvent.click(perEtichetta(v, 'Archivia fornitore')) })
    await waitFor(() => expect(scritture('fornitori', 'update').length).toBeGreaterThan(0))

    const s = scritture('fornitori', 'update').at(-1)
    expect(s.payload).toEqual({ attivo: false })
    expect(scritture('fornitori', 'delete')).toHaveLength(0)
    // Lo storico ordini resta: nessuna riga sparisce dalla tabella.
    expect(db.tabelle.fornitori).toHaveLength(2)
    v.unmount()
  })

  it('archiviare e riattivare restano dentro l\'organizzazione', async () => {
    // Senza il filtro sull'organizzazione si scriverebbe sul fornitore di
    // un'altra azienda che ha lo stesso id.
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('Molino Rossetto'))
    await act(async () => { fireEvent.click(perEtichetta(v, 'Archivia fornitore')) })
    await waitFor(() => expect(scritture('fornitori', 'update').length).toBeGreaterThan(0))

    const filtri = scritture('fornitori', 'update').at(-1).filtri
    expect(filtri).toContainEqual(['eq', 'organization_id', ORG])
    expect(filtri.some(f => f[0] === 'eq' && f[1] === 'id')).toBe(true)
    v.unmount()
  })

  it('senza la conferma non si archivia niente', async () => {
    confermaRisposta = false
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('Molino Rossetto'))
    await act(async () => { fireEvent.click(perEtichetta(v, 'Archivia fornitore')) })
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(scritture('fornitori', 'update')).toHaveLength(0)
    v.unmount()
  })

  it('l\'eliminazione definitiva si può solo dall\'archivio, e chiede conferma', async () => {
    db.tabelle.fornitori = [{ id: 'f9', organization_id: ORG, nome: 'Vecchio Fornitore', attivo: false, termini_pagamento: 30 }]
    const { v } = await renderizza()
    await act(async () => { fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent.includes('Archivio'))) })
    await act(async () => { await new Promise(r => setTimeout(r, 40)) })
    await waitFor(() => expect(v.container.textContent).toContain('Vecchio Fornitore'))

    confermaRisposta = false
    await act(async () => { fireEvent.click(perEtichetta(v, 'Elimina fornitore definitivamente')) })
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(scritture('fornitori', 'delete')).toHaveLength(0)

    confermaRisposta = true
    await act(async () => { fireEvent.click(perEtichetta(v, 'Elimina fornitore definitivamente')) })
    await waitFor(() => expect(scritture('fornitori', 'delete').length).toBe(1))
    expect(scritture('fornitori', 'delete').at(-1).filtri).toContainEqual(['eq', 'organization_id', ORG])
    v.unmount()
  })

  it('la ricerca trova per nome, per categoria e per referente', async () => {
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('Molino Rossetto'))
    const cerca = campiFornitore(v).ricerca

    fireEvent.change(cerca, { target: { value: 'latticini' } })  // categoria, minuscolo
    expect(v.container.textContent).toContain('Latteria Bianca')
    expect(v.container.textContent).not.toContain('Molino Rossetto')

    fireEvent.change(cerca, { target: { value: 'Luca' } })       // referente
    expect(v.container.textContent).toContain('Molino Rossetto')
    expect(v.container.textContent).not.toContain('Latteria Bianca')

    fireEvent.change(cerca, { target: { value: 'zzz' } })
    expect(v.container.textContent).toContain('Nessun fornitore trovato')
    v.unmount()
  })
})

describe('i fornitori che sono già nelle fatture', () => {
  it('vengono proposti, e quelli che non sono merce restano senza spunta', async () => {
    // In produzione erano 77 nomi per 82.676 €, di cui solo 18 fornitori di
    // merce: il bottone diceva "Aggiungi 77 fornitori" e dentro c'erano la
    // luce, il commercialista e le commissioni del delivery.
    db.tabelle.fatture = [
      { id: 1, organization_id: ORG, fornitore: 'MOLINO ROSSETTO SRL', totale: 1200, data_fattura: todayLocal(), iban: 'IT60X0542811101000000123456' },
      { id: 2, organization_id: ORG, fornitore: 'MOLINO ROSSETTO SRL', totale: 800, data_fattura: todayLocal() },
      { id: 3, organization_id: ORG, fornitore: 'ENEL ENERGIA SPA', totale: 430, data_fattura: todayLocal() },
    ]
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('non sono in anagrafica'))
    await act(async () => { fireEvent.click(bottone(v, 'Guarda quali')) })

    const spunta = (nome) => v.container.querySelector(`input[aria-label="Aggiungi ${nome} all'anagrafica"]`)
    expect(spunta('MOLINO ROSSETTO SRL').checked).toBe(true)
    // L'energia elettrica è un costo, non merce da ordinare: resta in elenco
    // ma senza spunta, e con scritto perché.
    expect(spunta('ENEL ENERGIA SPA').checked).toBe(false)
    expect(v.container.textContent).toContain('utenze (luce o gas)')
    // Le due fatture dello stesso fornitore fanno una riga sola da 2.000 €.
    expect(v.container.textContent).toContain('2.000 €')
    v.unmount()
  })

  it('l\'IBAN letto dalla fattura viene portato in anagrafica', async () => {
    db.tabelle.fatture = [
      { id: 1, organization_id: ORG, fornitore: 'MOLINO ROSSETTO SRL', totale: 1200, data_fattura: todayLocal(), iban: 'IT60X0542811101000000123456' },
    ]
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('non è in anagrafica'))
    await act(async () => { fireEvent.click(bottone(v, 'Guarda quali')) })
    const aggiungi = [...v.container.querySelectorAll('button')].find(b => /Aggiungi .* all'anagrafica|Aggiungi 1 fornitore/i.test(b.textContent))
    expect(aggiungi).toBeTruthy()
    await act(async () => { fireEvent.click(aggiungi) })
    await waitFor(() => expect(scritture('fornitori', 'insert').length).toBe(1))

    const righe = scritture('fornitori', 'insert').at(-1).payload
    expect(righe[0].nome).toBe('MOLINO ROSSETTO SRL')
    expect(righe[0].iban).toBe('IT60X0542811101000000123456')
    expect(righe[0].organization_id).toBe(ORG)
    // La categoria non si indovina dalle fatture: inventarla sarebbe peggio
    // che lasciarla vuota.
    expect(righe[0].categoria).toBeUndefined()
    v.unmount()
  })

  it('un fornitore già archiviato non ricompare fra i candidati', async () => {
    // Se ricomparisse, al primo import tornerebbe attivo da solo.
    db.tabelle.fatture = [
      { id: 1, organization_id: ORG, fornitore: 'MOLINO ROSSETTO', totale: 1200, data_fattura: todayLocal() },
    ]
    db.tabelle.fornitori = [
      { id: 'f1', organization_id: ORG, nome: 'MOLINO ROSSETTO', attivo: false, termini_pagamento: 30 },
    ]
    const { v } = await renderizza()
    await act(async () => { await new Promise(r => setTimeout(r, 60)) })
    expect(v.container.textContent).not.toContain('non è in anagrafica')
    expect(v.container.textContent).not.toContain('non sono in anagrafica')
    v.unmount()
  })
})

describe('ordini: il totale di testata', () => {
  const ordini = [
    { id: 'o1', organization_id: ORG, fornitore_id: 'f1', fornitori: { nome: 'Molino Rossetto' }, data_ordine: '2026-09-10', stato: 'ricevuto', totale: 1200, righe_ordine: [{ prodotto: 'Farina 00', quantita: 100, unita: 'kg', prezzo_unitario: 12, totale_riga: 1200 }] },
    { id: 'o2', organization_id: ORG, fornitore_id: 'f2', fornitori: { nome: 'Latteria Bianca' }, data_ordine: '2026-09-11', stato: 'inviato', totale: 300, righe_ordine: [{ prodotto: 'Burro', quantita: 20, unita: 'kg', prezzo_unitario: 0, totale_riga: 0 }] },
    { id: 'o3', organization_id: ORG, fornitore_id: 'f3', fornitori: { nome: 'Grandi Molini' }, data_ordine: '2026-09-12', stato: 'annullato', totale: 113322, righe_ordine: [] },
  ]

  beforeEach(() => {
    db.tabelle.ordini_fornitori = ordini.map(o => ({ ...o }))
    db.tabelle.fornitori = [
      { id: 'f1', organization_id: ORG, nome: 'Molino Rossetto', attivo: true, termini_pagamento: 30 },
      { id: 'f2', organization_id: ORG, nome: 'Latteria Bianca', attivo: true, termini_pagamento: 30 },
    ]
  })

  it('un ordine annullato non è una spesa: fuori dal totale', async () => {
    const { v } = await renderizza()
    await vaiSu(v, 'Ordini')
    await waitFor(() => expect(v.container.textContent).toContain('Molino Rossetto'))
    // 1.200 + 300 = 1.500. Con l'annullato dentro farebbe 114.822.
    expect(v.container.textContent).toContain('1.500')
    expect(v.container.textContent).not.toContain('114.822')
    v.unmount()
  })

  it('e l\'annullato escluso viene dichiarato, non nascosto', async () => {
    const { v } = await renderizza()
    await vaiSu(v, 'Ordini')
    await waitFor(() => expect(v.container.textContent).toContain('Molino Rossetto'))
    expect(v.container.textContent).toMatch(/annullat/i)
    v.unmount()
  })

  it('i prodotti dell\'ordine si possono aprire e leggere', async () => {
    // Fino al 09/09/2026 le righe venivano scritte e mai rilette: chi
    // compilava un ordine con dieci prodotti rivedeva solo il totale.
    const { v } = await renderizza()
    await vaiSu(v, 'Ordini')
    await waitFor(() => expect(v.container.textContent).toContain('Molino Rossetto'))
    const apri = perEtichetta(v, 'Mostra i prodotti dell\'ordine di Molino Rossetto')
    expect(apri).toBeTruthy()
    await act(async () => { fireEvent.click(apri) })
    expect(v.container.textContent).toContain('Farina 00')
    expect(v.container.textContent).toContain('100 kg')
    v.unmount()
  })

  it('un prezzo a zero si dichiara "da inserire", non si spaccia per zero euro', async () => {
    // Nei tre ordini reali del database due righe su tre hanno prezzo 0 e il
    // totale esce 0,00 €. Scriverlo è il solo modo per accorgersene.
    const { v } = await renderizza()
    await vaiSu(v, 'Ordini')
    await waitFor(() => expect(v.container.textContent).toContain('Latteria Bianca'))
    await act(async () => { fireEvent.click(perEtichetta(v, 'Mostra i prodotti dell\'ordine di Latteria Bianca')) })
    expect(v.container.textContent).toContain('da inserire')
    v.unmount()
  })
})

describe('ordini: salvare un ordine nuovo', () => {
  beforeEach(() => {
    db.tabelle.fornitori = [{ id: 'f1', organization_id: ORG, nome: 'Molino Rossetto', attivo: true, termini_pagamento: 30 }]
  })

  async function apriFormOrdine(v) {
    await vaiSu(v, 'Ordini')
    const nuovo = [...v.container.querySelectorAll('button')].find(b => /Nuovo ordine/i.test(b.textContent))
    expect(nuovo, 'il pulsante "Nuovo ordine" deve esistere').toBeTruthy()
    await act(async () => { fireEvent.click(nuovo) })
  }

  function rigaOrdine(v, i = 0) {
    const numerici = [...v.container.querySelectorAll('input[type="number"]')]
    const testo = [...v.container.querySelectorAll('input[placeholder="es. burro"]')]
    return { prodotto: testo[i], quantita: numerici[i * 2], prezzo: numerici[i * 2 + 1] }
  }

  it('senza fornitore non si salva', async () => {
    const { v, avvisi } = await renderizza()
    await apriFormOrdine(v)
    await act(async () => { fireEvent.click(bottone(v, 'Salva ordine')) })
    expect(scritture('ordini_fornitori', 'insert')).toHaveLength(0)
    expect(avvisi.at(-1)).toEqual({ msg: 'Seleziona un fornitore', ok: false })
    v.unmount()
  })

  it('senza nessun prodotto non si salva', async () => {
    const { v, avvisi } = await renderizza()
    await apriFormOrdine(v)
    const sel = [...v.container.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent === 'Molino Rossetto'))
    fireEvent.change(sel, { target: { value: 'f1' } })
    await act(async () => { fireEvent.click(bottone(v, 'Salva ordine')) })
    expect(scritture('ordini_fornitori', 'insert')).toHaveLength(0)
    expect(avvisi.at(-1)).toEqual({ msg: 'Aggiungi almeno un prodotto', ok: false })
    v.unmount()
  })

  it('il totale dell\'ordine è quantità per prezzo, arrotondato al centesimo', async () => {
    const { v } = await renderizza()
    await apriFormOrdine(v)
    const sel = [...v.container.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent === 'Molino Rossetto'))
    fireEvent.change(sel, { target: { value: 'f1' } })
    const r = rigaOrdine(v)
    fireEvent.change(r.prodotto, { target: { value: 'Burro' } })
    fireEvent.change(r.quantita, { target: { value: '12.5' } })
    fireEvent.change(r.prezzo, { target: { value: '9.2' } })
    await act(async () => { fireEvent.click(bottone(v, 'Salva ordine')) })
    await waitFor(() => expect(scritture('ordini_fornitori', 'insert').length).toBe(1))

    const ordine = scritture('ordini_fornitori', 'insert').at(-1).payload
    expect(ordine.totale).toBe(115)          // 12,5 × 9,20
    expect(ordine.organization_id).toBe(ORG)
    expect(ordine.data_ordine).toBe(todayLocal())   // data locale, non UTC

    const righe = scritture('righe_ordine', 'insert').at(-1).payload
    expect(righe).toHaveLength(1)
    expect(righe[0]).toMatchObject({ prodotto: 'Burro', quantita: 12.5, prezzo_unitario: 9.2 })
    // Il totale di testata è arrotondato al centesimo, il totale della riga no
    // (12,5 × 9,2 in virgola mobile fa 114,99999999999999). La differenza è
    // sotto il centesimo, ma la somma delle righe non torna con il totale
    // dell'ordine: vedi il rapporto.
    expect(righe[0].totale_riga).toBeCloseTo(115, 2)
    v.unmount()
  })

  it('se le righe non si salvano, l\'ordine non resta a database senza prodotti', async () => {
    // Due scritture separate: l'ordine e le sue righe. Se la seconda fallisce
    // e la prima resta, a database c'è un ordine con un totale e niente dentro,
    // e il totale di testata conta una spesa che non si sa di cosa.
    db.errori['righe_ordine:insert'] = { message: 'permesso negato' }
    const { v, avvisi } = await renderizza()
    await apriFormOrdine(v)
    const sel = [...v.container.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent === 'Molino Rossetto'))
    fireEvent.change(sel, { target: { value: 'f1' } })
    const r = rigaOrdine(v)
    fireEvent.change(r.prodotto, { target: { value: 'Burro' } })
    fireEvent.change(r.quantita, { target: { value: '10' } })
    fireEvent.change(r.prezzo, { target: { value: '9' } })
    await act(async () => { fireEvent.click(bottone(v, 'Salva ordine')) })
    await waitFor(() => expect(scritture('ordini_fornitori', 'delete').length).toBe(1))

    expect(db.tabelle.ordini_fornitori).toHaveLength(0)
    expect(scritture('ordini_fornitori', 'delete').at(-1).filtri).toContainEqual(['eq', 'organization_id', ORG])
    expect(avvisi.at(-1).ok).toBe(false)
    expect(avvisi.at(-1).msg).toContain('permesso negato')
    v.unmount()
  })

  it('una riga senza nome prodotto viene lasciata fuori', async () => {
    const { v } = await renderizza()
    await apriFormOrdine(v)
    const sel = [...v.container.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent === 'Molino Rossetto'))
    fireEvent.change(sel, { target: { value: 'f1' } })
    await act(async () => { fireEvent.click(bottone(v, '+ Riga')) })
    const r0 = rigaOrdine(v, 0)
    fireEvent.change(r0.prodotto, { target: { value: 'Burro' } })
    fireEvent.change(r0.quantita, { target: { value: '10' } })
    fireEvent.change(r0.prezzo, { target: { value: '9' } })
    const r1 = rigaOrdine(v, 1)
    fireEvent.change(r1.quantita, { target: { value: '3' } })   // prodotto vuoto
    await act(async () => { fireEvent.click(bottone(v, 'Salva ordine')) })
    await waitFor(() => expect(scritture('righe_ordine', 'insert').length).toBe(1))

    expect(scritture('righe_ordine', 'insert').at(-1).payload).toHaveLength(1)
    expect(scritture('ordini_fornitori', 'insert').at(-1).payload.totale).toBe(90)
    v.unmount()
  })
})

describe('ordine ricevuto: i prezzi pagati tornano nel listino ingredienti', () => {
  beforeEach(() => {
    db.tabelle.fornitori = [{ id: 'f1', organization_id: ORG, nome: 'Molino Rossetto', attivo: true, termini_pagamento: 30 }]
    db.tabelle.ordini_fornitori = [{
      id: 'o1', organization_id: ORG, fornitore_id: 'f1', fornitori: { nome: 'Molino Rossetto' },
      data_ordine: '2026-09-10', stato: 'inviato', totale: 920,
      righe_ordine: [{ prodotto: 'burro', quantita: 100, unita: 'kg', prezzo_unitario: 9.2, totale_riga: 920 }],
    }]
    magazzinoFinto.sload.mockResolvedValue({ ingredienti_costi: { burro: { costoKg: 7.5, costoG: 0.0075 } }, ricette: {} })
  })

  it('il listino si aggiorna solo se l\'utente dice di sì', async () => {
    // Un prezzo di acquisto cambia il food cost di tutte le ricette che usano
    // quell'ingrediente: non è una cosa da fare di nascosto.
    confermaRisposta = false
    const { v } = await renderizza()
    await vaiSu(v, 'Ordini')
    await waitFor(() => expect(v.container.textContent).toContain('Molino Rossetto'))
    await segnaRicevuto(v)
    await act(async () => { await new Promise(r => setTimeout(r, 40)) })
    expect(magazzinoFinto.ssave).not.toHaveBeenCalled()
    v.unmount()
  })

  it('detto di sì, il nuovo prezzo al chilo entra nel listino', async () => {
    const { v } = await renderizza()
    await vaiSu(v, 'Ordini')
    await waitFor(() => expect(v.container.textContent).toContain('Molino Rossetto'))
    await segnaRicevuto(v)
    await waitFor(() => expect(magazzinoFinto.ssave).toHaveBeenCalled())

    const [, valore, org, sede] = magazzinoFinto.ssave.mock.calls.at(-1)
    expect(valore.ingredienti_costi.burro.costoKg).toBeCloseTo(9.2, 2)
    expect(org).toBe(ORG)
    // Il ricettario è condiviso fra le sedi: si scrive con sede_id nullo.
    expect(sede).toBeNull()
    v.unmount()
  })

  it('se il listino non si salva, non si dice che è fatto', async () => {
    magazzinoFinto.ssave.mockRejectedValue(new Error('rete assente'))
    const { v, avvisi } = await renderizza()
    await vaiSu(v, 'Ordini')
    await waitFor(() => expect(v.container.textContent).toContain('Molino Rossetto'))
    await segnaRicevuto(v)
    await waitFor(() => expect(avvisi.some(a => a.ok === false && /NON aggiornat/i.test(a.msg))).toBe(true))
    expect(avvisi.some(a => /rimasto come prima/.test(a.msg))).toBe(true)
    v.unmount()
  })
})

describe('niente dati: la pagina non mente e non crolla', () => {
  it('senza organizzazione non interroga il database e non resta in caricamento', async () => {
    const { v } = await renderizza({ orgId: null })
    expect(db.scritture).toHaveLength(0)
    expect(v.container.textContent).toContain('Nessun fornitore ancora')
    v.unmount()
  })

  it('senza ordini né fatture il top fornitore è dichiarato assente, non inventato', async () => {
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('Top fornitore'))
    expect(v.container.textContent).toContain('nessun ordine né fattura registrata')
    v.unmount()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Scheda «Spesa»: il numero che il titolare guarda per primo.
//
// Qui non si scrive niente sul database, ma si dice al titolare quanto ha
// speso. È il posto dove un errore si crede senza verificarlo — nessuno rifà
// la somma di 217 fatture a mano. Le tre cose da tenere ferme:
//
//   1. la fonte del numero va dichiarata. Gli ordini sono un registro
//      facoltativo che quasi nessuno compila; la spesa vera passa dalle
//      fatture. Se la pagina dicesse "82.676 €" senza dire da dove arriva,
//      nessuno saprebbe perché il numero cambia quando si inserisce un ordine;
//   2. un ordine non ancora ricevuto NON è una spesa. La merce non è entrata e
//      la fattura non è arrivata;
//   3. quando un grafico non si può fare, si spiega perché. Un riquadro vuoto
//      sotto un totale da 82.676 € sembra un guasto.
// ────────────────────────────────────────────────────────────────────────────

describe('scheda Spesa: quanto è uscito e da dove lo sappiamo', () => {
  const ordine = (id, fornitore_id, nome, totale, stato = 'ricevuto', data = '2026-09-10') => ({
    id, organization_id: ORG, fornitore_id, stato, totale,
    data_ordine: data, fornitori: { nome },
  })
  const fattura = (fornitore, totale, data = '2026-09-10') => ({
    organization_id: ORG, fornitore, totale, data_fattura: data,
  })

  async function apriSpesa(extra = () => {}) {
    extra()
    const { v, avvisi } = await renderizza()
    await vaiSu(v, 'Spesa')
    await waitFor(() => expect(v.container.textContent).not.toContain('Caricamento…'))
    return { v, avvisi }
  }

  it('con gli ordini la spesa è la loro somma, e la pagina dice che sono ordini', async () => {
    const { v } = await apriSpesa(() => {
      db.tabelle.fornitori = [{ id: 'f1', organization_id: ORG, categoria: 'Farine' }]
      db.tabelle.ordini_fornitori = [
        ordine('o1', 'f1', 'Molino Rossetto', 1200),
        ordine('o2', 'f1', 'Molino Rossetto', 300),
      ]
    })
    expect(v.container.textContent).toContain('1.500 €')
    expect(v.container.textContent).toContain('ordini ricevuti')
    expect(v.container.textContent).not.toContain('dalle fatture registrate')
    v.unmount()
  })

  it('un ordine non ancora ricevuto non è una spesa', async () => {
    // La merce non è entrata: contarla farebbe sembrare il mese peggiore di
    // quello che è, e poi la conterebbe una seconda volta quando arriva.
    const { v } = await apriSpesa(() => {
      db.tabelle.fornitori = [{ id: 'f1', organization_id: ORG, categoria: 'Farine' }]
      db.tabelle.ordini_fornitori = [
        ordine('o1', 'f1', 'Molino Rossetto', 1200),
        ordine('o2', 'f1', 'Molino Rossetto', 99999, 'inviato'),
        ordine('o3', 'f1', 'Molino Rossetto', 88888, 'bozza'),
      ]
    })
    expect(v.container.textContent).toContain('1.200 €')
    expect(v.container.textContent).not.toContain('99.999')
    expect(v.container.textContent).not.toContain('88.888')
    v.unmount()
  })

  it('senza ordini la spesa arriva dalle fatture, e la pagina lo dichiara', async () => {
    // È il caso del design partner: zero ordini inseriti a mano, 217 fatture
    // nel database. Prima qui compariva "Nessun ordine ricevuto nel periodo".
    const { v } = await apriSpesa(() => {
      db.tabelle.fatture = [
        fattura('Molino Rossetto', 1000),
        fattura('Molino Rossetto', 500),
        fattura('Latteria Alpina', 700),
      ]
    })
    expect(v.container.textContent).toContain('2.200 €')
    expect(v.container.textContent).toContain('dalle fatture registrate')
    expect(v.container.textContent).toContain('Fattura media')
    // Tre fatture, media 733,33 → arrotondata all'unità nei riquadri grandi.
    expect(v.container.textContent).toContain('733 €')
    v.unmount()
  })

  it('con la spesa presa dalle fatture il grafico per categoria spiega cosa manca', async () => {
    // La categoria sta sull'anagrafica del fornitore, non sulla fattura: il
    // grafico non si può fare. Un riquadro vuoto sotto un totale da migliaia
    // di euro sembra un guasto; qui deve esserci scritto cosa fare.
    const { v } = await apriSpesa(() => {
      db.tabelle.fatture = [fattura('Molino Rossetto', 1000)]
    })
    expect(v.container.textContent).toContain('Spesa per categoria')
    expect(v.container.textContent).toContain('servono i fornitori in anagrafica con la loro categoria')
    v.unmount()
  })

  it('né ordini né fatture: lo dice e spiega dove si caricano', async () => {
    const { v } = await apriSpesa()
    expect(v.container.textContent).toContain('non ci sono né ordini ricevuti né fatture registrate')
    expect(v.container.textContent).toContain('Le fatture si caricano dallo Scadenziario')
    v.unmount()
  })

  it('i fornitori senza categoria non spariscono dal grafico', async () => {
    // Prima di questa riga finivano in una voce vuota o fuori dal totale: la
    // somma delle barre non tornava col totale di testata e nessuno capiva
    // dove fossero finiti quei soldi.
    const { v } = await apriSpesa(() => {
      db.tabelle.fornitori = [
        { id: 'f1', organization_id: ORG, categoria: 'Farine' },
        { id: 'f2', organization_id: ORG, categoria: '' },
      ]
      db.tabelle.ordini_fornitori = [
        ordine('o1', 'f1', 'Molino Rossetto', 600),
        ordine('o2', 'f2', 'Ferramenta Bruno', 400),
      ]
    })
    expect(v.container.textContent).toContain('Senza categoria')
    expect(v.container.textContent).toContain('1.000 €')
    v.unmount()
  })

  it('oltre i dodici fornitori il resto sta in una riga sola, non in settantasette barre', async () => {
    // Con tutti in elenco erano 77 barre, 46 delle quali con scritto "0%": la
    // merce vera si perdeva in fondo.
    const { v } = await apriSpesa(() => {
      db.tabelle.fornitori = [{ id: 'f1', organization_id: ORG, categoria: 'Varie' }]
      db.tabelle.ordini_fornitori = Array.from({ length: 15 }, (_, i) =>
        ordine(`o${i}`, 'f1', `Fornitore ${String(i).padStart(2, '0')}`, 100 - i))
    })
    // Solo il grafico, non l'elenco degli ordini che sta sotto (quello li
    // elenca tutti, ed e' giusto cosi').
    const testo = v.container.textContent
    const grafico = testo.slice(testo.indexOf('Spesa per fornitore'), testo.indexOf('Spesa per categoria'))
    expect(grafico).toContain('altri 3 fornitori')
    expect(grafico).toContain('Fornitore 00')
    expect(grafico).not.toContain('Fornitore 14')
    // E il raggruppamento vale davvero quello che manca: 88 + 87 + 86.
    expect(grafico).toContain('261,00 €')
    v.unmount()
  })

  it('le percentuali per fornitore si scrivono con la virgola', async () => {
    const { v } = await apriSpesa(() => {
      db.tabelle.fornitori = [{ id: 'f1', organization_id: ORG, categoria: 'Varie' }]
      db.tabelle.ordini_fornitori = [
        ordine('o1', 'f1', 'Molino Rossetto', 2000),
        ordine('o2', 'f1', 'Latteria Alpina', 1000),
      ]
    })
    expect(v.container.textContent).toContain('66,7%')
    expect(v.container.textContent).toContain('33,3%')
    expect(v.container.textContent).not.toContain('66.7%')
    v.unmount()
  })

  it('cambiando periodo la pagina rilegge il database con una finestra diversa', async () => {
    const { v } = await apriSpesa(() => {
      db.tabelle.ordini_fornitori = [ordine('o1', 'f1', 'Molino Rossetto', 100)]
    })
    const finestra = () => db.scritture
      .filter(s => s.tabella === 'ordini_fornitori' && s.op === 'select')
      .map(s => (s.filtri.find(f => f[0] === 'gte' && f[1] === 'data_ordine') || [])[2])
      .filter(Boolean)

    const primaDelCambio = finestra().at(-1)
    const tendina = v.container.querySelector('select')
    await act(async () => { fireEvent.change(tendina, { target: { value: '365' } }) })
    await act(async () => { await new Promise(r => setTimeout(r, 40)) })

    const dopoIlCambio = finestra().at(-1)
    expect(dopoIlCambio, 'la finestra deve essere stata ricalcolata').toBeTruthy()
    expect(dopoIlCambio < primaDelCambio, 'un anno deve partire da più lontano di trenta giorni').toBe(true)
    v.unmount()
  })

  it('il totale non si spacca se un ordine ha il totale nullo', async () => {
    // Nel database di Mara ci sono ordini con `totale` a NULL: sommandoli
    // direttamente il riquadro diventava "NaN €".
    const { v } = await apriSpesa(() => {
      db.tabelle.fornitori = [{ id: 'f1', organization_id: ORG, categoria: 'Farine' }]
      db.tabelle.ordini_fornitori = [
        ordine('o1', 'f1', 'Molino Rossetto', null),
        ordine('o2', 'f1', 'Molino Rossetto', 250),
      ]
    })
    expect(v.container.textContent).not.toContain('NaN')
    expect(v.container.textContent).toContain('250 €')
    v.unmount()
  })
})
