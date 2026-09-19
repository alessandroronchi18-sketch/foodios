// @vitest-environment happy-dom
//
// La categoria del fornitore si sceglie, non si batte.
//
// Richiesta del titolare, 19/09/2026, sulla scheda Anagrafica della pagina
// Fornitori: «fai in modo che io possa sceglierle prima, e che poi compaiano
// come elenco fisso lì quando scrivo».
//
// Cos'era: un campo di testo libero con un `<datalist>` di quindici
// suggerimenti scritti nel codice. Due difetti sommati, tutti e due già
// corretti altrove in questi giorni (le materie prime il 18/09, i materiali di
// confezionamento lo stesso giorno):
//
//  1. **il `<datalist>` mostra solo le voci che contengono quello che c'è già
//     scritto**: con «Farine» nel campo, aprendolo se ne vedeva una sola e
//     sembrava che le altre non esistessero;
//  2. **il campo era libero, e questo costa di più.** «Latticini» battuto una
//     volta «latticni» diventa una seconda categoria che nessuno nota: la
//     barra della spesa per categoria — che è il motivo per cui la categoria
//     esiste — si spacca in due senza dare nessun errore.
//
// E le quindici categorie erano del programma, non sue. Adesso se le definisce
// lui una volta (chiave condivisa `pasticceria-categorie-fornitori-v1`: i
// fornitori sono gli stessi in tutte le sedi) e il campo propone quelle.

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'

const db = vi.hoisted(() => ({ fornitori: [], fatture: [], scritture: [] }))

vi.mock('../../src/lib/supabase', () => {
  const risposta = (t, conteggio) => conteggio
    ? { data: null, error: null, count: (db[t] || []).length }
    : { data: db[t] || [], error: null, count: (db[t] || []).length }
  function catena(t) {
    let conteggio = false
    const c = {
      select(_cols, o) { if (o?.count) conteggio = true; return c },
      insert(p) { db.scritture.push({ tabella: t, op: 'insert', payload: p }); return c },
      update(p) { db.scritture.push({ tabella: t, op: 'update', payload: p }); return c },
      delete() { return c },
      eq() { return c }, or() { return c }, gte() { return c }, order() { return c }, limit() { return c },
      single: async () => risposta(t, conteggio),
      maybeSingle: async () => risposta(t, conteggio),
      then: (res, rej) => Promise.resolve(risposta(t, conteggio)).then(res, rej),
    }
    return c
  }
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) },
      from: (t) => catena(t),
      rpc: async () => ({ data: null, error: null }),
    },
  }
})

const archivio = vi.hoisted(() => ({ ssave: vi.fn(async () => {}), sload: vi.fn(async () => null) }))
vi.mock('../../src/lib/storage', () => ({
  ssave: (...a) => archivio.ssave(...a),
  sload: (...a) => archivio.sload(...a),
  ssaveBatch: async () => {},
  sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false }))

const ORG = 'org-mara'
const CHIAVE = 'pasticceria-categorie-fornitori-v1'

async function apri() {
  const avvisi = []
  const { default: Fornitori } = await import('../../src/components/Fornitori.jsx')
  let v
  await act(async () => {
    v = render(<Fornitori orgId={ORG} sedeId={null} sedi={[]} notify={(msg, ok = true) => avvisi.push({ msg, ok })} />)
  })
  await act(async () => { await new Promise(r => setTimeout(r, 40)) })
  return { v, avvisi }
}

const campoCategoria = (v) => v.container.querySelector('input[aria-label="Categoria"]')
const voci = (v) => [...v.container.querySelectorAll('[role="option"]')].map(o => o.textContent.trim())
const bottone = (v, testo) => [...v.container.querySelectorAll('button')].find(b => b.textContent.trim() === testo)

beforeEach(() => {
  db.fornitori = []
  db.fatture = []
  db.scritture = []
  archivio.ssave.mockReset().mockResolvedValue(undefined)
  archivio.sload.mockReset().mockResolvedValue(null)
})

// ────────────────────────────────────────────────────────────────────────────

describe('il campo Categoria è un elenco, non una casella libera', () => {
  it('toccandolo si apre e mostra tutte le categorie', async () => {
    const { v } = await apri()
    fireEvent.click(campoCategoria(v))
    // Il difetto del `<datalist>`: prima, con qualcosa scritto nel campo, ne
    // compariva una sola.
    expect(voci(v).length).toBeGreaterThan(5)
    expect(voci(v)).toContain('Latticini')
  })

  it('scrivendo, l’elenco si restringe', async () => {
    const { v } = await apri()
    fireEvent.change(campoCategoria(v), { target: { value: 'latt' } })
    expect(voci(v)).toEqual(['Latticini'])
  })

  it('una categoria che non è in elenco non passa in silenzio', async () => {
    // «latticni» con la i mangiata: prima entrava, e spaccava in due la barra
    // della spesa per categoria senza dire niente.
    const { v } = await apri()
    const campo = campoCategoria(v)
    fireEvent.change(campo, { target: { value: 'Latticni' } })
    fireEvent.keyDown(campo, { key: 'Escape' })
    expect(v.container.textContent).toContain('non è fra le tue categorie')
  })

  it('e l’avviso è scritto in italiano: «le tue categorie», non «i tuoi»', async () => {
    const { v } = await apri()
    const campo = campoCategoria(v)
    fireEvent.change(campo, { target: { value: 'Latticni' } })
    fireEvent.keyDown(campo, { key: 'Escape' })
    expect(v.container.textContent).not.toContain('i tuoi categorie')
  })

  it('ma non è un vicolo cieco: propone quella che le somiglia e offre di crearla', async () => {
    const { v } = await apri()
    const campo = campoCategoria(v)
    fireEvent.change(campo, { target: { value: 'Latticni' } })
    fireEvent.keyDown(campo, { key: 'Escape' })
    expect(v.container.textContent).toContain('Latticini')
    expect(bottone(v, 'Aggiungila alle tue categorie')).toBeTruthy()
  })

  it('scegliendo dall’elenco, la categoria finisce nel database così com’è scritta', async () => {
    const { v } = await apri()
    fireEvent.change(v.container.querySelectorAll('input[type="text"]')[0], { target: { value: 'Latteria Rossi' } })
    fireEvent.click(campoCategoria(v))
    const scelta = [...v.container.querySelectorAll('[role="option"]')].find(o => o.textContent.trim() === 'Latticini')
    fireEvent.mouseDown(scelta)
    await act(async () => { fireEvent.click(bottone(v, 'Aggiungi')) })
    const insert = db.scritture.filter(s => s.tabella === 'fornitori' && s.op === 'insert').at(-1)
    expect(insert.payload.categoria).toBe('Latticini')
  })
})

describe('le categorie se le definisce lui', () => {
  it('quelle salvate prendono il posto di quelle proposte dal programma', async () => {
    archivio.sload.mockImplementation(async (k) => (k === CHIAVE ? ['Farine', 'Vetro e carta'] : null))
    const { v } = await apri()
    fireEvent.click(campoCategoria(v))
    expect(voci(v)).toEqual(['Farine', 'Vetro e carta'])
  })

  it('aggiungerne una la scrive sulla chiave condivisa fra tutte le sedi', async () => {
    // I fornitori sono gli stessi in tutti i negozi: anche il modo di
    // raggrupparli. `sedeId` deve essere `null`, non la sede attiva.
    archivio.sload.mockImplementation(async (k) => (k === CHIAVE ? ['Farine'] : null))
    const { v } = await apri()
    fireEvent.click(bottone(v, 'Le tue'))
    fireEvent.change(v.container.querySelector('input[aria-label="Nuova categoria"]'), { target: { value: 'Surgelati' } })
    await act(async () => { fireEvent.click(bottone(v, 'Aggiungi')) })

    const scritta = archivio.ssave.mock.calls.find(c => c[0] === CHIAVE)
    expect(scritta, 'deve salvare le categorie').toBeTruthy()
    expect(scritta[1]).toEqual(['Farine', 'Surgelati'])
    expect(scritta[2]).toBe(ORG)
    expect(scritta[3]).toBeNull()
  })

  it('la stessa categoria due volte non si aggiunge, e lo dice', async () => {
    archivio.sload.mockImplementation(async (k) => (k === CHIAVE ? ['Farine'] : null))
    const { v, avvisi } = await apri()
    fireEvent.click(bottone(v, 'Le tue'))
    fireEvent.change(v.container.querySelector('input[aria-label="Nuova categoria"]'), { target: { value: '  farine ' } })
    await act(async () => { fireEvent.click(bottone(v, 'Aggiungi')) })
    expect(archivio.ssave.mock.calls.filter(c => c[0] === CHIAVE)).toHaveLength(0)
    expect(avvisi.at(-1).ok).toBe(false)
  })

  it('una categoria assegnata a qualcuno non si toglie da sotto i piedi', async () => {
    db.fornitori = [{ id: 'f1', organization_id: ORG, nome: 'Molino Rossetto', attivo: true, categoria: 'Farine' }]
    archivio.sload.mockImplementation(async (k) => (k === CHIAVE ? ['Farine', 'Vetro e carta'] : null))
    const { v, avvisi } = await apri()
    fireEvent.click(bottone(v, 'Le tue'))
    const togli = [...v.container.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Togli la categoria Farine')
    await act(async () => { fireEvent.click(togli) })
    expect(archivio.ssave.mock.calls.filter(c => c[0] === CHIAVE)).toHaveLength(0)
    expect(avvisi.at(-1).msg).toContain('assegnata a 1 fornitore')
  })

  it('una categoria libera invece si toglie', async () => {
    archivio.sload.mockImplementation(async (k) => (k === CHIAVE ? ['Farine', 'Vetro e carta'] : null))
    const { v } = await apri()
    fireEvent.click(bottone(v, 'Le tue'))
    const togli = [...v.container.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Togli la categoria Vetro e carta')
    await act(async () => { fireEvent.click(togli) })
    expect(archivio.ssave.mock.calls.find(c => c[0] === CHIAVE)[1]).toEqual(['Farine'])
  })

  it('una categoria già assegnata resta in elenco anche se non è fra le sue', async () => {
    // Se no un fornitore già categorizzato diventerebbe «fuori elenco» da
    // solo, senza che nessuno abbia toccato niente.
    db.fornitori = [{ id: 'f1', organization_id: ORG, nome: 'Vetreria Po', attivo: true, categoria: 'Vetro' }]
    archivio.sload.mockImplementation(async (k) => (k === CHIAVE ? ['Farine'] : null))
    const { v } = await apri()
    fireEvent.click(campoCategoria(v))
    expect(voci(v)).toContain('Vetro')
  })

  it('se il salvataggio non riesce, l’elenco a video resta quello vero', async () => {
    archivio.sload.mockImplementation(async (k) => (k === CHIAVE ? ['Farine'] : null))
    archivio.ssave.mockImplementation(async () => { throw new Error('rete assente') })
    const { v, avvisi } = await apri()
    fireEvent.click(bottone(v, 'Le tue'))
    fireEvent.change(v.container.querySelector('input[aria-label="Nuova categoria"]'), { target: { value: 'Surgelati' } })
    await act(async () => { fireEvent.click(bottone(v, 'Aggiungi')) })
    expect(avvisi.at(-1).ok).toBe(false)
    fireEvent.click(campoCategoria(v))
    expect(voci(v)).toEqual(['Farine'])
  })
})
