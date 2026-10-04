// @vitest-environment happy-dom
//
// ── «Di che cosa sono queste spese?» ────────────────────────────────────
//
// 03/10/2026. Il conto economico di Mara diceva utile 82% perché le fatture
// dei fornitori non entravano nel conto. Il motore nuovo le porta dentro per
// voce di spesa, ma la voce sta sul fornitore, e dei 315 fornitori veri
// nessuno ce l'ha: finché non la si mette, tutto è «da classificare».
//
// Questa schermata la fa mettere una volta per fornitore. Le cose che queste
// prove tengono ferme:
//   • i fornitori dal più pesante negli ultimi 12 mesi, con la proposta già
//     scelta; solo quelle sicure partono spuntate;
//   • si salva prima nell'archivio, e lo schermo cambia solo per quello che
//     l'archivio ha accettato; un doppio tocco non scrive due volte;
//   • una lettura dei fornitori che non riesce mostra l'errore, non un elenco
//     di «senza voce» che riproporrebbe tutto;
//   • la fattura GECKO da 86.651 € si segna come investimento da sola; senza
//     la colonna nuova (migration 20261003b non applicata) la schermata lo
//     dice e non finge di salvare;
//   • al telefono la stessa schermata, in colonna.
//
// Audit del design del 04/10/2026 (CS1, il sesto difetto più grave della
// nuova Analisi): le fatture fuori scala stavano in cima alla pagina con 3
// tendine e 3 «Salva» sempre aperti; senza la colonna nuova erano tutti spenti,
// con un avviso giallo che lo diceva: 323 px al computer e 745 al telefono di
// comandi che non funzionavano, prima dell'elenco che funziona. E i «Salva»
// spenti erano bordeaux al 55%, cioè rosa: da lontano sembravano accesi. Ora le
// fatture fuori scala sono una riga; senza la colonna non c'è nessun comando,
// con la colonna i comandi si aprono a richiesta; lo spento è grigio.
//
// Stesso audit (CS2): le due liste della pagina avevano due griglie diverse
// (`minmax(0,1fr) 130px 230px auto` e `40px minmax(0,1fr) 150px 230px`):
// importi e tendine sfasati di 84 px, e la GECKO da 86.651 €, che sta in tutte
// e due, compariva in due colonne diverse una sotto l'altra. Ora la griglia è
// una sola; il «Salva» della fattura sta sotto la sua tendina.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: () => { throw new Error('client vero usato in una prova') } } }))

import ClassificaSpese, { fornitoriDaFatture } from '../../src/components/analisi/ClassificaSpese'
import { color as T } from '../../src/lib/theme'

afterEach(() => cleanup())

const ORG = 'org1'
const OGGI = new Date('2026-10-03T10:00:00')

function fintoDb({ fatture = [], fornitori = [], colonneMancanti = [], fallisci = null, lento = false } = {}) {
  const tabelle = { fatture, fornitori }
  const log = []
  const errColonna = (c) => ({ message: `Could not find the '${c}' column of 'fatture' in the schema cache` })
  const from = (tabella) => {
    const st = { tabella, filtri: [], op: 'select', colonne: '', patch: null, righe: null, range: null }
    const q = {
      select(c) { if (st.op !== 'insert') st.colonne = c; return q },
      update(p) { st.op = 'update'; st.patch = p; return q },
      insert(r) { st.op = 'insert'; st.righe = r; return q },
      eq(k, v) { st.filtri.push(['eq', k, v]); return q },
      in(k, v) { st.filtri.push(['in', k, v]); return q },
      gte() { return q }, lte() { return q }, order() { return q },
      range(a, b) { st.range = [a, b]; return q },
      then(ok, ko) {
        const p = lento ? new Promise(r => setTimeout(r, 20)).then(() => esegui(st)) : Promise.resolve(esegui(st))
        return p.then(ok, ko)
      },
    }
    return q
  }
  const passa = (r, filtri) => filtri.every(([op, k, v]) => (op === 'eq' ? r[k] === v : v.includes(r[k])))
  function esegui(st) {
    log.push({ ...st })
    if (fallisci && fallisci(st)) return { data: null, error: { message: 'rete assente' } }
    const dati = tabelle[st.tabella]
    if (st.op === 'select') {
      const m = colonneMancanti.find(c => st.colonne.includes(c))
      if (m) return { data: null, error: errColonna(m) }
      const tutte = dati.filter(r => passa(r, st.filtri))
      return { data: st.range ? tutte.slice(st.range[0], st.range[1] + 1) : tutte, error: null }
    }
    if (st.op === 'update') {
      const m = colonneMancanti.find(c => c in st.patch)
      if (m) return { data: null, error: errColonna(m) }
      for (const r of dati.filter(x => passa(x, st.filtri))) Object.assign(r, st.patch)
      return { data: null, error: null }
    }
    const nuove = st.righe.map((r, i) => ({ id: `n${i}`, ...r }))
    dati.push(...nuove)
    return { data: nuove, error: null }
  }
  return { client: { from }, log, tabelle }
}

let n = 0
const fattura = (fornitore, data, totale, extra = {}) => ({
  id: `f${++n}`, organization_id: ORG, fornitore, data_fattura: data, totale, imponibile: 0, imposta: 0,
  tipo: 'fattura', sede_id: 's1', sedi_condivise: null, numero_rif: String(n), categoria_spesa: null, ...extra,
})

const datiMara = () => ({
  fornitori: [
    { id: 'desa', organization_id: ORG, nome: 'DESA SRL', partita_iva: null, categoria: null },
    { id: 'enel', organization_id: ORG, nome: 'Enel Energia S.p.A.', partita_iva: null, categoria: null },
    { id: 'cono', organization_id: ORG, nome: 'CONO ARTIC COMMERCIALE SRL', partita_iva: null, categoria: null },
    { id: 'gecko', organization_id: ORG, nome: 'GECKO CIOCCOLATI E GELATI TORINO SRL', partita_iva: null, categoria: null },
    { id: 'comm', organization_id: ORG, nome: 'COMMERCIALISTIINTORINO S.S. STP', partita_iva: null, categoria: 'Servizi' },
    { id: 'edil', organization_id: ORG, nome: 'Costruzioni Europa s.r.l.', partita_iva: null, categoria: null },
  ],
  fatture: [
    fattura('DESA SRL', '2026-06-01', 16365),
    fattura('DESA SRL', '2026-07-01', 7305),
    fattura('Enel Energia S.p.A.', '2026-07-12', 2303),
    fattura('CONO ARTIC COMMERCIALE SRL', '2025-06-01', 12000),
    fattura('CONO ARTIC COMMERCIALE SRL', '2025-07-01', 14000),
    fattura('CONO ARTIC COMMERCIALE SRL', '2026-08-01', 15790),
    fattura('GECKO CIOCCOLATI E GELATI TORINO SRL', '2025-01-08', 3200),
    fattura('GECKO CIOCCOLATI E GELATI TORINO SRL', '2025-03-08', 2002),
    fattura('GECKO CIOCCOLATI E GELATI TORINO SRL', '2026-07-10', 86651, { id: 'fgecko', numero_rif: '6' }),
    fattura('COMMERCIALISTIINTORINO S.S. STP', '2026-07-15', 1065),
    fattura('Costruzioni Europa s.r.l.', '2023-07-25', 330),
  ],
})

const monta = (db, extra = {}) => {
  const notify = vi.fn()
  const onSalvato = vi.fn()
  const r = render(<ClassificaSpese orgId={ORG} client={db.client} oggi={OGGI} notify={notify} onSalvato={onSalvato} {...extra} />)
  return { ...r, notify, onSalvato }
}
const lista = () => screen.getByRole('list', { name: 'Fornitori senza voce' })
const righe = () => within(lista()).getAllByRole('listitem')

describe('ClassificaSpese: i fornitori senza voce', () => {
  it('dal più pesante, con la proposta già scelta; spuntate solo quelle sicure', async () => {
    const db = fintoDb(datiMara())
    monta(db)
    await screen.findByRole('list', { name: 'Fornitori senza voce' })
    const nomi = righe().map(li => li.textContent)
    // GECKO 86.651 €, DESA 23.670 €, CONO ARTIC 15.790 €, Enel 2.303 €, Costruzioni (niente in 12 mesi)
    expect(nomi[0]).toMatch(/GECKO/)
    expect(nomi[1]).toMatch(/DESA/)
    expect(nomi[2]).toMatch(/CONO ARTIC/)
    expect(nomi[3]).toMatch(/Enel/)
    expect(nomi[4]).toMatch(/Costruzioni Europa.*nessuna in 12 mesi/)
    expect(screen.getByRole('combobox', { name: 'Voce di spesa di Enel Energia S.p.A.' }).value).toBe('utenze')
    expect(screen.getByRole('checkbox', { name: 'Conferma la voce di Enel Energia S.p.A.' }).checked).toBe(true)
    // nessuna proposta: niente voce e niente spunta
    expect(screen.getByRole('combobox', { name: 'Voce di spesa di DESA SRL' }).value).toBe('')
    expect(screen.getByRole('checkbox', { name: 'Conferma la voce di DESA SRL' }).checked).toBe(false)
    expect(within(righe()[1]).getByText('Nessuna proposta: scegli tu')).toBeTruthy()
    // proposta «media» (lavori: forse un investimento): scelta ma non spuntata
    expect(screen.getByRole('combobox', { name: 'Voce di spesa di Costruzioni Europa s.r.l.' }).value).toBe('attrezzature')
    expect(screen.getByRole('checkbox', { name: 'Conferma la voce di Costruzioni Europa s.r.l.' }).checked).toBe(false)
    expect(screen.getByText(/Proposta da controllare/)).toBeTruthy()
  })

  it('la copertura in cima dice quanti hanno la voce e quanta spesa manca', async () => {
    monta(fintoDb(datiMara()))
    await screen.findByRole('list', { name: 'Fornitori senza voce' })
    const cop = screen.getByRole('region', { name: 'Da dove vengono i numeri' })
    expect(cop.textContent).toMatch(/1 fornitori su 6 hanno la voce/)
    // 86.651 + 23.670 + 15.790 + 2.303 senza voce; + 1.065 del commercialista
    expect(cop.textContent).toMatch(/128\.414 € su 129\.479 € spesi negli ultimi 12 mesi sono senza voce/)
    expect(cop.textContent).toMatch(/solo il totale con l'IVA/)
  })

  it('salva le voci spuntate: prima nell\'archivio, poi lo schermo', async () => {
    const db = fintoDb(datiMara())
    const { notify, onSalvato } = monta(db)
    await screen.findByRole('list', { name: 'Fornitori senza voce' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Voce di spesa di DESA SRL' }), { target: { value: 'materie-prime' } })
    expect(screen.getByRole('checkbox', { name: 'Conferma la voce di DESA SRL' }).checked).toBe(true)
    // GECKO (proposta alta: materie prime), DESA, CONO ARTIC, Enel
    fireEvent.click(screen.getByRole('button', { name: 'Salva 4 voci' }))
    await waitFor(() => expect(onSalvato).toHaveBeenCalledTimes(1))
    const per = (id) => db.tabelle.fornitori.find(f => f.id === id).categoria
    expect(per('desa')).toBe('Materie prime')
    expect(per('enel')).toBe('Utenze')
    expect(per('cono')).toBe('Confezionamento')
    expect(per('edil')).toBeNull()                       // non spuntata: non si scrive
    expect(notify).toHaveBeenCalledWith('4 fornitori messi nella sua voce.')
    // e adesso restano solo i lavori da decidere
    expect(righe()).toHaveLength(1)
    expect(screen.getByText('5 fornitori hanno già la voce')).toBeTruthy()
  })

  it('un doppio tocco scrive una volta sola', async () => {
    const db = fintoDb({ ...datiMara(), lento: true })
    const { onSalvato } = monta(db)
    await screen.findByRole('list', { name: 'Fornitori senza voce' }, { timeout: 2000 })
    const b = screen.getByRole('button', { name: /^Salva \d+ voci$/ })
    // I due tocchi nello stesso giro, prima che React ridisegni il pulsante
    // spento: è quello che succede col dito, e che `fireEvent` da solo non
    // fa (ridisegna dopo ogni evento, e il secondo tocco trova il pulsante
    // già spento). Senza la guardia col ref, qui partivano due salvataggi.
    act(() => { b.click(); b.click() })
    await waitFor(() => expect(onSalvato).toHaveBeenCalled(), { timeout: 2000 })
    await new Promise(r => setTimeout(r, 80))
    expect(onSalvato).toHaveBeenCalledTimes(1)
    // una richiesta per voce: materie prime (GECKO), confezionamento, utenze
    expect(db.log.filter(l => l.op === 'update')).toHaveLength(3)
  })

  it('se il salvataggio non riesce, lo schermo resta com\'era e lo dice', async () => {
    const db = fintoDb({ ...datiMara(), fallisci: (st) => st.op === 'update' })
    const { notify, onSalvato } = monta(db)
    await screen.findByRole('list', { name: 'Fornitori senza voce' })
    fireEvent.click(screen.getByRole('button', { name: /^Salva \d+ voci$/ }))
    await waitFor(() => expect(notify).toHaveBeenCalled())
    expect(notify.mock.calls[0][1]).toBe(false)
    expect(notify.mock.calls[0][0]).toMatch(/rete assente/)
    expect(onSalvato).not.toHaveBeenCalled()
    expect(righe()).toHaveLength(5)
  })

  it('una lettura dei fornitori che non riesce mostra l\'errore, non un elenco da rifare', async () => {
    const db = fintoDb({ ...datiMara(), fallisci: (st) => st.tabella === 'fornitori' })
    monta(db)
    const errore = await screen.findByRole('alert')
    expect(errore.textContent).toMatch(/Non riesco a leggere/)
    expect(screen.queryByRole('list', { name: 'Fornitori senza voce' })).toBeNull()
  })

  it('i fornitori già con la voce si possono cambiare', async () => {
    const db = fintoDb(datiMara())
    monta(db)
    await screen.findByRole('list', { name: 'Fornitori senza voce' })
    fireEvent.click(screen.getByRole('button', { name: 'Mostra e cambia' }))
    const sel = screen.getByRole('combobox', { name: 'Voce di spesa di COMMERCIALISTIINTORINO S.S. STP' })
    expect(sel.value).toBe('servizi')
    expect(screen.getByRole('checkbox', { name: 'Conferma la voce di COMMERCIALISTIINTORINO S.S. STP' }).checked).toBe(false)
    fireEvent.change(sel, { target: { value: 'fuori-conto' } })
    expect(screen.getByRole('checkbox', { name: 'Conferma la voce di COMMERCIALISTIINTORINO S.S. STP' }).checked).toBe(true)
  })
})

describe('ClassificaSpese: le fatture fuori misura', () => {
  it('la fattura GECKO si segna come investimento, da sola', async () => {
    const db = fintoDb(datiMara())
    const { notify, onSalvato } = monta(db)
    await screen.findByText(/Una fattura vale 33 volte le altre di GECKO CIOCCOLATI E GELATI TORINO/)
    // I comandi stanno dietro un tocco (audit 04/10, CS1).
    fireEvent.click(screen.getByRole('button', { name: 'Guarda e decidi' }))
    const voce = screen.getByRole('combobox', { name: 'Voce della fattura 6 di GECKO CIOCCOLATI E GELATI TORINO SRL' })
    expect(voce.value).toBe('attrezzature')
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(onSalvato).toHaveBeenCalled())
    expect(db.tabelle.fatture.find(f => f.id === 'fgecko').categoria_spesa).toBe('attrezzature')
    expect(notify.mock.calls[0][0]).toMatch(/attrezzature e lavori/)
    expect(screen.queryByText(/Una fattura vale/)).toBeNull()
  })

  // Prima questa prova voleva la tendina e il «Salva» presenti e spenti: era
  // proprio il difetto CS1 dell'audit del 04/10. Ora senza la colonna non
  // c'è nessun comando, solo la riga che dice cosa succederà.
  it('senza la colonna nuova lo dice in una riga, senza comandi spenti', async () => {
    const db = fintoDb({ ...datiMara(), colonneMancanti: ['categoria_spesa'] })
    monta(db)
    const riga = await screen.findByText(/Una fattura vale 33 volte le altre di GECKO/)
    expect(riga.textContent).toMatch(/86\.651\u00a0€ il 10\/07\/2026\): potrai segnarla come investimento con il prossimo aggiornamento di Foodos/)
    expect(screen.queryByRole('combobox', { name: /Voce della fattura/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Guarda e decidi' })).toBeNull()
    expect([...document.querySelectorAll('select:disabled')]).toEqual([])
  })

  it('con la colonna, i comandi stanno chiusi finché non li chiedi', async () => {
    monta(fintoDb(datiMara()))
    await screen.findByText(/Una fattura vale 33 volte/)
    expect(screen.queryByRole('combobox', { name: /Voce della fattura/ })).toBeNull()
    const apri = screen.getByRole('button', { name: 'Guarda e decidi' })
    expect(apri.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(apri)
    expect(screen.getByRole('button', { name: 'Chiudi' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('combobox', { name: /Voce della fattura 6/ }).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    expect(screen.queryByRole('combobox', { name: /Voce della fattura/ })).toBeNull()
  })

  it('più fatture fuori scala: una riga sola, con la più grande', async () => {
    const d = datiMara()
    d.fatture.push(
      fattura('Enel Energia S.p.A.', '2025-12-12', 2100), fattura('Enel Energia S.p.A.', '2026-01-12', 2200),
      fattura('Enel Energia S.p.A.', '2026-02-12', 2000), fattura('Enel Energia S.p.A.', '2026-08-12', 41000),
    )
    monta(fintoDb({ ...d, colonneMancanti: ['categoria_spesa'] }))
    const riga = await screen.findByText(/fatture molto più grandi del solito/)
    expect(riga.textContent).toMatch(/^\d+ fatture molto più grandi del solito, la più grande di GECKO CIOCCOLATI E GELATI TORINO \(86\.651\u00a0€/)
    expect(riga.textContent).toMatch(/potrai segnarle come investimento/)
  })
})

describe('ClassificaSpese: le due liste sulla stessa griglia (audit 04/10, CS2)', () => {
  it('importi e tendine delle fatture fuori scala cadono sotto quelli dei fornitori', async () => {
    monta(fintoDb(datiMara()))
    await screen.findByText(/Una fattura vale 33 volte/)
    fireEvent.click(screen.getByRole('button', { name: 'Guarda e decidi' }))
    const fattura = within(screen.getByRole('list', { name: 'Fatture fuori scala' })).getAllByRole('listitem')[0]
    const fornitore = righe()[0]
    expect(fattura.style.gridTemplateColumns).toBe(fornitore.style.gridTemplateColumns)
    expect(fattura.style.columnGap || fattura.style.gap).toBe(fornitore.style.columnGap || fornitore.style.gap)
    // Quattro celle in tutte e due: casella (o il suo posto vuoto), nome, importo, tendina.
    expect(fattura.children).toHaveLength(4)
    expect(fornitore.children).toHaveLength(4)
    expect(fattura.children[2].textContent).toBe('86.651 €')
    expect(within(fattura.children[3]).getByRole('combobox')).toBeTruthy()
    expect(within(fattura.children[3]).getByRole('button', { name: 'Salva' })).toBeTruthy()
  })
})

describe('ClassificaSpese: un pulsante spento si vede spento (audit 04/10, CS1)', () => {
  it('grigio, non bordeaux sbiadito', async () => {
    const db = fintoDb({
      fornitori: [{ id: 'v', organization_id: ORG, nome: 'Vecchio Enrico', partita_iva: null, categoria: null }],
      fatture: [fattura('Vecchio Enrico', '2026-07-01', 3200)],
    })
    monta(db)
    const b = await screen.findByRole('button', { name: 'Niente da salvare' })
    expect(b.disabled).toBe(true)
    expect(b.style.background).not.toBe(T.brand)
    expect(b.style.opacity).toBe('')
    expect(b.style.color).toBe(T.textFaint)
  })
})

describe('ClassificaSpese: al telefono', () => {
  it('stesse righe in colonna, la voce sotto il nome', async () => {
    monta(fintoDb(datiMara()), { isMobile: true })
    await screen.findByRole('list', { name: 'Fornitori senza voce' })
    const enel = righe().find(li => /Enel/.test(li.textContent))
    expect(enel.style.display).not.toBe('grid')
    expect(within(enel).getByRole('combobox')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Salva \d+ voci$/ })).toBeTruthy()
  })
})

describe('fornitoriDaFatture', () => {
  it('una ditta scritta in due modi è un fornitore, con la spesa sommata', () => {
    const g = fornitoriDaFatture([
      fattura('DESA SRL', '2026-06-01', 100),
      fattura('DESA S.r.l.', '2026-07-01', 50),
      fattura('DESA SRL', '2024-07-01', 1000),
    ], { fornitori: [{ id: 'd', nome: 'DESA SRL' }], dal12: '2025-10-03' })
    expect(g).toHaveLength(1)
    expect(g[0]).toMatchObject({ nome: 'DESA SRL', spesa12: 150, nFatture12: 2, spesaTotale: 1150, nFatture: 3, ultima: '2026-07-01' })
  })
})
