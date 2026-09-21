// @vitest-environment happy-dom
//
// ── Da questa pagina si decide come lavora tutta l'azienda ────────────────
//
// 21/09/2026. Impostazioni non è una pagina di contorno: da qui si sceglie il
// metodo di produzione (che cambia le viste operative, la struttura delle
// ricette e tutte le analisi), si aggiungono le sedi, si accendono i report
// che partono da soli il primo del mese e si comprano i pacchetti di analisi
// AI. Aveva 26 prove, nessuna delle quali la montava davvero: erano controlli
// sul sorgente. Un controllo sul sorgente non si accorge di un «€NaN».
//
// Qui la pagina si monta per intero e si guarda quello che si legge a schermo.
// Sette difetti veri trovati e corretti mentre si scriveva questo file:
//
//  1. `€{(p.amount_paid_cents / 100).toFixed(2)}` nello storico dei pacchetti
//     foto AI. Tre errori in una riga: **«€NaN»** quando il database non ha
//     l'importo (succede sugli acquisti registrati a mano), il simbolo PRIMA
//     della cifra, e il punto decimale all'inglese — «€5.00» invece di
//     «5,00 €», contro la regola dei numeri italiani di CLAUDE.md.
//
//  2. `new Date(p.acquistato_il).toLocaleDateString('it-IT')` in tre punti:
//     con la data assente a schermo compariva **«Invalid Date»**. Uno dei tre
//     è il banner che dice quando è stata inviata la richiesta di cambio
//     metodo, cioè la riga che una persona legge per sapere da quanto aspetta.
//
//  3. I prezzi dei pacchetti erano stringhe scritte a mano — `'€5'`, `'€15'`,
//     `'€60'` — accanto al numero `euro: 5` che nessuno usava. Due verità per
//     lo stesso prezzo, e quella mostrata era la sbagliata.
//
//  4. `ReportMensiliSection.toggle` muoveva l'interruttore PRIMA di salvare
//     (regola 4 di CLAUDE.md, rovesciata). Due modi di rompersi, e il secondo
//     non lasciava traccia: con `{ error }` si rimetteva `setEnabled(!val)`,
//     che non è lo stato di prima ma «il contrario di quello chiesto adesso»;
//     e se l'upsert **lanciava** (rete giù) la promessa non era catturata da
//     nessuno — interruttore acceso, niente salvato, nessun avviso.
//
//  5. `ReseSection` faceva partire `salvaRese()` senza aspettarla e scriveva
//     «Resa aggiornata» comunque. Con la rete giù i due avvisi uscivano in
//     fila, prima quello di successo. La resa entra nel food cost di ogni
//     ricetta che usa quell'ingrediente.
//
//  6. La finestra «Richiedere il cambio metodo?» aveva il velo fatto con un
//     `<div onClick>` e il `role="dialog"` sul velo invece che sul riquadro:
//     non si chiudeva con Esc, non si raggiungeva con Tab, e non aveva nessun
//     nome. Ora è `VeloFinestra`, lo stesso modello di `Scadenzario.jsx`.
//
//  7. `PianoBadge` cadeva su `piano || 'Trial'`: con un piano che il listino
//     non conosce a schermo finiva l'identificativo grezzo del database.
//
// Come si rimette il difetto per vedere le prove diventare rosse: sta scritto
// accanto a ogni gruppo.

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLAN_LABEL, PLAN_PRICE_EUR } from '../../src/lib/planAccess'

// ═════════════════════════════════════════════════════════════════════════
//  Il mondo intorno alla pagina
// ═════════════════════════════════════════════════════════════════════════

// Il finto database. Ogni test lo riscrive in `beforeEach`.
const db = {
  righe: {},          // tabella → righe restituite da una select
  erroreDi: {},       // tabella → { message } restituito da insert/update
  lanciaSu: {},       // tabella → Error lanciato invece che restituito
  scritture: [],      // { tabella, tipo, dati }
  upsertDifferito: null,  // se valorizzato, l'upsert aspetta questa promessa
  insertDifferito: null,  // idem per l'insert (serve a fermare il tempo a metà)
  reports: [],
}

function catena(tabella) {
  const c = {
    select: () => c, eq: () => c, is: () => c, or: () => c, in: () => c,
    order: () => c, limit: () => c, neq: () => c,
    insert(dati) {
      db.scritture.push({ tabella, tipo: 'insert', dati })
      c._ultimoInsert = dati
      return c
    },
    update(dati) {
      db.scritture.push({ tabella, tipo: 'update', dati })
      return c
    },
    async upsert(dati) {
      db.scritture.push({ tabella, tipo: 'upsert', dati })
      if (db.upsertDifferito) await db.upsertDifferito
      if (db.lanciaSu[tabella]) throw db.lanciaSu[tabella]
      return { error: db.erroreDi[tabella] || null }
    },
    async single() {
      if (db.insertDifferito) await db.insertDifferito
      if (db.erroreDi[tabella]) return { data: null, error: db.erroreDi[tabella] }
      return { data: { id: 'req-nuova', status: 'pending', ...c._ultimoInsert }, error: null }
    },
    async maybeSingle() {
      return { data: (db.righe[tabella] || [])[0] || null, error: null }
    },
    // Una vera promessa, non un `then` che finge: il codice vero incatena
    // `.then(...).finally(...)`, e un `then` che restituisce `undefined` fa
    // esplodere la riga dopo.
    then(ok, ko) {
      return Promise.resolve({ data: db.righe[tabella] || [], error: db.erroreDi[tabella] || null }).then(ok, ko)
    },
  }
  return c
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (tabella) => catena(tabella),
    auth: {
      getUser: async () => ({ data: { user: { email: 'mara@maradeiboschi.com' } } }),
      getSession: async () => ({ data: { session: { access_token: 'tok' } } }),
      updateUser: async () => ({ error: null }),
    },
    storage: {
      from: () => ({
        list: async () => ({ data: db.reports }),
        getPublicUrl: (p) => ({ data: { publicUrl: 'https://esempio/' + p } }),
      }),
    },
  },
}))

// Le rese: un magazzino in memoria, così si può guardare cosa resta dentro
// dopo un salvataggio fallito.
let reseStore = {}
let reseErrore = null
const salvaReseSpia = vi.fn()
vi.mock('../../src/lib/rese', () => ({
  getAllRese: () => ({ ...reseStore }),
  getStoreRese: () => ({ ...reseStore }),
  setResaIngrediente: (k, v) => { reseStore[k] = v },
  loadRese: (obj) => { Object.assign(reseStore, obj || {}) },
  resetRese: () => { for (const k of Object.keys(reseStore)) delete reseStore[k] },
  salvaRese: async (orgId) => {
    salvaReseSpia(orgId, { ...reseStore })
    if (reseErrore) throw reseErrore
    return { ...reseStore }
  },
}))

vi.mock('../../src/lib/storage', () => ({ sload: async () => null, ssave: async () => true }))

// I riquadri che parlano con altri servizi non c'entrano con questa pagina.
// (La fabbrica sta dentro ogni `vi.mock`: le chiamate sono issate in cima al
//  file, quindi non possono usare una variabile dichiarata qui sotto.)
vi.mock('../../src/components/AbbonamentoPanel', () => ({ default: () => <div>AbbonamentoPanel</div> }))
vi.mock('../../src/components/WhatsAppReportPanel', () => ({ default: () => <div>WhatsAppReportPanel</div> }))
vi.mock('../../src/components/Mfa', () => ({ default: () => <div>MfaSection</div> }))
vi.mock('../../src/components/ImpostazioniTv', () => ({ default: () => <div>ImpostazioniTv</div> }))
vi.mock('../../src/components/ExportContabilita', () => ({ default: () => <div>ExportContabilita</div> }))
vi.mock('../../src/components/WhiteLabel', () => ({ default: () => <div>WhiteLabel</div> }))
vi.mock('../../src/components/EsportaDati', () => ({ default: () => <div>EsportaDati</div> }))
vi.mock('../../src/components/ReferralPanel', () => ({ default: () => <div>ReferralPanel</div> }))
vi.mock('../../src/components/DeleteAccountModal', () => ({ default: (p) => <div>{p?.open ? 'DeleteAccountModal aperto' : 'DeleteAccountModal'}</div> }))
vi.mock('../../src/components/Integrazioni', () => ({ default: () => <div>Integrazioni</div> }))

import Impostazioni, { importoDaCentesimi, dataIt } from '../../src/components/Impostazioni'

const SORGENTE = readFileSync(join(process.cwd(), 'src/components/Impostazioni.jsx'), 'utf8')

// ═════════════════════════════════════════════════════════════════════════
//  Attrezzi
// ═════════════════════════════════════════════════════════════════════════

const SEDI = [
  { id: 's1', nome: 'Carlina', citta: 'Torino', attiva: true, is_default: true },
  { id: 's2', nome: 'Vanchiglia', citta: 'Torino', attiva: true, is_default: false },
  { id: 's3', nome: 'Magazzino chiuso', citta: 'Torino', attiva: false, is_default: false },
]

const notify = vi.fn()

function apri(extra = {}) {
  const props = {
    auth: {
      user: { email: 'mara@maradeiboschi.com', email_confirmed_at: '2026-01-02' },
      org: { id: 'org-1', approvato: true, stripe_subscription_id: 'sub_1' },
      profile: { nome_completo: 'Mara' },
      isDipendente: false, isAdmin: false,
      refreshOrg: vi.fn(), signOut: vi.fn(),
    },
    nomeAttivita: 'Mara dei Boschi',
    tipoAttivita: 'Gelateria',
    metodoProduzione: 'stampi',
    piano: 'pro',
    orgId: 'org-1',
    sedi: SEDI,
    sedeId: 's1',
    notify,
    onImportPrezzi: vi.fn(),
    onChangelogOpen: vi.fn(),
    onImportaDati: vi.fn(),
    ...extra,
  }
  return render(<Impostazioni {...props} />)
}

/** Apre una voce della barra laterale e aspetta che il contenuto sia lì. */
async function vaiA(etichetta) {
  const voce = screen.getAllByRole('button', { name: new RegExp('^' + etichetta + '$') })[0]
  await act(async () => { fireEvent.click(voce) })
}

const testo = () => document.body.textContent || ''

beforeEach(() => {
  db.righe = {}
  db.erroreDi = {}
  db.lanciaSu = {}
  db.scritture = []
  db.upsertDifferito = null
  db.insertDifferito = null
  db.reports = []
  reseStore = {}
  reseErrore = null
  salvaReseSpia.mockClear()
  notify.mockClear()
  window.scrollTo = () => {}
  window.location.hash = ''
})

afterEach(() => { document.body.innerHTML = '' })

// ═════════════════════════════════════════════════════════════════════════
//  A. La pagina si apre, e non ci sono scarabocchi a schermo
// ═════════════════════════════════════════════════════════════════════════
describe('Impostazioni · la pagina si apre e si legge', () => {
  it('mostra i gruppi di impostazioni del titolare', () => {
    apri()
    for (const g of ['Attività', 'Abbonamento', 'Notifiche', 'Avanzate', 'Altro']) {
      expect(testo()).toContain(g)
    }
  })

  it('apre sulla prima voce, Profilo azienda', () => {
    apri()
    expect(screen.getByText('Profilo attività')).toBeTruthy()
    expect(screen.getByDisplayValue('Mara dei Boschi')).toBeTruthy()
  })

  it('non scrive «NaN» da nessuna parte', () => {
    apri()
    expect(testo()).not.toMatch(/NaN/)
  })

  it('non scrive «undefined» da nessuna parte', () => {
    apri()
    expect(testo()).not.toMatch(/undefined/)
  })

  it('non scrive «[object Object]» da nessuna parte', () => {
    apri()
    expect(testo()).not.toContain('[object Object]')
  })

  it('non scrive «Invalid Date» da nessuna parte', () => {
    apri()
    expect(testo()).not.toContain('Invalid Date')
  })

  it('con i dati mancanti non crolla e non inventa niente', () => {
    apri({ nomeAttivita: undefined, tipoAttivita: undefined, piano: undefined, sedi: undefined, sedeId: undefined })
    expect(testo()).not.toMatch(/NaN|undefined|\[object Object\]|Invalid Date/)
  })

  it('con i dati mancanti il tipo attività dice «-» invece di lasciare il vuoto', () => {
    apri({ tipoAttivita: null })
    expect(testo()).toContain('-')
  })

  it('il dipendente vede solo il suo account', () => {
    apri({ auth: { user: { email: 'lab@maradeiboschi.com' }, profile: { nome_completo: 'Luca' }, org: { id: 'org-1' }, isDipendente: true } })
    expect(testo()).toContain('Il mio account')
  })

  it('al dipendente non compaiono abbonamento, sedi e metodo di produzione', () => {
    apri({ auth: { user: { email: 'lab@maradeiboschi.com' }, profile: { nome_completo: 'Luca' }, org: { id: 'org-1' }, isDipendente: true } })
    expect(testo()).not.toContain('Metodo di produzione')
    expect(testo()).not.toContain('Piano e abbonamento')
    expect(testo()).not.toMatch(/Gestione Sedi/)
  })

  it('all\'amministratore compare la porta per il pannello admin', () => {
    apri({ auth: { user: { email: 'a@b.it' }, org: { id: 'org-1' }, isAdmin: true } })
    expect(screen.getByText('Pannello amministratore')).toBeTruthy()
  })

  it('a chi non è amministratore quella porta non compare', () => {
    apri()
    expect(testo()).not.toContain('Pannello amministratore')
  })
})

// ═════════════════════════════════════════════════════════════════════════
//  B. Il metodo di produzione: si CHIEDE, non si cambia da soli
//
//  Per vedere queste prove diventare rosse: in `MetodoProduzioneSection`,
//  fai scrivere alla carta direttamente `organizations.metodo_produzione`
//  invece di aprire la finestra della richiesta.
// ═════════════════════════════════════════════════════════════════════════
describe('Impostazioni · metodo di produzione', () => {
  async function apriMetodo(extra = {}) {
    apri(extra)
    await vaiA('Metodo di produzione')
  }

  it('mostra i due metodi con un nome comprensibile', async () => {
    await apriMetodo()
    expect(testo()).toContain('Stampi / unità')
    expect(testo()).toContain('Inventario differenziale')
  })

  it('spiega a chi serve ciascuno dei due', async () => {
    await apriMetodo()
    expect(testo()).toContain('Pasticcerie')
    expect(testo()).toContain('Gelaterie')
  })

  it('marca come «Attivo» il metodo in uso', async () => {
    await apriMetodo({ metodoProduzione: 'stampi' })
    const carta = screen.getByRole('button', { name: /Stampi \/ unità/ })
    expect(within(carta).getByText('Attivo')).toBeTruthy()
  })

  it('con l\'inventario differenziale l\'attivo è l\'altro', async () => {
    await apriMetodo({ metodoProduzione: 'inventario' })
    const carta = screen.getByRole('button', { name: /Inventario differenziale/ })
    expect(within(carta).getByText('Attivo')).toBeTruthy()
  })

  it('un metodo sconosciuto nel database ricade sugli stampi, non sul vuoto', async () => {
    await apriMetodo({ metodoProduzione: 'qualcosa-di-strano' })
    const carta = screen.getByRole('button', { name: /Stampi \/ unità/ })
    expect(within(carta).getByText('Attivo')).toBeTruthy()
  })

  it('la carta del metodo già attivo non si può premere', async () => {
    await apriMetodo()
    expect(screen.getByRole('button', { name: /Stampi \/ unità/ }).disabled).toBe(true)
  })

  it('dice a chiare lettere che il cambio passa dall\'amministratore', async () => {
    await apriMetodo()
    expect(testo()).toContain('approvazione admin')
  })

  it('premere l\'altro metodo apre la richiesta, non cambia niente', async () => {
    await apriMetodo()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Inventario differenziale/ })) })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(db.scritture.filter(s => s.tabella === 'organizations')).toHaveLength(0)
  })

  it('la finestra spiega che non viene applicato subito', async () => {
    await apriMetodo()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Inventario differenziale/ })) })
    expect(testo()).toContain('Non viene applicato subito')
  })

  it('inviare la richiesta scrive su metodo_change_requests il da → a giusto', async () => {
    await apriMetodo()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Inventario differenziale/ })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Invia richiesta' })) })
    const ins = db.scritture.find(s => s.tabella === 'metodo_change_requests' && s.tipo === 'insert')
    expect(ins).toBeTruthy()
    expect(ins.dati.from_metodo).toBe('stampi')
    expect(ins.dati.to_metodo).toBe('inventario')
    expect(ins.dati.organization_id).toBe('org-1')
  })

  it('il motivo scritto dall\'utente finisce nella richiesta', async () => {
    await apriMetodo()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Inventario differenziale/ })) })
    const area = document.querySelector('textarea')
    await act(async () => { fireEvent.change(area, { target: { value: 'Apriamo la gelateria a giugno' } }) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Invia richiesta' })) })
    const ins = db.scritture.find(s => s.tipo === 'insert')
    expect(ins.dati.motivazione).toBe('Apriamo la gelateria a giugno')
  })

  it('un motivo di soli spazi non viene salvato come testo vuoto', async () => {
    await apriMetodo()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Inventario differenziale/ })) })
    const area = document.querySelector('textarea')
    await act(async () => { fireEvent.change(area, { target: { value: '    ' } }) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Invia richiesta' })) })
    expect(db.scritture.find(s => s.tipo === 'insert').dati.motivazione).toBe(null)
  })

  it('dopo l\'invio l\'utente sa che deve aspettare l\'admin', async () => {
    await apriMetodo()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Inventario differenziale/ })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Invia richiesta' })) })
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Richiesta inviata'))
  })

  it('una richiesta già in attesa si vede come banner', async () => {
    db.righe.metodo_change_requests = [{ id: 'r1', status: 'pending', from_metodo: 'stampi', to_metodo: 'inventario', created_at: '2026-09-15T08:00:00Z' }]
    await apriMetodo()
    await waitFor(() => expect(testo()).toContain('Richiesta in attesa di approvazione'))
    expect(testo()).toContain('15/09/2026')
  })

  it('con una richiesta in attesa le due carte sono bloccate', async () => {
    db.righe.metodo_change_requests = [{ id: 'r1', status: 'pending', from_metodo: 'stampi', to_metodo: 'inventario', created_at: '2026-09-15T08:00:00Z' }]
    await apriMetodo()
    await waitFor(() => expect(screen.getByRole('button', { name: /Inventario differenziale/ }).disabled).toBe(true))
  })

  it('«Annulla richiesta» chiede al database lo stato cancelled', async () => {
    db.righe.metodo_change_requests = [{ id: 'r1', status: 'pending', from_metodo: 'stampi', to_metodo: 'inventario', created_at: '2026-09-15T08:00:00Z' }]
    await apriMetodo()
    await waitFor(() => screen.getByRole('button', { name: 'Annulla richiesta' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Annulla richiesta' })) })
    const upd = db.scritture.find(s => s.tabella === 'metodo_change_requests' && s.tipo === 'update')
    expect(upd.dati.status).toBe('cancelled')
  })

  it('se nel frattempo l\'admin ha approvato, lo dice invece di far finta di niente', async () => {
    db.righe.metodo_change_requests = [{ id: 'r1', status: 'pending', from_metodo: 'stampi', to_metodo: 'inventario', created_at: '2026-09-15T08:00:00Z' }]
    await apriMetodo()
    await waitFor(() => screen.getByRole('button', { name: 'Annulla richiesta' }))
    db.righe.metodo_change_requests = [{ id: 'r1', status: 'approved', from_metodo: 'stampi', to_metodo: 'inventario', created_at: '2026-09-15T08:00:00Z' }]
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Annulla richiesta' })) })
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('approvata'))
  })

  it('una richiesta rifiutata mostra il motivo dell\'admin', async () => {
    db.righe.metodo_change_requests = [{ id: 'r1', status: 'rejected', from_metodo: 'stampi', to_metodo: 'inventario', created_at: '2026-09-10T08:00:00Z', decided_at: '2026-09-12T08:00:00Z', admin_note: 'Prima finiamo il ricettario' }]
    await apriMetodo()
    await waitFor(() => expect(testo()).toContain('Ultima richiesta non approvata'))
    expect(testo()).toContain('Prima finiamo il ricettario')
    expect(testo()).toContain('12/09/2026')
  })

  it('una richiesta doppia viene spiegata in italiano, non col messaggio del database', async () => {
    db.erroreDi.metodo_change_requests = { message: 'duplicate key value violates unique constraint "uniq_pending_per_org"' }
    await apriMetodo()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Inventario differenziale/ })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Invia richiesta' })) })
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('richiesta in attesa'), false)
  })

  it('senza la data di invio non scrive «Invalid Date»', async () => {
    db.righe.metodo_change_requests = [{ id: 'r1', status: 'pending', from_metodo: 'stampi', to_metodo: 'inventario', created_at: null }]
    await apriMetodo()
    await waitFor(() => expect(testo()).toContain('Richiesta in attesa'))
    expect(testo()).not.toContain('Invalid Date')
  })

  it('senza la data della decisione non scrive «Invalid Date»', async () => {
    db.righe.metodo_change_requests = [{ id: 'r1', status: 'rejected', to_metodo: 'inventario', created_at: null, decided_at: null }]
    await apriMetodo()
    await waitFor(() => expect(testo()).toContain('Ultima richiesta non approvata'))
    expect(testo()).not.toContain('Invalid Date')
  })
})

// ═════════════════════════════════════════════════════════════════════════
//  C. Le sedi: aggiungere, rinominare, dire qual è quella principale
// ═════════════════════════════════════════════════════════════════════════
describe('Impostazioni · sedi', () => {
  async function apriSedi(extra = {}) {
    db.righe.sedi = SEDI
    apri(extra)
    await vaiA('Sedi')
    await waitFor(() => expect(testo()).toContain('Gestione Sedi'))
  }

  it('il riassunto della voce conta solo le sedi attive, non le archiviate', async () => {
    apri()   // tre righe in archivio, due attive
    await act(async () => { fireEvent.change(screen.getByPlaceholderText('Cerca impostazione…'), { target: { value: 'sedi' } }) })
    expect(testo()).toContain('2 sede/i')
    expect(testo()).not.toContain('3 sede/i')
  })

  it('senza nessuna sede il riassunto dice zero, non «undefined»', async () => {
    apri({ sedi: undefined })
    await act(async () => { fireEvent.change(screen.getByPlaceholderText('Cerca impostazione…'), { target: { value: 'sedi' } }) })
    expect(testo()).toContain('0 sede/i')
  })

  it('elenca le sedi lette dal database', async () => {
    await apriSedi()
    expect(testo()).toContain('Carlina')
    expect(testo()).toContain('Vanchiglia')
  })

  it('«+ Aggiungi sede» apre il modulo della sede nuova', async () => {
    await apriSedi()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi sede' })) })
    expect(testo()).toContain('Nuova sede')
    expect(screen.getByPlaceholderText('Es. Sede Centro')).toBeTruthy()
  })

  it('senza nome non scrive niente nel database e lo dice', async () => {
    await apriSedi()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi sede' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' })) })
    expect(db.scritture.filter(s => s.tabella === 'sedi' && s.tipo === 'insert')).toHaveLength(0)
    expect(testo()).toContain('Il nome sede è obbligatorio')
  })

  it('aggiungere una sede scrive il nome ripulito dagli spazi', async () => {
    await apriSedi()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi sede' })) })
    await act(async () => { fireEvent.change(screen.getByPlaceholderText('Es. Sede Centro'), { target: { value: '  San Salvario  ' } }) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' })) })
    const ins = db.scritture.find(s => s.tabella === 'sedi' && s.tipo === 'insert')
    expect(ins.dati.nome).toBe('San Salvario')
    expect(ins.dati.organization_id).toBe('org-1')
    expect(ins.dati.attiva).toBe(true)
  })

  it('la sede nuova nasce senza indirizzo scritto «undefined»', async () => {
    await apriSedi()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi sede' })) })
    await act(async () => { fireEvent.change(screen.getByPlaceholderText('Es. Sede Centro'), { target: { value: 'San Salvario' } }) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' })) })
    const ins = db.scritture.find(s => s.tabella === 'sedi' && s.tipo === 'insert')
    expect(ins.dati.indirizzo).toBe(null)
  })

  it('rinominare una sede manda al database il nome nuovo', async () => {
    await apriSedi()
    const modifica = screen.getAllByRole('button', { name: 'Modifica' })[0]
    await act(async () => { fireEvent.click(modifica) })
    const campo = screen.getAllByDisplayValue('Carlina')[0]
    await act(async () => { fireEvent.change(campo, { target: { value: 'Carlina Centro' } }) })
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Salva' })[0]) })
    const upd = db.scritture.find(s => s.tabella === 'sedi' && s.tipo === 'update' && s.dati.nome)
    expect(upd.dati.nome).toBe('Carlina Centro')
  })

  it('rinominare con il campo vuoto non scrive niente', async () => {
    await apriSedi()
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Modifica' })[0]) })
    const campo = screen.getAllByDisplayValue('Carlina')[0]
    await act(async () => { fireEvent.change(campo, { target: { value: '   ' } }) })
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Salva' })[0]) })
    expect(db.scritture.filter(s => s.tabella === 'sedi' && s.tipo === 'update' && s.dati.nome)).toHaveLength(0)
  })

  it('la sede archiviata si vede come archiviata, non sparisce e basta', async () => {
    await apriSedi()
    expect(testo()).toContain('Magazzino chiuso')
    expect(testo()).toContain('INATTIVA')
  })

  it('«Default» sposta la sede principale, e prima toglie il flag alle altre', async () => {
    await apriSedi()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Default' })) })
    const upd = db.scritture.filter(x => x.tabella === 'sedi' && x.tipo === 'update')
    expect(upd.some(u => u.dati.is_default === false)).toBe(true)
    expect(upd.some(u => u.dati.is_default === true)).toBe(true)
  })

  it('la sede principale è marcata, e ce n\'è una sola', async () => {
    await apriSedi()
    expect(screen.getAllByText('DEFAULT')).toHaveLength(1)
  })

  it('nell\'elenco delle sedi non compaiono «undefined» né «null»', async () => {
    db.righe.sedi = [{ id: 's9', nome: 'Senza dati', attiva: true }]
    apri()
    await vaiA('Sedi')
    await waitFor(() => expect(testo()).toContain('Senza dati'))
    expect(testo()).not.toMatch(/undefined|\[object Object\]/)
  })
})

// ═════════════════════════════════════════════════════════════════════════
//  D. Prima si scrive sul server, poi si muove lo schermo
//
//  Regola 4 di CLAUDE.md. Per vedere queste prove diventare rosse: in
//  `ReportMensiliSection.toggle` rimetti `setEnabled(val)` come prima riga e
//  togli il try/catch; in `ReseSection.applica` togli l'`await` davanti a
//  `salvaRese(orgId)`.
// ═════════════════════════════════════════════════════════════════════════
describe('Impostazioni · prima il salvataggio, poi lo stato', () => {
  const differita = () => {
    let sblocca
    const p = new Promise(r => { sblocca = r })
    return { p, sblocca }
  }

  async function apriReport() {
    apri()
    await vaiA('Report mensili email')
    await waitFor(() => expect(testo()).toContain('Report mensili via email'))
  }

  const interruttore = () => screen.getByRole('switch')

  it('l\'interruttore dei report parte acceso e ha un nome che si legge', async () => {
    await apriReport()
    expect(interruttore().getAttribute('aria-checked')).toBe('true')
    expect(interruttore().getAttribute('aria-label')).toBe('Report mensili via email')
  })

  it('spegnere i report scrive su user_data PRIMA di spegnere l\'interruttore', async () => {
    const { p, sblocca } = differita()
    db.upsertDifferito = p
    await apriReport()
    await act(async () => { fireEvent.click(interruttore()) })
    // La scrittura è partita...
    expect(db.scritture.find(s => s.tabella === 'user_data' && s.tipo === 'upsert')).toBeTruthy()
    // ...e finché non risponde il server, lo schermo NON si è mosso.
    expect(interruttore().getAttribute('aria-checked')).toBe('true')
    await act(async () => { sblocca(); await p })
    await waitFor(() => expect(interruttore().getAttribute('aria-checked')).toBe('false'))
  })

  it('quello che si scrive è il valore chiesto dall\'utente', async () => {
    await apriReport()
    await act(async () => { fireEvent.click(interruttore()) })
    const w = db.scritture.find(s => s.tabella === 'user_data' && s.tipo === 'upsert')
    expect(w.dati.data_value).toEqual({ emailReport: false })
    expect(w.dati.data_key).toBe('report-settings-v1')
    expect(w.dati.organization_id).toBe('org-1')
  })

  it('se il salvataggio va a buon fine l\'utente riceve conferma', async () => {
    await apriReport()
    await act(async () => { fireEvent.click(interruttore()) })
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Email report disattivata'))
  })

  it('se il database rifiuta, l\'interruttore NON cambia', async () => {
    db.erroreDi.user_data = { message: 'permesso negato' }
    await apriReport()
    await act(async () => { fireEvent.click(interruttore()) })
    await waitFor(() => expect(notify).toHaveBeenCalled())
    expect(interruttore().getAttribute('aria-checked')).toBe('true')
  })

  it('se il database rifiuta, l\'utente lo sa', async () => {
    db.erroreDi.user_data = { message: 'permesso negato' }
    await apriReport()
    await act(async () => { fireEvent.click(interruttore()) })
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('Non ho potuto salvare'), false))
  })

  it('se la rete è giù (la scrittura LANCIA) l\'interruttore non cambia e l\'utente lo sa', async () => {
    // Era il caso senza traccia: la promessa non era catturata da nessuno,
    // l'interruttore restava acceso e non compariva nessun avviso.
    db.lanciaSu.user_data = new Error('Failed to fetch')
    await apriReport()
    await act(async () => { fireEvent.click(interruttore()) })
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('Non ho potuto salvare'), false))
    expect(interruttore().getAttribute('aria-checked')).toBe('true')
  })

  it('mentre salva, l\'interruttore non si può premere una seconda volta', async () => {
    const { p, sblocca } = differita()
    db.upsertDifferito = p
    await apriReport()
    await act(async () => { fireEvent.click(interruttore()) })
    expect(interruttore().disabled).toBe(true)
    await act(async () => { fireEvent.click(interruttore()) })
    expect(db.scritture.filter(s => s.tabella === 'user_data' && s.tipo === 'upsert')).toHaveLength(1)
    await act(async () => { sblocca(); await p })
  })

  it('la resa si salva nel database prima di dire «Resa aggiornata»', async () => {
    reseStore = { uova: 1.0 }
    apri()
    await vaiA('Resa ingredienti')
    const campo = document.querySelector('input[type="number"]')
    await act(async () => { fireEvent.blur(campo, { target: { value: '85' } }) })
    await waitFor(() => expect(salvaReseSpia).toHaveBeenCalled())
    // Il salvataggio ha visto il valore NUOVO, non quello di prima.
    expect(salvaReseSpia.mock.calls[0][1].uova).toBeCloseTo(0.85, 4)
    expect(notify).toHaveBeenCalledWith('Resa aggiornata')
  })

  it('la resa si salva sull\'organizzazione giusta', async () => {
    reseStore = { uova: 1.0 }
    apri()
    await vaiA('Resa ingredienti')
    await act(async () => { fireEvent.blur(document.querySelector('input[type="number"]'), { target: { value: '90' } }) })
    await waitFor(() => expect(salvaReseSpia).toHaveBeenCalledWith('org-1', expect.anything()))
  })

  it('se il salvataggio della resa fallisce NON dice «Resa aggiornata»', async () => {
    reseStore = { uova: 1.0 }
    reseErrore = new Error('Failed to fetch')
    apri()
    await vaiA('Resa ingredienti')
    await act(async () => { fireEvent.blur(document.querySelector('input[type="number"]'), { target: { value: '85' } }) })
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('Non ho potuto salvare la resa'), false))
    expect(notify).not.toHaveBeenCalledWith('Resa aggiornata')
  })

  it('se il salvataggio della resa fallisce il valore torna com\'era', async () => {
    reseStore = { uova: 1.0 }
    reseErrore = new Error('Failed to fetch')
    apri()
    await vaiA('Resa ingredienti')
    await act(async () => { fireEvent.blur(document.querySelector('input[type="number"]'), { target: { value: '85' } }) })
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('Non ho potuto salvare'), false))
    expect(reseStore.uova).toBe(1.0)
  })

  it('una resa fuori scala viene riportata dentro i limiti prima di essere salvata', async () => {
    reseStore = { uova: 1.0 }
    apri()
    await vaiA('Resa ingredienti')
    await act(async () => { fireEvent.blur(document.querySelector('input[type="number"]'), { target: { value: '999' } }) })
    await waitFor(() => expect(salvaReseSpia).toHaveBeenCalled())
    expect(salvaReseSpia.mock.calls[0][1].uova).toBe(1)
  })

  it('una resa scritta a vanvera non diventa NaN', async () => {
    reseStore = { uova: 1.0 }
    apri()
    await vaiA('Resa ingredienti')
    await act(async () => { fireEvent.blur(document.querySelector('input[type="number"]'), { target: { value: 'boh' } }) })
    await waitFor(() => expect(salvaReseSpia).toHaveBeenCalled())
    expect(Number.isFinite(salvaReseSpia.mock.calls[0][1].uova)).toBe(true)
    expect(testo()).not.toContain('NaN')
  })

  it('il nome dell\'attività si salva sull\'organizzazione', async () => {
    apri()
    await act(async () => { fireEvent.change(screen.getByDisplayValue('Mara dei Boschi'), { target: { value: 'Mara dei Boschi srl' } }) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salva' })) })
    const upd = db.scritture.find(s => s.tabella === 'organizations' && s.tipo === 'update')
    expect(upd.dati.nome).toBe('Mara dei Boschi srl')
  })

  it('il pulsante Salva resta spento finché il nome non cambia davvero', async () => {
    apri()
    expect(screen.getByRole('button', { name: 'Salva' }).disabled).toBe(true)
  })

  it('un nome fatto di soli spazi non arriva mai al database', async () => {
    apri()
    await act(async () => { fireEvent.change(screen.getByDisplayValue('Mara dei Boschi'), { target: { value: '   ' } }) })
    expect(screen.getByRole('button', { name: 'Salva' }).disabled).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════
//  E. I numeri si scrivono all'italiana, e quelli che non ci sono non si
//     inventano
//
//  Per vedere queste prove diventare rosse: rimetti
//  `€{(p.amount_paid_cents / 100).toFixed(2)}` e
//  `new Date(p.acquistato_il).toLocaleDateString('it-IT')` in
//  `PacchettiAIPanel`, e i campi `prezzo: '€5'` in `PACKS_CATALOG`.
// ═════════════════════════════════════════════════════════════════════════
describe('Impostazioni · numeri e importi', () => {
  async function apriPacchetti(righe = []) {
    db.righe.ai_credit_packs_purchased = righe
    apri()
    await vaiA('Pacchetti foto AI')
    await waitFor(() => expect(testo()).toContain('Saldo foto AI'))
  }

  it('il prezzo dei pacchetti ha il simbolo DOPO la cifra', async () => {
    await apriPacchetti()
    expect(testo()).toContain('5 €')
    expect(testo()).toContain('15 €')
    expect(testo()).toContain('60 €')
  })

  it('non c\'è nessun prezzo scritto col simbolo davanti', async () => {
    await apriPacchetti()
    expect(testo()).not.toMatch(/€\s?\d/)
  })

  it('i prezzi non sono più stringhe scritte a mano nel sorgente', () => {
    expect(SORGENTE).not.toMatch(/prezzo:\s*'€/)
  })

  it('il numero di foto del pacchetto ha il punto delle migliaia', async () => {
    await apriPacchetti()
    expect(testo()).toContain('1.000 foto AI')
  })

  it('il saldo residuo ha il punto delle migliaia', async () => {
    await apriPacchetti([{ id: 'p1', calls_remaining: 1500, calls_included: 2000, amount_paid_cents: 6000, acquistato_il: '2026-03-04' }])
    await waitFor(() => expect(testo()).toContain('1.500'))
  })

  it('l\'importo di un acquisto si legge «60,00 €», non «€60.00»', async () => {
    await apriPacchetti([{ id: 'p1', calls_remaining: 10, calls_included: 1000, amount_paid_cents: 6000, acquistato_il: '2026-03-04' }])
    await waitFor(() => expect(testo()).toContain('60,00 €'))
    expect(testo()).not.toContain('€60.00')
  })

  it('un acquisto senza importo non scrive «€NaN»', async () => {
    await apriPacchetti([{ id: 'p1', calls_remaining: 10, calls_included: 100, amount_paid_cents: null, acquistato_il: '2026-03-04' }])
    await waitFor(() => expect(testo()).toContain('importo non disponibile'))
    expect(testo()).not.toContain('NaN')
  })

  it('un acquisto senza data non scrive «Invalid Date»', async () => {
    await apriPacchetti([{ id: 'p1', calls_remaining: 10, calls_included: 100, amount_paid_cents: 500, acquistato_il: null }])
    await waitFor(() => expect(testo()).toContain('data non registrata'))
    expect(testo()).not.toContain('Invalid Date')
  })

  it('una data storta non scrive «Invalid Date»', async () => {
    await apriPacchetti([{ id: 'p1', calls_remaining: 10, calls_included: 100, amount_paid_cents: 500, acquistato_il: 'non-una-data' }])
    await waitFor(() => expect(testo()).toContain('data non registrata'))
    expect(testo()).not.toContain('Invalid Date')
  })

  it('un pacchetto esaurito lo dice a parole, non scrive «0 / 0»', async () => {
    await apriPacchetti([{ id: 'p1', calls_remaining: 0, calls_included: 100, amount_paid_cents: 500, acquistato_il: '2026-03-04' }])
    await waitFor(() => expect(testo()).toContain('esaurito'))
  })

  it('un pacchetto scaduto non conta nel saldo', async () => {
    await apriPacchetti([{ id: 'p1', calls_remaining: 40, calls_included: 100, amount_paid_cents: 500, acquistato_il: '2020-03-04', scade_il: '2021-03-04' }])
    await waitFor(() => expect(testo()).toContain('scaduto'))
    expect(testo()).toMatch(/0\s*foto/)
  })

  it('`importoDaCentesimi` scrive l\'importo all\'italiana', () => {
    expect(importoDaCentesimi(123456)).toBe('1.234,56 €')
    expect(importoDaCentesimi(500)).toBe('5,00 €')
    expect(importoDaCentesimi(0)).toBe('0,00 €')
  })

  it('`importoDaCentesimi` risponde «niente» quando il dato non c\'è', () => {
    expect(importoDaCentesimi(null)).toBe(null)
    expect(importoDaCentesimi(undefined)).toBe(null)
    expect(importoDaCentesimi('')).toBe(null)
    expect(importoDaCentesimi('boh')).toBe(null)
  })

  it('`dataIt` scrive la data all\'italiana', () => {
    expect(dataIt('2026-09-21T10:00:00Z')).toBe('21/09/2026')
  })

  it('`dataIt` risponde «niente» su una data che non c\'è o non è una data', () => {
    expect(dataIt(null)).toBe(null)
    expect(dataIt(undefined)).toBe(null)
    expect(dataIt('')).toBe(null)
    expect(dataIt('non-una-data')).toBe(null)
  })

  it('il prezzo del piano viene dal listino, non scritto a mano', () => {
    apri({ piano: 'pro' })
    expect(testo()).toContain(String(PLAN_PRICE_EUR.pro))
    expect(testo()).toMatch(new RegExp(PLAN_PRICE_EUR.pro + '\\s*€/mese'))
  })

  it('in prova gratuita non si scrive «0 €/mese»', () => {
    apri({ piano: 'trial', auth: { user: { email: 'a@b.it' }, org: { id: 'org-1', approvato: false } } })
    expect(testo()).not.toContain('0 €/mese')
  })
})

// ═════════════════════════════════════════════════════════════════════════
//  F. Piano e abbonamento: i nomi vengono dal listino
//
//  Per vedere queste prove diventare rosse: rimetti in `PianoBadge` il
//  fallback `piano || 'Trial'` e scrivi a mano «Pro» al posto di
//  `PLAN_LABEL.pro`.
// ═════════════════════════════════════════════════════════════════════════
describe('Impostazioni · piano e abbonamento', () => {
  it('il nome del piano è quello del listino, non l\'identificativo del database', () => {
    apri({ piano: 'pro' })
    expect(testo()).toContain(PLAN_LABEL.pro)
    expect(testo()).not.toContain('pro attivo')
  })

  it('il piano base mostra il suo nome commerciale', () => {
    apri({ piano: 'base' })
    expect(testo()).toContain(PLAN_LABEL.base)
  })

  it('il piano più alto mostra il suo nome commerciale', () => {
    apri({ piano: 'enterprise' })
    expect(testo()).toContain(PLAN_LABEL.enterprise)
  })

  it('un piano che il listino non conosce non finisce a schermo com\'è scritto nel database', () => {
    apri({ piano: 'piano-strano-scritto-a-mano' })
    expect(testo()).not.toContain('piano-strano-scritto-a-mano')
    expect(testo()).toContain(PLAN_LABEL.trial)
  })

  it('il riassunto della voce Abbonamento usa il nome del listino', async () => {
    apri({ piano: 'pro' })
    await act(async () => { fireEvent.change(screen.getByPlaceholderText('Cerca impostazione…'), { target: { value: 'abbonamento' } }) })
    expect(testo()).toContain(PLAN_LABEL.pro + ' attivo')
  })

  it('senza abbonamento attivo il riassunto dice «In prova»', async () => {
    apri({ auth: { user: { email: 'a@b.it' }, org: { id: 'org-1', approvato: false } } })
    await act(async () => { fireEvent.change(screen.getByPlaceholderText('Cerca impostazione…'), { target: { value: 'abbonamento' } }) })
    expect(testo()).toContain('In prova')
  })

  it('nel sorgente non ci sono nomi di piano scritti a mano', () => {
    const corpo = SORGENTE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    for (const nome of Object.values(PLAN_LABEL)) {
      expect(corpo, `«${nome}» scritto a mano invece che preso da PLAN_LABEL`).not.toContain(`'${nome}'`)
    }
  })

  it('la personalizzazione del marchio compare solo sul piano più alto', () => {
    apri({ piano: 'pro' })
    expect(testo()).not.toContain('Personalizzazione')
  })

  it('...e sul piano più alto compare', () => {
    apri({ piano: 'enterprise' })
    expect(testo()).toContain('Personalizzazione')
  })
})

// ═════════════════════════════════════════════════════════════════════════
//  G. Tutto si raggiunge con la tastiera
//
//  Per vedere queste prove diventare rosse: rimetti la finestra com'era —
//  `<div role="dialog" aria-modal onClick={...}>` come velo, senza Esc e
//  senza nome — e togli `aria-label` dal `Toggle`.
// ═════════════════════════════════════════════════════════════════════════
describe('Impostazioni · tastiera e lettori di schermo', () => {
  async function apriFinestraMetodo(extra = {}) {
    apri(extra)
    await vaiA('Metodo di produzione')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Inventario differenziale/ })) })
    return screen.getByRole('dialog')
  }

  it('nel sorgente non c\'è nessun comando nascosto dentro un `<div onClick>`', () => {
    // Stessa lettura del righello dei voti: si parte dall'`onClick` e si
    // guarda INDIETRO fino al tag che lo possiede.
    const codice = SORGENTE
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    const colpevoli = []
    for (const m of codice.matchAll(/onClick\s*=\s*\{/g)) {
      const prima = codice.slice(Math.max(0, m.index - 400), m.index)
      const apre = prima.lastIndexOf('<')
      if (apre === -1) continue
      if (!/^<div[\s>]/.test(prima.slice(apre))) continue
      colpevoli.push(codice.slice(m.index, m.index + 60))
    }
    expect(colpevoli).toEqual([])
  })

  it('la finestra del cambio metodo ha un ruolo e un nome che si legge', async () => {
    const dialog = await apriFinestraMetodo()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const nome = document.getElementById(dialog.getAttribute('aria-labelledby'))
    expect(nome.textContent).toContain('Richiedere il cambio metodo?')
  })

  it('il velo della finestra è un pulsante vero, e dice cosa fa', async () => {
    await apriFinestraMetodo()
    expect(screen.getByRole('button', { name: 'Chiudi la finestra' })).toBeTruthy()
  })

  it('il velo chiude la finestra', async () => {
    await apriFinestraMetodo()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Chiudi la finestra' })) })
    expect(screen.queryByRole('dialog')).toBe(null)
  })

  it('Esc chiude la finestra', async () => {
    await apriFinestraMetodo()
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByRole('dialog')).toBe(null)
  })

  it('un tasto qualsiasi non chiude la finestra', async () => {
    await apriFinestraMetodo()
    await act(async () => { fireEvent.keyDown(document, { key: 'a' }) })
    expect(screen.queryByRole('dialog')).toBeTruthy()
  })

  it('mentre la richiesta parte, Esc non la interrompe a metà', async () => {
    let sblocca
    db.insertDifferito = new Promise(r => { sblocca = r })
    await apriFinestraMetodo()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Invia richiesta' })) })
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByRole('dialog')).toBeTruthy()
    await act(async () => { sblocca(); await db.insertDifferito })
  })

  it('il pulsante che invia si spegne mentre sta inviando', async () => {
    let sblocca
    db.insertDifferito = new Promise(r => { sblocca = r })
    await apriFinestraMetodo()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Invi/ })) })
    expect(screen.getByRole('button', { name: /Invio/ }).disabled).toBe(true)
    await act(async () => { sblocca(); await db.insertDifferito })
  })

  it('l\'interruttore dei report si annuncia come interruttore, con il suo nome', async () => {
    apri()
    await vaiA('Report mensili email')
    const sw = screen.getByRole('switch')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(sw.getAttribute('aria-label')).toBeTruthy()
  })

  it('ogni voce del menu delle impostazioni è un pulsante raggiungibile col Tab', () => {
    apri()
    for (const etichetta of ['Profilo azienda', 'Account', 'Metodo di produzione', 'Sedi', 'Resa ingredienti']) {
      const b = screen.getAllByRole('button', { name: new RegExp('^' + etichetta + '$') })[0]
      expect(b.tagName).toBe('BUTTON')
      expect(b.disabled).toBe(false)
    }
  })

  it('il campo di ricerca è un campo vero, con un\'indicazione di cosa cercare', () => {
    apri()
    const campo = screen.getByPlaceholderText('Cerca impostazione…')
    expect(campo.tagName).toBe('INPUT')
  })

  it('i pulsanti hanno tutti un testo o un nome: nessuno muto', () => {
    apri()
    const muti = Array.from(document.querySelectorAll('button')).filter(b =>
      !(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('title'))
    expect(muti.map(b => b.outerHTML.slice(0, 80))).toEqual([])
  })

  it('la resa si conferma anche con Invio, non solo uscendo dal campo', async () => {
    reseStore = { uova: 1.0 }
    apri()
    await vaiA('Resa ingredienti')
    const campo = document.querySelector('input[type="number"]')
    await act(async () => { fireEvent.keyDown(campo, { key: 'Enter', target: { value: '80' } }) })
    await waitFor(() => expect(salvaReseSpia).toHaveBeenCalled())
  })

  it('il pulsante che ripristina la resa dice cosa fa, anche se è solo un\'icona', async () => {
    reseStore = { uova: 0.85 }
    apri()
    await vaiA('Resa ingredienti')
    expect(screen.getByTitle('Ripristina default')).toBeTruthy()
  })
})

// ═════════════════════════════════════════════════════════════════════════
//  H. Trovare la cosa giusta: ricerca, indirizzo web, briciole di pane
// ═════════════════════════════════════════════════════════════════════════
describe('Impostazioni · ricerca e navigazione', () => {
  const cerca = async (q) => {
    await act(async () => { fireEvent.change(screen.getByPlaceholderText('Cerca impostazione…'), { target: { value: q } }) })
  }

  it('cercando «sedi» compare la voce Sedi con il suo riassunto', async () => {
    apri()
    await cerca('sedi')
    expect(testo()).toContain('sede/i')
  })

  it('la ricerca trova anche per riassunto, non solo per titolo', async () => {
    apri()
    await cerca('commercialista')
    expect(testo()).toContain('Export contabilità')
  })

  it('senza risultati lo dice, e ripete cosa è stato cercato', async () => {
    apri()
    await cerca('zzzz-non-esiste')
    expect(testo()).toContain('Nessuna impostazione corrisponde a "zzzz-non-esiste"')
  })

  it('premere un risultato apre quella impostazione e svuota la ricerca', async () => {
    apri()
    await cerca('resa')
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: /Resa ingredienti/ })[0]) })
    expect(screen.getByPlaceholderText('Cerca impostazione…').value).toBe('')
    expect(testo()).toContain('La resa indica quanta parte del peso lordo')
  })

  it('un indirizzo con #section=rese apre direttamente la resa ingredienti', () => {
    window.location.hash = 'section=rese'
    apri()
    expect(testo()).toContain('La resa indica quanta parte del peso lordo')
  })

  it('un indirizzo con una sezione che non esiste apre la prima, senza rompersi', () => {
    window.location.hash = 'section=sezione-inventata'
    apri()
    expect(testo()).toContain('Profilo attività')
  })

  it('cambiando sezione l\'indirizzo si aggiorna, così il tasto indietro funziona', async () => {
    apri()
    await vaiA('Resa ingredienti')
    await waitFor(() => expect(window.location.hash).toContain('section=rese'))
  })

  it('le briciole dicono da dove si arriva', async () => {
    apri()
    await vaiA('Resa ingredienti')
    expect(testo()).toContain('Impostazioni')
    expect(testo()).toContain('Avanzate')
  })

  it('«Porta dentro i dati» esiste ed è raggiungibile', async () => {
    const onImportaDati = vi.fn()
    apri({ onImportaDati })
    await vaiA('Porta dentro i dati')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Apri i modelli e gli import/ })) })
    expect(onImportaDati).toHaveBeenCalled()
  })

  it('il changelog si apre da Impostazioni', async () => {
    const onChangelogOpen = vi.fn()
    apri({ onChangelogOpen })
    await vaiA('Changelog')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Vedi changelog completo/ })) })
    expect(onChangelogOpen).toHaveBeenCalled()
  })

  it('l\'import dei prezzi accetta un file e lo passa a chi lo sa leggere', async () => {
    const onImportPrezzi = vi.fn()
    apri({ onImportPrezzi })
    await vaiA('Importa prezzi')
    const campo = document.querySelector('input[type="file"]')
    expect(campo.accept).toContain('.csv')
  })

  it('uscire chiude davvero la sessione', async () => {
    const signOut = vi.fn()
    apri({ auth: { user: { email: 'a@b.it' }, org: { id: 'org-1', approvato: true }, signOut } })
    await vaiA('Esci')
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: /^Esci$/ }).pop()) })
    await waitFor(() => expect(signOut).toHaveBeenCalled())
  })
})
