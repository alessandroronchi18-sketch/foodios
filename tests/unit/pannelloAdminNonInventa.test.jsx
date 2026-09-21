// @vitest-environment happy-dom
//
// ── Il pannello admin: quello che dice, e quello che non sa ──────────────
//
// È la pagina da cui si guarda l'azienda: quanti clienti ci sono, quanti
// pagano, quanto entra al mese, e da cui si cancellano account. Al 21/09/2026
// aveva **31 prove per 4.900 righe**, e nessuna guardava un numero a schermo.
//
// Misurato sul database vero lo stesso giorno: **710 organizzazioni, 2
// approvate, 5 con dei dati dentro**. Il resto sono account di prova. Su
// quella lista il pannello calcola conversione, MRR e crescita: se un conto
// sbaglia, sbaglia la fotografia dell'azienda, non una schermata.
//
// ── Il difetto che queste prove hanno trovato ───────────────────────────
//
//     value={stats ? fmtEuro(stats.mrrStimato) : '-'}
//     const fmtEuro = n => _ADMIN_NF.format(Number(n || 0)) + ' €'
//
// Se il server risponde ma **non manda** `mrrStimato`, `Number(undefined || 0)`
// fa zero e il riquadro scrive «0 €». Cioè: «i ricavi ricorrenti sono zero»,
// che è un'affermazione, quando la verità è «non lo so». Le due cose si
// leggono uguali e portano a decisioni diverse. È la regola di casa — un dato
// che manca non è zero — applicata al numero più importante della pagina.
//
// La correzione: `!= null` prima di tutto (`Number(null)` fa 0 ed è finito),
// e se il numero non c'è si scrive «-», come già fanno gli altri riquadri.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'

// Il finto server: si decide risposta per risposta cosa torna, e si tiene
// l'elenco delle chiamate fatte — serve a provare che un'azione annullata
// non chiama niente.
const risposte = {}
const chiamate = []
vi.mock('../../src/lib/apiFetch', () => ({
  apiFetch: async (path) => {
    chiamate.push(path)
    const k = Object.keys(risposte).find(x => path.includes(x))
    if (k && risposte[k] instanceof Error) throw risposte[k]
    return { ok: true, status: 200, json: async () => (k ? risposte[k] : {}) }
  },
}))
vi.mock('../../src/lib/supabase', () => ({ supabase: {
  auth: {
    getUser: async () => ({ data: { user: { email: 'admin@foodos.it' } } }),
    getSession: async () => ({ data: { session: null } }),
  },
  from: () => ({ select: () => ({ eq: () => ({ then: r => r({ data: [], error: null }) }) }) }),
} }))

const { default: AdminPage } = await import('../../src/admin/AdminPage.jsx')

// Un cliente con la forma vera della vista `admin_overview` (letta dal
// database di produzione il 21/09/2026: 19 colonne, queste le usate).
const cliente = (p = {}) => ({
  org_id: 'o1', nome_attivita: 'Mara dei Boschi', tipo: 'gelateria', piano: 'pro',
  org_approvata: true, attivo: true, trial_ends_at: null,
  registrata_il: '2026-01-10T09:00:00Z', email: 'riccardo@maradeiboschi.com',
  nome_completo: 'Riccardo', num_sedi: 2, num_record: 120,
  ultimo_record_at: '2026-09-20T09:00:00Z', ...p,
})

const STATS = { totale: 1234, paganti: 2, trial: 5, scaduti: 3, mrrStimato: 1477, nuoviSettimana: 4 }

function preparaServer({ clienti = [cliente()], stats = STATS, ...extra } = {}) {
  for (const k of Object.keys(risposte)) delete risposte[k]
  chiamate.length = 0
  risposte['action=stats'] = { clienti, stats }
  risposte['action=audit'] = { log: [] }
  Object.assign(risposte, extra)
}

async function apri() {
  const r = render(<AdminPage />)
  await waitFor(() => expect(r.container.textContent).toMatch(/Totale clienti/), { timeout: 5000 })
  return r
}

const bottoni = (c) => [...c.querySelectorAll('button')]
const perEtichetta = (c, re) => bottoni(c).find(b => re.test(b.getAttribute('aria-label') || ''))
const perTesto = (c, re) => bottoni(c).find(b => re.test(b.textContent || ''))

beforeEach(() => preparaServer())
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('I numeri in cima alla pagina', () => {
  it('mostrano quello che il server ha mandato', async () => {
    const { container } = await apri()
    expect(container.textContent).toMatch(/1\.234/)   // totale clienti, col punto
    expect(container.textContent).toMatch(/1\.477 €/) // MRR stimato
  })

  it('i numeri oltre il migliaio hanno il punto, all\'italiana', async () => {
    const { container } = await apri()
    expect(container.textContent, 'un numero è scritto 1234 invece di 1.234').not.toMatch(/(^|[^\d.])1234([^\d]|$)/)
  })

  it('il simbolo dell\'euro sta dopo la cifra', async () => {
    // Regola permanente del titolare: «1.477 €», mai «€ 1.477».
    const { container } = await apri()
    const testi = [...container.querySelectorAll('*')]
      .map(e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(''))
      .filter(t => t.includes('€'))
    expect(testi.length, 'nessun importo a schermo: la prova non guarda niente').toBeGreaterThan(0)
    expect(testi.filter(t => /€\s?\d/.test(t))).toEqual([])
  })

  it('un MRR che il server non manda diventa «-», non «0 €»', async () => {
    // Il difetto raccontato in cima. Zero euro di ricavi ricorrenti è
    // un'affermazione; «non lo so» è un'altra cosa.
    preparaServer({ stats: { totale: 1234, paganti: 2, trial: 5 } })
    const { container } = await apri()
    const testo = container.textContent
    const iMrr = testo.indexOf('MRR stimato')
    expect(iMrr, 'il riquadro dell\'MRR non c\'è più').toBeGreaterThan(-1)
    expect(testo.slice(iMrr, iMrr + 40)).not.toMatch(/0 €/)
    expect(testo.slice(iMrr, iMrr + 40)).toMatch(/-/)
  })

  it('e nemmeno un MRR nullo diventa zero', async () => {
    // `Number(null)` fa 0 ed è finito: è il modo in cui questa correzione
    // poteva essere scritta male.
    preparaServer({ stats: { ...STATS, mrrStimato: null } })
    const { container } = await apri()
    const testo = container.textContent
    const iMrr = testo.indexOf('MRR stimato')
    expect(testo.slice(iMrr, iMrr + 40)).not.toMatch(/0 €/)
  })

  it('ma un MRR davvero a zero si scrive «0 €», non «-»', async () => {
    // L'altra metà della regola: se il server dice zero, zero è una notizia.
    preparaServer({ stats: { ...STATS, mrrStimato: 0 } })
    const { container } = await apri()
    const testo = container.textContent
    const iMrr = testo.indexOf('MRR stimato')
    expect(testo.slice(iMrr, iMrr + 40)).toMatch(/0 €/)
  })
})

describe('Quello che non deve mai comparire a schermo', () => {
  it('niente NaN, undefined, [object Object] o Invalid Date', async () => {
    const { container } = await apri()
    const t = container.textContent
    expect(t).not.toMatch(/NaN/)
    expect(t).not.toMatch(/undefined/)
    expect(t).not.toMatch(/\[object Object\]/)
    expect(t).not.toMatch(/Invalid Date/)
  })

  it('nemmeno con un cliente a cui mancano metà dei campi', async () => {
    preparaServer({ clienti: [{ org_id: 'x', nome_attivita: 'Senza Niente' }] })
    const { container } = await apri()
    const t = container.textContent
    expect(t).not.toMatch(/NaN|undefined|\[object Object\]|Invalid Date/)
  })

  it('nemmeno senza nessun cliente', async () => {
    preparaServer({ clienti: [], stats: { totale: 0, paganti: 0, trial: 0, scaduti: 0, mrrStimato: 0, nuoviSettimana: 0 } })
    const { container } = await apri()
    expect(container.textContent).not.toMatch(/NaN|undefined|\[object Object\]/)
  })
})

describe('Quando il server non risponde', () => {
  it('la pagina lo dice, invece di far sembrare che non ci sia nessun cliente', async () => {
    // Una lista vuota e un server morto si leggono uguali, e portano a due
    // conclusioni opposte.
    preparaServer()
    risposte['action=stats'] = new Error('rete non raggiungibile')
    const { container } = await apri()
    await waitFor(() => expect(container.textContent).toMatch(/rete non raggiungibile|errore/i))
  })
})

describe('I comandi che rispondevano solo al mouse', () => {
  it('l\'avviso dei feedback da leggere è un pulsante, non un rettangolo', async () => {
    preparaServer({ 'action=feedback': { feedback: [{ id: 'f1', gestito: false, sentiment: 'bug', messaggio: 'non va', user_email: 'a@b.it' }] } })
    const { container } = await apri()
    // L'inbox si carica all'apertura della pagina: l'avviso compare da solo
    // sull'Overview, che è il primo schermo che il titolare vede.
    await waitFor(() => expect(chiamate.some(c => c.includes('action=feedback'))).toBe(true))
    await waitFor(() => {
      const avviso = perEtichetta(container, /Apri l'inbox dei feedback/)
      expect(avviso, 'l\'avviso dei feedback non si raggiunge con la tastiera').toBeTruthy()
      expect(avviso.tagName).toBe('BUTTON')
    })
  })

  it('la ricerca ⌘K si apre, e il suo velo è un pulsante con un nome', async () => {
    const { container } = await apri()
    act(() => { fireEvent.click(perTesto(container, /Cerca/)) })
    await waitFor(() => {
      const velo = perEtichetta(container, /^Chiudi la ricerca$/)
      expect(velo, 'il velo della ricerca si chiude solo col mouse').toBeTruthy()
      expect(velo.tagName).toBe('BUTTON')
    })
  })

  it('e la ricerca si dichiara una finestra', async () => {
    const { container } = await apri()
    act(() => { fireEvent.click(perTesto(container, /Cerca/)) })
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"][aria-modal="true"]')).toBeTruthy()
    })
  })

  it('premendo il velo la ricerca si chiude', async () => {
    const { container } = await apri()
    act(() => { fireEvent.click(perTesto(container, /Cerca/)) })
    await waitFor(() => expect(perEtichetta(container, /^Chiudi la ricerca$/)).toBeTruthy())
    act(() => { fireEvent.click(perEtichetta(container, /^Chiudi la ricerca$/)) })
    await waitFor(() => expect(perEtichetta(container, /^Chiudi la ricerca$/)).toBeFalsy())
  })

  it('e si chiude anche con Esc', async () => {
    const { container } = await apri()
    act(() => { fireEvent.click(perTesto(container, /Cerca/)) })
    await waitFor(() => expect(perEtichetta(container, /^Chiudi la ricerca$/)).toBeTruthy())
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    await waitFor(() => expect(perEtichetta(container, /^Chiudi la ricerca$/)).toBeFalsy())
  })
})

describe('Le azioni che cancellano davvero', () => {
  it('la pulizia degli account di prova chiede conferma prima', async () => {
    // Qui la domanda del browser è ammessa da CLAUDE.md: la apre il titolare
    // dal computer, non un pasticcere dal telefono. Quello che conta è che
    // **ci sia**, e che dire di no fermi tutto.
    preparaServer({ 'cleanup_e2e_preview': { orgs_count: 3, orgs: [{ emails: ['e2e+1@foodos-e2e.test'] }] } })
    const confermato = vi.fn(() => false); vi.stubGlobal('confirm', confermato)
    const { container } = await apri()
    act(() => { fireEvent.click(perTesto(container, /Pulisci account E2E/)) })
    await waitFor(() => expect(confermato).toHaveBeenCalled())
    expect(confermato.mock.calls[0][0], 'la domanda non dice quanti account cancella').toMatch(/3/)
  })

  it('e dicendo di no non cancella niente', async () => {
    preparaServer({ 'cleanup_e2e_preview': { orgs_count: 3, orgs: [{ emails: ['e2e+1@foodos-e2e.test'] }] } })
    vi.stubGlobal('confirm', vi.fn(() => false))
    const { container } = await apri()
    act(() => { fireEvent.click(perTesto(container, /Pulisci account E2E/)) })
    await waitFor(() => expect(chiamate.some(c => c.includes('cleanup_e2e_preview'))).toBe(true))
    await new Promise(r => setTimeout(r, 50))
    expect(chiamate.filter(c => /cleanup_e2e(?!_preview)/.test(c)), 'ha cancellato dopo un «no»').toEqual([])
  })

  it('la domanda elenca le email, così si vede se ce n\'è una vera', async () => {
    // Correzione del 14/06/2026: prima diceva solo «cancello 40 account».
    // Una mail di un cliente vero in quella lista è l'unico modo di
    // accorgersi che il filtro ha preso troppo.
    preparaServer({ 'cleanup_e2e_preview': { orgs_count: 2, orgs: [{ emails: ['e2e+1@foodos-e2e.test'] }, { emails: ['e2e+2@foodos-e2e.test'] }] } })
    const confermato = vi.fn(() => false); vi.stubGlobal('confirm', confermato)
    const { container } = await apri()
    act(() => { fireEvent.click(perTesto(container, /Pulisci account E2E/)) })
    await waitFor(() => expect(confermato).toHaveBeenCalled())
    expect(confermato.mock.calls[0][0]).toMatch(/e2e\+1@foodos-e2e\.test/)
  })

  it('e se non ce n\'è nessuno non chiede niente', async () => {
    preparaServer({ 'cleanup_e2e_preview': { orgs_count: 0, orgs: [] } })
    const confermato = vi.fn(() => true); vi.stubGlobal('confirm', confermato)
    const { container } = await apri()
    act(() => { fireEvent.click(perTesto(container, /Pulisci account E2E/)) })
    await waitFor(() => expect(chiamate.some(c => c.includes('cleanup_e2e_preview'))).toBe(true))
    await new Promise(r => setTimeout(r, 50))
    expect(confermato, 'chiede conferma per cancellare zero account').not.toHaveBeenCalled()
  })
})

describe('Il righello di questo file', () => {
  it('la pagina si disegna davvero: il cliente è a schermo', async () => {
    const { container } = await apri()
    expect(container.textContent).toMatch(/Foodos Admin/)
    expect(bottoni(container).length, 'nessun comando a schermo').toBeGreaterThan(5)
  })

  it('e le prove leggono il finto server, non una pagina ferma', async () => {
    await apri()
    expect(chiamate.some(c => c.includes('action=stats')), 'il pannello non ha chiesto niente al server').toBe(true)
  })
})
