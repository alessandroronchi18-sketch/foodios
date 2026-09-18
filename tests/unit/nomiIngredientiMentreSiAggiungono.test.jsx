// @vitest-environment happy-dom
//
// Nuovo gusto: i nomi degli ingredienti si leggevano in maiuscolo finché li si
// stava aggiungendo.
//
// Segnalato dal titolare di Mara dei Boschi il 18/09/2026: i nomi devono avere
// la prima lettera maiuscola e il resto minuscolo «anche mentre si
// aggiungono», non solo quando si rileggono.
//
// Nella tabella della ricetta ci pensava già `formatNome`. L'elenco che si
// apre sotto la barra «Ingrediente», invece, mostrava le chiavi del ricettario
// così come stanno: tutte minuscole, perché `normIng` le abbassa per poterle
// confrontare, e ogni tanto con il trattino basso («farina_00»).
//
// La correzione tocca solo quello che si legge, e questi test stanno soprattutto
// a guardia del pezzo che NON deve cambiare: il nome che finisce dentro la
// ricetta resta la chiave esatta del ricettario. È quella la chiave con cui il
// food cost va a cercare il prezzo, e riscriverla sarebbe il modo più
// silenzioso di far sparire un costo.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, ssaveBatch: async () => {},
  sload: async () => null, sloadAllSedi: async () => ({}),
}))

const NuovaRicettaView = (await import('../../src/views/NuovaRicettaView.jsx')).default
const { formatNome } = await import('../../src/views/_shared.jsx')

// Un ricettario con due nomi scritti come li scrive la macchina: minuscolo e
// con il trattino basso. Sono esattamente le forme che escono da normIng.
const RICETTARIO = {
  ingredienti_costi: {
    burro: { costoKg: 9, costoG: 0.009 },
    farina_00: { costoKg: 1.2, costoG: 0.0012 },
    // 18/09/2026: queste due esistono come materie prime ma NON hanno prezzo
    // (`null`, non `0`, che vorrebbe dire «gratis»). È lo stato in cui nasce
    // una materia prima creata col pulsante «Il prezzo lo metto dopo», ed è
    // quello che serve ai due test qui sotto — da oggi in «Nuovo gusto»
    // l'elenco è chiuso e un nome inventato non entra più.
    'farcitura della nonna': { costoKg: null, costoG: null },
    'sciroppo segreto': { costoKg: null, costoG: null },
  },
  ricette: {
    'PASTA FROLLA BASE': {
      nome: 'PASTA FROLLA BASE', tipo: 'fetta', unita: 8, prezzo: 10,
      ingredienti: [{ nome: 'burro', qty1stampo: 250 }, { nome: 'farina_00', qty1stampo: 500 }],
    },
  },
}

function monta({ ricettario = RICETTARIO, onSave = async () => {} } = {}) {
  return render(
    <NuovaRicettaView
      ricettario={ricettario}
      onSave={onSave}
      notify={() => {}}
      editingRicetta={null}
      onEditConsumed={() => {}}
      tipoAttivita="pasticceria"
    />
  )
}

const barraIngrediente = () => screen.getByLabelText(/nome ingrediente da aggiungere/i)

function aggiungi(nome, grammi) {
  fireEvent.change(barraIngrediente(), { target: { value: nome } })
  fireEvent.change(screen.getByLabelText(/grammi di ingrediente da aggiungere/i), { target: { value: String(grammi) } })
  fireEvent.click(screen.getByRole('button', { name: 'Aggiungi ingrediente alla ricetta' }))
}

async function salva(onSaveRaccolta) {
  fireEvent.change(screen.getByLabelText(/^nome ricetta$/i), { target: { value: 'CROSTATA' } })
  fireEvent.click(screen.getByRole('button', { name: /Salva nuova ricetta/i }))
  await waitFor(() => expect(onSaveRaccolta.length).toBe(1))
  return onSaveRaccolta[0].ricette.CROSTATA.ingredienti
}

afterEach(() => cleanup())

describe('Nuovo gusto - i nomi degli ingredienti mentre si aggiungono', () => {
  it('il difetto: l\'elenco sotto la barra mostrava i nomi in minuscolo', () => {
    monta()
    fireEvent.change(barraIngrediente(), { target: { value: 'burr' } })
    const voci = within(screen.getByRole('listbox')).getAllByRole('option').map(o => o.textContent)
    expect(voci).toContain('Burro')
    expect(voci).not.toContain('burro')
  })

  it('anche il trattino basso sparisce da quello che si legge', () => {
    monta()
    fireEvent.change(barraIngrediente(), { target: { value: 'farina 0' } })
    const voci = within(screen.getByRole('listbox')).getAllByRole('option').map(o => o.textContent)
    expect(voci).toContain('Farina 00')
    expect(voci.some(v => v.includes('_'))).toBe(false)
  })

  it('scegliendo dall\'elenco, il campo e la riga si leggono con la maiuscola', () => {
    monta()
    fireEvent.change(barraIngrediente(), { target: { value: 'burr' } })
    fireEvent.mouseDown(within(screen.getByRole('listbox')).getByText('Burro'))
    expect(barraIngrediente().value).toBe('Burro')

    fireEvent.change(screen.getByLabelText(/grammi di ingrediente da aggiungere/i), { target: { value: '250' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi ingrediente alla ricetta' }))
    expect(screen.getByText('Burro')).toBeTruthy()
  })

  it('quello che si salva resta la chiave esatta del ricettario', async () => {
    const salvate = []
    monta({ onSave: async (r) => { salvate.push(r) } })
    aggiungi('Burro', 250)
    aggiungi('Farina 00', 500)
    const ings = await salva(salvate)
    expect(ings.map(i => i.nome)).toEqual(['burro', 'farina_00'])
  })

  it('il food cost non si muove: la riga costa quanto costava', () => {
    monta()
    aggiungi('Burro', 250)          // 9 €/kg × 0,250 kg = 2,25 €
    expect(screen.getByText('2,25 €')).toBeTruthy()
    // E non compare il badge «prezzo mancante»: vorrebbe dire che il nome
    // salvato non trova più il suo prezzo nel listino.
    expect(screen.queryByText(/prezzo mancante/i)).toBeNull()
  })

  it('fra due scritture della stessa cosa vince quella che ha un prezzo suo', async () => {
    // «farina_00» ha un prezzo nel listino; «farina 00» esiste solo nel
    // listino HoReCa, cioè è una stima. Si leggono uguali: se il programma
    // salvasse la stima, un costo vero diventerebbe un prezzo di mercato.
    const salvate = []
    monta({ onSave: async (r) => { salvate.push(r) } })
    aggiungi('Farina 00', 1000)
    // 1,20 €/kg è il suo prezzo; 0,88 €/kg sarebbe la stima HoReCa.
    expect(screen.getByText('1,20 €')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Metti il tuo prezzo/i })).toBeNull()
    const ings = await salva(salvate)
    expect(ings[0].nome).toBe('farina_00')
  })

  it('una materia prima senza prezzo si salva con la sua chiave, non con l\'etichetta', async () => {
    // 18/09/2026 — prima questo test diceva: «un ingrediente nuovo, che in
    // elenco non c'è, si salva come l'ha scritto lui». Quel comportamento è
    // stato tolto di proposito: scrivere a mano permetteva «aceto balsamicp»,
    // che nel food cost vale zero senza dirlo.
    //
    // Quello che il test proteggeva davvero resta, ed è più importante: il
    // nome che finisce nella ricetta dev'essere la CHIAVE del ricettario
    // (minuscola, com'è salvata), non l'etichetta con la maiuscola che si
    // legge a schermo. È quella la chiave con cui il food cost va a cercare
    // il prezzo, e riscriverla sarebbe il modo più silenzioso di far sparire
    // un costo.
    const salvate = []
    monta({ onSave: async (r) => { salvate.push(r) } })
    aggiungi('Farcitura della nonna', 120)
    const ings = await salva(salvate)
    expect(ings[0].nome).toBe('farcitura della nonna')
  })

  it('anche l\'avviso «manca il prezzo» legge il nome, non la chiave', async () => {
    const salvate = []
    monta({ onSave: async (r) => { salvate.push(r) } })
    aggiungi('Sciroppo segreto', 120)
    await waitFor(() => expect(screen.getAllByText(/manca il prezzo di/i).length).toBeGreaterThan(0))
    const avviso = screen.getAllByText(/manca il prezzo di/i)[0]
    expect(avviso.textContent).toMatch(/Sciroppo segreto/)
    expect(avviso.textContent).not.toMatch(/SCIROPPO SEGRETO/)
  })

  it('formatNome resta quello di _shared: non ne esiste una copia qui dentro', () => {
    expect(formatNome('farina_00')).toBe('Farina 00')
    expect(formatNome('BURRO')).toBe('Burro')
    expect(formatNome('')).toBe('')
  })
})
