// @vitest-environment happy-dom
//
// ── Il magazzino deve perdere quello che è uscito davvero ──────────────────
//
// Due difetti dello stesso pezzo di pagina, trovati il 20/09/2026.
//
// 1. LA RESA NON ENTRAVA NELLO SCARICO. Il food cost divide il costo al
//    grammo per la resa (`costoNettoPerG` in `src/lib/rese.js`): con le uova
//    all'85%, cento grammi di ricetta costano come centodiciotto grammi
//    comprati, ed è giusto — quello che si butta si paga. Lo scarico del
//    magazzino toglieva invece cento grammi tondi. Due conti sullo stesso
//    ingrediente, uno che tiene conto dello scarto e uno no: la giacenza
//    resta più alta del vero e la differenza salta fuori all'inventario, un
//    mese dopo, senza poter risalire alla causa.
//
//    Quanto pesa oggi, misurato: **zero**. La chiave `pasticceria-rese-v1` non
//    esiste in nessuna riga di `user_data`, in tutto il database — tutte le
//    rese valgono 1,0. È un difetto che scatta il giorno in cui qualcuno apre
//    le impostazioni e scrive «uova 85%», e da quel giorno ogni produzione
//    sbaglia. Si corregge adesso perché costa una riga adesso.
//
// 2. «NON BASTA» SU UN INGREDIENTE PIENO, terza ricomparsa. Il riquadro
//    «Ingredienti da scalare» leggeva `magazzino[k]`, cioè la chiave canonica
//    («uovo»), mentre il magazzino conserva la chiave scritta dall'utente
//    («uova»). Su quelle voci la giacenza risultava zero e la pagina scriveva
//    «non basta» in rosso su un ingrediente pieno, ogni singola mattina. Lo
//    scarico era stato corretto il 9 settembre, l'allarme «Scorte
//    insufficienti» il 14, questo riquadro era rimasto indietro: su dati veri
//    sono 5 voci su 35.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const scritte = { mag: null, gior: null }
const avvisi = []

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {},
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
const { setResaIngrediente, resetRese, getResaIngrediente } = await import('../../src/lib/rese.js')
const { normIng } = await import('../../src/lib/foodcost.js')

const ricettario = {
  ricette: {
    'TORTA UOVA': {
      nome: 'TORTA UOVA', tipo: 'fetta', unita: 8, prezzo: 4,
      ingredienti: [{ nome: 'uova', qty1stampo: 200 }, { nome: 'farina 00', qty1stampo: 500 }],
    },
  },
  ingredienti_costi: {
    uovo: { costoKg: 4.2, costoG: 0.0042 }, 'farina 00': { costoKg: 0.95, costoG: 0.00095 },
  },
}
// Il magazzino vero: le uova sono salvate al PLURALE, come le ha scritte chi
// ha fatto l'inventario.
const magazzino = {
  uova: { nome: 'uova', giacenza_g: 4800, soglia_g: 1000 },
  'farina 00': { nome: 'farina 00', giacenza_g: 28000, soglia_g: 5000 },
}

const props = {
  ricettario, magazzino, setMagazzino: () => {}, giornaliero: [], setGiornaliero: () => {},
  notify: (m) => avvisi.push(String(m)), sedi: [{ id: 's1', nome: 'Torino', attiva: true }],
  sedeAttiva: { id: 's1', nome: 'Torino' }, orgId: 'org-1', sedeId: 's1',
}

beforeEach(() => { scritte.mag = null; scritte.gior = null; avvisi.length = 0; resetRese(); cleanup() })
afterEach(() => { resetRese() })

async function apri(extra = {}) {
  const v = render(<Produzione {...props} {...extra} />)
  await waitFor(() => expect(v.container.textContent).toContain('TORTA UOVA'))
  return v
}
function scriviStampi(v, nome, valore) {
  const riga = [...v.container.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes(nome))
  fireEvent.change(riga.querySelector('input[type="number"]'), { target: { value: String(valore) } })
}
async function conferma(v) {
  fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Conferma produzione/i.test(b.textContent)))
  const si = await waitFor(() => {
    const b = [...v.container.querySelectorAll('button')].find(x => /Sì, conferma/i.test(x.textContent))
    expect(b).toBeTruthy(); return b
  })
  fireEvent.click(si)
  await waitFor(() => expect(scritte.mag).toBeTruthy(), { timeout: 3000 })
}

describe('il righello: le rese partono tutte da 100%', () => {
  it('senza niente impostato, la resa di un ingrediente è 1,0', () => {
    // È lo stato del database al 20/09/2026: nessuna riga `pasticceria-rese-v1`.
    expect(getResaIngrediente('uovo')).toBe(1)
  })

  it('e «uova» si normalizza in «uovo»: è il presupposto di tutto il resto', () => {
    expect(normIng('uova')).toBe('uovo')
  })
})

describe('scarico — la resa fa uscire il lordo, non il netto', () => {
  it('senza resa impostata il magazzino perde esattamente la dose', async () => {
    const v = await apri()
    scriviStampi(v, 'TORTA UOVA', 2)
    await conferma(v)
    expect(scritte.mag.uova.giacenza_g).toBe(4800 - 400)
    expect(scritte.mag['farina 00'].giacenza_g).toBe(28000 - 1000)
  })

  it('con le uova all\'85% ne esce il peso comprato, non quello impastato', async () => {
    setResaIngrediente('uovo', 0.85)
    const v = await apri()
    scriviStampi(v, 'TORTA UOVA', 2)
    await conferma(v)
    // 400 g di ricetta ÷ 0,85 = 470,6 g comprati. Prima ne usciva 400.
    expect(scritte.mag.uova.giacenza_g).toBeCloseTo(4800 - 400 / 0.85, 3)
  })

  it('la resa di un ingrediente non tocca gli altri', async () => {
    setResaIngrediente('uovo', 0.85)
    const v = await apri()
    scriviStampi(v, 'TORTA UOVA', 2)
    await conferma(v)
    expect(scritte.mag['farina 00'].giacenza_g).toBe(28000 - 1000)
  })

  it('la resa entra anche in quello che la sessione si annota', async () => {
    setResaIngrediente('uovo', 0.5)
    const v = await apri()
    scriviStampi(v, 'TORTA UOVA', 1)
    await conferma(v)
    // 200 g ÷ 0,5 = 400 g. Se l'annotazione non seguisse lo scarico,
    // eliminare la sessione restituirebbe la quantità sbagliata.
    expect(scritte.gior[0].scalatoPerChiave.uova).toBe(400)
    expect(scritte.gior[0].ingredientiUsati.uovo).toBe(400)
  })

  it('una resa al 100% non cambia niente: nessuna deriva sui numeri tondi', async () => {
    setResaIngrediente('uovo', 1)
    const v = await apri()
    scriviStampi(v, 'TORTA UOVA', 3)
    await conferma(v)
    expect(scritte.mag.uova.giacenza_g).toBe(4800 - 600)
  })

  it('con la resa, il riquadro degli ingredienti mostra il peso vero da scalare', async () => {
    setResaIngrediente('uovo', 0.5)
    const v = await apri()
    scriviStampi(v, 'TORTA UOVA', 1)
    await waitFor(() => expect(v.container.textContent).toContain('Ingredienti da scalare'))
    // 400 g, non 200.
    expect(v.container.textContent).toContain('400 g')
  })
})

describe('riquadro «Ingredienti da scalare» — legge dove il magazzino scrive', () => {
  it('non dice «non basta» su un ingrediente salvato al plurale', async () => {
    const v = await apri()
    scriviStampi(v, 'TORTA UOVA', 2)
    await waitFor(() => expect(v.container.textContent).toContain('Ingredienti da scalare'))
    // Prima: giacenza letta da `magazzino['uovo']` → zero → «non basta» in
    // rosso su 4,8 kg di uova che ci sono.
    expect(v.container.textContent).not.toContain('non basta')
  })

  it('e dice quanto ne resta, col numero giusto', async () => {
    const v = await apri()
    scriviStampi(v, 'TORTA UOVA', 2)
    await waitFor(() => expect(v.container.textContent).toContain('Ingredienti da scalare'))
    // 4.800 − 400 = 4.400 g → «4,40 kg» all'italiana.
    expect(v.container.textContent).toContain('resta 4,40 kg')
  })

  it('«non basta» compare quando davvero non basta', async () => {
    const quasiVuoto = { ...magazzino, uova: { nome: 'uova', giacenza_g: 100, soglia_g: 0 } }
    const v = await apri({ magazzino: quasiVuoto })
    scriviStampi(v, 'TORTA UOVA', 2)
    await waitFor(() => expect(v.container.textContent).toContain('Ingredienti da scalare'))
    expect(v.container.textContent).toContain('non basta')
  })

  it('e l\'allarme grande resta d\'accordo col riquadro', async () => {
    const quasiVuoto = { ...magazzino, uova: { nome: 'uova', giacenza_g: 100, soglia_g: 0 } }
    const v = await apri({ magazzino: quasiVuoto })
    scriviStampi(v, 'TORTA UOVA', 2)
    await waitFor(() => expect(v.container.textContent).toContain('Ingredienti da scalare'))
    expect(v.container.textContent).toContain('Scorte insufficienti')
  })

  it('i due non si contraddicono mai: se uno tace, tace anche l\'altro', async () => {
    const v = await apri()
    scriviStampi(v, 'TORTA UOVA', 2)
    await waitFor(() => expect(v.container.textContent).toContain('Ingredienti da scalare'))
    expect(v.container.textContent).not.toContain('Scorte insufficienti')
    expect(v.container.textContent).not.toContain('non basta')
  })

  it('le quantità si leggono all\'italiana, coi chili e la virgola', async () => {
    const v = await apri()
    scriviStampi(v, 'TORTA UOVA', 2)
    await waitFor(() => expect(v.container.textContent).toContain('Ingredienti da scalare'))
    // 1.000 g di farina → «1,00 kg», mai «1.00kg».
    expect(v.container.textContent).toContain('1,00 kg')
    expect(v.container.textContent).not.toContain('1.00 kg')
  })
})

describe('scarico — quello che intorno non deve rompersi', () => {
  it('un ingrediente che in magazzino non c\'è viene detto, non nascosto', async () => {
    const senzaUova = { 'farina 00': { nome: 'farina 00', giacenza_g: 28000, soglia_g: 0 } }
    const v = await apri({ magazzino: senzaUova })
    scriviStampi(v, 'TORTA UOVA', 1)
    await conferma(v)
    expect(avvisi.some(a => /non era|non erano/.test(a) && /uovo/.test(a))).toBe(true)
  })

  it('e non gli si inventa una voce in magazzino', async () => {
    const senzaUova = { 'farina 00': { nome: 'farina 00', giacenza_g: 28000, soglia_g: 0 } }
    const v = await apri({ magazzino: senzaUova })
    scriviStampi(v, 'TORTA UOVA', 1)
    await conferma(v)
    expect(scritte.mag.uovo).toBeUndefined()
    expect(scritte.mag.uova).toBeUndefined()
  })

  it('se la giacenza non basta va sotto zero, e non si ferma a zero in silenzio', async () => {
    const quasiVuoto = { ...magazzino, uova: { nome: 'uova', giacenza_g: 100, soglia_g: 0 } }
    const v = await apri({ magazzino: quasiVuoto })
    scriviStampi(v, 'TORTA UOVA', 2)
    await conferma(v)
    // 100 − 400 = −300: la merce è uscita comunque, e il rosso dice di
    // rifare l'inventario.
    expect(scritte.mag.uova.giacenza_g).toBe(-300)
  })

  it('e la sessione registra tutto quello che è stato preso, non solo il disponibile', async () => {
    const quasiVuoto = { ...magazzino, uova: { nome: 'uova', giacenza_g: 100, soglia_g: 0 } }
    const v = await apri({ magazzino: quasiVuoto })
    scriviStampi(v, 'TORTA UOVA', 2)
    await conferma(v)
    expect(scritte.gior[0].scalatoPerChiave.uova).toBe(400)
  })

  it('salvare fallisce e il magazzino non si muove: prima si scrive, poi si cambia', async () => {
    const storage = await import('../../src/lib/storage')
    let statoToccato = false
    const v = await apri({ setMagazzino: () => { statoToccato = true } })
    vi.spyOn(storage, 'ssaveBatch').mockImplementation(async () => { throw new Error('rete assente') })
    scriviStampi(v, 'TORTA UOVA', 2)
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Conferma produzione/i.test(b.textContent)))
    const si = await waitFor(() => {
      const b = [...v.container.querySelectorAll('button')].find(x => /Sì, conferma/i.test(x.textContent))
      expect(b).toBeTruthy(); return b
    })
    fireEvent.click(si)
    await waitFor(() => expect(avvisi.some(a => /Salvataggio fallito/.test(a))).toBe(true), { timeout: 3000 })
    expect(statoToccato).toBe(false)
    vi.restoreAllMocks()
  })
})
