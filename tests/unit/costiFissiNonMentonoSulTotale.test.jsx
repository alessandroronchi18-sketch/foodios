// @vitest-environment happy-dom
/**
 * Costi fissi (CostiAziendaliView): il totale non deve mentire.
 * ===========================================================================
 *
 * ── Il difetto vero, 21/09/2026 ────────────────────────────────────────────
 *
 * La pagina dei costi fissi è quella dove si scrivono affitto, stipendi,
 * utenze, leasing. Non è una pagina di consultazione: il totale mensile che
 * calcola entra nel P&L e nel punto di pareggio, cioè nella risposta alla
 * domanda «quanto devo vendere per non perderci».
 *
 * L'importo di una voce veniva formattato così:
 *
 *     const fmt2 = v => `${Number(v || 0).toLocaleString('it-IT', …)} €`
 *
 * Su un importo arrivato come **testo** — «1.234,56», che è esattamente il
 * modo in cui un importo esce da un foglio Excel italiano o da un campo
 * riempito a mano — `Number('1.234,56')` risponde `NaN`, e
 * `NaN.toLocaleString('it-IT')` risponde la **parola** «NaN». In elenco si
 * leggeva «NaN €».
 *
 * Quella però era la metà che si vedeva. L'altra metà: `importoMensile()`
 * sullo stesso dato fa `Number(voce.importo) || 0` e risponde **0**. Quindi la
 * voce spariva dal totale mensile, dal totale annuo e dal conto economico
 * senza dire niente. Un affitto da 1.234,56 € al mese scritto storto faceva
 * risultare i costi fissi più bassi di 1.234,56 € e il punto di pareggio più
 * vicino di quanto fosse — e il numero grande in cima alla pagina sembrava
 * completo.
 *
 * Un dato che manca non è zero: zero è un'informazione («costa zero»),
 * mancante è un'altra («non lo sappiamo»). Da qui la lineetta al posto della
 * cifra e il riquadro che dichiara quante voci non entrano nel conto.
 *
 * ── Gli altri difetti trovati lo stesso giorno, e che questi test tengono ──
 *
 *  - i KPI contavano `voci` (tutte le voci dell'azienda) mentre i totali
 *    venivano dall'ambito scelto: in «Sede: Carlina» si leggeva il totale
 *    della sede con accanto «5 voci attive» dell'azienda intera;
 *  - il pulsante Salva non si disabilitava durante il salvataggio: due tocchi
 *    di fila inserivano la voce due volte, e in P&L l'affitto pesava il doppio;
 *  - `'Errore: ' + e.message` su un errore senza `message` scriveva a schermo
 *    la parola «undefined»;
 *  - una data impossibile lasciava la frase mozza «finito a »;
 *  - la finestra della voce non si chiudeva con Esc.
 *
 * I test montano la pagina vera e guardano quello che si legge a schermo, non
 * quale funzione è stata chiamata.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, within, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const mockState = { voci: [] }
const salvaMock = vi.fn(() => Promise.resolve({ id: 'nuova' }))
const eliminaMock = vi.fn(() => Promise.resolve())
const caricaMock = vi.fn(() => Promise.resolve(mockState.voci))

vi.mock('../../src/lib/costiAziendali', async () => {
  const real = await vi.importActual('../../src/lib/costiAziendali')
  return {
    ...real,
    caricaCostiAziendali: (...a) => caricaMock(...a),
    salvaVoceCosto: (...a) => salvaMock(...a),
    eliminaVoceCosto: (...a) => eliminaMock(...a),
  }
})

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }),
    }),
  },
}))

const mod = await import('../../src/views/CostiAziendaliView.jsx')
const CostiAziendaliView = mod.default
const { leggiImporto, messaggioErrore } = mod

const SORGENTE = readFileSync(join(RADICE, 'src/views/CostiAziendaliView.jsx'), 'utf8')

// Il listino di costi fissi di una pasticceria vera: affitto, utenze,
// assicurazione annuale. 1.500 + 500 + (1.200/12) = 2.100 €/mese.
const VOCI_VERE = [
  { id: 'a', voce: 'Affitto laboratorio', importo: 1500, periodicita: 'mensile', categoria: 'affitti', sede_id: null, attivo: true },
  { id: 'b', voce: 'Energia elettrica', importo: 500, periodicita: 'mensile', categoria: 'utenze', sede_id: null, attivo: true },
  { id: 'c', voce: 'RC e infortuni', importo: 1200, periodicita: 'annuale', categoria: 'assicurazioni', sede_id: null, attivo: true },
]

const baseProps = { orgId: 'org-test', sedeId: null, sedi: [], notify: () => {} }

/** Monta la pagina e aspetta che abbia finito di caricare. */
async function monta(extra = {}) {
  const utils = render(<CostiAziendaliView {...baseProps} {...extra} />)
  await waitFor(() => expect(utils.container.textContent).not.toContain('Caricamento'))
  return utils
}

const testo = () => document.body.textContent || ''

/** Ogni pezzo di testo per conto suo.
 *
 *  Serve perché `textContent` incolla i fratelli senza spazio: «2.100 €» e
 *  «3 voci attive» diventano «2.100 €3 voci attive», e una regola come «il €
 *  non sta mai prima di una cifra» risulterebbe violata da un difetto che non
 *  c'è. */
function testiSingoli(radice) {
  const fuori = []
  const giro = (n) => {
    if (n.nodeType === 3) { const t = (n.nodeValue || '').trim(); if (t) fuori.push(t); return }
    for (const c of n.childNodes) giro(c)
  }
  giro(radice)
  return fuori
}

beforeEach(() => {
  mockState.voci = []
  caricaMock.mockClear()
  salvaMock.mockClear().mockImplementation(() => Promise.resolve({ id: 'nuova' }))
  eliminaMock.mockClear()
})
afterEach(() => cleanup())

// ───────────────────────────────────────────────────────────────────────────
describe('Costi fissi · i totali che finiscono nel P&L', () => {
  it('somma le voci mensili nel totale del mese', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    expect(testo()).toContain('2.100 €')
  })

  it('una voce annuale entra nel mese divisa per dodici', async () => {
    mockState.voci = [VOCI_VERE[2]]
    await monta()
    // 1.200 all'anno = 100 al mese: il totale mensile deve dire 100, non 1.200.
    expect(testo()).toContain('100 €')
    expect(within(screen.getByText('Costo mensile totale').parentElement).queryByText('1.200 €')).toBeNull()
  })

  it('il totale annuo è il mensile per dodici', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    expect(testo()).toContain('25.200 €')
  })

  it('dice quanto costa ogni giorno, che è il numero del punto di pareggio', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    // 25.200 / 365 = 69,04 → 69 € al giorno.
    expect(testo()).toContain('69 € al giorno')
  })

  it('il costo al giorno non compare quando non c’è nessuna voce', async () => {
    await monta()
    expect(testo()).not.toContain('al giorno')
  })

  it('con una sola voce scrive «1 voce attiva», al singolare', async () => {
    mockState.voci = [VOCI_VERE[0]]
    await monta()
    expect(testo()).toContain('1 voce attiva')
  })

  it('con più voci scrive «N voci attive», al plurale', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    expect(testo()).toContain('3 voci attive')
  })

  it('ogni categoria porta il proprio totale mensile accanto al nome', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    expect(testo()).toContain('1.500 €/mese')
    expect(testo()).toContain('500 €/mese')
  })

  it('con più categorie chiude con la riga «Totale costi aziendali»', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    expect(testo()).toContain('Totale costi aziendali')
  })

  it('la categoria principale è quella che pesa di più, con la sua quota', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    expect(testo()).toContain('Affitti')
    expect(testo()).toContain('71%')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Costi fissi · un dato che manca non è zero', () => {
  const senzaImporto = { id: 'x', voce: 'Affitto nuovo locale', importo: null, periodicita: 'mensile', categoria: 'affitti', sede_id: null, attivo: true }
  const importoTesto = { id: 'y', voce: 'Leasing vetrina', importo: '1.234,56', periodicita: 'mensile', categoria: 'ammortamenti', sede_id: null, attivo: true }

  it('un importo mancante si legge come lineetta, non come «0,00 €»', async () => {
    mockState.voci = [senzaImporto]
    await monta()
    expect(testo()).toContain('—')
    expect(testo()).not.toContain('0,00 €')
  })

  it('un importo scritto all’italiana come testo non diventa «NaN €»', async () => {
    mockState.voci = [importoTesto]
    await monta()
    expect(testo()).not.toContain('NaN')
  })

  it('un importo vuoto non diventa zero', async () => {
    mockState.voci = [{ ...senzaImporto, importo: '' }]
    await monta()
    expect(testo()).not.toContain('0,00 €')
  })

  it('un importo che non è un numero («abc») non diventa zero', async () => {
    mockState.voci = [{ ...senzaImporto, importo: 'abc' }]
    await monta()
    expect(testo()).not.toContain('0,00 €')
    expect(testo()).not.toContain('NaN')
  })

  it('la riga con l’importo illeggibile lo dice: «importo da scrivere»', async () => {
    mockState.voci = [importoTesto]
    await monta()
    expect(testo()).toContain('importo da scrivere')
  })

  it('la pagina dichiara che il totale è più basso del vero', async () => {
    mockState.voci = [...VOCI_VERE, importoTesto]
    await monta()
    expect(testo()).toContain('il totale qui sopra è più basso del vero')
  })

  it('con una sola voce rotta il riquadro parla al singolare', async () => {
    mockState.voci = [...VOCI_VERE, importoTesto]
    await monta()
    expect(testo()).toContain('Una voce non ha un importo leggibile')
  })

  it('con due voci rotte il riquadro le conta', async () => {
    mockState.voci = [...VOCI_VERE, importoTesto, senzaImporto]
    await monta()
    expect(testo()).toContain('2 voci non hanno un importo leggibile')
  })

  it('senza voci rotte il riquadro non compare', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    expect(testo()).not.toContain('importo leggibile')
  })

  it('l’avviso è annunciato anche a chi non vede lo schermo (role="status")', async () => {
    mockState.voci = [importoTesto]
    await monta()
    expect(screen.getByRole('status').textContent).toContain('importo leggibile')
  })

  it('uno zero VERO resta zero: «costa zero» è un’informazione', async () => {
    mockState.voci = [{ ...senzaImporto, importo: 0 }]
    await monta()
    expect(testo()).toContain('0,00 €')
    expect(testo()).not.toContain('importo da scrivere')
  })

  it('una voce rotta non trascina giù le altre: le buone restano nel totale', async () => {
    mockState.voci = [...VOCI_VERE, importoTesto]
    await monta()
    expect(testo()).toContain('2.100 €')
  })

  it('leggiImporto: i numeri veri passano', () => {
    expect(leggiImporto(1500)).toBe(1500)
    expect(leggiImporto(0)).toBe(0)
    expect(leggiImporto('1500')).toBe(1500)
    expect(leggiImporto('1500.50')).toBe(1500.5)
  })

  it('leggiImporto: quello che non è un numero risponde null, non zero', () => {
    expect(leggiImporto(null)).toBeNull()
    expect(leggiImporto(undefined)).toBeNull()
    expect(leggiImporto('')).toBeNull()
    expect(leggiImporto('   ')).toBeNull()
    expect(leggiImporto('abc')).toBeNull()
    expect(leggiImporto('1.234,56')).toBeNull()
    expect(leggiImporto(NaN)).toBeNull()
    expect(leggiImporto(Infinity)).toBeNull()
  })

  it('leggiImporto non indovina: «1.234,56» non diventa 1,23456 né 1234,56', () => {
    // Fra le due letture c'è un ordine di grandezza sul conto economico:
    // si chiede, non si tira a indovinare.
    expect(leggiImporto('1.234,56')).not.toBe(1.23456)
    expect(leggiImporto('1.234,56')).not.toBe(1234.56)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Costi fissi · i numeri si scrivono all’italiana', () => {
  it('le migliaia hanno il punto, non la virgola', async () => {
    mockState.voci = [{ ...VOCI_VERE[0], importo: 1477 }]
    await monta()
    expect(testo()).toContain('1.477 €')
    expect(testo()).not.toContain('1,477 €')
  })

  it('il simbolo € sta DOPO la cifra, mai prima', async () => {
    mockState.voci = VOCI_VERE
    const { container } = await monta()
    for (const t of testiSingoli(container)) {
      expect(t).not.toMatch(/€\s*\d/)
    }
  })

  it('ogni importo a schermo finisce con il simbolo, non ci comincia', async () => {
    mockState.voci = VOCI_VERE
    const { container } = await monta()
    const conEuro = testiSingoli(container).filter(t => t.includes('€'))
    expect(conEuro.length).toBeGreaterThan(0)
    for (const t of conEuro) {
      // «1.500 €», «1.500 €/mese», «69 € al giorno», «Importo (€)»
      expect(t).toMatch(/(\d\s€|\(€\))/)
    }
  })

  it('non si usa il dollaro né un altro simbolo di valuta', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    expect(testo()).not.toContain('$')
    expect(testo()).not.toContain('EUR ')
  })

  it('in tabella l’importo ha due decimali separati dalla virgola', async () => {
    mockState.voci = [{ ...VOCI_VERE[0], importo: 12345.5 }]
    await monta()
    expect(testo()).toContain('12.345,50 €')
  })

  it('i riquadri grandi sono arrotondati all’unità, senza decimali', async () => {
    mockState.voci = [{ ...VOCI_VERE[0], importo: 1500.49 }]
    await monta()
    const box = screen.getByText('Costo mensile totale').parentElement
    expect(box.textContent).toContain('1.500 €')
    expect(box.textContent).not.toContain('1.500,49')
  })

  it('le percentuali usano il simbolo % e non il punto decimale inglese', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    expect(testo()).toMatch(/\d+%/)
    expect(testo()).not.toMatch(/\d+\.\d+%/)
  })

  it('l’equivalente mensile di una voce annuale è scritto con la virgola', async () => {
    mockState.voci = [VOCI_VERE[2]]
    await monta()
    expect(testo()).toContain('100,00 €/mese')
  })

  it('il costo al giorno è in euro e arrotondato all’unità', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    expect(testo()).toMatch(/\d+ € al giorno/)
    expect(testo()).not.toMatch(/\d+,\d+ € al giorno/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Costi fissi · a schermo non finiscono parole da programmatore', () => {
  // Dati storti come arrivano davvero da un import: importo come testo, date
  // impossibili, campi che mancano.
  const STORTI = [
    { id: '1', voce: 'Leasing vetrina', importo: '1.234,56', periodicita: 'mensile', categoria: 'ammortamenti', attivo: true },
    { id: '2', voce: 'Manutenzione frigo', importo: 300, periodicita: 'una_tantum', categoria: 'chi-lo-sa', data_inizio: '2026-13-45', attivo: true },
    { id: '3', voce: 'Software gestionale', importo: 90, periodicita: 'trimestrale', categoria: 'servizi', data_fine: 'non-una-data', attivo: true },
    { id: '4', importo: null, periodicita: null, categoria: null, attivo: true },
  ]

  it('nessun «NaN» con dati storti', async () => {
    mockState.voci = STORTI
    await monta()
    expect(testo()).not.toContain('NaN')
  })

  it('nessun «undefined» con dati storti', async () => {
    mockState.voci = STORTI
    await monta()
    expect(testo()).not.toContain('undefined')
  })

  it('nessun «[object Object]» con dati storti', async () => {
    mockState.voci = STORTI
    await monta()
    expect(testo()).not.toContain('[object Object]')
  })

  it('nessun «Invalid Date» con date impossibili', async () => {
    mockState.voci = STORTI
    await monta()
    expect(testo()).not.toContain('Invalid Date')
  })

  it('nessun «null» scritto a lettere', async () => {
    mockState.voci = STORTI
    await monta()
    expect(testo()).not.toContain('null')
  })

  it('una data di fine impossibile non lascia la frase mozza «finito a »', async () => {
    mockState.voci = [{
      id: 'z', voce: 'Noleggio insegna', importo: 240, periodicita: 'annuale',
      categoria: 'altro', data_fine: '1999-99-99', attivo: true,
    }]
    await monta()
    expect(testo()).not.toMatch(/finito a\s*$/m)
    expect(testo()).not.toContain('finito a  ')
  })

  it('una data di inizio impossibile diventa «non ancora iniziato»', async () => {
    mockState.voci = [{
      id: 'z', voce: 'Nuovo contratto', importo: 240, periodicita: 'annuale',
      categoria: 'altro', data_inizio: '3000-99-99', attivo: true,
    }]
    await monta()
    expect(testo()).not.toMatch(/parte da\s*$/m)
  })

  it('la lista vuota non produce NaN nei riquadri', async () => {
    mockState.voci = []
    await monta()
    expect(testo()).not.toContain('NaN')
  })

  it('una categoria sconosciuta si scrive com’è, senza rompere la pagina', async () => {
    mockState.voci = [{ id: 'k', voce: 'Voce strana', importo: 10, periodicita: 'mensile', categoria: 'categoria-inventata', attivo: true }]
    await monta()
    expect(testo()).toContain('categoria-inventata')
    expect(testo()).not.toContain('undefined')
  })

  it('una periodicità sconosciuta non scrive undefined nella pastiglia', async () => {
    mockState.voci = [{ id: 'k', voce: 'Voce strana', importo: 10, periodicita: 'ogni-luna-piena', categoria: 'altro', attivo: true }]
    await monta()
    expect(testo()).toContain('ogni-luna-piena')
  })

  it('una voce senza descrizione non stampa «undefined» al suo posto', async () => {
    mockState.voci = [{ id: 'k', importo: 10, periodicita: 'mensile', categoria: 'altro', attivo: true }]
    await monta()
    expect(testo()).not.toContain('undefined')
  })

  it('se la lettura torna qualcosa che non è un elenco, la pagina resta in piedi', async () => {
    // `voci.length` su `null` sbiancava la vista intera: chi la usava non
    // vedeva nemmeno un messaggio, solo una pagina bianca.
    mockState.voci = null
    const { container } = await monta()
    expect(container.textContent).toContain('Nessuna voce di costo')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Costi fissi · la pagina vuota spiega a cosa serve', () => {
  it('senza voci spiega, invece di mostrare una tabella vuota', async () => {
    await monta()
    expect(testo()).toContain('Nessuna voce di costo')
    expect(testo()).toContain('P&L')
  })

  it('senza voci offre il primo passo da fare', async () => {
    await monta()
    expect(screen.getByText('Aggiungi la prima voce')).toBeTruthy()
  })

  it('i riquadri dicono «-» e non «0 €»: zero costi fissi non esiste', async () => {
    await monta()
    const box = screen.getByText('Costo mensile totale').parentElement
    expect(box.textContent).not.toContain('0 €')
    expect(box.textContent).toContain('-')
  })

  it('il riquadro spiega perché non c’è un numero', async () => {
    await monta()
    expect(testo()).toContain('Non lo sappiamo ancora')
  })

  it('anche il riquadro annuo spiega invece di scrivere zero', async () => {
    await monta()
    const box = screen.getByText('Costo annuo stimato').parentElement
    expect(box.textContent).not.toContain('0 €')
    expect(box.textContent).toContain('Si calcola dal mensile')
  })

  it('con un filtro che non trova niente il testo cambia: «in questa categoria»', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    fireEvent.change(screen.getByLabelText('Filtra per categoria'), { target: { value: 'marketing' } })
    expect(testo()).toContain('in questa categoria')
  })

  it('con un filtro attivo si può togliere il filtro', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    fireEvent.change(screen.getByLabelText('Filtra per categoria'), { target: { value: 'marketing' } })
    expect(screen.getByLabelText('Rimuovi filtro categoria')).toBeTruthy()
  })

  it('tolto il filtro tornano tutte le voci', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    fireEvent.change(screen.getByLabelText('Filtra per categoria'), { target: { value: 'marketing' } })
    fireEvent.click(screen.getByLabelText('Rimuovi filtro categoria'))
    expect(testo()).toContain('Affitto laboratorio')
  })

  it('il filtro dice quante voci ci sono per ogni categoria', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    expect(screen.getByLabelText('Filtra per categoria').textContent).toContain('Tutte le categorie (3)')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Costi fissi · salvare non deve perdere né duplicare', () => {
  /** Apre la finestra di modifica della prima voce (modulo già compilato). */
  async function apriModifica() {
    mockState.voci = VOCI_VERE
    const utils = await monta()
    fireEvent.click(screen.getByLabelText('Modifica voce Affitto laboratorio'))
    return utils
  }

  it('la scrittura viene PRIMA del cambio di schermo: finché salva, la finestra resta', async () => {
    let sblocca
    salvaMock.mockImplementation(() => new Promise(r => { sblocca = r }))
    await apriModifica()
    fireEvent.click(screen.getByText('Salva modifiche'))
    await waitFor(() => expect(salvaMock).toHaveBeenCalled())
    // Il salvataggio non è ancora finito: la finestra NON si è chiusa.
    expect(screen.queryByRole('dialog')).toBeTruthy()
    sblocca({ id: 'a' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('salvato davvero, la finestra si chiude', async () => {
    await apriModifica()
    fireEvent.click(screen.getByText('Salva modifiche'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('salvato davvero, l’elenco si rilegge dal database', async () => {
    await apriModifica()
    const prima = caricaMock.mock.calls.length
    fireEvent.click(screen.getByText('Salva modifiche'))
    await waitFor(() => expect(caricaMock.mock.calls.length).toBeGreaterThan(prima))
  })

  it('salvato davvero, l’utente lo sa', async () => {
    const notify = vi.fn()
    mockState.voci = VOCI_VERE
    await monta({ notify })
    fireEvent.click(screen.getByLabelText('Modifica voce Affitto laboratorio'))
    fireEvent.click(screen.getByText('Salva modifiche'))
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Voce salvata'))
  })

  it('se il salvataggio fallisce la finestra NON si chiude', async () => {
    salvaMock.mockImplementation(() => Promise.reject(new Error('rete assente')))
    await apriModifica()
    fireEvent.click(screen.getByText('Salva modifiche'))
    await waitFor(() => expect(salvaMock).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).toBeTruthy()
  })

  it('se il salvataggio fallisce l’elenco a schermo non cambia', async () => {
    salvaMock.mockImplementation(() => Promise.reject(new Error('rete assente')))
    await apriModifica()
    const prima = caricaMock.mock.calls.length
    fireEvent.click(screen.getByText('Salva modifiche'))
    await waitFor(() => expect(salvaMock).toHaveBeenCalled())
    expect(caricaMock.mock.calls.length).toBe(prima)
    expect(testo()).toContain('2.100 €')
  })

  it('se il salvataggio fallisce l’utente lo sa, e sa perché', async () => {
    const notify = vi.fn()
    salvaMock.mockImplementation(() => Promise.reject(new Error('rete assente')))
    mockState.voci = VOCI_VERE
    await monta({ notify })
    fireEvent.click(screen.getByLabelText('Modifica voce Affitto laboratorio'))
    fireEvent.click(screen.getByText('Salva modifiche'))
    await waitFor(() => expect(notify).toHaveBeenCalled())
    const [messaggio, ok] = notify.mock.calls.at(-1)
    expect(messaggio).toContain('rete assente')
    expect(ok).toBe(false)
  })

  it('un errore senza messaggio non scrive «undefined» all’utente', async () => {
    const notify = vi.fn()
    salvaMock.mockImplementation(() => Promise.reject({ codice: 500 }))
    mockState.voci = VOCI_VERE
    await monta({ notify })
    fireEvent.click(screen.getByLabelText('Modifica voce Affitto laboratorio'))
    fireEvent.click(screen.getByText('Salva modifiche'))
    await waitFor(() => expect(notify).toHaveBeenCalled())
    expect(notify.mock.calls.at(-1)[0]).not.toContain('undefined')
  })

  it('due tocchi di fila salvano UNA volta sola', async () => {
    let sblocca
    salvaMock.mockImplementation(() => new Promise(r => { sblocca = r }))
    await apriModifica()
    const bottone = screen.getByText('Salva modifiche')
    fireEvent.click(bottone)
    fireEvent.click(bottone)
    fireEvent.click(bottone)
    await waitFor(() => expect(salvaMock).toHaveBeenCalled())
    expect(salvaMock).toHaveBeenCalledTimes(1)
    sblocca({ id: 'a' })
  })

  it('durante il salvataggio il pulsante è spento e lo dice', async () => {
    let sblocca
    salvaMock.mockImplementation(() => new Promise(r => { sblocca = r }))
    await apriModifica()
    fireEvent.click(screen.getByText('Salva modifiche'))
    await waitFor(() => expect(screen.queryByText('Salvataggio…')).toBeTruthy())
    expect(screen.getByText('Salvataggio…').disabled).toBe(true)
    sblocca({ id: 'a' })
  })

  it('durante il salvataggio non si può nemmeno annullare a metà', async () => {
    let sblocca
    salvaMock.mockImplementation(() => new Promise(r => { sblocca = r }))
    await apriModifica()
    fireEvent.click(screen.getByText('Salva modifiche'))
    await waitFor(() => expect(screen.queryByText('Salvataggio…')).toBeTruthy())
    expect(screen.getByText('Annulla').disabled).toBe(true)
    sblocca({ id: 'a' })
  })

  it('senza descrizione e senza importo non si salva niente, e lo dice', async () => {
    const notify = vi.fn()
    await monta({ notify })
    fireEvent.click(screen.getByLabelText('Aggiungi nuova voce di costo'))
    const finestra = screen.getByRole('dialog')
    fireEvent.click(within(finestra).getByText('Aggiungi voce'))
    expect(salvaMock).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('Compila descrizione e importo (>0)', false)
  })

  it('un importo scritto all’italiana viene rifiutato, non salvato storto', async () => {
    const notify = vi.fn()
    await monta({ notify })
    fireEvent.click(screen.getByLabelText('Aggiungi nuova voce di costo'))
    const finestra = screen.getByRole('dialog')
    fireEvent.change(within(finestra).getByPlaceholderText('es. Coppette piccole 80g'), { target: { value: 'Affitto' } })
    fireEvent.change(within(finestra).getByPlaceholderText('0,00'), { target: { value: '1.234,56' } })
    fireEvent.click(within(finestra).getByText('Aggiungi voce'))
    expect(salvaMock).not.toHaveBeenCalled()
  })

  it('un importo valido si salva', async () => {
    await monta()
    fireEvent.click(screen.getByLabelText('Aggiungi nuova voce di costo'))
    const finestra = screen.getByRole('dialog')
    fireEvent.change(within(finestra).getByPlaceholderText('es. Coppette piccole 80g'), { target: { value: 'Affitto' } })
    fireEvent.change(within(finestra).getByPlaceholderText('0,00'), { target: { value: '900' } })
    fireEvent.click(within(finestra).getByText('Aggiungi voce'))
    await waitFor(() => expect(salvaMock).toHaveBeenCalled())
    expect(salvaMock.mock.calls[0][0].importo).toBe('900')
  })

  it('l’anteprima dice subito quanto peserà sul P&L', async () => {
    await monta()
    fireEvent.click(screen.getByLabelText('Aggiungi nuova voce di costo'))
    const finestra = screen.getByRole('dialog')
    fireEvent.change(within(finestra).getByPlaceholderText('0,00'), { target: { value: '1200' } })
    expect(within(finestra).getByText(/Impatto sul P&L mensile/)).toBeTruthy()
    expect(finestra.textContent).toContain('1.200,00 €/mese')
  })

  it('messaggioErrore non lascia mai passare «undefined»', () => {
    expect(messaggioErrore(new Error('rete assente'))).toBe('rete assente')
    expect(messaggioErrore({})).not.toContain('undefined')
    expect(messaggioErrore(null)).not.toContain('undefined')
    expect(messaggioErrore(undefined)).not.toContain('undefined')
    expect(messaggioErrore('testo secco')).toBe('testo secco')
    expect(messaggioErrore(new Error(''))).not.toBe('')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Costi fissi · ogni comando si raggiunge da tastiera', () => {
  it('nessun <div onClick>: un comando invisibile a chi non usa il mouse', () => {
    // Si parte da ogni onClick e si guarda indietro al tag che lo possiede,
    // come fa `scripts/voti-sezioni.mjs`. Un `<div>` che risponde al clic
    // senza `role` non esiste per la tastiera né per un lettore di schermo.
    const trovati = []
    for (const m of SORGENTE.matchAll(/onClick\s*=\s*\{/g)) {
      const prima = SORGENTE.slice(Math.max(0, m.index - 400), m.index)
      const apre = prima.lastIndexOf('<')
      if (apre === -1) continue
      if (!/^<div[\s>]/.test(prima.slice(apre))) continue
      const tag = SORGENTE.slice(Math.max(0, m.index - 400) + apre, m.index + 200)
      if (/\brole\s*=/.test(tag)) continue
      trovati.push(prima.slice(apre).split('\n')[0])
    }
    expect(trovati).toEqual([])
  })

  it('tutti i comandi della pagina sono controlli veri (button, select, input)', async () => {
    mockState.voci = VOCI_VERE
    const { container } = await monta()
    const comandi = container.querySelectorAll('button, select, input, a[href], [role="button"]')
    expect(comandi.length).toBeGreaterThan(0)
    for (const c of comandi) {
      expect(['BUTTON', 'SELECT', 'INPUT', 'A'].includes(c.tagName) || c.getAttribute('role') === 'button').toBe(true)
    }
  })

  it('ogni pulsante ha un nome che un lettore di schermo può dire', async () => {
    mockState.voci = VOCI_VERE
    const { container } = await monta()
    for (const b of container.querySelectorAll('button')) {
      const nome = (b.getAttribute('aria-label') || b.textContent || '').trim()
      expect(nome.length).toBeGreaterThan(0)
    }
  })

  it('i pulsanti icona dicono su quale voce agiscono', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    expect(screen.getByLabelText('Modifica voce Affitto laboratorio')).toBeTruthy()
    expect(screen.getByLabelText('Elimina voce Affitto laboratorio')).toBeTruthy()
  })

  it('il filtro ha un’etichetta, anche se a schermo non si vede', async () => {
    await monta()
    expect(screen.getByLabelText('Filtra per categoria').tagName).toBe('SELECT')
  })

  it('la finestra della voce si annuncia come finestra', async () => {
    await monta()
    fireEvent.click(screen.getByLabelText('Aggiungi nuova voce di costo'))
    const finestra = screen.getByRole('dialog')
    expect(finestra.getAttribute('aria-modal')).toBe('true')
    expect(finestra.getAttribute('aria-labelledby')).toBe('costo-dialog-title')
    expect(document.getElementById('costo-dialog-title').textContent).toContain('Nuova voce di costo')
  })

  it('Esc chiude la finestra della voce', async () => {
    await monta()
    fireEvent.click(screen.getByLabelText('Aggiungi nuova voce di costo'))
    expect(screen.queryByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('la X in alto chiude la finestra', async () => {
    await monta()
    fireEvent.click(screen.getByLabelText('Aggiungi nuova voce di costo'))
    fireEvent.click(screen.getByLabelText('Chiudi finestra'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('i campi della finestra hanno tutti la loro etichetta scritta', async () => {
    await monta()
    fireEvent.click(screen.getByLabelText('Aggiungi nuova voce di costo'))
    const finestra = screen.getByRole('dialog')
    for (const t of ['Categoria', 'Descrizione voce', 'Importo (€)', 'Periodicità', 'Da quando', 'Questo costo vale per']) {
      expect(within(finestra).getByText(t)).toBeTruthy()
    }
  })

  it('nessuna finestra di sistema (alert/confirm/prompt) nel codice della pagina', () => {
    const codice = SORGENTE
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    expect(codice).not.toMatch(/(?:^|[^.\w$])window\s*\.\s*(?:alert|confirm|prompt)\s*\(/)
    expect(codice).not.toMatch(/(?:^|[^.\w$])alert\s*\(/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Costi fissi · l’ambito e il conteggio devono parlare della stessa cosa', () => {
  const SEDI = [
    { id: 's1', nome: 'Carlina', attiva: true },
    { id: 's2', nome: 'De Gasperi', attiva: true },
  ]
  const MISTE = [
    { id: 'a', voce: 'Affitto Carlina', importo: 1000, periodicita: 'mensile', categoria: 'affitti', sede_id: 's1', attivo: true },
    { id: 'b', voce: 'Affitto De Gasperi', importo: 2000, periodicita: 'mensile', categoria: 'affitti', sede_id: 's2', attivo: true },
    { id: 'c', voce: 'Commercialista', importo: 300, periodicita: 'mensile', categoria: 'servizi', sede_id: null, attivo: true },
  ]

  it('su tutta l’azienda il totale è la somma di tutte le sedi', async () => {
    mockState.voci = MISTE
    await monta({ sedeId: 's1', sedi: SEDI })
    expect(testo()).toContain('3.300 €')
    expect(testo()).toContain('3 voci attive')
  })

  it('scelta una sede, il totale è quello della sede più i costi d’azienda', async () => {
    mockState.voci = MISTE
    await monta({ sedeId: 's1', sedi: SEDI })
    fireEvent.click(screen.getByRole('button', { name: 'Sede: Carlina' }))
    expect(testo()).toContain('1.300 €')
  })

  it('scelta una sede, anche il CONTEGGIO è quello della sede', async () => {
    // Il difetto: il totale veniva dall'ambito, il conteggio da tutta
    // l'azienda. Si leggeva «1.300 €» sopra «3 voci attive».
    mockState.voci = MISTE
    await monta({ sedeId: 's1', sedi: SEDI })
    fireEvent.click(screen.getByRole('button', { name: 'Sede: Carlina' }))
    const box = screen.getByText('Costo mensile totale').parentElement
    expect(box.textContent).toContain('2 voci attive')
    expect(box.textContent).not.toContain('3 voci attive')
  })

  it('anche il totale annuo segue l’ambito scelto', async () => {
    mockState.voci = MISTE
    await monta({ sedeId: 's1', sedi: SEDI })
    fireEvent.click(screen.getByRole('button', { name: 'Sede: Carlina' }))
    expect(testo()).toContain('15.600 €')
  })

  it('tornando a tutta l’azienda torna il conto pieno', async () => {
    mockState.voci = MISTE
    await monta({ sedeId: 's1', sedi: SEDI })
    fireEvent.click(screen.getByRole('button', { name: 'Sede: Carlina' }))
    fireEvent.click(screen.getByRole('button', { name: "Tutta l'azienda" }))
    expect(testo()).toContain('3.300 €')
    expect(testo()).toContain('3 voci attive')
  })

  it('con una sede sola il selettore d’ambito non compare', async () => {
    mockState.voci = MISTE
    await monta({ sedeId: 's1', sedi: [SEDI[0]] })
    expect(testo()).not.toContain('Ambito visualizzazione')
  })

  it('ogni voce dice se vale per una sede o per tutta l’azienda', async () => {
    mockState.voci = MISTE
    await monta({ sedeId: 's1', sedi: SEDI })
    expect(testo()).toContain('Sede: Carlina')
    expect(testo()).toContain('Azienda')
  })

  it('una voce legata a una sede che non esiste più non rompe la pagina', async () => {
    mockState.voci = [{ id: 'g', voce: 'Vecchio magazzino', importo: 100, periodicita: 'mensile', categoria: 'affitti', sede_id: 'sparita', attivo: true }]
    await monta({ sedeId: 's1', sedi: SEDI })
    expect(testo()).not.toContain('undefined')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Costi fissi · le voci più care, per sapere da dove tagliare', () => {
  it('mostra le tre voci più care del mese', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    expect(testo()).toContain('Voci più care del mese')
  })

  it('le mette in ordine, dalla più cara', async () => {
    mockState.voci = VOCI_VERE
    const { container } = await monta()
    const riquadro = screen.getByText('Voci più care del mese').parentElement.parentElement
    const testoRiquadro = riquadro.textContent
    expect(testoRiquadro.indexOf('Affitto laboratorio')).toBeLessThan(testoRiquadro.indexOf('Energia elettrica'))
    expect(container).toBeTruthy()
  })

  it('una voce senza importo non entra fra le più care', async () => {
    mockState.voci = [...VOCI_VERE, { id: 'r', voce: 'Voce rotta', importo: 'abc', periodicita: 'mensile', categoria: 'altro', attivo: true }]
    await monta()
    const riquadro = screen.getByText('Voci più care del mese').parentElement.parentElement
    expect(riquadro.textContent).not.toContain('Voce rotta')
  })

  it('senza voci il riquadro delle più care non compare', async () => {
    await monta()
    expect(testo()).not.toContain('Voci più care del mese')
  })

  it('ogni voce cara mostra quanto pesa in percentuale', async () => {
    mockState.voci = VOCI_VERE
    await monta()
    const riquadro = screen.getByText('Voci più care del mese').parentElement.parentElement
    expect(riquadro.textContent).toMatch(/\d+%/)
  })
})
