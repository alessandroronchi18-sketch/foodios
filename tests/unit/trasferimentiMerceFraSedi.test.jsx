// @vitest-environment happy-dom
//
// La merce che passa da una sede all'altra.
//
// Il titolare l'ha definita «molto importante»: da qui passano materie prime e
// prodotti finiti fra i punti vendita, e uno sbaglio qui significa **magazzino
// sbagliato in due sedi contemporaneamente** — quella che manda e quella che
// riceve. Nessuno se ne accorge finché non si fa l'inventario.
//
// Per le materie prime il magazzino non passa dalla funzione del database che
// fa tutto in un colpo: sono **due scritture separate** (scala il magazzino di
// partenza, poi segna "inviato"). È lì che si nascondono i guai, e sono guai
// che si sono già visti:
//
//   - se la seconda scrittura fallisce e la prima resta, la merce è sparita dal
//     magazzino e il trasferimento è ancora una bozza. L'utente ripreme "Invia"
//     e il magazzino viene scalato **una seconda volta**. Dieci chili partiti,
//     venti tolti. In silenzio;
//   - lo stesso al contrario in ricezione: la merce entra due volte;
//   - e se qualcun altro ha già agito sulla riga, chi arriva secondo non deve
//     poter rifare il movimento.
//
// Questi test tengono ferme le protezioni: la conversione kg → grammi, il
// controllo `stock_applicato` prima di riscalare, il rimettere a posto il
// magazzino quando il passo dopo non riesce, e il fatto che una quantità
// ricevuta non può essere più grande di quella partita.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { todayLocal } from '../../src/lib/dateLocal'

// ── Ponteggi ────────────────────────────────────────────────────────────────

const sb = vi.hoisted(() => ({
  chiamate: [],        // { tabella, op, payload, filtri }
  risposta: null,      // (q) => { data, error }
  reset() { this.chiamate = []; this.risposta = null },
}))

vi.mock('../../src/lib/supabase', () => {
  function costruisci(tabella) {
    const q = { tabella, op: 'select', payload: null, filtri: [] }
    const chiudi = () => {
      sb.chiamate.push({ ...q, filtri: [...q.filtri] })
      const r = sb.risposta?.(q)
      return r || { data: [{ id: 'riga-1' }], error: null }
    }
    const c = {
      select() { return c },
      insert(p) { q.op = 'insert'; q.payload = p; return c },
      update(p) { q.op = 'update'; q.payload = p; return c },
      delete() { q.op = 'delete'; return c },
      eq(col, val) { q.filtri.push([col, val]); return c },
      or() { return c },
      order() { return c },
      limit() { return c },
      single: async () => chiudi(),
      maybeSingle: async () => chiudi(),
      then: (res, rej) => Promise.resolve(chiudi()).then(res, rej),
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

const spie = vi.hoisted(() => ({
  loadTrasferimenti: vi.fn(async () => []),
  creaTrasferimento: vi.fn(async (a) => ({ id: 'nuovo-1', ...a })),
  inviaTrasferimento: vi.fn(async () => ({ ok: true })),
  riceviTrasferimento: vi.fn(async () => ({ ok: true })),
  annullaTrasferimento: vi.fn(async () => ({ ok: true })),
  scaricoMP: vi.fn(async () => 0),
  caricoMP: vi.fn(async () => 0),
  aggiungiSpedito: vi.fn(async () => 0),
  ssave: vi.fn(async () => {}),
  sload: vi.fn(async () => null),
}))

vi.mock('../../src/lib/trasferimenti', async (originale) => ({
  ...(await originale()),
  loadTrasferimenti: (...a) => spie.loadTrasferimenti(...a),
  creaTrasferimento: (...a) => spie.creaTrasferimento(...a),
  inviaTrasferimento: (...a) => spie.inviaTrasferimento(...a),
  riceviTrasferimento: (...a) => spie.riceviTrasferimento(...a),
  annullaTrasferimento: (...a) => spie.annullaTrasferimento(...a),
}))
vi.mock('../../src/lib/movimentoMP', () => ({
  scaricoMP: (...a) => spie.scaricoMP(...a),
  caricoMP: (...a) => spie.caricoMP(...a),
}))
vi.mock('../../src/lib/inventarioProduzione', () => ({
  aggiungiSpedito: (...a) => spie.aggiungiSpedito(...a),
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: (...a) => spie.ssave(...a),
  sload: (...a) => spie.sload(...a),
  ssaveBatch: async () => {},
  sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false }))
// Il campo prodotto è un autocomplete che legge ricettario e magazzino: qui
// interessa solo il testo che ci finisce dentro.
vi.mock('../../src/components/ProductAutocomplete', () => ({
  default: ({ value, onChange, placeholder }) => (
    React.createElement('input', {
      'data-campo': 'prodotto', value: value || '', placeholder,
      onChange: (e) => onChange(e.target.value),
    })
  ),
}))

// ── Impalcatura ────────────────────────────────────────────────────────────

const SEDI = [
  { id: 'lab', nome: 'Laboratorio', attiva: true },
  { id: 'bert', nome: 'Berthollet', attiva: true },
]
const ORG = 'org-mara'

async function renderizza(props = {}) {
  const avvisi = []
  const { default: View } = await import('../../src/components/TrasferimentiView.jsx')
  let v
  await act(async () => {
    v = render(
      <View orgId={ORG} sedi={SEDI} sedeAttiva={SEDI[0]}
        notify={(msg, ok = true) => avvisi.push({ msg, ok })} {...props} />,
    )
  })
  await act(async () => { await new Promise(r => setTimeout(r, 40)) })
  return { v, avvisi }
}

const bottone = (v, testo) => [...v.container.querySelectorAll('button')].find(b => b.textContent.trim() === testo)
const perEtichetta = (v, et) => [...v.container.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === et)

async function apriForm(v) {
  await act(async () => { fireEvent.click(bottone(v, 'Nuovo trasferimento')) })
}

function campi(v) {
  const sel = [...v.container.querySelectorAll('select')]
  const num = [...v.container.querySelectorAll('input[type="number"]')]
  return {
    data: v.container.querySelector('input[type="date"]'),
    tipo: sel[0], sedeDa: sel[1], sedeA: sel[2], unita: sel[3],
    prodotto: v.container.querySelector('input[data-campo="prodotto"]'),
    quantita: num[0], valore: num[1],
  }
}

// Compila il modulo. `tipo` va impostato per primo: cambiandolo la vista
// riscrive l'unità.
async function compila(v, { tipo = 'prodotto', da = 'lab', a = 'bert', prodotto = 'Brioches', quantita = '10', unita, valore } = {}) {
  const c = campi(v)
  await act(async () => { fireEvent.change(c.tipo, { target: { value: tipo } }) })
  const c2 = campi(v)
  await act(async () => { fireEvent.change(c2.sedeDa, { target: { value: da } }) })
  const c3 = campi(v)
  await act(async () => { fireEvent.change(c3.sedeA, { target: { value: a } }) })
  const c4 = campi(v)
  fireEvent.change(c4.prodotto, { target: { value: prodotto } })
  fireEvent.change(c4.quantita, { target: { value: quantita } })
  if (unita) await act(async () => { fireEvent.change(campi(v).unita, { target: { value: unita } }) })
  if (valore != null) fireEvent.change(campi(v).valore, { target: { value: valore } })
}

const aggiornamenti = () => sb.chiamate.filter(c => c.tabella === 'trasferimenti' && c.op === 'update')

const TRASF_BASE = {
  id: 't1', organization_id: ORG, sede_da: 'lab', sede_a: 'bert',
  tipo: 'materia_prima', prodotto: 'zucchero', quantita: 10, unita: 'kg',
  valore_unit: 1.2, data: todayLocal(), stato: 'bozza', stock_applicato: false,
}

beforeEach(() => {
  sb.reset()
  for (const k of Object.keys(spie)) spie[k].mockReset()
  spie.loadTrasferimenti.mockResolvedValue([])
  spie.creaTrasferimento.mockImplementation(async (a) => ({ id: 'nuovo-1', ...a }))
  spie.inviaTrasferimento.mockResolvedValue({ ok: true })
  spie.riceviTrasferimento.mockResolvedValue({ ok: true })
  spie.annullaTrasferimento.mockResolvedValue({ ok: true })
  spie.scaricoMP.mockResolvedValue(0)
  spie.caricoMP.mockResolvedValue(0)
  spie.aggiungiSpedito.mockResolvedValue(0)
  spie.ssave.mockResolvedValue(undefined)
  spie.sload.mockResolvedValue(null)
})

// ────────────────────────────────────────────────────────────────────────────

describe('quando la pagina non serve', () => {
  it('con una sede sola spiega a cosa servirebbe invece di offrire il modulo', async () => {
    const { v } = await renderizza({ sedi: [SEDI[0]] })
    expect(v.container.textContent).toContain('Aggiungi almeno 2 sedi')
    expect(bottone(v, 'Nuovo trasferimento')).toBeUndefined()
    v.unmount()
  })

  it('una sede archiviata non conta come seconda sede', async () => {
    const { v } = await renderizza({ sedi: [SEDI[0], { id: 'vecchia', nome: 'Chiusa', attiva: false }] })
    expect(v.container.textContent).toContain('Aggiungi almeno 2 sedi')
    v.unmount()
  })
})

describe('il modulo si rifiuta di creare trasferimenti impossibili', () => {
  it('senza prodotto non si crea niente', async () => {
    const { v, avvisi } = await renderizza()
    await apriForm(v)
    await compila(v, { prodotto: '' })
    await act(async () => { fireEvent.click(bottone(v, 'Invia subito')) })
    expect(spie.creaTrasferimento).not.toHaveBeenCalled()
    expect(avvisi.at(-1)).toEqual({ msg: 'Inserisci il prodotto', ok: false })
    v.unmount()
  })

  it('senza quantità non si crea niente', async () => {
    const { v, avvisi } = await renderizza()
    await apriForm(v)
    await compila(v, { quantita: '0' })
    await act(async () => { fireEvent.click(bottone(v, 'Invia subito')) })
    expect(spie.creaTrasferimento).not.toHaveBeenCalled()
    expect(avvisi.at(-1)).toEqual({ msg: 'Quantità non valida', ok: false })
    v.unmount()
  })

  it('senza la sede di destinazione non si crea niente', async () => {
    const { v, avvisi } = await renderizza()
    await apriForm(v)
    const c = campi(v)
    fireEvent.change(c.prodotto, { target: { value: 'Brioches' } })
    fireEvent.change(c.quantita, { target: { value: '10' } })
    await act(async () => { fireEvent.click(bottone(v, 'Invia subito')) })
    expect(spie.creaTrasferimento).not.toHaveBeenCalled()
    expect(avvisi.at(-1)).toEqual({ msg: 'Seleziona sede di partenza e destinazione', ok: false })
    v.unmount()
  })

  it('una materia prima in pezzi viene rifiutata: il magazzino vive in grammi', async () => {
    // Si arriva a questa combinazione da un modello salvato (il modello porta
    // la sua unità, la tendina no).
    spie.sload.mockResolvedValue([{
      id: 'tpl1', nome: 'Zucchero al bar', tipo: 'materia_prima',
      sede_da: 'lab', sede_a: 'bert', prodotto: 'zucchero', quantita: '5', unita: 'pz', valore_unit: '',
    }])
    const { v, avvisi } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('Zucchero al bar'))
    await act(async () => { fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent.includes('Zucchero al bar'))) })
    await act(async () => { fireEvent.click(bottone(v, 'Invia subito')) })

    expect(spie.scaricoMP).not.toHaveBeenCalled()
    expect(spie.creaTrasferimento).not.toHaveBeenCalled()
    expect(avvisi.at(-1).msg).toMatch(/usa unità 'g' o 'kg'/)
    v.unmount()
  })
})

describe('quello che parte: conversioni e nomi', () => {
  it('10 kg di materia prima scalano diecimila grammi dalla sede di partenza', async () => {
    const { v } = await renderizza()
    await apriForm(v)
    await compila(v, { tipo: 'materia_prima', prodotto: 'zucchero', quantita: '10', unita: 'kg' })
    await act(async () => { fireEvent.click(bottone(v, 'Invia subito')) })
    await waitFor(() => expect(spie.scaricoMP).toHaveBeenCalled())

    expect(spie.scaricoMP.mock.calls[0][0]).toEqual({
      orgId: ORG, sedeId: 'lab', ingrediente: 'zucchero', quantita: 10000,
    })
    v.unmount()
  })

  it('i grammi restano grammi', async () => {
    const { v } = await renderizza()
    await apriForm(v)
    await compila(v, { tipo: 'materia_prima', prodotto: 'sale', quantita: '250', unita: 'g' })
    await act(async () => { fireEvent.click(bottone(v, 'Invia subito')) })
    await waitFor(() => expect(spie.scaricoMP).toHaveBeenCalled())
    expect(spie.scaricoMP.mock.calls[0][0].quantita).toBe(250)
    v.unmount()
  })

  it('il nome del prodotto finito va sempre in maiuscolo', async () => {
    // È lo schema di `stock_prodotti_finiti`: se il nome non combacia, lo
    // scarico finisce su un prodotto fantasma e la vetrina non torna.
    const { v } = await renderizza()
    await apriForm(v)
    await compila(v, { tipo: 'prodotto', prodotto: '  brioches al burro  ', quantita: '24' })
    await act(async () => { fireEvent.click(bottone(v, 'Invia subito')) })
    await waitFor(() => expect(spie.creaTrasferimento).toHaveBeenCalled())

    const arg = spie.creaTrasferimento.mock.calls[0][0]
    expect(arg.prodotto).toBe('BRIOCHES AL BURRO')
    expect(arg.quantita).toBe(24)
    expect(arg.sedeDa).toBe('lab')
    expect(arg.sedeA).toBe('bert')
    expect(arg.autoInvia).toBe(true)
    v.unmount()
  })

  it('la materia prima non passa dalla funzione del database che scala lo stock', async () => {
    // Quella vale solo per i prodotti finiti: per le MP il magazzino lo muove
    // la pagina, e chiedere entrambi scalerebbe due volte.
    const { v } = await renderizza()
    await apriForm(v)
    await compila(v, { tipo: 'materia_prima', prodotto: 'farina', quantita: '2', unita: 'kg' })
    await act(async () => { fireEvent.click(bottone(v, 'Invia subito')) })
    await waitFor(() => expect(spie.creaTrasferimento).toHaveBeenCalled())
    expect(spie.creaTrasferimento.mock.calls[0][0].autoInvia).toBe(false)
    v.unmount()
  })

  it('«Invia subito» parte anche per i semilavorati, non solo per i prodotti finiti', async () => {
    // 19/09/2026, audit della suite. Questa era l'unica cosa che
    // `trasferimentiSenzaBuchi.test.js` proteggeva e che nessun altro
    // controllo vedeva — e lo faceva cercando la stringa
    // `autoInvia: autoInvia && form.tipo !== 'materia_prima'` nel sorgente.
    // Messa alla prova rimettendo la condizione vecchia
    // (`form.tipo === 'prodotto'`), tutti e 44 i test resi di questo file
    // restavano verdi: il semilavorato smetteva di partire da solo e nessuno
    // se ne accorgeva. Chi manda una base a un'altra sede se la ritrova
    // ferma in bozza, e la merce non arriva.
    const { v } = await renderizza()
    await apriForm(v)
    await compila(v, { tipo: 'semilavorato', prodotto: 'PASTA FROLLA', quantita: '5', unita: 'kg' })
    await act(async () => { fireEvent.click(bottone(v, 'Invia subito')) })
    await waitFor(() => expect(spie.creaTrasferimento).toHaveBeenCalled())
    expect(spie.creaTrasferimento.mock.calls[0][0].autoInvia,
      'il semilavorato resta in bozza invece di partire').toBe(true)
    v.unmount()
  })

  it('il valore unitario lasciato vuoto vale zero, non "non è un numero"', async () => {
    const { v } = await renderizza()
    await apriForm(v)
    await compila(v, { prodotto: 'TORTE', quantita: '3' })
    await act(async () => { fireEvent.click(bottone(v, 'Salva bozza')) })
    await waitFor(() => expect(spie.creaTrasferimento).toHaveBeenCalled())
    expect(spie.creaTrasferimento.mock.calls[0][0].valoreUnit).toBe(0)
    v.unmount()
  })

  it('la data proposta è quella locale, non quella UTC', async () => {
    const { v } = await renderizza()
    await apriForm(v)
    expect(campi(v).data.value).toBe(todayLocal())
    v.unmount()
  })

  it('salvare una bozza non tocca il magazzino', async () => {
    const { v, avvisi } = await renderizza()
    await apriForm(v)
    await compila(v, { tipo: 'materia_prima', prodotto: 'burro', quantita: '3', unita: 'kg' })
    await act(async () => { fireEvent.click(bottone(v, 'Salva bozza')) })
    await waitFor(() => expect(spie.creaTrasferimento).toHaveBeenCalled())
    expect(spie.scaricoMP).not.toHaveBeenCalled()
    expect(avvisi.at(-1).msg).toBe('Bozza salvata')
    v.unmount()
  })
})

describe('la materia prima non resta fuori dal magazzino', () => {
  it('se non si riesce a segnare "inviato", la merce torna dentro', async () => {
    // Senza questo, dieci chili sparirebbero dal magazzino di partenza e il
    // trasferimento resterebbe una bozza: al secondo tentativo ne sparirebbero
    // venti.
    sb.risposta = (q) => q.op === 'update'
      ? { data: null, error: { message: 'permesso negato' } }
      : { data: [{ id: 'x' }], error: null }
    const { v, avvisi } = await renderizza()
    await apriForm(v)
    await compila(v, { tipo: 'materia_prima', prodotto: 'zucchero', quantita: '10', unita: 'kg' })
    await act(async () => { fireEvent.click(bottone(v, 'Invia subito')) })
    await waitFor(() => expect(spie.caricoMP).toHaveBeenCalled())

    // Rimessa a posto esattamente la stessa quantità, nella stessa sede.
    expect(spie.caricoMP.mock.calls[0][0]).toEqual({
      orgId: ORG, sedeId: 'lab', ingrediente: 'zucchero', quantita: 10000,
    })
    expect(avvisi.at(-1).ok).toBe(false)
    v.unmount()
  })

  it('se qualcun altro l\'ha già inviata, la merce torna indietro e lo dice', async () => {
    // L'aggiornamento scrive solo se la riga è ancora una bozza. Se non tocca
    // niente, vuol dire che qualcuno ha già agito: non si insiste.
    sb.risposta = (q) => q.op === 'update'
      ? { data: [], error: null }            // nessuna riga toccata
      : { data: [{ id: 'x' }], error: null }
    const { v, avvisi } = await renderizza()
    await apriForm(v)
    await compila(v, { tipo: 'materia_prima', prodotto: 'zucchero', quantita: '10', unita: 'kg' })
    await act(async () => { fireEvent.click(bottone(v, 'Invia subito')) })
    await waitFor(() => expect(spie.caricoMP).toHaveBeenCalled())

    expect(spie.caricoMP.mock.calls[0][0].quantita).toBe(10000)
    expect(avvisi.at(-1).msg).toMatch(/già inviato da qualcun altro|ricarica la pagina/i)
    v.unmount()
  })

  it('l\'aggiornamento scrive solo se la riga è ancora una bozza', async () => {
    const { v } = await renderizza()
    await apriForm(v)
    await compila(v, { tipo: 'materia_prima', prodotto: 'zucchero', quantita: '10', unita: 'kg' })
    await act(async () => { fireEvent.click(bottone(v, 'Invia subito')) })
    await waitFor(() => expect(aggiornamenti().length).toBeGreaterThan(0))

    const upd = aggiornamenti().at(-1)
    expect(upd.payload).toMatchObject({ stato: 'inviato', stock_applicato: true })
    expect(upd.filtri).toContainEqual(['stato', 'bozza'])
    v.unmount()
  })

  it('se il magazzino non basta, il trasferimento non si crea nemmeno', async () => {
    // Prima si guarda se la merce c'è, poi si scrive la riga: se no resterebbe
    // una bozza che dichiara una partenza mai avvenuta.
    spie.scaricoMP.mockRejectedValue(new Error('Disponibilità insufficiente: 2000g disponibili, richiesti 10000g'))
    const { v, avvisi } = await renderizza()
    await apriForm(v)
    await compila(v, { tipo: 'materia_prima', prodotto: 'zucchero', quantita: '10', unita: 'kg' })
    await act(async () => { fireEvent.click(bottone(v, 'Invia subito')) })
    await waitFor(() => expect(avvisi.some(a => a.ok === false)).toBe(true))

    expect(spie.creaTrasferimento).not.toHaveBeenCalled()
    expect(spie.caricoMP).not.toHaveBeenCalled()   // niente da rimettere: non era uscita
    expect(avvisi.at(-1).msg).toContain('Disponibilità insufficiente')
    v.unmount()
  })
})

describe('inviare una bozza già salvata', () => {
  it('una bozza già scalata non scala il magazzino una seconda volta', async () => {
    // `stock_applicato` è la memoria di quello che è già successo.
    spie.loadTrasferimenti.mockResolvedValue([{ ...TRASF_BASE, stock_applicato: true }])
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    await act(async () => { fireEvent.click(perEtichetta(v, 'Invia trasferimento')) })
    await waitFor(() => expect(aggiornamenti().length).toBeGreaterThan(0))

    expect(spie.scaricoMP).not.toHaveBeenCalled()
    expect(aggiornamenti().at(-1).payload).toMatchObject({ stato: 'inviato', stock_applicato: true })
    v.unmount()
  })

  it('una bozza non ancora scalata scala il magazzino di partenza', async () => {
    spie.loadTrasferimenti.mockResolvedValue([{ ...TRASF_BASE, stock_applicato: false }])
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    await act(async () => { fireEvent.click(perEtichetta(v, 'Invia trasferimento')) })
    await waitFor(() => expect(spie.scaricoMP).toHaveBeenCalled())
    expect(spie.scaricoMP.mock.calls[0][0].quantita).toBe(10000)
    v.unmount()
  })

  it('se l\'invio non riesce, il magazzino viene rimesso a posto e si dice', async () => {
    spie.loadTrasferimenti.mockResolvedValue([{ ...TRASF_BASE, stock_applicato: false }])
    sb.risposta = (q) => q.op === 'update'
      ? { data: null, error: { message: 'rete assente' } }
      : { data: [{ id: 'x' }], error: null }
    const { v, avvisi } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    await act(async () => { fireEvent.click(perEtichetta(v, 'Invia trasferimento')) })
    await waitFor(() => expect(spie.caricoMP).toHaveBeenCalled())

    expect(spie.caricoMP.mock.calls[0][0].quantita).toBe(10000)
    expect(avvisi.at(-1).msg).toMatch(/magazzino rimesso a posto/i)
    v.unmount()
  })

  it('e se nemmeno rimetterlo a posto riesce, l\'utente viene avvisato per nome', async () => {
    // È l'unico caso in cui il magazzino resta storto: deve essere gridato,
    // non scritto solo nei log.
    spie.loadTrasferimenti.mockResolvedValue([{ ...TRASF_BASE, stock_applicato: false }])
    sb.risposta = (q) => q.op === 'update'
      ? { data: null, error: { message: 'rete assente' } }
      : { data: [{ id: 'x' }], error: null }
    spie.caricoMP.mockRejectedValue(new Error('rete assente'))
    const { v, avvisi } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    await act(async () => { fireEvent.click(perEtichetta(v, 'Invia trasferimento')) })
    await waitFor(() => expect(avvisi.some(a => /ATTENZIONE/.test(a.msg))).toBe(true))

    const grido = avvisi.at(-1)
    expect(grido.ok).toBe(false)
    expect(grido.msg).toContain('zucchero')
    expect(grido.msg).toMatch(/Controlla la giacenza a mano/i)
    v.unmount()
  })

  it('un prodotto finito passa dalla funzione del database, non dal magazzino MP', async () => {
    spie.loadTrasferimenti.mockResolvedValue([{ ...TRASF_BASE, tipo: 'prodotto', prodotto: 'BRIOCHES', unita: 'pz' }])
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('BRIOCHES'))
    await act(async () => { fireEvent.click(perEtichetta(v, 'Invia trasferimento')) })
    await waitFor(() => expect(spie.inviaTrasferimento).toHaveBeenCalledWith('t1'))
    expect(spie.scaricoMP).not.toHaveBeenCalled()
    v.unmount()
  })
})

describe('chi riceve', () => {
  const inViaggio = { ...TRASF_BASE, stato: 'inviato', stock_applicato: true, sede_da: 'bert', sede_a: 'lab' }

  async function apriRicezione(v) {
    const b = perEtichetta(v, 'Conferma ricezione') || bottone(v, 'Conferma ricezione')
    expect(b, 'il comando di ricezione deve esistere').toBeTruthy()
    await act(async () => { fireEvent.click(b) })
  }

  (v) => [...v.container.querySelectorAll('input[type="number"]')].at(-2) || v.container.querySelector('input[type="number"]')

  it('non si può ricevere più di quanto è partito', async () => {
    // Altrimenti si "creerebbe" merce dal nulla nella sede di arrivo.
    spie.loadTrasferimenti.mockResolvedValue([inViaggio])
    const { v, avvisi } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    await apriRicezione(v)
    const campo = v.container.querySelector('input[type="number"][max="10"]')
    fireEvent.change(campo, { target: { value: '15' } })
    await act(async () => { fireEvent.click([...v.container.querySelectorAll('button')].filter(b => b.textContent.includes('Conferma ricezione')).at(-1)) })

    expect(spie.caricoMP).not.toHaveBeenCalled()
    expect(avvisi.at(-1).ok).toBe(false)
    expect(avvisi.at(-1).msg).toMatch(/Quantità ricevuta non valida/)
    v.unmount()
  })

  it('ricevendone otto su dieci, nel magazzino di arrivo ne entrano ottomila grammi', async () => {
    spie.loadTrasferimenti.mockResolvedValue([inViaggio])
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    await apriRicezione(v)
    fireEvent.change(v.container.querySelector('input[type="number"][max="10"]'), { target: { value: '8' } })
    await act(async () => { fireEvent.click([...v.container.querySelectorAll('button')].filter(b => b.textContent.includes('Conferma ricezione')).at(-1)) })
    await waitFor(() => expect(spie.caricoMP).toHaveBeenCalled())

    expect(spie.caricoMP.mock.calls[0][0]).toEqual({
      orgId: ORG, sedeId: 'lab', ingrediente: 'zucchero', quantita: 8000,
    })
    // E i due chili mancanti restano scritti come scarto, con la nota.
    const upd = aggiornamenti().at(-1)
    expect(upd.payload.quantita_ricevuta).toBe(8)
    expect(upd.payload.scarto_qty).toBe(2)
    expect(upd.payload.stato).toBe('ricevuto')
    v.unmount()
  })

  it('lo scarto si vede prima di confermare', async () => {
    spie.loadTrasferimenti.mockResolvedValue([inViaggio])
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    await apriRicezione(v)
    fireEvent.change(v.container.querySelector('input[type="number"][max="10"]'), { target: { value: '8' } })
    expect(v.container.textContent).toContain('Scarto: 2 kg')
    v.unmount()
  })

  it('se la registrazione fallisce, la merce entrata viene ritolta', async () => {
    // Se no la sede di arrivo si ritrova il doppio della merce al secondo
    // tentativo: il trasferimento è ancora "inviato" e il carico si rifà.
    spie.loadTrasferimenti.mockResolvedValue([inViaggio])
    sb.risposta = (q) => q.op === 'update'
      ? { data: null, error: { message: 'rete assente' } }
      : { data: [{ id: 'x' }], error: null }
    const { v, avvisi } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    await apriRicezione(v)
    await act(async () => { fireEvent.click([...v.container.querySelectorAll('button')].filter(b => b.textContent.includes('Conferma ricezione')).at(-1)) })
    await waitFor(() => expect(spie.scaricoMP).toHaveBeenCalled())

    expect(spie.scaricoMP.mock.calls[0][0]).toEqual({
      orgId: ORG, sedeId: 'lab', ingrediente: 'zucchero', quantita: 10000,
    })
    expect(avvisi.at(-1).msg).toMatch(/magazzino rimesso a posto/i)
    v.unmount()
  })

  it('arrivato niente (tutto rotto): si registra, ma non si carica niente', async () => {
    spie.loadTrasferimenti.mockResolvedValue([inViaggio])
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    await apriRicezione(v)
    fireEvent.change(v.container.querySelector('input[type="number"][max="10"]'), { target: { value: '0' } })
    const note = [...v.container.querySelectorAll('input')].find(i => i.placeholder === 'es. 2 pezzi danneggiati')
    fireEvent.change(note, { target: { value: 'furgone fermo al sole' } })
    await act(async () => { fireEvent.click([...v.container.querySelectorAll('button')].filter(b => b.textContent.includes('Conferma ricezione')).at(-1)) })
    await waitFor(() => expect(aggiornamenti().length).toBeGreaterThan(0))

    expect(spie.caricoMP).not.toHaveBeenCalled()
    const upd = aggiornamenti().at(-1)
    expect(upd.payload.quantita_ricevuta).toBe(0)
    expect(upd.payload.scarto_qty).toBe(10)
    expect(upd.payload.scarto_note).toBe('furgone fermo al sole')
    v.unmount()
  })

  it('un prodotto finito passa dalla funzione del database', async () => {
    spie.loadTrasferimenti.mockResolvedValue([{ ...inViaggio, tipo: 'prodotto', prodotto: 'BRIOCHES', unita: 'pz', quantita: 24 }])
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('BRIOCHES'))
    await apriRicezione(v)
    await act(async () => { fireEvent.click([...v.container.querySelectorAll('button')].filter(b => b.textContent.includes('Conferma ricezione')).at(-1)) })
    await waitFor(() => expect(spie.riceviTrasferimento).toHaveBeenCalled())
    expect(spie.riceviTrasferimento.mock.calls[0][0]).toBe('t1')
    expect(spie.riceviTrasferimento.mock.calls[0][1].quantitaRicevuta).toBe(24)
    expect(spie.caricoMP).not.toHaveBeenCalled()
    v.unmount()
  })
})

describe('annullare un trasferimento in viaggio', () => {
  const inViaggio = { ...TRASF_BASE, stato: 'inviato', stock_applicato: true }

  beforeEach(() => { window.confirm = () => true })

  it('rimette la merce nella sede di partenza', async () => {
    spie.loadTrasferimenti.mockResolvedValue([inViaggio])
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    await act(async () => { fireEvent.click(perEtichetta(v, 'Annulla trasferimento')) })
    await waitFor(() => expect(spie.caricoMP).toHaveBeenCalled())

    expect(spie.caricoMP.mock.calls[0][0]).toEqual({
      orgId: ORG, sedeId: 'lab', ingrediente: 'zucchero', quantita: 10000,
    })
    v.unmount()
  })

  it('e scrive solo se la riga è ancora "inviato"', async () => {
    // Senza questo controllo il secondo clic su annulla rimetterebbe la merce
    // dentro una seconda volta: magazzino gonfiato del doppio.
    spie.loadTrasferimenti.mockResolvedValue([inViaggio])
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    await act(async () => { fireEvent.click(perEtichetta(v, 'Annulla trasferimento')) })
    await waitFor(() => expect(aggiornamenti().length).toBeGreaterThan(0))

    const upd = aggiornamenti().at(-1)
    expect(upd.payload).toEqual({ stato: 'annullato', stock_applicato: false })
    expect(upd.filtri).toContainEqual(['stato', 'inviato'])
    v.unmount()
  })

  it('se la riga è già cambiata sotto le mani, l\'utente lo viene a sapere', async () => {
    spie.loadTrasferimenti.mockResolvedValue([inViaggio])
    sb.risposta = (q) => q.op === 'update'
      ? { data: [], error: null }
      : { data: [{ id: 'x' }], error: null }
    const { v, avvisi } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    await act(async () => { fireEvent.click(perEtichetta(v, 'Annulla trasferimento')) })
    await waitFor(() => expect(avvisi.some(a => a.ok === false)).toBe(true))
    expect(avvisi.at(-1).msg).toMatch(/già stato annullato o ricevuto|ricarica la pagina/i)
    v.unmount()
  })

  it('senza conferma non si annulla niente', async () => {
    window.confirm = () => false
    spie.loadTrasferimenti.mockResolvedValue([inViaggio])
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    await act(async () => { fireEvent.click(perEtichetta(v, 'Annulla trasferimento')) })
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(spie.caricoMP).not.toHaveBeenCalled()
    expect(aggiornamenti()).toHaveLength(0)
    v.unmount()
  })

  it('un trasferimento ricevuto non si può eliminare', async () => {
    spie.loadTrasferimenti.mockResolvedValue([{ ...TRASF_BASE, stato: 'ricevuto', quantita_ricevuta: 10 }])
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    expect(perEtichetta(v, 'Elimina trasferimento')).toBeUndefined()
    expect(perEtichetta(v, 'Elimina bozza')).toBeUndefined()
    v.unmount()
  })
})

describe('il dipendente conferma quello che arriva, e basta', () => {
  const conBozzaEInArrivo = [
    { ...TRASF_BASE, id: 'a', stato: 'inviato', stock_applicato: true, sede_da: 'bert', sede_a: 'lab' },
    { ...TRASF_BASE, id: 'b', stato: 'bozza' },
  ]

  it('può confermare quello che è arrivato alla sua sede', async () => {
    spie.loadTrasferimenti.mockResolvedValue(conBozzaEInArrivo)
    const { v } = await renderizza({ soloRicezione: true })
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    expect(perEtichetta(v, 'Conferma ricezione')).toBeTruthy()
    v.unmount()
  })

  it('non può creare, annullare o ripetere un trasferimento', async () => {
    // Non è solo un pulsante nascosto: le funzioni sul database rifiutano
    // comunque (migration 20260915f). Qui si evita di mostrargli comandi che
    // poi gli darebbero errore.
    spie.loadTrasferimenti.mockResolvedValue([
      ...conBozzaEInArrivo,
      { ...TRASF_BASE, id: 'c', stato: 'ricevuto', quantita_ricevuta: 10 },
    ])
    const { v } = await renderizza({ soloRicezione: true })
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))

    expect(bottone(v, 'Nuovo trasferimento')).toBeUndefined()
    expect(perEtichetta(v, 'Annulla trasferimento')).toBeUndefined()
    expect([...v.container.querySelectorAll('button')].some(b => /Ripeti/.test(b.textContent))).toBe(false)
    v.unmount()
  })

  it('nella corsia "Da fare ora" non gli si propone di inviare una bozza', async () => {
    spie.loadTrasferimenti.mockResolvedValue(conBozzaEInArrivo)
    const { v } = await renderizza({ soloRicezione: true })
    await waitFor(() => expect(v.container.textContent).toContain('Da fare ora'))
    expect([...v.container.querySelectorAll('button')].some(b => b.textContent.includes('Invia ora'))).toBe(false)
    v.unmount()
  })
})

describe('i numeri del mese', () => {
  const oggi = todayLocal()
  const righeMese = [
    { ...TRASF_BASE, id: 'm1', stato: 'ricevuto', data: oggi, quantita: 10, valore_unit: 2, scarto_qty: 0 },
    { ...TRASF_BASE, id: 'm2', stato: 'ricevuto', data: oggi, quantita: 5, valore_unit: 2, scarto_qty: 1 },
    { ...TRASF_BASE, id: 'm3', stato: 'annullato', data: oggi, quantita: 1000, valore_unit: 100, scarto_qty: 0 },
  ]

  it('un trasferimento annullato non conta nei numeri del mese', async () => {
    spie.loadTrasferimenti.mockResolvedValue(righeMese)
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('Accuratezza mese'))
    // Due trasferimenti contati, non tre.
    expect(v.container.textContent).toContain('nel mese corrente')
    expect(v.container.textContent).toContain('1/2 senza scarto')
    expect(v.container.textContent).toContain('50')
    v.unmount()
  })

  it('uno scarto senza valore unitario non si spaccia per zero euro', async () => {
    // "0 €" in nero farebbe credere che non si sia perso niente. Non lo
    // sappiamo: il valore unitario non è stato inserito.
    spie.loadTrasferimenti.mockResolvedValue([
      { ...TRASF_BASE, id: 'x', stato: 'ricevuto', data: oggi, quantita: 5, valore_unit: 0, scarto_qty: 2 },
    ])
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('Accuratezza mese'))
    expect(v.container.textContent).toContain('uno scarto senza valore inserito')
    v.unmount()
  })

  it('il valore sprecato si scrive in euro, col simbolo dopo la cifra', async () => {
    spie.loadTrasferimenti.mockResolvedValue([
      { ...TRASF_BASE, id: 'x', stato: 'ricevuto', data: oggi, quantita: 100, valore_unit: 12, scarto_qty: 10 },
    ])
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('Accuratezza mese'))
    expect(v.container.textContent).toContain('120 €')
    v.unmount()
  })

  it('"da ricevere" conta solo quello che sta arrivando alla sede attiva', async () => {
    spie.loadTrasferimenti.mockResolvedValue([
      { ...TRASF_BASE, id: 'a', stato: 'inviato', sede_da: 'bert', sede_a: 'lab' },   // in arrivo da me
      { ...TRASF_BASE, id: 'b', stato: 'inviato', sede_da: 'lab', sede_a: 'bert' },   // in partenza
    ])
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('Da ricevere'))
    expect(v.container.textContent).toContain('Conferma ricezione')
    // Solo uno dei due è "da ricevere" per la sede attiva.
    expect(v.container.textContent).toContain('Da fare ora (1)')
    v.unmount()
  })
})

describe('filtri e liste', () => {
  const righe = [
    { ...TRASF_BASE, id: 'a', stato: 'bozza', tipo: 'prodotto', prodotto: 'BRIOCHES', unita: 'pz' },
    { ...TRASF_BASE, id: 'b', stato: 'ricevuto', tipo: 'materia_prima', prodotto: 'zucchero' },
  ]

  it('il filtro sullo stato mostra solo quello chiesto, e dichiara quanti ne restano', async () => {
    spie.loadTrasferimenti.mockResolvedValue(righe)
    const { v } = await renderizza()
    await waitFor(() => expect(v.container.textContent).toContain('BRIOCHES'))
    const filtro = [...v.container.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'bozza'))
    await act(async () => { fireEvent.change(filtro, { target: { value: 'bozza' } }) })
    expect(v.container.textContent).toContain('BRIOCHES')
    expect(v.container.textContent).not.toContain('zucchero')
    expect(v.container.textContent).toContain('1 di 2')
    v.unmount()
  })

  it('una sede archiviata resta leggibile nello storico', async () => {
    // Un trasferimento vecchio verso una sede poi archiviata mostrava
    // «Bozza verso —», e non si capiva più dove fosse andata la merce.
    spie.loadTrasferimenti.mockResolvedValue([{ ...TRASF_BASE, sede_a: 'chiusa' }])
    const { v } = await renderizza({
      sedi: [...SEDI, { id: 'chiusa', nome: 'Via Po', attiva: false }],
    })
    await waitFor(() => expect(v.container.textContent).toContain('zucchero'))
    expect(v.container.textContent).toContain('Via Po')
    // ma nella tendina del modulo non si può più spedire lì.
    await apriForm(v)
    const opzioni = [...campi(v).sedeA.options].map(o => o.textContent)
    expect(opzioni).not.toContain('Via Po')
    v.unmount()
  })

  it('senza trasferimenti la pagina spiega a cosa serve invece di dire solo "nessuno"', async () => {
    const { v } = await renderizza()
    expect(v.container.textContent).toContain('Nessun trasferimento')
    expect(v.container.textContent).toContain('le giacenze delle due sedi restano sbagliate')
    v.unmount()
  })

  it('senza organizzazione non si interroga niente', async () => {
    const { v } = await renderizza({ orgId: null })
    expect(spie.loadTrasferimenti).not.toHaveBeenCalled()
    v.unmount()
  })
})
