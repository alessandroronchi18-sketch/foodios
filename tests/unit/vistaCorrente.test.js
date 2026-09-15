// Dove si trova l'utente, letto da fuori dal Dashboard.
//
// Serve ai due bottoni flottanti (assistente e feedback), che stanno in
// App.jsx e quindi non possono leggere lo stato del Dashboard. Se questo
// contenitore smette di funzionare le segnalazioni tornano ad arrivare senza
// dire in quale schermata era l'utente, che è il campo più utile di tutti.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  impostaVistaCorrente, leggiVistaCorrente, iscrivitiVistaCorrente,
} from '../../src/lib/vistaCorrente'

beforeEach(() => impostaVistaCorrente(null))

describe('vistaCorrente', () => {
  it('parte vuota e restituisce quello che le si scrive', () => {
    expect(leggiVistaCorrente()).toBe(null)
    impostaVistaCorrente('produzione')
    expect(leggiVistaCorrente()).toBe('produzione')
  })

  it('avvisa gli iscritti a ogni cambio', () => {
    const viste = []
    iscrivitiVistaCorrente(v => viste.push(v))
    impostaVistaCorrente('cassa')
    impostaVistaCorrente('magazzino')
    expect(viste).toEqual(['cassa', 'magazzino'])
  })

  it('non avvisa se la vista non è cambiata', () => {
    const f = vi.fn()
    iscrivitiVistaCorrente(f)
    impostaVistaCorrente('cassa')
    impostaVistaCorrente('cassa')
    impostaVistaCorrente('cassa')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('disiscriversi smette davvero di ricevere', () => {
    const f = vi.fn()
    const stop = iscrivitiVistaCorrente(f)
    impostaVistaCorrente('a')
    stop()
    impostaVistaCorrente('b')
    expect(f).toHaveBeenCalledTimes(1)
    expect(f).toHaveBeenCalledWith('a')
  })

  it('più iscritti ricevono tutti', () => {
    const a = vi.fn(), b = vi.fn()
    iscrivitiVistaCorrente(a); iscrivitiVistaCorrente(b)
    impostaVistaCorrente('ricettario')
    expect(a).toHaveBeenCalledWith('ricettario')
    expect(b).toHaveBeenCalledWith('ricettario')
  })

  it('un iscritto che va in errore non ferma gli altri', () => {
    // Il bottone dell'assistente e quello del feedback sono due iscritti
    // distinti: se uno dei due si rompe, l'altro deve continuare a sapere
    // dov'è l'utente.
    const rotto = vi.fn(() => { throw new Error('boom') })
    const sano = vi.fn()
    iscrivitiVistaCorrente(rotto)
    iscrivitiVistaCorrente(sano)
    expect(() => impostaVistaCorrente('chiusura')).not.toThrow()
    expect(sano).toHaveBeenCalledWith('chiusura')
  })

  it('tornare a null è un cambio come gli altri (uscita dal Dashboard)', () => {
    const f = vi.fn()
    impostaVistaCorrente('home')
    iscrivitiVistaCorrente(f)
    impostaVistaCorrente(null)
    expect(f).toHaveBeenCalledWith(null)
    expect(leggiVistaCorrente()).toBe(null)
  })

  it('lo stesso iscritto registrato due volte viene chiamato una volta sola', () => {
    const f = vi.fn()
    iscrivitiVistaCorrente(f); iscrivitiVistaCorrente(f)
    impostaVistaCorrente('pl')
    expect(f).toHaveBeenCalledTimes(1)
  })
})
