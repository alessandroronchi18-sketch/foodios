// @vitest-environment happy-dom
//
// Nuovo gusto: «Le ricette esistenti vengono saltate».
//
// Il titolare di Mara dei Boschi, il 18/09/2026, passando il mouse sul
// pulsante «Sovrascrivi da foto»: «non si capisce cosa vuol dire, cambia la
// frase in meglio».
//
// Aveva ragione due volte. «Saltate» è la parola del programma, non quella di
// chi lavora; e soprattutto non rispondeva alla domanda che uno si fa davanti
// a quel pulsante, che è una sola: che fine fa la ricetta che ho già scritto?
// Le due frasi — quella a interruttore acceso e quella a spento — dicevano
// anche due cose diverse fra loro («le foto sovrascrivono», «le ricette
// vengono saltate»), quindi non si potevano nemmeno confrontare.
//
// Nello stesso giro è venuto fuori un secondo difetto, quello che costa di
// più: il messaggio che compare quando una ricetta viene lasciata com'è
// mandava ad accendere «Sovrascrivi esistenti», un comando che non esiste. Il
// pulsante si chiama «Sovrascrivi da foto». Chi lo cercava non lo trovava.
//
// Questi test non guardano la bellezza della frase: guardano che le due
// versioni parlino della stessa cosa (una ricetta che esiste già) e dicano
// cosa le succede, e che il messaggio mandi a un comando che esiste davvero.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sorgenteView = () => readFileSync(resolve(process.cwd(), 'src/views/NuovaRicettaView.jsx'), 'utf-8')
// Solo le righe che parlano all'utente: i commenti qui dentro citano apposta
// la vecchia frase sbagliata, e non devono far scattare il controllo.
const messaggiNotify = () => sorgenteView().split('\n').filter(r => r.includes('notify(')).join('\n')

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, ssaveBatch: async () => {},
  sload: async () => null, sloadAllSedi: async () => ({}),
}))

const NuovaRicettaView = (await import('../../src/views/NuovaRicettaView.jsx')).default

const RICETTARIO = {
  ingredienti_costi: {},
  ricette: {
    CROSTATA: { nome: 'CROSTATA', tipo: 'fetta', unita: 8, prezzo: 10, ingredienti: [{ nome: 'burro', qty1stampo: 200 }] },
  },
}

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

const pillola = () => screen.getByRole('button', { name: /Sovrascrivi da foto/i })

afterEach(() => cleanup())

describe('Nuovo gusto - il suggerimento di «Sovrascrivi da foto»', () => {
  it('il difetto: non dice piu «vengono saltate»', () => {
    monta()
    expect(pillola().getAttribute('title')).not.toMatch(/saltat/i)
    fireEvent.click(pillola())
    expect(pillola().getAttribute('title')).not.toMatch(/saltat/i)
  })

  it('a interruttore spento dice che la ricetta che hai gia resta com\'e', () => {
    monta()
    const testo = pillola().getAttribute('title')
    expect(testo).toMatch(/^Spento:/)
    expect(testo).toMatch(/stesso nome/i)
    expect(testo).toMatch(/resta com'è/i)
  })

  it('a interruttore acceso dice che quella della foto prende il suo posto', () => {
    monta()
    fireEvent.click(pillola())
    const testo = pillola().getAttribute('title')
    expect(testo).toMatch(/^Acceso:/)
    expect(testo).toMatch(/stesso nome/i)
    expect(testo).toMatch(/prende il suo posto/i)
  })

  it('le due frasi partono dallo stesso caso, cosi si possono confrontare', () => {
    monta()
    const spento = pillola().getAttribute('title')
    fireEvent.click(pillola())
    const acceso = pillola().getAttribute('title')
    expect(spento).not.toBe(acceso)
    for (const t of [spento, acceso]) {
      expect(t).toMatch(/se hai già una ricetta con lo stesso nome/i)
    }
  })

  it('niente gergo: nessuna delle due parla di «sovrascrittura» o «batch»', () => {
    monta()
    const spento = pillola().getAttribute('title')
    fireEvent.click(pillola())
    const acceso = pillola().getAttribute('title')
    for (const t of [spento, acceso]) {
      expect(t).not.toMatch(/sovrascriv/i)
      expect(t).not.toMatch(/batch|record|import/i)
    }
  })

  it('aria-pressed segue l\'interruttore, cosi lo stato lo sa anche chi non vede il pallino', () => {
    monta()
    expect(pillola().getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(pillola())
    expect(pillola().getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(pillola())
    expect(pillola().getAttribute('aria-pressed')).toBe('false')
  })
})

describe('Nuovo gusto - il messaggio della ricetta lasciata com\'e', () => {
  // Il pezzo di codice è dentro `onBatchSave` di FotoOCR, che qui non si può
  // montare: si controlla il sorgente, che è l'unica copia di quella frase.
  it('manda ad accendere un comando che esiste davvero', () => {
    expect(messaggiNotify()).not.toMatch(/Sovrascrivi esistenti/)
    expect(messaggiNotify()).toMatch(/accendi «Sovrascrivi da foto»/)
  })

  it('dice cosa e successo alla ricetta, non che e stata «saltata»', () => {
    expect(messaggiNotify()).not.toMatch(/saltata/)
    expect(messaggiNotify()).toMatch(/l'ho lasciata com'è/)
  })
})
