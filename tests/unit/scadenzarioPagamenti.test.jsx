// @vitest-environment happy-dom
//
// Lo Scadenzario, che è la strada da cui escono i soldi.
//
// 3.119 righe e lo 0,7% coperto: il file più grande del prodotto senza rete di
// protezione, ed è quello dove si decide quali fatture risultano pagate. Il
// titolare ha detto che Mara paga **tutti** i fornitori con bonifico, quindi
// ogni errore qui dentro finisce su un conto corrente.
//
// Il 16/09, guardandolo, ci è stato trovato dentro un difetto che segnava
// pagate le fatture sbagliate (gli indici della riconciliazione bancaria
// contati sulla lista filtrata). Dove non si guarda non è che non ci sono
// difetti: è che non si vedono. Questi test guardano.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import React from 'react'

// ── Il database, con dentro un scadenzario vero ────────────────────────────
const OGGI = new Date()
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const giorniFa = (n) => { const d = new Date(OGGI); d.setDate(d.getDate() - n); return iso(d) }
const fraGiorni = (n) => { const d = new Date(OGGI); d.setDate(d.getDate() + n); return iso(d) }

const FATTURE = [
  // Scaduta da un mese, la più vecchia del fornitore.
  { id: 'f1', fornitore: 'CONO ARTICO SPA', numero_rif: '101', totale: 500,
    data_fattura: giorniFa(60), data_scadenza: giorniFa(30), stato: 'da_pagare', importo_pagato: 0, tipo: 'fattura' },
  // Aperta, scade fra una settimana.
  { id: 'f2', fornitore: 'CONO ARTICO SPA', numero_rif: '102', totale: 300,
    data_fattura: giorniFa(10), data_scadenza: fraGiorni(7), stato: 'da_pagare', importo_pagato: 0, tipo: 'fattura' },
  // Nota di credito dello stesso fornitore: NON è un debito, si sottrae.
  { id: 'f3', fornitore: 'CONO ARTICO SPA', numero_rif: 'NC7', totale: -100,
    data_fattura: giorniFa(5), data_scadenza: fraGiorni(10), stato: 'da_pagare', importo_pagato: 0, tipo: 'nota_credito' },
  // Un altro fornitore, con un acconto già versato.
  { id: 'f4', fornitore: 'LATTERIA ALPINA SRL', numero_rif: '77', totale: 1000,
    data_fattura: giorniFa(20), data_scadenza: fraGiorni(3), stato: 'da_pagare', importo_pagato: 400, tipo: 'fattura' },
  // Già pagata: non deve entrare nei totali del dovuto.
  { id: 'f5', fornitore: 'LATTERIA ALPINA SRL', numero_rif: '76', totale: 250,
    data_fattura: giorniFa(40), data_scadenza: giorniFa(10), stato: 'pagata', importo_pagato: 250, tipo: 'fattura' },
]

const FORNITORI = [
  { id: 's1', nome: 'Cono Artico SPA', nome_norm: 'cono artico spa', iban: 'IT60X0542811101000000123456', termini_pagamento: 30, categoria: 'Ingredienti', attivo: true },
  { id: 's2', nome: 'Latteria Alpina SRL', nome_norm: 'latteria alpina srl', iban: null, termini_pagamento: 60, categoria: 'Latticini', attivo: true },
]

// Un finto client che risponde come Supabase.
//
// Non basta restituire sempre tutte le righe: la pagina fa DUE interrogazioni
// — le aperte e le pagate di recente — e un finto database troppo generoso
// restituisce le stesse fatture a tutte e due, che poi si sommano. Uscivano
// dieci fatture invece di cinque e 3.900 € di dovuto invece di 1.300: il test
// misurava il finto database, non la pagina.
//
// Quindi i filtri si ricordano, e la risposta li rispetta.
function client() {
  const q = (tabella) => {
    const filtri = []
    const h = {
      get(_t, p) {
        if (p === 'then') {
          return (res) => {
            if (tabella === 'fornitori') return res({ data: FORNITORI, error: null })
            if (tabella !== 'fatture') return res({ data: [], error: null })
            let righe = FATTURE
            for (const [op, col, val] of filtri) {
              if (col !== 'stato') continue
              if (op === 'eq') righe = righe.filter(f => f.stato === val)
              if (op === 'neq') righe = righe.filter(f => f.stato !== val)
            }
            return res({ data: righe, error: null })
          }
        }
        if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
        if (p === 'eq' || p === 'neq') {
          return (col, val) => { filtri.push([p, col, val]); return new Proxy({}, h) }
        }
        return () => new Proxy({}, h)
      },
    }
    return new Proxy({}, h)
  }
  return {
    from: (tabella) => q(tabella),
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u' } } }) },
  }
}

vi.mock('../../src/lib/supabase', () => ({ supabase: client() }))
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false }))
vi.mock('../../src/components/ConfirmModal', () => ({ useConfirm: () => async () => true }))

let Scadenzario
beforeEach(async () => {
  vi.resetModules()
  Scadenzario = (await import('../../src/components/Scadenzario')).default
})

// La pagina si apre su «Per scadenza»: i totali per fornitore stanno
// nell'altra vista, e vanno guardati lì.
const apriPerFornitore = async (v) => {
  const b = [...v.container.querySelectorAll('button')].find(x => /Per fornitore/i.test(x.textContent || ''))
  expect(b, 'manca la vista per fornitore').toBeTruthy()
  fireEvent.click(b)
  await new Promise(r => setTimeout(r, 50))
}

const monta = async () => {
  const v = render(<Scadenzario orgId="org-1" sedeId="s1" sedi={[{ id: 's1', nome: 'Corso Vittorio', attiva: true }]} />)
  await waitFor(() => expect(v.container.textContent).not.toMatch(/^\s*$/))
  await new Promise(r => setTimeout(r, 80))
  return v
}

describe('quanto si deve, davvero', () => {
  it('il dovuto è al netto delle note di credito', async () => {
    const v = await monta()
    await apriPerFornitore(v)
    const { container } = v
    // Cono Artico: 500 + 300 − 100 = 700 €. Se la nota di credito venisse
    // sommata invece che sottratta uscirebbe 900, e si pagherebbero 200 € in
    // più di quanto si deve.
    //
    // Si guarda la RIGA del fornitore, non tutta la pagina: «900 €» compare
    // legittimamente più su, nel riquadro «in scadenza questa settimana»
    // (300 + 600). Un'asserzione su tutta la pagina misura le cose sbagliate.
    const riga = [...container.querySelectorAll('div')]
      .filter(d => /CONO ARTICO/.test(d.textContent || '') && /€/.test(d.textContent || ''))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0]
    expect(riga, 'manca la riga di Cono Artico').toBeTruthy()
    expect(riga.textContent).toMatch(/700/)
    expect(riga.textContent).not.toMatch(/900/)
  })

  it('un acconto già versato non si ripaga', async () => {
    const v = await monta()
    await apriPerFornitore(v)
    const { container } = v
    // Latteria: 1.000 di fattura, 400 già dati → restano 600.
    expect(container.textContent).toMatch(/600/)
  })

  it('e le fatture già pagate non entrano nel dovuto', async () => {
    const v = await monta()
    await apriPerFornitore(v)
    const { container } = v
    // La 76 da 250 € è pagata: il totale della Latteria resta 600, non 850.
    expect(container.textContent).not.toMatch(/850/)
  })

  it('i due fornitori compaiono tutti e due', async () => {
    await monta()
    expect(screen.getAllByText(/Cono Artico/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Latteria Alpina/i).length).toBeGreaterThan(0)
  })
})

describe('quello che è scaduto si vede che è scaduto', () => {
  it('la fattura scaduta da un mese è segnalata', async () => {
    const { container } = await monta()
    expect(container.textContent).toMatch(/scadut/i)
  })
})

describe('le quattro viste ci sono tutte', () => {
  it('scadenzario, fornitori, cassa in uscita', async () => {
    await monta()
    for (const nome of [/Per scadenza/i, /Per fornitore/i, /Cassa in uscita/i]) {
      expect(screen.getAllByText(nome).length).toBeGreaterThan(0)
    }
  })
})

describe('il bonifico non parte senza IBAN', () => {
  it('il fornitore senza IBAN è dichiarato, non saltato in silenzio', async () => {
    const v = await monta()
    await apriPerFornitore(v)
    const { container } = v
    // Latteria Alpina non ha IBAN: nel file dei bonifici non può entrare, e
    // chi guarda deve saperlo PRIMA di caricare il file in banca.
    expect(container.textContent).toMatch(/no IBAN|IBAN mancante|senza IBAN/i)
  })
})

// ─── Il segno delle note di credito ────────────────────────────────────────
//
// Trovato scrivendo questi test, ed è il difetto più caro della giornata: il
// segno si prendeva dall'ETICHETTA (`tipo === 'nota_credito'`) e veniva
// moltiplicato per il totale. Giusto solo se le note di credito sono scritte
// col totale positivo.
//
// Nel database vero non c'è **nemmeno una riga** con `tipo = 'nota_credito'`:
// tutte e 3.520 sono «fattura», e le note di credito sono fatture con
// l'importo negativo — quattro, fino a −365,55 €. Con le due convenzioni
// mescolate, una nota di credito da 100 € dichiarata come tale e scritta −100
// diventava +100, e il dovuto al fornitore usciva **200 € più alto del vero**.
// Su una schermata da cui partono i bonifici, sono 200 € pagati in più.

import { arricchisci } from '../../src/lib/scadenzeFatture'

describe('una nota di credito vale meno di zero, comunque sia scritta', () => {
  const base = { id: 'x', fornitore: 'CONO ARTICO SPA', data_fattura: '2026-09-01', stato: 'da_pagare', importo_pagato: 0 }
  const uno = (patch) => arricchisci([{ ...base, ...patch }], [])[0]

  it('dichiarata nota di credito, scritta positiva → sottrae', () => {
    const f = uno({ tipo: 'nota_credito', totale: 100 })
    expect(f.residuo).toBe(-100)
    expect(f.isNC).toBe(true)
  })

  it('dichiarata nota di credito, scritta NEGATIVA → sottrae lo stesso', () => {
    // Era questo il difetto: il segno applicato due volte dava +100.
    const f = uno({ tipo: 'nota_credito', totale: -100 })
    expect(f.residuo, 'il segno è stato applicato due volte').toBe(-100)
    expect(f.isNC).toBe(true)
  })

  it('non dichiarata ma scritta negativa → è una nota di credito lo stesso', () => {
    // È il caso VERO del database: `tipo: 'fattura'` e totale negativo.
    const f = uno({ tipo: 'fattura', totale: -365.55 })
    expect(f.residuo).toBe(-365.55)
    expect(f.isNC, 'una fattura negativa è una nota di credito, e va contata come tale').toBe(true)
  })

  it('una fattura normale resta positiva', () => {
    const f = uno({ tipo: 'fattura', totale: 500 })
    expect(f.residuo).toBe(500)
    expect(f.isNC).toBe(false)
  })

  it('un acconto su una fattura normale riduce il residuo', () => {
    const f = uno({ tipo: 'fattura', totale: 1000, importo_pagato: 400 })
    expect(f.residuo).toBe(600)
  })

  it('e una nota di credito già usata non conta più', () => {
    const f = uno({ tipo: 'nota_credito', totale: 100, stato: 'pagata' })
    expect(f.residuo).toBe(0)
  })

  it('la somma di un fornitore torna col netto', () => {
    const righe = arricchisci([
      { ...base, id: 'a', tipo: 'fattura', totale: 500 },
      { ...base, id: 'b', tipo: 'fattura', totale: 300 },
      { ...base, id: 'c', tipo: 'nota_credito', totale: -100 },
    ], [])
    expect(righe.reduce((s, f) => s + f.residuo, 0)).toBe(700)
  })
})
