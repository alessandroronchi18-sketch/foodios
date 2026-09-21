// @vitest-environment happy-dom
//
// ── La rubrica vuota è una porta chiusa, e va detto ──────────────────────
//
// L'account laboratorio è un account condiviso su un tablet fisico. Chi si
// siede davanti si identifica col proprio codice di quattro cifre, e quel
// codice **lo crea il titolare** in Personale → Rubrica dipendenti. Il
// dipendente non se lo imposta da solo: se no il codice non identificherebbe
// nessuno, e il Registro attività non saprebbe chi ha fatto cosa.
//
// ── Il difetto (21/09/2026) ─────────────────────────────────────────────
//
// Il titolare, entrando con l'account del laboratorio: «mi chiede il codice
// di 4 numeri ma non mi dà la possibilità di impostarlo o modificarlo».
//
// Il flusso è giusto. Quello che non andava è che **con la rubrica vuota la
// schermata chiedeva un codice che non esiste**, e come consiglio dava
// «chiedi al titolare di verificare il tuo codice» — inutile quando la
// rubrica è vuota e il titolare sei tu. Nessuna via d'uscita, nessuna
// spiegazione.
//
// Misurato sul database quel giorno: **un solo account laboratorio in tutto
// il sistema, zero codici, quindi una porta chiusa su una.**
//
// La schermata non può contare i codici da sola: `dipendenti_codici` ha una
// policy «solo il titolare», e l'account laboratorio è un dipendente. Da qui
// la funzione `rubrica_codici_esiste`, che risponde a una domanda sola e non
// fa uscire nessun codice.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'

let RISPOSTA = { data: { ok: true, esiste: true }, error: null }
vi.mock('../../src/lib/supabase', () => ({
  supabase: { rpc: vi.fn(async () => RISPOSTA) },
}))

vi.mock('../../src/hooks/useDipendenteOperativo', () => ({
  useDipendenteOperativo: () => ({ seleziona: vi.fn(async () => ({ ok: true })) }),
}))

const { default: SelezionaDipendente } = await import('../../src/auth/SelezionaDipendente.jsx')

const apri = () => render(
  <SelezionaDipendente nomeLaboratorio="Laboratorio" nomeSede="Corso Casale" onSignOut={() => {}} />,
)
const testo = () => document.body.textContent || ''

beforeEach(() => { RISPOSTA = { data: { ok: true, esiste: true }, error: null } })
afterEach(() => cleanup())

describe('Quando in rubrica ci sono dei codici', () => {
  it('la schermata chiede il codice, come deve', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/codice personale a 4 cifre/))
  })

  it('e non spaventa nessuno con avvisi che non servono', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/codice personale/))
    expect(testo()).not.toMatch(/non è ancora stato creato/)
  })
})

describe('Quando la rubrica è vuota', () => {
  beforeEach(() => { RISPOSTA = { data: { ok: true, esiste: false }, error: null } })

  it('lo dice, invece di chiedere una cosa che non esiste', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/non è ancora stato creato nessun codice/))
  })

  it('e spiega chi li crea e dove', async () => {
    // «Chiedi al titolare» non basta: bisogna dire in che pagina si va.
    apri()
    await waitFor(() => expect(testo()).toMatch(/Rubrica dipendenti/))
    expect(testo()).toMatch(/Personale/)
  })

  it('e dice cosa fare se il titolare sei tu', async () => {
    // È il caso vero: il titolare entra con l'account del laboratorio per
    // provarlo, e resta chiuso fuori senza capire perché.
    apri()
    await waitFor(() => expect(testo()).toMatch(/esci e rientra con il tuo account/i))
  })

  it('il modo di uscire resta', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/non è ancora stato creato/))
    const esci = [...document.querySelectorAll('button')]
      .find(b => /esci/i.test(b.textContent || ''))
    expect(esci, 'da una porta chiusa si deve poter uscire').toBeTruthy()
  })
})

describe('Quando non si riesce a sapere com\'è messa la rubrica', () => {
  it('con un errore la schermata resta com\'era: chiede il codice', async () => {
    // Nel dubbio si chiede il codice. Dire «non ci sono codici» a chi ce
    // l'ha sarebbe peggio del difetto che stiamo correggendo.
    RISPOSTA = { data: null, error: { message: 'rete' } }
    apri()
    await waitFor(() => expect(testo()).toMatch(/codice personale a 4 cifre/))
    expect(testo()).not.toMatch(/non è ancora stato creato/)
  })

  it('e nemmeno una risposta malformata la fa sbagliare', async () => {
    RISPOSTA = { data: { ok: false, error: 'no_org' }, error: null }
    apri()
    await waitFor(() => expect(testo()).toMatch(/codice personale a 4 cifre/))
    expect(testo()).not.toMatch(/non è ancora stato creato/)
  })
})

describe('Il righello di questo file', () => {
  it('la domanda viene fatta davvero, e una sola volta', async () => {
    const { supabase } = await import('../../src/lib/supabase')
    supabase.rpc.mockClear()
    apri()
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('rubrica_codici_esiste'))
    expect(supabase.rpc.mock.calls.filter(c => c[0] === 'rubrica_codici_esiste')).toHaveLength(1)
  })

  it('e la schermata si disegna, non è una pagina vuota', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/Chi sei/))
    expect(document.querySelectorAll('button').length).toBeGreaterThan(9)
  })
})
