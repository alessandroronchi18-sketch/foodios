// @vitest-environment happy-dom
//
// La pagina Food cost a una gelateria che ha solo gusti.
//
// Segnalato dal titolare il 05/10/2026: «se vado in food cost mi dà
// "Nessun prodotto vendibile nel ricettario. Aggiungi ricette con prezzo e
// ingredienti per vedere il food cost." come mai?». Il ricettario di Mara ha
// 63 gusti e 5 basi, e tutti i 63 gusti hanno il costo completo (110
// ingredienti col prezzo). La pagina scartava i gusti di proposito (il loro
// prezzo sta sui formati, non sulla ricetta), e quando non restava niente
// diceva che non c'era niente. La riga che spiegava «i gusti non compaiono
// qui» stava dopo quel ritorno anticipato: a chi ha solo gusti non arrivava
// mai.
//
// Ora i gusti hanno la loro parte (FoodCostGusti): costo al chilo, quota sul
// prezzo medio dei formati senza IVA (lo stesso numero della Produzione e di
// Il mese), margine al chilo, ingredienti con un tocco.

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/react'

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

// Un formato: 100 g a 3,30 € = 33 €/kg al banco, 30 €/kg senza IVA.
let FORMATI = [{ id: 'f1', nome: 'Coppetta', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3.3, componenti: [] }]
vi.mock('../../src/lib/storage', () => ({
  sload: async (k) => (k === 'pasticceria-formati-vendita-v1' ? FORMATI : null),
  ssave: async () => {}, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { default: SimulatorePrezziView } = await import('../../src/views/SimulatorePrezziView.jsx')
const { righeFoodCostGusti, ingredientiAlKg, riassuntoGusti } = await import('../../src/lib/foodCostGusti.js')
const { fraseGusti, avvisiGusti, titoloGusti, PRIMI_GUSTI } = await import('../../src/components/foodcost/FoodCostGusti.jsx')
const { costoAlKgGusto } = await import('../../src/lib/produzioneAnalisi.js')
const { buildIngCosti } = await import('../../src/lib/foodcost.js')
const { quotaConArticolo } = await import('../../src/lib/formatoAnalisi.js')
const { default: TabellaAnalisi } = await import('../../src/components/analisi/TabellaAnalisi.jsx')

afterEach(() => { cleanup(); FORMATI = [{ id: 'f1', nome: 'Coppetta', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3.3, componenti: [] }] })
const testo = () => document.body.textContent || ''

const COSTI = {
  'latte prova': { costoKg: 1, costoG: 0.001 },
  'nocciola prova': { costoKg: 20, costoG: 0.02 },
}
const gusto = (nome, ingredienti, extra = {}) => ({ nome, tipo: 'gusto', ingredienti, ...extra })
// NOCCIOLA: 800 g di latte (0,80 €) + 400 g di nocciola (8 €) = 8,80 € per
// 1.200 g di gelato: 7,33 €/kg. Su 30 €/kg: 24,4 %, restano 22,67 €/kg.
const NOCCIOLA = gusto('NOCCIOLA', [{ nome: 'latte prova', qty1stampo: 800 }, { nome: 'nocciola prova', qty1stampo: 400 }])
const FIORDILATTE = gusto('FIORDILATTE', [{ nome: 'latte prova', qty1stampo: 1000 }])
const BASE = { nome: 'BASE BIANCA', tipo: 'semilavorato', ingredienti: [{ nome: 'latte prova', qty1stampo: 1000 }] }
const ricettario = (ricette) => ({ ricette: Object.fromEntries(ricette.map(r => [r.nome, r])), ingredienti_costi: COSTI })
// Dodici gusti per la prova del «mostra tutti»: 900 g di latte e i×10 g di
// nocciola, cioè 0,90 + 0,2×i €/kg circa.
const DODICI = Array.from({ length: 12 }, (_, i) => gusto(`GUSTO ${String(i + 1).padStart(2, '0')}`,
  [{ nome: 'latte prova', qty1stampo: 900 }, { nome: 'nocciola prova', qty1stampo: (i + 1) * 10 }]))

const disegna = (ric) => render(<SimulatorePrezziView ricettario={ric} giornaliero={[]} tipoAttivita="gelateria" orgId="o1" sedeId={null} />)

describe('il difetto: a chi ha solo gusti la pagina diceva che non c\'era niente', () => {
  it('solo gusti e basi: niente «Nessun prodotto vendibile», c\'è il costo dei gusti', async () => {
    disegna(ricettario([NOCCIOLA, FIORDILATTE, BASE]))
    await screen.findByRole('table', { name: /Food cost dei gusti/ })
    expect(testo()).not.toMatch(/Nessun prodotto vendibile/)
    // Il titolo dice la conclusione: fra quanto e quanto stanno i gusti.
    // 06/10/2026: la percentuale arriva quando i formati sono letti, dopo la
    // tabella: si aspetta il titolo (col Mac carico la prova correva avanti).
    await waitFor(() => expect(testo()).toMatch(/I gusti ti costano fra il 3,3% e il 24,4% del prezzo/))
  })

  it('la base (semilavorato) non è un gusto e non sta nella tabella', async () => {
    disegna(ricettario([NOCCIOLA, BASE]))
    await screen.findByRole('table', { name: /Food cost dei gusti/ })
    const t = screen.getByRole('table', { name: /Food cost dei gusti/ })
    expect(t.textContent).toMatch(/NOCCIOLA/)
    expect(t.textContent).not.toMatch(/BASE BIANCA/)
  })

  it('un ricettario vuoto dice ancora che è vuoto', () => {
    disegna(ricettario([]))
    expect(testo()).toMatch(/Nessun prodotto vendibile nel ricettario/)
    expect(screen.queryByRole('table', { name: /Food cost dei gusti/ })).toBeNull()
  })
})

describe('i numeri dei gusti', () => {
  const ing = buildIngCosti(COSTI)

  it('costo al chilo, quota sul prezzo, margine al chilo', () => {
    const [r] = righeFoodCostGusti(ricettario([NOCCIOLA]), ing, 30)
    expect(r.fcKg).toBeCloseTo(8.8 / 1.2, 6)
    expect(r.quota).toBeCloseTo((8.8 / 1.2) / 30 * 100, 6)
    expect(r.margineKg).toBeCloseTo(30 - 8.8 / 1.2, 6)
    expect(r.completo).toBe(true)
  })

  it('lo stesso costo al chilo della Produzione, non un secondo conto', () => {
    const ric = ricettario([NOCCIOLA])
    const [r] = righeFoodCostGusti(ric, ing, 30)
    expect(r.fcKg).toBe(costoAlKgGusto(NOCCIOLA, ing, ric).fcKg)
  })

  it('la resa dichiarata vince sulla somma degli ingredienti', () => {
    const [r] = righeFoodCostGusti(ricettario([{ ...NOCCIOLA, resa_g: 1100 }]), ing, 30)
    expect(r.fcKg).toBeCloseTo(8.8 / 1.1, 6)
  })

  it('dal più caro al meno caro, quelli senza costo in fondo', () => {
    const vuoto = gusto('AAA SENZA INGREDIENTI', [])
    const righe = righeFoodCostGusti(ricettario([FIORDILATTE, vuoto, NOCCIOLA]), ing, 30)
    expect(righe.map(r => r.nome)).toEqual(['NOCCIOLA', 'FIORDILATTE', 'AAA SENZA INGREDIENTI'])
    expect(righe[2].fcKg).toBeNull()
    expect(righe[2].quota).toBeNull()
    expect(riassuntoGusti(righe).senzaCosto).toBe(1)
  })

  it('un ingrediente senza prezzo: il gusto è incompleto e non fa il «più caro»', () => {
    const mistero = gusto('MISTERO', [{ nome: 'nocciola prova', qty1stampo: 1000 }, { nome: 'zafferano inesistente xyz', qty1stampo: 5 }])
    const righe = righeFoodCostGusti(ricettario([NOCCIOLA, mistero]), ing, 30)
    const m = righe.find(r => r.nome === 'MISTERO')
    expect(m.completo).toBe(false)
    expect(m.mancanti.join(' ')).toMatch(/zafferano/)
    const r = riassuntoGusti(righe)
    expect(r.piuCaro.nome).toBe('NOCCIOLA')
    expect(r.incompleti).toBe(1)
    expect(avvisiGusti(r)[0]).toMatch(/1 gusto ha ingredienti senza prezzo/)
  })

  it('senza prezzo dei formati: niente quota e niente margine, mai NaN', () => {
    const [r] = righeFoodCostGusti(ricettario([NOCCIOLA]), ing, null)
    expect(r.fcKg).toBeGreaterThan(0)
    expect(r.quota).toBeNull()
    expect(r.margineKg).toBeNull()
  })

  it('gli ingredienti al chilo sommano al costo al chilo del gusto', () => {
    const ric = ricettario([NOCCIOLA])
    const [r] = righeFoodCostGusti(ric, ing, 30)
    const righe = ingredientiAlKg(NOCCIOLA, ing, ric)
    expect(righe.reduce((s, x) => s + x.costoKg, 0)).toBeCloseTo(r.fcKg, 6)
    expect(righe[0].nome).toBe('nocciola prova')
    expect(righe.reduce((s, x) => s + x.quota, 0)).toBeCloseTo(100, 6)
  })
})

describe('la frase in cima', () => {
  const ing = buildIngCosti(COSTI)
  it('il più caro, col suo costo e la quota, e la metà dei gusti', () => {
    const r = riassuntoGusti(righeFoodCostGusti(ricettario([NOCCIOLA, FIORDILATTE]), ing, 30))
    const f = fraseGusti(r, 30)
    expect(f).toMatch(/^Il gusto che ti costa di più è NOCCIOLA: 7,33 € al chilo, il 24,4% del prezzo\./)
    expect(f).toMatch(/Per metà dei gusti gli ingredienti stanno sotto /)
  })

  it('senza prezzo dei formati parla di euro al chilo, non di percentuali', () => {
    const r = riassuntoGusti(righeFoodCostGusti(ricettario([NOCCIOLA, FIORDILATTE]), ing, null))
    const f = fraseGusti(r, null)
    expect(f).toMatch(/7,33 € al chilo\./)
    expect(f).not.toMatch(/%/)
  })

  it('l\'articolo davanti alla percentuale: il 26%, l\'11%, l\'8%, l\'80%', () => {
    expect(quotaConArticolo(26)).toBe('il 26%')
    expect(quotaConArticolo(11)).toBe("l'11%")
    expect(quotaConArticolo(8.2)).toBe("l'8,2%")
    expect(quotaConArticolo(1.5)).toBe("l'1,5%")
    expect(quotaConArticolo(84)).toBe("l'84%")
    expect(quotaConArticolo(18)).toBe('il 18%')
    expect(quotaConArticolo(100)).toBe('il 100%')
    expect(quotaConArticolo(null)).toBeNull()
  })
})

describe('il titolo', () => {
  const ing = buildIngCosti(COSTI)
  it('con il prezzo: fra la quota più bassa e la più alta', () => {
    expect(titoloGusti(righeFoodCostGusti(ricettario([NOCCIOLA, FIORDILATTE]), ing, 30), 30))
      .toBe('I gusti ti costano fra il 3,3% e il 24,4% del prezzo')
  })
  it('senza prezzo: fra il costo al chilo più basso e il più alto', () => {
    expect(titoloGusti(righeFoodCostGusti(ricettario([NOCCIOLA, FIORDILATTE]), ing, null), null))
      .toBe('I gusti ti costano fra 1,00 € e 7,33 € al chilo')
  })
  it('un gusto solo: il nome della parte', () => {
    expect(titoloGusti(righeFoodCostGusti(ricettario([NOCCIOLA]), ing, 30), 30)).toBe('Quanto ti costa ogni gusto')
  })
})

describe('la tabella in pagina', () => {
  it('all\'arrivo i dieci più cari, gli altri dietro un tocco', async () => {
    disegna(ricettario(DODICI))
    await screen.findByRole('table', { name: /Food cost dei gusti/ })
    const righe = () => screen.getByRole('table', { name: /Food cost dei gusti/ }).querySelectorAll('tbody > tr').length
    expect(righe()).toBe(PRIMI_GUSTI)
    expect(testo()).toMatch(/GUSTO 12/)
    expect(testo()).not.toMatch(/GUSTO 01/)
    fireEvent.click(screen.getByRole('button', { name: /Mostra tutti i 12 gusti/ }))
    expect(righe()).toBe(12)
    fireEvent.click(screen.getByRole('button', { name: /Mostra solo i 10 più cari/ }))
    expect(righe()).toBe(PRIMI_GUSTI)
  })

  it('con pochi gusti non c\'è il pulsante «mostra tutti»', async () => {
    disegna(ricettario([NOCCIOLA, FIORDILATTE]))
    await screen.findByRole('table', { name: /Food cost dei gusti/ })
    expect(screen.queryByRole('button', { name: /Mostra tutti/ })).toBeNull()
  })

  it('un tocco sul gusto apre i suoi ingredienti, un altro lo chiude', async () => {
    disegna(ricettario([NOCCIOLA, FIORDILATTE]))
    await screen.findByRole('table', { name: /Food cost dei gusti/ })
    const b = screen.getByRole('button', { name: /NOCCIOLA/ })
    fireEvent.click(b)
    const t = screen.getByRole('table', { name: /Ingredienti di NOCCIOLA/ })
    expect(t.textContent).toMatch(/nocciola prova/)
    expect(t.textContent).toMatch(/6,67/)   // 8 € di nocciola su 1,2 kg
    expect(b.getAttribute('aria-expanded')).toBe('true')
    // Incolonnati: la tabellina ha le stesse larghezze a destra di quella
    // dei gusti, quindi il costo dell'ingrediente sta sotto il costo del gusto.
    const larghe = (tab) => [...tab.querySelectorAll(':scope > colgroup > col')].slice(1).map(c => c.style.width)
    expect(larghe(t)).toEqual(larghe(screen.getByRole('table', { name: /Food cost dei gusti/ })))
    fireEvent.click(b)
    expect(screen.queryByRole('table', { name: /Ingredienti di NOCCIOLA/ })).toBeNull()
  })

  it('i prezzi al chilo con i centesimi, e il prezzo dei formati detto senza IVA', async () => {
    disegna(ricettario([NOCCIOLA]))
    await waitFor(() => expect(testo()).toMatch(/senza IVA: 30,00 € al chilo/))
    const t = screen.getByRole('table', { name: /Food cost dei gusti/ })
    expect(t.textContent).toMatch(/7,33/)
    expect(t.textContent).toMatch(/24,4%/)
    expect(t.textContent).toMatch(/22,67/)
  })

  it('senza formati: niente colonna «Sul prezzo», e si dice cosa serve', async () => {
    FORMATI = []
    disegna(ricettario([NOCCIOLA]))
    await waitFor(() => expect(testo()).toMatch(/servono i prezzi dei formati/))
    expect(testo()).not.toMatch(/Sul prezzo/)
    expect(testo()).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('pasticceria e gelateria insieme: il simulatore resta, i gusti hanno la loro parte', async () => {
    const torta = { nome: 'TORTA PROVA', tipo: 'stampo', prezzo: 30, unita: 10, ingredienti: [{ nome: 'nocciola prova', qty1stampo: 200 }] }
    disegna(ricettario([torta, NOCCIOLA]))
    await screen.findByRole('table', { name: /Food cost dei gusti/ })
    expect(testo()).toMatch(/Food cost obiettivo/)
    expect(testo()).toMatch(/TORTA PROVA/)
    // La vecchia riga azzurra che rimandava altrove non c'è più.
    expect(testo()).not.toMatch(/gusti gelateria non appaiono qui/)
  })
})

describe('i centesimi nella tabella comune', () => {
  const tab = (colonna, v) => {
    render(<TabellaAnalisi etichetta="prova" colonne={[{ chiave: 'n', titolo: 'Nome' }, { chiave: 'v', titolo: 'Valore', ...colonna }]}
      righe={[{ chiave: 'a', celle: { n: 'riga', v } }]} />)
    const s = screen.getByRole('table', { name: 'prova' }).querySelector('tbody td').textContent
    cleanup()
    return s
  }
  it('con decimali: due cifre dopo la virgola, separatore delle migliaia', () => {
    expect(tab({ tipo: 'euro', decimali: 2 }, 3.606)).toBe('3,61')
    expect(tab({ tipo: 'euro', decimali: 2 }, 1234.5)).toBe('1.234,50')
  })
  it('un negativo che si arrotonda a zero non ha il meno', () => {
    expect(tab({ tipo: 'euro', decimali: 2 }, -0.001)).toBe('0,00')
    expect(tab({ tipo: 'euro', decimali: 2 }, -2.5)).toBe('−2,50')
  })
  it('senza decimali resta come prima: all\'euro', () => {
    expect(tab({ tipo: 'euro' }, 1234.6)).toBe('1.235')
    expect(tab({ tipo: 'euro' }, null)).toBe('non lo so')
  })
})
