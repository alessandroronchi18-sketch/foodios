// @vitest-environment happy-dom
//
// ── La pagina dove ci sono nomi, contratti e paghe di persone vere ─────────
//
// Personale è l'unica pagina di Foodos che contiene dati personali: nome e
// cognome, tipo di contratto, livello CCNL, data di assunzione, stipendio.
// Tre cose devono restare vere, e ognuna qui ha la sua prova.
//
// 1. **Un dipendente non ci entra.** L'elenco chiuso delle pagine che vede
//    (`VISTE_DIPENDENTE` in `src/lib/menuFoodos.js`) non contiene `personale`,
//    e non deve contenerlo per sbaglio domani.
// 2. **Ogni lettura e ogni scrittura porta con sé l'organizzazione.** Le
//    politiche RLS lo garantiscono già sul database, ma il filtro va scritto
//    anche qui: se un giorno una di queste chiamate girasse con la chiave di
//    servizio, il filtro sul client è l'unica cosa che resta in piedi.
// 3. **Niente sparisce con un tocco solo.** Archiviare una persona e
//    cancellare un turno passano da una domanda, e la domanda si aspetta con
//    `await`: una promessa non attesa è sempre «vera», e il programma
//    chiederebbe, sentirebbe «no» e scriverebbe lo stesso.
//
// Più le prove del tablet (20/09/2026): `isTablet` arrivava a `DipendentiTab`
// e a `TurniTab` come prop e non lo leggeva nessuno, quindi sull'iPad la
// pagina usava le misure del computer — pulsanti di 25 px, quando per il dito
// ce ne vogliono 44. È la stessa forma di errore già costata cara il
// 15 e il 18 settembre.
//
// E le prove della scheda «Analisi costo», dove il selettore del target non
// colorava niente: le soglie del colore erano 30 e 40 scritte a mano, quindi
// chi sceglieva 25% vedeva un 29% ancora verde.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { VISTE_DIPENDENTE } from '../../src/lib/menuFoodos'

const DB = { dipendenti: [], turni: [] }
const CHIAMATE = []
let CHIUSURE = {}
let LARGHEZZA = 1440

function fluente(nome) {
  const h = {
    get(_t, p) {
      if (p === 'then') return (res) => res({ data: DB[nome] || [], error: null, count: (DB[nome] || []).length })
      if (p === 'single' || p === 'maybeSingle') return () => Promise.resolve({ data: (DB[nome] || [])[0] || null, error: null })
      return (...args) => { CHIAMATE.push({ tabella: nome, op: p, args }); return new Proxy({}, h) }
    },
  }
  return new Proxy({}, h)
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 'x' } } }),
      getUser: () => Promise.resolve({ data: { user: { id: 'u' } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: (nome) => fluente(nome),
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => CHIUSURE,
}))
// Le tre larghezze si decidono da qui: telefono sotto 768, tablet fino a 1023,
// computer sopra. Così si prova anche il pixel di confine, che è dove è nato
// il difetto.
vi.mock('../../src/lib/useIsMobile', () => ({
  default: () => LARGHEZZA <= 767,
  useIsTablet: () => LARGHEZZA >= 768 && LARGHEZZA <= 1023,
}))

// Nomi inventati.
const ANNA = { id: 'd1', nome: 'Anna Pedrini', ruolo: 'Pasticciera', tipo_contratto: 'Full-time', attivo: true, costo_orario: 15, ore_settimana: 40, stipendio_lordo_mensile: 0 }
const BRUNO = { id: 'd2', nome: 'Bruno Salis', ruolo: 'Banco', tipo_contratto: 'Part-time', attivo: true, costo_orario: 0, ore_settimana: 24, stipendio_lordo_mensile: 1600 }
const SENZA_COSTO = { id: 'd3', nome: 'Carla Innocenti', ruolo: 'Aiuto', tipo_contratto: 'Stagionale', attivo: true, costo_orario: 0, ore_settimana: 20, stipendio_lordo_mensile: 0 }

beforeEach(() => {
  DB.dipendenti = [ANNA, BRUNO]
  DB.turni = []
  CHIAMATE.length = 0
  CHIUSURE = {}
  LARGHEZZA = 1440
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 16, 10, 0, 0))
})
afterEach(() => { vi.useRealTimers(); cleanup(); vi.resetModules() })

// Pagina e provider delle conferme caricati insieme: con `vi.resetModules()`
// due import separati danno due contesti React diversi e `useConfirm()` non
// trova il provider (vedi turniOrariDalDatabase.test.jsx).
async function monta(props = {}) {
  const [{ default: Personale }, { ConfirmProvider }] = await Promise.all([
    import('../../src/components/Personale.jsx'),
    import('../../src/components/ConfirmModal.jsx'),
  ])
  const r = render(
    <ConfirmProvider>
      <Personale orgId="org-1" sedeId="s1" sedi={[{ id: 's1', nome: 'Centro', attiva: true }]}
        notify={() => {}} adminNome="Anita" nomeAttivita="Pasticceria di prova" {...props} />
    </ConfirmProvider>
  )
  // Si aspetta un dato che arriva dal database, non un'etichetta fissa.
  const segnale = DB.dipendenti.length ? DB.dipendenti[0].nome : 'Nessun dipendente ancora.'
  await waitFor(() => expect(r.container.textContent).toContain(segnale), { timeout: 8000 })
  return r
}

describe('Chi può vedere questa pagina', () => {
  it('«personale» non è fra le pagine del dipendente', () => {
    expect(VISTE_DIPENDENTE.has('personale')).toBe(false)
  })

  it('e nemmeno con un altro nome: nessuna voce parla di paghe o turni', () => {
    for (const v of VISTE_DIPENDENTE) {
      expect(v).not.toMatch(/personale|stipend|paghe|turni|organigramma/i)
    }
  })

  it('l\'elenco del dipendente resta corto e fatto solo di pagine operative', () => {
    expect(VISTE_DIPENDENTE.size).toBeLessThan(15)
    expect(VISTE_DIPENDENTE.has('giornaliero')).toBe(true)
    expect(VISTE_DIPENDENTE.has('magazzino')).toBe(true)
  })
})

describe('Ogni chiamata al database porta con sé l\'organizzazione', () => {
  it('la lettura dei dipendenti filtra per organizzazione', async () => {
    await monta()
    const perOrg = CHIAMATE.filter(c => c.tabella === 'dipendenti' && c.op === 'eq' && c.args[0] === 'organization_id')
    expect(perOrg.length).toBeGreaterThan(0)
    for (const c of perOrg) expect(c.args[1]).toBe('org-1')
  })

  it('anche la lettura dei turni', async () => {
    await monta()
    const perOrg = CHIAMATE.filter(c => c.tabella === 'turni' && c.op === 'eq' && c.args[0] === 'organization_id')
    expect(perOrg.length).toBeGreaterThan(0)
    for (const c of perOrg) expect(c.args[1]).toBe('org-1')
  })

  it('archiviare una persona filtra per organizzazione, non solo per id', async () => {
    const r = await monta()
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.getAttribute('title') === 'Archivia'))
    await waitFor(() => expect(r.baseElement.textContent).toContain('Archiviare dipendente?'), { timeout: 8000 })
    CHIAMATE.length = 0
    fireEvent.click([...r.baseElement.querySelectorAll('button')].find(b => b.textContent.trim() === 'Archivia'))
    await waitFor(() => {
      expect(CHIAMATE.some(c => c.tabella === 'dipendenti' && c.op === 'update')).toBe(true)
    }, { timeout: 8000 })
    const filtri = CHIAMATE.filter(c => c.tabella === 'dipendenti' && c.op === 'eq').map(c => c.args[0])
    expect(filtri).toContain('organization_id')
    expect(filtri).toContain('id')
  })
})

describe('Prima di archiviare una persona, si chiede', () => {
  it('compare la domanda invece dell\'archiviazione immediata', async () => {
    const r = await monta()
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.getAttribute('title') === 'Archivia'))
    await waitFor(() => expect(r.baseElement.textContent).toContain('Archiviare dipendente?'), { timeout: 8000 })
  })

  it('la domanda rassicura che lo storico dei turni non si perde', async () => {
    const r = await monta()
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.getAttribute('title') === 'Archivia'))
    await waitFor(() => expect(r.baseElement.textContent).toContain('Storico turni e dati restano salvati'), { timeout: 8000 })
  })

  it('rispondendo «Annulla» non si scrive niente', async () => {
    const r = await monta()
    // Azzerato PRIMA di aprire la domanda: senza `await` la scrittura
    // partirebbe subito e azzerare dopo la coprirebbe.
    CHIAMATE.length = 0
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.getAttribute('title') === 'Archivia'))
    await waitFor(() => expect(r.baseElement.textContent).toContain('Archiviare dipendente?'), { timeout: 8000 })
    fireEvent.click([...r.baseElement.querySelectorAll('button')].find(b => b.textContent.trim() === 'Annulla'))
    await waitFor(() => expect(r.baseElement.textContent).not.toContain('Archiviare dipendente?'), { timeout: 8000 })
    expect(CHIAMATE.filter(c => c.tabella === 'dipendenti' && c.op === 'update')).toHaveLength(0)
  })
})

describe('Il tablet si tocca col dito, come il telefono', () => {
  const altezzaPulsanti = (c, titolo) => [...c.querySelectorAll(`button[title="${titolo}"]`)]
    .map(b => parseInt(b.style.minHeight || '0', 10))

  it('sul TABLET i pulsanti della riga arrivano a 44 px — era il difetto', async () => {
    LARGHEZZA = 768
    const r = await monta()
    const h = altezzaPulsanti(r.container, 'Modifica')
    expect(h.length).toBeGreaterThan(0)
    for (const x of h) expect(x).toBeGreaterThanOrEqual(44)
  })

  it('sul TELEFONO la scheda usa i suoi pulsanti larghi', async () => {
    LARGHEZZA = 390
    const r = await monta()
    const modifica = [...r.container.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Modifica')
    expect(modifica.length).toBeGreaterThan(0)
  })

  it('sul COMPUTER restano compatti: col mouse bastano', async () => {
    LARGHEZZA = 1440
    const r = await monta()
    const h = altezzaPulsanti(r.container, 'Modifica')
    expect(h.length).toBeGreaterThan(0)
    for (const x of h) expect(x === 0 || Number.isNaN(x)).toBe(true)
  })

  it('a 1023 e a 1024 cambia il dispositivo, e la misura lo segue', async () => {
    LARGHEZZA = 1023
    const a = await monta()
    const conDito = parseInt(a.container.querySelector('button[title="Modifica"]').style.minHeight || '0', 10)
    cleanup()
    LARGHEZZA = 1024
    const b = await monta()
    const conMouse = parseInt(b.container.querySelector('button[title="Modifica"]').style.minHeight || '0', 10)
    expect(conDito).toBeGreaterThanOrEqual(44)
    expect(conMouse).toBe(0)
  })

  it('anche le frecce del periodo nei turni sono da dito sul tablet', async () => {
    LARGHEZZA = 768
    const r = await monta()
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Turni'))
    await waitFor(() => expect(r.container.querySelector('[aria-label="Periodo precedente"]')).toBeTruthy(), { timeout: 8000 })
    const prec = r.container.querySelector('[aria-label="Periodo precedente"]')
    expect(parseInt(prec.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(44)
  })
})

describe('La scheda «Analisi costo»', () => {
  async function apriAnalisi(r) {
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Analisi costo'))
    await waitFor(() => expect(r.container.textContent).toContain('Target incidenza'), { timeout: 8000 })
  }

  it('senza turni registrati lo dice, invece di mostrare zeri', async () => {
    DB.turni = []
    const r = await monta()
    await apriAnalisi(r)
    await waitFor(() => expect(r.container.textContent).toMatch(/Nessun turno registrato/), { timeout: 8000 })
  })

  it('con pochi turni non mostra lo scostamento dal contratto', async () => {
    // Due giornate di turni su trenta: dire «-95% sotto il teorico» sarebbe
    // un risparmio inventato, non un risparmio.
    DB.turni = [
      { id: 't1', data: '2026-09-05', dipendente_id: 'd1', ore: 8, costo: 120, ora_inizio: '08:00:00', ora_fine: '16:00:00', dipendenti: { nome: ANNA.nome, ruolo: ANNA.ruolo } },
      { id: 't2', data: '2026-09-06', dipendente_id: 'd1', ore: 8, costo: 120, ora_inizio: '08:00:00', ora_fine: '16:00:00', dipendenti: { nome: ANNA.nome, ruolo: ANNA.ruolo } },
    ]
    const r = await monta()
    await apriAnalisi(r)
    await waitFor(() => expect(r.container.textContent).toContain('Effettivo vs contratto'), { timeout: 8000 })
    expect(r.container.textContent).toContain('troppo pochi')
  })

  it('dice su quante giornate è calcolato il costo effettivo', async () => {
    DB.turni = [
      { id: 't1', data: '2026-09-05', dipendente_id: 'd1', ore: 8, costo: 120, ora_inizio: '08:00:00', ora_fine: '16:00:00', dipendenti: { nome: ANNA.nome, ruolo: ANNA.ruolo } },
      { id: 't2', data: '2026-09-06', dipendente_id: 'd1', ore: 8, costo: 120, ora_inizio: '08:00:00', ora_fine: '16:00:00', dipendenti: { nome: ANNA.nome, ruolo: ANNA.ruolo } },
    ]
    const r = await monta()
    await apriAnalisi(r)
    await waitFor(() => expect(r.container.textContent).toContain('in 2 giornate'), { timeout: 8000 })
  })

  it('avvisa quando un turno è costato «non lo so» e il costo è stimato', async () => {
    DB.turni = [
      { id: 't1', data: '2026-09-05', dipendente_id: 'd2', ore: 8, costo: 0, ora_inizio: '08:00:00', ora_fine: '16:00:00', dipendenti: { nome: BRUNO.nome, ruolo: BRUNO.ruolo } },
    ]
    const r = await monta()
    await apriAnalisi(r)
    await waitFor(() => expect(r.container.textContent).toContain('stimati dallo stipendio'), { timeout: 8000 })
  })

  it('la proiezione annua dice se manca il costo di qualcuno', async () => {
    DB.dipendenti = [ANNA, SENZA_COSTO]
    DB.turni = [
      { id: 't1', data: '2026-09-05', dipendente_id: 'd1', ore: 8, costo: 120, ora_inizio: '08:00:00', ora_fine: '16:00:00', dipendenti: { nome: ANNA.nome, ruolo: ANNA.ruolo } },
    ]
    const r = await monta()
    await apriAnalisi(r)
    await waitFor(() => expect(r.container.textContent).toContain('manca il costo di 1'), { timeout: 8000 })
  })

  it('il target scelto cambia il colore del numero grande, non solo la frase', async () => {
    DB.turni = [
      { id: 't1', data: '2026-09-05', dipendente_id: 'd1', ore: 8, costo: 290, ora_inizio: '08:00:00', ora_fine: '16:00:00', dipendenti: { nome: ANNA.nome, ruolo: ANNA.ruolo } },
    ]
    CHIUSURE = { s1: [{ data: '2026-09-05', kpi: { totV: 1000 } }] }
    const r = await monta()
    await apriAnalisi(r)
    await waitFor(() => expect(r.container.textContent).toContain('29,0%'), { timeout: 8000 })
    const numero = () => [...r.container.querySelectorAll('span')].find(x => x.textContent.trim() === '29,0%')
    const verde = numero().style.color
    // Con il target al 25% un 29% non è più «ottimo»: deve cambiare colore.
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === '25%'))
    await waitFor(() => expect(numero().style.color).not.toBe(verde), { timeout: 8000 })
  })

  it('e il cerchietto del target scrive la soglia scelta, non un 30 fisso', async () => {
    DB.turni = [
      { id: 't1', data: '2026-09-05', dipendente_id: 'd1', ore: 8, costo: 290, ora_inizio: '08:00:00', ora_fine: '16:00:00', dipendenti: { nome: ANNA.nome, ruolo: ANNA.ruolo } },
    ]
    CHIUSURE = { s1: [{ data: '2026-09-05', kpi: { totV: 1000 } }] }
    const r = await monta()
    await apriAnalisi(r)
    await waitFor(() => expect(r.container.textContent).toContain('target ≤30%'), { timeout: 8000 })
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === '35%'))
    await waitFor(() => expect(r.container.textContent).toContain('target ≤35%'), { timeout: 8000 })
  })
})

// ── Un token che non esiste non dà errore: il fondo sparisce e basta ──────
//
// `C.bgSubtle` era usato in quattro punti della pagina e non era mai stato
// definito nella tavolozza locale `C`. React non protesta e non scrive
// «undefined» da nessuna parte: salta la proprietà, e quei fondi
// semplicemente non c'erano — il selettore del target dell'incidenza, la
// barra delle sotto-schede degli accessi, il riquadro del codice a quattro
// cifre. Trovato il 20/09/2026 sistemando i colori scritti a mano.
//
// Cercare la parola «undefined» nello stile NON funziona (l'abbiamo provato:
// React quella proprietà non la scrive proprio). L'unico modo di misurarlo è
// guardare se il fondo c'è.
describe('I fondi che erano spariti perché il colore non esisteva', () => {
  it('il selettore del target dell\'incidenza ha un fondo', async () => {
    DB.turni = [
      { id: 't1', data: '2026-09-16', dipendente_id: 'd1', ore: 8, costo: 120, ora_inizio: '08:00:00', ora_fine: '16:00:00', dipendenti: { nome: ANNA.nome, ruolo: ANNA.ruolo } },
    ]
    const r = await monta()
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Analisi costo'))
    await waitFor(() => expect(r.container.textContent).toContain('Target incidenza'), { timeout: 8000 })
    const bottone30 = [...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === '30%')
    expect(bottone30).toBeTruthy()
    expect(bottone30.parentElement.style.background).not.toBe('')
  })

  it('la barra delle sotto-schede degli accessi ha un fondo', async () => {
    const r = await monta()
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Accessi'))
    await waitFor(() => expect(r.container.querySelector('[role="tablist"]')).toBeTruthy(), { timeout: 8000 })
    expect(r.container.querySelector('[role="tablist"]').style.background).not.toBe('')
  })

  it('e il righello sa riconoscere un fondo che manca', async () => {
    // Prova di controllo: su un elemento senza fondo la stessa misura dice
    // stringa vuota. Se non lo facesse, le due prove qui sopra passerebbero
    // sempre e non proteggerebbero niente.
    const vuoto = document.createElement('div')
    expect(vuoto.style.background).toBe('')
  })
})

// ── I comandi che con la tastiera non esistevano ──────────────────────────
//
// Al 21/09/2026 questa pagina aveva quattordici `<div onClick>`: comandi che
// si possono solo toccare col dito o col mouse. Col tabulatore non ci si
// arriva, e un lettore di schermo non li annuncia — dice «gruppo», non
// «pulsante». Erano la casella del giorno nel calendario del mese, la barra
// del turno nella timeline (cioè il comando principale della scheda Turni) e
// i veli delle sei finestre, che erano l'unico modo di chiuderle.
//
// Adesso sono `<button>` veri. Si prova il TAG, non lo stile: `cursor:
// pointer` ce l'aveva anche il `div`.
describe('Ogni comando è un pulsante vero, non un riquadro che si tocca', () => {
  async function apriTurni(r) {
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Turni'))
    await waitFor(() => expect(r.container.textContent).toContain('Costo lavoro'), { timeout: 8000 })
  }
  const TURNO = { id: 't1', data: '2026-09-16', dipendente_id: 'd1', ore: 8, costo: 120, ora_inizio: '08:00:00', ora_fine: '16:00:00', dipendenti: { nome: ANNA.nome, ruolo: ANNA.ruolo } }

  it('la barra del turno nella timeline è un <button>', async () => {
    DB.turni = [TURNO]
    const r = await monta()
    await apriTurni(r)
    await waitFor(() => expect(r.container.querySelector('[aria-label^="Turno "]')).toBeTruthy(), { timeout: 8000 })
    expect(r.container.querySelector('[aria-label^="Turno "]').tagName).toBe('BUTTON')
  })

  it('la casella del giorno nel calendario del mese è un <button>', async () => {
    DB.turni = [TURNO]
    const r = await monta()
    await apriTurni(r)
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Mese'))
    await waitFor(() => expect(r.container.querySelector('[aria-label*="apri il dettaglio"]')).toBeTruthy(), { timeout: 8000 })
    expect(r.container.querySelector('[aria-label*="apri il dettaglio"]').tagName).toBe('BUTTON')
  })

  it('e la sua etichetta dice il giorno e quanti turni ci sono', async () => {
    DB.turni = [TURNO]
    const r = await monta()
    await apriTurni(r)
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Mese'))
    await waitFor(() => expect(r.container.querySelector('[aria-label*="apri il dettaglio"]')).toBeTruthy(), { timeout: 8000 })
    const etichetta = r.container.querySelector('[aria-label*="apri il dettaglio"]').getAttribute('aria-label')
    expect(etichetta).toContain('settembre')
    expect(etichetta).toContain('1 turno')
  })

  it('i giorni senza turni lo dicono, invece di non dire niente', async () => {
    DB.turni = []
    const r = await monta()
    await apriTurni(r)
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Mese'))
    await waitFor(() => expect(r.container.querySelector('[aria-label*="nessun turno"]')).toBeTruthy(), { timeout: 8000 })
    expect(r.container.querySelector('[aria-label*="nessun turno"]').tagName).toBe('BUTTON')
  })

  it('nessun comando resta un <div>: niente role="button" fatto a mano', async () => {
    DB.turni = [TURNO]
    const r = await monta()
    await apriTurni(r)
    const finti = [...r.container.querySelectorAll('div[role="button"]')]
    expect(finti.map(d => d.getAttribute('aria-label') || d.textContent.slice(0, 30))).toEqual([])
  })
})

describe('Le finestre si chiudono anche senza mouse', () => {
  async function apriCambiaCodice(r) {
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Accessi'))
    await waitFor(() => expect(r.container.textContent).toContain('Laboratori'), { timeout: 8000 })
    fireEvent.click([...r.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Nuovo laboratorio'))
    await waitFor(() => expect(r.baseElement.textContent).toContain('Nuovo laboratorio'), { timeout: 8000 })
  }

  it('il velo scuro è un pulsante con la sua etichetta, non un riquadro muto', async () => {
    const r = await monta()
    await apriCambiaCodice(r)
    const velo = r.baseElement.querySelector('[aria-label="Chiudi la finestra"]')
    expect(velo).toBeTruthy()
    expect(velo.tagName).toBe('BUTTON')
  })

  it('premendo Esc la finestra si chiude', async () => {
    const r = await monta()
    await apriCambiaCodice(r)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(r.baseElement.querySelector('[aria-label="Chiudi la finestra"]')).toBeFalsy(), { timeout: 8000 })
  })

  it('e cliccando fuori dal riquadro pure, come prima', async () => {
    const r = await monta()
    await apriCambiaCodice(r)
    fireEvent.click(r.baseElement.querySelector('[aria-label="Chiudi la finestra"]'))
    await waitFor(() => expect(r.baseElement.querySelector('[aria-label="Chiudi la finestra"]')).toBeFalsy(), { timeout: 8000 })
  })
})
