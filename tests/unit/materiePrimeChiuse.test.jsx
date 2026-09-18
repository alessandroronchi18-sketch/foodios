// @vitest-environment happy-dom
//
// ── Un ingrediente scritto storto non deve entrare in silenzio ────────────
//
// Il difetto, segnalato dal titolare il 18/09/2026:
//
//   «come si fa a evitare l'errore dell'utente? magari scrive aceto balsamicp
//    con la p finale e lo inserisce e si scasinano tutti i calcoli»
//
// È peggio di come suona. Un ingrediente battuto male non dà nessun errore,
// non si distingue a vista da uno giusto, e nel calcolo del food cost vale
// **zero** — perché nel listino quel nome non esiste. Risultato: la ricetta
// costa meno del vero, il margine sembra migliore del vero, e non c'è niente
// a schermo che lo dica. È la stessa famiglia del difetto che sui dati veri
// di Mara faceva uscire un food cost medio del 4,8% invece del 25-35%.
//
// La correzione è in due pezzi. Questo file copre il primo: `CampoConElenco`
// impara a lavorare a elenco chiuso — riconosce il nome che non c'è, propone
// quello che gli assomiglia, e offre di crearlo davvero invece di lasciare
// l'utente in un vicolo cieco. Chiuso non vuol dire sbarrato.
import React, { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CampoConElenco, vociVicine } from '../../src/views/_shared.jsx'

const MATERIE = ['ACETO BALSAMICO', 'PANNA', 'ZUCCHERO', 'PASTA NOCCIOLA', 'UVA']

function Campo({ soloDallElenco = true, onCreaNuova = null, iniziale = '' }) {
  const [v, setV] = useState(iniziale)
  return (
    <CampoConElenco valore={v} onCambia={setV} voci={MATERIE}
      soloDallElenco={soloDallElenco} onCreaNuova={onCreaNuova}
      etichettaCrea="Crea la materia prima" ariaLabel="Ingrediente" />
  )
}

describe('Il nome che non esiste viene detto subito', () => {
  it('«ACETO BALSAMICP» viene segnalato, non accettato in silenzio', () => {
    render(<Campo iniziale="ACETO BALSAMICP" />)
    // Chiudo l'elenco: l'avviso sta sotto il campo, non sopra i suggerimenti.
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(screen.getByText(/non è fra le tue materie prime/i)).toBeTruthy()
  })

  it('e propone quella giusta: una lettera di differenza', () => {
    render(<Campo iniziale="ACETO BALSAMICP" />)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(screen.getByRole('button', { name: /usa ACETO BALSAMICO/i })).toBeTruthy()
  })

  it('premendo la proposta il campo si corregge da solo', () => {
    render(<Campo iniziale="ACETO BALSAMICP" />)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: /usa ACETO BALSAMICO/i }))
    expect(screen.getByRole('combobox').value).toBe('ACETO BALSAMICO')
  })

  it('un nome giusto non viene segnalato', () => {
    render(<Campo iniziale="PANNA" />)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(screen.queryByText(/non è fra le tue materie prime/i)).toBeNull()
  })

  it('il campo vuoto non è un errore: è un campo vuoto', () => {
    render(<Campo iniziale="" />)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(screen.queryByText(/non è fra le tue materie prime/i)).toBeNull()
  })
})

describe('Chiuso non vuol dire sbarrato', () => {
  it('se si può creare, il campo lo offre', () => {
    const crea = vi.fn()
    render(<Campo iniziale="CARDAMOMO" onCreaNuova={crea} />)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    const bottone = screen.getByRole('button', { name: /crea la materia prima/i })
    fireEvent.click(bottone)
    expect(crea).toHaveBeenCalledWith('CARDAMOMO')
  })

  it('senza elenco chiuso il campo si comporta come sempre', () => {
    render(<Campo soloDallElenco={false} iniziale="QUELLO CHE VOGLIO" />)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(screen.queryByText(/non è fra le tue materie prime/i)).toBeNull()
  })
})

describe('Quale voce si propone, e quando conviene tacere', () => {
  it('una lettera storta su una parola lunga: si propone', () => {
    expect(vociVicine('aceto balsamicp', MATERIE)).toBe('ACETO BALSAMICO')
    expect(vociVicine('pasta nocciolla', MATERIE)).toBe('PASTA NOCCIOLA')
  })

  it('su una parola corta due lettere sono un’altra parola, non un errore', () => {
    // «uva» → «ava» è un refuso; «uva» → «pane» no. La soglia cresce con la
    // lunghezza proprio per questo.
    expect(vociVicine('uva', MATERIE)).toBe('UVA')
    expect(vociVicine('pane', MATERIE)).toBeNull()
  })

  it('con meno di tre lettere non si indovina', () => {
    // Su due lettere qualunque proposta sarebbe un tiro a caso, e una
    // proposta sbagliata è peggio di nessuna proposta.
    expect(vociVicine('uv', MATERIE)).toBeNull()
    expect(vociVicine('', MATERIE)).toBeNull()
  })

  it('senza voci da confrontare non si rompe', () => {
    expect(vociVicine('panna', [])).toBeNull()
    expect(vociVicine('panna')).toBeNull()
  })

  it('non si lascia ingannare dalle maiuscole', () => {
    expect(vociVicine('Panna', MATERIE)).toBe('PANNA')
    expect(vociVicine('  zuccero  ', MATERIE)).toBe('ZUCCHERO')
  })
})

// ── Il secondo pezzo: in «Nuovo gusto» il blocco è vero ───────────────────
//
// 18/09/2026, secondo giro. Qui c'erano quattro prove che LEGGEVANO IL
// SORGENTE e cercavano delle parole. Un audit le ha smontate in un colpo:
// mettendo `soloDallElenco={false}` — cioè **spegnendo la protezione** che dà
// il nome al lavoro di oggi — restavano tutte verdi, perché `={false}`
// contiene comunque la stringa `soloDallElenco`. Erano 241 test su 241 verdi
// con la funzione principale disattivata.
//
// È lo stesso equivoco già capitato due volte in questo progetto (un test che
// cercava una frase dentro il commento che ne spiegava la rimozione). Adesso
// si monta la pagina vera e si prova quello che succede all'utente.
import NuovaRicettaView from '../../src/views/NuovaRicettaView.jsx'

const RICETTARIO = {
  ingredienti_costi: { panna: { costoKg: 4.7, costoG: 0.0047 } },
  ricette: {
    'FIOR DI LATTE': {
      nome: 'FIOR DI LATTE', tipo: 'gusto', unita: 1, prezzo: 0,
      ingredienti: [{ nome: 'panna', qty1stampo: 500 }],
    },
  },
}

function apriNuovoGusto(onSave = async () => {}) {
  return render(
    <NuovaRicettaView ricettario={RICETTARIO} notify={() => {}} onSave={onSave}
      editingRicetta={null} onEditConsumed={() => {}} tipoAttivita="gelateria" />
  )
}

function scrivi(utils, nome, grammi) {
  fireEvent.change(utils.getByLabelText('Nome ingrediente da aggiungere'), { target: { value: nome } })
  fireEvent.change(utils.getByLabelText('Grammi di ingrediente da aggiungere'), { target: { value: String(grammi) } })
}

describe('In Nuovo gusto un ingrediente inventato non entra', () => {
  it('scrivendo un nome che non esiste, la pagina lo dice', () => {
    const utils = apriNuovoGusto()
    scrivi(utils, 'Aceto balsamicp', 50)
    fireEvent.keyDown(utils.getByLabelText('Nome ingrediente da aggiungere'), { key: 'Escape' })
    expect(utils.getByText(/non è fra le tue materie prime/i)).toBeTruthy()
  })

  it('premendo «Aggiungi» NON entra nella ricetta', () => {
    const utils = apriNuovoGusto()
    // La somma degli ingredienti è il modo più diretto di vedere se una riga
    // è entrata: cercare il nome a schermo non basta, perché il nome compare
    // comunque dentro la finestra che si apre per crearlo.
    const somma = () => utils.container.textContent.match(/Somma ingredienti\s*([\d.]+)\s*g/)?.[1]
    expect(somma()).toBe('0')
    scrivi(utils, 'Aceto balsamicp', 50)
    fireEvent.click(utils.getByLabelText('Aggiungi ingrediente alla ricetta'))
    expect(somma(), 'l\'ingrediente inventato è entrato lo stesso').toBe('0')
  })

  it('al suo posto si apre la finestra per crearla davvero', () => {
    const utils = apriNuovoGusto()
    scrivi(utils, 'Aceto balsamicp', 50)
    fireEvent.click(utils.getByLabelText('Aggiungi ingrediente alla ricetta'))
    expect(utils.getByRole('dialog')).toBeTruthy()
    expect(utils.getByRole('dialog').textContent).toMatch(/Aceto balsamicp/i)
  })

  it('e c’è la via d’uscita per chi il prezzo non lo sa', () => {
    const utils = apriNuovoGusto()
    scrivi(utils, 'Aceto balsamicp', 50)
    fireEvent.click(utils.getByLabelText('Aggiungi ingrediente alla ricetta'))
    expect(utils.getByRole('button', { name: /il prezzo lo metto dopo/i })).toBeTruthy()
  })

  it('un ingrediente che esiste entra senza storie', () => {
    const utils = apriNuovoGusto()
    scrivi(utils, 'Panna', 300)
    fireEvent.click(utils.getByLabelText('Aggiungi ingrediente alla ricetta'))
    expect(utils.queryByRole('dialog')).toBeNull()
    // Due volte: quella della ricetta di partenza non c'è (modulo nuovo),
    // quindi la riga aggiunta adesso è l'unica.
    expect(utils.getAllByText(/Panna/i).length).toBeGreaterThan(0)
  })
})

describe('Creando la materia prima senza prezzo', () => {
  it('si salva `null`, non `0`: zero vorrebbe dire «gratis»', async () => {
    const salvati = []
    const utils = apriNuovoGusto(async (r) => { salvati.push(r) })
    scrivi(utils, 'Farcitura segreta zz', 20)
    fireEvent.click(utils.getByLabelText('Aggiungi ingrediente alla ricetta'))
    fireEvent.click(utils.getByRole('button', { name: /il prezzo lo metto dopo/i }))
    await waitFor(() => expect(salvati.length).toBeGreaterThan(0))
    const voce = salvati[salvati.length - 1].ingredienti_costi['farcitura segreta zz']
    expect(voce).toBeTruthy()
    expect(voce.costoKg).toBeNull()
    expect(voce.costoG).toBeNull()
  })

  it('e la riga entra nella ricetta con la chiave vera del listino', async () => {
    const salvati = []
    const utils = apriNuovoGusto(async (r) => { salvati.push(r) })
    scrivi(utils, 'Farcitura segreta zz', 20)
    fireEvent.click(utils.getByLabelText('Aggiungi ingrediente alla ricetta'))
    fireEvent.click(utils.getByRole('button', { name: /il prezzo lo metto dopo/i }))
    await waitFor(() => expect(utils.queryByRole('dialog')).toBeNull())
    // La chiave è quella con cui il food cost va a cercare il prezzo:
    // riscriverla sarebbe il modo più silenzioso di far sparire un costo.
    expect(utils.container.textContent).toMatch(/Farcitura segreta zz/i)
  })
})
