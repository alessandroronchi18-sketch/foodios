// @vitest-environment happy-dom
//
// ── La pagina Ordini ────────────────────────────────────────────────────
//
// Il titolare, 22/09/2026: «attualmente gli ordini vengono fatti su
// whatsapp». La pagina non sostituisce WhatsApp: prepara il messaggio giusto
// da incollarci, e tiene il conto di quello che è stato chiesto.
//
// ── Le due regole che questo file difende ───────────────────────────────
//
// 1. **L'ordine non tocca il magazzino.** È un'intenzione, non merce: la
//    giacenza la muove la bolla. Se la toccasse, poi arriva la bolla e si
//    conta tutto due volte — ed è il difetto che questa pagina rischiava di
//    introdurre, visto che sa già quantità e prezzi.
// 2. **La spesa stimata si mostra solo se tutti i prezzi si sanno.** Una
//    somma che salta le voci senza prezzo è più bassa del vero, e più bassa
//    del vero è la bugia che fa spendere.
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const scritture = []
let FORNITORI = []
let MAGAZZINO = {}
let RICETTARIO = null
let CHIUSURE = []

vi.mock('../../src/lib/storage', () => ({
  sload: async (key) => {
    if (key === 'pasticceria-magazzino-v1') return MAGAZZINO
    if (key === 'pasticceria-chiusure-v1') return CHIUSURE
    if (key === 'pasticceria-ricettario-v1') return RICETTARIO
    return null
  },
  ssave: async () => {},
}))

vi.mock('../../src/lib/supabase', () => {
  function tabella(nome) {
    const risposta = nome === 'fornitori' ? { data: FORNITORI, error: null } : { data: [], error: null }
    const q = {
      select: () => q,
      eq: () => q,
      gte: () => q,
      // `q` è «thenable»: la catena si può aspettare in qualunque punto, e
      // `.order(...).limit(...)` continua a funzionare. Con `order` che
      // tornava una Promise, `.limit` cadeva su `undefined` e la pagina
      // restava per sempre su «Caricamento…».
      limit: () => q,
      order: () => q,
      single: () => Promise.resolve({ data: { id: 'ord-1' }, error: null }),
      insert: (p) => { scritture.push([nome, 'insert', p]); return { select: () => ({ single: () => Promise.resolve({ data: { id: 'ord-1' }, error: null }) }) } },
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      then: (r) => Promise.resolve(risposta).then(r),
    }
    return q
  }
  // Le due funzioni con cui la pagina legge fornitori e consegne: passano da
  // qui e non dalle tabelle, perché un dipendente abilitato a ordinare non
  // deve vedere IBAN, condizioni di pagamento e importi delle fatture.
  const rpc = (nome) => Promise.resolve({
    data: nome === 'fos_fornitori_per_ordine' ? FORNITORI : [],
    error: null,
  })
  return { supabase: { from: tabella, rpc } }
})

const { default: OrdiniView } = await import('../../src/views/OrdiniView.jsx')

// La farina del design partner: due chili al giorno, soglia 10 kg, dieci
// chili sullo scaffale, fornitore che passa ogni sette giorni.
function dati() {
  MAGAZZINO = {
    'farina 00': { nome: 'Farina 00', giacenza_g: 10000, soglia_g: 10000 },
    zucchero: { nome: 'Zucchero', giacenza_g: 500, soglia_g: 5000 },
  }
  RICETTARIO = {
    ingredienti_costi: {
      'farina 00': { costoKg: 1.2, costoG: 0.0012, fornitore: 'Molino Rossi' },
      zucchero: { costoKg: 1, costoG: 0.001, fornitore: 'Molino Rossi' },
    },
    ricette: {},
  }
  FORNITORI = [{
    id: 'f1', nome: 'Molino Rossi', email: 'ordini@molinorossi.it',
    whatsapp: '3351234567', minimo_ordine: null, lead_time_giorni: 3,
  }]
  CHIUSURE = []
}

const apri = (p = {}) => render(
  <OrdiniView orgId="o1" sedeId="s1" notify={() => {}} azienda="Mara dei Boschi" sede="Carlina" {...p} />,
)
const testo = () => document.body.textContent || ''

beforeEach(() => { scritture.length = 0; dati() })

describe('Cosa manca, raggruppato per fornitore', () => {
  it('la pagina si apre e mette insieme le voci dello stesso fornitore', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('Molino Rossi'))
    expect(testo()).toMatch(/2 voci/)
  })

  it('e le materie prime senza fornitore finiscono in un gruppo a parte, che lo dice', async () => {
    RICETTARIO.ingredienti_costi.zucchero = { costoKg: 1, costoG: 0.001 }
    apri()
    await waitFor(() => expect(testo()).toContain('Senza fornitore collegato'))
  })
})

describe('L\'ordine si compone e il testo esce pronto', () => {
  it('aprendo il fornitore si vede il messaggio da incollare', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('Molino Rossi'))
    fireEvent.click(screen.getByRole('button', { name: /Molino Rossi/ }))
    await waitFor(() => expect(testo()).toMatch(/Buongiorno/))
    expect(testo()).toMatch(/Farina 00/)
  })

  it('e l\'indirizzo di consegna c\'è sempre: il fornitore sbaglia negozio', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('Molino Rossi'))
    fireEvent.click(screen.getByRole('button', { name: /Molino Rossi/ }))
    await waitFor(() => expect(testo()).toMatch(/Buongiorno/))
    expect(testo()).toMatch(/Carlina/)
  })

  it('togliendo una voce, sparisce dal messaggio', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('Molino Rossi'))
    fireEvent.click(screen.getByRole('button', { name: /Molino Rossi/ }))
    await waitFor(() => expect(testo()).toMatch(/Buongiorno/))
    const casella = screen.getByLabelText(/Metti Zucchero nell'ordine/i)
    fireEvent.click(casella)
    await waitFor(() => expect(testo()).not.toMatch(/- Zucchero/))
  })

  it('il pulsante della mail punta all\'indirizzo del fornitore', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('Molino Rossi'))
    fireEvent.click(screen.getByRole('button', { name: /Molino Rossi/ }))
    await waitFor(() => expect(testo()).toMatch(/Buongiorno/))
    const link = screen.getByRole('link', { name: /Apri la mail/i })
    expect(link.getAttribute('href')).toMatch(/^mailto:ordini@molinorossi\.it/)
  })

  it('e senza email lo dice, invece di mostrare un pulsante che non va da nessuna parte', async () => {
    FORNITORI[0].email = null
    apri()
    await waitFor(() => expect(testo()).toContain('Molino Rossi'))
    fireEvent.click(screen.getByRole('button', { name: /Molino Rossi/ }))
    await waitFor(() => expect(testo()).toMatch(/Buongiorno/))
    expect(screen.queryByRole('link', { name: /Apri la mail/i })).toBeNull()
    expect(testo()).toMatch(/non hai l.email/i)
  })
})

describe('L\'ordine NON tocca il magazzino', () => {
  it('registrandolo si scrivono solo le due tabelle degli ordini', async () => {
    // È la regola: la merce entra con la bolla. Se l'ordine caricasse la
    // giacenza, poi arriva la bolla e si conta due volte.
    apri()
    await waitFor(() => expect(testo()).toContain('Molino Rossi'))
    fireEvent.click(screen.getByRole('button', { name: /Molino Rossi/ }))
    await waitFor(() => expect(testo()).toMatch(/Buongiorno/))
    fireEvent.click(screen.getByRole('button', { name: /ho mandato/i }))
    await waitFor(() => expect(scritture.length).toBeGreaterThanOrEqual(2))
    const tabelle = [...new Set(scritture.map(s => s[0]))]
    expect(tabelle.sort()).toEqual(['ordini_fornitori', 'righe_ordine'])
  })

  it('e la testata porta il fornitore, lo stato e le righe in chili', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('Molino Rossi'))
    fireEvent.click(screen.getByRole('button', { name: /Molino Rossi/ }))
    await waitFor(() => expect(testo()).toMatch(/Buongiorno/))
    fireEvent.click(screen.getByRole('button', { name: /ho mandato/i }))
    await waitFor(() => expect(scritture.length).toBeGreaterThanOrEqual(2))
    const testa = scritture.find(s => s[0] === 'ordini_fornitori')[2]
    expect(testa.fornitore_id).toBe('f1')
    expect(testa.stato).toBe('inviato')
    expect(testa.organization_id).toBe('o1')
    const righe = scritture.find(s => s[0] === 'righe_ordine')[2]
    expect(Array.isArray(righe)).toBe(true)
    expect(righe[0].unita).toBe('kg')
  })
})

describe('Un numero che non si sa non si mostra', () => {
  it('la spesa stimata sparisce se anche un solo prezzo manca', async () => {
    // Una somma che salta le voci senza prezzo è più bassa del vero.
    delete RICETTARIO.ingredienti_costi.zucchero.costoKg
    delete RICETTARIO.ingredienti_costi.zucchero.costoG
    apri()
    await waitFor(() => expect(testo()).toContain('Molino Rossi'))
    expect(testo()).toContain('Spesa stimata')
    expect(testo()).toContain('manca qualche prezzo')
    // E non c'è nessun importo in euro sulla tessera: mostrarne uno più
    // basso del vero è peggio che non mostrarne nessuno.
    expect(testo()).not.toMatch(/Spesa stimata\s*[\d.]+\s*€/)
  })

  it('e con pochi giorni di chiusure la pagina avverte che i numeri sono deboli', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('Molino Rossi'))
    expect(testo()).toMatch(/giornate registrate|giornata registrata/)
  })
})

describe('Il righello di questo file', () => {
  it('con il magazzino vuoto la pagina lo dice, invece di mostrare un elenco vuoto', async () => {
    MAGAZZINO = {}
    apri()
    await waitFor(() => expect(testo()).toMatch(/Non c.è niente da ordinare/))
    expect(testo()).toMatch(/mai inventariata/)
  })

  it('e senza organizzazione non disegna niente', () => {
    const { container } = apri({ orgId: null })
    expect(container.textContent).toBe('')
  })
})
