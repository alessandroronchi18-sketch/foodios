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
import { render, screen, fireEvent } from '@testing-library/react'
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
// L'avviso a schermo da solo non protegge niente: si può sempre premere
// Invio, o il pulsante «Aggiungi». Questi test guardano il punto dove
// l'ingrediente entra davvero nella ricetta.
describe('In Nuovo gusto un ingrediente inventato non entra', () => {
  it('il campo lavora a elenco chiuso e sa creare quello che manca', async () => {
    const fs = await import('node:fs')
    const s = fs.readFileSync('src/views/NuovaRicettaView.jsx', 'utf8')
    const campo = s.slice(s.indexOf('id="ingrediente-nuovo"'), s.indexOf('id="ingrediente-nuovo"') + 600)
    expect(campo).toContain('soloDallElenco')
    expect(campo).toContain('onCreaNuova={creaMateriaPrima}')
  })

  it('«Aggiungi» si ferma se il nome non esiste: l’avviso da solo non basta', async () => {
    const fs = await import('node:fs')
    const s = fs.readFileSync('src/views/NuovaRicettaView.jsx', 'utf8')
    const add = s.slice(s.indexOf('const addIng = () => {'), s.indexOf('const removeIng'))
    // Il controllo deve stare PRIMA della riga che aggiunge l'ingrediente,
    // altrimenti ferma qualcosa che è già entrato.
    const posControllo = add.indexOf('ingredienteSconosciuto(newIngNome)')
    const posAggiunta = add.indexOf('setForm(')
    expect(posControllo).toBeGreaterThan(-1)
    expect(posControllo).toBeLessThan(posAggiunta)
  })

  it('non è un vicolo cieco: il nome battuto arriva nella finestra di creazione', async () => {
    const fs = await import('node:fs')
    const s = fs.readFileSync('src/views/NuovaRicettaView.jsx', 'utf8')
    const crea = s.slice(s.indexOf('const creaMateriaPrima'), s.indexOf('const addIng'))
    expect(crea).toContain('setPriceModal')
    // I grammi già battuti si mettono da parte: senza, dopo aver creato la
    // materia prima bisognerebbe riscrivere tutto da capo e la protezione
    // sembrerebbe un ostacolo.
    expect(crea).toContain('daAggiungere')
  })

  it('creata la materia prima, la riga si aggiunge da sola', async () => {
    const fs = await import('node:fs')
    const s = fs.readFileSync('src/views/NuovaRicettaView.jsx', 'utf8')
    const salva = s.slice(s.indexOf('const handleSavePrezzoIng'), s.indexOf('const handleSavePrezzoIng') + 2200)
    expect(salva).toContain('priceModal.daAggiungere')
    // E ci finisce con la chiave vera del ricettario, non con quello che
    // l'utente vedeva scritto: è quella la chiave con cui il food cost trova
    // il prezzo.
    expect(salva).toMatch(/nome: key/)
  })
})
