// @vitest-environment happy-dom
//
// Nuovo gusto: gli allergeni si presentavano come un elenco a norma, e non lo
// sono.
//
// Sotto il titolo «Allergeni presenti» c'era scritto: «Calcolati
// automaticamente dagli ingredienti (Reg. UE 1169/2011). Aggiungi manualmente
// quelli mancanti se necessario». Accanto, un distintivo azzurro con su
// «Auto».
//
// Decisione del titolare di Mara dei Boschi, 18/09/2026: «non dobbiamo avere
// nessuna ripercussione legale, dobbiamo lasciare al cliente l'ultima parola,
// noi al massimo diamo un consiglio».
//
// Il difetto non è di codice, è di promessa. Il programma legge i nomi degli
// ingredienti scritti nella ricetta; le tracce e le contaminazioni stanno
// sulle etichette dei fornitori, che il programma non vede e non vedrà mai.
// Citare il regolamento accanto al nostro calcolo faceva sembrare che
// l'elenco uscisse a norma da solo, e sposta su di noi una responsabilità che
// non possiamo assumerci — e, soprattutto, toglie a chi lavora la voglia di
// controllare.
//
// Questi test guardano che in questa pagina il programma proponga e il cliente
// confermi: nessuna citazione del regolamento come se il calcolo bastasse, e
// nessuna parola che faccia sembrare l'elenco già chiuso.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, ssaveBatch: async () => {},
  sload: async () => null, sloadAllSedi: async () => ({}),
}))

const NuovaRicettaView = (await import('../../src/views/NuovaRicettaView.jsx')).default

const RICETTARIO = { ricette: {}, ingredienti_costi: {} }

function monta() {
  return render(
    <NuovaRicettaView
      ricettario={RICETTARIO}
      onSave={async () => {}}
      notify={() => {}}
      editingRicetta={null}
      onEditConsumed={() => {}}
      tipoAttivita="pasticceria"
    />
  )
}

function aggiungi(nome, grammi) {
  fireEvent.change(screen.getByLabelText(/nome ingrediente da aggiungere/i), { target: { value: nome } })
  fireEvent.change(screen.getByLabelText(/grammi di ingrediente da aggiungere/i), { target: { value: String(grammi) } })
  fireEvent.click(screen.getByRole('button', { name: 'Aggiungi ingrediente alla ricetta' }))
}

afterEach(() => cleanup())

describe('Nuovo gusto - gli allergeni sono una proposta, non una sentenza', () => {
  it('il difetto: non cita piu il regolamento come se il calcolo bastasse', () => {
    monta()
    expect(document.body.textContent).not.toMatch(/1169\/2011/)
    expect(document.body.textContent).not.toMatch(/Calcolati automaticamente/i)
  })

  it('dice che e un consiglio ricavato dagli ingredienti scritti', () => {
    monta()
    const testo = document.body.textContent
    expect(testo).toMatch(/è un consiglio/i)
    expect(testo).toMatch(/dagli ingredienti che hai scritto/i)
  })

  it('dice che l\'elenco che vale e quello che conferma lui', () => {
    monta()
    expect(document.body.textContent).toMatch(/l'elenco che confermi tu/i)
  })

  it('dice perche: i fornitori non li vediamo', () => {
    monta()
    const testo = document.body.textContent
    expect(testo).toMatch(/fornitori/i)
    expect(testo).toMatch(/che noi non vediamo/i)
  })

  it('il distintivo dice «Proposta», non «Auto»', () => {
    monta()
    expect(screen.getByText('Proposta')).toBeTruthy()
    expect(screen.queryByText('Auto')).toBeNull()
  })

  it('anche a mani vuote non dice «nessun allergene» come se fosse un verdetto', () => {
    monta()
    const testo = document.body.textContent
    expect(testo).toMatch(/Dagli ingredienti che hai scritto non risulta nessun allergene/i)
    expect(testo).toMatch(/Controlla le etichette dei tuoi fornitori/i)
  })

  it('un allergene trovato resta marcato come proposto, da confermare', () => {
    monta()
    aggiungi('Burro', 250)
    // «Latte» compare anche fra le caselle da spuntare: qui interessa la
    // pastiglia proposta, cioe' quella che ha un suggerimento addosso.
    const titolo = screen.getAllByText('Latte')
      .map(n => n.closest('[title]'))
      .find(n => n && /Proposto/i.test(n.getAttribute('title')))
    expect(titolo).toBeTruthy()
    expect(titolo.getAttribute('title')).toMatch(/Proposto dagli ingredienti che hai scritto/i)
    expect(titolo.getAttribute('title')).toMatch(/confermalo tu/i)
  })

  it('l\'ultima parola resta sua: gli allergeni si possono aggiungere a mano', () => {
    monta()
    aggiungi('Burro', 250)
    // Il comando per mettere mano all'elenco deve esserci sempre, altrimenti
    // «l'ultima parola al cliente» è una frase e basta.
    expect(screen.getByRole('button', { name: /Modifica manualmente/i })).toBeTruthy()
  })
})
