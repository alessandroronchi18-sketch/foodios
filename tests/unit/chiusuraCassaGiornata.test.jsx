// @vitest-environment happy-dom
//
// La chiusura di cassa di fine giornata: quello che non si può perdere.
//
// È la pagina che Mara dei Boschi apre tutti i giorni, ed è l'unico punto in
// cui entra il numero da cui dipende tutto il resto — ricavo, margine, food
// cost, P&L del mese. Un errore qui non si vede subito: si vede a fine mese,
// quando il margine è sbagliato e nessuno sa più perché.
//
// Questi test tengono ferme quattro cose che sono già andate storte una volta:
//
//   1. la somma dei canali (POS + contanti + delivery) deve vincere sul totale
//      scritto a mano. Nel foglio di luglio del design partner la somma a mano
//      era sbagliata su una giornata: se il totale digitato vincesse, quella
//      cifra sbagliata finirebbe nello storico;
//   2. i numeri si scrivono all'italiana. "418,30" è un incasso, non zero;
//   3. registrare l'incasso NON deve cancellare l'import della cassa o del
//      delivery già fatto per quel giorno (fusione, non sostituzione);
//   4. se il salvataggio sul database fallisce, lo stato in pagina NON deve
//      cambiare: altrimenti la pagina dice "salvato" e il giorno dopo il dato
//      non c'è (regola `await ssave(...)` PRIMA di `setState`, CLAUDE.md §4).
//
// In più: il sell-through non è l'euro per scontrino. Registrando solo il
// totale non si sa quanto è stato smaltito di quanto prodotto, e prima ci
// finiva dentro lo scontrino medio — 1.477 € su 128 scontrini mostrati come
// "Sell-through 11,5%" in rosso, che abbassava la media del mese.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { todayLocal } from '../../src/lib/dateLocal'

// ── Ponteggi ────────────────────────────────────────────────────────────────

const spie = vi.hoisted(() => ({
  salvaChiusure: vi.fn(async () => true),
  scaricoVenditaPF: vi.fn(async () => 0),
  ssave: vi.fn(async () => {}),
  // Quello che l'AI risponde guardando la foto dello scontrino.
  callAi: vi.fn(async () => ({ text: '{}', json: {} })),
  // Il file export del registratore di cassa, gia' letto.
  parseCassa: vi.fn(async () => []),
  // Il file export della piattaforma delivery, gia' letto.
  parseDeliveroo: vi.fn(() => []),
}))

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
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 't' } } }),
      getUser: () => Promise.resolve({ data: { user: { id: 'u' } } }),
    },
    from: () => fluente(),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: (...a) => spie.ssave(...a),
  sload: async () => null,
  ssaveBatch: async () => {},
  sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/chiusure', async (originale) => ({
  ...(await originale()),
  salvaChiusure: (...a) => spie.salvaChiusure(...a),
}))
vi.mock('../../src/lib/stockPF', () => ({
  scaricoVenditaPF: (...a) => spie.scaricoVenditaPF(...a),
  caricoProduzionePF: async () => 0,
}))
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false }))
vi.mock('../../src/lib/imageUtils', () => ({ compressImage: async (f) => f }))
vi.mock('../../src/lib/aiClient', () => ({
  callAi: (...a) => spie.callAi(...a),
  // Il vero parser sa ripulire il markdown attorno al JSON; qui basta che
  // distingua una risposta leggibile da una che non lo e'.
  parseAiJson: (t) => { try { return JSON.parse(t) } catch { return null } },
}))
// Il vero gestore manda il lavoro in sottofondo e poi richiama onComplete o
// onError. Qui lo esegue subito: il test deve vedere quello che vede l'utente
// a lavoro finito, non la barra di avanzamento.
vi.mock('../../src/lib/backgroundManager', () => ({
  backgroundManager: {
    add: (_id, job) => Promise.resolve()
      .then(() => job.fn(() => {}))
      .then(r => job.onComplete?.(r), e => job.onError?.(e)),
    remove: () => {},
  },
  uploadManager: {
    add: (_id, _file, fn, cb) => Promise.resolve()
      .then(() => fn(() => {}))
      .then(r => cb?.onComplete?.(r), e => cb?.onError?.(e)),
  },
}))
// I lettori dei file export restano finti (il formato dei CSV e' gia' coperto
// dai test delle librerie); la fusione con lo storico invece e' quella vera,
// perche' e' li' che si perdono i dati.
vi.mock('../../src/lib/importDelivery', async (originale) => ({
  ...(await originale()),
  parseDeliveroo: (...a) => spie.parseDeliveroo(...a),
}))
vi.mock('../../src/lib/importCassa', async (originale) => ({
  ...(await originale()),
  parseFile: (...a) => spie.parseCassa(...a),
}))

// ── Dati con la forma vera ──────────────────────────────────────────────────

const ricettario = {
  ricette: {
    r1: {
      nome: 'TORTA SACHER', tipo: 'torta', porzioni: 8, unita: 8, prezzo: 30, categoria: 'Torte',
      ingredienti: [{ nome: 'cioccolato fondente', qty1stampo: 250 }, { nome: 'burro', qty1stampo: 300 }],
    },
    r2: {
      nome: 'BIGNE', tipo: 'pasticceria', porzioni: 20, unita: 20, prezzo: 1.5, categoria: 'Mignon',
      ingredienti: [{ nome: 'burro', qty1stampo: 200 }],
    },
  },
  ingredienti_costi: {
    'cioccolato fondente': { costoKg: 11.2, costoG: 0.0112 },
    burro: { costoKg: 8.4, costoG: 0.0084 },
  },
}

function apri(extra = {}) {
  const chiamate = { chiusure: [], notify: [] }
  const props = {
    ricettario,
    giornaliero: [],
    chiusure: [],
    setChiusure: (v) => chiamate.chiusure.push(v),
    notify: (msg, ok = true) => chiamate.notify.push({ msg, ok }),
    orgId: 'org-1',
    sedeId: 'sede-1',
    ...extra,
  }
  return { props, chiamate }
}

async function renderizza(extra = {}) {
  const { default: ChiusuraView } = await import('../../src/views/ChiusuraView.jsx')
  const { props, chiamate } = apri(extra)
  let v
  await act(async () => { v = render(<ChiusuraView {...props} />) })
  await act(async () => { await new Promise(r => setTimeout(r, 30)) })
  return { v, chiamate }
}

const bottone = (v, testo) =>
  [...v.container.querySelectorAll('button')].find(b => b.textContent.trim() === testo)

// Apre la linguetta "Solo totale" (la pagina parte su "Foto scontrino").
async function apriSoloTotale(v) {
  const tab = bottone(v, 'Solo totale')
  expect(tab, 'la linguetta "Solo totale" deve esistere').toBeTruthy()
  await act(async () => { fireEvent.click(tab) })
  return tab
}

const scrivi = (v, id, valore) => {
  const el = v.container.querySelector(`#${id}`)
  expect(el, `il campo #${id} deve esistere`).toBeTruthy()
  fireEvent.change(el, { target: { value: valore } })
  return el
}

// L'ultimo record salvato per la data richiesta.
function salvataPer(data) {
  expect(spie.salvaChiusure, 'salvaChiusure deve essere stata chiamata').toHaveBeenCalled()
  const ultimo = spie.salvaChiusure.mock.calls.at(-1)
  const lista = ultimo[2]
  const rec = lista.find(c => c.data === data)
  expect(rec, `nel salvataggio deve esserci la giornata ${data}`).toBeTruthy()
  return rec
}

beforeEach(() => {
  spie.salvaChiusure.mockReset().mockResolvedValue(true)
  spie.scaricoVenditaPF.mockReset().mockResolvedValue(0)
  spie.ssave.mockReset().mockResolvedValue(undefined)
  spie.callAi.mockReset().mockResolvedValue({ text: '{}', json: {} })
  spie.parseCassa.mockReset().mockResolvedValue([])
  spie.parseDeliveroo.mockReset().mockReturnValue([])
})

// ────────────────────────────────────────────────────────────────────────────

describe('chiusura rapida: il solo totale della giornata', () => {
  it('la somma dei canali vince sul totale scritto a mano', async () => {
    // Il caso vero: nel registro di luglio il titolare aveva scritto 400 € di
    // totale, ma POS + contanti + delivery facevano 450. Chi tiene il registro
    // diviso per metodo di pagamento non deve rifare la somma a mano.
    const { v } = await renderizza()
    await apriSoloTotale(v)
    scrivi(v, 'fos-incasso', '400')
    scrivi(v, 'fos-pos', '300')
    scrivi(v, 'fos-contanti', '100')
    scrivi(v, 'fos-delivery', '50')

    await act(async () => { fireEvent.click(bottone(v, 'Registra l\'incasso')) })
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    const rec = salvataPer(todayLocal())
    expect(rec.kpi.totV).toBe(450)
    // e i tre canali restano scritti uno per uno, non solo sommati.
    expect(rec.kpi.pos).toBe(300)
    expect(rec.kpi.contanti).toBe(100)
    expect(rec.kpi.delivery).toBe(50)
    v.unmount()
  })

  it('un incasso scritto all\'italiana ("418,30") non diventa zero', async () => {
    const { v } = await renderizza()
    await apriSoloTotale(v)
    scrivi(v, 'fos-incasso', '418,30')

    await act(async () => { fireEvent.click(bottone(v, 'Registra l\'incasso')) })
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    expect(salvataPer(todayLocal()).kpi.totV).toBeCloseTo(418.3, 2)
    v.unmount()
  })

  it('senza il costo delle materie il food cost resta dichiarato ignoto', async () => {
    // Meglio non saperlo che inventarlo: il P&L esclude quel giorno dal food
    // cost invece di contarlo zero e far sembrare il margine migliore.
    const { v } = await renderizza()
    await apriSoloTotale(v)
    scrivi(v, 'fos-incasso', '1000')

    await act(async () => { fireEvent.click(bottone(v, 'Registra l\'incasso')) })
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    const rec = salvataPer(todayLocal())
    expect(rec.foodcost_noto).toBe(false)
    expect(rec.solo_totale).toBe(true)
    v.unmount()
  })

  it('col costo delle materie il margine si calcola e il food cost è dichiarato noto', async () => {
    const { v } = await renderizza()
    await apriSoloTotale(v)
    scrivi(v, 'fos-incasso', '1000')
    scrivi(v, 'fos-materie', '250')

    await act(async () => { fireEvent.click(bottone(v, 'Registra l\'incasso')) })
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    const rec = salvataPer(todayLocal())
    expect(rec.foodcost_noto).toBe(true)
    expect(rec.kpi.totFC).toBe(250)
    expect(rec.kpi.totM).toBe(750)
    expect(rec.kpi.totMP).toBeCloseTo(75, 5)
    v.unmount()
  })

  it('lo scontrino medio si calcola, il sell-through resta vuoto', async () => {
    // 1.477 € su 128 scontrini fanno 11,54 € a scontrino. Prima quel numero
    // finiva in `avgST` e lo Storico lo scriveva "Sell-through 11,5%" in rosso.
    const { v } = await renderizza()
    await apriSoloTotale(v)
    scrivi(v, 'fos-incasso', '1477')
    scrivi(v, 'fos-scontrini', '128')

    await act(async () => { fireEvent.click(bottone(v, 'Registra l\'incasso')) })
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    const rec = salvataPer(todayLocal())
    expect(rec.kpi.scontrinoMedio).toBeCloseTo(11.54, 2)
    expect(rec.kpi.avgST).toBeNull()
    v.unmount()
  })

  it('lo scontrino medio compare a schermo scritto all\'italiana', async () => {
    const { v } = await renderizza()
    await apriSoloTotale(v)
    scrivi(v, 'fos-incasso', '1477')
    scrivi(v, 'fos-scontrini', '128')
    // 11,54 € — virgola decimale e simbolo dopo la cifra.
    await waitFor(() => expect(v.container.textContent).toContain('Scontrino medio: 11,54 €'))
    v.unmount()
  })

  it('il pulsante resta spento finché non c\'è un incasso', async () => {
    const { v } = await renderizza()
    await apriSoloTotale(v)
    expect(bottone(v, 'Registra l\'incasso').disabled).toBe(true)
    scrivi(v, 'fos-incasso', '12,50')
    expect(bottone(v, 'Registra l\'incasso').disabled).toBe(false)
    // Zero non è un incasso: non si registra una giornata a zero per sbaglio.
    scrivi(v, 'fos-incasso', '0')
    expect(bottone(v, 'Registra l\'incasso').disabled).toBe(true)
    v.unmount()
  })

  it('la giornata proposta è quella locale, non quella UTC', async () => {
    // Fra mezzanotte e le due, in Italia, `toISOString().slice(0,10)` dà ancora
    // ieri: la chiusura di stanotte finirebbe sul giorno sbagliato.
    const { v } = await renderizza()
    const campoData = v.container.querySelector('input[type="date"]')
    expect(campoData.value).toBe(todayLocal())
    v.unmount()
  })
})

describe('registrare l\'incasso non cancella quello che c\'è già', () => {
  const precedente = {
    id: 'ch-vecchio',
    data: todayLocal(),
    venduto: [{ nome: 'TORTA SACHER', qta: 3, prezzoUnitario: 30, totale: 90 }],
    confronto: [{ nome: 'TORTA SACHER', unitaV: 3, rv: 90 }],
    formati: [{ nome: 'Cono', categoria: 'Gelato', unitaV: 12, rv: 36 }],
    cassaImport: [{ fonte: 'cassaincloud', importo: 812.4 }],
    deliveryImport: [{ piattaforma: 'deliveroo', importo: 143.2 }],
    kpi: { totV: 812.4, totFC: 210, totM: 602.4, avgST: 88 },
  }

  it('gli import di cassa e delivery della giornata sopravvivono', async () => {
    // Il caso vero: importi il file della cassa, poi scrivi il totale a mano
    // per correggerlo. Prima questa riga buttava via la giornata intera.
    const { v } = await renderizza({ chiusure: [precedente] })
    await apriSoloTotale(v)
    scrivi(v, 'fos-incasso', '900')

    await act(async () => { fireEvent.click(bottone(v, 'Aggiorna l\'incasso')) })
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    const rec = salvataPer(todayLocal())
    expect(rec.cassaImport).toEqual(precedente.cassaImport)
    expect(rec.deliveryImport).toEqual(precedente.deliveryImport)
    // Anche il dettaglio prodotti già letto dallo scontrino resta.
    expect(rec.venduto).toEqual(precedente.venduto)
    expect(rec.confronto).toEqual(precedente.confronto)
    expect(rec.formati).toEqual(precedente.formati)
    // E l'incasso nuovo è quello che ha vinto.
    expect(rec.kpi.totV).toBe(900)
    v.unmount()
  })

  it('la giornata non viene duplicata: resta una riga sola per quella data', async () => {
    const { v } = await renderizza({ chiusure: [precedente, { id: 'ch-altro', data: '2026-01-02', kpi: { totV: 10 } }] })
    await apriSoloTotale(v)
    scrivi(v, 'fos-incasso', '900')

    await act(async () => { fireEvent.click(bottone(v, 'Aggiorna l\'incasso')) })
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    const lista = spie.salvaChiusure.mock.calls.at(-1)[2]
    expect(lista.filter(c => c.data === todayLocal())).toHaveLength(1)
    // e la giornata dell'altro giorno non si tocca.
    expect(lista.find(c => c.data === '2026-01-02').kpi.totV).toBe(10)
    v.unmount()
  })

  it('l\'incasso già registrato si rilegge con la virgola, non col punto', async () => {
    // "418.3" nel campo dove ci si aspetta "418,30" fa sembrare rotto il
    // salvataggio.
    const { v } = await renderizza({
      chiusure: [{ id: 'x', data: todayLocal(), kpi: { totV: 418.3, pos: 200, contanti: 218.3 } }],
    })
    await apriSoloTotale(v)
    expect(v.container.querySelector('#fos-incasso').value).toBe('418,30')
    expect(v.container.querySelector('#fos-pos').value).toBe('200,00')
    v.unmount()
  })
})

describe('se il database rifiuta il salvataggio, la pagina non mente', () => {
  it('lo storico in pagina non viene aggiornato e l\'errore si legge', async () => {
    // Regola di casa: `await ssave(...)` PRIMA di `setState`. Se si invertisse,
    // la pagina direbbe "registrato" e il dato non ci sarebbe.
    spie.salvaChiusure.mockRejectedValue(new Error('rete assente'))
    const { v, chiamate } = await renderizza()
    await apriSoloTotale(v)
    scrivi(v, 'fos-incasso', '640')

    await act(async () => { fireEvent.click(bottone(v, 'Registra l\'incasso')) })
    await waitFor(() => expect(chiamate.notify.length).toBeGreaterThan(0))

    expect(chiamate.chiusure).toHaveLength(0)
    const errore = chiamate.notify.at(-1)
    expect(errore.ok).toBe(false)
    expect(errore.msg).toMatch(/non riesco a salvare/i)
    expect(errore.msg).toContain('rete assente')
    v.unmount()
  })

  it('e il pulsante torna utilizzabile per riprovare', async () => {
    spie.salvaChiusure.mockRejectedValue(new Error('rete assente'))
    const { v, chiamate } = await renderizza()
    await apriSoloTotale(v)
    scrivi(v, 'fos-incasso', '640')
    await act(async () => { fireEvent.click(bottone(v, 'Registra l\'incasso')) })
    await waitFor(() => expect(chiamate.notify.length).toBeGreaterThan(0))
    expect(bottone(v, 'Registra l\'incasso').disabled).toBe(false)
    v.unmount()
  })
})

describe('dettaglio prodotti digitato a mano', () => {
  async function apriDettaglio(extra = {}) {
    const { v, chiamate } = await renderizza(extra)
    await act(async () => { fireEvent.click(bottone(v, 'Dettaglio prodotti')) })
    return { v, chiamate }
  }

  const righeManuali = (v) => {
    const nomi = [...v.container.querySelectorAll('input[list="ric-cassa-list"]')]
    return nomi.map(n => {
      const riga = n.parentElement
      const numerici = [...riga.querySelectorAll('input[type="number"]')]
      return { nome: n, qta: numerici[0], prezzo: numerici[1] }
    })
  }

  async function aggiungi(v, nome, qta, prezzo = '') {
    const r = righeManuali(v)[0]
    fireEvent.change(r.nome, { target: { value: nome } })
    fireEvent.change(r.qta, { target: { value: String(qta) } })
    if (prezzo !== '') fireEvent.change(r.prezzo, { target: { value: String(prezzo) } })
    await act(async () => { fireEvent.click(bottone(v, 'Usa questi prodotti')) })
  }

  it('lo stesso prodotto aggiunto due volte si somma, non si sostituisce', async () => {
    // Chi digita lo scontrino lo fa a pezzi, alzando la testa fra una riga e
    // l'altra. Se la seconda aggiunta sostituisse la prima, i pezzi venduti
    // sarebbero meno di quelli veri e il sell-through uscirebbe basso.
    const { v } = await apriDettaglio()
    await aggiungi(v, 'TORTA SACHER', 3, 30)
    await aggiungi(v, 'TORTA SACHER', 2)
    await waitFor(() => expect(v.container.textContent).toContain('5× TORTA SACHER'))
    v.unmount()
  })

  it('il prezzo lasciato vuoto si prende dal listino della ricetta', async () => {
    const { v } = await apriDettaglio()
    await aggiungi(v, 'torta sacher', 2)   // minuscolo: il nome si normalizza
    // 2 × 30 € di listino = 60,00 €
    await waitFor(() => expect(v.container.textContent).toContain('60,00 €'))
    expect(v.container.textContent).toContain('2× TORTA SACHER')
    v.unmount()
  })

  it('una riga senza quantità non entra, e lo dice', async () => {
    const { v, chiamate } = await apriDettaglio()
    const r = righeManuali(v)[0]
    fireEvent.change(r.nome, { target: { value: 'TORTA SACHER' } })
    await act(async () => { fireEvent.click(bottone(v, 'Usa questi prodotti')) })
    const ultimo = chiamate.notify.at(-1)
    expect(ultimo.ok).toBe(false)
    expect(ultimo.msg).toMatch(/almeno un prodotto con quantità/i)
    v.unmount()
  })

  it('una riga si può togliere prima di salvare', async () => {
    const { v } = await apriDettaglio()
    await aggiungi(v, 'TORTA SACHER', 3, 30)
    await aggiungi(v, 'BIGNE', 10, 1.5)
    const rimuovi = v.container.querySelector('button[aria-label="Rimuovi BIGNE"]')
    expect(rimuovi).toBeTruthy()
    await act(async () => { fireEvent.click(rimuovi) })
    expect(v.container.textContent).not.toContain('10× BIGNE')
    expect(v.container.textContent).toContain('3× TORTA SACHER')
    v.unmount()
  })

  it('un nome cortissimo non viene attribuito a una ricetta a caso', async () => {
    // "SAC" è lungo tre caratteri: se bastasse la sottostringa finirebbe su
    // TORTA SACHER, e il venduto verrebbe attribuito al prodotto sbagliato.
    const { v } = await apriDettaglio()
    await aggiungi(v, 'SAC', 4, 10)
    await waitFor(() => expect(v.container.textContent).toContain('4× SAC'))
    expect(v.container.textContent).toContain('Nessun prodotto del ricettario o formato di vendita trovato')
    v.unmount()
  })

  it('un nome abbastanza lungo invece viene riconosciuto', async () => {
    const { v } = await apriDettaglio()
    await aggiungi(v, 'SACHER', 4, 10)
    await waitFor(() => expect(v.container.textContent).toContain('4× SACHER'))
    expect(v.container.textContent).not.toContain('Nessun prodotto del ricettario o formato di vendita trovato')
    expect(bottone(v, 'Salva chiusura nello storico')).toBeTruthy()
    v.unmount()
  })

  it('salvando il dettaglio la merce esce anche dallo stock della vetrina', async () => {
    const { v } = await apriDettaglio()
    await aggiungi(v, 'TORTA SACHER', 3, 30)
    await act(async () => { fireEvent.click(bottone(v, 'Salva chiusura nello storico')) })
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())
    await waitFor(() => expect(spie.scaricoVenditaPF).toHaveBeenCalled())

    const arg = spie.scaricoVenditaPF.mock.calls[0][0]
    expect(arg.sedeId).toBe('sede-1')
    // Il nome va sempre in maiuscolo: è lo schema di `stock_prodotti_finiti`.
    expect(arg.prodotto).toBe('TORTA SACHER')
    expect(arg.quantita).toBe(3)
    v.unmount()
  })

  it('se il salvataggio fallisce lo stock della vetrina non si tocca', async () => {
    // Altrimenti la merce esce dal magazzino per una chiusura che non esiste.
    spie.salvaChiusure.mockRejectedValue(new Error('403'))
    const { v, chiamate } = await apriDettaglio()
    await aggiungi(v, 'TORTA SACHER', 3, 30)
    await act(async () => { fireEvent.click(bottone(v, 'Salva chiusura nello storico')) })
    await waitFor(() => expect(chiamate.notify.some(n => n.ok === false)).toBe(true))

    expect(spie.scaricoVenditaPF).not.toHaveBeenCalled()
    expect(chiamate.chiusure).toHaveLength(0)
    v.unmount()
  })

  it('una chiusura già salvata non scarica lo stock una seconda volta', async () => {
    // Riaprire la giornata e risalvarla non deve svuotare la vetrina due volte.
    const { v } = await apriDettaglio({
      chiusure: [{ id: 'ch-oggi', data: todayLocal(), venduto: null, kpi: { totV: 500 } }],
    })
    await aggiungi(v, 'TORTA SACHER', 3, 30)
    await act(async () => { fireEvent.click(bottone(v, 'Salva chiusura nello storico')) })
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())
    await act(async () => { await new Promise(r => setTimeout(r, 30)) })
    expect(spie.scaricoVenditaPF).not.toHaveBeenCalled()
    v.unmount()
  })
})

describe('niente dati, dati storti: la pagina regge', () => {
  it('senza ricettario, senza produzione e senza chiusure non crolla', async () => {
    const { v } = await renderizza({ ricettario: null, giornaliero: null, chiusure: null })
    expect(v.container.textContent).toContain('Registra l\'incassato')
    await apriSoloTotale(v)
    scrivi(v, 'fos-incasso', '100')
    await act(async () => { fireEvent.click(bottone(v, 'Registra l\'incasso')) })
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())
    expect(salvataPer(todayLocal()).kpi.totV).toBe(100)
    v.unmount()
  })

  it('una chiusura vecchia col venduto a lista vuota non accusa il ricettario', async () => {
    // `venduto: []` è un valore "vero" in JavaScript: il pannello di confronto
    // lo prendeva per "ho letto uno scontrino e non ho riconosciuto niente" e
    // su ogni giornata chiusa col metodo rapido compariva l'avviso.
    const { v } = await renderizza({
      chiusure: [{ id: 'x', data: todayLocal(), venduto: [], solo_totale: true, kpi: { totV: 300 } }],
    })
    expect(v.container.textContent).not.toContain('Nessun prodotto del ricettario')
    v.unmount()
  })

  it('senza produzione registrata lo dice senza suonare l\'allarme', async () => {
    const { v } = await renderizza()
    expect(v.container.textContent).toContain('Nessuna produzione registrata per questa data')
    expect(v.container.textContent).toContain('I ricavi si salvano comunque')
    v.unmount()
  })

  it('con la produzione del giorno la riconosce e la elenca', async () => {
    const { v } = await renderizza({
      giornaliero: [{ id: 's1', data: todayLocal(), prodotti: [{ nome: 'TORTA SACHER', stampi: 4 }] }],
    })
    expect(v.container.textContent).toContain('Produzione trovata per questa data')
    expect(v.container.textContent).toContain('4× TORTA SACHER')
    v.unmount()
  })

  it('una ricetta malformata (unità zero) non propaga NaN nei totali', async () => {
    // Una sola ricetta con `unita: 0` corrompeva tutti i KPI della pagina.
    const rotto = {
      ricette: { r1: { nome: 'TORTA ROTTA', tipo: 'torta', porzioni: 0, unita: 0, prezzo: 20, ingredienti: [{ nome: 'burro', qty1stampo: 100 }] } },
      ingredienti_costi: { burro: { costoKg: 8.4, costoG: 0.0084 } },
    }
    const { v } = await renderizza({ ricettario: rotto })
    await act(async () => { fireEvent.click(bottone(v, 'Dettaglio prodotti')) })
    const nome = v.container.querySelector('input[list="ric-cassa-list"]')
    const numerici = [...nome.parentElement.querySelectorAll('input[type="number"]')]
    fireEvent.change(nome, { target: { value: 'TORTA ROTTA' } })
    fireEvent.change(numerici[0], { target: { value: '2' } })
    fireEvent.change(numerici[1], { target: { value: '20' } })
    await act(async () => { fireEvent.click(bottone(v, 'Usa questi prodotti')) })

    expect(v.container.textContent).not.toContain('NaN')
    v.unmount()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Foto dello scontrino, import dal registratore di cassa e dal delivery.
//
// Sono le tre strade per cui i numeri della giornata entrano senza che nessuno
// li digiti. Vale a dire: le tre strade in cui un numero sbagliato entra senza
// che nessuno se ne accorga.
// ────────────────────────────────────────────────────────────────────────────

const fotoScontrino = (nome = 'scontrino.jpg') =>
  new File(['finta immagine'], nome, { type: 'image/jpeg' })

const bottoneChe = (v, pezzo) =>
  [...v.container.querySelectorAll('button')].find(b => b.textContent.includes(pezzo))

async function scattaFoto(v, ...files) {
  const input = v.container.querySelector('input[type="file"][accept="image/*"]')
  expect(input, 'il campo per la foto dello scontrino deve esistere').toBeTruthy()
  await act(async () => {
    fireEvent.change(input, { target: { files } })
    await new Promise(r => setTimeout(r, 50))
  })
}

// Il pulsante compare quando il lavoro di prima e' finito (la foto letta, il
// file caricato): si aspetta che ci sia, non un numero di millisecondi.
async function premi(v, pezzoDiTesto) {
  let b
  await waitFor(() => {
    b = bottoneChe(v, pezzoDiTesto)
    expect(b, `deve esserci un pulsante che dice "${pezzoDiTesto}"`).toBeTruthy()
  })
  await act(async () => {
    fireEvent.click(b)
    await new Promise(r => setTimeout(r, 30))
  })
}

// Quello che l'AI dice di aver letto sulla foto.
const scontrinoLetto = (obj) => ({ text: JSON.stringify(obj), json: obj })

const dataInput = (v) => v.container.querySelector('input[type="date"]')

describe('la foto dello scontrino letta dall\'AI', () => {
  // `_receiptPending` in ChiusuraView vive fuori dal componente per non perdere
  // un\'analisi in corso se si cambia pagina. Resta pero' pieno anche a lavoro
  // finito, e il primo montaggio successivo se lo prende: qui lo svuotiamo con
  // un montaggio a vuoto, altrimenti uno scontrino viaggia nel test dopo.
  afterEach(async () => {
    const { v } = await renderizza()
    v.unmount()
  })

  it('un prodotto senza prezzo resta fuori dalla cassa', async () => {
    // A zero euro entrerebbe nel ricavo come venduto gratis: il margine del
    // giorno risulterebbe piu' basso del vero e il food cost, in percentuale
    // sul ricavo, piu' alto. Meglio non averlo che averlo a zero.
    spie.callAi.mockResolvedValue(scontrinoLetto({
      prodotti: [
        { nome: 'TORTA SACHER', qta: 2, totale: 60 },
        { nome: 'BIGNE', qta: 4, totale: 0 },
      ],
    }))
    const { v } = await renderizza()
    await scattaFoto(v, fotoScontrino())
    await premi(v, 'Leggi scontrino con AI')

    await premi(v, 'Salva chiusura nello storico')
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())
    const rec = salvataPer(todayLocal())
    expect(rec.venduto.map(p => p.nome)).toEqual(['TORTA SACHER'])
    v.unmount()
  })

  it('un prodotto senza quantità resta fuori dalla cassa', async () => {
    spie.callAi.mockResolvedValue(scontrinoLetto({
      prodotti: [
        { nome: 'TORTA SACHER', qta: 2, totale: 60 },
        { nome: 'BIGNE', qta: 0, totale: 6 },
      ],
    }))
    const { v } = await renderizza()
    await scattaFoto(v, fotoScontrino())
    await premi(v, 'Leggi scontrino con AI')
    await premi(v, 'Salva chiusura nello storico')
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    expect(salvataPer(todayLocal()).venduto.map(p => p.nome)).toEqual(['TORTA SACHER'])
    v.unmount()
  })

  it('il prezzo unitario è il totale diviso i pezzi, fermato al centesimo', async () => {
    // Dieci euro per tre bignè fanno 3,333… Se il prezzo unitario restasse con
    // la coda di decimali finirebbe cosi' nello storico e poi a schermo.
    spie.callAi.mockResolvedValue(scontrinoLetto({
      prodotti: [{ nome: 'BIGNE', qta: 3, totale: 10 }],
    }))
    const { v } = await renderizza()
    await scattaFoto(v, fotoScontrino())
    await premi(v, 'Leggi scontrino con AI')
    await premi(v, 'Salva chiusura nello storico')
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    const riga = salvataPer(todayLocal()).venduto[0]
    expect(riga.prezzoUnitario).toBe(3.33)
    expect(riga.totale).toBe(10)
    v.unmount()
  })

  it('se l\'AI non capisce la foto, a schermo compare il consiglio, non l\'errore tecnico', async () => {
    // Prima qui compariva "JSON malformato": un messaggio che al titolare non
    // dice niente e soprattutto non dice cosa fare (rifare la foto).
    spie.callAi.mockResolvedValue({ text: 'mi dispiace, non riesco', json: null })
    const { v } = await renderizza()
    await scattaFoto(v, fotoScontrino())
    await premi(v, 'Leggi scontrino con AI')

    await waitFor(() => expect(v.container.textContent).toContain('foto più nitida'))
    expect(v.container.textContent).not.toContain('JSON malformato')
    // E deve restare il modo di riprovare senza rifare tutto il giro.
    expect(bottoneChe(v, 'Riprova')).toBeTruthy()
    v.unmount()
  })

  it('la data letta sullo scontrino sposta la giornata su quella dello scontrino', async () => {
    // Le foto si caricano spesso il giorno dopo. Se la giornata restasse
    // "oggi", l'incasso di ieri andrebbe a finire su oggi e i due giorni
    // sarebbero sbagliati entrambi.
    spie.callAi.mockResolvedValue(scontrinoLetto({
      data: '2026-09-10',
      prodotti: [{ nome: 'TORTA SACHER', qta: 2, totale: 60 }],
    }))
    const { v, chiamate } = await renderizza()
    await scattaFoto(v, fotoScontrino())
    await premi(v, 'Leggi scontrino con AI')

    await waitFor(() => expect(dataInput(v).value).toBe('2026-09-10'))
    expect(chiamate.notify.some(n => n.msg.includes('10/09/2026'))).toBe(true)
    v.unmount()
  })

  it('una data scritta all\'italiana sullo scontrino non sposta la giornata', async () => {
    // "10/09/2026" non e' il formato che il database si aspetta: se passasse
    // cosi' com'e', la chiusura finirebbe su una data che non esiste.
    spie.callAi.mockResolvedValue(scontrinoLetto({
      data: '10/09/2026',
      prodotti: [{ nome: 'TORTA SACHER', qta: 2, totale: 60 }],
    }))
    const { v } = await renderizza()
    await scattaFoto(v, fotoScontrino())
    await premi(v, 'Leggi scontrino con AI')

    await waitFor(() => expect(v.container.textContent).toContain('TORTA SACHER'))
    expect(dataInput(v).value).toBe(todayLocal())
    v.unmount()
  })

  it('cambiando pagina durante la lettura, al ritorno lo scontrino c\'è ancora', async () => {
    // La lettura della foto dura una decina di secondi e nel frattempo si va a
    // guardare il magazzino. Tornando, il lavoro non deve essere da rifare.
    spie.callAi.mockResolvedValue(scontrinoLetto({
      prodotti: [{ nome: 'TORTA SACHER', qta: 2, totale: 60 }],
    }))
    const { v } = await renderizza()
    await scattaFoto(v, fotoScontrino())
    await premi(v, 'Leggi scontrino con AI')
    v.unmount()

    const { v: v2 } = await renderizza()
    await waitFor(() => expect(v2.container.textContent).toContain('TORTA SACHER'))
    v2.unmount()
  })
})

describe('più scontrini letti in una volta sola', () => {
  const dueFoto = [fotoScontrino('a.jpg'), fotoScontrino('b.jpg')]

  it('ogni foto finisce sulla sua data, non tutte su oggi', async () => {
    spie.callAi
      .mockResolvedValueOnce(scontrinoLetto({ data: '2026-09-10', prodotti: [{ nome: 'TORTA SACHER', qta: 2, totale: 60 }] }))
      .mockResolvedValueOnce(scontrinoLetto({ data: '2026-09-11', prodotti: [{ nome: 'BIGNE', qta: 10, totale: 15 }] }))
    const { v } = await renderizza()
    await scattaFoto(v, ...dueFoto)
    await premi(v, 'Leggi tutti')
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    const salvate = spie.salvaChiusure.mock.calls.at(-1)[2]
    expect(salvate.map(c => c.data).sort()).toEqual(['2026-09-10', '2026-09-11'])
    v.unmount()
  })

  it('rileggere un giorno già importato dalla cassa non cancella l\'import della cassa', async () => {
    // È il caso vero: prima si importa il file del registratore, poi si
    // fotografano gli scontrini per avere il dettaglio prodotti. Se la
    // seconda operazione sovrascrivesse il record, l'incasso fiscale del
    // giorno sparirebbe e resterebbe solo la stima dell'AI.
    const giaImportato = {
      id: 'ch-2026-09-10-cassa',
      data: '2026-09-10',
      venduto: [],
      cassaImport: [{ fonte: 'cassaincloud', importo: 1477, data: '2026-09-10' }],
      kpi: { totV: 1477 },
    }
    spie.callAi.mockResolvedValue(scontrinoLetto({
      data: '2026-09-10', prodotti: [{ nome: 'TORTA SACHER', qta: 2, totale: 60 }],
    }))
    const { v } = await renderizza({ chiusure: [giaImportato] })
    await scattaFoto(v, fotoScontrino('a.jpg'), fotoScontrino('b.jpg'))
    await premi(v, 'Leggi tutti')
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    const rec = salvataPer('2026-09-10')
    expect(rec.cassaImport).toHaveLength(1)
    expect(rec.cassaImport[0].importo).toBe(1477)
    // E l'identificativo della riga resta quello di prima: non si crea un
    // doppione della stessa giornata.
    expect(rec.id).toBe('ch-2026-09-10-cassa')
    v.unmount()
  })

  it('una foto illeggibile non ferma le altre e viene contata fra le saltate', async () => {
    spie.callAi
      .mockResolvedValueOnce({ text: 'illeggibile', json: null })
      .mockResolvedValueOnce(scontrinoLetto({ data: '2026-09-11', prodotti: [{ nome: 'BIGNE', qta: 10, totale: 15 }] }))
    const { v, chiamate } = await renderizza()
    await scattaFoto(v, ...dueFoto)
    await premi(v, 'Leggi tutti')
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    expect(salvataPer('2026-09-11')).toBeTruthy()
    expect(chiamate.notify.some(n => n.msg.includes('1 chiusure salvate') && n.msg.includes('1 saltate'))).toBe(true)
    v.unmount()
  })

  it('una foto senza nessun prodotto non diventa una chiusura a zero', async () => {
    // Una giornata salvata vuota entra nelle medie del mese e le abbassa.
    spie.callAi.mockResolvedValue(scontrinoLetto({ data: '2026-09-10', prodotti: [] }))
    const { v, chiamate } = await renderizza()
    await scattaFoto(v, ...dueFoto)
    await premi(v, 'Leggi tutti')
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    expect(spie.salvaChiusure.mock.calls.at(-1)[2]).toHaveLength(0)
    expect(chiamate.notify.some(n => n.msg.includes('0 chiusure salvate'))).toBe(true)
    v.unmount()
  })

  it('se il salvataggio in blocco fallisce, la pagina non dice che è fatto', async () => {
    spie.salvaChiusure.mockRejectedValue(new Error('rete'))
    spie.callAi.mockResolvedValue(scontrinoLetto({ data: '2026-09-10', prodotti: [{ nome: 'BIGNE', qta: 5, totale: 7.5 }] }))
    const { v, chiamate } = await renderizza()
    await scattaFoto(v, ...dueFoto)
    await premi(v, 'Leggi tutti')

    await waitFor(() => expect(chiamate.notify.some(n => n.ok === false)).toBe(true))
    expect(chiamate.chiusure).toHaveLength(0)
    v.unmount()
  })
})

describe('import dal registratore di cassa', () => {
  const caricaFileCassa = async (v) => {
    const input = v.container.querySelector('input[type="file"][accept=".csv,.xml,.xlsx"]')
    expect(input, 'il campo per il file export della cassa deve esistere').toBeTruthy()
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['a;b'], 'export.csv', { type: 'text/csv' })] } })
      await new Promise(r => setTimeout(r, 50))
    })
  }

  async function apriImportCassa(righe, extra = {}) {
    spie.parseCassa.mockResolvedValue(righe)
    const { v, chiamate } = await renderizza(extra)
    await premi(v, 'Sistema cassa')
    await caricaFileCassa(v)
    return { v, chiamate }
  }

  it('l\'incasso importato entra dichiarando che il food cost non si conosce', async () => {
    // Un file di cassa sa quanto è entrato, non cosa è stato venduto. Se la
    // giornata entrasse senza dirlo, il conto economico la leggerebbe come
    // "food cost = 0 €" e il food cost del mese risulterebbe piu' basso del
    // vero.
    const { v } = await apriImportCassa([{ data: '2026-09-10', importo: 1477, iva: 133, righe: 128, fonte: 'cassaincloud' }])
    await waitFor(() => expect(v.container.textContent).toContain('1 record rilevati'))
    await premi(v, 'Importa in Cassa')
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    const rec = salvataPer('2026-09-10')
    expect(rec.solo_totale).toBe(true)
    expect(rec.foodcost_noto).toBe(false)
    expect(rec.kpi.totV).toBe(1477)
    v.unmount()
  })

  it('su una giornata già chiusa col dettaglio, il totale fiscale vince e il margine si rifà', async () => {
    // Il totale dell\'AI è una stima; quello del registratore è il dato buono.
    // Ma il food cost calcolato dal confronto produzione/venduto va tenuto,
    // altrimenti il margine viene fuori pari al ricavo.
    const { v } = await apriImportCassa(
      [{ data: '2026-09-10', importo: 1000, iva: 90, righe: 100, fonte: 'cassaincloud' }],
      { chiusure: [{ id: 'ch-2026-09-10', data: '2026-09-10', venduto: [{ nome: 'BIGNE', qta: 4 }], kpi: { totV: 812.4, totFC: 210, totM: 602.4 } }] },
    )
    await premi(v, 'Importa in Cassa')
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    const rec = salvataPer('2026-09-10')
    expect(rec.kpi.totV).toBe(1000)
    expect(rec.kpi.totFC).toBe(210)
    expect(rec.kpi.totM).toBe(790)
    expect(rec.kpi.totMP).toBeCloseTo(79, 5)
    v.unmount()
  })

  it('se il salvataggio dell\'import non riesce, lo storico in pagina non cambia', async () => {
    // Regola di CLAUDE.md: prima si scrive sul database, poi si aggiorna la
    // pagina. Al contrario la pagina direbbe "importato" e il giorno dopo di
    // quei dati non ci sarebbe traccia.
    spie.salvaChiusure.mockRejectedValue(new Error('403'))
    const { v, chiamate } = await apriImportCassa([{ data: '2026-09-10', importo: 1477, fonte: 'cassaincloud' }])
    await premi(v, 'Importa in Cassa')

    await waitFor(() => expect(chiamate.notify.some(n => n.ok === false)).toBe(true))
    expect(chiamate.chiusure).toHaveLength(0)
    // E la finestra resta aperta, cosi' si puo' riprovare senza ricaricare il file.
    expect(bottoneChe(v, 'Importa in Cassa')).toBeTruthy()
    v.unmount()
  })

  it('un file che non si riesce a leggere lo dice e non importa niente', async () => {
    spie.parseCassa.mockRejectedValue(Object.assign(new Error('colonna importo assente'), { friendly: 'Nel file manca la colonna dell\'importo' }))
    const { v, chiamate } = await renderizza()
    await premi(v, 'Sistema cassa')
    await caricaFileCassa(v)

    await waitFor(() => expect(chiamate.notify.some(n => n.ok === false)).toBe(true))
    expect(chiamate.notify.at(-1).msg).toContain('Nel file manca la colonna dell\'importo')
    expect(spie.salvaChiusure).not.toHaveBeenCalled()
    v.unmount()
  })

  it('più giorni nello stesso file diventano più giornate, non una sola', async () => {
    const { v, chiamate } = await apriImportCassa([
      { data: '2026-09-10', importo: 1000, fonte: 'cassaincloud' },
      { data: '2026-09-11', importo: 1200, fonte: 'cassaincloud' },
      { data: '2026-09-12', importo: 900, fonte: 'cassaincloud' },
    ])
    await premi(v, 'Importa in Cassa')
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    expect(spie.salvaChiusure.mock.calls.at(-1)[2]).toHaveLength(3)
    expect(chiamate.notify.some(n => n.msg.includes('3 giorni importati'))).toBe(true)
    v.unmount()
  })
})

describe('import dalle piattaforme delivery', () => {
  async function apriImportDelivery(righe, extra = {}) {
    spie.parseDeliveroo.mockReturnValue(righe)
    const { v, chiamate } = await renderizza(extra)
    await premi(v, 'Importa delivery')
    const input = v.container.querySelector('input[type="file"][accept=".csv,.xlsx,.xls"]')
    expect(input, 'il campo per il file export del delivery deve esistere').toBeTruthy()
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['a,b'], 'deliveroo.csv', { type: 'text/csv' })] } })
      await new Promise(r => setTimeout(r, 50))
    })
    return { v, chiamate }
  }

  it('l\'incasso del delivery entra al netto delle commissioni, nella casella che il conto economico legge', async () => {
    // Prima l\'import scriveva solo nella lista `delivery`, che nessuna pagina
    // somma: il riquadro diceva "importato" e nel conto economico l\'incasso
    // del delivery non c\'era.
    const { v } = await apriImportDelivery([
      { data: '2026-09-10', importo: 300, commissione: 90, netto: 210, ordini: 12 },
    ], { chiusure: [{ id: 'ch-2026-09-10', data: '2026-09-10', venduto: [], kpi: { totV: 800 } }] })
    await premi(v, 'Importa in Cassa')
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    const rec = salvataPer('2026-09-10')
    expect(rec.kpi.delivery).toBe(210)
    expect(rec.delivery).toHaveLength(1)
    expect(rec.delivery[0].fonte).toBe('deliveroo')
    v.unmount()
  })

  it('reimportare lo stesso file non raddoppia l\'incasso del delivery', async () => {
    // Capita: si riscarica l'export perche' non si e' sicuri di averlo fatto.
    const giaImportato = {
      id: 'ch-2026-09-10', data: '2026-09-10', venduto: [],
      delivery: [{ fonte: 'deliveroo', importo: 300, commissione: 90, netto: 210, ordini: 12 }],
      kpi: { totV: 800, delivery: 210 },
    }
    const { v } = await apriImportDelivery([
      { data: '2026-09-10', importo: 300, commissione: 90, netto: 210, ordini: 12 },
    ], { chiusure: [giaImportato] })
    await premi(v, 'Importa in Cassa')
    await waitFor(() => expect(spie.salvaChiusure).toHaveBeenCalled())

    const rec = salvataPer('2026-09-10')
    expect(rec.delivery).toHaveLength(1)
    expect(rec.kpi.delivery).toBe(210)
    v.unmount()
  })

  it('se il salvataggio non riesce, lo storico in pagina non cambia', async () => {
    spie.salvaChiusure.mockRejectedValue(new Error('rete'))
    const { v, chiamate } = await apriImportDelivery([{ data: '2026-09-10', importo: 300, commissione: 90, netto: 210, ordini: 12 }])
    await premi(v, 'Importa in Cassa')

    await waitFor(() => expect(chiamate.notify.some(n => n.ok === false)).toBe(true))
    expect(chiamate.chiusure).toHaveLength(0)
    v.unmount()
  })
})

describe('il dipendente registra la chiusura, ma non il food cost', () => {
  // Al dipendente il ricettario arriva ripulito dei costi: se salvasse lui il
  // record, il food cost della giornata sarebbe zero e il conto economico del
  // mese ne uscirebbe falsato. Il calcolo lo rifà il server.
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ ok: true, chiusure: [{ id: 'ch-srv', data: todayLocal(), kpi: { totV: 60, totFC: 21 } }] }),
    }))
  })

  async function chiusuraDipendente(extra = {}) {
    const { v, chiamate } = await renderizza({ isDipendente: true, ...extra })
    await act(async () => { fireEvent.click(bottone(v, 'Dettaglio prodotti')) })
    const nome = v.container.querySelector('input[list="ric-cassa-list"]')
    const numerici = [...nome.parentElement.querySelectorAll('input[type="number"]')]
    fireEvent.change(nome, { target: { value: 'TORTA SACHER' } })
    fireEvent.change(numerici[0], { target: { value: '2' } })
    fireEvent.change(numerici[1], { target: { value: '30' } })
    await act(async () => { fireEvent.click(bottone(v, 'Usa questi prodotti')) })
    await premi(v, 'Salva chiusura nello storico')
    return { v, chiamate }
  }

  it('la chiusura passa dal server, non viene scritta dalla pagina', async () => {
    const { v, chiamate } = await chiusuraDipendente()
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    const [url, opzioni] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/chiusura-registra')
    const corpo = JSON.parse(opzioni.body)
    expect(corpo.sedeId).toBe('sede-1')
    expect(corpo.data).toBe(todayLocal())
    expect(corpo.venduto.map(p => p.nome)).toContain('TORTA SACHER')
    // Il corpo NON deve contenere il food cost: quello lo rifà il server.
    expect(corpo.kpi).toBeUndefined()
    expect(spie.salvaChiusure).not.toHaveBeenCalled()
    expect(chiamate.chiusure.at(-1)[0].id).toBe('ch-srv')
    v.unmount()
  })

  it('se il server rifiuta, lo storico in pagina non cambia e l\'errore si legge', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'non autorizzato' }) }))
    const { v, chiamate } = await chiusuraDipendente()

    await waitFor(() => expect(chiamate.notify.some(n => n.ok === false)).toBe(true))
    expect(chiamate.notify.at(-1).msg).toContain('non autorizzato')
    expect(chiamate.chiusure).toHaveLength(0)
    expect(spie.scaricoVenditaPF).not.toHaveBeenCalled()
    v.unmount()
  })

  it('la merce esce comunque dalla vetrina: quella non dipende dal ricettario', async () => {
    const { v } = await chiusuraDipendente({
      giornaliero: [{ id: 's1', data: todayLocal(), prodotti: [{ nome: 'TORTA SACHER', stampi: 1 }] }],
    })
    await waitFor(() => expect(spie.scaricoVenditaPF).toHaveBeenCalled())

    const arg = spie.scaricoVenditaPF.mock.calls[0][0]
    expect(arg.prodotto).toBe('TORTA SACHER')
    expect(arg.quantita).toBe(2)
    v.unmount()
  })
})
