// Prezzi diversi da una sede all'altra.
//
// Il ricettario è uno per tutta l'azienda, ma la fetta di Sacher in centro
// può costare 5 € e in periferia 3,50. Questo modulo tiene gli scostamenti
// per sede, con una regola importante: se la sede non dice niente, eredita
// il prezzo base. Così una sede nuova parte già col listino giusto.
//
// 147 righe al 32% di copertura fino al 15/09/2026: la parte pura — quella
// che decide quale prezzo si applica — non era verificata.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const salvataggi = []
vi.mock('../../src/lib/storage', () => ({
  sload: async (_k, _o, sedeId) => salvataggi.find(s => s.sedeId === sedeId)?.valore ?? null,
  ssave: async (_k, valore, _o, sedeId) => {
    const i = salvataggi.findIndex(s => s.sedeId === sedeId)
    if (i >= 0) salvataggi[i].valore = valore; else salvataggi.push({ sedeId, valore })
  },
}))

const {
  getRegSede, getPrezzoFormatoSede, applicaListinoAiFormati, haOverridePerRicetta,
  saveOverrideRicettaSede, saveOverrideFormatoSede, SK_LISTINO_SEDE,
} = await import('../../src/lib/listinoSede')

// `getR(nome, ricetta)` riceve LA ricetta, non il ricettario intero.
const SACHER = { nome: 'SACHER', tipo: 'fetta', unita: 8, prezzo: 30 }
const BIGNE  = { nome: 'BIGNÈ', tipo: 'pezzo', unita: 1, prezzo: 1.5 }

beforeEach(() => { salvataggi.length = 0 })

describe('quale prezzo si applica', () => {
  it('senza listino della sede vale quello base', () => {
    expect(getRegSede('SACHER', SACHER, null).prezzo).toBe(30)
    expect(getRegSede('SACHER', SACHER, {}).prezzo).toBe(30)
    expect(getRegSede('SACHER', SACHER, { ricette: {} }).prezzo).toBe(30)
  })

  it('con lo scostamento vale quello della sede', () => {
    const r = getRegSede('SACHER', SACHER, { ricette: { SACHER: { prezzo: 36 } } })
    expect(r.prezzo).toBe(36)
    expect(r.unita).toBe(8)      // l'unità resta quella base
    expect(r.tipo).toBe('fetta')
  })

  it('si può cambiare solo il numero di fette', () => {
    const r = getRegSede('SACHER', SACHER, { ricette: { SACHER: { unita: 10 } } })
    expect(r.unita).toBe(10)
    expect(r.prezzo).toBe(30)
  })

  it('il tipo non si cambia da una sede all\'altra', () => {
    // Il tipo dice com\'è fatta la ricetta, non quanto costa: se una sede
    // potesse cambiarlo, la stessa ricetta si calcolerebbe in due modi.
    const r = getRegSede('SACHER', SACHER, { ricette: { SACHER: { tipo: 'pezzo', prezzo: 5 } } })
    expect(r.tipo).toBe('fetta')
  })

  it('valori non validi non sovrascrivono il base', () => {
    for (const v of [null, undefined, NaN, Infinity, '36', {}, []]) {
      const r = getRegSede('SACHER', SACHER, { ricette: { SACHER: { prezzo: v } } })
      expect(r.prezzo, String(v)).toBe(30)
    }
  })

  it('zero è un prezzo valido (un omaggio si può mettere a zero)', () => {
    expect(getRegSede('SACHER', SACHER, { ricette: { SACHER: { prezzo: 0 } } }).prezzo).toBe(0)
  })

  it('una ricetta senza regola base ma con prezzo di sede non è più «senza regola»', () => {
    const senza = { nome: 'NUOVA', tipo: 'pezzo' }
    const base = getRegSede('NUOVA', senza, null)
    const conPrezzo = getRegSede('NUOVA', senza, { ricette: { NUOVA: { prezzo: 4 } } })
    if (base.senzaRegola) expect(conPrezzo.senzaRegola).toBeUndefined()
    expect(conPrezzo.prezzo).toBe(4)
  })

  it('lo scostamento di un\'altra ricetta non tocca questa', () => {
    const l = { ricette: { BIGNÈ: { prezzo: 2 } } }
    expect(getRegSede('SACHER', SACHER, l).prezzo).toBe(30)
    expect(getRegSede('BIGNÈ', BIGNE, l).prezzo).toBe(2)
  })
})

describe('il prezzo di un formato di vendita', () => {
  const vaschetta = { id: 'f1', nome: 'Vaschetta 500g', prezzoDefault: 12 }

  it('senza scostamento vale quello base', () => {
    expect(getPrezzoFormatoSede(vaschetta, null)).toBe(12)
    expect(getPrezzoFormatoSede(vaschetta, { formati: {} })).toBe(12)
  })

  it('con lo scostamento vale quello della sede', () => {
    expect(getPrezzoFormatoSede(vaschetta, { formati: { f1: { prezzoDefault: 14 } } })).toBe(14)
  })

  it('un formato senza prezzo vale zero, non «NaN»', () => {
    expect(getPrezzoFormatoSede({ id: 'x' }, null)).toBe(0)
    expect(getPrezzoFormatoSede({ id: 'x', prezzoDefault: 'dodici' }, null)).toBe(0)
    expect(getPrezzoFormatoSede(null, null)).toBe(0)
  })

  it('applicare il listino a tutti i formati non ne perde nessuno', () => {
    const formati = [vaschetta, { id: 'f2', nome: 'Coppetta', prezzoDefault: 3 }]
    const r = applicaListinoAiFormati(formati, { formati: { f1: { prezzoDefault: 14 } } })
    expect(r).toHaveLength(2)
    expect(r[0].prezzoDefault).toBe(14)
    expect(r[1].prezzoDefault).toBe(3)
    expect(r[0].nome).toBe('Vaschetta 500g')   // il resto della scheda resta
  })

  it('non modifica gli originali', () => {
    const formati = [{ ...vaschetta }]
    applicaListinoAiFormati(formati, { formati: { f1: { prezzoDefault: 99 } } })
    expect(formati[0].prezzoDefault).toBe(12)
  })

  it('regge un elenco vuoto o storto', () => {
    expect(applicaListinoAiFormati([], null)).toEqual([])
    expect(applicaListinoAiFormati(null, null)).toEqual([])
    expect(applicaListinoAiFormati('non un elenco', null)).toEqual([])
    expect(applicaListinoAiFormati(undefined, null)).toEqual([])
  })
})

describe('la spia «questa ricetta ha prezzi diversi fra le sedi»', () => {
  it('vera se almeno una sede ha uno scostamento', () => {
    const listini = { s1: { ricette: {} }, s2: { ricette: { SACHER: { prezzo: 36 } } } }
    expect(haOverridePerRicetta('SACHER', listini)).toBe(true)
    expect(haOverridePerRicetta('BIGNÈ', listini)).toBe(false)
  })

  it('falsa se non ci sono listini', () => {
    expect(haOverridePerRicetta('SACHER', null)).toBe(false)
    expect(haOverridePerRicetta('SACHER', {})).toBe(false)
    expect(haOverridePerRicetta('SACHER', { s1: null })).toBe(false)
  })
})

describe('salvare uno scostamento per una sede', () => {
  const args = { orgId: 'o1', sedeId: 's1', nome: 'SACHER', ricettaBase: SACHER }

  it('scrive il prezzo della sede', async () => {
    const l = await saveOverrideRicettaSede({ ...args, patch: { prezzo: 36 } })
    expect(l.ricette.SACHER).toEqual({ prezzo: 36 })
    expect(salvataggi[0].valore.ricette.SACHER.prezzo).toBe(36)
  })

  it('uno scostamento identico al base viene tolto, non salvato', () => {
    // Altrimenti restano «scostamenti fantasma» uguali al prezzo base, e la
    // spia «prezzi differenziati» si accende dove non c'è nessuna differenza.
    return (async () => {
      await saveOverrideRicettaSede({ ...args, patch: { prezzo: 36 } })
      const l = await saveOverrideRicettaSede({ ...args, patch: { prezzo: 30 } })
      expect(l.ricette.SACHER).toBeUndefined()
    })()
  })

  it('due modifiche di fila si sommano invece di sostituirsi', async () => {
    await saveOverrideRicettaSede({ ...args, patch: { prezzo: 36 } })
    const l = await saveOverrideRicettaSede({ ...args, patch: { unita: 10 } })
    expect(l.ricette.SACHER).toEqual({ prezzo: 36, unita: 10 })
  })

  it('un valore non valido non cancella quello che c\'è', async () => {
    await saveOverrideRicettaSede({ ...args, patch: { prezzo: 36 } })
    const l = await saveOverrideRicettaSede({ ...args, patch: { prezzo: 'trentasei' } })
    expect(l.ricette.SACHER).toEqual({ prezzo: 36 })
  })

  it('senza organizzazione, sede o nome non scrive niente', async () => {
    for (const rotto of [{ orgId: null }, { sedeId: null }, { nome: '' }]) {
      expect(await saveOverrideRicettaSede({ ...args, ...rotto, patch: { prezzo: 1 } })).toBe(null)
    }
    expect(salvataggi).toHaveLength(0)
  })

  it('gli scostamenti di una sede non toccano quelli di un\'altra', async () => {
    await saveOverrideRicettaSede({ ...args, sedeId: 's1', patch: { prezzo: 36 } })
    await saveOverrideRicettaSede({ ...args, sedeId: 's2', patch: { prezzo: 25 } })
    expect(salvataggi.find(s => s.sedeId === 's1').valore.ricette.SACHER.prezzo).toBe(36)
    expect(salvataggi.find(s => s.sedeId === 's2').valore.ricette.SACHER.prezzo).toBe(25)
  })

  it('i formati già salvati non si perdono salvando una ricetta', async () => {
    await saveOverrideFormatoSede({ orgId: 'o1', sedeId: 's1', formatoId: 'f1', patch: { prezzoDefault: 14 }, formatoBase: { prezzoDefault: 12 } })
    const l = await saveOverrideRicettaSede({ ...args, patch: { prezzo: 36 } })
    expect(l.formati.f1.prezzoDefault).toBe(14)
    expect(l.ricette.SACHER.prezzo).toBe(36)
  })
})

describe('salvare il prezzo di un formato per una sede', () => {
  const args = { orgId: 'o1', sedeId: 's1', formatoId: 'f1', formatoBase: { prezzoDefault: 12 } }

  it('scrive il prezzo della sede', async () => {
    const l = await saveOverrideFormatoSede({ ...args, patch: { prezzoDefault: 14 } })
    expect(l.formati.f1).toEqual({ prezzoDefault: 14 })
  })

  it('tornare al prezzo base toglie lo scostamento', async () => {
    await saveOverrideFormatoSede({ ...args, patch: { prezzoDefault: 14 } })
    const l = await saveOverrideFormatoSede({ ...args, patch: { prezzoDefault: 12 } })
    expect(l.formati.f1).toBeUndefined()
  })

  it('senza organizzazione, sede o formato non scrive niente', async () => {
    for (const rotto of [{ orgId: null }, { sedeId: null }, { formatoId: '' }]) {
      expect(await saveOverrideFormatoSede({ ...args, ...rotto, patch: { prezzoDefault: 1 } })).toBe(null)
    }
  })

  it('le ricette già salvate non si perdono salvando un formato', async () => {
    await saveOverrideRicettaSede({ orgId: 'o1', sedeId: 's1', nome: 'SACHER', patch: { prezzo: 36 }, ricettaBase: SACHER })
    const l = await saveOverrideFormatoSede({ ...args, patch: { prezzoDefault: 14 } })
    expect(l.ricette.SACHER.prezzo).toBe(36)
  })
})

describe('la chiave di salvataggio', () => {
  it('è per-sede, e non cambia di nascosto', () => {
    // Cambiarla farebbe sparire tutti i listini già salvati dai clienti.
    expect(SK_LISTINO_SEDE).toBe('pasticceria-listino-sede-v1')
  })
})
