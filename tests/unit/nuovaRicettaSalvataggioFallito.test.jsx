// @vitest-environment happy-dom
//
// Nuova Ricetta: il salvataggio fallito veniva raccontato come riuscito.
//
// Dashboard.handleSalvaRicetta, quando ssave rifiutava, faceva `notify(errore)`
// seguito da `return`. Una funzione async che ritorna RISOLVE la sua promise:
// quindi `await onSave(...)` nella view proseguiva come se tutto fosse andato
// bene. Conseguenze, tutte verificate leggendo il codice:
//
//   - doSaveRicetta        svuotava il form (la ricetta scritta a mano sparisce
//                          dallo schermo) e diceva 'Ricetta "X" salvata'
//   - handleDeleteRicetta  diceva 'Ricetta "X" eliminata' con la ricetta ancora
//                          nel DB: ricompariva al ricaricamento
//   - handleConfermaRicetta buttava i dati estratti dalla foto: OCR da rifare
//   - SemilavoratiView     aveva GIA' il try/catch giusto (audit 2026-07-01) ma
//                          non scattava mai, perché l'errore non arrivava
//
// La correzione e' nel punto unico che li causava: handleSalvaRicetta rilancia.
// Questi test verificano il contratto dal lato della view, che e' quello che
// l'utente vede.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import React from 'react'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, ssaveBatch: async () => {},
  sload: async () => null, sloadAllSedi: async () => ({}),
}))

const NuovaRicettaView = (await import('../../src/views/NuovaRicettaView.jsx')).default

const ricettario = {
  ricette: {
    'CROSTATA MELE': {
      nome: 'CROSTATA MELE', tipo: 'fetta', unita: 8, prezzo: 3,
      ingredienti: [{ nome: 'farina', qty1stampo: 500 }],
    },
  },
  ingredienti_costi: { farina: { costoKg: 0.9, costoG: 0.0009 } },
}

function monta({ onSave }) {
  const notifiche = []
  const utils = render(
    <NuovaRicettaView
      ricettario={ricettario}
      onSave={onSave}
      notify={(msg, ok) => notifiche.push({ msg: String(msg), ok: ok !== false })}
      editingRicetta={null}
      onEditConsumed={() => {}}
      setView={() => {}}
      tipoAttivita="pasticceria"
    />
  )
  return { ...utils, notifiche }
}

afterEach(() => cleanup())

describe('Nuova Ricetta - salvataggio che fallisce', () => {
  it('NON dice "salvata" e NON svuota il form quando onSave rifiuta', async () => {
    const onSave = vi.fn(async () => { throw new Error('rete assente') })
    const { notifiche } = monta({ onSave })

    const nome = screen.getByLabelText('Nome ricetta')
    fireEvent.change(nome, { target: { value: 'TORTA PROVA' } })

    fireEvent.change(screen.getByLabelText(/nome ingrediente da aggiungere/i), { target: { value: 'burro' } })
    fireEvent.change(screen.getByLabelText(/grammi di ingrediente da aggiungere/i), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi ingrediente alla ricetta' }))

    const salva = screen.getByRole('button', { name: /^Salva/ })
    fireEvent.click(salva)

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    // Il nome scritto a mano deve essere ancora a schermo.
    await waitFor(() => expect(nome.value).toBe('TORTA PROVA'))
    // E nessun toast deve aver detto che era salvata.
    expect(notifiche.filter(n => /salvata/i.test(n.msg))).toHaveLength(0)
  })

  it('dice "salvata" e svuota il form quando onSave riesce', async () => {
    const onSave = vi.fn(async () => {})
    const { notifiche } = monta({ onSave })

    const nome = screen.getByLabelText('Nome ricetta')
    fireEvent.change(nome, { target: { value: 'TORTA PROVA' } })
    fireEvent.change(screen.getByLabelText(/nome ingrediente da aggiungere/i), { target: { value: 'burro' } })
    fireEvent.change(screen.getByLabelText(/grammi di ingrediente da aggiungere/i), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi ingrediente alla ricetta' }))
    fireEvent.click(screen.getByRole('button', { name: /^Salva/ }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    await waitFor(() => expect(notifiche.some(n => /TORTA PROVA.*salvata/i.test(n.msg))).toBe(true))
    expect(nome.value).toBe('')
  })
})

// Il punto che causava tutto. Un test sulla view non lo protegge: la view si
// comporta bene quando onSave rifiuta (lo verificano i test sopra), ma prima
// del 09/09/2026 onSave NON rifiutava mai, perché Dashboard inghiottiva
// l'errore con un `return`. E' quel `return` che va impedito per sempre.
describe('Dashboard.handleSalvaRicetta - contratto verso le view', () => {
  const dash = readFileSync(join(RADICE, 'src', 'Dashboard.jsx'), 'utf8')

  it('rilancia l\'errore invece di inghiottirlo, quando ssave del ricettario fallisce', () => {
    // Isoliamo il blocco catch che gestisce il fallimento di ssave(SK_RIC).
    const inizioFn = dash.indexOf('const handleSalvaRicetta = useCallback(')
    expect(inizioFn).toBeGreaterThan(-1)
    const i = dash.indexOf('await ssave(SK_RIC, nuovoRic);', inizioFn)
    expect(i).toBeGreaterThan(-1)
    const blocco = dash.slice(i, i + 3000)
    const fineCatch = blocco.indexOf('setRic(nuovoRic)')
    expect(fineCatch, 'il blocco catch deve stare dentro la finestra letta').toBeGreaterThan(0)
    const gestione = blocco.slice(0, fineCatch)

    expect(gestione).toContain('throw err')
    // La copia locale resta: è l'ultima rete di sicurezza per l'utente.
    expect(gestione).toContain('localStorage.setItem(_RIC_CACHE_KEY')
    // E l'errore è marcato come già spiegato: il toast ha un solo slot, e il
    // messaggio della view sostituiva questo, che è l'unico a dire dove sta la
    // copia locale e di non chiudere la pagina.
    expect(gestione).toContain('err.giaNotificato = true')
  })

  it('rilancia anche quando la sessione non ha organization_id', () => {
    const i = dash.indexOf("if (!effectiveOrgId) {")
    expect(i).toBeGreaterThan(-1)
    const blocco = dash.slice(i, i + 700)
    expect(blocco).toContain("new Error('Sessione non valida")
    expect(blocco).toContain('giaNotificato = true')
    expect(blocco).toMatch(/throw errSessione/)
  })

  it('non mostra un secondo toast di conferma: lo fa la view che sa cosa ha salvato', () => {
    // Dashboard notificava '"X" salvata' in aggiunta al toast della view:
    // due messaggi sovrapposti per lo stesso salvataggio.
    expect(dash).not.toContain('" salvata`)')
  })
})
