// @vitest-environment happy-dom
//
// Il menu engineering dei gusti.
//
// Chiesto dal titolare il 05/10/2026 («e menu engineering?»). La pagina
// c'era, ma a Mara non mostrava niente: leggeva le vendite per prodotto da
// `pasticceria-chiusure-v1`, che per lei ha zero righe, e solo con una sede
// scelta. Le vendite per gusto stanno nell'inventario (122 giorni per sede,
// maggio-agosto). Coi dati veri di luglio-agosto, poi, la pagina avrebbe usato
// la soglia sbagliata: la media piena invece del 70% della quota media di
// Kasavana-Smith, e la Nocciola (465 kg, media 503) finiva fra i gusti «da
// rivedere». E diceva «alza il prezzo» di un gusto, che nel gelato non si
// può: il prezzo sta sul formato.
//
// Qui: la matrice (soglie, gruppi, chi resta fuori), la pagina sui dati
// dell'inventario (stessi conti della Produzione), e quello che c'è intorno.

import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'

vi.mock('../../src/lib/supabase', () => {
  const RES = { data: [], error: null }
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(RES)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return { supabase: { from: () => new Proxy({}, h), rpc: () => Promise.resolve({ data: null, error: null }) } }
})
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false, useDevice: () => 'computer' }))

// 100 g a 3,30 € = 33 €/kg al banco, 30 €/kg senza IVA.
let FORMATI = []
let LEGACY = null      // il vecchio archivio delle chiusure: per Mara non c'è
vi.mock('../../src/lib/storage', () => ({
  sload: async (k) => (k === 'pasticceria-formati-vendita-v1' ? FORMATI : k === 'pasticceria-chiusure-v1' ? LEGACY : null),
  ssave: async () => {}, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))
let RIGHE = []
let ULTIMO = '2026-08-31'
const chiamate = []
vi.mock('../../src/lib/inventarioProduzione', async (orig) => ({
  ...(await orig()),
  fetchAllInventarioProduzione: async (_o, opts) => {
    chiamate.push(opts)
    return RIGHE.filter(r => [].concat(opts.sedeIds).includes(r.sede_id) && r.data >= opts.dataFrom && r.data <= opts.dataTo)
  },
  ultimoGiornoRegistrato: async () => ULTIMO,
}))

const { matriceGusti, SOGLIA_POPOLARITA, GRUPPI } = await import('../../src/lib/menuEngineeringGusti.js')
const { fraseMatrice, avvisiMatrice, tacche } = await import('../../src/components/menuEngineering/MatriceGusti.jsx')
const { periodoDiPartenza, fraseCopertura } = await import('../../src/views/menuEngineering/MenuEngineeringGusti.jsx')
const { default: MenuEngineeringView } = await import('../../src/views/MenuEngineeringView.jsx')

const FORMATI_OK = [{ id: 'f1', nome: 'Coppetta', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3.3, componenti: [] }]
beforeEach(() => { FORMATI = FORMATI_OK; LEGACY = null; RIGHE = []; ULTIMO = '2026-08-31'; chiamate.length = 0 })
afterEach(() => cleanup())
const testo = () => document.body.textContent || ''

// Una riga di valutaGusti, come la dà la Produzione.
const r = (gusto, vendKg, margine, extra = {}) => ({ gusto, ricetta: gusto, vendKg, margine, haRicetta: true, ...extra })

describe('la matrice', () => {
  it('popolare = almeno il 70% della quota media, non la media piena (il caso Nocciola)', () => {
    // 2.365 kg su 4 gusti: quota media 591 kg, soglia 414. Con la media
    // piena la Nocciola (465) sarebbe «poco venduta».
    const m = matriceGusti([r('MAROTTO', 1100, 22000), r('FONDENTE', 600, 13000), r('NOCCIOLA', 465, 10000), r('RAMASSIN', 200, 4000)])
    expect(SOGLIA_POPOLARITA).toBe(0.7)
    expect(m.soglie.kg).toBeCloseTo(0.7 * 2365 / 4, 6)
    const n = m.gusti.find(g => g.gusto === 'NOCCIOLA')
    expect(['tenere', 'curare']).toContain(n.gruppo)
    expect(m.gusti.find(g => g.gusto === 'RAMASSIN').gruppo).toMatch(/spingere|rivedere/)
  })

  it('redditizio = margine al chilo sopra la media PESATA sui chili', () => {
    // A 1.000 kg a 21 €/kg, B 10 kg a 30 €/kg, C 500 kg a 19 €/kg.
    // Media pesata 20,40 €/kg (la semplice sarebbe 23,33: A sarebbe sotto).
    const m = matriceGusti([r('A', 1000, 21000), r('B', 10, 300), r('C', 500, 9500)])
    expect(m.soglie.margineKg).toBeCloseTo(30800 / 1510, 6)
    expect(m.gusti.find(g => g.gusto === 'A').gruppo).toBe('tenere')
    expect(m.gusti.find(g => g.gusto === 'C').gruppo).toBe('curare')
    expect(m.gusti.find(g => g.gusto === 'B').gruppo).toBe('spingere')
  })

  it('i quattro gruppi tornano: ogni gusto in uno, i margini sommano al 100%', () => {
    const m = matriceGusti([r('A', 1000, 21000), r('B', 10, 300), r('C', 500, 9500), r('D', 20, 200)])
    expect(m.perGruppo.map(g => g.id)).toEqual(['tenere', 'curare', 'spingere', 'rivedere'])
    expect(m.perGruppo.reduce((s, g) => s + g.n, 0)).toBe(4)
    expect(m.perGruppo.reduce((s, g) => s + g.quotaMargine, 0)).toBeCloseTo(100, 6)
    expect(m.gusti.find(g => g.gusto === 'D').gruppo).toBe('rivedere')
  })

  it('dal margine totale più alto', () => {
    const m = matriceGusti([r('PICCOLO', 100, 2500), r('GRANDE', 900, 18000), r('MEDIO', 400, 9000)])
    expect(m.gusti.map(g => g.gusto)).toEqual(['GRANDE', 'MEDIO', 'PICCOLO'])
  })

  it('chi resta fuori si conta: senza ricetta, senza margine, e quanta parte del venduto', () => {
    const m = matriceGusti([
      r('A', 600, 12000), r('B', 300, 7000),
      r('FRAGOLA', 80, null, { haRicetta: false, ricetta: null }),
      r('CREMA', 20, null, { haRicetta: false, ricetta: null }),
      r('MISTERO', 100, null),
    ])
    expect(m.gusti.map(g => g.gusto).sort()).toEqual(['A', 'B'])
    expect(m.fuori.senzaRicetta).toEqual({ n: 2, kg: 100, gusti: ['FRAGOLA', 'CREMA'] })
    expect(m.fuori.senzaMargine).toEqual({ n: 1, kg: 100, gusti: ['MISTERO'] })
    expect(m.fuori.quotaKg).toBeCloseTo(200 / 1100 * 100, 6)
    const a = avvisiMatrice(m)
    expect(a[0].testo).toMatch(/^2 gusti venduti non hanno una ricetta collegata: 100 kg, 9,1% del venduto, restano fuori \(FRAGOLA, CREMA\)\./)
    expect(a[1].testo).toMatch(/^1 gusto ha la ricetta ma non il margine/)
  })

  it('i gusti che non hanno venduto (o col venduto negativo) non entrano', () => {
    const m = matriceGusti([r('A', 600, 12000), r('B', 300, 7000), r('ZERO', 0, 0), r('STRANO', -5, -100)])
    expect(m.gusti.map(g => g.gusto).sort()).toEqual(['A', 'B'])
    expect(m.fuori.senzaMargine.n).toBe(0)
  })

  it('niente gusti: niente soglie, niente NaN', () => {
    const m = matriceGusti([])
    expect(m.gusti).toEqual([])
    expect(m.soglie).toEqual({ kg: null, margineKg: null })
    expect(m.perGruppo.every(g => g.quotaMargine === null)).toBe(true)
  })
})

describe('le parole', () => {
  it('la frase: chi lascia di più, e quanto pesano quelli da curare', () => {
    const m = matriceGusti([r('A', 1000, 21000), r('B', 10, 300), r('C', 500, 9500)])
    const f = fraseMatrice(m)
    expect(f).toMatch(/^A è il gusto che ti lascia di più: 21\.000 € di margine su 1\.000 kg venduti\./)
    expect(f).toMatch(/Il gusto da curare fa il 30,8% del margine/)
  })

  it('nessun consiglio dice di alzare il prezzo di un gusto: il prezzo sta sul formato', () => {
    for (const g of Object.values(GRUPPI)) expect(`${g.breve} ${g.consiglio}`).not.toMatch(/alza il prezzo/i)
    expect(GRUPPI.curare.consiglio).toMatch(/supplemento/)
  })

  it('le tacche dell\'asse sono numeri interi e tondi', () => {
    expect(tacche(0, 1100, 5)).toEqual([0, 500, 1000])
    expect(tacche(18, 27, 4)).toEqual([20, 25])
    expect(tacche(0, 40, 4)).toEqual([0, 10, 20, 30, 40])
    for (const v of tacche(19, 22, 4)) expect(Number.isInteger(v)).toBe(true)
  })

  it('il periodo di partenza: due mesi che finiscono all\'ultimo giorno d\'inventario', () => {
    expect(periodoDiPartenza('2026-08-31', '2026-10-05')).toEqual({ from: '2026-07-01', to: '2026-08-31' })
    expect(periodoDiPartenza('2026-09-15', '2026-10-05')).toEqual({ from: '2026-07-15', to: '2026-09-15' })
    // Niente inventario: fino a oggi.
    expect(periodoDiPartenza(null, '2026-10-05')).toEqual({ from: '2026-08-05', to: '2026-10-05' })
  })

  it('da dove vengono i chili: le sedi con gli stessi giorni insieme, e il prezzo', () => {
    const riga = (sede, data) => ({ sede_id: sede, gusto_nome: 'X', data, produzione_g: 1000, rimanenza_g: 0, scarto_g: 0, spedito_g: 0, ricevuto_g: 0 })
    const righe = [riga('C', '2026-07-01'), riga('C', '2026-09-15'), riga('B', '2026-07-01'), riga('B', '2026-08-31'), riga('D', '2026-07-01'), riga('D', '2026-08-31')]
    const f = fraseCopertura(righe, { da: '2026-07-01', a: '2026-09-15', sedi: [{ id: 'C', nome: 'Carlina' }, { id: 'B', nome: 'Berthollet' }, { id: 'D', nome: 'De Gasperi' }], prezzoKg: 26.81 })
    expect(f).toMatch(/Carlina dal 01\/07 al 15\/09/)
    expect(f).toMatch(/Berthollet e De Gasperi dal 01\/07 al 31\/08/)
    expect(f).toMatch(/Le sedi con meno giorni pesano meno/)
    expect(f).toMatch(/26,81 € al chilo senza IVA/)
  })
})

// ── La pagina vera, sui dati dell'inventario ─────────────────────────────
const COSTI = { 'latte prova': { costoKg: 1, costoG: 0.001 }, 'nocciola prova': { costoKg: 20, costoG: 0.02 } }
const gusto = (nome, gNocciola) => ({ nome, tipo: 'gusto', ingredienti: [{ nome: 'latte prova', qty1stampo: 1000 - gNocciola }, { nome: 'nocciola prova', qty1stampo: gNocciola }] })
const RICETTARIO = { ricette: { NOCCIOLA: gusto('NOCCIOLA', 300), FIORDILATTE: gusto('FIORDILATTE', 0), PISTACCHIO: gusto('PISTACCHIO', 250) }, ingredienti_costi: COSTI }
const SEDI = [{ id: 'S1', nome: 'Carlina', attiva: true }, { id: 'S2', nome: 'Berthollet', attiva: true }]
// Ogni giorno d'agosto: produzione = venduto (rimanenza zero), più il 31/07
// come giacenza di partenza.
function inventario(sede, gustoNome, kgAlGiorno) {
  const out = [{ sede_id: sede, gusto_nome: gustoNome, data: '2026-07-31', produzione_g: 0, rimanenza_g: 0, scarto_g: 0, spedito_g: 0, ricevuto_g: 0 }]
  for (let d = 1; d <= 31; d++) {
    out.push({ sede_id: sede, gusto_nome: gustoNome, data: `2026-08-${String(d).padStart(2, '0')}`, produzione_g: kgAlGiorno * 1000, rimanenza_g: 0, scarto_g: 0, spedito_g: 0, ricevuto_g: 0 })
  }
  return out
}
const disegna = (p = {}) => render(<MenuEngineeringView orgId="o1" sedeId={null} sedi={SEDI} ricettario={RICETTARIO} onNavigate={() => {}} {...p} />)

describe('la pagina: il difetto', () => {
  it('senza il vecchio archivio delle chiusure, i gusti si vedono lo stesso (dall\'inventario)', async () => {
    RIGHE = [...inventario('S1', 'NOCCIOLA', 20), ...inventario('S1', 'FIORDILATTE', 10), ...inventario('S2', 'PISTACCHIO', 15)]
    disegna()
    await screen.findByRole('table', { name: 'Gusti per margine' })
    expect(testo()).toMatch(/Quali gusti ti fanno guadagnare\?/)
    const t = screen.getByRole('table', { name: 'Gusti per margine' }).textContent
    expect(t).toMatch(/NOCCIOLA/)
    expect(t).toMatch(/620/)     // 20 kg × 31 giorni
    expect(t).toMatch(/465/)     // pistacchio: 15 × 31
  })

  it('«Tutte le sedi» legge tutte le sedi che producono; una sede scelta solo la sua', async () => {
    RIGHE = [...inventario('S1', 'NOCCIOLA', 20), ...inventario('S2', 'PISTACCHIO', 15), ...inventario('S1', 'FIORDILATTE', 10)]
    disegna()
    await screen.findByRole('table', { name: 'Gusti per margine' })
    expect(chiamate.at(-1).sedeIds).toEqual(['S1', 'S2'])
    cleanup()
    disegna({ sedeId: 'S1' })
    await screen.findByRole('table', { name: 'Gusti per margine' })
    expect(chiamate.at(-1).sedeIds).toEqual(['S1'])
    expect(screen.getByRole('table', { name: 'Gusti per margine' }).textContent).not.toMatch(/PISTACCHIO/)
  })

  it('si apre sui due mesi che finiscono all\'ultimo giorno d\'inventario, con la giacenza di partenza', async () => {
    RIGHE = [...inventario('S1', 'NOCCIOLA', 20), ...inventario('S1', 'FIORDILATTE', 10)]
    disegna()
    await screen.findByRole('table', { name: 'Gusti per margine' })
    expect(testo()).toMatch(/1 luglio – 31 agosto 2026/)
    expect(chiamate.at(-1).dataFrom).toBe('2026-06-24')   // sette giorni prima del 1° luglio
    expect(chiamate.at(-1).dataTo).toBe('2026-08-31')
  })
})

describe('la pagina: quello che c\'è intorno', () => {
  it('un gusto venduto senza ricetta: detto, coi chili, e «Collegali» porta alla Produzione', async () => {
    RIGHE = [...inventario('S1', 'NOCCIOLA', 20), ...inventario('S1', 'FIORDILATTE', 10), ...inventario('S1', 'FRAGOLA', 5)]
    const vai = vi.fn()
    disegna({ onNavigate: vai })
    await screen.findByRole('table', { name: 'Gusti per margine' })
    expect(testo()).toMatch(/1 gusto venduto non ha una ricetta collegata: 155 kg/)
    fireEvent.click(screen.getByRole('button', { name: 'Collegali' }))
    expect(vai).toHaveBeenCalledWith('storico')
  })

  it('senza i prezzi dei formati: non inventa il margine, e dice dove metterli', async () => {
    FORMATI = []
    RIGHE = [...inventario('S1', 'NOCCIOLA', 20), ...inventario('S1', 'FIORDILATTE', 10)]
    const vai = vi.fn()
    disegna({ onNavigate: vai })
    await waitFor(() => expect(testo()).toMatch(/servono i prezzi dei formati di vendita/))
    expect(screen.queryByRole('table', { name: 'Gusti per margine' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Apri il Listino' }))
    expect(vai).toHaveBeenCalledWith('formati-vendita')
  })

  it('nessun inventario nel periodo: lo dice, niente tabella di zeri', async () => {
    RIGHE = []
    disegna()
    await waitFor(() => expect(testo()).toMatch(/non c'è nessun giorno d'inventario registrato/))
    expect(testo()).not.toMatch(/NaN|undefined/)
  })

  it('un tocco su un gruppo filtra la tabella, un altro toglie il filtro', async () => {
    RIGHE = [...inventario('S1', 'NOCCIOLA', 20), ...inventario('S1', 'FIORDILATTE', 10), ...inventario('S1', 'PISTACCHIO', 1)]
    disegna()
    await screen.findByRole('table', { name: 'Gusti per margine' })
    const righe = () => screen.getByRole('table', { name: 'Gusti per margine' }).querySelectorAll('tbody > tr').length
    expect(righe()).toBe(3)
    const tessere = screen.getByRole('group', { name: 'I quattro gruppi' }).querySelectorAll('button')
    const conGusti = [...tessere].find(b => [...b.children].some(c => /^1 gusto ·/.test(c.textContent)))
    fireEvent.click(conGusti)
    expect(conGusti.getAttribute('aria-pressed')).toBe('true')
    expect(righe()).toBe(1)
    fireEvent.click(conGusti)
    expect(righe()).toBe(3)
  })

  it('le quattro tessere hanno le righe in comune (nome, numero, gusti, frase allineati)', async () => {
    RIGHE = [...inventario('S1', 'NOCCIOLA', 20), ...inventario('S1', 'FIORDILATTE', 10)]
    disegna()
    await screen.findByRole('table', { name: 'Gusti per margine' })
    const tessere = [...screen.getByRole('group', { name: 'I quattro gruppi' }).querySelectorAll('button')]
    expect(tessere).toHaveLength(4)
    for (const b of tessere) {
      expect(b.style.gridTemplateRows).toBe('subgrid')
      expect(b.children).toHaveLength(4)
    }
  })

  it('un ricettario senza gusti tiene la pagina di prima (pasticceria)', async () => {
    const torta = { nome: 'TORTA', tipo: 'stampo', prezzo: 30, unita: 10, ingredienti: [{ nome: 'nocciola prova', qty1stampo: 200 }] }
    disegna({ ricettario: { ricette: { TORTA: torta }, ingredienti_costi: COSTI }, sedeId: 'S1' })
    await waitFor(() => expect(testo()).not.toMatch(/Leggo l'inventario/))
    expect(testo()).not.toMatch(/Quali gusti ti fanno guadagnare/)
  })
})
