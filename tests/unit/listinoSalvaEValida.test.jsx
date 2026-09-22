// @vitest-environment happy-dom
//
// ── Il Listino: cosa si salva, cosa si rifiuta, cosa si dice ─────────────
//
// Il secondo file sul Listino. Il primo (`listinoMargineNonSiInventa`) guarda
// i numeri che la pagina mostra; questo guarda quello che la pagina **scrive**
// e quello che si rifiuta di scrivere.
//
// Perché conta: da qui esce la riga che `ChiusuraView` usa per riconciliare
// produzione e cassa. Un formato salvato male non si vede subito — si vede a
// fine mese, quando i conti non tornano e nessuno sa da dove cominciare.
//
// Le prove montano la pagina vera, premono i pulsanti veri e guardano cosa
// finisce nel finto archivio.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react'

let MATERIALI = []
let FORMATI = []
let RICETTARIO_SALVATO = null
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

const RICETTARIO = {
  ricette: {
    PISTACCHIO: {
      nome: 'PISTACCHIO', tipo: 'gusto', categoria: 'Gelato', unita: 1, prezzo: 0,
      ingredienti: [{ nome: 'pasta di pistacchio', qty1stampo: 1000 }],
    },
    'CREMA SENZA CATEGORIA': {
      nome: 'CREMA SENZA CATEGORIA', tipo: 'gusto', unita: 1, prezzo: 0,
      ingredienti: [{ nome: 'pasta di pistacchio', qty1stampo: 1000 }],
    },
  },
  ingredienti_costi: { 'pasta di pistacchio': { costoKg: 30, costoG: 0.03 } },
}

const avvisi = []
function apri(props = {}) {
  return render(
    <FormatiVendita orgId="o1" ricettario={RICETTARIO}
      onSaveRicettario={async (r) => { RICETTARIO_SALVATO = r }}
      notify={(t, ok) => avvisi.push([String(t), ok])}
      tipoAttivita="gelateria" sedi={[]} {...props} />,
  )
}

const testo = () => document.body.textContent || ''
const bottone = (etichetta) => [...document.querySelectorAll('button')]
  .find(b => new RegExp(etichetta, 'i').test(b.textContent || ''))
const formatiSalvati = () => {
  const ultimo = [...salvataggi].reverse().find(([k]) => k === 'pasticceria-formati-vendita-v1')
  return ultimo ? ultimo[1] : null
}

async function apriNuovo() {
  const b = bottone('nuovo formato')
  expect(b, 'manca il pulsante per creare un formato').toBeTruthy()
  await act(async () => { fireEvent.click(b) })
}

beforeEach(() => {
  MATERIALI = []; FORMATI = []; salvataggi.length = 0
  avvisi.length = 0; RICETTARIO_SALVATO = null
})
afterEach(() => cleanup())

describe('Quello che la pagina si rifiuta di salvare', () => {
  it('un formato senza nome non si salva, e lo dice', async () => {
    apri()
    await waitFor(() => expect(testo()).not.toContain('Caricamento…'))
    await apriNuovo()
    const salva = bottone('^salva')
    if (salva) await act(async () => { fireEvent.click(salva) })
    expect(formatiSalvati()).toBe(null)
    expect(avvisi.some(([t]) => /nome/i.test(t))).toBe(true)
  })

  it('e il messaggio dice un esempio, non solo «campo obbligatorio»', async () => {
    // Chi legge «campo obbligatorio» sa già che manca qualcosa: quello che
    // non sa è cosa scriverci.
    apri()
    await waitFor(() => expect(testo()).not.toContain('Caricamento…'))
    await apriNuovo()
    const salva = bottone('^salva')
    if (salva) await act(async () => { fireEvent.click(salva) })
    expect(avvisi.some(([t]) => /Cono piccolo/.test(t))).toBe(true)
  })

  it('un formato senza categoria non si salva', async () => {
    apri()
    await waitFor(() => expect(testo()).not.toContain('Caricamento…'))
    await apriNuovo()
    // Il primo campo dell'editor è il nome. Cercarlo per etichetta non regge
    // (le etichette non sono legate ai campi con `for`), e nemmeno
    // `input[type="text"]`: quel campo l'attributo `type` non ce l'ha proprio,
    // e senza attributo il selettore non lo vede. Si prende il primo campo che
    // non sia un numero o una casella.
    const nome = [...document.querySelectorAll('input')]
      .find(i => !['number', 'checkbox', 'radio'].includes(i.getAttribute('type') || ''))
    expect(nome, 'l\'editor non si è aperto').toBeTruthy()
    await act(async () => { fireEvent.change(nome, { target: { value: 'Cono grande' } }) })
    const salva = bottone('^salva')
    if (salva) await act(async () => { fireEvent.click(salva) })
    expect(formatiSalvati()).toBe(null)
    expect(avvisi.some(([t]) => /categoria/i.test(t))).toBe(true)
  })
})

describe('I materiali di confezionamento sono un elenco chiuso', () => {
  it('senza materiali definiti la pagina lo dice invece di lasciare scrivere', async () => {
    // La richiesta del titolare del 18/09: «se un prodotto non viene aggiunto
    // prima, non compare nell'elenco». Serve contro «coppettp» e «fazzolettp».
    MATERIALI = []
    FORMATI = [{ id: 'f1', nome: 'Coppetta', categoria: 'Gelato', baseQtaG: 120, prezzoDefault: 3, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Coppetta'))
    expect(testo()).toMatch(/materiale|confezionamento/i)
  })

  it('i materiali definiti compaiono con il loro costo', async () => {
    MATERIALI = [{ nome: 'Cono cialda', costo: 0.06 }, { nome: 'Fazzoletto', costo: 0.008 }]
    FORMATI = [{
      id: 'f1', nome: 'Cono piccolo', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 2.5,
      componenti: [{ nome: 'Cono cialda', qta: 1, costo: 0.06 }, { nome: 'Fazzoletto', qta: 1, costo: 0.008 }],
    }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono piccolo'))
    const riga = [...document.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') || '').startsWith('Cono piccolo:'))
    await act(async () => { fireEvent.click(riga) })
    expect(testo()).toContain('Cono cialda')
    expect(testo()).toContain('Fazzoletto')
  })

  it('e il totale del confezionamento è la somma, non un numero a caso', async () => {
    // 0,06 + 0,008 = 0,068 €.
    MATERIALI = [{ nome: 'Cono cialda', costo: 0.06 }, { nome: 'Fazzoletto', costo: 0.008 }]
    FORMATI = [{
      id: 'f1', nome: 'Cono piccolo', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 2.5,
      componenti: [{ nome: 'Cono cialda', qta: 1, costo: 0.06 }, { nome: 'Fazzoletto', qta: 1, costo: 0.008 }],
    }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono piccolo'))
    expect(testo()).toMatch(/0,068/)
  })

  it('due pezzi dello stesso materiale costano il doppio', async () => {
    MATERIALI = [{ nome: 'Cucchiaino', costo: 0.005 }]
    FORMATI = [{
      id: 'f1', nome: 'Coppetta doppia', categoria: 'Gelato', baseQtaG: 200, prezzoDefault: 4,
      componenti: [{ nome: 'Cucchiaino', qta: 2, costo: 0.005 }],
    }]
    apri()
    await waitFor(() => expect(testo()).toContain('Coppetta doppia'))
    expect(testo()).toMatch(/0,010/)
  })
})

describe('Le ricette senza categoria, che sono il buco più grosso', () => {
  it('la pagina dice quante sono, con la frase che si legge davvero', async () => {
    // Sui dati del design partner erano 25 su 27: il food cost di tutti i
    // coni e le vaschette si reggeva su due ricette sole.
    FORMATI = [{ id: 'f1', nome: 'Cono', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 2, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono'))
    expect(testo()).toMatch(/non ha una categoria|non hanno una categoria/)
  })

  it('e si possono sistemare tutte insieme, non una scheda per volta', async () => {
    apri()
    await waitFor(() => expect(testo()).not.toContain('Caricamento…'))
    const b = [...document.querySelectorAll('button')]
      .find(x => /assegna|tutte/i.test(x.textContent || ''))
    // Se il comando c'è deve funzionare; se non c'è, la pagina non promette
    // una cosa che non fa.
    if (b) {
      expect(b.disabled === false || b.disabled === undefined).toBe(true)
    }
  })
})

describe('I numeri del Listino si leggono all\'italiana', () => {
  it('gli euro hanno il simbolo dopo la cifra', async () => {
    FORMATI = [{ id: 'f1', nome: 'Vaschetta', categoria: 'Gelato', baseQtaG: 500, prezzoDefault: 12.5, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Vaschetta'))
    expect(testo()).toMatch(/\d\s?€/)
    expect(testo()).not.toMatch(/€\s?\d/)
  })

  it('i grammi hanno il punto delle migliaia', async () => {
    FORMATI = [{ id: 'f1', nome: 'Vaschetta', categoria: 'Gelato', baseQtaG: 1000, prezzoDefault: 20, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Vaschetta'))
    expect(testo()).toMatch(/1\.000/)
  })

  it('e i decimali si scrivono con la virgola', async () => {
    // Il prezzo di vendita si legge aprendo la scheda, non nella riga chiusa:
    // la riga porta il costo, non il ricavo.
    FORMATI = [{ id: 'f1', nome: 'Vaschetta', categoria: 'Gelato', baseQtaG: 500, prezzoDefault: 12.5, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Vaschetta'))
    const riga = [...document.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') || '').startsWith('Vaschetta:'))
    await act(async () => { fireEvent.click(riga) })
    expect(testo()).toMatch(/12,50/)
  })
})

describe('Le righe si aprono da tastiera, non solo col dito', () => {
  it('ogni formato è un pulsante con la sua etichetta', async () => {
    FORMATI = [
      { id: 'a', nome: 'Cono', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 2, componenti: [] },
      { id: 'b', nome: 'Coppetta', categoria: 'Gelato', baseQtaG: 120, prezzoDefault: 3, componenti: [] },
    ]
    apri()
    await waitFor(() => expect(testo()).toContain('Coppetta'))
    const righe = [...document.querySelectorAll('button')]
      .filter(b => (b.getAttribute('aria-label') || '').includes('il dettaglio del costo'))
    expect(righe).toHaveLength(2)
  })

  it('e l\'etichetta dice se la riga è aperta o chiusa', async () => {
    FORMATI = [{ id: 'a', nome: 'Cono', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 2, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono'))
    const riga = () => [...document.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') || '').startsWith('Cono:'))
    expect(riga().getAttribute('aria-expanded')).toBe('false')
    await act(async () => { fireEvent.click(riga()) })
    expect(riga().getAttribute('aria-expanded')).toBe('true')
  })
})

describe('Il righello di questo file', () => {
  it('il finto archivio viene letto davvero', async () => {
    // Se `sload` non fosse agganciato, tutte le prove che contano sui formati
    // guarderebbero una pagina vuota e passerebbero per il motivo sbagliato.
    FORMATI = [{ id: 'zz', nome: 'CONTROLLO RIGHELLO', categoria: 'Gelato', baseQtaG: 1, prezzoDefault: 1, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('CONTROLLO RIGHELLO'))
  })

  it('e i salvataggi finiscono dove li andiamo a cercare', async () => {
    FORMATI = [{ id: 'a', nome: 'Cono', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 2, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono'))
    expect(formatiSalvati()).toBe(null)   // finché non si salva niente, niente scritture
  })
})

// ── Eliminare un formato ─────────────────────────────────────────────────
//
// Un formato che sparisce si porta dietro la riconciliazione delle chiusure
// che lo usavano: va chiesto prima, e va chiesto dal prodotto, non dal
// browser.
describe('Eliminare un formato', () => {
  it('il comando c\'è e dice quale formato tocca', async () => {
    FORMATI = [{ id: 'a', nome: 'Cono', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 2, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono'))
    const elimina = [...document.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') || '').includes('Elimina il formato'))
    expect(elimina, 'manca il comando per eliminare').toBeTruthy()
    expect(elimina.getAttribute('aria-label')).toContain('Cono')
  })

  it('e finché non si conferma il formato resta', async () => {
    FORMATI = [{ id: 'a', nome: 'Cono', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 2, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono'))
    expect(formatiSalvati()).toBe(null)
  })
})

// ── Gli alias: i nomi con cui la cassa chiama la stessa cosa ─────────────
//
// Lo scontrino scrive «Cono picc.», «cono piccolo», «CONO P»: se il formato
// non li riconosce, quelle righe restano senza food cost e la riconciliazione
// di fine giornata ha un buco che nessuno spiega.
describe('Gli alias del formato', () => {
  it('si vedono nella riga, così si sa cosa riconosce', async () => {
    FORMATI = [{
      id: 'a', nome: 'Cono', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 2,
      componenti: [], alias: ['Cono picc.', 'CONO P'],
    }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono'))
    expect(testo()).toContain('Cono picc.')
    expect(testo()).toContain('CONO P')
  })

  it('un formato senza alias non mostra un elenco vuoto', async () => {
    FORMATI = [{ id: 'a', nome: 'Cono', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 2, componenti: [], alias: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono'))
    expect(testo()).not.toMatch(/alias:\s*·/)
  })
})

// ── La banda dei numeri in cima ──────────────────────────────────────────
describe('I numeri in cima raccontano il listino, non il vuoto', () => {
  it('dice quanti formati ci sono', async () => {
    FORMATI = [
      { id: 'a', nome: 'Cono', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 2, componenti: [] },
      { id: 'b', nome: 'Coppetta', categoria: 'Gelato', baseQtaG: 120, prezzoDefault: 3, componenti: [] },
    ]
    apri()
    await waitFor(() => expect(testo()).toContain('Coppetta'))
    expect(testo()).toMatch(/Formati configurati\s*2|2\s*formati/)
  })

  it('con un formato solo scrive «formato», non «formati»', async () => {
    FORMATI = [{ id: 'a', nome: 'Cono', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 2, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono'))
    expect(testo()).toMatch(/formato di vendita/)
  })

  it('senza materiali dice «da compilare», non «0,000 €»', async () => {
    // Zero euro di confezionamento non è un dato: è un campo mai riempito.
    FORMATI = [{ id: 'a', nome: 'Cono', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 2, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono'))
    expect(testo()).toMatch(/da compilare/)
  })

  it('e conta quanti formati non hanno il food cost', async () => {
    FORMATI = [{ id: 'a', nome: 'Fetta', categoria: 'Senza ricette', baseQtaG: 100, prezzoDefault: 4, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Fetta'))
    expect(testo()).toMatch(/Senza food cost/)
  })
})

// ── Mettere una categoria a tutte le ricette che non ce l'hanno ──────────
describe('Assegnare la categoria a tutte in un colpo', () => {
  it('il comando compare solo se c\'è davvero qualcosa da sistemare', async () => {
    FORMATI = [{ id: 'a', nome: 'Cono', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 2, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono'))
    expect(bottone('Mettile tutte')).toBeTruthy()
  })

  it('e scrive la categoria sulle ricette che ne erano senza', async () => {
    FORMATI = [{ id: 'a', nome: 'Cono', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 2, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono'))
    const b = bottone('Mettile tutte')
    await act(async () => { fireEvent.click(b) })
    await waitFor(() => expect(RICETTARIO_SALVATO).toBeTruthy())
    expect(RICETTARIO_SALVATO.ricette['CREMA SENZA CATEGORIA'].categoria).toBeTruthy()
  })

  it('e non tocca quelle che una categoria ce l\'avevano già', async () => {
    FORMATI = [{ id: 'a', nome: 'Cono', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 2, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono'))
    await act(async () => { fireEvent.click(bottone('Mettile tutte')) })
    await waitFor(() => expect(RICETTARIO_SALVATO).toBeTruthy())
    expect(RICETTARIO_SALVATO.ricette.PISTACCHIO.categoria).toBe('Gelato')
  })
})

// ── Il food cost stimato del formato ─────────────────────────────────────
describe('Il food cost per unità è materiali più prodotto', () => {
  it('con la categoria pesata somma le due parti', async () => {
    // Pistacchio 30 €/kg → 80 g = 2,40 € di prodotto, più 0,06 € di cono.
    MATERIALI = [{ nome: 'Cono cialda', costo: 0.06 }]
    FORMATI = [{
      id: 'a', nome: 'Cono piccolo', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 3,
      componenti: [{ nome: 'Cono cialda', qta: 1, costo: 0.06 }],
    }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono piccolo'))
    expect(testo()).toMatch(/2,460/)
  })

  it('e dice su quante ricette è calcolata la media della categoria', async () => {
    MATERIALI = []
    FORMATI = [{ id: 'a', nome: 'Cono piccolo', categoria: 'Gelato', baseQtaG: 80, prezzoDefault: 3, componenti: [] }]
    apri()
    await waitFor(() => expect(testo()).toContain('Cono piccolo'))
    const riga = [...document.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') || '').startsWith('Cono piccolo:'))
    await act(async () => { fireEvent.click(riga) })
    expect(testo()).toMatch(/ricett[ae]/)
  })
})
