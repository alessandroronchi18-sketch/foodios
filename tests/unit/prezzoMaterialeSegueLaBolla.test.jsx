// @vitest-environment happy-dom
//
// ── Il prezzo del materiale, sulla pagina ───────────────────────────────
//
// Il gemello di `materialiPrezzoUnPostoSolo.test.js`: quello prova il conto,
// questo prova che la pagina mostri quel conto e non la copia vecchia.
//
// Il difetto, 22/09/2026: `FormatiVendita.jsx` copiava il costo del materiale
// dentro il formato **nel momento in cui lo sceglievi**, e non ci tornava più
// sopra. La schermata prometteva «il prezzo si corregge in un posto solo» e
// invece correggerlo nell'elenco non muoveva nessuno degli otto formati già
// composti del design partner — tutti fermi a 0,001 € di cialda.
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

let MATERIALI = []
let FORMATI = []
const salvataggi = []

vi.mock('../../src/lib/storage', () => ({
  sload: async (key) => {
    if (key === 'pasticceria-materiali-confezionamento-v1') return MATERIALI
    if (key === 'pasticceria-formati-vendita-v1') return FORMATI
    return null
  },
  ssave: async (key, val) => { salvataggi.push([key, val]) },
}))

const { default: FormatiVendita } = await import('../../src/components/FormatiVendita.jsx')

// Il Cono Grande di Mara com'era in produzione: 5,50 € di prezzo e due
// millesimi di euro di materiali.
const CONO = {
  id: 'f1', nome: 'Cono Grande', categoria: 'Gusto', baseQtaG: 180, prezzoDefault: 5.5,
  componenti: [{ nome: 'Cialda', qta: 1, costo: 0.001 }, { nome: 'Fazzoletto', qta: 1, costo: 0.001 }],
}

function apri(ricettario = { ricette: {}, ingredienti_costi: {} }) {
  return render(<FormatiVendita orgId="o1" ricettario={ricettario} onSaveRicettario={async () => {}}
    notify={() => {}} tipoAttivita="gelateria" sedi={[]} />)
}
const testo = () => document.body.textContent || ''

beforeEach(() => {
  salvataggi.length = 0
  MATERIALI = []
  FORMATI = [CONO]
})

describe('Correggere l\'elenco corregge i formati già composti', () => {
  it('il formato mostra il prezzo dell\'elenco, non la sua copia', async () => {
    MATERIALI = [{ nome: 'Cialda', costo: 0.06 }, { nome: 'Fazzoletto', costo: 0.01 }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono Grande'))
    // 0,060 + 0,010 = 0,070. Prima qui si leggeva 0,002.
    await waitFor(() => expect(testo()).toContain('0,070'))
    expect(testo()).not.toContain('0,002 €')
  })

  it('e senza elenco resta il numero vecchio, invece di sparire', async () => {
    // Un materiale fuori elenco non va azzerato: zero direbbe «gratis».
    apri()
    await waitFor(() => expect(testo()).toContain('Cono Grande'))
    await waitFor(() => expect(testo()).toContain('0,002'))
  })
})

describe('Il prezzo che lo fa la bolla', () => {
  it('un materiale legato a una materia prima prende il prezzo del magazzino', async () => {
    // Le cialde stanno a 12 €/kg e una pesa 5 g: 0,060 € l'una.
    MATERIALI = [{ nome: 'Cialda', legatoA: 'cialde cono', pesoG: 5 }, { nome: 'Fazzoletto', costo: 0.01 }]
    apri({ ricette: {}, ingredienti_costi: { 'cialde cono': { costoKg: 12, costoG: 0.012 } } })
    await waitFor(() => expect(testo()).toContain('Cono Grande'))
    await waitFor(() => expect(testo()).toContain('0,070'))
  })

  it('se la materia prima collegata non ha prezzo, il formato tiene il suo numero', async () => {
    MATERIALI = [{ nome: 'Cialda', legatoA: 'non esiste', pesoG: 5 }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono Grande'))
    await waitFor(() => expect(testo()).toContain('0,002'))
  })
})

describe('Nell\'editor il prezzo non si corregge in due posti', () => {
  it('un materiale dell\'elenco mostra il suo prezzo, e non è una casella da riscrivere', async () => {
    MATERIALI = [{ nome: 'Cialda', costo: 0.06 }, { nome: 'Fazzoletto', costo: 0.01 }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono Grande'))
    fireEvent.click(screen.getByRole('button', { name: /^Modifica/i }))
    await screen.findByLabelText(/Materiale 1/i)
    // Prima c'erano due caselle numeriche per riga (qtà e costo): adesso il
    // costo di un materiale in elenco è scritto, non battuto.
    expect(screen.queryByDisplayValue('0.001')).toBeNull()
    expect(testo()).toContain('0,060')
  })

  it('un materiale fuori elenco resta correggibile a mano', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('Cono Grande'))
    fireEvent.click(screen.getByRole('button', { name: /^Modifica/i }))
    await screen.findByLabelText(/Materiale 1/i)
    expect(screen.queryAllByDisplayValue('0.001').length).toBeGreaterThan(0)
  })
})

describe('Il collegamento al magazzino si imposta dall\'elenco dei materiali', () => {
  it('ogni materiale offre di far decidere il prezzo alle bolle', async () => {
    MATERIALI = [{ nome: 'Cialda', costo: 0.06 }]
    apri()
    fireEvent.click(await screen.findByRole('button', { name: /i tuoi materiali/i }))
    expect(await screen.findByRole('button', { name: /decidere il prezzo alle bolle/i })).toBeTruthy()
  })

  it('e quando è collegato lo dice, con la materia prima e il peso', async () => {
    MATERIALI = [{ nome: 'Cialda', legatoA: 'cialde cono', pesoG: 5 }]
    apri({ ricette: {}, ingredienti_costi: { 'cialde cono': { costoKg: 12, costoG: 0.012 } } })
    fireEvent.click(await screen.findByRole('button', { name: /i tuoi materiali/i }))
    await waitFor(() => expect(testo()).toMatch(/segue «cialde cono»/))
    expect(testo()).toContain('5 g a pezzo')
  })

  it('aprendolo si sceglie la materia prima e si scrive quanto pesa uno', async () => {
    MATERIALI = [{ nome: 'Cialda', costo: 0.06 }]
    apri({ ricette: {}, ingredienti_costi: { 'cialde cono': { costoKg: 12, costoG: 0.012 } } })
    fireEvent.click(await screen.findByRole('button', { name: /i tuoi materiali/i }))
    fireEvent.click(await screen.findByRole('button', { name: /decidere il prezzo alle bolle/i }))
    expect(await screen.findByLabelText(/Materia prima collegata/i)).toBeTruthy()
    expect(screen.getByLabelText(/Peso di un/i)).toBeTruthy()
  })
})

describe('Quello che salva', () => {
  it('salvando un formato ci finisce dentro il prezzo dell\'elenco', async () => {
    MATERIALI = [{ nome: 'Cialda', costo: 0.06 }, { nome: 'Fazzoletto', costo: 0.01 }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono Grande'))
    fireEvent.click(screen.getByRole('button', { name: /^Modifica/i }))
    await screen.findByLabelText(/Materiale 1/i)
    fireEvent.click(screen.getByRole('button', { name: /^Salva/i }))
    await waitFor(() => expect(salvataggi.some(([k]) => k === 'pasticceria-formati-vendita-v1')).toBe(true))
    const [, arr] = [...salvataggi].reverse().find(([k]) => k === 'pasticceria-formati-vendita-v1')
    const cialda = arr[0].componenti.find(c => c.nome === 'Cialda')
    expect(cialda.costo).toBeCloseTo(0.06, 6)
  })
})

describe('Il righello di questo file', () => {
  it('la pagina si disegna davvero e il formato c\'è', async () => {
    apri()
    expect(await waitFor(() => expect(testo()).toContain('Cono Grande'))).toBeTruthy()
    expect(document.querySelectorAll('button').length).toBeGreaterThan(2)
  })
})
