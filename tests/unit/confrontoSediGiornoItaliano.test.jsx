// @vitest-environment happy-dom
//
// «Oggi» nel Confronto sedi è il giorno dell'orologio di chi guarda.
//
// Difetto n.1 del censimento delle date dell'audit (16/09/2026), fascia 1,
// `src/components/ConfrontoSedi.jsx:118`:
//
//     const today = new Date().toISOString().split('T')[0]
//
// `toISOString()` è sempre l'ora di Greenwich. In Italia, fra mezzanotte e
// le due di notte, quel giorno è ANCORA IERI. Da quella riga scendevano due
// numeri che il titolare legge come numeri di oggi:
//
//   · «Prodotti oggi» — `(sess.data || '').startsWith(today)`. Il laboratorio
//     di pasticceria lavora di notte: chi apre la pagina all'una, dopo aver
//     infornato, vedeva la colonna a zero e la produzione della notte
//     attribuita al giorno prima.
//   · «Fatture scadute» — `fattureDaPagarePerSede(fatture, today)`. Il
//     confronto è `scadenza < oggi`, cioè «si è in ritardo dal giorno dopo».
//     Con un «oggi» spostato indietro di un giorno, a ovest di Greenwich la
//     fattura che scade OGGI risultava già scaduta e faceva partire l'allarme
//     rosso; a est, la fattura scaduta ieri non lo faceva partire.
//
// Difetto n.21 dello stesso censimento, `:190`: l'etichetta delle otto
// settimane del grafico. `getStartOfWeek()` costruisce mezzanotte LOCALE del
// lunedì; `lun.toISOString().slice(0,10)` la riporta a Greenwich e, con
// offset positivo, torna indietro alla DOMENICA. La settimana del 14
// settembre si chiamava «13 settembre».
//
// Il file era di un altro agente dell'audit (SOLDI, sulle fatture) fino al
// 17/09/2026: corretto appena si è liberato.
//
// ── Come sono scritte le prove ───────────────────────────────────────────
// Niente date italiane scritte a mano: sotto `TZ_TEST=UTC` non
// dimostrerebbero niente, e sotto `TZ_TEST=Pacific/Auckland` nemmeno. Si
// fissa l'orologio a due istanti — le 23:30 e le 00:30 di Greenwich — e si
// chiede alla macchina, in quel momento, qual è il suo giorno locale. Almeno
// uno dei due istanti cade nella finestra rotta in ogni fuso che non sia
// Greenwich; in Greenwich nessuno dei due, e il file lo dice invece di
// fingere.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import { formatLocalDate, aggiungiGiorni } from '../../src/lib/dateLocal'

// ── Il contorno finto ────────────────────────────────────────────────────
const stato = { giornaliero: {}, fatture: [] }

function catena(risultato) {
  const c = {}
  for (const m of ['select', 'eq', 'is', 'not', 'in', 'or', 'order', 'limit', 'gte', 'lte', 'lt', 'gt']) c[m] = () => c
  c.maybeSingle = () => Promise.resolve(risultato)
  c.single = () => Promise.resolve(risultato)
  c.then = (res) => Promise.resolve(risultato).then(res)
  return c
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from(tabella) {
      if (tabella === 'fatture') return catena({ data: stato.fatture, error: null })
      return catena({ data: [], error: null })
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))

vi.mock('../../src/lib/storage', () => ({
  sload: async (chiave, _org, sedeId) => {
    if (chiave === 'pasticceria-giornaliero-v1') return stato.giornaliero[sedeId] || []
    return null
  },
  sloadAllSedi: async () => ({}),
  ssave: async () => {},
}))

vi.mock('../../src/lib/inventarioProduzione', () => ({
  fetchAllInventarioProduzione: async () => [],
  ricaviDaInventario: () => null,
  GIORNI_RIPORTO_MAX: 30,
  COLONNE_VENDUTO: [],
}))
vi.mock('../../src/lib/costiAziendali', () => ({
  caricaCostiAziendali: async () => [],
  totaleMensile: () => 0,
}))
vi.mock('../../src/lib/venditeB2B', () => ({ venditeB2BPeriodo: async () => [] }))

import ConfrontoSedi from '../../src/components/ConfrontoSedi'

const ORG = 'org-mara'
const SEDI = [
  { id: 'sede-corso-casale', nome: 'Corso Casale', attiva: true },
  { id: 'sede-berthollet', nome: 'Berthollet', attiva: true },
]

// I due istanti di Greenwich su cui si prova. Il giorno scelto è un martedì,
// così «la settimana» non è quella che comincia oggi.
const MEZZANOTTE_MENO_MEZZORA = '2026-09-15T23:30:00.000Z'
const MEZZANOTTE_PIU_MEZZORA  = '2026-09-16T00:30:00.000Z'

/** Il giorno locale e il giorno di Greenwich nell'istante fissato. */
function giorni() {
  const ora = new Date()
  return { locale: formatLocalDate(ora), greenwich: ora.toISOString().slice(0, 10) }
}

/** Rende la pagina e aspetta che le due sedi abbiano finito di caricare. */
async function rendi() {
  const r = render(<ConfrontoSedi orgId={ORG} sedi={SEDI} />)
  for (let i = 0; i < 40; i++) {
    await new Promise(res => setTimeout(res, 0))
    if (!/Caricamento|skeleton/i.test(document.body.innerHTML) && /Prodotti oggi/.test(document.body.textContent)) break
  }
  return r
}

/** Il numero scritto nella riga «Prodotti oggi» per la prima sede. */
function prodottiOggiPrimaSede() {
  const righe = Array.from(document.querySelectorAll('tr'))
  const riga = righe.find(tr => tr.textContent.startsWith('Prodotti oggi'))
  if (!riga) return null
  const celle = Array.from(riga.querySelectorAll('td'))
  return celle[1] ? celle[1].textContent.trim() : null
}

beforeEach(() => {
  stato.giornaliero = {}
  stato.fatture = []
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('«Prodotti oggi» conta il giorno dell’orologio, non quello di Greenwich', () => {
  for (const istante of [MEZZANOTTE_MENO_MEZZORA, MEZZANOTTE_PIU_MEZZORA]) {
    it(`alle ${istante.slice(11, 16)} di Greenwich conta le teglie di oggi, e solo quelle`, async () => {
      vi.setSystemTime(new Date(istante))
      const { locale } = giorni()
      // Tre sessioni: ieri, oggi, domani. Numeri di stampi diversi, così il
      // giorno sbagliato non può somigliare a quello giusto.
      stato.giornaliero[SEDI[0].id] = [
        { data: `${aggiungiGiorni(locale, -1)}T06:00:00`, prodotti: [{ stampi: 5 }] },
        { data: `${locale}T01:10:00`,                     prodotti: [{ stampi: 2 }, { stampi: 1 }] },
        { data: `${aggiungiGiorni(locale, +1)}T06:00:00`, prodotti: [{ stampi: 9 }] },
      ]
      await rendi()
      expect(prodottiOggiPrimaSede()).toBe('3')
    })
  }

  it('la sessione del giorno di Greenwich non entra, se non è anche quella di oggi', async () => {
    vi.setSystemTime(new Date(MEZZANOTTE_MENO_MEZZORA))
    const { locale, greenwich } = giorni()
    if (locale === greenwich) {
      // È il caso di Greenwich e dei fusi che in questo istante coincidono:
      // qui non c'è nessuna differenza da mostrare, e pretenderla sarebbe
      // un'asserzione falsa travestita da test (la trappola raccontata in
      // `fusoOrarioDeiTest.test.js`). Si prova comunque il fatto positivo.
      stato.giornaliero[SEDI[0].id] = [{ data: `${locale}T08:00:00`, prodotti: [{ stampi: 4 }] }]
      await rendi()
      expect(prodottiOggiPrimaSede()).toBe('4')
      return
    }
    // Qui i due giorni sono diversi: la sessione datata col giorno di
    // Greenwich è di un altro giorno e non deve contare.
    stato.giornaliero[SEDI[0].id] = [
      { data: `${greenwich}T22:00:00`, prodotti: [{ stampi: 7 }] },
      { data: `${locale}T01:00:00`,    prodotti: [{ stampi: 4 }] },
    ]
    await rendi()
    expect(prodottiOggiPrimaSede()).toBe('4')
  })

  it('senza sessioni la colonna dice zero, non un trattino', async () => {
    vi.setSystemTime(new Date(MEZZANOTTE_PIU_MEZZORA))
    stato.giornaliero[SEDI[0].id] = []
    await rendi()
    expect(prodottiOggiPrimaSede()).toBe('0')
  })
})

describe('«Fatture scadute»: si è in ritardo dal giorno DOPO la scadenza', () => {
  for (const istante of [MEZZANOTTE_MENO_MEZZORA, MEZZANOTTE_PIU_MEZZORA]) {
    it(`alle ${istante.slice(11, 16)} di Greenwich non conta scaduta quella che scade oggi`, async () => {
      vi.setSystemTime(new Date(istante))
      const { locale } = giorni()
      stato.fatture = [
        // Scade oggi: non è in ritardo.
        { id: 'f1', sede_id: SEDI[0].id, stato: 'da_pagare', totale: 100, data_fattura: '2026-08-01', data_scadenza: locale },
        // Scaduta ieri: è in ritardo, ed è l'unica.
        { id: 'f2', sede_id: SEDI[0].id, stato: 'da_pagare', totale: 200, data_fattura: '2026-08-01', data_scadenza: aggiungiGiorni(locale, -1) },
        // Scade domani: non è in ritardo.
        { id: 'f3', sede_id: SEDI[0].id, stato: 'da_pagare', totale: 300, data_fattura: '2026-08-01', data_scadenza: aggiungiGiorni(locale, +1) },
      ]
      await rendi()
      // L'avviso rosso porta il numero: una sola, e al singolare.
      expect(document.body.textContent).toContain('1 fattura scaduta da pagare')
      expect(document.body.textContent).not.toContain('2 fatture scadute')
      expect(document.body.textContent).not.toContain('3 fatture scadute')
    })
  }

  it('tutte in regola: nessun allarme rosso sulle fatture', async () => {
    vi.setSystemTime(new Date(MEZZANOTTE_MENO_MEZZORA))
    const { locale } = giorni()
    stato.fatture = [
      { id: 'f1', sede_id: SEDI[0].id, stato: 'da_pagare', totale: 100, data_fattura: '2026-08-01', data_scadenza: locale },
      { id: 'f2', sede_id: SEDI[1].id, stato: 'da_pagare', totale: 100, data_fattura: '2026-08-01', data_scadenza: aggiungiGiorni(locale, +3) },
    ]
    await rendi()
    expect(document.body.textContent).not.toContain('scaduta da pagare')
    expect(document.body.textContent).not.toContain('scadute da pagare')
  })
})

describe('righello — l’istante scelto è davvero dentro la finestra rotta', () => {
  it('in almeno uno dei due istanti il giorno locale è diverso da quello di Greenwich (tranne a Greenwich)', () => {
    const differenze = []
    for (const istante of [MEZZANOTTE_MENO_MEZZORA, MEZZANOTTE_PIU_MEZZORA]) {
      vi.setSystemTime(new Date(istante))
      const { locale, greenwich } = giorni()
      if (locale !== greenwich) differenze.push(istante)
    }
    const offsetOre = -new Date(MEZZANOTTE_MENO_MEZZORA).getTimezoneOffset() / 60
    if (offsetOre === 0) {
      // Fuso di Greenwich: nessun istante può separare i due giorni, perché
      // sono lo stesso giorno per definizione. Le prove qui sopra restano
      // vere, ma non dimostrano niente sul difetto — e va detto, non
      // nascosto.
      expect(differenze).toHaveLength(0)
    } else {
      expect(differenze.length).toBeGreaterThan(0)
    }
  })
})

describe('l’etichetta delle otto settimane è un lunedì (censimento n.21)', () => {
  it('nessuna riga viva del file ricava un giorno da toISOString()', async () => {
    // `lunIso` non finisce oggi sotto gli occhi di nessuno: è un dato del
    // grafico che la pagina non disegna ancora. Per questo il controllo è
    // sul codice e non su quello che si vede — ma guarda le RIGHE VIVE, non
    // i commenti, che qui parlano apposta del difetto vecchio.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const sorgente = readFileSync(resolve(process.cwd(), 'src/components/ConfrontoSedi.jsx'), 'utf8')
    const vive = sorgente
      .split('\n')
      .filter(r => !r.trim().startsWith('//') && !r.trim().startsWith('*') && !r.trim().startsWith('/*'))
      .join('\n')
    // Il giorno di calendario si ricava con `isoDi` (locale) o con gli
    // attrezzi di `dateLocal`. `toISOString()` va bene solo per gli istanti,
    // e qui di istanti scritti non ce ne sono.
    expect(vive).not.toMatch(/toISOString\(\)\s*\.\s*slice\(0,\s*10\)/)
    expect(vive).not.toMatch(/toISOString\(\)\s*\.\s*split\('T'\)/)
  })

  it('il lunedì calcolato dalla pagina resta un lunedì in tutti e due gli istanti', () => {
    // La stessa aritmetica di `getStartOfWeek` + l'etichetta, messe a nudo.
    for (const istante of [MEZZANOTTE_MENO_MEZZORA, MEZZANOTTE_PIU_MEZZORA]) {
      vi.setSystemTime(new Date(istante))
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      // Come lo formatta la pagina adesso: righello locale.
      const isoDi = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
      const etichetta = isoDi(d)
      // Un lunedì, letto senza far passare la stringa da `new Date()`.
      const [y, m, g] = etichetta.split('-').map(Number)
      expect(new Date(Date.UTC(y, m - 1, g)).getUTCDay()).toBe(1)
    }
  })
})
