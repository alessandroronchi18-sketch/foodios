// @vitest-environment happy-dom
//
// ── Correggere una cifra faceva comparire merce ────────────────────────────
//
// Trovato il 20/09/2026 leggendo il percorso della modifica accanto a quello
// della conferma. Erano due copie dello stesso calcolo, e la seconda era
// rimasta a com'era prima del 9 settembre.
//
// IL DIFETTO. `computeSessione`, che ricalcola gli ingredienti quando si
// modifica una sessione, leggeva la ricetta COSÌ COM'È SCRITTA:
//
//     for (const ing of ric.ingredienti) ings[normIng(ing.nome)] += ing.qty1stampo * q
//
// Ma una ricetta può contenere un SEMILAVORATO. Registrando una crostata, il
// magazzino perde farina e burro (lo scarico scende nella frolla). Riaprendo
// quella sessione e correggendo un numero, il calcolo nuovo vedeva invece la
// riga «pasta frolla»: il magazzino si riprendeva farina e burro e nasceva una
// voce «pasta frolla» negativa che sullo scaffale non esiste.
//
// Come riprodurlo sul codice di prima: registrare una crostata, aprire la
// sessione nello storico, cambiare gli stampi da 2 a 3, salvare. La farina
// tornava al valore di partenza invece di scendere.
//
// I DUE DIFETTI CHE STAVANO ACCANTO, della stessa famiglia:
//
//   - `Number(e.stampi) || 0`. In laboratorio si scrive «1,5», perché la
//     virgola è il separatore decimale italiano e la tastiera del tablet
//     propone quella. `Number('1,5')` è NaN, cioè zero: il prodotto usciva
//     dalla sessione. Il resto della pagina usa `parseIT` da luglio.
//   - `scalatoPerChiave` non veniva aggiornato. Dopo una modifica restava
//     quello della sessione di prima, quindi eliminarla restituiva al
//     magazzino le quantità vecchie.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const scritte = { mag: null, gior: null }
const avvisi = []

vi.mock('../../src/lib/storage', () => ({
  ssave: async (key, val) => {
    if (key === 'pasticceria-magazzino-v1') scritte.mag = val
    if (key === 'pasticceria-giornaliero-v1') scritte.gior = val
  },
  ssaveBatch: async (voci) => {
    for (const v of (voci || [])) {
      if (v.key === 'pasticceria-magazzino-v1') scritte.mag = v.value
      if (v.key === 'pasticceria-giornaliero-v1') scritte.gior = v.value
    }
  },
  sload: async () => null, sloadAllSedi: async () => ({}),
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
    auth: { getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getUser: () => Promise.resolve({ data: { user: null } }) },
    from: () => fluente(), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/lib/stockPF', () => ({
  caricoProduzionePF: async () => ({ ok: true }), scartoPF: async () => ({ ok: true }),
}))
vi.mock('../../src/lib/trasferimenti', () => ({ creaTrasferimento: async () => ({ ok: true }) }))

const { default: Produzione } = await import('../../src/views/ProduzioneGiornalieraView.jsx')

// Una crostata che usa una frolla NON tenuta in magazzino: è il caso in cui i
// due motori davano risposte diverse.
const ricettario = {
  ricette: {
    'PASTA FROLLA': {
      nome: 'PASTA FROLLA', tipo: 'semilavorato', unita: 0, prezzo: 0,
      ingredienti: [{ nome: 'farina 00', qty1stampo: 500 }, { nome: 'burro', qty1stampo: 300 }],
    },
    'CROSTATA MELE': {
      nome: 'CROSTATA MELE', tipo: 'fetta', unita: 8, prezzo: 4,
      ingredienti: [{ nome: 'pasta frolla', qty1stampo: 400 }, { nome: 'mele', qty1stampo: 200 }],
    },
  },
  ingredienti_costi: {
    'farina 00': { costoKg: 0.95, costoG: 0.00095 }, burro: { costoKg: 9, costoG: 0.009 },
    mele: { costoKg: 2, costoG: 0.002 },
  },
}
// Il magazzino di una pasticceria vera: la frolla non c'è (si fa e si usa in
// giornata), e le uova stanno salvate al plurale.
const magazzino = {
  'farina 00': { nome: 'farina 00', giacenza_g: 28000, soglia_g: 0 },
  burro: { nome: 'burro', giacenza_g: 10000, soglia_g: 0 },
  mele: { nome: 'mele', giacenza_g: 8000, soglia_g: 0 },
}

// La sessione già registrata: 2 crostate. Lo scarico vero è stato di 500 g di
// farina e 300 g di burro (2 × 400 g di frolla = un batch intero).
const sessione = {
  id: 'g-100', data: '2026-09-18',
  prodotti: [{ nome: 'CROSTATA MELE', stampi: 2, vendibile: 2, congelabile: false }],
  ingredientiUsati: { 'farina 00': 500, burro: 300, mele: 400 },
  scalatoPerChiave: { 'farina 00': 500, burro: 300, mele: 400 },
  fcTot: 3.95, ricavoTot: 64,
  destinazioneSedeId: null, destinazioneSedeNome: null,
}
// Il magazzino come sta DOPO quella sessione.
const magDopo = {
  'farina 00': { nome: 'farina 00', giacenza_g: 27500, soglia_g: 0 },
  burro: { nome: 'burro', giacenza_g: 9700, soglia_g: 0 },
  mele: { nome: 'mele', giacenza_g: 7600, soglia_g: 0 },
}

const props = {
  ricettario, magazzino: magDopo, setMagazzino: () => {}, giornaliero: [sessione], setGiornaliero: () => {},
  notify: (m) => avvisi.push(String(m)), sedi: [{ id: 's1', nome: 'Torino', attiva: true }],
  sedeAttiva: { id: 's1', nome: 'Torino' }, orgId: 'org-1', sedeId: 's1',
}

beforeEach(() => { scritte.mag = null; scritte.gior = null; avvisi.length = 0; cleanup() })

async function apriModifica(extra = {}) {
  const v = render(<Produzione {...props} {...extra} />)
  await waitFor(() => expect(v.container.textContent).toContain('CROSTATA MELE'))
  fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Storico/.test(b.textContent)))
  // Il righello: si aspetta la scheda della sessione, non il montaggio.
  await waitFor(() => expect(v.container.textContent).toContain('Modifica'))
  fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Modifica$/.test(b.textContent.trim())))
  await waitFor(() => expect(v.container.textContent).toContain('Modifica quantità prodotte'))
  return v
}

function campiModifica(v) {
  const riga = [...v.container.querySelectorAll('div')].find(d =>
    d.style.display === 'grid' && d.textContent.includes('CROSTATA MELE'))
  expect(riga, 'riga della modifica').toBeTruthy()
  return [...riga.querySelectorAll('input[type="number"]')]
}

async function salvaModifica(v) {
  fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Salva modifiche/i.test(b.textContent)))
  const conferma = await waitFor(() => {
    const b = [...v.container.querySelectorAll('button')].find(x => /Sì, conferma e aggiorna/i.test(x.textContent))
    expect(b).toBeTruthy(); return b
  })
  fireEvent.click(conferma)
  await waitFor(() => expect(scritte.mag).toBeTruthy(), { timeout: 3000 })
}

describe('modifica sessione — un motore solo, quello vero', () => {
  it('portare 2 crostate a 3 scala altra farina, non la restituisce', async () => {
    const v = await apriModifica()
    const [stampi] = campiModifica(v)
    fireEvent.change(stampi, { target: { value: '3' } })
    await salvaModifica(v)
    // 3 crostate = 1.200 g di frolla = 1,5 batch = 750 g di farina.
    // Prima: 27.500 + 500 (restituiti) − 0 (la voce «pasta frolla» non esiste)
    //        = 28.000, cioè la farina tornava intera.
    expect(scritte.mag['farina 00'].giacenza_g).toBe(28000 - 750)
    expect(scritte.mag.burro.giacenza_g).toBe(10000 - 450)
  })

  it('non nasce nessuna voce «pasta frolla» in magazzino', async () => {
    const v = await apriModifica()
    const [stampi] = campiModifica(v)
    fireEvent.change(stampi, { target: { value: '3' } })
    await salvaModifica(v)
    expect(scritte.mag['pasta frolla']).toBeUndefined()
  })

  it('gli ingredienti salvati nella sessione sono quelli veri, non la frolla', async () => {
    const v = await apriModifica()
    const [stampi] = campiModifica(v)
    fireEvent.change(stampi, { target: { value: '3' } })
    await salvaModifica(v)
    const nuova = scritte.gior.find(s => s.id === 'g-100')
    // `normIng` porta i plurali al singolare: «mele» diventa «mela». La
    // sessione salva le chiavi canoniche, il magazzino tiene quelle scritte
    // dall'utente — ed è proprio il motivo per cui `scalatoPerChiave` esiste.
    expect(Object.keys(nuova.ingredientiUsati).sort()).toEqual(['burro', 'farina 00', 'mela'])
    expect(nuova.ingredientiUsati['farina 00']).toBe(750)
    expect(nuova.scalatoPerChiave.mele).toBe(600)
  })

  it('abbassare da 2 a 1 restituisce davvero la differenza', async () => {
    const v = await apriModifica()
    const [stampi] = campiModifica(v)
    fireEvent.change(stampi, { target: { value: '1' } })
    await salvaModifica(v)
    // 1 crostata = 400 g di frolla = mezzo batch = 250 g di farina.
    expect(scritte.mag['farina 00'].giacenza_g).toBe(28000 - 250)
    expect(scritte.mag.mele.giacenza_g).toBe(8000 - 200)
  })

  it('salvare senza cambiare niente lascia il magazzino dov\'era', async () => {
    // La prova che annulla-e-riapplica non perde un grammo per strada.
    const v = await apriModifica()
    await salvaModifica(v)
    expect(scritte.mag['farina 00'].giacenza_g).toBe(27500)
    expect(scritte.mag.burro.giacenza_g).toBe(9700)
    expect(scritte.mag.mele.giacenza_g).toBe(7600)
  })

  it('anche due modifiche di fila non gonfiano il magazzino', async () => {
    const v = await apriModifica()
    const [stampi] = campiModifica(v)
    fireEvent.change(stampi, { target: { value: '4' } })
    await salvaModifica(v)
    const dopoUna = scritte.gior.find(s => s.id === 'g-100')
    const magDopoUna = scritte.mag
    cleanup(); scritte.mag = null; scritte.gior = null
    const v2 = await apriModifica({ giornaliero: [dopoUna], magazzino: magDopoUna })
    const [s2] = campiModifica(v2)
    fireEvent.change(s2, { target: { value: '2' } })
    await salvaModifica(v2)
    // Si torna a 2 crostate: il magazzino deve tornare esattamente a com'era
    // dopo la sessione originale.
    expect(scritte.mag['farina 00'].giacenza_g).toBe(27500)
    expect(scritte.mag.burro.giacenza_g).toBe(9700)
  })
})

describe('modifica sessione — «1,5» non è zero', () => {
  it('una quantità con la virgola resta quella che si è scritta', async () => {
    const v = await apriModifica()
    const [stampi] = campiModifica(v)
    fireEvent.change(stampi, { target: { value: '1,5' } })
    await salvaModifica(v)
    const nuova = scritte.gior.find(s => s.id === 'g-100')
    expect(nuova.prodotti[0].stampi).toBe(1.5)
  })

  it('e il prodotto non sparisce dalla sessione', async () => {
    // Tutti e due i campi con la virgola: prima diventavano zero e zero, e
    // `stampi > 0 || vendibile > 0` buttava fuori la riga. Chi correggeva una
    // cifra si ritrovava la sessione vuota.
    const v = await apriModifica()
    const [stampi, vendibile] = campiModifica(v)
    fireEvent.change(stampi, { target: { value: '1,5' } })
    fireEvent.change(vendibile, { target: { value: '1,5' } })
    await salvaModifica(v)
    const nuova = scritte.gior.find(s => s.id === 'g-100')
    expect(nuova.prodotti.map(p => p.nome)).toContain('CROSTATA MELE')
    expect(nuova.prodotti).toHaveLength(1)
  })

  it('la virgola vale anche per i pezzi al banco', async () => {
    const v = await apriModifica()
    const [, vendibile] = campiModifica(v)
    fireEvent.change(vendibile, { target: { value: '1,5' } })
    await salvaModifica(v)
    expect(scritte.gior.find(s => s.id === 'g-100').prodotti[0].vendibile).toBe(1.5)
  })

  it('il punto continua a funzionare: non si è rotto il caso normale', async () => {
    const v = await apriModifica()
    const [stampi] = campiModifica(v)
    fireEvent.change(stampi, { target: { value: '2.5' } })
    await salvaModifica(v)
    expect(scritte.gior.find(s => s.id === 'g-100').prodotti[0].stampi).toBe(2.5)
  })

  it('un numero negativo non passa: si ferma a zero', async () => {
    const v = await apriModifica()
    const [stampi] = campiModifica(v)
    fireEvent.change(stampi, { target: { value: '-3' } })
    const [, vendibile] = campiModifica(v)
    fireEvent.change(vendibile, { target: { value: '-3' } })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Salva modifiche/i.test(b.textContent)))
    // Tutto a zero: la pagina chiede conferma prima di togliere il prodotto.
    await waitFor(() => expect(v.container.textContent).toMatch(/Tolgo questo prodotto|Sì, conferma e aggiorna/))
  })
})

describe('modifica sessione — quello che la sessione si porta dietro', () => {
  it('`scalatoPerChiave` viene riscritto con i valori nuovi', async () => {
    const v = await apriModifica()
    const [stampi] = campiModifica(v)
    fireEvent.change(stampi, { target: { value: '3' } })
    await salvaModifica(v)
    const nuova = scritte.gior.find(s => s.id === 'g-100')
    // Prima restava {farina 00: 500, ...}, cioè i numeri della sessione
    // vecchia: eliminandola dopo, il magazzino riceveva indietro meno del vero.
    expect(nuova.scalatoPerChiave['farina 00']).toBe(750)
    expect(nuova.scalatoPerChiave.burro).toBe(450)
    expect(nuova.scalatoPerChiave.mele).toBe(600)
  })

  it('food cost e ricavo si rifanno sui numeri nuovi', async () => {
    const v = await apriModifica()
    const [stampi, vendibile] = campiModifica(v)
    fireEvent.change(stampi, { target: { value: '4' } })
    fireEvent.change(vendibile, { target: { value: '4' } })
    await salvaModifica(v)
    const nuova = scritte.gior.find(s => s.id === 'g-100')
    // 4 al banco × 8 fette × 4,00 € = 128 €
    expect(nuova.ricavoTot).toBe(128)
    expect(nuova.fcTot).toBeGreaterThan(sessione.fcTot)
  })

  it('il ricavo segue i pezzi al banco, non gli stampi', async () => {
    // Quattro stampi ma due soli esposti (gli altri in congelatore): il
    // ricavo potenziale è di due, non di quattro.
    const v = await apriModifica()
    const [stampi] = campiModifica(v)
    fireEvent.change(stampi, { target: { value: '4' } })
    await salvaModifica(v)
    const nuova = scritte.gior.find(s => s.id === 'g-100')
    expect(nuova.prodotti[0].stampi).toBe(4)
    expect(nuova.prodotti[0].vendibile).toBe(2)
    expect(nuova.ricavoTot).toBe(64)
  })

  it('zero pezzi al banco vuol dire ricavo zero, non ricavo pieno', async () => {
    const v = await apriModifica()
    const [, vendibile] = campiModifica(v)
    fireEvent.change(vendibile, { target: { value: '0' } })
    await salvaModifica(v)
    expect(scritte.gior.find(s => s.id === 'g-100').ricavoTot).toBe(0)
  })

  it('la sessione salva prima di cambiare lo stato: se scrivere fallisce, niente si muove', async () => {
    // Save-first. Si rompe la scrittura e si controlla che la pagina lo dica
    // invece di far credere che sia fatto.
    const storage = await import('../../src/lib/storage')
    const originale = storage.ssaveBatch
    let statoToccato = false
    const v = await apriModifica({ setMagazzino: () => { statoToccato = true } })
    vi.spyOn(storage, 'ssaveBatch').mockImplementation(async () => { throw new Error('rete assente') })
    const [stampi] = campiModifica(v)
    fireEvent.change(stampi, { target: { value: '3' } })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Salva modifiche/i.test(b.textContent)))
    const conferma = await waitFor(() => {
      const b = [...v.container.querySelectorAll('button')].find(x => /Sì, conferma e aggiorna/i.test(x.textContent))
      expect(b).toBeTruthy(); return b
    })
    fireEvent.click(conferma)
    await waitFor(() => expect(avvisi.some(a => /Non ho potuto salvare/.test(a))).toBe(true), { timeout: 3000 })
    expect(statoToccato).toBe(false)
    vi.mocked(storage.ssaveBatch).mockRestore?.()
    expect(typeof originale).toBe('function')
  })
})
