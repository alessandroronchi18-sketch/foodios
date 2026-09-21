// @vitest-environment happy-dom
//
// ── «Costo lavoro: 0 €» su una pasticceria che paga tre stipendi ───────────
//
// Il difetto, trovato il 20/09/2026 guardando la pagina Personale sui dati
// veri del design partner (lettura SQL, niente nomi qui dentro).
//
// In cima alla pagina del costo del lavoro c'è la tessera più grande di
// tutte: «Costo lavoro (mese)». Diceva **0 €**. Sotto, la stessa pagina
// elencava tre persone con lo stipendio scritto in scheda, per 8.038,82 €
// lordi al mese in tutto — che per l'azienda, con contributi, INAIL e TFR,
// fanno 12.141 € al mese.
//
// Il conto era scritto a mano dentro l'intestazione:
//
//     costoContratto: lista.reduce((s, x) =>
//       s + (x.costo_orario || 0) * (x.ore_settimana || 0) * 4.33, 0)
//
// e sbagliava due volte nella stessa riga.
//
// 1. **Non guardava lo stipendio mensile.** La query non leggeva nemmeno la
//    colonna `stipendio_lordo_mensile`. Chi è pagato a mese — quasi tutti —
//    valeva zero. E `costo_orario` sul database ha `default 0` ed è
//    nullable: una cella lasciata vuota, a mano o in un import, diventa 0, e
//    0 moltiplicato per qualunque cosa fa 0. Un valore che manca non è zero,
//    ma qui le due cose erano stampate identiche.
// 2. **Contava il lordo e basta.** Anche quando trovava un costo orario, non
//    aggiungeva contributi e TFR: circa il 40% in meno del costo vero.
//
// Lo stesso vizio più sotto: il totale dai turni era `sum(t.costo)`, e i
// turni salvati quando il costo orario era 0 hanno 0 sul database.
//
// Come riprodurlo sul codice di prima: un dipendente con
// `stipendio_lordo_mensile = 2000`, `costo_orario = 0`, `ore_settimana = 40`.
// L'intestazione scriveva «0 €».
//
// La correzione: il costo passa da `costoPersonaleMensile` e
// `costoLavoroDaTurni` in `src/lib/stipendiCalc.js` — le stesse funzioni del
// conto economico — e quando non si sa si scrive un trattino, mai uno zero.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import { ConfirmProvider } from '../../src/components/ConfirmModal'
import { costoPersonaleMensile } from '../../src/lib/stipendiCalc'

// Come li scrive Foodos: punto delle migliaia SEMPRE (l'italiano di ICU lo
// mette solo da cinque cifre in su, e «4591 €» non è come si scrive un
// importo su una busta paga).
const euro = (n) => `${Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' })} €`

// ── Finto database: una tabella per nome, e le chiamate si possono rileggere
const DB = { dipendenti: [], turni: [] }
const CHIAMATE = []

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

let CHIUSURE = {}
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
  ssave: async () => {},
  sload: async () => null,
  ssaveBatch: async () => {},
  sloadAllSedi: async () => CHIUSURE,
}))
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false }))

const SEDI = [{ id: 's1', nome: 'Centro', attiva: true }]

// Aspettare «Costo lavoro (mese)» NON basta: quell'etichetta c'è già al primo
// disegno, prima che il database abbia risposto. Un'attesa così passa sempre e
// non prova niente. Qui si aspetta un dato che può comparire SOLO dopo il
// caricamento: il nome della prima persona in elenco (o la frase del vuoto).
async function apriPagina() {
  const { default: Personale } = await import('../../src/components/Personale.jsx')
  const r = render(
    <ConfirmProvider>
      <Personale orgId="org-1" sedeId="s1" sedi={SEDI} notify={() => {}} adminNome="Anita" nomeAttivita="Pasticceria di prova" />
    </ConfirmProvider>
  )
  const segnale = DB.dipendenti.length ? DB.dipendenti[0].nome : 'Nessun dipendente ancora.'
  await waitFor(() => expect(r.container.textContent).toContain(segnale), { timeout: 8000 })
  // E il riquadro in cima si disegna con i SUOI dati, non con lo stato
  // iniziale: il contatore parte da 0, quindi si aspetta il numero vero.
  await waitFor(() => expect(r.container.textContent).toContain(`Dipendenti attivi${DB.dipendenti.length}`), { timeout: 8000 })
  return r
}

// Nomi inventati: sui dati veri ci sono persone vere.
const A_STIPENDIO = { id: 'd1', nome: 'Giulia Conte', ruolo: 'Pasticciera', tipo_contratto: 'Full-time', attivo: true, costo_orario: 0, ore_settimana: 40, stipendio_lordo_mensile: 2000 }
const B_STIPENDIO = { id: 'd2', nome: 'Marco Ferri', ruolo: 'Capo laboratorio', tipo_contratto: 'Full-time', attivo: true, costo_orario: 0, ore_settimana: 40, stipendio_lordo_mensile: 4000 }
const C_A_ORE = { id: 'd3', nome: 'Sara Bianchi', ruolo: 'Banco', tipo_contratto: 'Part-time', attivo: true, costo_orario: 12, ore_settimana: 20, stipendio_lordo_mensile: 0 }
const D_SENZA_NIENTE = { id: 'd4', nome: 'Luca Pozzi', ruolo: 'Aiuto', tipo_contratto: 'Stagionale', attivo: true, costo_orario: 0, ore_settimana: 30, stipendio_lordo_mensile: 0 }

beforeEach(() => {
  DB.dipendenti = []
  DB.turni = []
  CHIAMATE.length = 0
  CHIUSURE = {}
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 15, 10, 0, 0)) // 15 settembre 2026, ora locale
})
afterEach(() => { vi.useRealTimers(); cleanup(); vi.resetModules() })

describe('Il costo del lavoro di chi è pagato a stipendio', () => {
  it('finisce nella tessera «Costo lavoro (mese)» invece di sparire', async () => {
    DB.dipendenti = [A_STIPENDIO]
    const { container } = await apriPagina()
    const atteso = costoPersonaleMensile([A_STIPENDIO]).totale
    expect(atteso).toBeGreaterThan(2000)
    await waitFor(() => expect(container.textContent).toContain(euro(atteso)))
  })

  it('non è più zero (era il difetto: 0 € con lo stipendio scritto)', async () => {
    DB.dipendenti = [A_STIPENDIO]
    const { container } = await apriPagina()
    const tessera = tesseraCosto(container)
    await waitFor(() => expect(tessera().textContent).not.toMatch(/(^|\D)0 €/))
  })

  it('somma tre stipendi nel totale del mese', async () => {
    DB.dipendenti = [A_STIPENDIO, B_STIPENDIO, { ...A_STIPENDIO, id: 'd9', nome: 'Elena Ruffo', stipendio_lordo_mensile: 2038.82 }]
    const { container } = await apriPagina()
    const atteso = costoPersonaleMensile(DB.dipendenti).totale
    expect(atteso).toBeGreaterThan(12000)
    await waitFor(() => expect(container.textContent).toContain(euro(atteso)))
  })

  it('comprende contributi e TFR, non il solo lordo', async () => {
    DB.dipendenti = [A_STIPENDIO]
    const { container } = await apriPagina()
    // 2.000 € lordi al mese costano all'azienda molto più di 2.000.
    await waitFor(() => expect(container.textContent).not.toContain('2.000 €'))
    expect(container.textContent).toContain('contributi e TFR')
  })

  it('conta anche chi è pagato a ore', async () => {
    DB.dipendenti = [C_A_ORE]
    const { container } = await apriPagina()
    const atteso = costoPersonaleMensile([C_A_ORE]).totale
    await waitFor(() => expect(container.textContent).toContain(euro(atteso)))
  })

  it('somma insieme chi è a ore e chi è a stipendio', async () => {
    DB.dipendenti = [A_STIPENDIO, C_A_ORE]
    const { container } = await apriPagina()
    const atteso = costoPersonaleMensile([A_STIPENDIO, C_A_ORE]).totale
    const soloUno = costoPersonaleMensile([A_STIPENDIO]).totale
    expect(atteso).toBeGreaterThan(soloUno)
    await waitFor(() => expect(container.textContent).toContain(euro(atteso)))
  })

  it('chiede al database la colonna dello stipendio (prima non la leggeva)', async () => {
    DB.dipendenti = [A_STIPENDIO]
    await apriPagina()
    const select = CHIAMATE.filter(c => c.tabella === 'dipendenti' && c.op === 'select').map(c => String(c.args[0]))
    expect(select.some(s => s.includes('stipendio_lordo_mensile') || s === '*')).toBe(true)
  })
})

describe('Un costo che non si sa non si scrive zero', () => {
  it('la tessera del costo mostra un trattino quando non si sa niente di nessuno', async () => {
    DB.dipendenti = [D_SENZA_NIENTE]
    const { container } = await apriPagina()
    const t = tesseraCosto(container)
    await waitFor(() => expect(t().textContent).toContain('-'))
    expect(t().textContent).not.toMatch(/\d+ €/)
  })

  it('dice quante persone non riesce a contare', async () => {
    DB.dipendenti = [A_STIPENDIO, D_SENZA_NIENTE]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toContain('manca il costo di 1 persona'))
  })

  it('al singolare scrive «1 persona», al plurale «2 persone»', async () => {
    DB.dipendenti = [A_STIPENDIO, D_SENZA_NIENTE, { ...D_SENZA_NIENTE, id: 'd5', nome: 'Rosa Vitale' }]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toContain('manca il costo di 2 persone'))
  })

  it('nella scheda di una persona senza dati scrive «costo da inserire», non «0,00 €/h»', async () => {
    DB.dipendenti = [D_SENZA_NIENTE]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toContain('costo da inserire'))
    expect(container.textContent).not.toContain('0,00 €/h')
  })

  it('e «costo mese da calcolare» al posto di «0,00 €/mese»', async () => {
    DB.dipendenti = [D_SENZA_NIENTE]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toContain('costo mese da calcolare'))
    expect(container.textContent).not.toContain('0,00 €/mese')
  })

  it('chi ha lo stipendio vede il costo orario ricavato, e sa che è ricavato', async () => {
    DB.dipendenti = [A_STIPENDIO]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toContain('(dallo stipendio)'))
  })

  it('chi ha il costo orario scritto a mano non legge «(dallo stipendio)»', async () => {
    DB.dipendenti = [C_A_ORE]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toContain('12,00 €/h'))
    expect(container.textContent).not.toContain('(dallo stipendio)')
  })
})

describe('La riga di riepilogo della lista dipendenti', () => {
  it('dice su quante persone è fatto il totale', async () => {
    DB.dipendenti = [A_STIPENDIO, B_STIPENDIO, D_SENZA_NIENTE]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toContain('su 2 persone di 3'))
  })

  it('avvisa quando qualcuno è senza costo orario né stipendio', async () => {
    DB.dipendenti = [A_STIPENDIO, D_SENZA_NIENTE]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toContain('senza costo orario né stipendio'))
  })

  it('non avvisa se sono tutti a posto', async () => {
    DB.dipendenti = [A_STIPENDIO, C_A_ORE]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toContain('su 2 persone di 2'))
    expect(container.textContent).not.toContain('senza costo orario né stipendio')
  })

  it('con una persona sola scrive «persona» e non «persone»', async () => {
    DB.dipendenti = [A_STIPENDIO]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toContain('su 1 persona di 1'))
  })
})

describe('I numeri che arrivano dal database come stringhe', () => {
  it('lo stipendio scritto come testo non fa saltare il totale', async () => {
    DB.dipendenti = [{ ...A_STIPENDIO, stipendio_lordo_mensile: '2000.00', ore_settimana: '40.0' }]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).not.toContain('NaN'))
    const t = tesseraCosto(container)
    expect(t().textContent).toMatch(/\d/)
  })

  it('le ore dei turni scritte come testo non diventano NaN', async () => {
    DB.dipendenti = [A_STIPENDIO]
    DB.turni = [{ id: 't1', data: '2026-09-05', dipendente_id: 'd1', ore: '8.00', costo: '0.00', ora_inizio: '08:00:00', ora_fine: '16:00:00' }]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toContain('Costo lavoro (mese)'))
    expect(container.textContent).not.toContain('NaN')
  })

  it('un turno salvato con costo 0 non abbassa il costo del mese: si stima dallo stipendio', async () => {
    DB.dipendenti = [A_STIPENDIO]
    DB.turni = [{ id: 't1', data: '2026-09-05', dipendente_id: 'd1', ore: 8, costo: 0, ora_inizio: '08:00:00', ora_fine: '16:00:00' }]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toContain('turni:'))
    // Otto ore di una persona da 2.000 € lordi non costano zero.
    expect(container.textContent).not.toContain('turni: 0 €')
  })
})

describe('Su quante giornate è fatto il conto', () => {
  it('l\'incidenza dichiara le giornate di incasso su cui è calcolata', async () => {
    DB.dipendenti = [A_STIPENDIO]
    CHIUSURE = { s1: [{ data: '2026-09-01', kpi: { totV: 1000 } }, { data: '2026-09-02', kpi: { totV: 1200 } }] }
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toContain('su 2 giornate di incasso'))
  })

  it('senza chiusure registrate scrive un trattino, non uno zero', async () => {
    DB.dipendenti = [A_STIPENDIO]
    CHIUSURE = {}
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toContain('registra le chiusure'))
  })

  it('a metà mese confronta mezzo costo con mezzo fatturato', async () => {
    // 15 settembre: sono passati 15 giorni su 30. Il costo del mese intero
    // contro l'incasso di mezzo mese raddoppiava l'incidenza.
    DB.dipendenti = [A_STIPENDIO]
    const costoMese = costoPersonaleMensile([A_STIPENDIO]).totale
    CHIUSURE = { s1: [{ data: '2026-09-10', kpi: { totV: costoMese } }] }
    const { container } = await apriPagina()
    // costo pro-rata = metà del mese → incidenza vicino al 50%, non al 100%.
    await waitFor(() => expect(container.textContent).toContain('su 1 giornata di incasso'))
    expect(container.textContent).not.toContain('100,0%')
  })

  it('dice su quante giornate di turni è calcolato il fatturato per ora', async () => {
    DB.dipendenti = [A_STIPENDIO]
    DB.turni = [
      { id: 't1', data: '2026-09-05', dipendente_id: 'd1', ore: 8, costo: 100, ora_inizio: '08:00:00', ora_fine: '16:00:00' },
      { id: 't2', data: '2026-09-06', dipendente_id: 'd1', ore: 8, costo: 100, ora_inizio: '08:00:00', ora_fine: '16:00:00' },
    ]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toContain('su 2 giornate di turni'))
  })
})

describe('Come si scrivono i numeri e i soldi', () => {
  it('il simbolo € sta dopo la cifra, mai prima', async () => {
    DB.dipendenti = [A_STIPENDIO, B_STIPENDIO]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toMatch(/\d\s?€/))
    expect(container.textContent).not.toMatch(/€\s?\d/)
  })

  it('le migliaia hanno il punto all\'italiana', async () => {
    DB.dipendenti = [A_STIPENDIO, B_STIPENDIO]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toMatch(/\d\.\d{3} €/))
  })

  it('non c\'è nessuna emoji né simbolo grafico al posto di un\'icona', async () => {
    DB.dipendenti = [A_STIPENDIO, D_SENZA_NIENTE]
    const { container } = await apriPagina()
    await waitFor(() => expect(container.textContent).toContain('Costo lavoro (mese)'))
    // Faccine e pittogrammi. La freccia tipografica di «lordo↔netto» è un
    // segno di testo e resta: quello che non deve esserci è il disegnino
    // scritto a mano al posto del componente Icon (era «✕» e «↩ Riattiva»).
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{FE0F}\u{2764}]/u)
    expect(container.textContent).not.toContain('\u2715')
    expect(container.textContent).not.toContain('\u21A9')
  })
})

// La tessera del costo: la si ritrova dal testo dell'etichetta.
function tesseraCosto(container) {
  return () => {
    const et = [...container.querySelectorAll('div')].find(d => d.textContent.trim() === 'Costo lavoro (mese)')
    return et?.parentElement || container
  }
}
