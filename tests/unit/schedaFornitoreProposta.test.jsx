// @vitest-environment happy-dom
//
// ── Il pannello che propone la scheda del fornitore ─────────────────────
//
// Richiesta del titolare, 22/09/2026: «caricando una bolla prendere tutti i
// dati e compila la scheda del fornitore».
//
// La regola che questo file difende: **propone, non scrive**. Un'anagrafica
// riscritta di nascosto è il genere di cosa che nessuno va a controllare — e
// una P.IVA sbagliata fa rimbalzare la fattura elettronica settimane dopo.
//
// Due mucchi, e partono spuntati in modo diverso:
//   • le caselle vuote si riempiono (spuntate di sì: riempire un vuoto non
//     toglie niente a nessuno);
//   • quelle che qualcuno ha già scritto a mano si mostrano ma NON si
//     toccano (spuntate di no). È la stessa regola scelta per i prezzi
//     dell'import: comanda quello che hai messo tu.
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

let ESISTENTE = null
const scritture = []

vi.mock('../../src/lib/supabase', () => {
  const q = {
    select: () => q,
    eq: () => q,
    ilike: () => q,
    limit: () => Promise.resolve({ data: ESISTENTE ? [ESISTENTE] : [], error: null }),
    update: (p) => { scritture.push(['update', p]); return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) } },
    insert: (p) => { scritture.push(['insert', p]); return Promise.resolve({ error: null }) },
  }
  return { supabase: { from: () => q } }
})

const { default: SchedaFornitoreProposta } = await import('../../src/components/SchedaFornitoreProposta.jsx')

// La testata vera di Vecchio Enrico, dalla bolla del 03/07/2026.
const TESTATA = `Vecchio Enrico
Via Torretta, 9
12050 Montelupo Albese    CN
Tel.   335 6039023
P. IVA  04210170041
C. F.   VCCNRC67E03F537M
Email:  enrico.vecchio@hotmail.com
COND. PAGAMENTO BONIFICO BANCARIO
IBAN: IT70U0306922540100000008183`

const apri = (p = {}) => render(
  <SchedaFornitoreProposta testata={TESTATA} fornitore="Vecchio Enrico"
    orgId="o1" notify={() => {}} {...p} />,
)
const testo = () => document.body.textContent || ''

beforeEach(() => { ESISTENTE = null; scritture.length = 0 })

describe('Un fornitore che in anagrafica non c\'è', () => {
  it('la scheda si propone di crearla', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/Creo la scheda di Vecchio Enrico/))
  })

  it('e ci sono dentro i dati veri della sua carta intestata', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('04210170041'))
    expect(testo()).toContain('IT70U0306922540100000008183')
    expect(testo()).toContain('enrico.vecchio@hotmail.com')
    expect(testo()).toContain('Montelupo Albese')
  })

  it('salvando, finiscono tutti nella riga nuova', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('04210170041'))
    fireEvent.click(screen.getByRole('button', { name: /Salva \d+ camp/i }))
    await waitFor(() => expect(scritture.length).toBe(1))
    const [come, payload] = scritture[0]
    expect(come).toBe('insert')
    expect(payload.partita_iva).toBe('04210170041')
    expect(payload.iban).toBe('IT70U0306922540100000008183')
    expect(payload.organization_id).toBe('o1')
  })
})

describe('Un fornitore che c\'è già, con dei buchi', () => {
  it('propone di riempire solo i buchi', async () => {
    ESISTENTE = { id: 'f1', nome: 'Vecchio Enrico', email: 'enrico.vecchio@hotmail.com', telefono: null, iban: null }
    apri()
    await waitFor(() => expect(testo()).toMatch(/Completo la scheda/))
    expect(testo()).toMatch(/Caselle vuote da riempire/)
  })

  it('e non tocca quello che hai già scritto a mano', async () => {
    // È la regola: la bolla dice un'email diversa, ma comanda la tua.
    ESISTENTE = { id: 'f1', nome: 'Vecchio Enrico', email: 'altro@vecchio.it' }
    apri()
    await waitFor(() => expect(testo()).toMatch(/Diversi da quello che hai scritto tu/))
    expect(testo()).toContain('altro@vecchio.it')
    // La casella di quel campo è spuntata di NO.
    const caselle = [...document.querySelectorAll('input[type=checkbox]')]
    const spente = caselle.filter(c => !c.checked)
    expect(spente.length).toBeGreaterThan(0)
  })

  it('e salvando NON manda l\'email diversa, se non la spunti', async () => {
    ESISTENTE = { id: 'f1', nome: 'Vecchio Enrico', email: 'altro@vecchio.it' }
    apri()
    await waitFor(() => expect(testo()).toMatch(/Diversi da quello/))
    fireEvent.click(screen.getByRole('button', { name: /Salva \d+ camp/i }))
    await waitFor(() => expect(scritture.length).toBe(1))
    expect(scritture[0][1].email).toBeUndefined()
  })

  it('ma se la spunti, allora sì', async () => {
    ESISTENTE = { id: 'f1', nome: 'Vecchio Enrico', email: 'altro@vecchio.it' }
    apri()
    await waitFor(() => expect(testo()).toMatch(/Diversi da quello/))
    const spenta = [...document.querySelectorAll('input[type=checkbox]')].find(c => !c.checked)
    fireEvent.click(spenta)
    fireEvent.click(screen.getByRole('button', { name: /Salva \d+ camp/i }))
    await waitFor(() => expect(scritture.length).toBe(1))
    expect(scritture[0][1].email).toBe('enrico.vecchio@hotmail.com')
    expect(scritture[0][0]).toBe('update')
  })
})

describe('Quando non c\'è niente da dire, il pannello non compare', () => {
  it('scheda già completa e uguale: niente a schermo', async () => {
    ESISTENTE = {
      id: 'f1', nome: 'Vecchio Enrico', partita_iva: '04210170041',
      codice_fiscale: 'VCCNRC67E03F537M', iban: 'IT70U0306922540100000008183',
      email: 'enrico.vecchio@hotmail.com', telefono: '3356039023',
      cap: '12050', citta: 'Montelupo Albese', provincia: 'CN',
      indirizzo: 'Via Torretta, 9', termini_tipo: 'netti',
    }
    apri()
    await new Promise(r => setTimeout(r, 30))
    expect(testo()).not.toMatch(/scheda di Vecchio Enrico/)
  })

  it('e senza testata nemmeno', async () => {
    apri({ testata: '' })
    await new Promise(r => setTimeout(r, 30))
    expect(testo()).not.toMatch(/scheda di/)
  })
})

describe('La partita IVA dell\'azienda non diventa quella del fornitore', () => {
  it('con la tua P.IVA dichiarata, la sua si riconosce lo stesso', async () => {
    apri({ testata: TESTATA + '\nSPETT.LE CARLINA 21 S.r.l.\nP.IVA 12077850019', pivaCliente: '12077850019' })
    await waitFor(() => expect(testo()).toContain('04210170041'))
    expect(testo()).not.toContain('12077850019')
  })

  it('senza, il pannello chiede invece di scegliere da solo', async () => {
    apri({ testata: TESTATA + '\nP.IVA 12077850019' })
    await waitFor(() => expect(testo()).toMatch(/2 partite IVA/))
  })
})

describe('Il righello di questo file', () => {
  it('il pannello si disegna davvero, con le sue caselle', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('04210170041'))
    expect(document.querySelectorAll('input[type=checkbox]').length).toBeGreaterThan(5)
    expect(screen.getByRole('button', { name: /Salva/i })).toBeTruthy()
  })

  it('e si può chiudere senza salvare niente', async () => {
    apri()
    await waitFor(() => expect(testo()).toContain('04210170041'))
    fireEvent.click(screen.getByRole('button', { name: /Chiudi la proposta/i }))
    await waitFor(() => expect(testo()).not.toContain('04210170041'))
    expect(scritture).toEqual([])
  })
})
