// @vitest-environment happy-dom
//
// ── La pagina Previsioni rifatta: «Cosa preparo domani?» ────────────────
//
// Audit del 03/10/2026, voto 15/100. La pagina di prima, aperta da Mara dei
// Boschi il 03/10:
//
// - scriveva «Oggi», «Domani» con i volumi di maggio-agosto: l'ultimo
//   inventario era del 31/08, 33 giorni prima, e non lo diceva da nessuna
//   parte (e chiamava «Set '26» il mese previsto, a ottobre);
// - per decidere cosa produrre bisognava leggere 15 schede × 5 riquadri, in
//   ordine alfabetico, con «≈ 3 stampi» per ogni gusto e ogni giorno anche
//   dove la produzione vera era zero;
// - scriveva «0% Sovrapproduzione» su tutti i gusti perché le chiusure di
//   cassa non ci sono, e nascondeva il 28% dei kg (nomi diversi dalla ricetta);
// - parlava di «Holt», «sell-through», «stampi» a una gelateria.
//
// La pagina nuova (`src/views/PrevisioniView.jsx`) usa `lib/previsioneVenduto`
// e risponde a una domanda sola, con una tabella in ordine di urgenza. Questi
// test la rendono davvero e leggono quello che comparirebbe a schermo: con i
// dati vecchi non prevede e lo dice; con i dati di ieri mette in cima il gusto
// che finisce prima; parla la lingua del banco.
//
// Audit del design del 04/10/2026 (PR3, PR4, C5): la tabella scriveva 40
// intervalli a parole («fra 3,8 e 9,9 kg») che non si incolonnavano, e per
// sapere se la vetrina bastava bisognava confrontare a mente tre numeri per
// riga; «ieri sera» era scritto sotto ogni quantità in vetrina. Ora è la
// tabella comune dell'Analisi (TabellaAnalisi, «kg» nell'intestazione), ogni
// previsione è anche una barra d'intervallo su una scala comune in kg, e
// nella colonna del giorno che la vetrina deve coprire c'è la tacca di
// quello che c'è in vetrina: tacca a sinistra della banda, il gusto finisce.
// Perché la barra e non i dieci pallini della ricerca: è scritto nel diario
// dell'agente pagine (la libreria dà un intervallo dagli errori veri; i giorni
// «simili» sono un metodo che la libreria ha provato e scartato).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const finto = vi.hoisted(() => ({ righe: {}, chiamate: [], errore: null, regole: null }))

vi.mock('../../src/lib/inventarioProduzione', async (originale) => ({
  ...(await originale()),
  caricaRigheInventario: vi.fn(async (orgId, sedeId) => {
    finto.chiamate.push(sedeId)
    if (finto.errore) throw finto.errore
    return finto.righe[sedeId] || []
  }),
}))
vi.mock('../../src/lib/giorniChiusura', async (originale) => ({
  ...(await originale()),
  caricaRegoleChiusura: vi.fn(async () => finto.regole || { ricorrenti: [], periodi: [] }),
}))

import PrevisioniView, { kgTesto, intervalloTesto, giornoRelativo, giornoAssoluto, quandoRifare, erroreTesto } from '../../src/views/PrevisioniView'
import { piuGiorni } from '../../src/lib/previsioneVenduto'

// ── Una gelateria finta, come nei test della libreria ───────────────────
function riga(gusto, data, { prod = 0, riman = 0 } = {}) {
  return { gusto_nome: gusto, data, produzione_g: Math.round(prod * 1000), rimanenza_g: Math.round(riman * 1000), scarto_g: 0, spedito_g: 0, ricevuto_g: 0 }
}
function simula({ gusto, fine, giorni = 60, vendite, lotto = 8, soglia = 5, scorta = 6, casellaVuota = false }) {
  const out = []
  let s = scorta
  const inizio = piuGiorni(fine, -(giorni - 1))
  for (let i = 0; i < giorni; i++) {
    const d = piuGiorni(inizio, i)
    const prod = s < soglia ? lotto : 0
    const v = Math.min(vendite, s + prod)
    s = s + prod - v
    out.push(riga(gusto, d, { prod, riman: casellaVuota && prod > 0 ? 0 : s }))
  }
  return out
}
// Ogni giorno si rifà quello che si vende; l'ultima sera in vetrina resta `ultima`.
function fisso(gusto, fine, vendite, ultima, giorni = 40) {
  return Array.from({ length: giorni }, (_, i) => {
    const d = piuGiorni(fine, -(giorni - 1 - i))
    return d === fine ? riga(gusto, d, { prod: vendite + ultima - 6, riman: ultima }) : riga(gusto, d, { prod: vendite, riman: 6 })
  })
}

const OGGI = '2026-10-03'
const IERI = '2026-10-02'
const CARLINA = { id: 'carlina', nome: 'Carlina', attiva: true }
const DEGASPERI = { id: 'degasperi', nome: 'De Gasperi', attiva: true }

function rendi(props = {}) {
  const onNavigate = vi.fn()
  render(<PrevisioniView orgId="org-mara" sedeId="carlina" sedi={[CARLINA, DEGASPERI]} sedeAttiva={CARLINA}
    tipoAttivita="gelateria" onNavigate={onNavigate} oggi={OGGI} {...props} />)
  return { onNavigate }
}
const testo = () => document.body.textContent

beforeEach(() => {
  finto.righe = {}
  finto.chiamate = []
  finto.errore = null
  finto.regole = null
  window.innerWidth = 1280
})
afterEach(() => cleanup())

// ── 1. Il caso di Mara il 03/10: dati fermi al 31/08 ────────────────────

describe('riproduce il difetto: dati di 33 giorni presentati come «Oggi»', () => {
  beforeEach(() => {
    finto.righe.carlina = [
      ...simula({ gusto: 'FONDENTE', fine: '2026-08-31', vendite: 6, lotto: 13, soglia: 7, scorta: 8 }),
      ...simula({ gusto: 'AMOR FOU', fine: '2026-08-31', vendite: 2, lotto: 5, soglia: 3, scorta: 4 }),
      riga('ABIS', '2026-09-15', { prod: 0, riman: 0 }),   // la riga tutta a zero di settembre
    ]
  })

  it('non prevede, e dice da quando è fermo l’inventario', async () => {
    rendi()
    await waitFor(() => expect(testo()).toContain('fermo al 31/08'))
    expect(testo()).toContain('non posso dirti cosa preparare')
    expect(testo()).toContain('33 giorni')
    expect(screen.queryByRole('table')).toBeNull()
    expect(testo()).not.toMatch(/\bOggi\b/)
  })

  it('il pulsante porta all’inventario', async () => {
    const { onNavigate } = rendi()
    await waitFor(() => expect(testo()).toContain('fermo al 31/08'))
    fireEvent.click(screen.getAllByRole('button', { name: /Registra l’inventario/ })[0])
    expect(onNavigate).toHaveBeenCalledWith('inventario-gusti')
  })

  it('a richiesta mostra l’ultima previsione possibile, dichiarando che non vale per oggi', async () => {
    rendi()
    const bottone = await screen.findByRole('button', { name: /ultima previsione possibile \(01\/09\)/ })
    fireEvent.click(bottone)
    await waitFor(() => expect(testo()).toContain('Non vale per oggi'))
    expect(testo()).toContain('fatta con i dati fino al 31/08')
    const tabella = screen.getByRole('table')
    expect(within(tabella).getByText('FONDENTE')).toBeTruthy()
    expect(within(tabella).getByText('AMOR FOU')).toBeTruthy()
    // Nella previsione di un giorno passato niente «oggi» e «domani»: chi legge
    // è al 03/10, e «oggi sera» vorrebbe dire un’altra cosa. Si scrivono le date.
    expect(within(tabella).getAllByRole('columnheader').map(h => h.textContent)).toContain('Si venderà mar 01/09, kg')
    // La conta della vetrina si dice una volta, sopra la tabella (PR4).
    expect(testo()).toContain('lun 31/08 sera')
    expect(tabella.textContent).not.toMatch(/oggi sera|\bdomani\b/)
  })
})

// ── 2. Con i dati di ieri: una tabella, in ordine di urgenza ────────────

describe('con l’inventario di ieri sera', () => {
  beforeEach(() => {
    finto.righe.carlina = [
      ...fisso('MANGO', IERI, 1, 50),
      ...fisso('AMOR FOU', IERI, 4, 10),
      ...fisso('CREMA', IERI, 4, 2),
      ...fisso('PESCA', IERI, 4, 20),   // finisce il 07/10: si rifà il 06, non è per domani
    ]
  })

  it('mette in cima chi finisce prima, con il giorno in cui rifarlo', async () => {
    rendi()
    const tabella = await screen.findByRole('table')
    const righe = within(tabella).getAllByRole('row').slice(1)
    expect(righe.map(r => within(r).getByRole('rowheader').textContent)).toEqual(['CREMA', 'AMOR FOU', 'PESCA', 'MANGO'])
    // CREMA: 2 kg in vetrina ieri sera, ne vende 4 → finisce oggi, da rifare subito
    // (dal 04/10 sera «kg» sta nell'intestazione della colonna, non nella cella)
    expect(within(righe[0]).getAllByRole('cell')[0].textContent).toBe('2')
    expect(righe[0].textContent).toContain('oggi')
    expect(righe[0].textContent).toContain('subito')
    // AMOR FOU: 10 kg, ne vende 4 → finisce dopodomani (lunedì 05/10)... da rifare domani
    expect(righe[1].textContent).toMatch(/domani/)
    // PESCA: 20 kg, ne vende 4 → finisce mercoledì 07/10, da rifare martedì
    expect(righe[2].textContent).toContain('mer 07/10')
    expect(righe[2].textContent).toContain('mar 06/10')
    // MANGO: 50 kg a 1 al giorno
    expect(righe[3].textContent).toContain('fra più di 2 settimane')
  })

  it('con i dati di ieri sera, sul computer, accanto a domani c’è anche oggi', async () => {
    rendi()
    const tabella = await screen.findByRole('table')
    const intestazioni = within(tabella).getAllByRole('columnheader').map(h => h.textContent)
    // Dal 04/10 sera l'unità sta nell'intestazione (tabella comune).
    expect(intestazioni).toEqual(['Gusto', 'In vetrina, kg', 'Si venderà oggi, kg', 'Si venderà domani, kg', 'Finisce', 'Da rifare', 'Di solito sbaglio'])
  })

  it('niente rosso: in una gelateria «finisce oggi» è la normalità, non un allarme', async () => {
    rendi()
    await screen.findByRole('table')
    const html = document.body.innerHTML.toLowerCase()
    for (const rosso of ['#dc2626', '#b91c1c', 'rgb(220, 38, 38)', 'rgb(185, 28, 28)']) expect(html).not.toContain(rosso)
  })

  it('il titolo dice la conclusione, e le tessere rispondono alla domanda', async () => {
    rendi()
    await screen.findByRole('table')
    expect(testo()).toContain('Da rifare per primi: CREMA e AMOR FOU')
    expect(testo()).toMatch(/Da rifare entro domani/i)
    expect(testo()).toContain('2 gusti')
    expect(testo()).toMatch(/Si venderà domani, in tutto/i)
    expect(testo()).toContain('stimato')
  })

  it('i numeri sono un intervallo in kg, e c’è l’errore passato scritto in chiaro', async () => {
    rendi()
    await screen.findByRole('table')
    expect(testo()).toMatch(/(fra [\d,.]+ e [\d,.]+ kg|circa [\d,.]+ kg)/)
    expect(testo()).toMatch(/±\d+%/)
    expect(testo()).toContain('Di solito sbaglio')
  })

  it('la copertura in cima dice fin quando arrivano i dati', async () => {
    rendi()
    await screen.findByRole('table')
    expect(testo()).toContain('Inventario di Carlina fino a ieri (02/10)')
    expect(testo()).toContain('senza meteo né festività')
  })

  it('parla la lingua del banco: niente Holt, sell-through, stampi, sovrapproduzione', async () => {
    rendi()
    await screen.findByRole('table')
    expect(testo()).not.toMatch(/Holt|sell-through|stamp|Sovrapproduzione|smoothing/i)
  })

  it('un gusto senza ricetta col suo nome si vede col nome dell’inventario', async () => {
    rendi()
    const tabella = await screen.findByRole('table')
    expect(within(tabella).getByText('AMOR FOU')).toBeTruthy()
  })
})

describe('quello che c’è intorno', () => {
  it('senza inventario dice che non c’è, non zero', async () => {
    rendi()
    await waitFor(() => expect(testo()).toContain('non c’è ancora un inventario'))
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('se la lettura fallisce lo dice', async () => {
    finto.errore = new Error('rete')
    rendi()
    await waitFor(() => expect(testo()).toContain('Non sono riuscito a leggere l’inventario'))
  })

  it('con le caselle a zero nel giorno di produzione lo dichiara nella copertura', async () => {
    finto.righe.carlina = simula({ gusto: 'FONDENTE', fine: IERI, vendite: 6, lotto: 13, soglia: 7, scorta: 8, casellaVuota: true })
    rendi()
    await screen.findByRole('table')
    expect(testo()).toMatch(/Rimanenza a zero nel giorno di produzione: \d+ righe su 28/)
  })

  it('a una pasticceria parla di prodotti, non di gusti', async () => {
    finto.righe.carlina = fisso('SACHER', IERI, 4, 10)
    rendi({ tipoAttivita: 'pasticceria' })
    const tabella = await screen.findByRole('table')
    expect(within(tabella).getByRole('columnheader', { name: 'Prodotto' })).toBeTruthy()
    rendi()
    expect(await screen.findAllByRole('columnheader', { name: 'Gusto' })).toHaveLength(1)
  })

  it('in «Tutte le sedi» si sceglie la sede dentro la pagina', async () => {
    finto.righe.carlina = fisso('CREMA', IERI, 4, 2)
    finto.righe.degasperi = fisso('PESCA', IERI, 3, 9)
    rendi({ sedeId: null, sedeAttiva: { _all: true } })
    await screen.findByRole('table')
    expect(finto.chiamate[0]).toBe('carlina')
    fireEvent.click(screen.getByRole('button', { name: 'De Gasperi' }))
    await waitFor(() => expect(within(screen.getByRole('table')).getByText('PESCA')).toBeTruthy())
    expect(finto.chiamate).toContain('degasperi')
    expect(testo()).toContain('De Gasperi · ')
  })

  it('con una sede scelta dal selettore in alto non mostra un secondo selettore', async () => {
    finto.righe.carlina = fisso('CREMA', IERI, 4, 2)
    rendi()
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'De Gasperi' })).toBeNull()
  })

  it('a 420 px la tabella scorre nel suo riquadro e tiene le colonne che servono', async () => {
    window.innerWidth = 420
    finto.righe.carlina = fisso('CREMA', IERI, 4, 2)
    rendi()
    const tabella = await screen.findByRole('table')
    expect(tabella.parentElement.style.overflowX).toBe('auto')
    const intestazioni = within(tabella).getAllByRole('columnheader').map(h => h.textContent)
    // Al telefono l'intestazione è corta, perché le tre colonne stiano nei
    // 356 px del riquadro senza scorrere (04/10 sera).
    expect(intestazioni).toEqual(['Gusto', 'Domani, kg', 'Da rifare'])
    // Il riquadro a 420 px: 420 − 2 × 16 di pagina − 2 × 16 di imbottitura − 2 di bordo.
    expect(parseFloat(tabella.style.minWidth)).toBeLessThanOrEqual(354)
    // la vetrina e l'errore scendono sotto il nome
    expect(within(tabella).getByRole('rowheader').textContent).toContain('in vetrina 2\u00a0kg')
    // «fra 3,2 e 4,9 kg» non sta nella colonna: «3,2–4,9», e «kg» in testa
    const cella = within(tabella).getAllByRole('cell')[0].textContent
    expect(cella).toMatch(/^([\d,]+–[\d,]+|≈ [\d,]+)$/)
    expect(testo()).toContain('«4–6 kg» e la banda chiara vogliono dire')
  })
})

// ── 2b. La barra d'intervallo con la tacca della vetrina (PR3, PR4) ──────

describe('le previsioni come barre d’intervallo (audit 04/10, PR3)', () => {
  const barre = () => [...document.querySelectorAll('[role="img"][aria-label*="si venderà"]')]

  it('ogni gusto ha la sua barra, che dice a parole se la vetrina basta', async () => {
    finto.righe.carlina = [...fisso('CREMA', IERI, 4, 2), ...fisso('MANGO', IERI, 1, 50)]
    rendi()
    await screen.findByRole('table')
    const crema = barre().find(b => /^CREMA/.test(b.getAttribute('aria-label')))
    const mango = barre().find(b => /^MANGO/.test(b.getAttribute('aria-label')))
    // CREMA: in vetrina 2 kg, oggi se ne vendono circa 4: non basta.
    expect(crema.getAttribute('aria-label')).toMatch(/^CREMA oggi: si venderà .* kg; in vetrina 2 kg: non basta$/)
    // MANGO: 50 kg, se ne vende 1: basta.
    expect(mango.getAttribute('aria-label')).toMatch(/in vetrina 50 kg: basta$/)
  })

  it('la tacca della vetrina sta nella colonna del giorno che deve coprire, una volta per gusto', async () => {
    finto.righe.carlina = fisso('CREMA', IERI, 4, 2)
    rendi()
    await screen.findByRole('table')
    // Computer: oggi e domani; la vetrina di ieri sera deve bastare oggi.
    const tacche = [...document.querySelectorAll('[data-tacca="vetrina"]')]
    expect(tacche).toHaveLength(1)
    expect(tacche[0].closest('[role="img"]').getAttribute('aria-label')).toMatch(/^CREMA oggi:/)
  })

  it('una scala sola per tutti i gusti: la stessa quantità sta nello stesso punto', async () => {
    finto.righe.carlina = [...fisso('CREMA', IERI, 4, 2), ...fisso('MANGO', IERI, 1, 50)]
    rendi()
    await screen.findByRole('table')
    const scale = new Set(barre().map(b => b.getAttribute('data-scala')))
    expect(scale.size).toBe(1)
    // La tacca di MANGO (50 kg) è il massimo della scala: in fondo a destra.
    const mango = barre().find(b => /^MANGO oggi/.test(b.getAttribute('aria-label')))
    expect(mango.querySelector('[data-tacca="vetrina"]').style.left).toBe('100%')
  })

  it('«ieri sera» si dice una volta, non sotto ogni quantità in vetrina (PR4)', async () => {
    finto.righe.carlina = [...fisso('CREMA', IERI, 4, 2), ...fisso('MANGO', IERI, 1, 50)]
    rendi()
    const tabella = await screen.findByRole('table')
    expect(tabella.textContent).not.toMatch(/sera/)
    expect(testo().match(/ieri sera/g)).toHaveLength(1)
  })
})

// ── 3. Chi vede quale pagina (Dashboard) ─────────────────────────────────

describe('il Dashboard manda ognuno alla pagina giusta', () => {
  // Il Dashboard intero non si rende in un test unitario: si legge il punto
  // dove sceglie, come fanno gli altri test di questo progetto sul Dashboard.
  const sorgente = readFileSync(resolve(__dirname, '../../src/Dashboard.jsx'), 'utf8')
  const ramo = sorgente.slice(sorgente.indexOf('vista==="previsione"'), sorgente.indexOf('vista==="chiusura"'))

  it('chi conta la vetrina (metodo inventario) vede la pagina nuova', () => {
    expect(ramo).toMatch(/isMetodoInv\s*\?\s*<PrevisioniView/)
    expect(ramo).toContain("onNavigate={setView}")
  })

  it('chi lavora a stampi resta sulla pagina di prima, col meteo della città della SEDE', () => {
    // Per Mara la città dell'azienda è vuota e quella delle sedi è «Torino»:
    // con `citta` dell'azienda il meteo non partiva mai (audit 03/10/2026).
    expect(ramo).toMatch(/:\s*<PrevisioneDomanda[^>]*citta=\{sedeCorrente\?\.citta \|\| citta\}/)
  })
})

// ── 4. Come si scrivono i numeri ─────────────────────────────────────────

describe('come si scrivono i numeri', () => {
  it('chili: un decimale sotto i 10, interi sopra, punto delle migliaia', () => {
    expect(kgTesto(4.24)).toBe('4,2')
    expect(kgTesto(4)).toBe('4')
    expect(kgTesto(12.6)).toBe('13')
    expect(kgTesto(1234.4)).toBe('1.234')
    expect(kgTesto(-1)).toBe('0')
    expect(kgTesto(null)).toBeNull()
  })

  it('intervallo: «fra X e Y kg», o «circa» se la banda non c’è o è finta', () => {
    expect(intervalloTesto(4.5, 6, 5.2)).toBe('fra 4,5 e 6 kg')
    expect(intervalloTesto(5.01, 5.04, 5)).toBe('circa 5 kg')
    expect(intervalloTesto(null, null, 5)).toBe('circa 5 kg')
    expect(intervalloTesto(1, 2, null)).toBeNull()
    expect(intervalloTesto(4.5, 6, 5.2, { breve: true })).toBe('4,5–6 kg')
    expect(intervalloTesto(null, null, 5, { breve: true })).toBe('≈ 5 kg')
  })

  it('le date assolute: «mar 01/09»', () => {
    expect(giornoAssoluto('2026-09-01')).toBe('mar 01/09')
    expect(giornoAssoluto(null)).toBeNull()
  })

  it('giorni detti come al banco', () => {
    expect(giornoRelativo('2026-10-03', OGGI)).toBe('oggi')
    expect(giornoRelativo('2026-10-04', OGGI)).toBe('domani')
    expect(giornoRelativo('2026-10-05', OGGI)).toBe('dopodomani')
    expect(giornoRelativo('2026-10-02', OGGI)).toBe('ieri')
    expect(giornoRelativo('2026-10-06', OGGI)).toBe('mar 06/10')
  })

  it('si rifà il giorno prima di quando finisce; se quel giorno è passato, «subito»', () => {
    expect(quandoRifare('2026-10-05', OGGI)).toEqual({ data: '2026-10-04', subito: false })
    expect(quandoRifare('2026-10-04', OGGI)).toEqual({ data: OGGI, subito: false })
    expect(quandoRifare('2026-10-03', OGGI)).toEqual({ data: OGGI, subito: true })
    expect(quandoRifare('2026-10-01', OGGI)).toEqual({ data: OGGI, subito: true })
    expect(quandoRifare(null, OGGI)).toBeNull()
    // la sera, con l'inventario di oggi già scritto, il primo giorno è domani:
    // chi finisce domani va rifatto subito (stasera o domattina presto)
    expect(quandoRifare('2026-10-04', '2026-10-04')).toEqual({ data: '2026-10-04', subito: true })
  })

  it('l’errore si scrive solo se misurato su abbastanza giorni', () => {
    expect(erroreTesto({ pct: 0.183, giorni: 20 })).toBe('±18%')
    expect(erroreTesto({ pct: 0.183, giorni: 3 })).toBeNull()
    expect(erroreTesto(null)).toBeNull()
  })
})
