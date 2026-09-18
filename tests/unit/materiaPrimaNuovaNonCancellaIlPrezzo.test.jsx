// @vitest-environment happy-dom
//
// Nuovo gusto: scrivere il PLURALE di un ingrediente ne cancellava il prezzo.
//
// ═══ Il difetto, trovato il 18/09/2026 ════════════════════════════════════
//
// Il 18/09/2026 il campo «Ingrediente» di Nuovo gusto è stato chiuso: non si
// può più scrivere un nome qualsiasi, perché «aceto balsamicp» con la p
// finale entrava nella ricetta e valeva zero nel food cost senza dirlo. Chi
// scrive un nome che non c'è si vede offrire di crearlo, con la finestra del
// prezzo e il pulsante «Il prezzo lo metto dopo».
//
// Il guaio è che il controllo «questo nome non c'è» e la scrittura in
// archivio usavano due normalizzatori diversi:
//
//   · il controllo (`ingredienteSconosciuto`) passava da `formatNome`, che
//     abbassa le maiuscole e cambia i trattini bassi in spazi. Basta quello.
//   · la scrittura (`creaSenzaPrezzo`) passava da `normIng`, che è la chiave
//     vera di tutto il prodotto: abbassa, collassa gli spazi doppi **e mappa
//     il plurale sul singolare** (SING_PLUR: 70 coppie).
//
// Su 29 di quelle 70 coppie i due non coincidono. Risultato, con il listino
// che ha «bacca di vaniglia» a 380,00 €/kg:
//
//   1. scrivo «Bacche di vaniglia» — che è come si scrive in una ricetta;
//   2. `formatNome` fa «Bacche di vaniglia», che in elenco non c'è (in
//      elenco c'è «Bacca di vaniglia»): il programma la dichiara nuova;
//   3. clicco «Il prezzo lo metto dopo»;
//   4. `normIng` fa «bacca di vaniglia» — quella che il prezzo ce l'ha — e
//      `ingredienti_costi['bacca di vaniglia']` viene **sovrascritto** con
//      `{ costoKg: null }`.
//
// Il prezzo è distrutto, in silenzio, insieme al food cost di ogni ricetta
// che usava la vaniglia. È la famiglia del food cost medio al 4,8%, ma
// peggio: lì il prezzo mancava, qui c'era e l'abbiamo cancellato noi.
//
// Gli altri nomi che facevano lo stesso: Scorze di limone, Croissant (→
// cornetto), Bignè, Meringhe, Biscotti, Cioccolato fondente 72%, Patate,
// Cipolle, Olive, Pomodori. E il doppio spazio: «farina  00».
//
// ═══ Cosa protegge questo file ════════════════════════════════════════════
//
//  1. il difetto: il plurale non deve più cancellare niente;
//  2. la correzione: il plurale trova la materia prima che c'è già, la riga
//     entra con la chiave giusta e con il suo costo;
//  3. quello che c'è intorno: il nome davvero nuovo deve ancora fermare
//     l'utente e offrirgli di crearlo (è il difetto che si stava correggendo
//     il 18/09, non va perso), il doppio clic non deve inserire due righe, e
//     un prezzo battuto storto («12,5o») non si salva come se fosse buono.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, ssaveBatch: async () => {},
  sload: async () => null, sloadAllSedi: async () => ({}),
}))

const NuovaRicettaView = (await import('../../src/views/NuovaRicettaView.jsx')).default
const { normIng } = await import('../../src/lib/foodcost.js')

// Il listino ha la forma SINGOLARE, che è quella che `normIng` produce e
// quindi quella che sta davvero in archivio.
const RICETTARIO = {
  ingredienti_costi: {
    'bacca di vaniglia': { costoKg: 380, costoG: 0.38 },
    burro: { costoKg: 9, costoG: 0.009 },
  },
  ricette: {
    'PASTA FROLLA BASE': {
      nome: 'PASTA FROLLA BASE', tipo: 'fetta', unita: 8, prezzo: 10,
      ingredienti: [{ nome: 'burro', qty1stampo: 250 }],
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

const barra = () => screen.getByLabelText(/nome ingrediente da aggiungere/i)
const grammi = () => screen.getByLabelText(/grammi di ingrediente da aggiungere/i)

function aggiungi(nome, g) {
  fireEvent.change(barra(), { target: { value: nome } })
  fireEvent.change(grammi(), { target: { value: String(g) } })
  fireEvent.click(screen.getByRole('button', { name: 'Aggiungi ingrediente alla ricetta' }))
}

afterEach(() => cleanup())

describe('Nuovo gusto - il plurale non cancella il prezzo della materia prima', () => {
  it('il presupposto: normIng manda il plurale sul singolare', () => {
    // Se un giorno SING_PLUR cambiasse, questo test dice subito che il resto
    // del file sta provando un'altra cosa.
    expect(normIng('Bacche di vaniglia')).toBe('bacca di vaniglia')
    expect(normIng('farina  00')).toBe('farina 00')
  })

  it('IL DIFETTO: scrivendo il plurale, il listino non viene toccato', async () => {
    const salvate = []
    monta({ onSave: async (r) => { salvate.push(r) } })

    aggiungi('Bacche di vaniglia', 5)

    // Sul codice di prima qui si apriva la finestra «Aggiungila alle tue
    // materie prime», si cliccava «Il prezzo lo metto dopo» e il prezzo di
    // «bacca di vaniglia» diventava null. Adesso la finestra non si apre
    // proprio: la materia prima c'è già.
    expect(screen.queryByText(/Aggiungila alle tue materie prime/i)).toBeNull()

    // E il listino è intatto: nessuna scrittura che azzera il prezzo.
    await waitFor(() => {
      const azzerato = salvate.some(r => r?.ingredienti_costi?.['bacca di vaniglia']?.costoKg == null)
      expect(azzerato).toBe(false)
    })
    expect(RICETTARIO.ingredienti_costi['bacca di vaniglia'].costoKg).toBe(380)
  })

  it('LA CORREZIONE: la riga entra con la chiave giusta e col suo costo', () => {
    monta()
    aggiungi('Bacche di vaniglia', 5)
    // 380 €/kg × 0,005 kg = 1,90 €. Se il nome non trovasse il prezzo, qui ci
    // sarebbe «prezzo mancante» e la ricetta costerebbe meno del vero.
    expect(screen.getByText('1,90 €')).toBeTruthy()
    expect(screen.queryByText(/prezzo mancante/i)).toBeNull()
  })

  it('anche il doppio spazio trova la materia prima che c\'è già', () => {
    monta({
      ricettario: {
        ...RICETTARIO,
        ingredienti_costi: { ...RICETTARIO.ingredienti_costi, 'farina 00': { costoKg: 1.2, costoG: 0.0012 } },
      },
    })
    aggiungi('Farina  00', 1000)   // due spazi, come capita battendo in fretta
    expect(screen.queryByText(/Aggiungila alle tue materie prime/i)).toBeNull()
    expect(screen.getByText('1,20 €')).toBeTruthy()
  })

  it('INTORNO: un nome davvero nuovo continua a fermarsi e a farsi creare', () => {
    monta()
    aggiungi('Sciroppo di sambuco', 30)
    expect(screen.getByText(/Aggiungila alle tue materie prime/i)).toBeTruthy()
  })

  it('INTORNO: creare senza prezzo scrive null, e non tocca gli altri prezzi', async () => {
    const salvate = []
    monta({ onSave: async (r) => { salvate.push(r) } })
    aggiungi('Sciroppo di sambuco', 30)
    fireEvent.click(screen.getByRole('button', { name: /Il prezzo lo metto dopo/i }))
    await waitFor(() => expect(salvate.length).toBe(1))
    const costi = salvate[0].ingredienti_costi
    expect(costi['sciroppo di sambuco']).toEqual({ costoKg: null, costoG: null })
    // Gli altri restano dov'erano.
    expect(costi['bacca di vaniglia'].costoKg).toBe(380)
    expect(costi.burro.costoKg).toBe(9)
  })

  it('INTORNO: un prezzo battuto storto non si salva come se fosse buono', async () => {
    // `parseFloat('12.5o')` risponde 12.5 senza un fiato: la o al posto dello
    // zero è l'errore di battitura più comune sulla tastiera del telefono, e
    // il prezzo finiva in archivio a 12,50 €/kg come se fosse stato scritto
    // bene. La pagina Materie prime lo rifiuta già (`leggiPrezzoKg`): qui
    // faceva l'opposto, sullo stesso dato.
    const salvate = []
    monta({ onSave: async (r) => { salvate.push(r) } })
    aggiungi('Sciroppo di sambuco', 30)
    fireEvent.change(screen.getByLabelText(/prezzo al chilo in euro/i), { target: { value: '12,5o' } })
    fireEvent.click(screen.getByRole('button', { name: /Salva prezzo/i }))
    // Niente salvataggio: il prezzo non è un prezzo.
    await waitFor(() => expect(salvate.length).toBe(0))
    expect(screen.getByText(/Aggiungila alle tue materie prime/i)).toBeTruthy()
  })

  it('INTORNO: due Invio di fila non mettono l\'ingrediente due volte', async () => {
    let risolvi
    const attesa = new Promise(r => { risolvi = r })
    const salvate = []
    monta({ onSave: async (r) => { salvate.push(r); await attesa } })

    aggiungi('Sciroppo di sambuco', 30)
    const campo = screen.getByLabelText(/prezzo al chilo in euro/i)
    fireEvent.change(campo, { target: { value: '14,00' } })
    // Il pulsante si disabilita durante l'attesa, il tasto Invio no: due
    // pressioni rapide facevano due salvataggi e **due righe** identiche
    // dentro la ricetta, cioè il doppio del costo.
    fireEvent.keyDown(campo, { key: 'Enter' })
    fireEvent.keyDown(campo, { key: 'Enter' })
    risolvi()

    await waitFor(() => expect(screen.queryByText(/Aggiungila alle tue materie prime/i)).toBeNull())
    // Un salvataggio solo…
    expect(salvate.length).toBe(1)

    // …e soprattutto una riga sola nella ricetta. È lì che si vedeva il
    // danno: due righe identiche da 30 g fanno costare la ricetta il doppio.
    fireEvent.change(screen.getByLabelText(/^nome ricetta$/i), { target: { value: 'CROSTATA' } })
    fireEvent.click(screen.getByRole('button', { name: /Salva nuova ricetta/i }))
    await waitFor(() => expect(salvate.length).toBe(2))
    const ings = salvate[1].ricette.CROSTATA.ingredienti
    expect(ings.filter(i => i.nome === 'sciroppo di sambuco')).toHaveLength(1)
  })
})
