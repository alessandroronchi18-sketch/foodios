// @vitest-environment happy-dom
//
// Materie prime — i difetti della pagina dei prezzi, che il 18/09/2026 è
// diventata una pagina sua (prima era la quarta scheda del Magazzino).
//
// Questo file nasce da `magazzinoPrezzi.test.jsx`: le prove che proteggevano
// la vecchia scheda sono state portate qui tutte, perché il componente è
// stato trasferito e i difetti che aveva già incontrato sono gli stessi.
// Erano cinque, verificati leggendo il codice il 14/09/2026; il più grave era
// un crash — lo storico dei prezzi chiamava `l.delta.toLocaleString()` senza
// controlli, quindi una riga priva del campo `delta` portava via l'intera
// pagina, non solo la sua cella.
//
// Più quattro difetti nuovi, trovati trasferendo il componente il 18/09/2026:
//
//   1. il badge «stima di mercato» non compariva mai (l'elenco leggeva i
//      prezzi grezzi, dove `isStima` non esiste: nasce in `buildIngCosti`);
//   2. i semilavorati finivano fra le materie prime come «prezzo da
//      impostare», gonfiando il conto su cui si decide se fidarsi del food
//      cost;
//   3. sul telefono il prezzo non si poteva cambiare: il pulsante «Modifica»
//      c'era, il campo per scrivere veniva disegnato solo nella tabella del
//      computer;
//   4. creare una materia prima senza prezzo non deve scrivere zero: zero
//      vuol dire «gratis», e il food cost lo prende alla lettera.

// 19/09/2026 — i nomi delle materie prime si leggono con la prima
// maiuscola («Burro», non «burro»): nel database restano minuscoli, perché
// quella è la chiave con cui il food cost trova il prezzo, e cambiarla
// farebbe sparire un costo in silenzio. Qui cambiano solo le prove su
// quello che si legge a schermo; i dati di prova restano com'erano.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { default: MateriePrimeView } = await import('../../src/views/MateriePrimeView.jsx')

// «burro» sta nel listino medio HoReCa; «aceto balsamicp» no — è il nome
// storto che nasce battendolo a mano dentro una ricetta, ed è il motivo per
// cui questa pagina esiste.
const ricettario = {
  ricette: { r1: { nome: 'SACHER', tipo: 'torta', porzioni: 8, prezzo: 30,
    ingredienti: [{ nome: 'burro', qty1stampo: 300 }] } },
  ingredienti_costi: { burro: { costoKg: 8.4, costoG: 0.0084 } },
}
const base = { ricettario, logPrezzi: [], onUpdatePrezzo: async () => {}, onCreaMateriaPrima: async () => ({ ok: true }) }

const apri = (extra = {}) => render(<MateriePrimeView {...base} {...extra} />)

beforeEach(() => { cleanup() })

describe('materie prime — lo storico non deve far cadere la pagina', () => {
  it('una riga di storico senza `delta` non porta via la pagina', async () => {
    const logPrezzi = [
      { id: 'a', data: '2026-09-01T10:00:00Z', ingrediente: 'burro', prezzoVecchio: 8, prezzoNuovo: 8.4, delta: 0.4, deltaPct: 5 },
      // riga storica malformata: nessun delta, nessun deltaPct
      { id: 'b', data: '2026-08-01T10:00:00Z', ingrediente: 'zucchero', prezzoVecchio: 1, prezzoNuovo: 1.1 },
    ]
    const v = apri({ logPrezzi })
    fireEvent.click(v.getByText(/Storico modifiche/i))
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('zucchero'))
    expect(v.container.textContent.toLowerCase()).toContain('burro')
  })

  it('l\'euro sta dopo la cifra anche nello storico', async () => {
    const logPrezzi = [{ id: 'a', data: '2026-09-01T10:00:00Z', ingrediente: 'burro', prezzoVecchio: 8, prezzoNuovo: 8.4, delta: 0.4, deltaPct: 5 }]
    const v = apri({ logPrezzi })
    fireEvent.click(v.getByText(/Storico modifiche/i))
    await waitFor(() => expect(v.container.textContent).toContain('8,40 €/kg'))
    expect(v.container.textContent).toMatch(/8,00 €\/kg/)
    expect(v.container.textContent).not.toMatch(/€ 8,00/)
  })

  it('la percentuale dello storico si scrive con la virgola', async () => {
    const logPrezzi = [{ id: 'a', data: '2026-09-01T10:00:00Z', ingrediente: 'burro', prezzoVecchio: 8, prezzoNuovo: 8.4, delta: 0.4, deltaPct: 5 }]
    const v = apri({ logPrezzi })
    fireEvent.click(v.getByText(/Storico modifiche/i))
    await waitFor(() => expect(v.container.textContent).toContain('5,0%'))
    expect(v.container.textContent).not.toContain('5.0%')
  })
})

describe('materie prime — modificare un prezzo', () => {
  it('un prezzo scritto male lo dice, invece di non fare niente', async () => {
    // Prima: `if (isNaN(v)) return` muto. Scrivendo «12,5o» il pulsante Salva
    // non faceva niente e non diceva niente: non si capiva se il prezzo era
    // stato rifiutato o se il pulsante era rotto.
    const v = apri()
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    fireEvent.click(v.getByTitle('Clicca per modificare'))
    const campo = await waitFor(() => v.getByLabelText('Prezzo per chilo di burro'))
    fireEvent.change(campo, { target: { value: 'abc' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('scrivi un prezzo in euro per chilo'))
  })

  it('«12,5o» non diventa 12,50 di nascosto', async () => {
    // Trovato dai test il 18/09/2026. Il controllo diceva `isNaN(parseFloat)`,
    // e `parseFloat('12.5o')` risponde 12.5: la o al posto dello zero — quello
    // che si sbaglia sulla tastiera del telefono — passava e salvava un prezzo
    // che nessuno aveva scritto. Su «abc» l'errore si vedeva, su «12,5o» no.
    const chiamate = []
    const v = apri({ onUpdatePrezzo: async (...a) => { chiamate.push(a) } })
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    fireEvent.click(v.getByTitle('Clicca per modificare'))
    const campo = await waitFor(() => v.getByLabelText('Prezzo per chilo di burro'))
    fireEvent.change(campo, { target: { value: '12,5o' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('scrivi un prezzo in euro per chilo'))
    expect(v.container.textContent).not.toContain('Conferma modifica prezzo')
    expect(chiamate).toHaveLength(0)
  })

  it('due clic rapidi su "Conferma e salva" salvano una volta sola', async () => {
    // Due righe nello storico per una modifica sola sono uno storico che non
    // torna, e uno storico che non torna è un P&L che non torna.
    const chiamate = []
    const v = apri({ onUpdatePrezzo: async (...a) => { chiamate.push(a); await new Promise(r => setTimeout(r, 30)) } })
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    fireEvent.click(v.getByTitle('Clicca per modificare'))
    const campo = await waitFor(() => v.getByLabelText('Prezzo per chilo di burro'))
    fireEvent.change(campo, { target: { value: '9,50' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    const conferma = await waitFor(() => {
      const b = [...v.container.querySelectorAll('button')].find(x => /Conferma e salva/.test(x.textContent))
      expect(b).toBeTruthy(); return b
    })
    fireEvent.click(conferma)
    fireEvent.click(conferma)
    fireEvent.click(conferma)
    await new Promise(r => setTimeout(r, 60))
    expect(chiamate).toHaveLength(1)
  })

  it('il pulsante di conferma usa un\'icona, non il carattere di spunta', async () => {
    const v = apri()
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    fireEvent.click(v.getByTitle('Clicca per modificare'))
    const campo = await waitFor(() => v.getByLabelText('Prezzo per chilo di burro'))
    fireEvent.change(campo, { target: { value: '9,50' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    const conferma = await waitFor(() => [...v.container.querySelectorAll('button')].find(x => /Conferma e salva/.test(x.textContent)))
    expect(conferma.querySelector('svg')).toBeTruthy()
    expect(conferma.textContent).not.toContain('✓')
  })

  it('riaprendo e salvando senza toccare niente il prezzo non cambia', async () => {
    // Il campo si precompila con due decimali mentre in archivio i prezzi ne
    // hanno quattro: un ingrediente a 0,8825 €/kg diventava 0,88 da solo.
    const chiamate = []
    const v = apri({
      ricettario: { ...ricettario, ingredienti_costi: { burro: { costoKg: 0.8825, costoG: 0.0008825 } } },
      onUpdatePrezzo: async (...a) => { chiamate.push(a) },
    })
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    fireEvent.click(v.getByTitle('Clicca per modificare'))
    const campo = await waitFor(() => v.getByLabelText('Prezzo per chilo di burro'))
    fireEvent.keyDown(campo, { key: 'Enter' })
    await new Promise(r => setTimeout(r, 20))
    expect(chiamate).toHaveLength(0)
    expect(v.container.textContent).not.toContain('Conferma modifica prezzo')
  })
})

describe('materie prime — un prezzo che non c\'è non è zero', () => {
  it('senza prezzo la finestra dice «mai impostato», non «0,00 €/kg»', async () => {
    // Zero e «non lo so» sono due cose diverse, e questo dato muove il food
    // cost di tutte le ricette che usano quella materia prima.
    const v = apri({
      ricettario: {
        ricette: { r1: { nome: 'INSALATA', tipo: 'torta', ingredienti: [{ nome: 'aceto balsamicp', qty1stampo: 10 }] } },
        ingredienti_costi: {},
      },
    })
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('aceto balsamicp'))
    expect(v.container.textContent.toLowerCase()).toContain('prezzo da impostare')
    fireEvent.click(v.getByTitle('Clicca per modificare'))
    const campo = await waitFor(() => v.getByLabelText('Prezzo per chilo di aceto balsamicp'))
    fireEvent.change(campo, { target: { value: '9,50' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('conferma modifica prezzo'))
    expect(v.container.textContent.toLowerCase()).toContain('mai impostato')
    expect(v.container.textContent).not.toContain('0,00 €/kg')
    expect(v.container.textContent.toLowerCase()).toContain('primo prezzo tuo')
  })

  it('nell\'elenco il prezzo che manca è una lineetta, non uno zero', async () => {
    const v = apri({
      ricettario: {
        ricette: { r1: { nome: 'INSALATA', tipo: 'torta', ingredienti: [{ nome: 'aceto balsamicp', qty1stampo: 10 }] } },
        ingredienti_costi: {},
      },
    })
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('aceto balsamicp'))
    expect(v.getByTitle('Clicca per modificare').textContent).toBe('—')
    expect(v.container.textContent).not.toContain('0,00 €')
  })
})

describe('materie prime — i tre stati del prezzo si vedono', () => {
  it('un prezzo preso dal listino di mercato lo dichiara', async () => {
    // Il badge «stima di mercato» c'era dal 09/09 e non compariva mai:
    // l'elenco leggeva i prezzi grezzi, dove `isStima` non esiste.
    const v = apri({
      ricettario: {
        ricette: { r1: { nome: 'SACHER', tipo: 'torta', ingredienti: [{ nome: 'burro', qty1stampo: 300 }] } },
        ingredienti_costi: {},
      },
    })
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    expect(v.container.textContent.toLowerCase()).toContain('stima di mercato')
    expect(v.container.textContent).not.toContain('Prezzo da impostare')
  })

  it('il prezzo scritto da te non porta nessun badge', async () => {
    const v = apri()
    await waitFor(() => expect(v.container.textContent).toContain('8,40 €/kg'))
    expect(v.container.textContent).not.toContain('stima di mercato')
    expect(v.container.textContent).not.toContain('Prezzo da impostare')
  })

  it('i semilavorati non stanno fra le materie prime', async () => {
    // Il costo di una crema esce dalla sua ricetta: chiederle un prezzo
    // d'acquisto non ha senso, e contarla fra le «senza prezzo» falsa il
    // numero su cui si decide se fidarsi del food cost.
    const v = apri({
      ricettario: {
        ricette: {
          'crema pasticcera': { nome: 'CREMA PASTICCERA', tipo: 'semilavorato', ingredienti: [{ nome: 'latte', qty1stampo: 500 }] },
          torta: { nome: 'TORTA', tipo: 'torta', ingredienti: [{ nome: 'crema pasticcera', qty1stampo: 200 }, { nome: 'burro', qty1stampo: 100 }] },
        },
        ingredienti_costi: {},
      },
    })
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    expect(v.container.textContent.toLowerCase()).toContain('latte')
    expect(v.container.textContent).not.toContain('CREMA PASTICCERA')
    expect(v.container.textContent.toLowerCase()).toContain('i semilavorati non sono qui')
  })
})

describe('materie prime — aggiungerne una nuova', () => {
  it('rifiuta un doppione, anche scritto con lo spazio in fondo', async () => {
    // «PANNA» e «panna » sono la stessa cosa: `normIng` le porta tutte e due
    // a `panna`. Un doppione vuol dire due prezzi per lo stesso ingrediente,
    // e il food cost ne prende uno a caso.
    const chiamate = []
    const v = apri({
      ricettario: { ricette: {}, ingredienti_costi: { panna: { costoKg: 5, costoG: 0.005 } } },
      onCreaMateriaPrima: async (...a) => { chiamate.push(a); return { ok: true } },
    })
    fireEvent.click(v.getByText(/Nuova materia prima/))
    const nome = await waitFor(() => v.getByLabelText('Come si chiama'))
    fireEvent.change(nome, { target: { value: 'panna ' } })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent === 'Aggiungi'))
    await waitFor(() => expect(v.container.textContent).toMatch(/c’è già|c'è già/))
    expect(chiamate).toHaveLength(0)
  })

  it('rifiuta il doppione anche se l\'ingrediente esiste solo dentro una ricetta', async () => {
    // È il caso vero: gli ingredienti nascono scrivendoli dentro una ricetta,
    // e quasi nessuno ha una voce nei prezzi.
    const chiamate = []
    const v = apri({
      ricettario: {
        ricette: { r1: { nome: 'SACHER', ingredienti: [{ nome: 'Burro', qty1stampo: 300 }] } },
        ingredienti_costi: {},
      },
      onCreaMateriaPrima: async (...a) => { chiamate.push(a); return { ok: true } },
    })
    fireEvent.click(v.getByText(/Nuova materia prima/))
    const nome = await waitFor(() => v.getByLabelText('Come si chiama'))
    fireEvent.change(nome, { target: { value: 'BURRO' } })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent === 'Aggiungi'))
    await waitFor(() => expect(v.container.textContent).toMatch(/c’è già|c'è già/))
    expect(chiamate).toHaveLength(0)
  })

  it('una materia prima nuova senza prezzo si crea con «non lo so», non con zero', async () => {
    const chiamate = []
    const v = apri({
      ricettario: { ricette: {}, ingredienti_costi: {} },
      onCreaMateriaPrima: async (...a) => { chiamate.push(a); return { ok: true } },
    })
    fireEvent.click(v.getByText(/Nuova materia prima/))
    const nome = await waitFor(() => v.getByLabelText('Come si chiama'))
    fireEvent.change(nome, { target: { value: '  Aceto  Balsamico ' } })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent === 'Aggiungi'))
    await waitFor(() => expect(chiamate).toHaveLength(1))
    // Il nome arriva ripulito degli spazi doppi, il prezzo è `null`: non 0.
    expect(chiamate[0][0]).toBe('Aceto Balsamico')
    expect(chiamate[0][1]).toBe(null)
  })

  it('un prezzo scritto a zero viene fermato: zero non è «non lo so»', async () => {
    const chiamate = []
    const v = apri({
      ricettario: { ricette: {}, ingredienti_costi: {} },
      onCreaMateriaPrima: async (...a) => { chiamate.push(a); return { ok: true } },
    })
    fireEvent.click(v.getByText(/Nuova materia prima/))
    const nome = await waitFor(() => v.getByLabelText('Come si chiama'))
    fireEvent.change(nome, { target: { value: 'colorante blu' } })
    fireEvent.change(v.getByLabelText('Prezzo al chilo'), { target: { value: '0' } })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent === 'Aggiungi'))
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('zero vuol dire'))
    expect(chiamate).toHaveLength(0)
  })

  it('il prezzo si scrive con la virgola, come si scrive in Italia', async () => {
    const chiamate = []
    const v = apri({
      ricettario: { ricette: {}, ingredienti_costi: {} },
      onCreaMateriaPrima: async (...a) => { chiamate.push(a); return { ok: true } },
    })
    fireEvent.click(v.getByText(/Nuova materia prima/))
    const nome = await waitFor(() => v.getByLabelText('Come si chiama'))
    fireEvent.change(nome, { target: { value: 'colorante blu' } })
    fireEvent.change(v.getByLabelText('Prezzo al chilo'), { target: { value: '12,50' } })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent === 'Aggiungi'))
    await waitFor(() => expect(chiamate).toHaveLength(1))
    expect(chiamate[0][1]).toBe(12.5)
  })

  it('se chi salva rifiuta, l\'errore si legge accanto al campo', async () => {
    // Fra il momento in cui si apre il modulo e quello in cui si salva, il
    // ricettario può essere cambiato da un'altra scheda del browser.
    const v = apri({
      ricettario: { ricette: {}, ingredienti_costi: {} },
      onCreaMateriaPrima: async () => ({ ok: false, errore: 'La rete non risponde.' }),
    })
    fireEvent.click(v.getByText(/Nuova materia prima/))
    const nome = await waitFor(() => v.getByLabelText('Come si chiama'))
    fireEvent.change(nome, { target: { value: 'colorante blu' } })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent === 'Aggiungi'))
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('la rete non risponde.'))
  })
})

describe('materie prime — quello che si vede appena si apre', () => {
  it('dice quante sono senza prezzo, ed è il numero più grosso della pagina', async () => {
    const v = apri({
      ricettario: {
        ricette: { r1: { nome: 'TORTA', ingredienti: [
          { nome: 'aceto balsamicp', qty1stampo: 10 },
          { nome: 'colorante blu', qty1stampo: 5 },
          { nome: 'burro', qty1stampo: 100 },
        ] } },
        ingredienti_costi: {},
      },
    })
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('senza prezzo'))
    // 18/09/2026 pomeriggio: qui ci si aspettava «2», perché «burro» stava
    // nella tessera ambra delle stimate. Ma dal mattino di quel giorno il
    // listino medio di mercato non fa più il conto del food cost, quindi le
    // stimate contano zero come le altre: sono tre, e tre deve dire.
    expect(v.container.textContent).toMatch(/3 materie prime senza prezzo/)
    // Le tessere «Stima di mercato» e «Prezzo tuo» non ci sono più.
    expect(v.container.textContent).not.toContain('Stima di mercato')
    expect(v.container.textContent).not.toContain('Prezzo tuo')
  })

  it('dice in quante ricette entra ogni materia prima, e quali', async () => {
    // Prima era un numero con il suggerimento al passaggio del mouse: sul
    // telefono e sul tablet non si poteva leggere, mostrava solo le prime
    // otto e non si poteva copiare. Adesso il numero è un pulsante.
    const v = apri({
      ricettario: {
        ricette: {
          a: { nome: 'TORTA', ingredienti: [{ nome: 'burro', qty1stampo: 100 }] },
          b: { nome: 'BISCOTTI', ingredienti: [{ nome: 'burro', qty1stampo: 50 }] },
        },
        ingredienti_costi: { burro: { costoKg: 8.4, costoG: 0.0084 } },
      },
    })
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('in quante ricette'))
    const pulsante = [...v.container.querySelectorAll('button[aria-expanded]')]
      .find(b => /2 ricette usano burro/.test(b.getAttribute('aria-label') || ''))
    expect(pulsante, 'il numero delle ricette non è un pulsante').toBeTruthy()
    // Chiuso, i nomi non ci sono.
    expect(v.container.textContent).not.toContain('TORTA')
    fireEvent.click(pulsante)
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('torta'))
    expect(v.container.textContent.toLowerCase()).toContain('biscotti')
    // E nessun suggerimento col mouse al posto dell'elenco.
    const titoli = [...v.container.querySelectorAll('[title]')].map(s => s.getAttribute('title'))
    expect(titoli).not.toContain('TORTA, BISCOTTI')
  })

  it('il testo di istruzioni non parla come un manuale', async () => {
    const v = apri()
    expect(v.container.textContent).not.toContain('richiede conferma esplicita')
    expect(v.container.textContent).not.toContain('registrata nello storico')
    expect(v.container.textContent.toLowerCase()).toContain('clicca sul prezzo per cambiarlo')
  })

  it('il prezzo si preme senza mirare: 44px col dito, 32 col mouse', async () => {
    // Il difetto di partenza era un bersaglio da 22px, impossibile da
    // centrare col polpastrello. La prima correzione lo aveva portato a 40
    // per tutti; il 18/09 è diventato **44 col dito e 32 col mouse**, perché
    // quarantaquattro è la misura di un polpastrello e col puntatore fa solo
    // righe alte il doppio — il titolare le ha viste e le ha chiamate «molto
    // più spesse di prima».
    //
    // Questo dato di prova gira a 1024px, cioè col mouse: qui ci si aspetta
    // 32. Il caso col dito lo tiene `bersagliSulTablet.test.jsx`, che sposta
    // davvero la larghezza della finestra.
    const v = apri()
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    const bersaglio = v.getByTitle('Clicca per modificare')
    expect(bersaglio.style.minHeight).toBe('32px')
    // Quello che NON deve tornare: il bersaglio da 22.
    expect(parseInt(bersaglio.style.minHeight, 10)).toBeGreaterThan(22)
    expect(bersaglio.getAttribute('role')).toBe('button')
  })

  it('senza ricettario non esplode e lo dice', async () => {
    const v = render(<MateriePrimeView ricettario={null} logPrezzi={[]} />)
    expect(v.container.textContent.toLowerCase()).toContain('sto caricando il ricettario')
  })
})
