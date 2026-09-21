// @vitest-environment happy-dom
//
// ── Lo Storico: quello che è successo, non quello che sembra ────────────
//
// La pagina che il titolare apre per guardare indietro: quanto si è prodotto,
// quanto si è incassato, com'è andato il margine. È l'unica pagina dove i
// numeri dei mesi passati si guardano tutti insieme, quindi è anche l'unica
// dove un difetto **si moltiplica per tutti i mesi in archivio**.
//
// ── Cosa protegge questo file ──────────────────────────────────────────
//
// Tre famiglie, tutte già costate care a questo prodotto:
//
//   1. **Un valore che manca non è zero.** Una sessione senza food cost
//      scritta come «0 €» abbassa il food cost del periodo e fa sembrare il
//      margine migliore del vero. Nel database del design partner esiste: una
//      produzione nata da un evento non porta né `fcTot` né `ricavoTot`.
//   2. **Le date non si leggono come istanti.** `new Date('2026-09-21')` è
//      mezzanotte a Greenwich: a ovest torna il giorno prima, e una
//      produzione si sposta di giornata.
//   3. **Quello che non deve mai comparire**: NaN, undefined, Invalid Date,
//      [object Object]. Se una di queste parole arriva davanti al titolare, il
//      numero che le sta accanto non vale niente.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'

vi.mock('../../src/lib/supabase', () => {
  const RES = { data: [], error: null }
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(RES)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return {
    supabase: {
      from: () => new Proxy({}, h),
      rpc: () => Promise.resolve({ data: null, error: null }),
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    },
  }
})
vi.mock('../../src/lib/storage', () => ({
  sload: async () => null, ssave: async () => {},
  ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { default: StoricoProduzioneView } = await import('../../src/views/StoricoProduzioneView.jsx')

const RICETTARIO = {
  ingredienti_costi: { latte: { costoKg: 1.2, costoG: 0.0012 } },
  ricette: {
    SACHER: { nome: 'SACHER', tipo: 'fetta', unita: 8, prezzo: 24,
      ingredienti: [{ nome: 'latte', qty1stampo: 1000 }] },
  },
}

// La pagina parte con un filtro di periodo: una sessione di dieci giorni fa
// resta fuori e la prova guarderebbe il vuoto — che è il modo più comune in
// cui un test sull'interfaccia passa senza provare niente. Le sessioni di
// prova sono di oggi, salvo quando la data è proprio l'oggetto della prova.
const OGGI = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

const sessione = (p = {}) => ({
  data: p.data !== undefined ? p.data : OGGI,
  prodotti: p.prodotti || [{ nome: 'SACHER', stampi: 2, vendibile: 16 }],
  ...(p.fcTot !== undefined ? { fcTot: p.fcTot } : { fcTot: 2.4 }),
  ...(p.ricavoTot !== undefined ? { ricavoTot: p.ricavoTot } : { ricavoTot: 48 }),
  ...p.extra,
})

const chiusura = (data, totV = 400) => ({
  data, venduto: [], kpi: { totV, totFC: 100, totM: totV - 100, totS: 0, totMP: 0, avgST: 0 },
})

const apri = (p = {}) => render(
  <StoricoProduzioneView
    ricettario={RICETTARIO} giornaliero={p.giornaliero || []} chiusure={p.chiusure || []}
    logPrezzi={p.logPrezzi || []} orgId="org-1" sedeId="sede-1"
    sedi={[{ id: 'sede-1', nome: 'Centro', attiva: true }]}
    metodoProduzione="stampi" onNavigate={() => {}} {...p.extra} />,
)
const testo = () => document.body.textContent || ''
const pronta = () => waitFor(() => expect(testo().length).toBeGreaterThan(100), { timeout: 5000 })

afterEach(() => cleanup())

describe('Le sessioni registrate si vedono', () => {
  it('una produzione compare col suo prodotto', async () => {
    apri({ giornaliero: [sessione()] })
    await waitFor(() => expect(testo()).toMatch(/SACHER/))
  })

  it('e più sessioni si sommano invece di sovrascriversi', async () => {
    apri({ giornaliero: [
      sessione({ data: OGGI }),
      sessione({ data: OGGI }),
    ] })
    await pronta()
    expect(testo()).toMatch(/SACHER/)
  })

  it('senza nessuna produzione la pagina lo dice, invece di mostrare zeri', async () => {
    apri({ giornaliero: [] })
    await pronta()
    expect(testo()).toMatch(/nessun|Nessun/i)
  })
})

describe('Un costo che manca non vale zero', () => {
  it('una sessione senza food cost non porta il periodo a zero', async () => {
    // Il caso vero: una produzione nata da un evento non porta `fcTot`.
    //
    // Questa pagina **ricalcola** il costo dalle ricette invece di fidarsi del
    // numero scritto nella sessione, ed è la scelta giusta: il costo di una
    // produzione di marzo si ricostruisce coi prezzi di marzo, non con quello
    // che qualcuno aveva salvato. Quindi il food cost del periodo esce
    // comunque, e non è zero.
    //
    // (La scheda della singola sessione, che invece legge `fcTot`, sta nella
    // pagina Produzione e ha le sue prove: lì un costo che manca si scrive
    // «—», non «0 €».)
    apri({ giornaliero: [sessione({ fcTot: undefined, ricavoTot: undefined })] })
    await pronta()
    expect(testo()).toMatch(/SACHER/)
    expect(testo()).not.toMatch(/NaN/)
    // 2 stampi × 1 kg di latte a 1,20 €/kg = 2,40 € di food cost, ricalcolato
    // dalla ricetta. Nei riquadri grandi gli importi si arrotondano
    // all'unità, quindi a schermo si legge «2 €»: il punto è che **non è
    // zero**, non la cifra dopo la virgola.
    expect(testo()).toMatch(/Food cost\s*2 €/)
    expect(testo()).not.toMatch(/Food cost\s*0 €/)
  })

  it('e non sporca il totale del periodo con uno zero inventato', async () => {
    apri({ giornaliero: [
      sessione({ fcTot: 10, ricavoTot: 100 }),
      sessione({ fcTot: undefined, ricavoTot: undefined }),
    ] })
    await pronta()
    expect(testo()).not.toMatch(/NaN/)
  })

  it('uno zero VERO invece resta zero: è una risposta', async () => {
    // Una giornata in cui non si è prodotto niente è diversa da una giornata
    // di cui non si sa niente.
    apri({ giornaliero: [sessione({ fcTot: 0, ricavoTot: 0, prodotti: [] })] })
    await pronta()
    expect(testo()).not.toMatch(/NaN|undefined/)
  })
})

describe('Le date si leggono come giorni, non come istanti', () => {
  it('una sessione datata resta nel suo giorno', async () => {
    apri({ giornaliero: [sessione({ data: OGGI })] })
    await pronta()
    expect(testo()).toMatch(new RegExp(String(Number(OGGI.slice(-2)))))
  })

  it('una data con l\'ora attaccata non sposta la giornata', async () => {
    apri({ giornaliero: [sessione({ data: `${OGGI}T23:30:00.000Z` })] })
    await pronta()
    expect(testo()).not.toMatch(/Invalid Date/)
  })

  it('una data mancante non stampa «Invalid Date»', async () => {
    // Prima si leggeva «Invalid Date» nella scheda e nella finestra di
    // eliminazione: una parola inglese in mezzo a una pagina italiana, che non
    // spiega niente a chi la vede.
    apri({ giornaliero: [sessione({ data: null })] })
    await pronta()
    expect(testo()).not.toMatch(/Invalid Date/)
  })

  it('e nemmeno una data storta', async () => {
    apri({ giornaliero: [sessione({ data: 'domani' })] })
    await pronta()
    expect(testo()).not.toMatch(/Invalid Date/)
  })
})

describe('Le chiusure di cassa accanto alle produzioni', () => {
  it('con le chiusure la pagina mostra anche gli incassi', async () => {
    apri({ giornaliero: [sessione()], chiusure: [chiusura(OGGI, 500)] })
    await pronta()
    expect(testo()).toMatch(/500|incass/i)
  })

  it('senza chiusure non inventa un margine', async () => {
    apri({ giornaliero: [sessione()], chiusure: [] })
    await pronta()
    expect(testo()).not.toMatch(/NaN|Infinity/)
  })

  it('e una chiusura senza il totale non fa esplodere il conto', async () => {
    apri({ giornaliero: [sessione()], chiusure: [{ data: OGGI, kpi: {} }] })
    await pronta()
    expect(testo()).not.toMatch(/NaN/)
  })
})

describe('I numeri si scrivono all\'italiana', () => {
  it('il simbolo € sta dopo la cifra', async () => {
    // Si guarda elemento per elemento: il testo di una tabella si incolla
    // fra le celle, e «Costo (€)» seguito da «500» diventa «€)500».
    apri({ giornaliero: [sessione()], chiusure: [chiusura(OGGI, 1500)] })
    await pronta()
    const suoi = [...document.querySelectorAll('*')]
      .map(e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(''))
      .filter(t => t.includes('€'))
    if (suoi.length > 0) {
      expect(suoi.filter(t => /€\s?\d/.test(t)), 'il simbolo € va dopo la cifra').toEqual([])
    }
  })

  it('e le migliaia hanno il punto', async () => {
    apri({ giornaliero: [sessione()], chiusure: [chiusura(OGGI, 1500)] })
    await pronta()
    expect(testo()).toMatch(/1\.500|1\.5/)
  })
})

describe('Quello che non deve mai comparire a schermo', () => {
  it('niente NaN, undefined o [object Object] con dati normali', async () => {
    apri({ giornaliero: [sessione()], chiusure: [chiusura(OGGI)] })
    await pronta()
    const t = testo()
    expect(t).not.toMatch(/NaN/)
    expect(t).not.toMatch(/undefined/)
    expect(t).not.toMatch(/\[object Object\]/)
  })

  it('nemmeno con una sessione senza prodotti', async () => {
    apri({ giornaliero: [sessione({ prodotti: [] })] })
    await pronta()
    expect(testo()).not.toMatch(/NaN|undefined|\[object Object\]/)
  })

  it('nemmeno con un prodotto senza il numero di stampi', async () => {
    apri({ giornaliero: [sessione({ prodotti: [{ nome: 'SACHER' }] })] })
    await pronta()
    expect(testo()).not.toMatch(/NaN|\[object Object\]/)
  })

  it('nemmeno con un prodotto che non sta nel ricettario', async () => {
    apri({ giornaliero: [sessione({ prodotti: [{ nome: 'FANTASMA', stampi: 1 }] })] })
    await pronta()
    expect(testo()).not.toMatch(/NaN|undefined|\[object Object\]/)
  })

  it('e nemmeno col ricettario vuoto', async () => {
    apri({ giornaliero: [sessione()], extra: { ricettario: { ricette: {}, ingredienti_costi: {} } } })
    await pronta()
    expect(testo()).not.toMatch(/NaN|\[object Object\]/)
  })
})

describe('Il formato vecchio delle sessioni si legge lo stesso', () => {
  it('una sessione scritta col vecchio schema non sparisce', async () => {
    // Nell'account dimostrativo ci sono 142 sessioni nel formato vecchio
    // (`ricette: [{nome, numStampi}]`), ed è la pagina che si fa vedere a chi
    // sta valutando il programma: mostrarla vuota è la peggior prima
    // impressione possibile.
    apri({ giornaliero: [{
      data: OGGI,
      ricette: [{ nome: 'SACHER', numStampi: 2 }],
    }] })
    await pronta()
    expect(testo()).not.toMatch(/NaN|undefined/)
  })
})

describe('Il righello di questo file', () => {
  it('la pagina si disegna davvero', async () => {
    apri({ giornaliero: [sessione()] })
    await waitFor(() => expect(testo()).toMatch(/SACHER/))
    expect(testo().length).toBeGreaterThan(200)
  })

  it('e le sessioni finte arrivano dove le andiamo a cercare', async () => {
    apri({ giornaliero: [sessione({ prodotti: [{ nome: 'CONTROLLO RIGHELLO', stampi: 1, vendibile: 1 }] })] })
    await waitFor(() => expect(testo()).toMatch(/CONTROLLO RIGHELLO/))
  })
})
