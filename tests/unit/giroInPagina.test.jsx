// @vitest-environment happy-dom
//
// ── Il giro, sulla pagina ───────────────────────────────────────────────
//
// Il titolare, 23/09/2026: «i trasferimenti vengono fatti anche tutti i
// giorni ma solo per un kg di gelato». E alla domanda «chi scrive in lista?»
// ha scelto l'opzione (c): **tutt'e due** — Foodos propone quello che vede
// dalle giacenze, e chi è al banco aggiunge quello che sa lui.
//
// Nessuna delle due da sola basta: le giacenze non sanno che domani c'è un
// evento, e chi è al banco non ha il tempo di guardare tre magazzini.
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

let GIRI = { giorni: [] }
let LISTA = []
let MAGAZZINO = {}
const salvati = []
const creati = []

vi.mock('../../src/lib/storage', () => ({
  sload: async (key) => {
    if (key === 'pasticceria-giri-trasferimenti-v1') return GIRI
    if (key === 'pasticceria-lista-giro-v1') return LISTA
    if (key === 'pasticceria-magazzino-v1') return MAGAZZINO
    return null
  },
  ssave: async (key, val) => { salvati.push([key, val]) },
}))

vi.mock('../../src/lib/trasferimenti', () => ({
  creaTrasferimento: async (p) => { creati.push(p); return { id: `t-${creati.length}` } },
}))

let FORNITORI = []
let ORDINI = []
vi.mock('../../src/lib/supabase', () => {
  const q = (nome) => {
    const o = {
      select: () => o,
      eq: () => o,
      then: (r) => Promise.resolve({ data: nome === 'fornitori' ? FORNITORI : ORDINI, error: null }).then(r),
    }
    return o
  }
  return { supabase: { from: q } }
})

const { default: GiroTrasferimenti } = await import('../../src/components/GiroTrasferimenti.jsx')

const SEDI = [
  { id: 'carlina', nome: 'Carlina' },
  { id: 'berth', nome: 'Berthollet' },
  { id: 'gasperi', nome: 'De Gasperi' },
]

const apri = (p = {}) => render(
  <GiroTrasferimenti orgId="o1" sedeId="carlina" sedi={SEDI}
    sedeAttiva={{ id: 'carlina', nome: 'Carlina' }} notify={() => {}} {...p} />,
)
const testo = () => document.body.textContent || ''

beforeEach(() => {
  salvati.length = 0; creati.length = 0
  GIRI = { giorni: [] }; LISTA = []; MAGAZZINO = {}
  FORNITORI = []; ORDINI = []
})

describe('Foodos propone quello che vede', () => {
  it('le materie prime sotto la loro soglia compaiono', () => {
    MAGAZZINO = { pistacchio: { nome: 'Pistacchio', giacenza_g: 500, soglia_g: 2000 } }
    apri()
    return waitFor(() => {
      expect(testo()).toMatch(/Sotto scorta qui/)
      expect(testo()).toContain('Pistacchio')
      expect(testo()).toMatch(/ne hai 500 g, la soglia è 2 kg/)
    })
  })

  it('ma una senza soglia no: zero non vuol dire «non serve mai»', async () => {
    // Una soglia mai impostata è «non lo so», e proporre un trasferimento su
    // un «non lo so» vuol dire far uscire il furgone per niente.
    MAGAZZINO = { zucchero: { nome: 'Zucchero', giacenza_g: 0, soglia_g: 0 } }
    apri()
    await new Promise(r => setTimeout(r, 40))
    expect(testo()).not.toMatch(/Sotto scorta qui/)
  })

  it('e quella che è già in lista non si propone due volte', async () => {
    MAGAZZINO = { pistacchio: { nome: 'Pistacchio', giacenza_g: 500, soglia_g: 2000 } }
    LISTA = [{ id: 'l1', chiave: 'pistacchio', prodotto: 'Pistacchio', quantita: 3000 }]
    apri()
    await waitFor(() => expect(testo()).toMatch(/In lista/))
    expect(testo()).not.toMatch(/Sotto scorta qui/)
  })
})

describe('E chi è al banco aggiunge quello che sa lui', () => {
  it('si scrive cosa serve e finisce in lista', async () => {
    apri()
    await waitFor(() => expect(screen.getByLabelText(/Cosa ti serve/i)).toBeTruthy())
    fireEvent.change(screen.getByLabelText(/Cosa ti serve/i), { target: { value: 'pistacchio' } })
    fireEvent.change(screen.getByLabelText(/Quanti grammi/i), { target: { value: '3000' } })
    fireEvent.click(screen.getByRole('button', { name: /Aggiungi/i }))
    await waitFor(() => expect(salvati.some(([k]) => k === 'pasticceria-lista-giro-v1')).toBe(true))
    const [, l] = [...salvati].reverse().find(([k]) => k === 'pasticceria-lista-giro-v1')
    expect(l[0]).toMatchObject({ prodotto: 'pistacchio', quantita: 3000 })
  })

  it('una quantità non scritta resta «non lo so», non diventa zero', async () => {
    // Uno zero in lista è una riga che al banco nessuno sa cosa voglia dire.
    apri()
    await waitFor(() => expect(screen.getByLabelText(/Cosa ti serve/i)).toBeTruthy())
    fireEvent.change(screen.getByLabelText(/Cosa ti serve/i), { target: { value: 'nocciola' } })
    fireEvent.click(screen.getByRole('button', { name: /Aggiungi/i }))
    await waitFor(() => expect(salvati.length).toBeGreaterThan(0))
    const [, l] = [...salvati].reverse().find(([k]) => k === 'pasticceria-lista-giro-v1')
    expect(l[0].quantita).toBe(null)
  })
})

describe('Il conto dice cosa fare', () => {
  it('senza giorni impostati lo dice, invece di fingere di sapere', async () => {
    LISTA = [{ id: 'l1', prodotto: 'Pistacchio', quantita: 3000 }]
    apri()
    await waitFor(() => expect(testo()).toMatch(/Imposta i giorni del giro/))
  })

  it('i giorni si scelgono, e si ricordano', async () => {
    apri()
    await waitFor(() => expect(screen.getByRole('button', { name: /Quali giorni si fa il giro/i })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Quali giorni si fa il giro/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'mar' }))
    await waitFor(() => expect(salvati.some(([k]) => k === 'pasticceria-giri-trasferimenti-v1')).toBe(true))
    const [, g] = [...salvati].reverse().find(([k]) => k === 'pasticceria-giri-trasferimenti-v1')
    expect(g.giorni).toEqual([2])
  })

  it('quando qualcuno ci sta già andando, si porta tutto senza soglie', async () => {
    // «Non sempre» ci andrebbe comunque: quando ci va, il viaggio è già
    // pagato e anche il mezzo chilo conviene.
    GIRI = { giorni: [2, 5] }
    LISTA = [{ id: 'l1', prodotto: 'Fiordilatte', quantita: 2000, giacenza: 10000, consumoGiornaliero: 2000 }]
    apri()
    await waitFor(() => expect(testo()).toMatch(/In lista/))
    fireEvent.click(screen.getByLabelText(/ci sta già andando/i))
    await waitFor(() => expect(testo()).toMatch(/Il viaggio lo fai comunque/))
  })
})

describe('Creare i trasferimenti', () => {
  it('senza «da chi» non si crea niente: sarebbe una giacenza dal nulla', async () => {
    LISTA = [{ id: 'l1', prodotto: 'Pistacchio', quantita: 3000 }]
    apri()
    await waitFor(() => expect(testo()).toMatch(/In lista/))
    fireEvent.click(screen.getByRole('button', { name: /Crea i trasferimenti/i }))
    await new Promise(r => setTimeout(r, 40))
    expect(creati).toEqual([])
  })

  it('con «da chi», parte verso questo negozio e in chili', async () => {
    LISTA = [{ id: 'l1', prodotto: 'Pistacchio', quantita: 3000, da: 'berth' }]
    apri()
    await waitFor(() => expect(testo()).toMatch(/In lista/))
    fireEvent.click(screen.getByRole('button', { name: /Crea i trasferimenti/i }))
    await waitFor(() => expect(creati.length).toBe(1))
    expect(creati[0]).toMatchObject({
      orgId: 'o1', sedeDa: 'berth', sedeA: 'carlina',
      prodotto: 'Pistacchio', quantita: 3, unita: 'kg', tipo: 'materia_prima',
    })
  })

  it('e quello che è partito esce dalla lista, il resto resta', async () => {
    LISTA = [
      { id: 'l1', prodotto: 'Pistacchio', quantita: 3000, da: 'berth' },
      { id: 'l2', prodotto: 'Nocciola', quantita: 1000 },
    ]
    apri()
    await waitFor(() => expect(testo()).toMatch(/In lista/))
    fireEvent.click(screen.getByRole('button', { name: /Crea i trasferimenti/i }))
    await waitFor(() => expect(creati.length).toBe(1))
    const [, l] = [...salvati].reverse().find(([k]) => k === 'pasticceria-lista-giro-v1')
    expect(l.map(r => r.prodotto)).toEqual(['Nocciola'])
  })
})

describe('Il righello di questo file', () => {
  it('senza sede non disegna niente: la lista è di un negozio', () => {
    const { container } = apri({ sedeId: null })
    expect(container.textContent).toBe('')
  })
})

describe('Già che vai da quella parte', () => {
  // Il titolare, 23/09/2026: «magari il negozio che rifornisce un ingrediente
  // si trova vicino a De Gasperi, quindi uno esce a consegnare e nel
  // frattempo compra la materia prima». È il risparmio più grosso — il
  // viaggio si fa comunque — e il più facile da perdere.
  it('se un fornitore da cui si ritira è da queste parti e ha un ordine pronto, lo dice', async () => {
    FORNITORI = [{ id: 'f1', nome: 'ConoArtic', telefono: '0116964241', vicino_a_sede: 'carlina', si_ritira: true }]
    ORDINI = [{ fornitore_id: 'f1', stato: 'inviato' }]
    LISTA = [{ id: 'l1', prodotto: 'Pistacchio', quantita: 3000 }]
    apri()
    await waitFor(() => expect(testo()).toMatch(/Già che vai da quella parte/))
    expect(testo()).toContain('ConoArtic')
    expect(testo()).toContain('0116964241')
  })

  it('ma non di chi consegna lui: passare sarebbe un giro in più', async () => {
    FORNITORI = [{ id: 'f1', nome: 'DESA', vicino_a_sede: 'carlina', si_ritira: false }]
    ORDINI = [{ fornitore_id: 'f1', stato: 'inviato' }]
    LISTA = [{ id: 'l1', prodotto: 'Pistacchio', quantita: 3000 }]
    apri()
    await waitFor(() => expect(testo()).toMatch(/In lista/))
    expect(testo()).not.toMatch(/Già che vai/)
  })
})

describe('Con che mezzo', () => {
  it('quattro chili si portano a piedi, e lo dice', async () => {
    // Il più piccolo che basta, non il più comodo: se quattro chili si
    // portano a piedi, il furgone è una macchina accesa per niente.
    LISTA = [{ id: 'l1', prodotto: 'Pistacchio', quantita: 4000 }]
    apri()
    await waitFor(() => expect(testo()).toMatch(/Con che mezzo/))
    expect(testo()).toMatch(/ci stanno a piedi/)
    expect(testo()).toMatch(/il mezzo più piccolo che basta/)
  })

  it('e venti chili a piedi no, con i numeri', async () => {
    LISTA = [{ id: 'l1', prodotto: 'Pistacchio', quantita: 20000 }]
    apri()
    await waitFor(() => expect(testo()).toMatch(/Con che mezzo/))
    fireEvent.click(screen.getByRole('button', { name: 'A piedi' }))
    await waitFor(() => expect(testo()).toMatch(/20 kg a piedi non ci stanno/))
    expect(testo()).toMatch(/due viaggi/)
  })
})
