// @vitest-environment happy-dom
//
// ── Il semilavorato: due difetti veri, trovati il 20/09/2026 ───────────────
//
// Misurati sui dati del design partner (Mara dei Boschi), non dedotti dal
// codice: 68 ricette, **5 semilavorati**, e **2 di quei 5 stanno in magazzino**
// (`base bianca`, `salsa zabaione`). **29 ricette su 68** usano la base bianca
// come ingrediente.
//
// PRIMO DIFETTO — il semilavorato finiva in vetrina.
// `stock_prodotti_finiti` è lo stock da cui la cassa scarica le vendite. Una
// base bianca lì dentro è una riga che nessuno scaricherà mai: si accumula, e
// i conti della vetrina smettono di tornare. Il guardiano
// `if (reg.tipo === 'semilavorato') continue` esisteva dal 9 settembre, ma solo
// dentro `eseguiTrasferimentoAuto`, cioè nel trasferimento fra sedi. Il
// percorso di tutti i giorni — produci, carica in vetrina — non ce l'aveva.
// Corretto in un posto, lasciato nell'altro: è la stessa forma del difetto del
// 14 settembre, quando lo zero dei pezzi al banco era stato sistemato per il
// titolare e non per il dipendente.
//
// SECONDO DIFETTO — il giro era aperto da una parte sola.
// Produrre BASE BIANCA scalava latte e zucchero, ma non aumentava di un grammo
// la voce «base bianca» in magazzino. Poi le 29 ricette che la usano la
// scalavano. La giacenza di una base tenuta sullo scaffale poteva solo
// scendere, ogni giorno, verso un rosso permanente che non corrispondeva a
// niente di reale — e la pagina dichiarava «scorte insufficienti» su una base
// appena fatta.
//
// Come riprodurli sul codice di prima: produrre un batch di una base tenuta in
// magazzino. In vetrina compariva; in magazzino no.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const scritte = { mag: null, gior: null }
const carichi = []
const scarti = []
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
  caricoProduzionePF: async (arg) => { carichi.push(arg); return { ok: true } },
  scartoPF: async (arg) => { scarti.push(arg); return { ok: true } },
}))
vi.mock('../../src/lib/trasferimenti', () => ({ creaTrasferimento: async () => ({ ok: true }) }))

const { default: Produzione } = await import('../../src/views/ProduzioneGiornalieraView.jsx')

// Il caso di Mara: una base che il laboratorio tiene sullo scaffale, e un
// gusto che la consuma.
const ricettario = {
  ricette: {
    'BASE BIANCA': {
      nome: 'BASE BIANCA', tipo: 'semilavorato', unita: 0, prezzo: 0,
      ingredienti: [{ nome: 'latte', qty1stampo: 700 }, { nome: 'zucchero', qty1stampo: 300 }],
    },
    'GUSTO FIORDILATTE': {
      nome: 'GUSTO FIORDILATTE', tipo: 'gusto', unita: 6, prezzo: 3,
      ingredienti: [{ nome: 'base bianca', qty1stampo: 500 }, { nome: 'panna', qty1stampo: 100 }],
    },
  },
  ingredienti_costi: {
    latte: { costoKg: 1.2, costoG: 0.0012 }, zucchero: { costoKg: 0.9, costoG: 0.0009 },
    panna: { costoKg: 4, costoG: 0.004 }, 'base bianca': { costoKg: 2.31, costoG: 0.00231 },
  },
}
const magazzino = {
  'base bianca': { nome: 'base bianca', giacenza_g: 1000, soglia_g: 0 },
  latte: { nome: 'latte', giacenza_g: 20000, soglia_g: 0 },
  zucchero: { nome: 'zucchero', giacenza_g: 20000, soglia_g: 0 },
  panna: { nome: 'panna', giacenza_g: 5000, soglia_g: 0 },
}

const props = {
  ricettario, magazzino, setMagazzino: () => {}, giornaliero: [], setGiornaliero: () => {},
  notify: (m) => avvisi.push(String(m)), sedi: [{ id: 's1', nome: 'Torino', attiva: true }],
  sedeAttiva: { id: 's1', nome: 'Torino' }, orgId: 'org-1', sedeId: 's1',
}

beforeEach(() => {
  scritte.mag = null; scritte.gior = null
  carichi.length = 0; scarti.length = 0; avvisi.length = 0
  cleanup()
})

// Trova la riga della tabella di quel prodotto e ci scrive gli stampi.
function scriviStampi(v, nome, valore) {
  const riga = [...v.container.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes(nome))
  expect(riga, `riga di ${nome}`).toBeTruthy()
  const campo = riga.querySelector('input[type="number"]')
  expect(campo, `campo stampi di ${nome}`).toBeTruthy()
  fireEvent.change(campo, { target: { value: String(valore) } })
}

async function confermaSessione(v) {
  const primo = [...v.container.querySelectorAll('button')].find(b => /Conferma produzione/i.test(b.textContent))
  expect(primo, 'pulsante «Conferma produzione»').toBeTruthy()
  fireEvent.click(primo)
  const secondo = await waitFor(() => {
    const b = [...v.container.querySelectorAll('button')].find(x => /Sì, conferma/i.test(x.textContent))
    expect(b).toBeTruthy()
    return b
  })
  fireEvent.click(secondo)
  await waitFor(() => expect(scritte.gior).toBeTruthy(), { timeout: 3000 })
}

async function apri(extra = {}) {
  const v = render(<Produzione {...props} {...extra} />)
  // Il righello: si aspetta che la tabella abbia DAVVERO disegnato le due
  // ricette, non che il componente sia montato. Un waitFor che passa sul primo
  // disegno non prova niente.
  await waitFor(() => {
    expect(v.container.textContent).toContain('BASE BIANCA')
    expect(v.container.textContent).toContain('GUSTO FIORDILATTE')
  })
  return v
}

describe('produzione — il semilavorato non entra in vetrina', () => {
  it('produrre una base NON la carica nello stock dei prodotti finiti', async () => {
    const v = await apri()
    scriviStampi(v, 'BASE BIANCA', 2)
    await confermaSessione(v)
    expect(carichi.map(c => c.prodotto)).not.toContain('BASE BIANCA')
  })

  it('un gusto invece in vetrina ci va: il guardiano non spegne tutto', async () => {
    const v = await apri()
    scriviStampi(v, 'GUSTO FIORDILATTE', 3)
    await confermaSessione(v)
    const c = carichi.find(x => x.prodotto === 'GUSTO FIORDILATTE')
    expect(c).toBeTruthy()
    // 3 batch × 6 unità = 18 pezzi al banco.
    expect(c.quantita).toBe(18)
  })

  it('base e gusto insieme: passa solo il gusto', async () => {
    const v = await apri()
    scriviStampi(v, 'BASE BIANCA', 1)
    scriviStampi(v, 'GUSTO FIORDILATTE', 1)
    await confermaSessione(v)
    expect(carichi.map(c => c.prodotto)).toEqual(['GUSTO FIORDILATTE'])
  })

  it('la base resta comunque registrata nella sessione: non sparisce', async () => {
    const v = await apri()
    scriviStampi(v, 'BASE BIANCA', 2)
    await confermaSessione(v)
    const nomi = (scritte.gior[0].prodotti || []).map(p => p.nome)
    expect(nomi).toContain('BASE BIANCA')
    expect(scritte.gior[0].prodotti.find(p => p.nome === 'BASE BIANCA').stampi).toBe(2)
  })

  it('e il suo food cost viene contato: non è merce gratis', async () => {
    const v = await apri()
    scriviStampi(v, 'BASE BIANCA', 2)
    await confermaSessione(v)
    // 2 batch × (700 g × 0,0012 + 300 g × 0,0009) = 2 × 1,11 = 2,22 €
    expect(scritte.gior[0].fcTot).toBeCloseTo(2.22, 2)
  })

  it('eliminare quella sessione non scarta dalla vetrina quello che non c\'era', async () => {
    // Lo specchio della conferma. Senza, eliminare porterebbe la vetrina sotto
    // zero su un prodotto che non ci ha mai messo piede.
    const sess = {
      id: 'g-1', data: '2026-09-18',
      prodotti: [{ nome: 'BASE BIANCA', stampi: 2, vendibile: 2 }],
      ingredientiUsati: { latte: 1400, zucchero: 600 },
      scalatoPerChiave: { latte: 1400, zucchero: 600 },
      fcTot: 2.22, ricavoTot: 0,
    }
    const v = await apri({ giornaliero: [sess] })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Storico/.test(b.textContent)))
    await waitFor(() => expect(v.container.textContent).toContain('Elimina'))
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Elimina$/.test(b.textContent.trim())))
    const campo = await waitFor(() => {
      const c = v.container.querySelector('input[placeholder="ELIMINA"]')
      expect(c).toBeTruthy(); return c
    })
    fireEvent.change(campo, { target: { value: 'ELIMINA' } })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Elimina e reintegra/i.test(b.textContent)))
    await waitFor(() => expect(scritte.gior).toBeTruthy(), { timeout: 3000 })
    expect(scarti.map(s => s.prodotto)).not.toContain('BASE BIANCA')
  })
})

describe('produzione — la base prodotta torna sullo scaffale', () => {
  it('produrre 2 batch di base bianca aumenta la sua giacenza di 2.000 g', async () => {
    const v = await apri()
    scriviStampi(v, 'BASE BIANCA', 2)
    await confermaSessione(v)
    // Un batch pesa 700 + 300 = 1.000 g. Prima restava a 1.000 per sempre.
    expect(scritte.mag['base bianca'].giacenza_g).toBe(3000)
  })

  it('e intanto scala i suoi ingredienti veri', async () => {
    const v = await apri()
    scriviStampi(v, 'BASE BIANCA', 2)
    await confermaSessione(v)
    expect(scritte.mag.latte.giacenza_g).toBe(20000 - 1400)
    expect(scritte.mag.zucchero.giacenza_g).toBe(20000 - 600)
  })

  it('non scala sé stessa due volte: il rientro non diventa un consumo', async () => {
    const v = await apri()
    scriviStampi(v, 'BASE BIANCA', 1)
    await confermaSessione(v)
    // 1.000 di partenza + 1.000 prodotti. Se la base venisse anche consumata,
    // qui si leggerebbe 1.000 o meno.
    expect(scritte.mag['base bianca'].giacenza_g).toBe(2000)
  })

  it('il gusto la consuma davvero: 2 batch = 1.000 g di base in meno', async () => {
    const v = await apri()
    scriviStampi(v, 'GUSTO FIORDILATTE', 2)
    await confermaSessione(v)
    expect(scritte.mag['base bianca'].giacenza_g).toBe(0)
    expect(scritte.mag.panna.giacenza_g).toBe(5000 - 200)
  })

  it('base e gusto nella stessa sessione si pareggiano', async () => {
    const v = await apri()
    scriviStampi(v, 'BASE BIANCA', 1)        // +1.000
    scriviStampi(v, 'GUSTO FIORDILATTE', 2)  // −1.000
    await confermaSessione(v)
    expect(scritte.mag['base bianca'].giacenza_g).toBe(1000)
  })

  it('il rientro è registrato col segno meno, così l\'eliminazione lo annulla', async () => {
    const v = await apri()
    scriviStampi(v, 'BASE BIANCA', 2)
    await confermaSessione(v)
    // `scalatoPerChiave` dice quanto è USCITO. Un rientro è un'uscita
    // negativa: rimettendolo al suo posto, l'eliminazione lo toglie.
    expect(scritte.gior[0].scalatoPerChiave['base bianca']).toBe(-2000)
    expect(scritte.gior[0].scalatoPerChiave.latte).toBe(1400)
  })

  it('eliminata la sessione, la base torna a com\'era', async () => {
    const magPieno = {
      ...magazzino,
      'base bianca': { nome: 'base bianca', giacenza_g: 3000, soglia_g: 0 },
      latte: { nome: 'latte', giacenza_g: 18600, soglia_g: 0 },
    }
    const sess = {
      id: 'g-1', data: '2026-09-18',
      prodotti: [{ nome: 'BASE BIANCA', stampi: 2, vendibile: 2 }],
      ingredientiUsati: { latte: 1400, zucchero: 600 },
      scalatoPerChiave: { 'base bianca': -2000, latte: 1400, zucchero: 600 },
      fcTot: 2.22, ricavoTot: 0,
    }
    const v = await apri({ magazzino: magPieno, giornaliero: [sess] })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Storico/.test(b.textContent)))
    await waitFor(() => expect(v.container.textContent).toContain('Elimina'))
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Elimina$/.test(b.textContent.trim())))
    const campo = await waitFor(() => {
      const c = v.container.querySelector('input[placeholder="ELIMINA"]')
      expect(c).toBeTruthy(); return c
    })
    fireEvent.change(campo, { target: { value: 'ELIMINA' } })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Elimina e reintegra/i.test(b.textContent)))
    await waitFor(() => expect(scritte.mag).toBeTruthy(), { timeout: 3000 })
    expect(scritte.mag['base bianca'].giacenza_g).toBe(1000)
    expect(scritte.mag.latte.giacenza_g).toBe(20000)
  })

  it('una base che NON è in magazzino non rientra da nessuna parte', async () => {
    // Quando la base non sta sullo scaffale, lo scarico scende nei suoi
    // ingredienti: farle anche un rientro vorrebbe dire contarla due volte.
    const magSenzaBase = { ...magazzino }
    delete magSenzaBase['base bianca']
    const v = await apri({ magazzino: magSenzaBase })
    scriviStampi(v, 'BASE BIANCA', 2)
    await confermaSessione(v)
    expect(scritte.mag['base bianca']).toBeUndefined()
    expect(scritte.gior[0].scalatoPerChiave['base bianca']).toBeUndefined()
  })

  it('e allora il gusto scala gli ingredienti della base, non la base', async () => {
    const magSenzaBase = { ...magazzino }
    delete magSenzaBase['base bianca']
    const v = await apri({ magazzino: magSenzaBase })
    scriviStampi(v, 'GUSTO FIORDILATTE', 1)
    await confermaSessione(v)
    // 500 g di base = mezzo batch = 350 di latte e 150 di zucchero.
    expect(scritte.mag.latte.giacenza_g).toBe(20000 - 350)
    expect(scritte.mag.zucchero.giacenza_g).toBe(20000 - 150)
  })

  it('«scorte insufficienti» non scatta su una base appena fatta', async () => {
    // Base a zero, ma la sessione ne produce un batch e ne consuma mezzo.
    const magVuoto = { ...magazzino, 'base bianca': { nome: 'base bianca', giacenza_g: 0, soglia_g: 0 } }
    const v = await apri({ magazzino: magVuoto })
    scriviStampi(v, 'BASE BIANCA', 1)
    scriviStampi(v, 'GUSTO FIORDILATTE', 1)
    await waitFor(() => expect(v.container.textContent).toContain('Riepilogo sessione'))
    expect(v.container.textContent).not.toContain('Scorte insufficienti')
  })

  it('ma scatta se la base non basta davvero', async () => {
    const magVuoto = { ...magazzino, 'base bianca': { nome: 'base bianca', giacenza_g: 0, soglia_g: 0 } }
    const v = await apri({ magazzino: magVuoto })
    scriviStampi(v, 'GUSTO FIORDILATTE', 2)
    await waitFor(() => expect(v.container.textContent).toContain('Riepilogo sessione'))
    expect(v.container.textContent).toContain('Scorte insufficienti')
  })
})
