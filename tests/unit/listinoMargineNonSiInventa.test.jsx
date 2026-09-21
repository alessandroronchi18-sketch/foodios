// @vitest-environment happy-dom
//
// ── Il Listino: il margine non si inventa ────────────────────────────────
//
// La pagina dove il titolare decide come si vendono le cose: «Cono piccolo»,
// «Vaschetta 500 g», «Coppetta media». Per ognuna dice a quale categoria di
// ricette è collegata, quanti grammi di prodotto ci vanno, quali materiali di
// confezionamento e a che prezzo la vende. Da lì escono il food cost per
// unità e il margine — cioè i due numeri su cui si decide un listino.
//
// ── Il difetto che ha fatto nascere questo file (21/09/2026) ─────────────
//
// **Un formato di cui non si sapeva il food cost mostrava «margine 100%».**
//
// Nell'elenco il conto era `prezzo > 0 && fcUnit >= 0`. Con una categoria
// senza nessuna ricetta pesata — che è il caso vero del design partner — il
// food cost per unità viene zero, e `(1 - 0 / prezzo) * 100` fa cento. Un
// formato che non si sa quanto costi veniva presentato come il più
// redditizio del listino, in verde.
//
// È il difetto archetipico di questo prodotto, quello scritto in CLAUDE.md:
// **il dato che manca diventa una buona notizia.** Ed era anche una
// contraddizione interna: l'anteprima nell'editor, due schermate più in là,
// usava già `fcUnit > 0` e sullo stesso formato diceva un'altra cosa.
//
// Queste prove montano la pagina vera e guardano quello che si legge.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor, act } from '@testing-library/react'

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

// Un ricettario con una categoria pesata («Gelato») e una vuota («Torte»).
const RICETTARIO = {
  ricette: {
    PISTACCHIO: {
      nome: 'PISTACCHIO', tipo: 'gusto', categoria: 'Gelato', unita: 1, prezzo: 0,
      ingredienti: [{ nome: 'pasta di pistacchio', qty1stampo: 1000 }],
    },
    'TORTA NUDA': {
      nome: 'TORTA NUDA', tipo: 'fetta', categoria: 'Torte', unita: 8, prezzo: 0,
      ingredienti: [{ nome: 'ingrediente senza prezzo', qty1stampo: 1000 }],
    },
  },
  ingredienti_costi: {
    'pasta di pistacchio': { costoKg: 30, costoG: 0.03 },
  },
}

const formato = (p = {}) => ({
  id: p.id || 'f1',
  nome: p.nome || 'Coppetta media',
  categoria: p.categoria || 'Gelato',
  baseQtaG: p.baseQtaG ?? 120,
  prezzoDefault: p.prezzoDefault ?? 3.5,
  componenti: p.componenti || [],
})

function apri(props = {}) {
  return render(
    <FormatiVendita orgId="o1" ricettario={RICETTARIO} onSaveRicettario={async () => {}}
      notify={() => {}} tipoAttivita="gelateria" sedi={[]} {...props} />,
  )
}

const testo = () => document.body.textContent || ''

/** Apre il pannello di un formato cliccandone il nome. */
async function apriScheda(nome) {
  // La riga è un `<button>` con la sua etichetta: prima era un `<div>` con
  // `cursor: pointer`, che è il modo in cui si costruisce un comando
  // invisibile a chi usa la tastiera o un lettore di schermo.
  const riga = [...document.querySelectorAll('button')]
    .find(b => (b.getAttribute('aria-label') || '').startsWith(`${nome}:`))
  expect(riga, `non trovo la riga del formato «${nome}»`).toBeTruthy()
  await act(async () => { fireEvent.click(riga) })
}

beforeEach(() => { MATERIALI = []; FORMATI = []; salvataggi.length = 0 })
afterEach(() => cleanup())

describe('Il margine si mostra solo se il food cost si sa', () => {
  it('con una categoria pesata il margine si calcola', async () => {
    // Pistacchio a 30 €/kg, 120 g = 3,60 € di prodotto su 3,50 € di prezzo:
    // il margine c'è (ed è negativo, ma c'è).
    FORMATI = [formato({ categoria: 'Gelato', baseQtaG: 120, prezzoDefault: 3.5 })]
    apri()
    await waitFor(() => expect(testo()).toContain('Coppetta media'))
    await apriScheda('Coppetta media')
    expect(testo()).toMatch(/Margine/)
    expect(testo()).not.toMatch(/senza il costo del prodotto/)
  })

  it('con una categoria senza ricette pesate NON dice 100%', async () => {
    // Il difetto: «Torte» non ha nessuna ricetta col prezzo, il food cost per
    // unità esce zero, e il margine usciva cento per cento. In verde.
    FORMATI = [formato({ id: 'f2', nome: 'Fetta di torta', categoria: 'Torte', prezzoDefault: 4 })]
    apri()
    await waitFor(() => expect(testo()).toContain('Fetta di torta'))
    await apriScheda('Fetta di torta')
    expect(testo()).not.toMatch(/100\s*%/)
  })

  it('e al posto del numero dice perché non ce n\'è uno', async () => {
    // Un trattino da solo non spiega niente: chi guarda pensa a un difetto
    // della pagina, non a un dato che manca.
    FORMATI = [formato({ id: 'f2', nome: 'Fetta di torta', categoria: 'Torte', prezzoDefault: 4 })]
    apri()
    await waitFor(() => expect(testo()).toContain('Fetta di torta'))
    await apriScheda('Fetta di torta')
    expect(testo()).toContain('senza il costo del prodotto il margine non si sa')
  })

  it('e lo dice anche sopra, sul food cost per unità', async () => {
    FORMATI = [formato({ id: 'f2', nome: 'Fetta di torta', categoria: 'Torte', prezzoDefault: 4 })]
    apri()
    await waitFor(() => expect(testo()).toContain('Fetta di torta'))
    await apriScheda('Fetta di torta')
    expect(testo()).toMatch(/la categoria non ha ricette pesate/)
  })

  it('senza prezzo di vendita il riquadro del margine non compare affatto', async () => {
    FORMATI = [formato({ id: 'f3', nome: 'Assaggio', categoria: 'Gelato', prezzoDefault: 0 })]
    apri()
    await waitFor(() => expect(testo()).toContain('Assaggio'))
    await apriScheda('Assaggio')
    expect(testo()).not.toMatch(/di prezzo/)
  })
})

describe('Le due schermate dicono la stessa cosa dello stesso formato', () => {
  it('quello che l\'elenco non sa, nemmeno l\'anteprima lo inventa', async () => {
    // Prima l'elenco usava `fcUnit >= 0` e l'anteprima `fcUnit > 0`: sullo
    // stesso formato, uno diceva «100%» e l'altro non diceva niente.
    FORMATI = [formato({ id: 'f2', nome: 'Fetta di torta', categoria: 'Torte', prezzoDefault: 4 })]
    apri()
    await waitFor(() => expect(testo()).toContain('Fetta di torta'))
    const modifica = [...document.querySelectorAll('button')]
      .find(b => /modifica/i.test(b.textContent || ''))
    if (modifica) {
      await act(async () => { fireEvent.click(modifica) })
      expect(testo()).not.toMatch(/Margine stimato[\s\S]{0,40}100\s*%/)
    }
  })
})

describe('I costi del confezionamento, che sono millesimi di euro', () => {
  it('si vedono con tre decimali, se no un fazzoletto è zero', async () => {
    // Un fazzoletto costa 0,008 €: arrotondato ai centesimi sparisce, e su
    // diecimila coni sparisce anche l'ottanta di euro che costa davvero.
    MATERIALI = [{ nome: 'Fazzoletto', costo: 0.008 }]
    FORMATI = [formato({ componenti: [{ nome: 'Fazzoletto', qta: 1, costo: 0.008 }] })]
    apri()
    await waitFor(() => expect(testo()).toContain('Coppetta media'))
    expect(testo()).toMatch(/0,008/)
  })

  it('e col separatore italiano delle migliaia', async () => {
    FORMATI = [formato({ baseQtaG: 1200 })]
    apri()
    await waitFor(() => expect(testo()).toContain('Coppetta media'))
    expect(testo()).toMatch(/1\.200/)
  })
})

describe('Il riquadro «più costoso» non sceglie un nome a caso', () => {
  it('senza nessun materiale non nomina nessun formato', async () => {
    // Prima il reduce partiva da null e teneva il primo elemento: con tutti i
    // materiali a zero — 5 formati su 5, il caso vero del design partner — la
    // tessera diceva «formato più costoso: 0,000 €» e sotto il nome del primo
    // formato dell'elenco. Un nome scelto dall'ordinamento, presentato come
    // un dato.
    FORMATI = [formato({ id: 'a', nome: 'Primo' }), formato({ id: 'b', nome: 'Secondo' })]
    apri()
    await waitFor(() => expect(testo()).toContain('Primo'))
    expect(testo()).not.toMatch(/più costoso[\s\S]{0,60}Primo/)
  })

  it('con dei materiali nomina quello che costa davvero di più', async () => {
    MATERIALI = [{ nome: 'Cono', costo: 0.06 }, { nome: 'Coppetta', costo: 0.03 }]
    FORMATI = [
      formato({ id: 'a', nome: 'Con cono', componenti: [{ nome: 'Cono', qta: 1, costo: 0.06 }] }),
      formato({ id: 'b', nome: 'Con coppetta', componenti: [{ nome: 'Coppetta', qta: 1, costo: 0.03 }] }),
    ]
    apri()
    await waitFor(() => expect(testo()).toContain('Con cono'))
    expect(testo()).toMatch(/Con cono/)
  })
})

describe('Il righello di questo file', () => {
  it('la pagina si disegna e i formati compaiono', async () => {
    // Se la pagina restasse su «Caricamento…», metà delle prove qui sopra
    // passerebbero guardando il vuoto.
    FORMATI = [formato({ nome: 'Coppetta media' })]
    apri()
    await waitFor(() => expect(testo()).not.toContain('Caricamento…'))
    expect(testo()).toContain('Coppetta media')
  })

  it('e la scheda si apre davvero quando la si tocca', async () => {
    FORMATI = [formato({ nome: 'Coppetta media' })]
    apri()
    await waitFor(() => expect(testo()).toContain('Coppetta media'))
    const prima = testo().length
    await apriScheda('Coppetta media')
    expect(testo().length).toBeGreaterThan(prima)
  })
})
